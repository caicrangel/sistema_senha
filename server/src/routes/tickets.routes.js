import { Router } from 'express';
import { pool, query } from '../db.js';
import { requireAuth, requirePerm } from '../auth.js';
import { summary as presenceSummary, isSpecialtyOnline } from '../presence.js';

// SELECT padrão com todos os nomes e o destino da chamada (guichê ou consultório)
const TICKET_SELECT = `
  SELECT t.*, st.name AS service_name, st.color, st.prefix,
         c.name AS counter_name, u.name AS attendant_name,
         r.name AS room_name, d.name AS doctor_name, sp.name AS specialty_name
  FROM tickets t
  JOIN service_types st ON st.id = t.service_type_id
  LEFT JOIN counters c ON c.id = t.counter_id
  LEFT JOIN users u ON u.id = t.attendant_id
  LEFT JOIN rooms r ON r.id = t.room_id
  LEFT JOIN users d ON d.id = t.doctor_id
  LEFT JOIN specialties sp ON sp.id = t.specialty_id`;

// Destino textual para o painel/voz: recepção → guichê; médico → consultório (+ médico)
function withDestination(t) {
  if (!t) return t;
  const destination =
    t.stage === 'medical'
      ? [t.room_name || 'Consultório', t.doctor_name].filter(Boolean).join(' · ')
      : t.counter_name || 'Guichê';
  return { ...t, destination };
}

async function ticketById(id) {
  const { rows } = await query(`${TICKET_SELECT} WHERE t.id = $1`, [id]);
  return withDestination(rows[0]);
}

async function panelState() {
  const { rows: cfg } = await query(
    `SELECT key, value FROM settings WHERE key IN ('panel_last_calls', 'flow_medical')`
  );
  const s = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
  const lastN = Math.max(1, Math.min(10, parseInt(s.panel_last_calls, 10) || 5));
  const medical = s.flow_medical === '1';

  // Momento efetivo da chamada: médico usa med_called_at, recepção usa called_at
  const callAt = `COALESCE(t.med_called_at, t.called_at)`;

  const { rows: cur } = await query(
    `${TICKET_SELECT}
     WHERE t.status IN ('called', 'in_service') AND ${callAt}::date = CURRENT_DATE
     ORDER BY ${callAt} DESC LIMIT 1`
  );
  const current = withDestination(cur[0]);

  const { rows: lastCalls } = await query(
    `${TICKET_SELECT}
     WHERE ${callAt} IS NOT NULL AND ${callAt}::date = CURRENT_DATE
       AND ($1::int IS NULL OR t.id <> $1)
     ORDER BY ${callAt} DESC LIMIT $2`,
    [current?.id ?? null, lastN]
  );

  // Contagem de espera por tipo (fila da recepção)
  const { rows: waiting } = await query(
    `SELECT st.id, st.name, st.color, st.prefix, COUNT(t.id)::int AS waiting
     FROM service_types st
     LEFT JOIN tickets t ON t.service_type_id = st.id
       AND t.status = 'waiting' AND t.stage = 'reception' AND t.created_at::date = CURRENT_DATE
     WHERE st.active = TRUE
     GROUP BY st.id, st.name, st.color, st.prefix
     ORDER BY st.priority DESC, st.id`
  );

  // Quando o fluxo médico está ativo, informa também a fila de espera do médico
  let waitingMedical = 0;
  if (medical) {
    const { rows: wm } = await query(
      `SELECT COUNT(*)::int AS n FROM tickets
       WHERE status = 'waiting' AND stage = 'medical' AND forwarded_at::date = CURRENT_DATE`
    );
    waitingMedical = wm[0].n;
  }

  return { current: current || null, lastCalls, waiting, waitingMedical, medical };
}

