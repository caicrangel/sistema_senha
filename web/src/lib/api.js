const TOKEN_KEY = 'senha_token';
const USER_KEY = 'senha_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};
export const saveSession = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};
export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

// Superusuário acessa tudo; demais dependem das permissões por tela
export const hasPerm = (perm) => {
  const u = getUser();
  if (!u) return false;
  if (u.role === 'admin') return true;
  return (u.permissions || []).includes(perm);
};

// Primeira tela que o usuário pode acessar após o login
export const homeScreen = (u) => {
  if (!u) return '/login';
  if (u.role === 'admin') return '/dashboard';
  const p = u.permissions || [];
  if (p.includes('atendimento')) return '/atendimento';
  if (p.includes('senhas')) return '/senhas';
  if (p.includes('dashboard')) return '/dashboard';
  if (p.includes('relatorios')) return '/relatorios';
  return '/login';
};

// Baixa um arquivo autenticado (CSV, PDF, Excel, backup)
export async function downloadFile(path, filename) {
  const res = await fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Erro ao gerar o arquivo');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && auth && getToken()) {
    clearSession();
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}
