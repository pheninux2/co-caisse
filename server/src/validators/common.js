/**
 * Co-Caisse — Utilitaires de validation (sans dépendance externe)
 */

/**
 * Vérifie que tous les champs requis sont présents et non vides.
 * @returns {string|null} message d'erreur ou null si valide
 */
export function requireFields(body, ...fields) {
  const missing = fields.filter(f => body[f] == null || body[f] === '');
  return missing.length > 0
    ? `Champs requis manquants : ${missing.join(', ')}`
    : null;
}

/**
 * Vérifie qu'une valeur est un nombre >= 0.
 * @returns {string|null}
 */
export function isPositiveNumber(val, fieldName) {
  const n = Number(val);
  if (isNaN(n) || n < 0) return `${fieldName} doit être un nombre positif`;
  return null;
}

/**
 * Vérifie qu'une valeur est dans une liste autorisée.
 * @returns {string|null}
 */
export function isOneOf(val, allowed, fieldName) {
  if (!allowed.includes(val)) {
    return `${fieldName} doit être l'une des valeurs : ${allowed.join(', ')}`;
  }
  return null;
}

/**
 * Vérifie qu'une chaîne email est valide (format basique).
 * @returns {string|null}
 */
export function isEmail(val, fieldName = 'email') {
  if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    return `${fieldName} n'est pas une adresse email valide`;
  }
  return null;
}

/**
 * Combines multiple validation results — retourne le premier non-null.
 * @param {...(string|null)} checks
 * @returns {string|null}
 */
export function firstError(...checks) {
  return checks.find(c => c !== null) ?? null;
}
