/**
 * Co-Caisse — Route configuration établissement
 * GET /api/config/business → config active (sans données sensibles)
 * PUT /api/config/business → sauvegarde (admin uniquement)
 */
import express from 'express';
import { getConfigForCountry, COUNTRY_PRESETS } from '../config/business-config.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';

const router = express.Router();

// ── Helper : lire toute la table business_config ─────────────────────────────
async function readBusinessConfig(db) {
  try {
    const rows = await db.all('SELECT config_key, config_value FROM `business_config`');
    const map  = {};
    for (const row of rows) map[row.config_key] = row.config_value;
    return map;
  } catch (_) { return {}; }
}

// ── Helper : construire la config fusionnée depuis la DB ─────────────────────
async function buildActiveConfig(db) {
  const dbConf   = await readBusinessConfig(db);
  const settings = await db.get('SELECT country, default_tax_rate FROM `settings` LIMIT 1').catch(() => null);

  // Priorité : business_config > settings.country > 'FR'
  const country      = dbConf.country      || settings?.country || 'FR';
  const businessType = dbConf.business_type || 'restaurant';
  const preset       = getConfigForCountry(country);

  // Taux TVA : DB en priorité (chaîne "5.5,10,20" → tableau)
  let vatRates = preset.fiscal.vatRates;
  if (dbConf.vat_rates) {
    vatRates = dbConf.vat_rates.split(',').map(Number).filter(n => !isNaN(n));
  }

  const defaultVatRate = parseFloat(dbConf.default_vat_rate ?? settings?.default_tax_rate ?? preset.fiscal.defaultVatRate);
  const currency       = dbConf.currency       || preset.fiscal.currency;
  const currencySymbol = dbConf.currency_symbol || preset.fiscal.currencySymbol;
  const printByDefault = dbConf.print_by_default !== undefined
    ? dbConf.print_by_default === '1' : preset.receipt.printByDefault;
  const antifraudMode  = dbConf.antifraud_mode  !== undefined
    ? dbConf.antifraud_mode  === '1' : preset.fiscal.antifraudMode;
  const closureRequired = dbConf.closure_required !== undefined
    ? dbConf.closure_required === '1' : preset.fiscal.closureRequired;

  return {
    country,
    businessType,
    fiscal: { currency, currencySymbol, vatRates, defaultVatRate, antifraudMode, closureRequired },
    receipt: { ...preset.receipt, printByDefault },
    ui: preset.ui,
  };
}

// ── GET /api/config/business — public ────────────────────────────────────────
router.get('/business', async (req, res) => {
  try {
    const db     = req.app.locals.db;
    const config = await buildActiveConfig(db);
    res.json(config);
  } catch (error) {
    // Fallback France si DB inaccessible
    const config = getConfigForCountry('FR');
    res.json({ country: 'FR', businessType: 'restaurant', fiscal: config.fiscal, receipt: config.receipt, ui: config.ui });
  }
});

// ── PUT /api/config/business — admin uniquement ───────────────────────────────
router.put('/business', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const {
      country      = 'FR',
      business_type = 'restaurant',
      vat_rates,        // tableau [5.5, 10, 20] ou chaîne "5.5,10,20"
      default_vat_rate,
      currency,
      currency_symbol,
      print_by_default,
      antifraud_mode,
      closure_required,
    } = req.body;

    // Valider le pays
    const validCountries = ['FR', 'MA', 'BE', 'CH'];
    const safeCountry = validCountries.includes(country) ? country : 'FR';

    // Appliquer le préréglage pays si changement de pays
    const preset = COUNTRY_PRESETS[safeCountry];

    // Construire les entrées à UPSERT
    const entries = {
      country:          safeCountry,
      business_type:    business_type,
      vat_rates:        Array.isArray(vat_rates)
                          ? vat_rates.join(',')
                          : (vat_rates || preset.fiscal.vatRates.join(',')),
      default_vat_rate: String(default_vat_rate ?? preset.fiscal.defaultVatRate),
      currency:         currency        || preset.fiscal.currency,
      currency_symbol:  currency_symbol || preset.fiscal.currencySymbol,
      print_by_default: print_by_default !== undefined ? (print_by_default ? '1' : '0') : (preset.receipt.printByDefault ? '1' : '0'),
      antifraud_mode:   antifraud_mode  !== undefined ? (antifraud_mode  ? '1' : '0') : (preset.fiscal.antifraudMode  ? '1' : '0'),
      closure_required: closure_required !== undefined ? (closure_required ? '1' : '0') : (preset.fiscal.closureRequired ? '1' : '0'),
    };

    // UPSERT chaque clé
    for (const [key, value] of Object.entries(entries)) {
      await db.run(
        `INSERT INTO \`business_config\` (config_key, config_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    }

    // Mettre à jour settings.country et settings.default_tax_rate pour cohérence
    await db.run(
      `UPDATE \`settings\` SET country = ?, default_tax_rate = ?, updated_at = CURRENT_TIMESTAMP LIMIT 1`,
      [safeCountry, entries.default_vat_rate]
    );

    // Retourner la config active mise à jour
    const config = await buildActiveConfig(db);
    res.json({ success: true, config });

  } catch (error) {
    console.error('[CONFIG] Erreur PUT /business:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/config/presets — liste les préréglages pays ─────────────────────
router.get('/presets', (req, res) => {
  const presets = {};
  for (const [code, preset] of Object.entries(COUNTRY_PRESETS)) {
    presets[code] = {
      currency:       preset.fiscal.currency,
      currencySymbol: preset.fiscal.currencySymbol,
      vatRates:       preset.fiscal.vatRates,
      defaultVatRate: preset.fiscal.defaultVatRate,
      printByDefault: preset.receipt.printByDefault,
      antifraudMode:  preset.fiscal.antifraudMode,
    };
  }
  res.json(presets);
});

export default router;
