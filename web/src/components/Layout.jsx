import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getUser, clearSession, hasPerm } from '../lib/api.js';
import { useBranding, useInternalTheme } from '../lib/branding.jsx';

export default function Layout() {
  const user = getUser();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const { settings } = useBranding();
  const [theme, setTheme] = useInternalTheme();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('senha_menu') === 'min');

  const toggleMenu = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('senha_menu', next ? 'min' : 'full');
  };

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  // Com o domínio intranet configurado, os atalhos públicos usam a máscara (sem IP:porta)
  const base = (settings.app_domain || '').trim().replace(/\/+$/, '');
  const publicUrl = (path) => (base ? `${base}${path}` : path);

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
      collapsed ? 'justify-center' : ''
    } ${
      isActive
        ? 'bg-brand text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
    }`;

  // Perfil médico: só tem a permissão de médico (não usa Totem/Painel da recepção)
  const isDoctorProfile =
    !isAdmin && hasPerm('medico') && !hasPerm('atendimento') && !hasPerm('senhas');

  // [rota, ícone, rótulo, permissão] — Configurações é sempre exclusiva do superusuário
  const medicalOn = settings.flow_medical === '1';
  const links = [
    ['/atendimento', '🎧', 'Atendimento', 'atendimento'],
    ...(medicalOn ? [['/medico', '🩺', 'Consultório', 'medico']] : []),
    ['/senhas', '🎫', 'Gestão de Senhas', 'senhas'],
    ['/dashboard', '📊', 'Dashboard', 'dashboard'],
    ['/relatorios', '📄', 'Relatórios', 'relatorios'],
    ['/configuracoes', '⚙️', 'Configurações', 'admin'],
  ];

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-950">
      <aside
        className={`flex shrink-0 flex-col border-r border-slate-200 bg-white p-3 transition-all dark:border-slate-800 dark:bg-slate-900 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className={`flex items-center gap-3 px-1 pb-4 ${collapsed ? 'justify-center' : ''}`}>
          {settings.logo ? (
            <img src={settings.logo} alt="Logo" className="h-10 w-10 shrink-0 rounded-xl object-contain" />
          ) : (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-lg font-bold text-white">
              {(settings.company_name || 'S').charAt(0).toUpperCase()}
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate font-bold leading-tight text-slate-900 dark:text-white">
                {settings.company_name || 'Sistema de Senhas'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Sistema de Senhas</div>
            </div>
          )}
        </div>

        <button
          onClick={toggleMenu}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="mb-3 rounded-xl border border-slate-200 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {collapsed ? '»' : '« Recolher'}
        </button>

        <nav className="flex flex-col gap-1">
          {links.map(([to, icon, label, perm]) => {
            const allowed = perm === 'admin' ? isAdmin : hasPerm(perm);
            return !allowed ? null : (
              <NavLink key={to} to={to} className={linkClass} title={collapsed ? label : undefined}>
                <span className="text-lg leading-none">{icon}</span>
                {!collapsed && <span>{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Telas públicas (Totem/Painel) não fazem sentido para o perfil médico */}
        {!isDoctorProfile && (
          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            {!collapsed && (
              <div className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Telas públicas
              </div>
            )}
            <div className="mt-2 flex flex-col gap-1">
              <a href={publicUrl('/totem')} target="_blank" rel="noreferrer" title="Abrir Totem"
                className={`rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${collapsed ? 'text-center' : ''}`}>
                🖥️ {!collapsed && 'Abrir Totem'}
              </a>
              <a href={publicUrl('/painel')} target="_blank" rel="noreferrer" title="Abrir Painel TV"
                className={`rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${collapsed ? 'text-center' : ''}`}>
                📺 {!collapsed && 'Abrir Painel TV'}
              </a>
            </div>
          </div>
        )}

        <div className="mt-auto border-t border-slate-200 pt-3 dark:border-slate-800">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            className={`mb-2 w-full rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 ${collapsed ? '' : 'flex items-center justify-center gap-2'}`}
          >
            {theme === 'dark' ? '☀️' : '🌙'} {!collapsed && (theme === 'dark' ? 'Tema claro' : 'Tema escuro')}
          </button>
          {!collapsed && (
            <>
              <div className="px-2 text-sm font-medium text-slate-900 dark:text-white">{user?.name}</div>
              <div className="px-2 text-xs text-slate-500 dark:text-slate-400">
                {isAdmin ? 'Superusuário' : 'Atendente'}
              </div>
            </>
          )}
          <button
            onClick={logout}
            title="Sair"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {collapsed ? '⏻' : 'Sair'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
