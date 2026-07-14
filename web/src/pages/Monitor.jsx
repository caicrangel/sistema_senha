import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { announceTicket } from '../lib/speech.js';
import { useBranding, usePublicTheme } from '../lib/branding.jsx';

function AdsCarousel({ ads, dark }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (ads.length === 0) return;
    const cur = ads[idx % ads.length];
    const t = setTimeout(() => setIdx((i) => (i + 1) % ads.length), (cur?.duration_sec || 10) * 1000);
    return () => clearTimeout(t);
  }, [idx, ads]);

  useEffect(() => setIdx(0), [ads]);

  if (ads.length === 0) return null;
  const ad = ads[idx % ads.length];

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-3xl ${dark ? 'bg-slate-900' : 'bg-white shadow'}`}>
      <img key={ad.id} src={ad.image} alt={ad.title} className="animate-ad h-full w-full object-contain" />
    </div>
  );
}

export default function Monitor() {
  const [state, setState] = useState({ current: null, lastCalls: [], waiting: [] });
  const [ads, setAds] = useState([]);
  const [soundOn, setSoundOn] = useState(false);
  const [flash, setFlash] = useState(false);
  const [clock, setClock] = useState(new Date());
  const soundRef = useRef(false);
  soundRef.current = soundOn;

  const { settings } = useBranding();
  const dark = usePublicTheme(settings.panel_theme);

  useEffect(() => {
    const load = () => api('/tickets/panel', { auth: false }).then(setState).catch(() => {});
    const loadAds = () => api('/ads/active', { auth: false }).then(setAds).catch(() => {});
    load();
    loadAds();

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
    s.on('ads:update', loadAds);
    s.on('connect', load);

    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => {
      s.off('ticket:called', onCalled);
      s.off('queue:update', onQueue);
      s.off('ads:update', loadAds);
      s.off('connect', load);
      clearInterval(timer);
    };
  }, []);

  const cur = state.current;
  const bg = dark ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900';
  const cardBg = dark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow';
  const subtle = dark ? 'text-slate-400' : 'text-slate-500';
  const hasAds = ads.length > 0;

  return (
    <div className={`flex h-full flex-col ${bg}`}>
      {/* Cabeçalho */}
      <header className={`flex items-center justify-between border-b px-10 py-4 ${dark ? 'border-slate-800' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-center gap-4">
          {settings.logo && <img src={settings.logo} alt="Logo" className="h-12 object-contain" />}
          <h1 className="text-3xl font-bold tracking-tight">{settings.company_name || 'Painel de Atendimento'}</h1>
        </div>
        <div className="flex items-center gap-6">
          {!soundOn && (
            <button
              onClick={() => setSoundOn(true)}
              className="animate-pulse rounded-xl bg-amber-500 px-5 py-2.5 text-lg font-bold text-slate-900"
            >
              🔊 Toque para ativar o som
            </button>
          )}
          <span className={`text-3xl font-semibold tabular-nums ${subtle}`}>
            {clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </header>

      <div className="flex flex-1 gap-6 overflow-hidden p-8">
        {/* Coluna principal: senha atual + filas + últimas chamadas */}
        <section className={`flex flex-col ${hasAds ? 'w-[46%]' : 'flex-[2]'}`}>
          {cur ? (
            <div
              className={`flex w-full flex-col items-center rounded-[2rem] border-4 p-10 text-center transition-colors ${
                flash ? 'animate-call border-amber-400 bg-amber-400/10' : cardBg
              }`}
            >
              <span
                className="mb-4 rounded-full px-6 py-2 text-2xl font-bold text-white"
                style={{ backgroundColor: cur.color }}
              >
                {cur.service_name}
              </span>
              <span className={`font-black leading-none tracking-tight ${hasAds ? 'text-[8rem]' : 'text-[11rem]'}`}>
                {cur.code}
              </span>
              {cur.customer_name && (
                <span className={`mt-3 max-w-full truncate font-semibold ${hasAds ? 'text-4xl' : 'text-5xl'}`}>
                  {cur.customer_name}
                </span>
              )}
              <span className="mt-4 text-4xl font-bold text-amber-500">
                {cur.counter_name || 'Guichê'}
              </span>
            </div>
          ) : (
            <div className={`flex w-full flex-col items-center rounded-[2rem] border-4 p-14 text-center ${cardBg}`}>
              <span className={`text-4xl font-bold ${subtle}`}>Aguardando chamadas…</span>
            </div>
          )}

          {/* Filas em espera */}
          <div className="mt-6 flex w-full flex-wrap justify-center gap-4">
            {state.waiting.map((w) => (
              <div key={w.id} className={`flex items-center gap-3 rounded-2xl px-5 py-3 ${dark ? 'bg-slate-900' : 'bg-white shadow'}`}>
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: w.color }} />
                <span className={`text-lg ${subtle}`}>{w.name}</span>
                <span className="text-2xl font-bold tabular-nums">{w.waiting}</span>
              </div>
            ))}
          </div>

          {/* Últimas chamadas */}
          <h2 className={`mb-3 mt-6 text-xl font-bold ${subtle}`}>Últimas chamadas</h2>
          <div className="flex flex-col gap-2 overflow-hidden">
            {state.lastCalls.slice(0, 4).map((t) => (
              <div key={t.id} className={`flex items-center justify-between rounded-2xl px-5 py-3 ${dark ? 'bg-slate-900' : 'bg-white shadow'}`}>
                <div className="flex items-baseline gap-3 overflow-hidden">
                  <span className="text-2xl font-black tabular-nums">{t.code}</span>
                  {t.customer_name && (
                    <span className={`truncate text-lg ${subtle}`}>{t.customer_name}</span>
                  )}
                </div>
                <span className="shrink-0 text-lg font-semibold">{t.counter_name}</span>
              </div>
            ))}
            {state.lastCalls.length === 0 && (
              <p className={`text-base ${dark ? 'text-slate-600' : 'text-slate-400'}`}>Nenhuma chamada anterior</p>
            )}
          </div>
        </section>

        {/* Espaço de propagandas */}
        {hasAds && (
          <aside className="flex-1">
            <AdsCarousel ads={ads} dark={dark} />
          </aside>
        )}

        {/* Sem propaganda: mantém a coluna de últimas chamadas maior à direita */}
        {!hasAds && <div className="hidden" />}
      </div>
    </div>
  );
}
