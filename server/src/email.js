import nodemailer from 'nodemailer';
import { query } from './db.js';
import { buildPdf } from './routes/export.js';

// ---------------------------------------------------------------- SMTP

export async function getSmtp() {
  const { rows } = await query(`SELECT key, value FROM settings WHERE key LIKE 'smtp_%'`);
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!s.smtp_host) return null;
  return {
    host: s.smtp_host,
    port: parseInt(s.smtp_port, 10) || 587,
    secure: s.smtp_secure === 'ssl', // ssl = 465; tls/none negociam via STARTTLS
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass || '' } : undefined,
    from: {
      name: s.smtp_from_name || 'Sistema de Senhas',
      address: s.smtp_from_email || s.smtp_user || 'senhas@localhost',
    },
    ignoreTLS: s.smtp_secure === 'none',
  };
}

export async function sendMail({ to, subject, html, attachments }) {
  const cfg = await getSmtp();
  if (!cfg) throw new Error('SMTP não configurado. Preencha em Configurações > E-mail.');
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    ignoreTLS: cfg.ignoreTLS,
    connectionTimeout: 15000,
  });
  return transporter.sendMail({ from: cfg.from, to, subject, html, attachments });
}

// ---------------------------------------------------------------- Dados do relatório

const fmtMin = (m) =>
  m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min` : `${m} min`;

async function summaryData(from, to) {
  const params = [from, to];
  const where = `t.created_at::date BETWEEN $1 AND $2`;
  const { rows: totals } = await query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'done')::int AS done,
            COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show,
            COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
            ROUND(AVG(EXTRACT(EPOCH FROM (called_at - created_at)) / 60)
              FILTER (WHERE called_at IS NOT NULL))::int AS avg_wait_min,
            ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - called_at)) / 60)
              FILTER (WHERE finished_at IS NOT NULL AND status = 'done'))::int AS avg_service_min,
            ROUND(SUM(EXTRACT(EPOCH FROM (finished_at - called_at)) / 60)
              FILTER (WHERE finished_at IS NOT NULL AND status = 'done'))::int AS total_service_min
     FROM tickets t WHERE ${where}`,
    params
  );
  const { rows: byType } = await query(
    `SELECT st.name, COUNT(t.id)::int AS total
     FROM service_types st
     JOIN tickets t ON t.service_type_id = st.id AND ${where}
     GROUP BY st.id, st.name ORDER BY total DESC`,
    params
  );
  const { rows: byAttendant } = await query(
    `SELECT u.name, COUNT(t.id)::int AS total,
            COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done,
            ROUND(AVG(EXTRACT(EPOCH FROM (t.finished_at - t.called_at)) / 60)
              FILTER (WHERE t.finished_at IS NOT NULL AND t.status = 'done'))::int AS avg_service_min,
            ROUND(SUM(EXTRACT(EPOCH FROM (t.finished_at - t.called_at)) / 60)
              FILTER (WHERE t.finished_at IS NOT NULL AND t.status = 'done'))::int AS total_service_min
     FROM users u
     JOIN tickets t ON t.attendant_id = u.id AND ${where}
     GROUP BY u.id, u.name ORDER BY total DESC`,
    params
  );
  return { totals: totals[0], byType, byAttendant };
}

// Período coberto conforme a frequência (sempre períodos já fechados)
export function periodFor(frequency, now = new Date()) {
  const day = (d) => d.toLocaleDateString('en-CA');
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (frequency === 'daily') return { from: day(y), to: day(y), label: 'do dia anterior' };
  if (frequency === 'weekly') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { from: day(start), to: day(y), label: 'dos últimos 7 dias' };
  }
  const firstPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastPrev = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: day(firstPrev), to: day(lastPrev), label: 'do mês anterior' };
}

const dPt = (iso) => iso.split('-').reverse().join('/');

// ---------------------------------------------------------------- Montagem do e-mail

const TABLE_STYLE = 'border-collapse:collapse;width:100%;max-width:640px;font-family:Arial,sans-serif;font-size:13px';
const TH = 'text-align:left;padding:8px;background:#eef2f7;border-bottom:2px solid #d5dce5;color:#1f2937';
const TD = 'padding:7px 8px;border-bottom:1px solid #e5e9ef;color:#374151';

