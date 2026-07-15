import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { Card, PageTitle, Button, Select, StatusBadge } from '../components/ui.jsx';

export default function Attendant() {
  const [queue, setQueue] = useState([]);
  const [counters, setCounters] = useState([]);
  const [counterId, setCounterId] = useState(() => localStorage.getItem('senha_counter') || '');
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/tickets/queue').then(setQueue).catch(() => {});
    api('/tickets/mine').then(setCurrent).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api('/admin/counters').then((c) => setCounters(c.filter((x) => x.active))).catch(() => {});
    const s = getSocket();
    s.on('queue:update', load);
    s.on('ticket:created', load);
    return () => {
      s.off('queue:update', load);
      s.off('ticket:created', load);
    };
  }, [load]);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const callNext = () =>
    act(async () => {
      const t = await api('/tickets/call-next', { method: 'POST', body: { counter_id: Number(counterId) } });
      setCurrent(t);
    });

  // Adiantar: chama uma senha específica fora da ordem da fila
  const callSpecific = (ticket) =>
    act(async () => {
      if (!confirm(`Adiantar a senha ${ticket.code}${ticket.customer_name ? ` (${ticket.customer_name})` : ''}? Ela será chamada fora da ordem da fila.`)) return;
      const t = await api(`/tickets/${ticket.id}/call`, { method: 'POST', body: { counter_id: Number(counterId) } });
      setCurrent(t);
    });

  const selectCounter = (v) => {
    setCounterId(v);
    localStorage.setItem('senha_counter', v);
  };

  return (
    <div>
      <PageTitle title="Atendimento" subtitle="Chame e gerencie as senhas do seu guichê" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Meu guichê</h2>
          <Select value={counterId} onChange={(e) => selectCounter(e.target.value)}>
            <option value="">Selecione o guichê…</option>
            {counters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>

          <Button
            onClick={callNext}
            disabled={busy || !counterId}
            className="mt-4 w-full py-4 text-lg"
          >
            📢 Chamar próxima senha
          </Button>
          {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

          {current && (
            <div className="mt-6 rounded-2xl border-2 p-5 text-center" style={{ borderColor: current.color }}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Senha atual
              </div>
              <div className="my-2 text-5xl font-black text-slate-900 dark:text-white">{current.code}</div>
              {current.customer_name && (
                <div className="text-lg font-medium text-slate-700 dark:text-slate-200">{current.customer_name}</div>
              )}
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{current.service_name}</div>
              <div className="mt-2"><StatusBadge status={current.status} /></div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled={busy}
                  onClick={() => act(() => api(`/tickets/${current.id}/recall`, { method: 'POST' }))}>
                  🔁 Rechamar
                </Button>
                {current.status === 'called' && (
                  <Button variant="secondary" disabled={busy}
                    onClick={() => act(async () => setCurrent(await api(`/tickets/${current.id}/start`, { method: 'POST' })))}>
                    ▶️ Iniciar
                  </Button>
                )}
                <Button variant="success" disabled={busy}
                  onClick={() => act(async () => { await api(`/tickets/${current.id}/finish`, { method: 'POST' }); setCurrent(null); })}>
                  ✅ Finalizar
                </Button>
                {current.status === 'called' && (
                  <Button variant="danger" disabled={busy}
                    onClick={() => act(async () => { await api(`/tickets/${current.id}/no-show`, { method: 'POST' }); setCurrent(null); })}>
                    🚫 Não veio
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Fila de espera</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Ordem: maior prioridade primeiro; empate decidido pela chegada
              </p>
            </div>
            <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand-dark dark:bg-slate-800 dark:text-white">
              {queue.length} aguardando
            </span>
          </div>
          <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {queue.map((t, i) => (
              <div key={t.id} className="flex items-center gap-4 py-3">
                <span className="w-6 text-sm font-semibold text-slate-400">{i + 1}º</span>
                <span
                  className="rounded-lg px-3 py-1 text-lg font-black text-white"
                  style={{ backgroundColor: t.color }}
                >
                  {t.code}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {t.customer_name || <span className="text-slate-400">Sem nome</span>}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t.service_name}</div>
                </div>
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                  {new Date(t.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  disabled={busy || !counterId}
                  title={counterId ? 'Chamar esta senha fora da ordem' : 'Selecione um guichê primeiro'}
                  onClick={() => callSpecific(t)}
                >
                  ⏩ Adiantar
                </Button>
              </div>
            ))}
            {queue.length === 0 && (
              <p className="py-10 text-center text-slate-400 dark:text-slate-500">Nenhuma senha na fila 🎉</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
