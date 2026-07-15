import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const SETTING_KEYS = [
  'company_name', 'brand_color', 'logo',
  'totem_theme',
  'panel_theme', 'panel_sound', 'panel_last_calls',
];

export default function settingsRoutes(io) {
  const router = Router();

  // Público: login, totem e painel precisam da identidade visual
  router.get('/settings', async (_req, res, next) => {
    try {
      const { rows } = await query('SELECT key, value FROM settings');
      res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
    } catch (e) {
      next(e);
    }
  });

  router.put('/admin/settings', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const entries = Object.entries(req.body || {}).filter(([k]) => SETTING_KEYS.includes(k));
      if (entries.some(([k, v]) => k === 'logo' && typeof v === 'string' && v.length > 2_000_000)) {
        return res.status(400).json({ error: 'Logo muito grande (máximo ~1,5 MB)' });
      }
      for (const [key, value] of entries) {
        await query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, String(value ?? '')]
        );
      }
      const { rows } = await query('SELECT key, value FROM settings');
      const all = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      io.emit('settings:update', all);
      res.json(all);
    } catch (e) {
      next(e);
    }
  });

  // ------- Propagandas -------
  router.get('/ads/active', async (_req, res, next) => {
    try {
      const { rows } = await query(
        'SELECT id, title, image, duration_sec FROM ads WHERE active = TRUE ORDER BY sort_order, id'
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  router.get('/admin/ads', requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const { rows } = await query('SELECT * FROM ads ORDER BY sort_order, id');
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  router.post('/admin/ads', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { title, image, duration_sec = 10, sort_order = 0 } = req.body || {};
      if (!title?.trim() || !image) {
        return res.status(400).json({ error: 'Título e imagem são obrigatórios' });
      }
      if (image.length > 4_000_000) {
        return res.status(400).json({ error: 'Imagem muito grande (máximo ~3 MB)' });
      }
      const { rows } = await query(
        `INSERT INTO ads (title, image, duration_sec, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [title.trim(), image, Math.max(3, Math.min(120, duration_sec)), sort_order]
      );
      io.emit('ads:update');
      res.status(201).json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.put('/admin/ads/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { title, duration_sec, sort_order, active } = req.body || {};
      const { rows } = await query(
        `UPDATE ads SET
           title = COALESCE($1, title),
           duration_sec = COALESCE($2, duration_sec),
           sort_order = COALESCE($3, sort_order),
           active = COALESCE($4, active)
         WHERE id = $5 RETURNING *`,
        [title?.trim(), duration_sec, sort_order, active, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Propaganda não encontrada' });
      io.emit('ads:update');
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/admin/ads/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      await query('DELETE FROM ads WHERE id = $1', [req.params.id]);
      io.emit('ads:update');
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
