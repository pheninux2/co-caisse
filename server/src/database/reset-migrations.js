/**
 * Co-Caisse — Reset migrations
 *
 * Usage (depuis le dossier server/) :
 *
 *   node src/database/reset-migrations.js          # soft reset
 *   node src/database/reset-migrations.js --full   # full reset (DROP toutes les tables)
 *
 * ── Modes ──────────────────────────────────────────────────────────────────────
 *
 *  soft (défaut)
 *    Vide uniquement la table `_migrations`.
 *    Au prochain `npm start`, toutes les migrations sont rejouées.
 *    Les données sont conservées.
 *
 *  full  (--full)
 *    DROP toutes les tables de la base + recrée le schéma complet + rejoue les migrations.
 *    ⚠️  TOUTES LES DONNÉES SONT PERDUES.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 */

import dotenv  from 'dotenv';
import mysql   from 'mysql2/promise';
import Database from './index.js';

dotenv.config();

const FULL_RESET = process.argv.includes('--full');

// ── Toutes les tables connues, dans l'ordre de suppression (FK d'abord) ────────
const ALL_TABLES = [
  'transactions',
  'orders',
  'products',
  'fiscal_anomalies',
  'daily_closures',
  'rgpd_purge_logs',
  'tables',
  'floor_plans',
  'fiscal_chain',
  'payment_methods',
  'settings',
  'business_config',
  'backups',
  'categories',
  'licence_events',
  'licences',
  'users',
  '_migrations',
];

// ── Connexion directe (sans passer par le pool Database) ──────────────────────
async function connect() {
  return mysql.createConnection({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER || 'cocaisse',
    password: process.env.DB_PASS || 'cocaisse',
    database: process.env.DB_NAME || 'cocaisse',
    charset:  'utf8mb4',
    timezone: 'local',
  });
}

// ── Soft reset : vide uniquement _migrations ──────────────────────────────────
async function softReset(conn) {
  const [[rows]] = await conn.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_migrations'`
  );

  if (rows.n === 0) {
    console.log('ℹ️  Table _migrations absente — rien à réinitialiser.');
    return;
  }

  const [[before]] = await conn.query('SELECT COUNT(*) AS n FROM _migrations');
  await conn.query('TRUNCATE TABLE _migrations');
  console.log(`✅ _migrations vidée (${before.n} entrée(s) supprimée(s)).`);
  console.log('ℹ️  Relancez le serveur (npm start) pour rejouer toutes les migrations.');
}

// ── Full reset : DROP toutes les tables ───────────────────────────────────────
async function fullReset(conn) {
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  let dropped = 0;
  for (const table of ALL_TABLES) {
    try {
      await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
      console.log(`🗑️  DROP TABLE ${table}`);
      dropped++;
    } catch (err) {
      console.warn(`⚠️  Impossible de supprimer ${table} : ${err.message}`);
    }
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log(`\n✅ ${dropped} table(s) supprimée(s).`);
  console.log('⏳ Reconstruction du schéma et des migrations...\n');

  // Utiliser Database.initialize() pour recréer toutes les tables + migrations
  const db = new Database();
  await db.initialize();
  await db.close();

  console.log('\n✅ Base de données réinitialisée complètement.');
  console.log('ℹ️  Relancez le serveur puis jouez le seed si nécessaire : npm run seed');
}

// ── Point d'entrée ────────────────────────────────────────────────────────────
async function main() {
  if (FULL_RESET) {
    console.log('⚠️  MODE FULL RESET — toutes les données seront perdues.');
    console.log('   Appuyez sur Ctrl+C dans les 5 secondes pour annuler...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  let conn;
  try {
    conn = await connect();
    console.log('🔌 Connecté à la base de données.\n');

    if (FULL_RESET) {
      await fullReset(conn);
    } else {
      await softReset(conn);
    }
  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();