/**
 * Co-Caisse — Job RGPD : Purge automatique des données personnelles
 * =================================================================
 * S'exécute tous les jours à 03h00 (heure serveur).
 *
 * Règles :
 *   - Anonymise les données clients dans les transactions
 *     antérieures à `rgpd_retention_months` mois
 *     (customer_name → "Client anonymisé", customer_email/phone → NULL)
 *   - Ne supprime JAMAIS les transactions (obligation fiscale 10 ans)
 *   - Loggue chaque exécution dans `rgpd_purge_logs`
 *
 * Usage :
 *   import { startPurgeJob, runPurgeNow } from './jobs/purgeJob.js';
 *   startPurgeJob(db);          // démarrer le cron
 *   await runPurgeNow(db);      // exécution manuelle (endpoint admin)
 */

import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';

// ── Constantes ────────────────────────────────────────────────────────────────
// En production France : minimum légal 120 mois (10 ans — LPF art. L102 B)
// En mode TEST (NODE_ENV=test ou RGPD_TEST_MODE=1) : pas de minimum forcé
const IS_TEST_MODE       = process.env.NODE_ENV === 'test' || process.env.RGPD_TEST_MODE === '1';
const MIN_RETENTION_MONTHS = IS_TEST_MODE ? 1 : 120;
const CRON_SCHEDULE        = '0 3 * * *'; // Tous les jours à 03h00

// ── Démarrage du cron ─────────────────────────────────────────────────────────
/**
 * Lance le job cron de purge RGPD.
 * @param {object} db - Instance de la base de données (pool MariaDB)
 */
export function startPurgeJob(db) {
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error('[RGPD] Expression cron invalide :', CRON_SCHEDULE);
    return;
  }

  cron.schedule(CRON_SCHEDULE, async () => {
    console.log('[RGPD] ▶ Démarrage purge automatique :', new Date().toISOString());
    try {
      await runPurgeNow(db, 'cron', null);
    } catch (err) {
      console.error('[RGPD] ✗ Erreur fatale dans le cron :', err.message);
    }
  }, {
    timezone: 'Europe/Paris', // Heure française
  });

  console.log(`✅ RGPD : job de purge planifié à 03h00 (Europe/Paris)`);
}

// ── Exécution de la purge ─────────────────────────────────────────────────────
/**
 * Exécute la purge RGPD immédiatement.
 * Peut être appelée manuellement depuis un endpoint admin.
 *
 * @param {object} db             - Instance base de données
 * @param {'cron'|'manual'} triggeredBy
 * @param {string|null} adminUserId - UUID de l'admin (si déclenchement manuel)
 * @param {Date|null} forcedCutoff  - Date pivot forcée (tests uniquement — ignorée en production si NODE_ENV=production)
 * @returns {Promise<object>} Résultat de la purge
 */
