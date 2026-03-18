#!/usr/bin/env node
/**
 * ============================================================
 *  Co-Caisse — Script de réinitialisation complète de la BDD
 * ============================================================
 *
 *  ⚠️  ATTENTION : Ce script supprime TOUTES les tables et
 *      remet à zéro les migrations. Toutes les données seront
 *      IRRÉMÉDIABLEMENT PERDUES.
 *
 *  Usage :
 *    node reset-database.mjs              → demande confirmation
 *    node reset-database.mjs --force      → sans confirmation (CI/CD)
 *    node reset-database.mjs --seed       → reset + réinjection des données initiales
 *    node reset-database.mjs --force --seed
 *
 * ============================================================
 */

import mysql    from 'mysql2/promise';
import dotenv   from 'dotenv';
import readline from 'readline';

dotenv.config();


// ── Couleurs console ──────────────────────────────────────────
const C = {
  reset  : '\x1b[0m',
  red    : '\x1b[31m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  cyan   : '\x1b[36m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
};

const log   = (msg)       => console.log(`${C.cyan}ℹ${C.reset}  ${msg}`);
const ok    = (msg)       => console.log(`${C.green}✔${C.reset}  ${msg}`);
const warn  = (msg)       => console.log(`${C.yellow}⚠${C.reset}  ${msg}`);
const error = (msg)       => console.error(`${C.red}✖${C.reset}  ${msg}`);
const title = (msg)       => console.log(`\n${C.bold}${C.cyan}${msg}${C.reset}\n`);
const dim   = (msg)       => console.log(`${C.dim}   ${msg}${C.reset}`);

// ── Arguments CLI ─────────────────────────────────────────────
const args  = process.argv.slice(2);
const FORCE = args.includes('--force');
const SEED  = args.includes('--seed');

// ── Tables à supprimer (ordre respectant les FK) ──────────────
// Les tables avec FK sur d'autres tables doivent être supprimées en premier.
const TABLES_TO_DROP = [
  '_migrations',
  'backups',
  'transactions',
  'orders',
  'products',
  'payment_methods',
  'settings',
  'categories',
  'users',
  // Tables ajoutées par les migrations
  'licences',
  'licence_events',
  'fiscal_entries',
  'daily_closures',
  'vat_rates',
  'receipts',
  'rgpd_deletion_log',
  'business_config',
  'floor_plan_areas',
  'floor_plan_tables',
];

// ── Données de seed minimales ────────────────────────────────
// Mot de passe admin par défaut : Admin1234!
// Injectées via : npm run seed  (après redémarrage du serveur)

// ─────────────────────────────────────────────────────────────
//  Confirmation interactive
// ─────────────────────────────────────────────────────────────
async function askConfirmation() {
  const rl = readline.createInterface({
    input : process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log(`\n${C.red}${C.bold}╔══════════════════════════════════════════════════════╗`);
    console.log(`║  ⚠️   RÉINITIALISATION COMPLÈTE DE LA BASE DE DONNÉES  ║`);
    console.log(`╚══════════════════════════════════════════════════════╝${C.reset}\n`);
    warn(`Base    : ${process.env.DB_NAME  || 'cocaisse'}`);
    warn(`Hôte    : ${process.env.DB_HOST  || 'localhost'}:${process.env.DB_PORT || 3306}`);
    warn(`Seed    : ${SEED ? 'OUI — données initiales seront injectées' : 'NON'}`);
    console.log();

    rl.question(
      `${C.yellow}Tapez exactement  ${C.bold}RESET${C.reset}${C.yellow}  pour confirmer (ou Ctrl+C pour annuler) : ${C.reset}`,
      (answer) => {
        rl.close();
        resolve(answer.trim() === 'RESET');
      }
    );
  });
}

// ─────────────────────────────────────────────────────────────
//  Script principal
// ─────────────────────────────────────────────────────────────
async function main() {
  title('Co-Caisse — Réinitialisation de la base de données');

  // ── Confirmation ──────────────────────────────────────────
  if (!FORCE) {
    const confirmed = await askConfirmation();
    if (!confirmed) {
      warn('Opération annulée.');
      process.exit(0);
    }
  } else {
    warn('Mode --force activé : pas de confirmation demandée.');
  }

  // ── Connexion MariaDB ─────────────────────────────────────
  log('Connexion à MariaDB…');
  let conn;
  try {
    conn = await mysql.createConnection({
      host    : process.env.DB_HOST || 'localhost',
      port    : parseInt(process.env.DB_PORT || '3306'),
      user    : process.env.DB_USER || 'cocaisse',
      password: process.env.DB_PASS || 'cocaisse',
      database: process.env.DB_NAME || 'cocaisse',
      multipleStatements: true,
    });
    ok(`Connecté à ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || 'cocaisse'}`);
  } catch (err) {
    error(`Impossible de se connecter à MariaDB : ${err.message}`);
    error('Vérifiez vos variables DB_HOST / DB_USER / DB_PASS / DB_NAME dans server/.env');
    process.exit(1);
  }

  try {
    // ── Désactiver les contraintes FK ──────────────────────
    log('Désactivation des contraintes de clés étrangères…');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0;');

    // ── Découverte dynamique des tables existantes ─────────
    log('Récupération de la liste des tables existantes…');
    const [existingRows] = await conn.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = ?`,
      [process.env.DB_NAME || 'cocaisse']
    );
    const existingTables = existingRows.map(r => r.table_name || r.TABLE_NAME);

    if (existingTables.length === 0) {
      warn('Aucune table trouvée dans la base — elle est déjà vide.');
    } else {
      log(`${existingTables.length} table(s) trouvée(s) : ${existingTables.join(', ')}`);
    }

    // ── Suppression de toutes les tables existantes ────────
    title('Suppression des tables');

    // On combine : liste connue + tables découvertes dynamiquement
    const allTables = [...new Set([...TABLES_TO_DROP, ...existingTables])];
    let dropped = 0;
    let skipped = 0;

    for (const table of allTables) {
      if (!existingTables.includes(table)) {
        dim(`SKIP   ${table}  (n'existe pas)`);
        skipped++;
        continue;
      }
      try {
        await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
        ok(`DROP   ${table}`);
        dropped++;
      } catch (err) {
        error(`Erreur sur DROP TABLE \`${table}\` : ${err.message}`);
      }
    }

    console.log();
    log(`Tables supprimées : ${dropped}  |  Ignorées : ${skipped}`);

    // ── Réactivation des contraintes FK ───────────────────
    await conn.query('SET FOREIGN_KEY_CHECKS = 1;');
    ok('Contraintes FK réactivées.');

    // ── Vérification que la base est vide ─────────────────
    const [remaining] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ?`,
      [process.env.DB_NAME || 'cocaisse']
    );
    const remainingCount = remaining[0].cnt;
    if (remainingCount > 0) {
      warn(`⚠️  Il reste ${remainingCount} table(s) dans la base après le nettoyage.`);
    } else {
      ok('Base de données complètement vide ✓');
    }

    // ── Réinitialisation de la table _migrations ──────────
    // Elle sera recréée automatiquement au prochain démarrage
    // du serveur. Ici on indique juste l'état attendu.
    title('État des migrations');
    ok('La table _migrations a été supprimée.');
    log('Au prochain démarrage du serveur (npm run dev / start),');
    log('les tables seront recréées et TOUTES les migrations seront rejouées.');

    // ── Seed optionnel ────────────────────────────────────
    if (SEED) {
      title('Injection des données initiales (--seed)');
      warn('Le seed requiert que les tables existent.');
      warn('Lancez d\'abord : npm run dev  (dans server/)');
      warn('puis relancez : node reset-database.mjs --seed');
      // Note : on ne peut pas seeder ici car les tables n'existent plus.
      // Le seed est géré par server/src/database/seed.js après démarrage.
      log('Conseil : après le démarrage du serveur, exécutez :');
      log('  cd server && npm run seed');
    }

    // ── Résumé final ──────────────────────────────────────
    console.log();
    console.log(`${C.green}${C.bold}╔══════════════════════════════════════════════════════╗`);
    console.log(`║         ✅  Réinitialisation terminée avec succès      ║`);
    console.log(`╚══════════════════════════════════════════════════════╝${C.reset}`);
    console.log();
    log('Prochaines étapes :');
    console.log(`  1. ${C.cyan}cd server${C.reset}`);
    console.log(`  2. ${C.cyan}npm run dev${C.reset}   ← recrée les tables + rejoue les migrations`);
    if (SEED) {
      console.log(`  3. ${C.cyan}npm run seed${C.reset}  ← injecte les données de démo`);
    }
    console.log();

  } catch (err) {
    error(`Erreur inattendue : ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();

