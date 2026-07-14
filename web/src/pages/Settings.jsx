import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, PageTitle, Button, Input, Select } from '../components/ui.jsx';

const TABS = [
  ['types', 'Tipos de atendimento'],
  ['counters', 'Guichês'],
  ['users', 'Usuários'],
];

export default function Settings() {
  const [tab, setTab] = useState('types');

  return (
    <div>
      <PageTitle title="Configurações" subtitle="Modelos de atendimento, guichês e usuários" />
      <div className="mb-6 flex gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              tab === key ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'types' && <ServiceTypes />}
      {tab === 'counters' && <Counters />}
      {tab === 'users' && <Users />}
    </div>
  );
}

function useCrud(listPath) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const load = () => api(listPath).then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line
  return { items, error, setError, load };
}

function ServiceTypes() {
  const { items, error, setError, load } = useCrud('/admin/service-types?all=1');
  const [form, setForm] = useState({ name: '', prefix: '', priority: 1, color: '#2a78d6' });

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/service-types', { method: 'POST', body: form });
      setForm({ name: '', prefix: '', priority: 1, color: '#2a78d6' });
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  const toggle = async (t) => {
    await api(`/admin/service-types/${t.id}`, { method: 'PUT', body: { active: !t.active } });
    load();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">Novo tipo de atendimento</h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          <Input label="Nome" placeholder="Ex.: Exames" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Prefixo da senha (1–3 letras)" placeholder="Ex.: E" maxLength={3} value={form.prefix}
            onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })} required />
          <Input label="Prioridade (maior = chamado antes)" type="number" min={1} max={10} value={form.priority}
            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Cor</span>
            <input type="color" value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-10 w-full cursor-pointer rounded-xl border border-slate-300" />
          </label>
          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit">Criar tipo</Button>
        </form>
      </Card>

      <Card className="lg:col-span-2">
        <h2 className="mb-4 font-semibold text-slate-900">Tipos cadastrados</h2>
        <div className="flex flex-col divide-y divide-slate-100">
          {items.map((t) => (
            <div key={t.id} className="flex items-center gap-4 py-3">
              <span className="grid h-10 w-14 place-items-center rounded-lg font-black text-white"
                style={{ backgroundColor: t.color }}>
                {t.prefix}
              </span>
              <div className="flex-1">
                <div className={`font-medium ${t.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                  {t.name}
                </div>
                <div className="text-xs text-slate-500">Prioridade {t.priority}</div>
              </div>
              <Button variant={t.active ? 'secondary' : 'success'} onClick={() => toggle(t)}>
                {t.active ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Counters() {
  const { items, error, setError, load } = useCrud('/admin/counters');
  const [name, setName] = useState('');

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/counters', { method: 'POST', body: { name } });
      setName('');
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  const toggle = async (c) => {
    await api(`/admin/counters/${c.id}`, { method: 'PUT', body: { active: !c.active } });
    load();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">Novo guichê</h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          <Input label="Nome" placeholder="Ex.: Guichê 3" value={name}
            onChange={(e) => setName(e.target.value)} required />
          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit">Criar guichê</Button>
        </form>
      </Card>
      <Card className="lg:col-span-2">
        <h2 className="mb-4 font-semibold text-slate-900">Guichês cadastrados</h2>
        <div className="flex flex-col divide-y divide-slate-100">
          {items.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3">
              <span className={c.active ? 'font-medium text-slate-900' : 'text-slate-400 line-through'}>
                {c.name}
              </span>
              <Button variant={c.active ? 'secondary' : 'success'} onClick={() => toggle(c)}>
                {c.active ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Users() {
  const { items, error, setError, load } = useCrud('/admin/users');
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'attendant' });

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/users', { method: 'POST', body: form });
      setForm({ name: '', username: '', password: '', role: 'attendant' });
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  const toggle = async (u) => {
    await api(`/admin/users/${u.id}`, { method: 'PUT', body: { active: !u.active } });
    load();
  };

  const resetPassword = async (u) => {
    const pw = prompt(`Nova senha para ${u.name} (mínimo 6 caracteres):`);
    if (!pw) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'PUT', body: { password: pw } });
      alert('Senha alterada com sucesso');
    } catch (e2) {
      alert(e2.message);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">Novo usuário</h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          <Input label="Nome completo" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Usuário (login)" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <Input label="Senha" type="password" minLength={6} value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Select label="Perfil" value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="attendant">Atendente</option>
            <option value="admin">Superusuário</option>
          </Select>
          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit">Criar usuário</Button>
        </form>
      </Card>
      <Card className="lg:col-span-2">
        <h2 className="mb-4 font-semibold text-slate-900">Usuários cadastrados</h2>
        <div className="flex flex-col divide-y divide-slate-100">
          {items.map((u) => (
            <div key={u.id} className="flex items-center gap-4 py-3">
              <div className="flex-1">
                <div className={`font-medium ${u.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                  {u.name}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {u.role === 'admin' ? 'Superusuário' : 'Atendente'}
                  </span>
                </div>
                <div className="text-xs text-slate-500">@{u.username}</div>
              </div>
              <Button variant="secondary" onClick={() => resetPassword(u)}>Redefinir senha</Button>
              <Button variant={u.active ? 'secondary' : 'success'} onClick={() => toggle(u)}>
                {u.active ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
