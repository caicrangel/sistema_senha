import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requirePerm } from '../auth.js';
import { buildPdf, buildXlsx, fetchRows, isMedicalOn, STATUS_PT, dPt, hPt, fmtDur } from './export.js';

const router = Router();

// Dashboard e Relatórios: superusuário ou permissão específica
router.use(requireAuth, requirePerm('dashboard', 'relatorios'));

// Data de "hoje" no fuso local do servidor (TZ), não em UTC
const localToday = () => new Date().toLocaleDateString('en-CA');

const range = (req) => {
  const from = req.query.from || localToday();
  const to = req.query.to || from;
  return [from, to];
};

// Resumo para o dashboard e relatórios
router.get('/summary', async (req, res, next) => {
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
         ROUND(AVG(EXTRACT(EPOCH FROM (called_at - created_at)))
           FILTER (WHERE called_at IS NOT NULL))::int AS avg_wait_sec,
         ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - called_at)))
           FILTER (WHERE finished_at IS NOT NULL AND status = 'done'))::int AS avg_service_sec,
         ROUND(SUM(EXTRACT(EPOCH FROM (finished_at - called_at)))
           FILTER (WHERE finished_at IS NOT NULL AND status = 'done'))::int AS total_service_sec,
         ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - created_at)))
           FILTER (WHERE finished_at IS NOT NULL AND status = 'done'))::int AS avg_total_sec,
         ROUND(SUM(EXTRACT(EPOCH FROM (finished_at - created_at)))
           FILTER (WHERE finished_at IS NOT NULL AND status = 'done'))::int AS total_operation_sec
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
              COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done,
              ROUND(AVG(EXTRACT(EPOCH FROM (t.finished_at - t.called_at)))
                FILTER (WHERE t.finished_at IS NOT NULL AND t.status = 'done'))::int AS avg_service_sec,
              ROUND(SUM(EXTRACT(EPOCH FROM (t.finished_at - t.called_at)))
                FILTER (WHERE t.finished_at IS NOT NULL AND t.status = 'done'))::int AS total_service_sec
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

    // Performance por médico (fase médica: fila do médico → fim da consulta)
    const { rows: byDoctor } = await query(
      `SELECT u.name, sp.name AS specialty_name,
              COUNT(t.id)::int AS total,
              COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done,
              ROUND(AVG(EXTRACT(EPOCH FROM (t.med_called_at - t.forwarded_at)))
                FILTER (WHERE t.med_called_at IS NOT NULL))::int AS avg_wait_sec,
              ROUND(AVG(EXTRACT(EPOCH FROM (t.finished_at - t.med_called_at)))
                FILTER (WHERE t.finished_at IS NOT NULL AND t.status = 'done'))::int AS avg_consult_sec,
              ROUND(SUM(EXTRACT(EPOCH FROM (t.finished_at - t.med_called_at)))
                FILTER (WHERE t.finished_at IS NOT NULL AND t.status = 'done'))::int AS total_consult_sec
       FROM users u
       LEFT JOIN specialties sp ON sp.id = u.specialty_id
       JOIN tickets t ON t.doctor_id = u.id AND t.stage = 'medical' AND ${where}
       GROUP BY u.id, u.name, sp.name
       ORDER BY total DESC`,
      params
    );

    res.json({ totals: totals[0], byType, byHour, byAttendant, byDoctor, byDay });
  } catch (e) {
    next(e);
  }
});

// Lista detalhada (com exportação CSV em pt-BR, data e hora separadas)
router.get('/tickets', async (req, res, next) => {
  try {
    const [from, to] = range(req);
    const rows = await fetchRows(from, to);
    if (req.query.format === 'csv') {
      const medical = await isMedicalOn();
      const dest = (r) =>
        r.stage === 'medical'
          ? [r.room_name || 'Consultório', r.doctor_name].filter(Boolean).join(' · ')
          : r.counter_name || '';
      const header = medical
        ? 'Senha;Nome;Tipo;Status;Destino;Atendente;Médico;Data Emissão;Hora Emissão;Data Chamada;Hora Chamada;Data Finalização;Hora Finalização;Espera Recepção;Atend. Recepção;Espera Médico;Consulta;Total'
        : 'Senha;Nome;Tipo;Status;Guichê;Atendente;Data Emissão;Hora Emissão;Data Chamada;Hora Chamada;Data Finalização;Hora Finalização;Espera;Atendimento;Total';
      const lines = rows.map((r) => {
        const base = [r.code, r.customer_name || '', r.service_name, STATUS_PT[r.status] || r.status,
          medical ? dest(r) : (r.counter_name || ''), r.attendant_name || ''];
        if (medical) base.push(r.doctor_name || '');
        base.push(
          dPt(r.created_at), hPt(r.created_at),
          dPt(r.called_at), hPt(r.called_at),
          dPt(r.finished_at), hPt(r.finished_at),
          r.called_at ? fmtDur(r.wait_sec) : '',
          r.service_sec != null ? fmtDur(r.service_sec) : ''
        );
        if (medical) {
          base.push(
            r.med_wait_sec != null ? fmtDur(r.med_wait_sec) : '',
            r.status === 'done' && r.med_service_sec != null ? fmtDur(r.med_service_sec) : ''
          );
        }
        base.push(r.status === 'done' ? fmtDur(r.total_sec) : '');
        return base.map((v) => String(v).replaceAll(';', ',')).join(';');
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio_${from}_${to}.csv`);
      return res.send('﻿' + [header, ...lines].join('\n'));
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Exportação em PDF (com logo e carimbo de geração) e Excel
router.get('/export', async (req, res, next) => {
  try {
    const [from, to] = range(req);
    const format = req.query.format;
    if (format === 'pdf') {
      const buf = await buildPdf({ from, to, user: req.user });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio_${from}_${to}.pdf`);
      return res.send(buf);
    }
    if (format === 'xlsx') {
      const buf = await buildXlsx({ from, to, user: req.user });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=relatorio_${from}_${to}.xlsx`);
      return res.send(Buffer.from(buf));
    }
    res.status(400).json({ error: 'Formato inválido (use pdf ou xlsx)' });
  } catch (e) {
    next(e);
  }
});

export default router;
