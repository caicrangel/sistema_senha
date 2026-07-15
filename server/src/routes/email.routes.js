import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { sendMail, sendSchedule } from '../email.js';

const FREQ = ['daily', 'weekly', 'monthly'];
const validTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
const validEmails = (list) =>
  String(list || '')
    .split(/[,;]+/)
    .map((e) => e.trim())
    .filter(Boolean)
    .every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

export default function emailRoutes() {
  const router = Router();
  router.use(requireAuth, requireAdmin);

  // Teste da configuração SMTP
  router.post('/smtp-test', async (req, res, next) => {
    try {
      const { to } = req.body || {};
      if (!to || !validEmails(to)) return res.status(400).json({ error: 'Informe um e-mail de destino válido' });
      await sendMail({
        to,
        subject: 'Teste de e-mail — Sistema de Senhas',
        html: '<p>Se você recebeu esta mensagem, a configuração SMTP do Sistema de Senhas está funcionando. ✅</p>',
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: `Falha no envio: ${e.message}` });
    }
  });

  // ------- Agendamentos -------
  router.get('/email-schedules', async (_req, res, next) => {
    try {
      const { rows } = await query('SELECT * FROM email_schedules ORDER BY id');
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  const validate = (b) => {
    if (!b.name?.trim()) return 'Informe um nome para o agendamento';
    if (!validEmails(b.recipients) || !b.recipients?.trim()) return 'Destinatários inválidos (separe por vírgula)';
    if (!FREQ.includes(b.frequency)) return 'Frequência inválida';
    if (!validTime(b.send_time)) return 'Horário inválido (use HH:MM)';
    if (!b.subject?.trim()) return 'Informe o assunto do e-mail';
    if (b.frequency === 'monthly' && (b.monthday < 1 || b.monthday > 28)) {
      return 'Dia do mês deve ser entre 1 e 28 (garante envio em todos os meses)';
    }
    return null;
  };

  router.post('/email-schedules', async (req, res, next) => {
    try {
      const b = { frequency: 'monthly', send_time: '07:00', weekday: 1, monthday: 1, ...req.body };
      const err = validate(b);
      if (err) return res.status(400).json({ error: err });
      const { rows } = await query(
        `INSERT INTO email_schedules
           (name, recipients, frequency, send_time, weekday, monthday, subject, body,
            include_summary, include_attendants, attach_pdf, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          b.name.trim(), b.recipients.trim(), b.frequency, b.send_time,
          b.weekday ?? 1, b.monthday ?? 1, b.subject.trim(), b.body || '',
          b.include_summary !== false, b.include_attendants !== false,
          b.attach_pdf !== false, b.active !== false,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.put('/email-schedules/:id', async (req, res, next) => {
    try {
      const { rows: cur } = await query('SELECT * FROM email_schedules WHERE id = $1', [req.params.id]);
      if (!cur[0]) return res.status(404).json({ error: 'Agendamento não encontrado' });
      const b = { ...cur[0], ...req.body };
      const err = validate(b);
      if (err) return res.status(400).json({ error: err });
      const { rows } = await query(
        `UPDATE email_schedules SET
           name=$1, recipients=$2, frequency=$3, send_time=$4, weekday=$5, monthday=$6,
           subject=$7, body=$8, include_summary=$9, include_attendants=$10,
           attach_pdf=$11, active=$12
         WHERE id=$13 RETURNING *`,
        [
          b.name.trim(), b.recipients.trim(), b.frequency, b.send_time, b.weekday, b.monthday,
          b.subject.trim(), b.body || '', b.include_summary, b.include_attendants,
          b.attach_pdf, b.active, req.params.id,
        ]
      );
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/email-schedules/:id', async (req, res, next) => {
    try {
      await query('DELETE FROM email_schedules WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // Dispara imediatamente (mesmo conteúdo do envio automático)
  router.post('/email-schedules/:id/send-now', async (req, res, next) => {
    try {
      const { rows } = await query('SELECT * FROM email_schedules WHERE id = $1', [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Agendamento não encontrado' });
      await sendSchedule(rows[0]);
      await query(
        `UPDATE email_schedules SET last_sent_at = now(), last_status = 'ok (manual)' WHERE id = $1`,
        [req.params.id]
      );
      res.json({ ok: true });
    } catch (e) {
      await query(
        `UPDATE email_schedules SET last_status = $2 WHERE id = $1`,
        [req.params.id, `erro: ${e.message}`.slice(0, 300)]
      ).catch(() => {});
      res.status(400).json({ error: `Falha no envio: ${e.message}` });
    }
  });

  return router;
}
