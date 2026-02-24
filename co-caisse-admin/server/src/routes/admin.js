/**
 * Co-Caisse Admin — Routes licences + auth
 */

import express        from 'express';
import jwt            from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { authMiddleware }                            from '../middleware/auth.js';
import { generateLicenceKey, isExpired, AVAILABLE_MODULES } from '../services/licence.service.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// ══════════════════════════════════════════════════════
// AUTH — POST /api/auth/login  (publique)
// Body : { password }
// ══════════════════════════════════════════════════════
router.post('/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const token = jwt.sign(
    { userId: 'admin-tool', role: 'admin' },
    process.env.JWT_SECRET || 'admin_jwt_fallback',
    { expiresIn: '24h' }
  );
  console.log('[admin] Connexion OK');
  res.json({ token, expiresIn: '24h' });
});

// Toutes les routes suivantes requièrent le JWT
router.use(authMiddleware);

// ── GET /licences/modules ─────────────────────────────
router.get('/licences/modules', (_req, res) => {
  const catalog = {
    caisse:       { label: 'Caisse',       icon: '🛒', desc: 'Encaissement, panier, tickets' },
    cuisine:      { label: 'Cuisine',      icon: '🍳', desc: 'Affichage commandes en cuisine' },
    commandes:    { label: 'Commandes',    icon: '📋', desc: 'Gestion commandes en salle' },
    historique:   { label: 'Historique',   icon: '📜', desc: 'Historique des transactions' },
    statistiques: { label: 'Statistiques', icon: '📊', desc: 'Rapports de ventes, analytics' },
    gestion:      { label: 'Gestion',      icon: '📦', desc: 'Produits, catégories, utilisateurs' },
  };
  res.json({ modules: AVAILABLE_MODULES, catalog });
});

