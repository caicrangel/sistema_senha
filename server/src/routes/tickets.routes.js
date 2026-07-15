import { Router } from 'express';
import { pool, query } from '../db.js';
import { requireAuth } from '../auth.js';

async function panelState() {
  const { rows: current } = await query(
    `SELECT t.*, st.name AS service_name, st.color, st.prefix, c.name AS counter_name
     FROM tickets t
     JOIN service_types st ON st.id = t.service_type_id
     LEFT JOIN counters c ON c.id = t.counter_id
     WHERE t.status IN ('called', 'in_service') AND t.called_at::date = CURRENT_DATE
     ORDER BY t.called_at DESC
     LIMIT 6`
  );
  const { rows: waiting } = await query(
    `SELECT st.id, st.name, st.color, st.prefix, COUNT(t.id)::int AS waiting
     FROM service_types st
     LEFT JOIN tickets t ON t.service_type_id = st.id
       AND t.status = 'waiting' AND t.created_at::date = CURRENT_DATE
     WHERE st.active = TRUE
     GROUP BY st.id, st.name, st.color, st.prefix
     ORDER BY st.priority DESC, st.id`
  );
  return { current: current[0] || null, lastCalls: current.slice(1), waiting };
}

export default function ticketRoutes(io) {
  const router = Router();

  const broadcastQueue = async () => {
    io.emit('queue:update', await panelState());
  };

  // Totem (público): emitir senha
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

  // Estado do painel/monitor (público)
  router.get('/panel', async (_req, res, next) => {
    try {
      res.json(await panelState());
    } catch (e) {
      next(e);
    }
  });

  // Fila de espera (atendente)
  router.get('/queue', requireAuth, async (_req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT t.*, st.name AS service_name, st.color, st.priority
         FROM tickets t
         JOIN service_types st ON st.id = t.service_type_id
         WHERE t.status = 'waiting' AND t.created_at::date = CURRENT_DATE
         ORDER BY st.priority DESC, t.created_at ASC`
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  // Senha em atendimento pelo atendente logado
  router.get('/mine', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT t.*, st.name AS service_name, st.color, c.name AS counter_name
         FROM tickets t
         JOIN service_types st ON st.id = t.service_type_id
         LEFT JOIN counters c ON c.id = t.counter_id
         WHERE t.attendant_id = $1 AND t.status IN ('called', 'in_service')
         ORDER BY t.called_at DESC LIMIT 1`,
        [req.user.id]
      );
      res.json(rows[0] || null);
    } catch (e) {
      next(e);
    }
  });

  // Chamar próxima senha (prioridade maior primeiro, depois ordem de chegada)
  router.post('/call-next', requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { counter_id } = req.body || {};
      if (!counter_id) return res.status(400).json({ error: 'Selecione um guichê' });
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT t.id FROM tickets t
         JOIN service_types st ON st.id = t.service_type_id
         WHERE t.status = 'waiting' AND t.created_at::date = CURRENT_DATE
         ORDER BY st.priority DESC, t.created_at ASC
         LIMIT 1
         FOR UPDATE OF t SKIP LOCKED`
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Não há senhas em espera' });
      }
      const { rows: updated } = await client.query(
        `UPDATE tickets
         SET status = 'called', called_at = now(), counter_id = $1, attendant_id = $2
         WHERE id = $3 RETURNING *`,
        [counter_id, req.user.id, rows[0].id]
      );
      await client.query('COMMIT');
      const { rows: full } = await query(
        `SELECT t.*, st.name AS service_name, st.color, c.name AS counter_name
         FROM tickets t
         JOIN service_types st ON st.id = t.service_type_id
         LEFT JOIN counters c ON c.id = t.counter_id
         WHERE t.id = $1`,
        [updated[0].id]
      );
      io.emit('ticket:called', full[0]);
      await broadcastQueue();
      res.json(full[0]);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      next(e);
    } finally {
      client.release();
    }
  });

  // Adiantar/chamar uma senha específica da fila (fura a ordem quando necessário)
  router.post('/:id/call', requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { counter_id } = req.body || {};
      if (!counter_id) return res.status(400).json({ error: 'Selecione um guichê' });
      await client.query('BEGIN');
      // Bloqueia a linha para evitar que dois atendentes chamem a mesma senha
      const { rows } = await client.query(
        `SELECT id FROM tickets WHERE id = $1 AND status = 'waiting' FOR UPDATE SKIP LOCKED`,
        [req.params.id]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Esta senha já foi chamada por outro guichê' });
      }
      const { rows: updated } = await client.query(
        `UPDATE tickets
         SET status = 'called', called_at = now(), counter_id = $1, attendant_id = $2
         WHERE id = $3 RETURNING *`,
        [counter_id, req.user.id, rows[0].id]
      );
      await client.query('COMMIT');
      const { rows: full } = await query(
        `SELECT t.*, st.name AS service_name, st.color, c.name AS counter_name
         FROM tickets t
         JOIN service_types st ON st.id = t.service_type_id
         LEFT JOIN counters c ON c.id = t.counter_id
         WHERE t.id = $1`,
        [updated[0].id]
      );
      io.emit('ticket:called', full[0]);
      await broadcastQueue();
      res.json(full[0]);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      next(e);
    } finally {
      client.release();
    }
  });

  // Rechamar (repete o anúncio no painel)
  router.post('/:id/recall', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET recall_count = recall_count + 1, called_at = now()
         WHERE id = $1 AND status IN ('called', 'in_service') RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Senha não encontrada' });
      const { rows: full } = await query(
        `SELECT t.*, st.name AS service_name, st.color, c.name AS counter_name
         FROM tickets t
         JOIN service_types st ON st.id = t.service_type_id
         LEFT JOIN counters c ON c.id = t.counter_id
         WHERE t.id = $1`,
        [rows[0].id]
      );
      io.emit('ticket:called', full[0]);
      await broadcastQueue();
      res.json(full[0]);
    } catch (e) {
      next(e);
    }
  });

  const transition = (from, to, timestampCol) => async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE tickets SET status = $1${timestampCol ? `, ${timestampCol} = now()` : ''}
         WHERE id = $2 AND status = ANY($3) RETURNING *`,
        [to, req.params.id, from]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Transição inválida para esta senha' });
      await broadcastQueue();
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  };

  router.post('/:id/start', requireAuth, transition(['called'], 'in_service', 'started_at'));
  router.post('/:id/finish', requireAuth, transition(['called', 'in_service'], 'done', 'finished_at'));
  router.post('/:id/no-show', requireAuth, transition(['called'], 'no_show', 'finished_at'));

  // Painel de gestão: todas as senhas do dia
  router.get('/today', requireAuth, async (_req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT t.*, st.name AS service_name, st.color, c.name AS counter_name, u.name AS attendant_name
         FROM tickets t
         JOIN service_types st ON st.id = t.service_type_id
         LEFT JOIN counters c ON c.id = t.counter_id
         LEFT JOIN users u ON u.id = t.attendant_id
         WHERE t.created_at::date = CURRENT_DATE
         ORDER BY t.created_at DESC`
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  // Cancelar senha em espera (gestão)
  router.post('/:id/cancel', requireAuth, transition(['waiting'], 'cancelled', 'finished_at'));

  return router;
}
