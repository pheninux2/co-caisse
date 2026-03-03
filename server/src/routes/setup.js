/**
 * Co-Caisse — Route Setup / Premier démarrage
 * ============================================================
 * GET  /api/setup/status   → vérifie si le wizard doit s'afficher (public)
 * POST /api/setup/complete → complète l'installation (public, idempotent)
 *
 * Ces routes sont PUBLIQUES — montées avant authMiddleware et licenceMiddleware
 * dans index.js.
 * ============================================================
 */

import express    from 'express';
import bcrypt     from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { generateToken } from '../middleware/auth.js';
import { COUNTRY_PRESETS } from '../config/business-config.js';

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Vérifie si le setup est déjà complété dans business_config. */
async function isSetupCompleted(db) {
  try {
    const row = await db.get(
      "SELECT config_value FROM `business_config` WHERE config_key = 'setup_completed' LIMIT 1"
    );
    return row?.config_value === '1';
  } catch (_) {
    return false;
  }
}

/** Vérifie qu'un admin existe déjà dans users. */
async function adminExists(db) {
  try {
    const row = await db.get(
      "SELECT id FROM `users` WHERE role = 'admin' AND active = 1 LIMIT 1"
    );
    return !!row;
  } catch (_) {
    return false;
  }
}

// ── GET /api/setup/status ─────────────────────────────────────────────────────
// Retourne { completed: true/false, reason }
// Le frontend appelle cet endpoint au démarrage pour décider d'afficher le wizard.
router.get('/status', async (req, res) => {
  try {
    const db        = req.app.locals.db;
    const completed = await isSetupCompleted(db);
    const hasAdmin  = await adminExists(db);

    // Le wizard s'affiche si le flag n'est pas posé OU si aucun admin n'existe
    const needsSetup = !completed || !hasAdmin;

    res.json({
      completed: !needsSetup,
      has_admin: hasAdmin,
      reason: !completed ? 'setup_not_completed' : !hasAdmin ? 'no_admin' : null,
    });
  } catch (err) {
    // En cas d'erreur DB au démarrage, on considère le setup comme complété
    // pour ne pas bloquer une app déjà en production
    console.error('[SETUP] Erreur status :', err.message);
    res.json({ completed: true, reason: 'db_error' });
  }
});

