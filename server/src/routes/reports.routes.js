import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

const range = (req) => {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || from;
  return [from, to];
};

// Resumo para o dashboard e relatórios
router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const [from, to] = range(req);
    const params = [from, to];
    const where = `t.created_at::date BETWEEN $1 AND $2`;

    const { rows: totals } = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'done')::int AS done,
         COUNT(*) FILTER (WHERE status = 'waiting')::int AS waiting,
         COUNT(*) FILTER (WHERE status IN ('called', 'in_service'))::int AS in_progress,
         COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
         ROUND(AVG(EXTRACT(EPOCH FROM (called_at - created_at)) / 60)
           FILTER (WHERE called_at IS NOT NULL))::int AS avg_wait_min,
         ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - called_at)) / 60)
           FILTER (WHERE finished_at IS NOT NULL AND status = 'done'))::int AS avg_service_min
       FROM tickets t WHERE ${where}`,
      params
    );

    const { rows: byType } = await query(
      `SELECT st.name, st.color, COUNT(t.id)::int AS total,
              COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done
       FROM service_types st
       LEFT JOIN tickets t ON t.service_type_id = st.id AND ${where}
       GROUP BY st.id, st.name, st.color
       ORDER BY total DESC`,
      params
    );

    const { rows: byHour } = await query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS total
       FROM tickets t WHERE ${where}
       GROUP BY 1 ORDER BY 1`,
      params
    );

    const { rows: byAttendant } = await query(
      `SELECT u.name, COUNT(t.id)::int AS total,
              ROUND(AVG(EXTRACT(EPOCH FROM (t.finished_at - t.called_at)) / 60)
                FILTER (WHERE t.finished_at IS NOT NULL))::int AS avg_service_min
       FROM users u
       JOIN tickets t ON t.attendant_id = u.id AND ${where}
       GROUP BY u.id, u.name
       ORDER BY total DESC`,
      params
    );

    const { rows: byDay } = await query(
      `SELECT created_at::date AS day, COUNT(*)::int AS total
       FROM tickets t WHERE ${where}
       GROUP BY 1 ORDER BY 1`,
      params
    );

    res.json({ totals: totals[0], byType, byHour, byAttendant, byDay });
  } catch (e) {
    next(e);
  }
});

// Lista detalhada (com exportação CSV)
router.get('/tickets', requireAuth, async (req, res, next) => {
  try {
    const [from, to] = range(req);
    const { rows } = await query(
      `SELECT t.code, t.customer_name, st.name AS service_name, t.status,
              c.name AS counter_name, u.name AS attendant_name,
              t.created_at, t.called_at, t.finished_at
       FROM tickets t
       JOIN service_types st ON st.id = t.service_type_id
       LEFT JOIN counters c ON c.id = t.counter_id
       LEFT JOIN users u ON u.id = t.attendant_id
       WHERE t.created_at::date BETWEEN $1 AND $2
       ORDER BY t.created_at DESC`,
      [from, to]
    );
    if (req.query.format === 'csv') {
      const header = 'senha;nome;tipo;status;guiche;atendente;emitida;chamada;finalizada';
      const lines = rows.map((r) =>
        [r.code, r.customer_name || '', r.service_name, r.status, r.counter_name || '',
         r.attendant_name || '', r.created_at?.toISOString() || '',
         r.called_at?.toISOString() || '', r.finished_at?.toISOString() || '']
          .map((v) => String(v).replaceAll(';', ','))
          .join(';')
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio_${from}_${to}.csv`);
      return res.send('﻿' + [header, ...lines].join('\n'));
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
