/**
 * Co-Caisse — Routes admin (server client)
 * Version : 2.1.0
 *
 * Ce serveur est hébergé chez le CLIENT — il ne génère PAS de licences.
 * La génération est exclusivement dans co-caisse-admin (PC développeur).
 *
 * Routes PUBLIC (sans JWT) :
 *   POST /api/admin/auth/login       → auth admin locale (mot de passe env)
 *
 * Routes PROTÉGÉES JWT + rôle admin :
 *   GET  /api/admin/licences                  → liste la licence locale
 *   GET  /api/admin/licences/modules          → catalogue modules disponibles
 *   GET  /api/admin/licences/:id/events       → historique événements
 *   PUT  /api/admin/licences/:id/suspend      → suspend la licence locale
 *   PUT  /api/admin/licences/:id/reactivate   → réactive la licence locale
 *   PUT  /api/admin/licences/:id/extend       → étend l'expiration
 *   PUT  /api/admin/licences/:id/modules      → met à jour les modules
 */

import express from 'express';
import jwt     from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, roleCheck }              from '../middleware/auth.js';
import { generateLicenceKey, isExpired, AVAILABLE_MODULES } from '../services/licence.service.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════
// AUTH — route PUBLIQUE
// POST /api/admin/auth/login   Body : { password }
// ════════════════════════════════════════════════════════════
router.post('/auth/login', (req, res) => {
  const { password } = req.body || {};
  const expected     = process.env.ADMIN_PASSWORD;

  if (!expected) return res.status(500).json({ error: 'ADMIN_PASSWORD non configuré dans .env' });
  if (!password || password !== expected) return res.status(401).json({ error: 'Mot de passe incorrect' });

  const token = jwt.sign(
    { userId: 'admin-tool', role: 'admin' },
    process.env.JWT_SECRET || 'fallback',
    { expiresIn: '24h' }
  );
  console.log('[admin/auth] Connexion co-caisse-admin OK');
  res.json({ token, expiresIn: '24h' });
});

// ════════════════════════════════════════════════════════════
// Toutes les routes suivantes : JWT + rôle admin obligatoire
// ════════════════════════════════════════════════════════════
router.use(authMiddleware, roleCheck(['admin']));

// ── GET /licences/modules (AVANT /:id pour éviter conflit) ───────────────────
router.get('/licences/modules', (_req, res) => {
  const catalog = {
    caisse:       { label: 'Caisse',       icon: '🛒', desc: 'Module de base — encaissement, panier, tickets' },
    cuisine:      { label: 'Cuisine',      icon: '🍳', desc: 'Affichage commandes en cuisine, statuts' },
    commandes:    { label: 'Commandes',    icon: '📋', desc: 'Gestion commandes en salle, suivi statuts' },
    historique:   { label: 'Historique',   icon: '📜', desc: 'Historique des transactions, export CSV/JSON' },
    statistiques: { label: 'Statistiques', icon: '📊', desc: 'Rapports de ventes, analytics' },
    gestion:      { label: 'Gestion',      icon: '📦', desc: 'Produits, categories, utilisateurs, parametres' },
  };
  res.json({ modules: AVAILABLE_MODULES, catalog });
});