// ── POST /api/setup/complete ──────────────────────────────────────────────────
// Corps attendu :
// {
//   country: 'FR',
//   business_type: 'restaurant',
//   company_name: '...',
//   company_address: '...',
//   tax_number: '...',       // SIRET (FR) ou ICE (MA)
//   vat_number: '...',       // N° TVA intracommunautaire
//   company_phone: '...',
//   company_email: '...',
//   admin_username: '...',
//   admin_email: '...',
//   admin_password: '...',
// }
router.post('/complete', async (req, res) => {
  const db = req.app.locals.db;

  try {
    // ── Sécurité : bloquer si setup déjà complété ─────────────────────────
    const alreadyDone = await isSetupCompleted(db);
    if (alreadyDone && await adminExists(db)) {
      return res.status(409).json({ error: 'Setup déjà complété — accès refusé.' });
    }

    // ── Validation du body ─────────────────────────────────────────────────
    const {
      country        = 'FR',
      business_type  = 'restaurant',
      company_name,
      company_address,
      tax_number,
      vat_number,
      company_phone  = '',
      company_email  = '',
      admin_username,
      admin_email    = '',
      admin_password,
    } = req.body;

    const errors = [];
    if (!company_name?.trim())    errors.push('Nom de l\'établissement requis');
    if (!company_address?.trim()) errors.push('Adresse requise');
    if (!admin_username?.trim())  errors.push('Nom d\'utilisateur admin requis');
    if (!admin_password)          errors.push('Mot de passe admin requis');

    // Validation mot de passe : 8 car. min, 1 majuscule, 1 chiffre
    if (admin_password && !/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(admin_password)) {
      errors.push('Mot de passe trop faible — 8 caractères min, 1 majuscule, 1 chiffre');
    }

    // Validation SIRET (FR) : 14 chiffres
    if (country === 'FR' && tax_number && !/^\d{14}$/.test(tax_number.replace(/\s/g, ''))) {
      errors.push('SIRET invalide — 14 chiffres requis');
    }

    // Validation ICE (MA) : 15 chiffres
    if (country === 'MA' && tax_number && !/^\d{15}$/.test(tax_number.replace(/\s/g, ''))) {
      errors.push('ICE invalide — 15 chiffres requis');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' | '), details: errors });
    }

    // ── Vérifier que l'username admin n'existe pas déjà ────────────────────
    const existingUser = await db.get(
      'SELECT id FROM `users` WHERE username = ? LIMIT 1',
      [admin_username.trim()]
    );
    if (existingUser) {
      return res.status(409).json({ error: `L'utilisateur "${admin_username}" existe déjà.` });
    }

    // ── Récupérer le préréglage pays ───────────────────────────────────────
    const validCountries = ['FR', 'MA', 'BE', 'CH'];
    const safeCountry = validCountries.includes(country) ? country : 'FR';
    const preset      = COUNTRY_PRESETS[safeCountry];

    // ── 1. UPSERT business_config ──────────────────────────────────────────
    const configEntries = {
      country:          safeCountry,
      business_type:    business_type,
      vat_rates:        preset.fiscal.vatRates.join(','),
      default_vat_rate: String(preset.fiscal.defaultVatRate),
      currency:         preset.fiscal.currency,
      currency_symbol:  preset.fiscal.currencySymbol,
      print_by_default: preset.receipt.printByDefault ? '1' : '0',
      antifraud_mode:   preset.fiscal.antifraudMode   ? '1' : '0',
      closure_required: preset.fiscal.closureRequired ? '1' : '0',
      setup_completed:  '0', // posé à '1' en dernier (transaction)
    };

    for (const [key, value] of Object.entries(configEntries)) {
      await db.run(
        `INSERT INTO \`business_config\` (config_key, config_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    }

    // ── 2. Créer / mettre à jour settings ─────────────────────────────────
    const existingSettings = await db.get('SELECT id FROM `settings` LIMIT 1');
    const cleanTaxNumber   = tax_number?.replace(/\s/g, '') || '';

    if (existingSettings) {
      await db.run(
        `UPDATE \`settings\` SET
           company_name    = ?,
           company_address = ?,
           company_phone   = ?,
           company_email   = ?,
           tax_number      = ?,
           currency        = ?,
           default_tax_rate = ?,
           country         = ?,
           updated_at      = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          company_name.trim(), company_address.trim(),
          company_phone.trim(), company_email.trim(),
          cleanTaxNumber, preset.fiscal.currency,
          preset.fiscal.defaultVatRate, safeCountry,
          existingSettings.id,
        ]
      );
    } else {
      await db.run(
        `INSERT INTO \`settings\` (
           id, company_name, company_address, company_phone, company_email,
           tax_number, currency, default_tax_rate, country
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          company_name.trim(), company_address.trim(),
          company_phone.trim(), company_email.trim(),
          cleanTaxNumber, preset.fiscal.currency,
          preset.fiscal.defaultVatRate, safeCountry,
        ]
      );
    }

    // ── 3. Créer le compte admin ───────────────────────────────────────────
    const adminId   = uuidv4();
    const adminHash = await bcrypt.hash(admin_password, BCRYPT_ROUNDS);

    await db.run(
      'INSERT INTO `users` (id, username, password, email, role, profile, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [adminId, admin_username.trim(), adminHash, admin_email.trim(), 'admin', 'standard', 1]
    );

    // ── 4. Marquer le setup comme complété ────────────────────────────────
    await db.run(
      `UPDATE \`business_config\` SET config_value = '1', updated_at = CURRENT_TIMESTAMP
       WHERE config_key = 'setup_completed'`
    );

    // ── 5. Générer un JWT pour auto-login immédiat ─────────────────────────
    const adminUser = await db.get(
      'SELECT id, username, email, role, profile, active FROM `users` WHERE id = ?',
      [adminId]
    );
    const token = generateToken(adminUser);

    console.log(`✅ [SETUP] Premier démarrage complété — admin "${admin_username}" créé, pays: ${safeCountry}`);

    res.status(201).json({
      success: true,
      message: 'Configuration complétée avec succès',
      token,
      user: {
        id:       adminUser.id,
        username: adminUser.username,
        email:    adminUser.email,
        role:     adminUser.role,
      },
      config: {
        country:      safeCountry,
        businessType: business_type,
        currency:     preset.fiscal.currency,
        vatRates:     preset.fiscal.vatRates,
      },
    });
  } catch (err) {
    console.error('[SETUP] Erreur setup/complete :', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

