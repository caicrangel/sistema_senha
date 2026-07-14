import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { useBranding, usePublicTheme } from '../lib/branding.jsx';

export default function Totem() {
  const [types, setTypes] = useState([]);
  const [issued, setIssued] = useState(null);
  const [askName, setAskName] = useState(null); // tipo selecionado aguardando nome
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const { settings } = useBranding();
  const dark = usePublicTheme(settings.totem_theme);

  const bg = dark ? 'bg-slate-900' : 'bg-slate-100';
  const title = dark ? 'text-white' : 'text-slate-900';
  const subtle = dark ? 'text-slate-400' : 'text-slate-500';

  const loadTypes = () =>
    api('/admin/service-types', { auth: false }).then(setTypes).catch(() => {});

  useEffect(() => {
    loadTypes();
    const s = getSocket();
    s.on('config:update', loadTypes);
    return () => s.off('config:update', loadTypes);
  }, []);

  const issue = async (type, customerName) => {
    try {
      setError('');
      const t = await api('/tickets', {
        method: 'POST',
        auth: false,
        body: { service_type_id: type.id, customer_name: customerName },
      });
      setIssued({ ...t, color: type.color, service_name: type.name });
      setAskName(null);
      setName('');
      setTimeout(() => setIssued(null), 8000);
    } catch (e) {
      setError(e.message);
    }
  };

  const Logo = () =>
    settings.logo ? (
      <img src={settings.logo} alt="Logo" className="mb-6 h-20 object-contain" />
    ) : null;

  if (issued) {
    return (
      <div className={`flex h-full flex-col items-center justify-center p-8 text-center ${bg}`}>
        <Logo />
        <p className={`text-3xl font-medium ${subtle}`}>Sua senha é</p>
        <p className="my-8 text-[9rem] font-black leading-none" style={{ color: issued.color }}>
          {issued.code}
        </p>
        <p className={`text-2xl ${title}`}>{issued.service_name}</p>
        {issued.customer_name && <p className={`mt-2 text-xl ${subtle}`}>{issued.customer_name}</p>}
        <p className={`mt-10 text-lg ${subtle}`}>Aguarde ser chamado no painel</p>
        <button
          onClick={() => setIssued(null)}
          className={`mt-8 rounded-2xl px-10 py-4 text-xl font-semibold ${dark ? 'bg-slate-700 text-white active:bg-slate-600' : 'bg-white text-slate-800 shadow active:bg-slate-200'}`}
        >
          OK
        </button>
      </div>
    );
  }

  if (askName) {
    return (
      <div className={`flex h-full flex-col items-center justify-center p-8 ${bg}`}>
        <Logo />
        <p className={`mb-2 text-3xl font-bold ${title}`}>{askName.name}</p>
        <p className={`mb-8 text-xl ${subtle}`}>Digite seu nome (opcional)</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
          className={`w-full max-w-xl rounded-2xl border-2 px-6 py-5 text-center text-3xl outline-none focus:border-brand ${
            dark ? 'border-slate-600 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-900'
          }`}
        />
        <div className="mt-8 flex gap-4">
          <button
            onClick={() => { setAskName(null); setName(''); }}
            className={`rounded-2xl px-10 py-5 text-2xl font-semibold ${dark ? 'bg-slate-700 text-white active:bg-slate-600' : 'bg-white text-slate-800 shadow active:bg-slate-200'}`}
          >
            Voltar
          </button>
          <button
            onClick={() => issue(askName, name.trim() || null)}
            className="rounded-2xl px-14 py-5 text-2xl font-bold text-white active:brightness-110"
            style={{ backgroundColor: askName.color }}
          >
            Retirar senha
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col items-center justify-center p-8 ${bg}`}>
      <Logo />
      <h1 className={`mb-3 text-5xl font-black ${title}`}>Bem-vindo!</h1>
      <p className={`mb-12 text-2xl ${subtle}`}>Toque no tipo de atendimento desejado</p>
      {error && (
        <p className="mb-6 rounded-xl bg-red-500/20 px-6 py-3 text-xl text-red-500">{error}</p>
      )}
      <div className="grid w-full max-w-3xl gap-6">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => setAskName(t)}
            className="rounded-3xl px-8 py-10 text-4xl font-bold text-white shadow-lg transition-transform active:scale-95"
            style={{ backgroundColor: t.color }}
          >
            {t.name}
          </button>
        ))}
      </div>
      {types.length === 0 && (
        <p className={`text-xl ${subtle}`}>Nenhum tipo de atendimento configurado</p>
      )}
    </div>
  );
}
