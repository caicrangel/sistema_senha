import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { api, saveSession, getToken } from '../lib/api.js';
import { Button, Input } from '../components/ui.jsx';
import { useBranding } from '../lib/branding.jsx';

export default function Login() {
  const { settings } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  if (getToken()) return <Navigate to="/atendimento" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { token, user } = await api('/auth/login', {
        method: 'POST',
        auth: false,
        body: { username, password },
      });
      saveSession(token, user);
      navigate(user.role === 'admin' ? '/dashboard' : '/atendimento');
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex h-full items-center justify-center p-4"
      style={{ background: `linear-gradient(135deg, var(--brand, #2563eb), var(--brand-dark, #1d4ed8), #0f172a)` }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-10 shadow-2xl dark:bg-slate-900">
        <div className="mb-8 text-center">
          {settings.logo ? (
            <img src={settings.logo} alt="Logo" className="mx-auto mb-4 h-16 object-contain" />
          ) : (
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand text-3xl font-black text-white">
              {(settings.company_name || 'S').charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {settings.company_name || 'Sistema de Senhas'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Acesso de atendentes e gestão</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label="Usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
          )}
          <Button type="submit" disabled={loading} className="mt-2 py-3">
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