// ── GET /licences ─────────────────────────────────────
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /licences/generate ───────────────────────────
router.post('/licences/generate', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { clientName, clientEmail, modules = ['caisse'], type = 'perpetual', expiresAt = null, notes = null } = req.body;

    if (!clientName?.trim())  return res.status(400).json({ error: 'clientName requis' });
    if (!clientEmail?.trim()) return res.status(400).json({ error: 'clientEmail requis' });
    const invalid = modules.filter(m => !AVAILABLE_MODULES.includes(m));
    if (invalid.length) return res.status(400).json({ error: `Modules invalides : ${invalid.join(', ')}` });

    const mods        = [...new Set(['caisse', ...modules])].sort();
    const key         = generateLicenceKey(clientName, mods, type);
    const id          = uuid();
    let trialStart    = null, trialEnd = null, finalExpiry = expiresAt || null;

    if (type === 'trial') {
      trialStart  = new Date();
      trialEnd    = new Date(Date.now() + 7 * 86400000);
      finalExpiry = trialEnd;
    }

    await db.run(
      `INSERT INTO licences (id, client_name, client_email, licence_key, type, status, modules, trial_start, trial_end, expires_at, notes)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      [id, clientName.trim(), clientEmail.trim(), key, type, JSON.stringify(mods), trialStart, trialEnd, finalExpiry, notes]
    );
    await db.run(
      'INSERT INTO licence_events (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
      [uuid(), id, 'generated', JSON.stringify({ modules: mods, type })]
    );

    // Tentative envoi email (non bloquant)
    try {
      const { sendLicenceEmail } = await import('../services/email.service.js');
      await sendLicenceEmail({ to: clientEmail.trim(), clientName: clientName.trim(), licenceKey: key, modules: mods, type, expiresAt: finalExpiry });
    } catch (emailErr) {
      console.warn('[generate] Email service indisponible :', emailErr.message);
    }

    const licence = await db.get('SELECT * FROM licences WHERE id = ?', [id]);
    res.status(201).json({ success: true, licence_key: key, licence: { ...licence, modules: mods } });
  } catch (e) {
    console.error('[generate]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /licences/:id/suspend ─────────────────────────
router.put('/licences/:id/suspend', async (req, res) => {
  try {
    const db      = req.app.locals.db;
    const licence = await db.get('SELECT * FROM licences WHERE id = ?', [req.params.id]);
    if (!licence) return res.status(404).json({ error: 'Licence introuvable' });
    await db.run("UPDATE licences SET status = 'suspended' WHERE id = ?", [req.params.id]);
    await db.run('INSERT INTO licence_events (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
      [uuid(), req.params.id, 'suspended', JSON.stringify({ reason: req.body.reason || null })]);
    res.json({ success: true, message: `Licence de "${licence.client_name}" suspendue` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /licences/:id/reactivate ──────────────────────
router.put('/licences/:id/reactivate', async (req, res) => {
  try {
    const db      = req.app.locals.db;
    const licence = await db.get('SELECT * FROM licences WHERE id = ?', [req.params.id]);
    if (!licence)        return res.status(404).json({ error: 'Licence introuvable' });
    if (isExpired(licence)) return res.status(400).json({ error: 'Impossible de réactiver une licence expirée' });
    await db.run("UPDATE licences SET status = 'active' WHERE id = ?", [req.params.id]);
    await db.run('INSERT INTO licence_events (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
      [uuid(), req.params.id, 'reactivated', null]);
    res.json({ success: true, message: `Licence de "${licence.client_name}" réactivée` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /licences/:id/extend ──────────────────────────
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
      [uuid(), req.params.id, 'extended', JSON.stringify({ from: licence.expires_at, to: expiresAt })]);
    res.json({ success: true, message: `Expiration mise à jour au ${expiresAt}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /licences/:id/modules ─────────────────────────
router.put('/licences/:id/modules', async (req, res) => {
  try {
    const db          = req.app.locals.db;
    const { modules } = req.body;
    if (!Array.isArray(modules) || !modules.length) return res.status(400).json({ error: 'modules[] requis' });
    const licence    = await db.get('SELECT * FROM licences WHERE id = ?', [req.params.id]);
    if (!licence) return res.status(404).json({ error: 'Licence introuvable' });
    const normalized = [...new Set(['caisse', ...modules])].sort();
    const newKey     = generateLicenceKey(licence.client_name, normalized, licence.type);
    await db.run('UPDATE licences SET modules = ?, licence_key = ? WHERE id = ?',
      [JSON.stringify(normalized), newKey, req.params.id]);
    await db.run('INSERT INTO licence_events (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
      [uuid(), req.params.id, 'modules_updated', JSON.stringify({ modules: normalized, new_key: newKey })]);
    res.json({ success: true, licence_key: newKey, modules: normalized });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /licences/:id/resend ─────────────────────────
router.post('/licences/:id/resend', async (req, res) => {
  try {
    const db      = req.app.locals.db;
    const licence = await db.get('SELECT * FROM licences WHERE id = ?', [req.params.id]);
    if (!licence)              return res.status(404).json({ error: 'Licence introuvable' });
    if (!licence.client_email) return res.status(400).json({ error: 'Aucun email client' });
    const modules = typeof licence.modules === 'string' ? JSON.parse(licence.modules) : licence.modules;
    try {
      const { sendLicenceEmail } = await import('../services/email.service.js');
      await sendLicenceEmail({ to: licence.client_email, clientName: licence.client_name, licenceKey: licence.licence_key, modules, type: licence.type, expiresAt: licence.expires_at });
    } catch (emailErr) { console.warn('[resend] Email service indisponible :', emailErr.message); }
    await db.run('INSERT INTO licence_events (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
      [uuid(), req.params.id, 'resent', JSON.stringify({ to: licence.client_email })]);
    res.json({ success: true, message: `Email renvoyé à ${licence.client_email}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /licences/:id/events ──────────────────────────
router.get('/licences/:id/events', async (req, res) => {
  try {
    const db      = req.app.locals.db;
    const licence = await db.get('SELECT id, client_name, client_email, licence_key, type, status FROM licences WHERE id = ?', [req.params.id]);
    if (!licence) return res.status(404).json({ error: 'Licence introuvable' });
    const events  = await db.all('SELECT * FROM licence_events WHERE licence_id = ? ORDER BY created_at DESC', [req.params.id]);
    const parsed  = events.map(e => ({ ...e, metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata || 'null') : e.metadata }));
    res.json({ licence, events: parsed, total: parsed.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /smtp/test ───────────────────────────────────
router.post('/smtp/test', async (req, res) => {
  try {
    const { testSmtpConnection } = await import('../services/email.service.js');
    await testSmtpConnection();
    res.json({ ok: true, message: 'Connexion SMTP OK' });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── POST /smtp/send-test ──────────────────────────────
router.post('/smtp/send-test', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'to requis' });
    const { sendLicenceEmail } = await import('../services/email.service.js');
    await sendLicenceEmail({ to, clientName: 'Client Test', licenceKey: 'CCZ-TEST-1234-ABCD', modules: ['caisse', 'commandes'], type: 'perpetual', expiresAt: null });
    res.json({ ok: true, message: `Email de test envoyé à ${to}` });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

export default router;

