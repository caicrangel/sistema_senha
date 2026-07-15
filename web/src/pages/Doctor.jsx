import { useCallback, useEffect, useState } from 'react';
import { api, getUser, getToken } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { Card, PageTitle, Button, Select, StatusBadge } from '../components/ui.jsx';
import { fmtClock, fmtDur, elapsedSec } from '../lib/time.js';

export default function Doctor() {
  const me = getUser();
  const [queue, setQueue] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState(() => localStorage.getItem('senha_room') || '');
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(() => {
    api('/tickets/med-queue').then(setQueue).catch(() => {});
    api('/tickets/med-mine').then(setCurrent).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api('/tickets/med-rooms').then(setRooms).catch(() => {});
    const s = getSocket();
    // Anuncia presença: enquanto esta tela estiver aberta, o médico está "online"
    const announce = () => s.emit('presence:doctor', { token: getToken() });
    announce();
    s.on('connect', announce);
    s.on('queue:update', load);
    s.on('ticket:forwarded', load);
    return () => {
      s.emit('presence:leave');
      s.off('connect', announce);
      s.off('queue:update', load);
      s.off('ticket:forwarded', load);
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
      const t = await api('/tickets/med-call-next', { method: 'POST', body: { room_id: Number(roomId) } });
      setCurrent(t);
    });

  const callSpecific = (ticket) =>
    act(async () => {
      if (!confirm(`Chamar ${ticket.code}${ticket.customer_name ? ` (${ticket.customer_name})` : ''} agora, fora da ordem?`)) return;
      const t = await api(`/tickets/${ticket.id}/med-call`, { method: 'POST', body: { room_id: Number(roomId) } });
      setCurrent(t);
    });

  const returnToQueue = () =>
    act(async () => {
      if (!confirm(`Devolver o paciente ${current.code} para a fila? Retorna à posição original.`)) return;
      await api(`/tickets/${current.id}/med-return`, { method: 'POST' });
      setCurrent(null);
    });

  const selectRoom = (v) => {
    setRoomId(v);
    localStorage.setItem('senha_room', v);
  };

  return (
    <div>
      <PageTitle
        title="Consultório"
        subtitle={`Pacientes encaminhados${me?.specialty_id ? ' à sua especialidade' : ''} — chame por ordem de chegada`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Meu consultório</h2>
          <Select value={roomId} onChange={(e) => selectRoom(e.target.value)}>
            <option value="">Selecione o consultório…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>

          <Button onClick={callNext} disabled={busy || !roomId} className="mt-4 w-full py-4 text-lg">
            🩺 Chamar próximo paciente
          </Button>
          {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

          {current && (
            <div className="mt-6 rounded-2xl border-2 p-5 text-center" style={{ borderColor: current.color }}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Paciente atual</div>
              <div className="my-2 text-5xl font-black text-slate-900 dark:text-white">{current.code}</div>
              {current.customer_name && (
                <div className="text-lg font-medium text-slate-700 dark:text-slate-200">{current.customer_name}</div>
              )}
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {current.specialty_name || current.service_name}
              </div>
              <div className="mt-2"><StatusBadge status={current.status} /></div>

              <div className="mt-3 rounded-xl bg-slate-50 py-2.5 dark:bg-slate-800">
                {current.status === 'in_service' ? (
                  <>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Tempo de consulta</div>
                    <div className="text-3xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                      ⏱ {fmtClock(elapsedSec(current.med_started_at, now))}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      chamado há {fmtClock(elapsedSec(current.med_called_at, now))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Chamado há</div>
                    <div className="text-3xl font-black tabular-nums text-blue-600 dark:text-blue-400">
                      ⏱ {fmtClock(elapsedSec(current.med_called_at, now))}
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled={busy}
                  onClick={() => act(() => api(`/tickets/${current.id}/med-recall`, { method: 'POST' }))}>
                  🔁 Rechamar
                </Button>
                {current.status === 'called' && (
                  <Button variant="secondary" disabled={busy}
                    onClick={() => act(async () => setCurrent(await api(`/tickets/${current.id}/med-start`, { method: 'POST' })))}>
                    ▶️ Iniciar consulta
                  </Button>
                )}
                <Button variant="success" disabled={busy} className="col-span-2"
                  onClick={() => act(async () => { await api(`/tickets/${current.id}/med-finish`, { method: 'POST' }); setCurrent(null); })}>
                  ✔ Finalizar atendimento
                </Button>
                {current.status === 'called' && (
                  <Button variant="danger" disabled={busy}
                    onClick={() => act(async () => { await api(`/tickets/${current.id}/med-no-show`, { method: 'POST' }); setCurrent(null); })}>
                    ✕ Não veio
                  </Button>
                )}
                <Button variant="secondary" disabled={busy} className={current.status === 'called' ? '' : 'col-span-2'}
                  onClick={returnToQueue}>
                  ↩️ Devolver à fila
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Fila do consultório</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Pacientes com triagem concluída, por ordem de chegada à fila médica
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
                <span className="rounded-lg px-3 py-1 text-lg font-black text-white" style={{ backgroundColor: t.color }}>
                  {t.code}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {t.customer_name || <span className="text-slate-400">Sem nome</span>}
                    {t.return_count > 0 && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                        ↩ devolvido
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t.specialty_name || '—'}</div>
                </div>
                <span className="text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
                  aguardando
                  <span className="block text-xs text-amber-600 dark:text-amber-400">
                    {fmtDur(elapsedSec(t.forwarded_at, now))}
                  </span>
                </span>
                <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={busy || !roomId}
                  title={roomId ? 'Chamar este paciente' : 'Selecione o consultório primeiro'}
                  onClick={() => callSpecific(t)}>
                  ⏩ Chamar
                </Button>
              </div>
            ))}
            {queue.length === 0 && (
              <p className="py-10 text-center text-slate-400 dark:text-slate-500">Nenhum paciente na fila 🎉</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
