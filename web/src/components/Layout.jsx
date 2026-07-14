import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getUser, clearSession } from '../lib/api.js';

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
    isActive
      ? 'bg-blue-600 text-white shadow-sm'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export default function Layout() {
  const user = getUser();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  return (
    <div className="flex h-full bg-slate-50">
      <aside className="w-64 shrink-0 flex flex-col border-r border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3 px-2 pb-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-lg font-bold text-white">
            S
          </div>
          <div>
            <div className="font-bold text-slate-900 leading-tight">Sistema de Senhas</div>
            <div className="text-xs text-slate-500">Clínica</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          <NavLink to="/atendimento" className={linkClass}>🎧 Atendimento</NavLink>
          <NavLink to="/senhas" className={linkClass}>🎫 Gestão de Senhas</NavLink>
          {isAdmin && <NavLink to="/dashboard" className={linkClass}>📊 Dashboard</NavLink>}
          {isAdmin && <NavLink to="/relatorios" className={linkClass}>📄 Relatórios</NavLink>}
          {isAdmin && <NavLink to="/configuracoes" className={linkClass}>⚙️ Configurações</NavLink>}
        </nav>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Telas públicas
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <a href="/totem" target="_blank" rel="noreferrer" className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              🖥️ Abrir Totem
            </a>
            <a href="/painel" target="_blank" rel="noreferrer" className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              📺 Abrir Painel TV
            </a>
          </div>
        </div>

        <div className="mt-auto border-t border-slate-200 pt-4">
          <div className="px-2 text-sm font-medium text-slate-900">{user?.name}</div>
          <div className="px-2 text-xs text-slate-500">
            {isAdmin ? 'Superusuário' : 'Atendente'}
          </div>
          <button
            onClick={logout}
            className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
