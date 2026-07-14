import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';

export default function Totem() {
  const [types, setTypes] = useState([]);
  const [issued, setIssued] = useState(null);
  const [askName, setAskName] = useState(null); // tipo selecionado aguardando nome
  const [name, setName] = useState('');
  const [error, setError] = useState('');

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

  if (issued) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-900 p-8 text-center">
        <p className="text-3xl font-medium text-slate-300">Sua senha é</p>
        <p className="my-8 text-[9rem] font-black leading-none text-white" style={{ color: issued.color }}>
          {issued.code}
        </p>
        <p className="text-2xl text-slate-300">{issued.service_name}</p>
        {issued.customer_name && <p className="mt-2 text-xl text-slate-400">{issued.customer_name}</p>}
        <p className="mt-10 text-lg text-slate-500">Aguarde ser chamado no painel</p>
        <button
          onClick={() => setIssued(null)}
          className="mt-8 rounded-2xl bg-slate-700 px-10 py-4 text-xl font-semibold text-white active:bg-slate-600"
        >
          OK
        </button>
      </div>
    );
  }

  if (askName) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-900 p-8">
        <p className="mb-2 text-3xl font-bold text-white">{askName.name}</p>
        <p className="mb-8 text-xl text-slate-400">Digite seu nome (opcional)</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
          className="w-full max-w-xl rounded-2xl border-2 border-slate-600 bg-slate-800 px-6 py-5 text-center text-3xl text-white outline-none focus:border-blue-500"
        />
        <div className="mt-8 flex gap-4">
          <button
            onClick={() => { setAskName(null); setName(''); }}
            className="rounded-2xl bg-slate-700 px-10 py-5 text-2xl font-semibold text-white active:bg-slate-600"
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
    <div className="flex h-full flex-col items-center justify-center bg-slate-900 p-8">
      <h1 className="mb-3 text-5xl font-black text-white">Bem-vindo!</h1>
      <p className="mb-12 text-2xl text-slate-400">Toque no tipo de atendimento desejado</p>
      {error && (
        <p className="mb-6 rounded-xl bg-red-500/20 px-6 py-3 text-xl text-red-300">{error}</p>
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
        <p className="text-xl text-slate-500">Nenhum tipo de atendimento configurado</p>
      )}
    </div>
  );
}
