/**
 * Co-Caisse — Routes licences
 * Version : 1.0.0
 *
 * Routes PUBLIQUES (sans JWT) — accessibles avant/sans connexion :
 *   GET  /api/licences/status   → état courant de la licence
 *   POST /api/licences/trial    → démarre l'essai 7 jours
 *   POST /api/licences/activate → active une clé reçue
 */

import express from 'express';
import {
  getStatus,
  startTrial,
  activateLicence,
  validateLicence,
} from '../services/licence.service.js';

const router = express.Router();

// ── GET /status — État courant de la licence ──────────────────────────────────
// Appelé au démarrage de l'app (avant login) pour décider quel écran afficher.
// Réponse possible :
//   { hasLicence: false }                          → aucune licence → écran d'accueil
//   { hasLicence: true, valid: true,  type:'trial', daysRemaining: 28, modules:[…] }
//   { hasLicence: true, valid: false, type:'trial', daysRemaining: 0  }  → expiré
//   { hasLicence: true, valid: true,  type:'perpetual', daysRemaining: null }
router.get('/status', async (req, res) => {
  try {
    const db     = req.app.locals.db;
    const status = await getStatus(db);
    res.json(status);
  } catch (error) {
    console.error('[licences/status]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── POST /trial — Démarre l'essai gratuit 7 jours ────────────────────────────
// Bloqué si une licence existe déjà.
// Body : {} (aucun paramètre requis)
// Réponse succès : { success: true, licence: { … }, daysRemaining: 7 }
// Réponse erreur  : { success: false, error: "…" }
router.post('/trial', async (req, res) => {
  try {
    const db     = req.app.locals.db;
    const result = await startTrial(db);

    if (!result.success) {
      return res.status(409).json(result); // 409 Conflict = déjà une licence
    }

    console.log(`✅ [Licence] Essai démarré — ${result.daysRemaining} jours restants`);
    res.status(201).json(result);
  } catch (error) {
    console.error('[licences/trial]', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /activate — Active une clé de licence ────────────────────────────────
// Body : { key: "CCZ-XXXX-XXXX-XXXX" }
// Pour les activations via le panel admin (étape 7), les champs optionnels
// clientName, modules, type, expiresAt peuvent être fournis si la clé n'existe
// pas encore en base.
// Réponse succès : { success: true, licence: { … } }
// Réponse erreur  : { success: false, error: "…" }
router.post('/activate', async (req, res) => {
  try {
    const db  = req.app.locals.db;
    const { key, clientName, modules, type, expiresAt } = req.body;

    if (!key) {
      return res.status(400).json({ success: false, error: 'Clé de licence manquante' });
    }

    const result = await activateLicence(key, db, { clientName, modules, type, expiresAt });

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Retourner le statut complet après activation
    const status = await getStatus(db);
    console.log(`✅ [Licence] Activée — ${result.licence.client_name} / ${result.licence.type}`);
    res.status(201).json({ success: true, licence: result.licence, status });
  } catch (error) {
    console.error('[licences/activate]', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /validate — Vérifie une clé sans l'activer ──────────────────────────
// Utile côté client pour valider avant d'afficher un formulaire de confirmation.
// Body : { key: "CCZ-XXXX-XXXX-XXXX" }
router.post('/validate', async (req, res) => {
  try {
    const db  = req.app.locals.db;
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({ valid: false, error: 'Clé manquante' });
    }

    const result = await validateLicence(key, db);
    res.json(result);
  } catch (error) {
    console.error('[licences/validate]', error.message);
    res.status(500).json({ valid: false, error: error.message });
  }
});

export default router;

