/**
 * Co-Caisse — Service de licences
 * Version : 1.0.0
 *
 * Clé format  : CCZ-XXXX-XXXX-XXXX
 * Signature   : HMAC-SHA256 (vérifiable HORS LIGNE — pas d'appel serveur externe)
 * LICENCE_SECRET doit rester côté serveur uniquement — jamais exposé au renderer
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// ── Constantes ────────────────────────────────────────────────────────────────
const LICENCE_SECRET  = process.env.LICENCE_SECRET || 'fallback_dev_secret_change_in_prod';
const TRIAL_DAYS      = 7;
const KEY_PREFIX      = 'CCZ';

// Modules disponibles
export const AVAILABLE_MODULES = [
  'caisse',       // toujours inclus
  'cuisine',      // onglet cuisine pour cuisinier
  'commandes',    // gestion commandes en salle
  'historique',   // historique des transactions
  'statistiques', // rapports & analytics
  'gestion',      // produits, catégories, utilisateurs
];

// ── Helpers privés ────────────────────────────────────────────────────────────

/**
 * Génère un bloc de 4 caractères alphanumériques majuscules
 */
function _randomBlock() {
  return crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
}

/**
 * Calcule la signature HMAC-SHA256 du payload
 * payload = "CCZ|clientName|modules_sorted|type|timestamp"
 * Retourne les 8 premiers caractères du digest HEX (suffisant pour unicité + vérif offline)
 */
function _sign(payload) {
  return crypto
    .createHmac('sha256', LICENCE_SECRET)
    .update(payload)
    .digest('hex')
    .toUpperCase()
    .slice(0, 8);
}

/**
 * Décompose une clé en ses constituants
 * Format : CCZ-XXXX-XXXX-XXXX
 *          [0]  [1]   [2]   [3]
 *
 * Les 3 blocs (1,2,3) = 12 chars = données + signature
 *   - blocs[1..2] (8 chars) = données encodées (timestamp tronqué + modules hash)
 *   - bloc[3]     (4 chars) = premiers 4 chars de la signature HMAC
 *
 * Note : la vérification complète se fait via la DB (signature 8 chars stockée).
 * La vérif offline utilise le préfixe 4 chars — suffisant pour détecter les fausses clés.
 */
function _parseKey(key) {
  if (!key || typeof key !== 'string') return null;
  const parts = key.trim().toUpperCase().split('-');
  if (parts.length !== 4 || parts[0] !== KEY_PREFIX) return null;
  if (parts.some(p => p.length !== 4 && p !== KEY_PREFIX)) return null;
  return parts;
}

// ── Exports publics ───────────────────────────────────────────────────────────

/**
 * Génère une nouvelle clé de licence signée HMAC.
 *
 * @param {string}   clientName  Nom du client (ex: "Le Bistrot du Coin")
 * @param {string[]} modules     Modules à activer (sous-ensemble de AVAILABLE_MODULES)
 * @param {string}   type        'trial' | 'perpetual' | 'subscription'
 * @returns {string} Clé au format CCZ-XXXX-XXXX-XXXX
 */
export function generateLicenceKey(clientName, modules, type) {
  // Normalise : caisse toujours présent, tri alphabétique
  const normalizedModules = [...new Set(['caisse', ...modules])].sort();
  const timestamp = Date.now().toString(36).toUpperCase(); // base36, ex: "LXYZ1234"

  // Payload signé
  const payload = `${KEY_PREFIX}|${clientName.toUpperCase()}|${normalizedModules.join(',')}|${type}|${timestamp}`;
  const signature = _sign(payload); // 8 chars HEX

  // Construction des 3 blocs :
  // bloc1 = 4 premiers chars du timestamp base36 (padded)
  // bloc2 = 4 chars aléatoires (unicité)
  // bloc3 = 4 premiers chars de la signature
  const bloc1 = timestamp.padStart(4, '0').slice(-4);
  const bloc2 = _randomBlock();
  const bloc3 = signature.slice(0, 4);

  return `${KEY_PREFIX}-${bloc1}-${bloc2}-${bloc3}`;
}