// ── GET /licences ─────────────────────────────────────────────────────────────
router.get('/licences', async (req, res) => {
  try {
    const db       = req.app.locals.db;
    const licences = await db.all(`
      SELECT l.*,
        (SELECT COUNT(*) FROM licence_events le WHERE le.licence_id = l.id) AS event_count
      FROM licences l ORDER BY l.created_at DESC
    `);

    const enriched = licences.map(lic => {
      const modules       = typeof lic.modules === 'string' ? JSON.parse(lic.modules) : lic.modules;
      const expired       = isExpired(lic);
      const expiry        = lic.expires_at || lic.trial_end;
      const daysRemaining = expiry ? Math.max(0, Math.ceil((new Date(expiry) - Date.now()) / 86400000)) : null;
      return { ...lic, modules, computed_status: expired ? 'expired' : lic.status, days_remaining: daysRemaining, is_expired: expired };
    });

    res.json({ licences: enriched, total: enriched.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /licences/:id/suspend ─────────────────────────────────────────────────
router.put('/licences/:id/suspend', async (req, res) => {
  try {
    const db      = req.app.locals.db;
    const licence = await db.get('SELECT * FROM licences WHERE id = ?', [req.params.id]);
    if (!licence) return res.status(404).json({ error: 'Licence introuvable' });
    if (licence.status === 'suspended') return res.status(409).json({ error: 'Deja suspendue' });

    await db.run("UPDATE licences SET status = 'suspended' WHERE id = ?", [req.params.id]);
    await db.run('INSERT INTO licence_events (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
      [uuidv4(), req.params.id, 'suspended', JSON.stringify({ suspended_by: req.userId, reason: req.body.reason || null })]);

    res.json({ success: true, message: `Licence de "${licence.client_name}" suspendue` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /licences/:id/reactivate ──────────────────────────────────────────────
router.put('/licences/:id/reactivate', async (req, res) => {
  try {
    const db      = req.app.locals.db;
    const licence = await db.get('SELECT * FROM licences WHERE id = ?', [req.params.id]);
    if (!licence) return res.status(404).json({ error: 'Licence introuvable' });
    if (isExpired(licence)) return res.status(400).json({ error: 'Impossible de reactiver une licence expiree' });

    await db.run("UPDATE licences SET status = 'active' WHERE id = ?", [req.params.id]);
    await db.run('INSERT INTO licence_events (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
      [uuidv4(), req.params.id, 'reactivated', JSON.stringify({ reactivated_by: req.userId })]);

    res.json({ success: true, message: `Licence de "${licence.client_name}" reactivee` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /licences/:id/extend ──────────────────────────────────────────────────
router.put('/licences/:id/extend', async (req, res) => {
  try {
    const db            = req.app.locals.db;
    const { expiresAt } = req.body;
    if (!expiresAt) return res.status(400).json({ error: 'expiresAt requis (YYYY-MM-DD)' });

    const licence = await db.get('SELECT * FROM licences WHERE id = ?', [req.params.id]);
    if (!licence) return res.status(404).json({ error: 'Licence introuvable' });

    await db.run("UPDATE licences SET expires_at = ?, status = 'active' WHERE id = ?",
      [new Date(expiresAt).toISOString(), req.params.id]);
    await db.run('INSERT INTO licence_events (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
      [uuidv4(), req.params.id, 'extended', JSON.stringify({ extended_by: req.userId, from: licence.expires_at, to: expiresAt })]);

    res.json({ success: true, message: `Expiration mise a jour au ${expiresAt}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /licences/:id/modules ─────────────────────────────────────────────────
router.put('/licences/:id/modules', async (req, res) => {
  try {
    const db          = req.app.locals.db;
    const { modules } = req.body;
    if (!Array.isArray(modules) || !modules.length) return res.status(400).json({ error: 'modules[] requis' });

    const licence = await db.get('SELECT * FROM licences WHERE id = ?', [req.params.id]);
    if (!licence) return res.status(404).json({ error: 'Licence introuvable' });

    const normalized = [...new Set(['caisse', ...modules])].sort();
    const newKey     = generateLicenceKey(licence.client_name, normalized, licence.type);

    await db.run('UPDATE licences SET modules = ?, licence_key = ? WHERE id = ?',
      [JSON.stringify(normalized), newKey, req.params.id]);
    await db.run('INSERT INTO licence_events (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
      [uuidv4(), req.params.id, 'modules_updated', JSON.stringify({ updated_by: req.userId, modules: normalized, new_key: newKey })]);

    res.json({ success: true, licence_key: newKey, modules: normalized });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /licences/:id/events ──────────────────────────────────────────────────
router.get('/licences/:id/events', async (req, res) => {
  try {
    const db      = req.app.locals.db;
    const licence = await db.get('SELECT id, client_name, licence_key, type, status FROM licences WHERE id = ?', [req.params.id]);
    if (!licence) return res.status(404).json({ error: 'Licence introuvable' });

    const events = await db.all(
      'SELECT id, event_type, metadata, created_at FROM licence_events WHERE licence_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    const parsed = events.map(e => ({ ...e, metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata || 'null') : e.metadata }));

    res.json({ licence, events: parsed, total: parsed.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;

