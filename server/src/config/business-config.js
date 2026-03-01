/**
 * Co-Caisse — Configuration centrale de l'établissement
 * ============================================================
 * Ce fichier définit les valeurs par défaut.
 * Les valeurs peuvent être surchargées par la table `settings` en base.
 *
 * Exposé (sans données sensibles) via GET /api/config/business
 * ============================================================
 */

export const BUSINESS_CONFIG = {
  businessType: 'restaurant', // restaurant | pizzeria | bar | bakery | fastfood
  country:      'FR',         // FR | MA | BE | CH

  fiscal: {
    currency:       'EUR',
    currencySymbol: '€',
    // Taux TVA disponibles — utilisés dans le select du formulaire produit
    vatRates:       [5.5, 10, 20],
    defaultVatRate: 20,
    antifraudMode:  true,
    closureRequired: true,
  },

  receipt: {
    printByDefault: false, // France : impression à la demande (loi AGEC)
    emailEnabled:   true,
  },

  ui: {
    language:         'fr',
    rtl:              false,
    dateFormat:       'DD/MM/YYYY',
    decimalSeparator: ',',
  },
};

/**
 * Préréglages par pays — appliqués automatiquement selon `country`.
 */
export const COUNTRY_PRESETS = {
  FR: {
    fiscal: {
      currency: 'EUR', currencySymbol: '€',
      vatRates: [5.5, 10, 20], defaultVatRate: 20,
      antifraudMode: true, closureRequired: true,
    },
    receipt: { printByDefault: false },
    ui: { language: 'fr', rtl: false, decimalSeparator: ',' },
  },
  MA: {
    fiscal: {
      currency: 'MAD', currencySymbol: 'د.م.',
      vatRates: [0, 7, 10, 14, 20], defaultVatRate: 10,
      antifraudMode: false, closureRequired: false,
    },
    receipt: { printByDefault: true },
    ui: { language: 'fr', rtl: false, decimalSeparator: ',' },
  },
  BE: {
    fiscal: {
      currency: 'EUR', currencySymbol: '€',
      vatRates: [6, 12, 21], defaultVatRate: 21,
      antifraudMode: false, closureRequired: false,
    },
    receipt: { printByDefault: false },
    ui: { language: 'fr', rtl: false, decimalSeparator: ',' },
  },
  CH: {
    fiscal: {
      currency: 'CHF', currencySymbol: 'CHF',
      vatRates: [2.6, 3.8, 8.1], defaultVatRate: 8.1,
      antifraudMode: false, closureRequired: false,
    },
    receipt: { printByDefault: false },
    ui: { language: 'fr', rtl: false, decimalSeparator: '.' },
  },
};

/**
 * Fusionne BUSINESS_CONFIG avec le préréglage du pays.
 * @param {string} country - Code pays (FR, MA, BE, CH)
 * @returns {object} Config fusionnée
 */
export function getConfigForCountry(country) {
  const preset = COUNTRY_PRESETS[country] || COUNTRY_PRESETS['FR'];
  return {
    ...BUSINESS_CONFIG,
    ...preset,
    fiscal: { ...BUSINESS_CONFIG.fiscal, ...preset.fiscal },
    receipt: { ...BUSINESS_CONFIG.receipt, ...preset.receipt },
    ui: { ...BUSINESS_CONFIG.ui, ...preset.ui },
  };
}

export default BUSINESS_CONFIG;

