import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { Card, PageTitle } from '../components/ui.jsx';
import { StatTile, BarChart, HBarChart } from '../components/charts.jsx';
import { fmtDur } from '../lib/time.js';

export default function Dashboard() {
  const [data, setData] = useState(null);

  // Sem parâmetros de data: o servidor usa o "hoje" do fuso da clínica,
  // evitando divergência entre o relógio do navegador e o do servidor
  const load = useCallback(() => {
    api('/reports/summary').then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const s = getSocket();
    s.on('queue:update', load);
    return () => s.off('queue:update', load);
  }, [load]);

  const t = data?.totals || {};
  // Eixo de 7h às 18h por padrão, expandido para cobrir horas com movimento
  const dataHours = (data?.byHour || []).map((x) => x.hour);
  const start = Math.min(7, ...(dataHours.length ? dataHours : [7]));
  const end = Math.max(18, ...(dataHours.length ? dataHours : [18]));
  const hours = Array.from({ length: end - start + 1 }, (_, i) => i + start);
  const byHour = hours.map((h) => ({
    label: h,
    value: data?.byHour?.find((x) => x.hour === h)?.total || 0,
  }));

  return (
    <div>
      <PageTitle title="Dashboard" subtitle="Visão geral do atendimento de hoje — atualiza em tempo real" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Senhas emitidas" value={t.total} accent="#2a78d6" />
        <StatTile label="Aguardando" value={t.waiting} accent="#eda100" />
        <StatTile label="Atendidas" value={t.done} accent="#1baf7a" />
        <StatTile label="Não compareceram" value={t.no_show} accent="#898781" />
        <StatTile
          label="Espera média"
          value={t.avg_wait_sec != null ? fmtDur(t.avg_wait_sec) : '—'}
          hint="Da emissão até a chamada"
          accent="#2a78d6"
        />
        <StatTile
          label="Atendimento médio"
          value={t.avg_service_sec != null ? fmtDur(t.avg_service_sec) : '—'}
          hint="Da chamada até a finalização"
          accent="#1baf7a"
        />
        <StatTile label="Em atendimento" value={t.in_progress} accent="#4a3aa7" />
        <StatTile label="Canceladas" value={t.cancelled} accent="#e34948" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-6 font-semibold text-slate-900 dark:text-white">Senhas por hora</h2>
          <BarChart data={byHour} formatLabel={(h) => `${h}h`} />
        </Card>

        <Card>
          <h2 className="mb-6 font-semibold text-slate-900 dark:text-white">Por tipo de atendimento</h2>
          <HBarChart
            data={(data?.byType || []).map((x) => ({ label: x.name, value: x.total, color: x.color }))}
          />
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-6 font-semibold text-slate-900 dark:text-white">Atendimentos por atendente</h2>
          <HBarChart
            data={(data?.byAttendant || []).map((x) => ({
              label: `${x.name}${x.total_service_sec != null ? ` · total ${fmtDur(x.total_service_sec)}` : ''}${x.avg_service_sec != null ? ` · média ${fmtDur(x.avg_service_sec)}` : ''}`,
              value: x.total,
            }))}
          />
        </Card>
      </div>
    </div>
  );
}
