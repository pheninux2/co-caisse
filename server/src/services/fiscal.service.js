/**
 * Co-Caisse — Service Fiscal NF525
 * ============================================================
 * Implémente le chaînage cryptographique des transactions pour
 * respecter la loi anti-fraude TVA française (NF525).
 *
 * Principe :
 *   hash(N) = HMAC-SHA256(données_tx(N) + hash(N-1), FISCAL_HMAC_KEY)
 *
 * La clé HMAC est lue depuis process.env.FISCAL_HMAC_KEY.
 * Elle ne transite JAMAIS côté client.
 * ============================================================
 */

import crypto from 'crypto';

// ── La clé est lue dynamiquement à chaque appel (jamais mise en cache) ────────
// Raison : en mode --watch, le module n'est PAS rechargé si seul .env change.
// Lire process.env à l'appel garantit que la clé est toujours à jour.
const getHmacKey = () => process.env.FISCAL_HMAC_KEY || '';

/**
 * Normalise une valeur de date en string "YYYY-MM-DD HH:MM:SS"
 * quel que soit le type retourné par MariaDB (Date JS ou string).
 * Indispensable pour avoir un payload identique à la création et à la vérification.
 */
function normalizeDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    // MariaDB/mysql2 retourne un objet Date en UTC
    // On formate en "YYYY-MM-DD HH:MM:SS" sans timezone
    const pad = n => String(n).padStart(2, '0');
    return `${val.getUTCFullYear()}-${pad(val.getUTCMonth()+1)}-${pad(val.getUTCDate())} `
         + `${pad(val.getUTCHours())}:${pad(val.getUTCMinutes())}:${pad(val.getUTCSeconds())}`;
  }
  // Déjà une string — s'assurer qu'on ne garde que "YYYY-MM-DD HH:MM:SS" (sans ms ni Z)
  return String(val).replace('T', ' ').slice(0, 19);
}

/**
 * Calcule le HMAC-SHA256 d'une transaction.
 */
export function computeTransactionHash(tx, prevHash) {
  const HMAC_KEY = getHmacKey();
  if (!HMAC_KEY) {
    throw new Error('[fiscal] FISCAL_HMAC_KEY manquante dans .env — chaînage impossible');
  }

  // Canonicalisation stricte :
  // - transaction_date normalisée en string "YYYY-MM-DD HH:MM:SS"
  // - items toujours en string JSON
  // - valeurs numériques arrondies à 6 décimales (évite Float64 drift après aller-retour DB)
  const round = v => Math.round(Number(v) * 1_000_000) / 1_000_000;

  const payload = JSON.stringify({
    id:               String(tx.id),
    user_id:          String(tx.user_id),
    transaction_date: normalizeDateStr(tx.transaction_date),
    items:            typeof tx.items === 'string' ? tx.items : JSON.stringify(tx.items),
    subtotal:         round(tx.subtotal),
    tax:              round(tx.tax),
    discount:         round(tx.discount),
    total:            round(tx.total),
    payment_method:   String(tx.payment_method),
    receipt_number:   String(tx.receipt_number),
    prev_hash:        String(prevHash),
  });

  return crypto
    .createHmac('sha256', HMAC_KEY)
    .update(payload, 'utf8')
    .digest('hex');
}

/**
 * Récupère le dernier hash de la chaîne depuis fiscal_chain.
 * Retourne 'GENESIS' si la chaîne est vide.
 *
 * @param {object} db - Instance de Database
 * @returns {Promise<{last_hash: string, chain_length: number, last_tx_id: string|null}>}
 */
export async function getChainTail(db) {
  const row = await db.get('SELECT * FROM `fiscal_chain` WHERE id = 1');
  return row || { last_hash: 'GENESIS', chain_length: 0, last_tx_id: null };
}

/**
 * Met à jour le singleton fiscal_chain avec le nouveau hash.
 *
 * @param {object} db       - Instance de Database
 * @param {string} newHash  - Hash de la transaction qui vient d'être créée
 * @param {string} txId     - ID de cette transaction
 */
export async function updateChainTail(db, newHash, txId) {
  await db.run(
    `UPDATE \`fiscal_chain\`
       SET last_hash    = ?,
           last_tx_id   = ?,
           chain_length = chain_length + 1,
           updated_at   = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [newHash, txId]
  );
}

/**
 * Vérifie l'intégrité de toute la chaîne fiscale.
 *
 * Parcourt toutes les transactions possédant un hash (triées par date),
 * recalcule chaque hash et détecte les ruptures.
 *
 * @param {object} db - Instance de Database
 * @returns {Promise<{
 *   ok: boolean,
 *   total: number,
 *   verified: number,
 *   anomalies: Array<{tx_id, position, expected, actual, type}>
 * }>}
 */
export async function verifyChain(db) {
  if (!getHmacKey()) {
    return {
      ok: false,
      error: 'FISCAL_HMAC_KEY manquante — vérification impossible',
      total: 0, verified: 0, anomalies: [],
    };
  }

  // Récupérer toutes les transactions chaînées, dans l'ordre chronologique
  const transactions = await db.all(`
    SELECT id, user_id, transaction_date, items, subtotal, tax, discount,
           total, payment_method, receipt_number, transaction_hash, created_at
    FROM \`transactions\`
    WHERE transaction_hash IS NOT NULL
    ORDER BY created_at ASC, id ASC
  `);

  const anomalies  = [];
  let prevHash     = 'GENESIS';
  let verified     = 0;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    let expected;
    try {
      expected = computeTransactionHash(tx, prevHash);
    } catch (err) {
      anomalies.push({
        position: i + 1,
        tx_id:    tx.id,
        type:     'compute_error',
        details:  err.message,
        expected: null,
        actual:   tx.transaction_hash,
      });
      // On ne peut pas continuer la chaîne sans hash valide
      prevHash = tx.transaction_hash || prevHash;
      continue;
    }

    if (expected !== tx.transaction_hash) {
      anomalies.push({
        position: i + 1,
        tx_id:    tx.id,
        type:     'hash_mismatch',
        expected,
        actual:   tx.transaction_hash,
        details:  `Transaction #${i + 1} (${tx.id}) — hash ne correspond pas`,
      });
    } else {
      verified++;
    }

    prevHash = tx.transaction_hash; // on continue la chaîne avec le hash stocké
  }

  return {
    ok:        anomalies.length === 0,
    total:     transactions.length,
    verified,
    anomalies,
  };
}

/**
 * Enregistre une anomalie dans la table fiscal_anomalies.
 *
 * @param {object} db
 * @param {object} anomaly - { tx_id, type, expected, actual, details }
 */
export async function logAnomaly(db, anomaly) {
  const { v4: uuidv4 } = await import('uuid');
  try {
    await db.run(
      `INSERT INTO \`fiscal_anomalies\`
         (id, tx_id, anomaly_type, expected_hash, actual_hash, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        anomaly.tx_id,
        anomaly.type     || 'hash_mismatch',
        anomaly.expected || '',
        anomaly.actual   || '',
        anomaly.details  || null,
      ]
    );
  } catch (err) {
    console.error('[fiscal] Impossible de logger l\'anomalie:', err.message);
  }
}