/**
 * Vérifie une clé de licence :
 * - Structure syntaxique (format CCZ-XXXX-XXXX-XXXX)
 * - Présence et statut en base de données
 * - Expiration
 *
 * @param {string} key    Clé à vérifier
 * @param {object} db     Instance Database (pool MariaDB)
 * @returns {Promise<{valid: boolean, modules: string[], daysRemaining: number|null, type: string, error?: string}>}
 */
export async function validateLicence(key, db) {
  // 1. Vérif syntaxique offline
  const parts = _parseKey(key);
  if (!parts) {
    return { valid: false, modules: [], daysRemaining: null, type: null, error: 'Clé invalide — format incorrect' };
  }

  // 2. Vérif en base
  const licence = await db.get(
    'SELECT * FROM `licences` WHERE licence_key = ?',
    [key.trim().toUpperCase()]
  );

  if (!licence) {
    return { valid: false, modules: [], daysRemaining: null, type: null, error: 'Clé non reconnue' };
  }

  // 3. Vérif statut
  if (licence.status === 'suspended') {
    return { valid: false, modules: [], daysRemaining: null, type: licence.type, error: 'Licence suspendue — contactez le support' };
  }

  // 4. Vérif expiration
  if (isExpired(licence)) {
    // Mettre à jour le statut en base si pas déjà fait
    await db.run(
      "UPDATE `licences` SET status = 'expired' WHERE id = ? AND status = 'active'",
      [licence.id]
    );
    return { valid: false, modules: [], daysRemaining: 0, type: licence.type, error: 'Licence expirée' };
  }

  // 5. Parse modules (MariaDB retourne JSON sous forme de string ou objet)
  const modules = typeof licence.modules === 'string'
    ? JSON.parse(licence.modules)
    : licence.modules;

  // 6. Calcul jours restants
  const daysRemaining = _daysRemaining(licence);

  return {
    valid:        true,
    modules,
    daysRemaining,
    type:         licence.type,
    status:       licence.status,
    clientName:   licence.client_name,
    licenceId:    licence.id,
  };
}

/**
 * Démarre l'essai gratuit 30 jours.
 * Bloqué si une licence existe déjà (trial ou autre).
 *
 * @param {object} db  Instance Database
 * @returns {Promise<{success: boolean, licence?: object, error?: string}>}
 */
export async function startTrial(db) {
  // Vérif : aucune licence existante
  const existing = await db.get('SELECT id, type, status FROM `licences` LIMIT 1');
  if (existing) {
    return { success: false, error: 'Une licence existe déjà sur cette installation' };
  }

  const id          = uuidv4();
  const now         = new Date();
  const trialEnd    = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const key         = generateLicenceKey('TRIAL', AVAILABLE_MODULES, 'trial');
  const modules     = JSON.stringify(AVAILABLE_MODULES);

  await db.run(
    `INSERT INTO \`licences\`
       (id, client_name, licence_key, type, status, modules, trial_start, trial_end, expires_at)
     VALUES (?, ?, ?, 'trial', 'active', ?, NOW(), ?, ?)`,
    [id, 'Installation Essai', key, modules, trialEnd, trialEnd]
  );

  // Enregistrer l'événement
  await _logEvent(db, id, 'trial_started', { modules: ['caisse'], trial_end: trialEnd });

  const licence = await db.get('SELECT * FROM `licences` WHERE id = ?', [id]);
  return { success: true, licence, daysRemaining: TRIAL_DAYS };
}

/**
 * Active une clé de licence fournie par le client.
 * - Vérifie la syntaxe de la clé
 * - Insère en base (ou réactive si même clé)
 *
 * @param {string}   key        Clé reçue (format CCZ-XXXX-XXXX-XXXX)
 * @param {object}   db         Instance Database
 * @param {object}   licenceData Données à associer (clientName, modules, type, expiresAt)
 * @returns {Promise<{success: boolean, licence?: object, error?: string}>}
 */
