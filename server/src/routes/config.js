/**
 * Co-Caisse — Route configuration établissement
 * GET /api/config/business → retourne la config active (sans données sensibles)
 */
import express from 'express';
import { getConfigForCountry } from '../config/business-config.js';

const router = express.Router();

// GET /api/config/business — config active (public, pas de JWT requis)
router.get('/business', async (req, res) => {
  try {
    const db       = req.app.locals.db;
    const settings = await db.get('SELECT country, default_tax_rate FROM `settings` LIMIT 1');

    const country = settings?.country || process.env.BUSINESS_COUNTRY || 'FR';
    const config  = getConfigForCountry(country);

    // Surcharger defaultVatRate depuis les settings si défini
    if (settings?.default_tax_rate) {
      config.fiscal.defaultVatRate = Number(settings.default_tax_rate);
    }

    // Ne jamais exposer de données sensibles
    res.json({
      country:        country,
      businessType:   config.businessType,
      fiscal: {
        currency:        config.fiscal.currency,
        currencySymbol:  config.fiscal.currencySymbol,
        vatRates:        config.fiscal.vatRates,
        defaultVatRate:  config.fiscal.defaultVatRate,
        antifraudMode:   config.fiscal.antifraudMode,
        closureRequired: config.fiscal.closureRequired,
      },
      receipt: config.receipt,
      ui:      config.ui,
    });
  } catch (error) {
    // Fallback sur config par défaut si DB inaccessible
    const config = getConfigForCountry('FR');
    res.json({
      country:      'FR',
      businessType: config.businessType,
      fiscal:       config.fiscal,
      receipt:      config.receipt,
      ui:           config.ui,
    });
  }
});

export default router;

