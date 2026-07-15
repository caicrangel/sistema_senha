import { useCallback, useEffect, useState } from 'react';
import { api, downloadFile } from '../lib/api.js';
import { Card, PageTitle, Button, Input, StatusBadge } from '../components/ui.jsx';
import { StatTile, BarChart, HBarChart } from '../components/charts.jsx';
import { useBranding } from '../lib/branding.jsx';

// Datas no fuso local do usuário (não em UTC — à noite a data UTC já virou)
const localDate = (d) => d.toLocaleDateString('en-CA');
const today = () => localDate(new Date());
const daysAgo = (n) => localDate(new Date(Date.now() - n * 86400000));

const fmt = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) : '—');

// Duração com segundos: "45s" / "3min 05s" / "1h 02min"
const fmtDurSec = (sec) => {
  if (sec == null) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}min ${String(sec % 60).padStart(2, '0')}s`;
  return `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}min`;
};

export default function Reports() {
  const { settings } = useBranding();
  const medicalOn = settings.flow_medical === '1';
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        api(`/reports/summary?from=${from}&to=${to}`),
        api(`/reports/tickets?from=${from}&to=${to}`),
      ]);
      setSummary(s);
      setRows(r);
    } catch {
      // mantém dados anteriores
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const [exporting, setExporting] = useState('');

  const doExport = async (format) => {
    setExporting(format);
    try {
      if (format === 'csv') {
        await downloadFile(`/reports/tickets?from=${from}&to=${to}&format=csv`, `relatorio_${from}_${to}.csv`);
      } else {
        await downloadFile(`/reports/export?from=${from}&to=${to}&format=${format}`, `relatorio_${from}_${to}.${format}`);
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setExporting('');
    }
  };

  const t = summary?.totals || {};
  const presets = [
    ['Hoje', today(), today()],
    ['7 dias', daysAgo(6), today()],
    ['30 dias', daysAgo(29), today()],
  ];

  return (
    <div>
      <PageTitle title="Relatórios" subtitle="Análise de atendimento por período">
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!!exporting} onClick={() => doExport('pdf')}>
            {exporting === 'pdf' ? 'Gerando…' : '📄 PDF'}
          </Button>
          <Button variant="secondary" disabled={!!exporting} onClick={() => doExport('xlsx')}>
            {exporting === 'xlsx' ? 'Gerando…' : '📊 Excel'}
          </Button>
          <Button variant="secondary" disabled={!!exporting} onClick={() => doExport('csv')}>
            {exporting === 'csv' ? 'Gerando…' : '⬇️ CSV'}
          </Button>
        </div>
      </PageTitle>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          {presets.map(([label, f, tt]) => (
            <button
              key={label}
              onClick={() => { setFrom(f); setTo(tt); }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                from === f && to === tt
                  ? 'bg-brand text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex items-end gap-3">
            <Input label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Total de senhas" value={t.total} accent="#2a78d6" />
        <StatTile label="Atendidas" value={t.done} accent="#1baf7a" />
        <StatTile label="Espera média" value={t.avg_wait_sec != null ? fmtDurSec(t.avg_wait_sec) : '—'}
          hint="Emissão → chamada" accent="#eda100" />
        <StatTile label="Atendimento médio" value={t.avg_service_sec != null ? fmtDurSec(t.avg_service_sec) : '—'}
          hint="Chamada → finalização" accent="#1baf7a" />
        <StatTile label="Operação média" value={t.avg_total_sec != null ? fmtDurSec(t.avg_total_sec) : '—'}
          hint="Emissão → finalização" accent="#4a3aa7" />
        <StatTile label="Tempo total de atendimento" value={t.total_service_sec != null ? fmtDurSec(t.total_service_sec) : '—'}
          hint="Soma das concluídas" accent="#2a78d6" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-6 font-semibold text-slate-900 dark:text-white">Senhas por dia</h2>
          <BarChart
            data={(summary?.byDay || []).map((d) => ({
              label: new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
              value: d.total,
            }))}
          />
        </Card>
        <Card>
          <h2 className="mb-6 font-semibold text-slate-900 dark:text-white">Por tipo de atendimento</h2>
          <HBarChart
            data={(summary?.byType || []).map((x) => ({ label: x.name, value: x.total, color: x.color }))}
          />
        </Card>
      </div>

      <Card className="mt-6 overflow-x-auto p-0">
        <div className="px-5 py-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">
            Atendimento por colaborador{medicalOn ? ' (recepção)' : ''}
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Tempo contado da chamada até a finalização das senhas concluídas
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Atendente</th>
              <th className="px-5 py-3">Senhas chamadas</th>
              <th className="px-5 py-3">Concluídas</th>
              <th className="px-5 py-3">Tempo total de atendimento</th>
              <th className="px-5 py-3">Tempo médio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(summary?.byAttendant || []).map((a) => (
              <tr key={a.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{a.name}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{a.total}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{a.done}</td>
                <td className="px-5 py-3 font-semibold tabular-nums text-slate-900 dark:text-white">{a.total_service_sec != null ? fmtDurSec(a.total_service_sec) : '—'}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{a.avg_service_sec != null ? fmtDurSec(a.avg_service_sec) : '—'}</td>
              </tr>
            ))}
            {(summary?.byAttendant || []).length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400 dark:text-slate-500">Sem atendimentos no período</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Relatório de tempo por médico — só quando o fluxo médico está habilitado */}
      {medicalOn && (
        <Card className="mt-6 overflow-x-auto p-0">
          <div className="px-5 py-4">
            <h2 className="font-semibold text-slate-900 dark:text-white">🩺 Atendimento por médico (consultório)</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Espera contada do encaminhamento até a chamada; consulta contada da chamada até a finalização
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Médico</th>
                <th className="px-5 py-3">Especialidade</th>
                <th className="px-5 py-3">Pacientes chamados</th>
                <th className="px-5 py-3">Concluídos</th>
                <th className="px-5 py-3">Espera média (fila médica)</th>
                <th className="px-5 py-3">Consulta média</th>
                <th className="px-5 py-3">Tempo total em consultas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(summary?.byDoctor || []).map((d) => (
                <tr key={d.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{d.name}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{d.specialty_name || '—'}</td>
                  <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{d.total}</td>
                  <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{d.done}</td>
                  <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{d.avg_wait_sec != null ? fmtDurSec(d.avg_wait_sec) : '—'}</td>
                  <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{d.avg_consult_sec != null ? fmtDurSec(d.avg_consult_sec) : '—'}</td>
                  <td className="px-5 py-3 font-semibold tabular-nums text-slate-900 dark:text-white">{d.total_consult_sec != null ? fmtDurSec(d.total_consult_sec) : '—'}</td>
                </tr>
              ))}
              {(summary?.byDoctor || []).length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400 dark:text-slate-500">Nenhum atendimento médico no período</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="mt-6 overflow-x-auto p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">Detalhamento {loading && '· carregando…'}</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">{rows.length} registros</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Senha</th>
              <th className="px-5 py-3">Nome</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Guichê</th>
              <th className="px-5 py-3">Atendente</th>
              <th className="px-5 py-3">Emitida</th>
              <th className="px-5 py-3">Finalizada</th>
              <th className="px-5 py-3">Espera</th>
              <th className="px-5 py-3">Atendimento</th>
              <th className="px-5 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-5 py-3 font-bold text-slate-900 dark:text-white">{r.code}</td>
                <td className="px-5 py-3 text-slate-900 dark:text-white">{r.customer_name || '—'}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.service_name}</td>
                <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.counter_name || '—'}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{r.attendant_name || '—'}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{fmt(r.created_at)}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{fmt(r.finished_at)}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                  {r.called_at ? fmtDurSec(r.wait_sec) : '—'}
                </td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                  {r.status === 'done' ? fmtDurSec(r.service_sec) : '—'}
                </td>
                <td className="px-5 py-3 font-semibold tabular-nums text-slate-900 dark:text-white">
                  {r.status === 'done' ? fmtDurSec(r.total_sec) : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-5 py-10 text-center text-slate-400 dark:text-slate-500">Sem registros no período</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
