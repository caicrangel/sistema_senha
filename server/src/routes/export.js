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
export const hPt = (d) =>
  d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

export async function fetchRows(from, to) {
  const { rows } = await query(
    `SELECT t.code, t.customer_name, st.name AS service_name, t.status,
            c.name AS counter_name, u.name AS attendant_name,
            t.created_at, t.called_at, t.finished_at,
            ROUND(EXTRACT(EPOCH FROM (t.finished_at - t.called_at)) / 60)::int AS service_min
     FROM tickets t
     JOIN service_types st ON st.id = t.service_type_id
     LEFT JOIN counters c ON c.id = t.counter_id
     LEFT JOIN users u ON u.id = t.attendant_id
     WHERE t.created_at::date BETWEEN $1 AND $2
     ORDER BY t.created_at DESC`,
    [from, to]
  );
  return rows;
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
    'Senha', 'Nome', 'Tipo de Atendimento', 'Status', 'Guichê', 'Atendente',
    'Data Emissão', 'Hora Emissão', 'Data Chamada', 'Hora Chamada',
    'Data Finalização', 'Hora Finalização', 'Duração (min)',
  ];
  const headerRow = ws.addRow(header);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };
    cell.border = { bottom: { style: 'thin' } };
  });

  for (const r of rows) {
    ws.addRow([
      r.code,
      r.customer_name || '',
      r.service_name,
      STATUS_PT[r.status] || r.status,
      r.counter_name || '',
      r.attendant_name || '',
      dPt(r.created_at), hPt(r.created_at),
      dPt(r.called_at), hPt(r.called_at),
      dPt(r.finished_at), hPt(r.finished_at),
      r.status === 'done' && r.service_min != null ? r.service_min : '',
    ]);
  }

  ws.columns.forEach((col, i) => {
    col.width = [10, 24, 24, 16, 12, 20, 13, 12, 13, 12, 15, 15, 13][i] || 14;
  });

  return wb.xlsx.writeBuffer();
}

// ---------------------------------------------------------------- PDF

const PDF_COLS = [
  ['Senha', 42],
  ['Nome', 100],
  ['Tipo', 92],
  ['Status', 74],
  ['Guichê', 52],
  ['Atendente', 88],
  ['Dt. Emissão', 56],
  ['Hora', 34],
  ['Dt. Final.', 56],
  ['Hora', 34],
  ['Duração', 44],
];

export async function buildPdf({ from, to, user }) {
  const rows = await fetchRows(from, to);
  const { company_name, logo } = await getBranding();

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
    const cells = [
      r.code,
      r.customer_name || '—',
      r.service_name,
      STATUS_PT[r.status] || r.status,
      r.counter_name || '—',
      r.attendant_name || '—',
      dPt(r.created_at), hPt(r.created_at),
      dPt(r.finished_at) || '—', hPt(r.finished_at) || '—',
      r.status === 'done' && r.service_min != null ? `${r.service_min} min` : '—',
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
