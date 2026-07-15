import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { query } from '../db.js';

export const STATUS_PT = {
  waiting: 'Aguardando',
  called: 'Chamada',
  in_service: 'Em atendimento',
  done: 'Concluída',
  no_show: 'Não compareceu',
  cancelled: 'Cancelada',
};

export const dPt = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '');
// Hora completa com segundos (HH:MM:SS)
export const hPt = (d) => (d ? new Date(d).toLocaleTimeString('pt-BR') : '');

// Duração em segundos formatada: "45s" / "3min 05s" / "1h 02min"
export const fmtDur = (sec) => {
  if (sec == null) return '';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}min ${String(sec % 60).padStart(2, '0')}s`;
  return `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}min`;
};

export async function fetchRows(from, to) {
  const { rows } = await query(
    `SELECT t.code, t.customer_name, st.name AS service_name, t.status, t.stage,
            c.name AS counter_name, u.name AS attendant_name,
            r.name AS room_name, d.name AS doctor_name, sp.name AS specialty_name,
            t.created_at, t.called_at, t.forwarded_at, t.med_called_at, t.finished_at,
            EXTRACT(EPOCH FROM (t.called_at - t.created_at))::int AS wait_sec,
            EXTRACT(EPOCH FROM (COALESCE(t.forwarded_at, t.finished_at) - t.called_at))::int AS service_sec,
            EXTRACT(EPOCH FROM (t.med_called_at - t.forwarded_at))::int AS med_wait_sec,
            EXTRACT(EPOCH FROM (t.finished_at - t.med_called_at))::int AS med_service_sec,
            EXTRACT(EPOCH FROM (t.finished_at - t.created_at))::int AS total_sec
     FROM tickets t
     JOIN service_types st ON st.id = t.service_type_id
     LEFT JOIN counters c ON c.id = t.counter_id
     LEFT JOIN users u ON u.id = t.attendant_id
     LEFT JOIN rooms r ON r.id = t.room_id
     LEFT JOIN users d ON d.id = t.doctor_id
     LEFT JOIN specialties sp ON sp.id = t.specialty_id
     WHERE t.created_at::date BETWEEN $1 AND $2
     ORDER BY t.created_at DESC`,
    [from, to]
  );
  return rows;
}

// Descobre se o fluxo médico está habilitado (para incluir as colunas do médico)
export async function isMedicalOn() {
  const { rows } = await query(`SELECT value FROM settings WHERE key = 'flow_medical'`);
  return rows[0]?.value === '1';
}

async function getBranding() {
  const { rows } = await query(
    `SELECT key, value FROM settings WHERE key IN ('company_name', 'logo')`
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

const genStamp = (user) =>
  `Gerado em ${dPt(new Date())} às ${hPt(new Date())} por ${user?.name || '—'}`;

const periodLabel = (from, to) => {
  const f = dPt(from + 'T12:00:00');
  const t = dPt(to + 'T12:00:00');
  return f === t ? `Período: ${f}` : `Período: ${f} a ${t}`;
};

// ---------------------------------------------------------------- Excel

export async function buildXlsx({ from, to, user }) {
  const rows = await fetchRows(from, to);
  const { company_name } = await getBranding();
  const medical = await isMedicalOn();

  const wb = new ExcelJS.Workbook();
  wb.creator = user?.name || 'Sistema de Senhas';
  const ws = wb.addWorksheet('Relatório de Atendimento');

  ws.addRow([company_name || 'Clínica']);
  ws.addRow(['Relatório de Atendimento']);
  ws.addRow([periodLabel(from, to)]);
  ws.addRow([genStamp(user)]);
  ws.addRow([]);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(2).font = { bold: true, size: 12 };

  const header = [
    'Senha', 'Nome', 'Tipo de Atendimento', 'Status',
    medical ? 'Destino' : 'Guichê', 'Atendente',
    ...(medical ? ['Médico'] : []),
    'Data Emissão', 'Hora Emissão', 'Data Chamada', 'Hora Chamada',
    'Data Finalização', 'Hora Finalização',
    medical ? 'Espera Recepção' : 'Espera',
    medical ? 'Atend. Recepção' : 'Atendimento',
    ...(medical ? ['Espera Médico', 'Consulta'] : []),
    'Total',
  ];
  const headerRow = ws.addRow(header);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };
    cell.border = { bottom: { style: 'thin' } };
  });

  const dest = (r) =>
    r.stage === 'medical'
      ? [r.room_name || 'Consultório', r.doctor_name].filter(Boolean).join(' · ')
      : r.counter_name || '';

  for (const r of rows) {
    ws.addRow([
      r.code,
      r.customer_name || '',
      r.service_name,
      STATUS_PT[r.status] || r.status,
      medical ? dest(r) : (r.counter_name || ''),
      r.attendant_name || '',
      ...(medical ? [r.doctor_name || ''] : []),
      dPt(r.created_at), hPt(r.created_at),
      dPt(r.called_at), hPt(r.called_at),
      dPt(r.finished_at), hPt(r.finished_at),
      r.called_at ? fmtDur(r.wait_sec) : '',
      r.service_sec != null ? fmtDur(r.service_sec) : '',
      ...(medical ? [
        r.med_wait_sec != null ? fmtDur(r.med_wait_sec) : '',
        r.status === 'done' && r.med_service_sec != null ? fmtDur(r.med_service_sec) : '',
      ] : []),
      r.status === 'done' ? fmtDur(r.total_sec) : '',
    ]);
  }

  ws.columns.forEach((col) => { col.width = 15; });
  ws.getColumn(2).width = 24;
  ws.getColumn(3).width = 24;

  return wb.xlsx.writeBuffer();
}

// ---------------------------------------------------------------- PDF

// Colunas do PDF conforme o fluxo médico (mais colunas de tempo quando ligado)
const pdfCols = (medical) =>
  medical
    ? [
        ['Senha', 34], ['Nome', 68], ['Tipo', 56], ['Status', 54],
        ['Destino', 78], ['Médico', 60],
        ['Emissão', 62], ['Final.', 62],
        ['Esp.Rec', 42], ['At.Rec', 42], ['Esp.Méd', 42], ['Consulta', 44], ['Total', 44],
      ]
    : [
        ['Senha', 40], ['Nome', 84], ['Tipo', 78], ['Status', 64],
        ['Guichê', 46], ['Atendente', 76],
        ['Dt. Emissão', 52], ['Hora', 44], ['Dt. Final.', 52], ['Hora', 44],
        ['Espera', 48], ['Atendim.', 48], ['Total', 48],
      ];

export async function buildPdf({ from, to, user }) {
  const rows = await fetchRows(from, to);
  const { company_name, logo } = await getBranding();
  const medical = await isMedicalOn();
  const PDF_COLS = pdfCols(medical);
  const dest = (r) =>
    r.stage === 'medical'
      ? [r.room_name || 'Consultório', r.doctor_name].filter(Boolean).join(' · ')
      : r.counter_name || '—';

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const finished = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const bottom = doc.page.height - doc.page.margins.bottom;

  const drawHeader = () => {
    let textX = left;
    if (logo?.startsWith('data:image')) {
      try {
        const buf = Buffer.from(logo.split(',')[1], 'base64');
        doc.image(buf, left, 24, { fit: [46, 46] });
        textX = left + 56;
      } catch {
        // formato de imagem não suportado no PDF — segue sem logo
      }
    }
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111')
      .text(company_name || 'Clínica', textX, 26);
    doc.fontSize(10).font('Helvetica').fillColor('#333')
      .text('Relatório de Atendimento', textX, 44);
    doc.fontSize(8).fillColor('#555')
      .text(periodLabel(from, to), textX, 58)
      .text(genStamp(user), left, 32, { align: 'right' });
    doc.moveTo(left, 78).lineTo(doc.page.width - left, 78).strokeColor('#999').stroke();
    return 86;
  };

  const drawTableHead = (y) => {
    let x = left;
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#111');
    for (const [label, w] of PDF_COLS) {
      doc.text(label.toUpperCase(), x, y, { width: w - 4 });
      x += w;
    }
    const yl = y + 11;
    doc.moveTo(left, yl).lineTo(doc.page.width - left, yl).strokeColor('#bbb').stroke();
    return yl + 4;
  };

  let y = drawHeader();
  y = drawTableHead(y);
  doc.font('Helvetica').fontSize(7).fillColor('#222');

  for (const r of rows) {
    if (y > bottom - 14) {
      doc.addPage();
      y = drawHeader();
      y = drawTableHead(y);
      doc.font('Helvetica').fontSize(7).fillColor('#222');
    }
    const cells = medical
      ? [
          r.code,
          r.customer_name || '—',
          r.service_name,
          STATUS_PT[r.status] || r.status,
          dest(r),
          r.doctor_name || '—',
          `${dPt(r.created_at)} ${hPt(r.created_at)}`,
          r.finished_at ? `${dPt(r.finished_at)} ${hPt(r.finished_at)}` : '—',
          r.called_at ? fmtDur(r.wait_sec) : '—',
          r.service_sec != null ? fmtDur(r.service_sec) : '—',
          r.med_wait_sec != null ? fmtDur(r.med_wait_sec) : '—',
          r.status === 'done' && r.med_service_sec != null ? fmtDur(r.med_service_sec) : '—',
          r.status === 'done' ? fmtDur(r.total_sec) : '—',
        ]
      : [
          r.code,
          r.customer_name || '—',
          r.service_name,
          STATUS_PT[r.status] || r.status,
          r.counter_name || '—',
          r.attendant_name || '—',
          dPt(r.created_at), hPt(r.created_at),
          dPt(r.finished_at) || '—', hPt(r.finished_at) || '—',
          r.called_at ? fmtDur(r.wait_sec) : '—',
          r.status === 'done' ? fmtDur(r.service_sec) : '—',
          r.status === 'done' ? fmtDur(r.total_sec) : '—',
        ];
    let x = left;
    cells.forEach((val, i) => {
      doc.text(String(val), x, y, { width: PDF_COLS[i][1] - 4, height: 10, ellipsis: true, lineBreak: false });
      x += PDF_COLS[i][1];
    });
    y += 13;
  }

  if (rows.length === 0) {
    doc.fontSize(9).fillColor('#666').text('Sem registros no período.', left, y + 10);
  }

  doc.end();
  return finished;
}