export default function ticketRoutes(io) {
  const router = Router();

  const broadcastQueue = async () => {
    io.emit('queue:update', await panelState());
  };

  const flowMedicalOn = async () => {
    const { rows } = await query(`SELECT value FROM settings WHERE key = 'flow_medical'`);
    return rows[0]?.value === '1';
  };

  // ---------------------------------------------------------------- Totem (público)
  router.post('/', async (req, res, next) => {
    try {
      const { service_type_id, customer_name } = req.body || {};
      const { rows: st } = await query(
        'SELECT * FROM service_types WHERE id = $1 AND active = TRUE',
        [service_type_id]
      );
      if (!st[0]) return res.status(400).json({ error: 'Tipo de atendimento inválido' });

      const { rows } = await query(
        `INSERT INTO tickets (service_type_id, customer_name, number, code)
         SELECT $1, $2, n, $3 || LPAD(n::text, 3, '0')
         FROM (
           SELECT COALESCE(MAX(number), 0) + 1 AS n
           FROM tickets
           WHERE service_type_id = $1 AND created_at::date = CURRENT_DATE
         ) sub
         RETURNING *`,
        [st[0].id, (customer_name || '').trim() || null, st[0].prefix]
      );
      const ticket = { ...rows[0], service_name: st[0].name, color: st[0].color };
      io.emit('ticket:created', ticket);
      await broadcastQueue();
      res.status(201).json(ticket);
    } catch (e) {
      next(e);
    }
  });

  router.get('/panel', async (_req, res, next) => {
    try {
      res.json(await panelState());
    } catch (e) {
      next(e);
    }
  });

  // ---------------------------------------------------------------- Recepção
  // Fila de espera da recepção
  router.get('/queue', requireAuth, async (_req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT t.*, st.name AS service_name, st.color, st.priority
         FROM tickets t
         JOIN service_types st ON st.id = t.service_type_id
         WHERE t.status = 'waiting' AND t.stage = 'reception' AND t.created_at::date = CURRENT_DATE
         ORDER BY st.priority DESC, t.created_at ASC`
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  // Senha atual do atendente logado (recepção)
  router.get('/mine', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `${TICKET_SELECT}
         WHERE t.attendant_id = $1 AND t.stage = 'reception' AND t.status IN ('called', 'in_service')
         ORDER BY t.called_at DESC LIMIT 1`,
        [req.user.id]
      );
      res.json(withDestination(rows[0]) || null);
    } catch (e) {
      next(e);
    }
  });

  // Chamar próxima senha da recepção (prioridade, depois chegada)
  router.post('/call-next', requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { counter_id } = req.body || {};
      if (!counter_id) return res.status(400).json({ error: 'Selecione um guichê' });
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT t.id FROM tickets t
         JOIN service_types st ON st.id = t.service_type_id
         WHERE t.status = 'waiting' AND t.stage = 'reception' AND t.created_at::date = CURRENT_DATE
         ORDER BY st.priority DESC, t.created_at ASC
         LIMIT 1 FOR UPDATE OF t SKIP LOCKED`
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Não há senhas em espera' });
      }
      await client.query(
        `UPDATE tickets SET status = 'called', called_at = now(), counter_id = $1, attendant_id = $2
         WHERE id = $3`,
        [counter_id, req.user.id, rows[0].id]
      );
      await client.query('COMMIT');
      const full = await ticketById(rows[0].id);
      io.emit('ticket:called', full);
      await broadcastQueue();
      res.json(full);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      next(e);
    } finally {
      client.release();
    }
  });

  // Adiantar/chamar uma senha específica da recepção
  router.post('/:id/call', requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { counter_id } = req.body || {};
      if (!counter_id) return res.status(400).json({ error: 'Selecione um guichê' });
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id FROM tickets WHERE id = $1 AND status = 'waiting' AND stage = 'reception'
         FOR UPDATE SKIP LOCKED`,
        [req.params.id]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Esta senha já foi chamada por outro guichê' });
      }
      await client.query(
        `UPDATE tickets SET status = 'called', called_at = now(), counter_id = $1, attendant_id = $2
         WHERE id = $3`,
        [counter_id, req.user.id, rows[0].id]
      );
      await client.query('COMMIT');
      const full = await ticketById(rows[0].id);
      io.emit('ticket:called', full);
      await broadcastQueue();
      res.json(full);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      next(e);
    } finally {
      client.release();
    }
  });

  // Rechamar (recepção)
  router.post('/:id/recall', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET recall_count = recall_count + 1, called_at = now()
         WHERE id = $1 AND stage = 'reception' AND status IN ('called', 'in_service') RETURNING id`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Senha não encontrada' });
      const full = await ticketById(rows[0].id);
      io.emit('ticket:called', full);
      await broadcastQueue();
      res.json(full);
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/start', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET status = 'in_service', started_at = now()
         WHERE id = $1 AND stage = 'reception' AND status = 'called' RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Transição inválida para esta senha' });
      await broadcastQueue();
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  // Finalizar na recepção (usado quando o fluxo médico está desligado)
  router.post('/:id/finish', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET status = 'done', finished_at = now()
         WHERE id = $1 AND stage = 'reception' AND status IN ('called', 'in_service') RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Transição inválida para esta senha' });
      await broadcastQueue();
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/no-show', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET status = 'no_show', finished_at = now()
         WHERE id = $1 AND stage = 'reception' AND status = 'called' RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Transição inválida para esta senha' });
      await broadcastQueue();
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  // Médicos online (para a recepção saber se há quem atenda a especialidade)
  router.get('/online-doctors', requireAuth, (_req, res) => {
    res.json(presenceSummary());
  });

  // Encaminhar para o médico: recepção → fila do médico (mantém histórico da recepção)
  router.post('/:id/forward', requireAuth, async (req, res, next) => {
    try {
      if (!(await flowMedicalOn())) {
        return res.status(400).json({ error: 'O fluxo médico não está habilitado' });
      }
      const { specialty_id, force } = req.body || {};
      if (!specialty_id) return res.status(400).json({ error: 'Selecione a especialidade' });
      const { rows: sp } = await query(
        'SELECT id, name FROM specialties WHERE id = $1 AND active = TRUE',
        [specialty_id]
      );
      if (!sp[0]) return res.status(400).json({ error: 'Especialidade inválida' });

      // Bloqueia por padrão quando não há médico online — evita senha presa
      if (!force && !isSpecialtyOnline(Number(specialty_id))) {
        return res.status(409).json({
          error: `Nenhum médico de ${sp[0].name} está online no momento`,
          no_doctor: true,
        });
      }

      const { rows } = await query(
        `UPDATE tickets SET stage = 'medical', status = 'waiting',
           forwarded_at = now(), specialty_id = $1
         WHERE id = $2 AND stage = 'reception' AND status IN ('called', 'in_service') RETURNING id`,
        [specialty_id, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Transição inválida para esta senha' });
      const full = await ticketById(rows[0].id);
      io.emit('ticket:forwarded', full);
      await broadcastQueue();
      res.json(full);
    } catch (e) {
      next(e);
    }
  });

  // Devolver à fila (recepção): volta a aguardar mantendo a chegada original
  router.post('/:id/return', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET
           status = 'waiting', counter_id = NULL, attendant_id = NULL,
           called_at = NULL, started_at = NULL, return_count = return_count + 1
         WHERE id = $1 AND stage = 'reception' AND status IN ('called', 'in_service')
         RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Esta senha não está em chamada/atendimento' });
      await broadcastQueue();
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  // ---------------------------------------------------------------- Médico
  const doctorSpecialtyFilter = (user) =>
    user.specialty_id
      ? { clause: `AND (t.specialty_id = $SPEC OR t.specialty_id IS NULL)`, spec: user.specialty_id }
      : { clause: '', spec: null };

  // Fila de espera do médico (por especialidade, ordem de chegada à fila)
  router.get('/med-queue', requireAuth, requirePerm('medico'), async (req, res, next) => {
    try {
      const f = doctorSpecialtyFilter(req.user);
      const params = [];
      let clause = f.clause;
      if (f.spec) { params.push(f.spec); clause = clause.replace('$SPEC', `$${params.length}`); }
      const { rows } = await query(
        `${TICKET_SELECT}
         WHERE t.status = 'waiting' AND t.stage = 'medical' AND t.forwarded_at::date = CURRENT_DATE ${clause}
         ORDER BY t.forwarded_at ASC`,
        params
      );
      res.json(rows.map(withDestination));
    } catch (e) {
      next(e);
    }
  });

  // Senha atual do médico logado
  router.get('/med-mine', requireAuth, requirePerm('medico'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `${TICKET_SELECT}
         WHERE t.doctor_id = $1 AND t.stage = 'medical' AND t.status IN ('called', 'in_service')
         ORDER BY t.med_called_at DESC LIMIT 1`,
        [req.user.id]
      );
      res.json(withDestination(rows[0]) || null);
    } catch (e) {
      next(e);
    }
  });

  // Especialidades e consultórios ativos (para o médico escolher)
  router.get('/med-rooms', requireAuth, requirePerm('medico'), async (_req, res, next) => {
    try {
      const { rows } = await query('SELECT id, name FROM rooms WHERE active = TRUE ORDER BY id');
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  // Chamar próximo paciente (médico) — o mais antigo na fila do médico
  router.post('/med-call-next', requireAuth, requirePerm('medico'), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { room_id } = req.body || {};
      if (!room_id) return res.status(400).json({ error: 'Selecione o consultório' });
      const f = doctorSpecialtyFilter(req.user);
      const params = [];
      let clause = f.clause;
      if (f.spec) { params.push(f.spec); clause = clause.replace('$SPEC', `$${params.length}`); }
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT t.id FROM tickets t
         WHERE t.status = 'waiting' AND t.stage = 'medical' AND t.forwarded_at::date = CURRENT_DATE ${clause}
         ORDER BY t.forwarded_at ASC LIMIT 1 FOR UPDATE OF t SKIP LOCKED`,
        params
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Não há pacientes aguardando' });
      }
      await client.query(
        `UPDATE tickets SET status = 'called', med_called_at = now(), room_id = $1, doctor_id = $2
         WHERE id = $3`,
        [room_id, req.user.id, rows[0].id]
      );
      await client.query('COMMIT');
      const full = await ticketById(rows[0].id);
      io.emit('ticket:called', full);
      await broadcastQueue();
      res.json(full);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      next(e);
    } finally {
      client.release();
    }
  });

  // Chamar paciente específico (médico)
  router.post('/:id/med-call', requireAuth, requirePerm('medico'), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { room_id } = req.body || {};
      if (!room_id) return res.status(400).json({ error: 'Selecione o consultório' });
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id FROM tickets WHERE id = $1 AND status = 'waiting' AND stage = 'medical'
         FOR UPDATE SKIP LOCKED`,
        [req.params.id]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Este paciente já foi chamado' });
      }
      await client.query(
        `UPDATE tickets SET status = 'called', med_called_at = now(), room_id = $1, doctor_id = $2
         WHERE id = $3`,
        [room_id, req.user.id, rows[0].id]
      );
      await client.query('COMMIT');
      const full = await ticketById(rows[0].id);
      io.emit('ticket:called', full);
      await broadcastQueue();
      res.json(full);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      next(e);
    } finally {
      client.release();
    }
  });

  // Rechamar (médico)
  router.post('/:id/med-recall', requireAuth, requirePerm('medico'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET recall_count = recall_count + 1, med_called_at = now()
         WHERE id = $1 AND stage = 'medical' AND status IN ('called', 'in_service') RETURNING id`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Senha não encontrada' });
      const full = await ticketById(rows[0].id);
      io.emit('ticket:called', full);
      await broadcastQueue();
      res.json(full);
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/med-start', requireAuth, requirePerm('medico'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET status = 'in_service', med_started_at = now()
         WHERE id = $1 AND stage = 'medical' AND status = 'called' RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Transição inválida' });
      await broadcastQueue();
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/med-finish', requireAuth, requirePerm('medico'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET status = 'done', finished_at = now()
         WHERE id = $1 AND stage = 'medical' AND status IN ('called', 'in_service') RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Transição inválida' });
      await broadcastQueue();
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/med-no-show', requireAuth, requirePerm('medico'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET status = 'no_show', finished_at = now()
         WHERE id = $1 AND stage = 'medical' AND status = 'called' RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Transição inválida' });
      await broadcastQueue();
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  // Devolver à fila do médico
  router.post('/:id/med-return', requireAuth, requirePerm('medico'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET
           status = 'waiting', room_id = NULL, doctor_id = NULL,
           med_called_at = NULL, med_started_at = NULL, return_count = return_count + 1
         WHERE id = $1 AND stage = 'medical' AND status IN ('called', 'in_service') RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Este paciente não está em chamada/atendimento' });
      await broadcastQueue();
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  // ---------------------------------------------------------------- Gestão
  router.get('/today', requireAuth, async (_req, res, next) => {
    try {
      const { rows } = await query(
        `${TICKET_SELECT.replace('SELECT t.*,', `SELECT t.*,
           EXTRACT(EPOCH FROM (t.called_at - t.created_at))::int AS wait_sec,
           EXTRACT(EPOCH FROM (COALESCE(t.forwarded_at, t.finished_at) - t.called_at))::int AS service_sec,
           EXTRACT(EPOCH FROM (t.med_called_at - t.forwarded_at))::int AS med_wait_sec,
           EXTRACT(EPOCH FROM (t.finished_at - t.med_called_at))::int AS med_service_sec,
           EXTRACT(EPOCH FROM (t.finished_at - t.created_at))::int AS total_sec,`)}
         WHERE t.created_at::date = CURRENT_DATE
         ORDER BY t.created_at DESC`
      );
      res.json(rows.map(withDestination));
    } catch (e) {
      next(e);
    }
  });

  // Cancelar senha em espera (gestão) — recepção ou médico
  router.post('/:id/cancel', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET status = 'cancelled', finished_at = now()
         WHERE id = $1 AND status = 'waiting' RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Transição inválida para esta senha' });
      await broadcastQueue();
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
