import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, requireAuth, parsePermissions } from '../auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Informe usuário e senha' });
    }
    const { rows } = await query(
      'SELECT * FROM users WHERE username = $1 AND active = TRUE',
      [username.trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    res.json({
      token: signToken(user),
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        permissions: parsePermissions(user.permissions),
        specialty_id: user.specialty_id || null,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