export async function buildScheduleEmail(schedule, now = new Date()) {
  const { from, to, label } = periodFor(schedule.frequency, now);
  const data = await summaryData(from, to);
  const { rows: cfg } = await query(`SELECT value FROM settings WHERE key = 'company_name'`);
  const company = cfg[0]?.value || 'Clínica';
  const period = from === to ? dPt(from) : `${dPt(from)} a ${dPt(to)}`;
  const t = data.totals;

  const vars = {
    empresa: company,
    periodo: period,
    total: t.total ?? 0,
    atendidas: t.done ?? 0,
    nao_compareceu: t.no_show ?? 0,
    canceladas: t.cancelled ?? 0,
    espera_media: fmtMin(t.avg_wait_min),
    atendimento_medio: fmtMin(t.avg_service_min),
    tempo_total: fmtMin(t.total_service_min),
  };
  const fill = (text) =>
    String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

  const subject = fill(schedule.subject);
  let html = `<div style="font-family:Arial,sans-serif;color:#111;max-width:680px">`;
  html += `<h2 style="margin:0 0 4px">${company}</h2>`;
  html += `<p style="margin:0 0 16px;color:#555">Relatório de atendimento ${label} — ${period}</p>`;
  if (schedule.body?.trim()) {
    html += `<div style="margin:0 0 18px;font-size:14px;line-height:1.6">${fill(schedule.body).replace(/\n/g, '<br>')}</div>`;
  }

  if (schedule.include_summary) {
    html += `<h3 style="margin:18px 0 8px;font-size:15px">Resumo do período</h3>`;
    html += `<table style="${TABLE_STYLE}">`;
    const rows = [
      ['Senhas emitidas', vars.total],
      ['Atendidas', vars.atendidas],
      ['Não compareceram', vars.nao_compareceu],
      ['Canceladas', vars.canceladas],
      ['Espera média', vars.espera_media],
      ['Atendimento médio', vars.atendimento_medio],
      ['Tempo total de atendimento', vars.tempo_total],
    ];
    for (const [k, v] of rows) {
      html += `<tr><td style="${TD}">${k}</td><td style="${TD};font-weight:bold;text-align:right">${v}</td></tr>`;
    }
    html += `</table>`;
    if (data.byType.length) {
      html += `<h3 style="margin:18px 0 8px;font-size:15px">Por tipo de atendimento</h3><table style="${TABLE_STYLE}">`;
      for (const r of data.byType) {
        html += `<tr><td style="${TD}">${r.name}</td><td style="${TD};font-weight:bold;text-align:right">${r.total}</td></tr>`;
      }
      html += `</table>`;
    }
  }

  if (schedule.include_attendants) {
    html += `<h3 style="margin:18px 0 8px;font-size:15px">Performance por atendente</h3>`;
    html += `<table style="${TABLE_STYLE}"><tr>`;
    for (const h of ['Atendente', 'Chamadas', 'Concluídas', 'Tempo total', 'Tempo médio']) {
      html += `<th style="${TH}">${h}</th>`;
    }
    html += `</tr>`;
    for (const a of data.byAttendant) {
      html += `<tr><td style="${TD}">${a.name}</td><td style="${TD}">${a.total}</td><td style="${TD}">${a.done}</td><td style="${TD}">${fmtMin(a.total_service_min)}</td><td style="${TD}">${fmtMin(a.avg_service_min)}</td></tr>`;
    }
    if (!data.byAttendant.length) {
      html += `<tr><td style="${TD}" colspan="5">Sem atendimentos no período</td></tr>`;
    }
    html += `</table>`;
  }

  html += `<p style="margin-top:24px;font-size:11px;color:#999">E-mail automático do Sistema de Senhas — ${company}. Gerado em ${now.toLocaleString('pt-BR')}.</p></div>`;

  const attachments = [];
  if (schedule.attach_pdf) {
    const buf = await buildPdf({ from, to, user: { name: 'Envio automático' } });
    attachments.push({ filename: `relatorio_${from}_${to}.pdf`, content: buf });
  }
  return { subject, html, attachments };
}

export async function sendSchedule(schedule, now = new Date()) {
  const { subject, html, attachments } = await buildScheduleEmail(schedule, now);
  await sendMail({ to: schedule.recipients, subject, html, attachments });
}

// ---------------------------------------------------------------- Agendador

let timer = null;

async function tick() {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = now.toLocaleDateString('en-CA');
  try {
    const { rows } = await query('SELECT * FROM email_schedules WHERE active = TRUE');
    for (const s of rows) {
      if (s.send_time !== hhmm) continue;
      if (s.frequency === 'weekly' && now.getDay() !== s.weekday) continue;
      if (s.frequency === 'monthly' && now.getDate() !== s.monthday) continue;
      const lastDay = s.last_sent_at
        ? new Date(s.last_sent_at).toLocaleDateString('en-CA')
        : null;
      if (lastDay === today) continue; // já enviado hoje

      try {
        await sendSchedule(s, now);
        await query(
          `UPDATE email_schedules SET last_sent_at = now(), last_status = 'ok' WHERE id = $1`,
          [s.id]
        );
        console.log(`E-mail automático enviado: ${s.name}`);
      } catch (e) {
        await query(
          `UPDATE email_schedules SET last_sent_at = now(), last_status = $2 WHERE id = $1`,
          [s.id, `erro: ${e.message}`.slice(0, 300)]
        );
        console.error(`Falha no e-mail automático "${s.name}":`, e.message);
      }
    }
  } catch (e) {
    console.error('Agendador de e-mails:', e.message);
  }
}

export function startEmailScheduler() {
  if (timer) return;
  timer = setInterval(tick, 30000);
  console.log('Agendador de e-mails ativo (verificação a cada 30s)');
}
