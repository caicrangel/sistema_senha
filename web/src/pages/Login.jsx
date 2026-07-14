import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { api, saveSession, getToken } from '../lib/api.js';
import { Button, Input } from '../components/ui.jsx';

export default function Login() {
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
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-10 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-blue-600 text-3xl font-black text-white">
            S
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sistema de Senhas</h1>
          <p className="mt-1 text-sm text-slate-500">Acesso de atendentes e gestão</p>
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
