import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { announceTicket } from '../lib/speech.js';

export default function Monitor() {
  const [state, setState] = useState({ current: null, lastCalls: [], waiting: [] });
  const [soundOn, setSoundOn] = useState(false);
  const [flash, setFlash] = useState(false);
  const [clock, setClock] = useState(new Date());
  const soundRef = useRef(false);
  soundRef.current = soundOn;

  useEffect(() => {
    const load = () => api('/tickets/panel', { auth: false }).then(setState).catch(() => {});
    load();

    const s = getSocket();
    const onCalled = (ticket) => {
      setFlash(true);
      setTimeout(() => setFlash(false), 4000);
      if (soundRef.current) announceTicket(ticket);
      load();
    };
    const onQueue = (panel) => setState(panel);
    s.on('ticket:called', onCalled);
    s.on('queue:update', onQueue);
    s.on('connect', load);

    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => {
      s.off('ticket:called', onCalled);
      s.off('queue:update', onQueue);
      s.off('connect', load);
      clearInterval(timer);
    };
  }, []);

  const cur = state.current;

  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      {/* Cabeçalho */}
      <header className="flex items-center justify-between border-b border-slate-800 px-10 py-5">
        <h1 className="text-3xl font-bold tracking-tight">Painel de Atendimento</h1>
        <div className="flex items-center gap-6">
          {!soundOn && (
            <button
              onClick={() => setSoundOn(true)}
              className="animate-pulse rounded-xl bg-amber-500 px-5 py-2.5 text-lg font-bold text-slate-900"
            >
              🔊 Toque para ativar o som
            </button>
          )}
          <span className="text-3xl font-semibold tabular-nums text-slate-300">
            {clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </header>

      <div className="flex flex-1 gap-8 overflow-hidden p-10">
        {/* Senha atual */}
        <section className="flex flex-[2] flex-col items-center justify-center">
          {cur ? (
            <div
              className={`flex w-full flex-col items-center rounded-[2.5rem] border-4 p-12 text-center transition-colors ${
                flash ? 'animate-call border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-900'
              }`}
            >
              <span
                className="mb-4 rounded-full px-6 py-2 text-2xl font-bold"
                style={{ backgroundColor: cur.color }}
              >
                {cur.service_name}
              </span>
              <span className="text-[11rem] font-black leading-none tracking-tight">
                {cur.code}
              </span>
              {cur.customer_name && (
                <span className="mt-4 max-w-full truncate text-5xl font-semibold text-slate-200">
                  {cur.customer_name}
                </span>
              )}
              <span className="mt-6 text-4xl font-bold text-amber-400">
                {cur.counter_name || 'Guichê'}
              </span>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center rounded-[2.5rem] border-4 border-slate-800 bg-slate-900 p-16 text-center">
              <span className="text-5xl font-bold text-slate-500">Aguardando chamadas…</span>
            </div>
          )}

          {/* Filas em espera */}
          <div className="mt-8 flex w-full justify-center gap-6">
            {state.waiting.map((w) => (
              <div key={w.id} className="flex items-center gap-3 rounded-2xl bg-slate-900 px-6 py-4">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: w.color }} />
                <span className="text-xl text-slate-300">{w.name}</span>
                <span className="text-2xl font-bold tabular-nums">{w.waiting}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Últimas chamadas */}
        <aside className="flex w-96 flex-col">
          <h2 className="mb-4 text-2xl font-bold text-slate-400">Últimas chamadas</h2>
          <div className="flex flex-col gap-3">
            {state.lastCalls.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-2xl bg-slate-900 px-6 py-4"
              >
                <div>
                  <span className="text-3xl font-black tabular-nums">{t.code}</span>
                  {t.customer_name && (
                    <span className="ml-3 max-w-[10rem] truncate text-lg text-slate-400">
                      {t.customer_name}
                    </span>
                  )}
                </div>
                <span className="text-xl font-semibold text-slate-300">{t.counter_name}</span>
              </div>
            ))}
            {state.lastCalls.length === 0 && (
              <p className="text-lg text-slate-600">Nenhuma chamada anterior</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
