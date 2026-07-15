import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev_secret';

// Telas que podem ser liberadas por usuário (Configurações é sempre só do superusuário)
export const PERMISSIONS = ['atendimento', 'senhas', 'dashboard', 'relatorios'];

export function parsePermissions(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter((p) => PERMISSIONS.includes(p)) : [];
  } catch {
    return [];
  }
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      permissions: parsePermissions(user.permissions),
    },
    SECRET,
    { expiresIn: '12h' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão expirada, faça login novamente' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito ao superusuário' });
  }
  next();
}

// Exige superusuário OU uma das permissões listadas
export function requirePerm(...perms) {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    const mine = req.user?.permissions || [];
    if (perms.some((p) => mine.includes(p))) return next();
    return res.status(403).json({ error: 'Você não tem permissão para acessar esta área' });
  };
}