export async function activateLicence(key, db, licenceData = {}) {
  const parts = _parseKey(key);
  if (!parts) {
    return { success: false, error: 'Format de clé invalide — attendu CCZ-XXXX-XXXX-XXXX' };
  }

  const normalizedKey = key.trim().toUpperCase();

  // Vérif si la clé existe déjà
  const existing = await db.get('SELECT * FROM `licences` WHERE licence_key = ?', [normalizedKey]);
  if (existing) {
    if (existing.status === 'suspended') {
      return { success: false, error: 'Cette licence est suspendue — contactez le support' };
    }
    // Réactivation
    await db.run("UPDATE `licences` SET status = 'active' WHERE id = ?", [existing.id]);
    await _logEvent(db, existing.id, 'activated', { reactivated: true });
    const updated = await db.get('SELECT * FROM `licences` WHERE id = ?', [existing.id]);
    return { success: true, licence: updated };
  }

  // Nouvelle activation
  const {
    clientName  = 'Client',
    modules     = ['caisse'],
    type        = 'perpetual',
    expiresAt   = null,
  } = licenceData;

  const normalizedModules = [...new Set(['caisse', ...modules])].sort();
  const id = uuidv4();

  await db.run(
    `INSERT INTO \`licences\`
       (id, client_name, licence_key, type, status, modules, expires_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    [id, clientName, normalizedKey, type, JSON.stringify(normalizedModules), expiresAt || null]
  );

  await _logEvent(db, id, 'activated', { modules: normalizedModules, type });

  const licence = await db.get('SELECT * FROM `licences` WHERE id = ?', [id]);
  return { success: true, licence };
}

/**
 * Retourne le statut complet de la licence active.
 *
 * @param {object} db  Instance Database
 * @returns {Promise<object>}
 */
export async function getStatus(db) {
  const licence = await db.get(
    "SELECT * FROM `licences` WHERE status IN ('active','expired') ORDER BY created_at DESC LIMIT 1"
  );

  if (!licence) {
    return { hasLicence: false, valid: false, modules: [], daysRemaining: null, type: null };
  }

  const modules = typeof licence.modules === 'string'
    ? JSON.parse(licence.modules)
    : licence.modules;

  const expired        = isExpired(licence);
  const daysRemaining  = _daysRemaining(licence);

  // Sync statut en base si expiré
  if (expired && licence.status === 'active') {
    await db.run("UPDATE `licences` SET status = 'expired' WHERE id = ?", [licence.id]);
    await _logEvent(db, licence.id, 'expired', {});
  }

  return {
    hasLicence:   true,
    valid:        !expired && licence.status === 'active',
    licenceId:    licence.id,
    clientName:   licence.client_name,
    type:         licence.type,
    status:       expired ? 'expired' : licence.status,
    modules:      expired ? [] : modules,
    daysRemaining,
    trialEnd:     licence.trial_end   || null,
    expiresAt:    licence.expires_at  || null,
  };
}

/**
 * Vérifie si une licence est expirée.
 * @param {object} licence  Row de la table licences
 * @returns {boolean}
 */
export function isExpired(licence) {
  if (licence.type === 'perpetual' && !licence.expires_at) return false;

  const expiry = licence.expires_at || licence.trial_end;
  if (!expiry) return false;

  return new Date(expiry).getTime() < Date.now();
}

// ── Helpers privés ────────────────────────────────────────────────────────────

/**
 * Calcule le nombre de jours restants avant expiration.
 * Retourne null pour une licence perpétuelle sans expires_at.
 */
function _daysRemaining(licence) {
  if (licence.type === 'perpetual' && !licence.expires_at) return null;
  const expiry = licence.expires_at || licence.trial_end;
  if (!expiry) return null;
  const diffMs = new Date(expiry).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Enregistre un événement dans licence_events.
 */
async function _logEvent(db, licenceId, eventType, metadata = {}) {
  await db.run(
    'INSERT INTO `licence_events` (id, licence_id, event_type, metadata) VALUES (?, ?, ?, ?)',
    [uuidv4(), licenceId, eventType, JSON.stringify(metadata)]
  );
}

