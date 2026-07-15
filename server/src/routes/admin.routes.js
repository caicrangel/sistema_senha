import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

export default function adminRoutes(io) {
  const router = Router();

  // ------- Tipos de atendimento -------
  // Leitura é pública: o totem precisa listar as opções sem login
  router.get('/service-types', async (req, res, next) => {
    try {
      const all = req.query.all === '1';
      const { rows } = await query(
        `SELECT * FROM service_types ${all ? '' : 'WHERE active = TRUE'} ORDER BY priority DESC, id`
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  router.post('/service-types', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { name, prefix, priority = 1, color = '#2563eb' } = req.body || {};
      if (!name?.trim() || !prefix?.trim()) {
        return res.status(400).json({ error: 'Nome e prefixo são obrigatórios' });
      }
      const { rows } = await query(
        `INSERT INTO service_types (name, prefix, priority, color)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name.trim(), prefix.trim().toUpperCase().slice(0, 3), priority, color]
      );
      io.emit('config:update');
      res.status(201).json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.put('/service-types/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { name, prefix, priority, color, active } = req.body || {};
      const { rows } = await query(
        `UPDATE service_types SET
           name = COALESCE($1, name),
           prefix = COALESCE($2, prefix),
           priority = COALESCE($3, priority),
           color = COALESCE($4, color),
           active = COALESCE($5, active)
         WHERE id = $6 RETURNING *`,
        [name?.trim(), prefix?.trim()?.toUpperCase()?.slice(0, 3), priority, color, active, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Tipo não encontrado' });
      io.emit('config:update');
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/service-types/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      await query('DELETE FROM service_types WHERE id = $1', [req.params.id]);
      io.emit('config:update');
      res.json({ ok: true });
    } catch (e) {
      if (e.code === '23503') {
        return res.status(400).json({
          error: 'Este tipo possui senhas no histórico e não pode ser excluído. Desative-o.',
        });
      }
      next(e);
    }
  });

  // ------- Guichês -------
  router.get('/counters', requireAuth, async (_req, res, next) => {
    try {
      const { rows } = await query('SELECT * FROM counters ORDER BY id');
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  router.post('/counters', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { name } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
      const { rows } = await query('INSERT INTO counters (name) VALUES ($1) RETURNING *', [name.trim()]);
      res.status(201).json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.put('/counters/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { name, active } = req.body || {};
      const { rows } = await query(
        `UPDATE counters SET name = COALESCE($1, name), active = COALESCE($2, active)
         WHERE id = $3 RETURNING *`,
        [name?.trim(), active, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Guichê não encontrado' });
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/counters/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      await query('DELETE FROM counters WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      if (e.code === '23503') {
        return res.status(400).json({
          error: 'Este guichê possui senhas no histórico e não pode ser excluído. Desative-o.',
        });
      }
      next(e);
    }
  });

  // ------- Usuários -------
  router.get('/users', requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const { rows } = await query(
        'SELECT id, name, username, role, active, created_at FROM users ORDER BY id'
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  router.post('/users', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { name, username, password, role = 'attendant' } = req.body || {};
      if (!name?.trim() || !username?.trim() || !password || password.length < 6) {
        return res.status(400).json({ error: 'Preencha nome, usuário e senha (mínimo 6 caracteres)' });
      }
      const hash = await bcrypt.hash(password, 10);
      const { rows } = await query(
        `INSERT INTO users (name, username, password_hash, role)
         VALUES ($1, $2, $3, $4) RETURNING id, name, username, role, active`,
        [name.trim(), username.trim().toLowerCase(), hash, role === 'admin' ? 'admin' : 'attendant']
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(400).json({ error: 'Nome de usuário já existe' });
      next(e);
    }
  });

  router.put('/users/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { name, password, role, active } = req.body || {};
      if (Number(req.params.id) === req.user.id && ((role && role !== 'admin') || active === false)) {
        return res.status(400).json({ error: 'Você não pode rebaixar ou desativar seu próprio usuário' });
      }
      let hash = null;
      if (password) {
        if (password.length < 6) return res.status(400).json({ error: 'Senha mínima de 6 caracteres' });
        hash = await bcrypt.hash(password, 10);
      }
      const { rows } = await query(
        `UPDATE users SET
           name = COALESCE($1, name),
           password_hash = COALESCE($2, password_hash),
           role = COALESCE($3, role),
           active = COALESCE($4, active)
         WHERE id = $5 RETURNING id, name, username, role, active`,
        [name?.trim(), hash, role, active, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/users/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      if (Number(req.params.id) === req.user.id) {
        return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário' });
      }
      await query('DELETE FROM users WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      if (e.code === '23503') {
        return res.status(400).json({
          error: 'Este usuário possui atendimentos no histórico e não pode ser excluído. Desative-o.',
        });
      }
      next(e);
    }
  });

  return router;
}
