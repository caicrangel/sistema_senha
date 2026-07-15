import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { Card, PageTitle, Button, StatusBadge } from '../components/ui.jsx';
import { fmtDur, elapsedSec } from '../lib/time.js';

const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('pt-BR') : '—');

// Duração da senha: concluída = fixa; em chamada/atendimento = cronômetro ao vivo;
// aguardando = tempo de espera correndo
function Duration({ ticket: t, now }) {
  if (t.status === 'done') {
    return <span>{fmtDur(t.service_sec)}</span>;
  }
  if (t.status === 'called' || t.status === 'in_service') {
    return (
      <span className="font-semibold text-blue-600 dark:text-blue-400">
        ⏱ {fmtDur(elapsedSec(t.called_at, now))}
      </span>
    );
  }
  if (t.status === 'waiting') {
    return (
      <span className="text-amber-600 dark:text-amber-400">
        espera {fmtDur(elapsedSec(t.created_at, now))}
      </span>
    );
  }
  return <span>—</span>;
}

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('all');
  const [now, setNow] = useState(Date.now());

  // Relógio de 1s para os cronômetros ao vivo
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(() => api('/tickets/today').then(setTickets).catch(() => {}), []);

  useEffect(() => {
    load();
    const s = getSocket();
    s.on('queue:update', load);
    s.on('ticket:created', load);
    return () => {
      s.off('queue:update', load);
      s.off('ticket:created', load);
    };
  }, [load]);

  const cancel = async (id) => {
    if (!confirm('Cancelar esta senha?')) return;
    try {
      await api(`/tickets/${id}/cancel`, { method: 'POST' });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const filtered = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);
  const filters = [
    ['all', 'Todas'],
    ['waiting', 'Aguardando'],
    ['called', 'Chamadas'],
    ['in_service', 'Em atendimento'],
    ['done', 'Concluídas'],
    ['no_show', 'Não compareceu'],
    ['cancelled', 'Canceladas'],
  ];

  return (
    <div>
      <PageTitle title="Gestão de Senhas" subtitle={`Senhas emitidas hoje: ${tickets.length}`} />

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === key ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Senha</th>
              <th className="px-5 py-3">Nome</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Guichê</th>
              <th className="px-5 py-3">Atendente</th>
              <th className="px-5 py-3">Emitida</th>
              <th className="px-5 py-3">Chamada</th>
              <th className="px-5 py-3">Duração</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-5 py-3">
                  <span className="rounded-md px-2 py-0.5 font-black text-white" style={{ backgroundColor: t.color }}>
                    {t.code}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-900 dark:text-white">{t.customer_name || '—'}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{t.service_name}</td>
                <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{t.counter_name || '—'}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{t.attendant_name || '—'}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{fmtTime(t.created_at)}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">{fmtTime(t.called_at)}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                  <Duration ticket={t} now={now} />
                </td>
                <td className="px-5 py-3 text-right">
                  {t.status === 'waiting' && (
                    <Button variant="danger" className="px-3 py-1 text-xs" onClick={() => cancel(t.id)}>
                      Cancelar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-10 text-center text-slate-400 dark:text-slate-500">
                  Nenhuma senha encontrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