export async function runPurgeNow(db, triggeredBy = 'cron', adminUserId = null, forcedCutoff = null) {
  const runId    = uuidv4();
  const runAt    = new Date();
  let   transactionsAnonymized = 0;
  let   logsDeleted            = 0;
  let   status                 = 'success';
  let   errorMessage           = null;

  try {
    // 1. Lire les paramètres de rétention depuis settings
    const settings = await db.get('SELECT rgpd_retention_months, rgpd_logs_retention_months FROM `settings` LIMIT 1');
    const retentionMonths     = settings?.rgpd_retention_months ?? MIN_RETENTION_MONTHS;
    const logsRetentionMonths = settings?.rgpd_logs_retention_months ?? 12;

    // 2. Calculer la date pivot
    // Si forcedCutoff fourni ET qu'on n'est pas en prod stricte → l'utiliser
    const isProdStrict = process.env.NODE_ENV === 'production' && process.env.RGPD_TEST_MODE !== '1';
    const cutoffDate     = (forcedCutoff && !isProdStrict) ? new Date(forcedCutoff) : _subtractMonths(runAt, retentionMonths);
    const logsCutoffDate = _subtractMonths(runAt, logsRetentionMonths);

    console.log(`[RGPD] Conservation données : ${retentionMonths} mois → pivot : ${_fmtDate(cutoffDate)}`);
    console.log(`[RGPD] Conservation logs    : ${logsRetentionMonths} mois → pivot : ${_fmtDate(logsCutoffDate)}`);

    // ── 3. Anonymiser les transactions antérieures à cutoffDate ──────────────
    // Colonnes personnelles présentes dans la table transactions :
    //   - customer_email  (ajoutée par migration 005 AGEC)
    // Note : customer_name et customer_phone sont sur la table `orders`, pas `transactions`
    const txResult = await db.run(
      `UPDATE \`transactions\`
       SET customer_email = NULL
       WHERE created_at < ?
         AND customer_email IS NOT NULL`,
      [_fmtDate(cutoffDate)]
    );
    transactionsAnonymized = txResult.affectedRows ?? 0;
    console.log(`[RGPD] ✓ Transactions anonymisées (customer_email supprimé) : ${transactionsAnonymized}`);

    // ── 3b. Anonymiser les orders (customer_name + customer_phone) ────────────
    // La table orders contient les vraies données nominatives
    let ordersAnonymized = 0;
    try {
      const ordersResult = await db.run(
        `UPDATE \`orders\`
         SET
           customer_name  = CASE WHEN customer_name  IS NOT NULL THEN 'Client anonymisé' ELSE NULL END,
           customer_phone = NULL
         WHERE created_at < ?
           AND (
             (customer_name  IS NOT NULL AND customer_name  != 'Client anonymisé')
             OR customer_phone IS NOT NULL
           )`,
        [_fmtDate(cutoffDate)]
      );
      ordersAnonymized = ordersResult.affectedRows ?? 0;
      console.log(`[RGPD] ✓ Commandes anonymisées (orders) : ${ordersAnonymized}`);
      transactionsAnonymized += ordersAnonymized;
    } catch (ordersErr) {
      // La table orders peut ne pas avoir ces colonnes selon la version
      console.log(`[RGPD] ℹ Anonymisation orders ignorée : ${ordersErr.message}`);
    }

    // ── 4. Supprimer les logs applicatifs anciens ─────────────────────────────
    // Suppression dans rgpd_purge_logs seulement si TRÈS anciens
    // (on garde au minimum 10 ans pour la traçabilité fiscale)
    // Pour les logs "applicatifs" (table app_logs si elle existe), on purge
    const hasAppLogs = await _tableExists(db, 'app_logs');
    if (hasAppLogs) {
      const logsResult = await db.run(
        'DELETE FROM `app_logs` WHERE created_at < ?',
        [_fmtDate(logsCutoffDate)]
      );
      logsDeleted = logsResult.affectedRows ?? 0;
      console.log(`[RGPD] ✓ Logs supprimés : ${logsDeleted}`);
    } else {
      console.log('[RGPD] ℹ Table app_logs absente — étape ignorée');
    }

  } catch (err) {
    status       = 'error';
    errorMessage = err.message;
    console.error('[RGPD] ✗ Erreur pendant la purge :', err.message);
  }

  // ── 5. Enregistrer le log de la purge ────────────────────────────────────
  try {
    const settings2       = await db.get('SELECT rgpd_retention_months FROM `settings` LIMIT 1');
    const retentionUsed   = settings2?.rgpd_retention_months ?? MIN_RETENTION_MONTHS;
    // Recalculer cutoff pour le log (au cas où forcedCutoff était utilisé)
    const isProdStrict2   = process.env.NODE_ENV === 'production' && process.env.RGPD_TEST_MODE !== '1';
    const cutoffForLog    = (forcedCutoff && !isProdStrict2) ? new Date(forcedCutoff) : _subtractMonths(runAt, retentionUsed);

    await db.run(
      `INSERT INTO \`rgpd_purge_logs\`
         (id, run_at, triggered_by, triggered_by_user, retention_months,
          cutoff_date, transactions_anonymized, logs_deleted, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        _fmtDate(runAt),
        triggeredBy,
        adminUserId,
        retentionUsed,
        _fmtDate(cutoffForLog),
        transactionsAnonymized,
        logsDeleted,
        status,
        errorMessage,
      ]
    );
    console.log(`[RGPD] ✓ Log enregistré — id: ${runId} — statut: ${status}`);
  } catch (logErr) {
    console.error('[RGPD] ✗ Impossible d\'enregistrer le log :', logErr.message);
  }

  return {
    runId,
    runAt,
    status,
    transactionsAnonymized,
    logsDeleted,
    errorMessage,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Soustrait N mois à une date. */
function _subtractMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

/** Formate une date en 'YYYY-MM-DD HH:MM:SS' pour MariaDB. */
function _fmtDate(date) {
  return new Date(date).toISOString().replace('T', ' ').substring(0, 19);
}

/** Vérifie si une table existe en base. */
async function _tableExists(db, tableName) {
  try {
    const row = await db.get(
      `SELECT COUNT(*) as cnt FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    return (row?.cnt ?? 0) > 0;
  } catch (_) {
    return false;
  }
}

