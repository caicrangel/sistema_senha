import { useCallback, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api.js';
import { Card, PageTitle, Button, Input, StatusBadge } from '../components/ui.jsx';
import { StatTile, BarChart, HBarChart } from '../components/charts.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const fmt = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function Reports() {
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

  const exportCsv = async () => {
    const res = await fetch(`/api/reports/tickets?from=${from}&to=${to}&format=csv`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        <Button variant="secondary" onClick={exportCsv}>⬇️ Exportar CSV</Button>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total de senhas" value={t.total} accent="#2a78d6" />
        <StatTile label="Atendidas" value={t.done} accent="#1baf7a" />
        <StatTile label="Espera média" value={t.avg_wait_min != null ? `${t.avg_wait_min} min` : '—'} accent="#2a78d6" />
        <StatTile label="Atendimento médio" value={t.avg_service_min != null ? `${t.avg_service_min} min` : '—'} accent="#1baf7a" />
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
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400 dark:text-slate-500">Sem registros no período</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
