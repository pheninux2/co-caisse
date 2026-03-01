/**
 * Database adapter — MariaDB (mysql2/promise)
 *
 * L'API publique reste identique à l'ancien adapter SQLite :
 *   db.run(sql, params)  → { affectedRows, insertId }
 *   db.get(sql, params)  → row | undefined
 *   db.all(sql, params)  → row[]
 *
 * Les routes existantes n'ont donc pas à changer.
 */

import mysql  from 'mysql2/promise';
import dotenv from 'dotenv';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ──────────────────────────────────────────────
// Pool de connexions
// ──────────────────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER     || 'cocaisse',
  password: process.env.DB_PASS     || 'cocaisse',
  database: process.env.DB_NAME     || 'cocaisse',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           'local',
});

// ──────────────────────────────────────────────
// Classe Database — même interface qu'avant
// ──────────────────────────────────────────────
class Database {
  constructor() {
    this.pool = pool;
  }

  // ── Initialisation : création des tables ──────
  async initialize() {
    const conn = await this.pool.getConnection();
    try {
      // Activer les clés étrangères (MariaDB les désactive par défaut pour les FK)
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');

      // ── users ──────────────────────────────────
      await conn.query(`
        CREATE TABLE IF NOT EXISTS users (
          id           VARCHAR(36)  PRIMARY KEY,
          username     VARCHAR(100) UNIQUE NOT NULL,
          password     TEXT         NOT NULL,
          email        VARCHAR(255),
          role         VARCHAR(50)  NOT NULL DEFAULT 'cashier',
          profile      VARCHAR(50)  DEFAULT 'standard',
          active       TINYINT(1)   DEFAULT 1,
          created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
          updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // ── categories ─────────────────────────────
      await conn.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id           VARCHAR(36)  PRIMARY KEY,
          name         VARCHAR(255) NOT NULL,
          description  TEXT,
          image_url    TEXT,
          color        VARCHAR(20),
          order_index  INT,
          active       TINYINT(1)   DEFAULT 1,
          created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
          updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // ── products ───────────────────────────────
      await conn.query(`
        CREATE TABLE IF NOT EXISTS products (
          id           VARCHAR(36)  PRIMARY KEY,
          name         VARCHAR(255) NOT NULL,
          description  TEXT,
          category_id  VARCHAR(36)  NOT NULL,
          price        DOUBLE       NOT NULL,
          cost         DOUBLE,
          tax_rate     DOUBLE       DEFAULT 20,
          image_url    TEXT,
          barcode      VARCHAR(100) UNIQUE,
          stock        INT          DEFAULT 0,
          active       TINYINT(1)   DEFAULT 1,
          created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
          updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES categories(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // ── orders ─────────────────────────────────
      // (déclaré avant transactions car transactions a FK → orders)
      await conn.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id               VARCHAR(36)  PRIMARY KEY,
          order_number     VARCHAR(100) UNIQUE NOT NULL,
          table_number     VARCHAR(50),
          order_type       VARCHAR(50)  DEFAULT 'dine_in',
          status           VARCHAR(50)  DEFAULT 'draft',
          items            LONGTEXT     NOT NULL,
          subtotal         DOUBLE       NOT NULL,
          tax              DOUBLE       DEFAULT 0,
          discount         DOUBLE       DEFAULT 0,
          total            DOUBLE       NOT NULL,
          customer_name    VARCHAR(255),
          customer_phone   VARCHAR(50),
          notes            TEXT,
          kitchen_comment  TEXT,
          kitchen_handlers LONGTEXT     DEFAULT '[]',
          created_by       VARCHAR(36)  NOT NULL,
          created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
          validated_at     DATETIME,
          kitchen_at       DATETIME,
          ready_at         DATETIME,
          served_at        DATETIME,
          paid_at          DATETIME,
          transaction_id   VARCHAR(36),
          CONSTRAINT fk_order_user FOREIGN KEY (created_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // ── transactions ───────────────────────────
      await conn.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id               VARCHAR(36)  PRIMARY KEY,
          user_id          VARCHAR(36)  NOT NULL,
          transaction_date DATETIME     DEFAULT CURRENT_TIMESTAMP,
          items            LONGTEXT     NOT NULL,
          subtotal         DOUBLE       NOT NULL,
          tax              DOUBLE       DEFAULT 0,
          discount         DOUBLE       DEFAULT 0,
          total            DOUBLE       NOT NULL,
          payment_method   VARCHAR(50)  NOT NULL,
          payment_status   VARCHAR(50)  DEFAULT 'completed',
          \`change\`         DOUBLE       DEFAULT 0,
          notes            TEXT,
          receipt_number   VARCHAR(100),
          order_id         VARCHAR(36),
          customer_email       VARCHAR(255) DEFAULT NULL
                               COMMENT 'Email client (RGPD — consentement explicite)',
          receipt_email_sent_at DATETIME    DEFAULT NULL
                               COMMENT 'Horodatage envoi ticket par email',
          transaction_hash VARCHAR(64)  DEFAULT NULL
                                        COMMENT 'HMAC-SHA256 NF525 (null si chaînage non activé)',
          created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_transaction_user  FOREIGN KEY (user_id)  REFERENCES users(id),
          CONSTRAINT fk_transaction_order FOREIGN KEY (order_id) REFERENCES orders(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // ── payment_methods ────────────────────────
      await conn.query(`
        CREATE TABLE IF NOT EXISTS payment_methods (
          id         VARCHAR(36)  PRIMARY KEY,
          name       VARCHAR(100) NOT NULL,
          code       VARCHAR(50)  UNIQUE NOT NULL,
          enabled    TINYINT(1)   DEFAULT 1,
          config     TEXT,
          created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // ── settings ───────────────────────────────
      await conn.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id                       VARCHAR(36)  PRIMARY KEY,
          company_name             VARCHAR(255),
          company_address          TEXT,
          company_phone            VARCHAR(50),
          company_email            VARCHAR(255),
          tax_number               VARCHAR(100),
          currency                 VARCHAR(10)  DEFAULT 'EUR',
          default_tax_rate         DOUBLE       DEFAULT 20,
          receipt_header           TEXT,
          receipt_footer           TEXT,
          printer_name             VARCHAR(255),
          cashregister_port        VARCHAR(50),
          alert_draft_minutes      INT          DEFAULT 15,
          alert_validated_minutes  INT          DEFAULT 10,
          alert_kitchen_minutes    INT          DEFAULT 20,
          alert_ready_minutes      INT          DEFAULT 5,
          alert_served_minutes     INT          DEFAULT 30,
          alert_enabled            TINYINT(1)   DEFAULT 1,
          alert_sound_enabled      TINYINT(1)   DEFAULT 1,
          alert_remind_after_dismiss INT        DEFAULT 10,
          fiscal_chain_enabled     TINYINT(1)   DEFAULT 0,
          fiscal_day_start_hour    TINYINT      DEFAULT 6,
          agec_enabled             TINYINT(1)   DEFAULT 1
                                               COMMENT 'Proposition ticket dématérialisé AGEC (1=actif)',
          rgpd_retention_months    SMALLINT     DEFAULT 120
                                               COMMENT 'Conservation données clients (mois, min légal 120)',
          rgpd_logs_retention_months SMALLINT   DEFAULT 12
                                               COMMENT 'Conservation des logs applicatifs (mois)',
          country                  VARCHAR(5)   DEFAULT 'FR'
                                               COMMENT 'Code pays ISO (FR, MA, BE, CH)',
          created_at               DATETIME     DEFAULT CURRENT_TIMESTAMP,
          updated_at               DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // ── backups ────────────────────────────────
      await conn.query(`
        CREATE TABLE IF NOT EXISTS backups (
          id          VARCHAR(36) PRIMARY KEY,
          backup_date DATETIME    DEFAULT CURRENT_TIMESTAMP,
          backup_type VARCHAR(50),
          file_path   TEXT,
          size        BIGINT,
          status      VARCHAR(50) DEFAULT 'completed'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // NOTE : les tables licences / licence_events sont créées via la migration
      // 001_licences.sql (appliquée automatiquement ci-dessous).
      // La DB admin (cocaisse_admin) conserve l'historique complet.
      // La DB client stocke uniquement la clé activée localement.

      // ── fiscal_chain ───────────────────────────────
      // Singleton NF525 — dernier hash de la chaîne fiscale
      await conn.query(`
        CREATE TABLE IF NOT EXISTS fiscal_chain (
          id           INT          NOT NULL DEFAULT 1,
          last_hash    VARCHAR(64)  NOT NULL DEFAULT 'GENESIS',
          last_tx_id   VARCHAR(36)  DEFAULT NULL,
          chain_length BIGINT       NOT NULL DEFAULT 0,
          updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      // Insérer le singleton si absent
      await conn.query(
        'INSERT IGNORE INTO fiscal_chain (id, last_hash, chain_length) VALUES (1, \'GENESIS\', 0)'
      );

      // ── fiscal_anomalies ───────────────────────────
      // Journal des ruptures de chaîne détectées
      await conn.query(`
        CREATE TABLE IF NOT EXISTS fiscal_anomalies (
          id            VARCHAR(36)  PRIMARY KEY,
          detected_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
          tx_id         VARCHAR(36)  NOT NULL,
          expected_hash VARCHAR(64)  NOT NULL,
          actual_hash   VARCHAR(64)  DEFAULT NULL,
          anomaly_type  VARCHAR(50)  DEFAULT 'hash_mismatch',
          details       TEXT,
          resolved      TINYINT(1)   DEFAULT 0,
          resolved_at   DATETIME,
          resolved_by   VARCHAR(36)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // ── daily_closures ────────────────────────────
      // Clôtures journalières immuables — Z-tickets NF525
      await conn.query(`
        CREATE TABLE IF NOT EXISTS daily_closures (
          id                    VARCHAR(36)  PRIMARY KEY,
          closure_number        VARCHAR(10)  NOT NULL UNIQUE,
          fiscal_day_start      DATETIME     NOT NULL,
          fiscal_day_end        DATETIME     NOT NULL,
          closed_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          closed_by             VARCHAR(36)  NOT NULL,
          transaction_count     INT          NOT NULL DEFAULT 0,
          total_ttc             DOUBLE       NOT NULL DEFAULT 0,
          total_ht              DOUBLE       NOT NULL DEFAULT 0,
          total_tax             DOUBLE       NOT NULL DEFAULT 0,
          total_discount        DOUBLE       NOT NULL DEFAULT 0,
          vat_breakdown         JSON         DEFAULT NULL,
          payment_breakdown     JSON         DEFAULT NULL,
          last_transaction_id   VARCHAR(36)  DEFAULT NULL,
          last_transaction_hash VARCHAR(64)  DEFAULT NULL,
          closure_hash          VARCHAR(64)  NOT NULL,
          zticket_content       TEXT         DEFAULT NULL,
          created_at            DATETIME     DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // ── rgpd_purge_logs ───────────────────────────
      // Journal des purges RGPD — ne jamais supprimer
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`rgpd_purge_logs\` (
          id                       VARCHAR(36)  NOT NULL PRIMARY KEY,
          run_at                   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          triggered_by             VARCHAR(20)  NOT NULL DEFAULT 'cron',
          triggered_by_user        VARCHAR(36)  DEFAULT NULL,
          retention_months         SMALLINT     NOT NULL,
          cutoff_date              DATETIME     NOT NULL,
          transactions_anonymized  INT          NOT NULL DEFAULT 0,
          logs_deleted             INT          NOT NULL DEFAULT 0,
          status                   VARCHAR(20)  NOT NULL DEFAULT 'success',
          error_message            TEXT         DEFAULT NULL,
          created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('✅ Database connected');
      console.log('✅ All tables created/verified');
    } finally {
      conn.release();
    }

    // ── Jouer les migrations automatiquement ──────
    await this.runMigrations();
  }

  // ── Système de migrations ─────────────────────
  // Lit tous les fichiers *.sql dans migrations/,
  // les joue dans l'ordre alphabétique (001_, 002_…),
  // et ne rejoue jamais un fichier déjà exécuté.
  async runMigrations() {
    const conn = await this.pool.getConnection();
    try {
      // 1. Créer la table de suivi si elle n'existe pas
      await conn.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id         INT          NOT NULL AUTO_INCREMENT,
          filename   VARCHAR(255) NOT NULL UNIQUE,
          applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // 2. Lire les fichiers .sql du dossier migrations/
      const migrationsDir = path.join(__dirname, 'migrations');
      if (!fs.existsSync(migrationsDir)) {
        console.log('ℹ️  Dossier migrations/ absent — aucune migration à jouer');
        return;
      }

      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort(); // ordre alphabétique → 001_, 002_…

      if (files.length === 0) {
        console.log('ℹ️  Aucun fichier de migration trouvé');
        return;
      }

      // 3. Récupérer les migrations déjà jouées
      const [applied] = await conn.query('SELECT filename FROM _migrations');
      const appliedSet = new Set(applied.map(r => r.filename));

      // 4. Jouer uniquement les nouvelles
      let count = 0;
      for (const file of files) {
        if (appliedSet.has(file)) {
          // Déjà jouée — on passe
          continue;
        }

        console.log(`⏳ Migration : ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        // Exécuter chaque statement séparément (split sur ;)
        // On filtre les lignes vides, commentaires purs et SET redondants
        const statements = sql
          .split(';')
          .map(s => {
            // Supprimer les lignes de commentaires en tête (-- ...)
            // pour éviter que "-- commentaire\nCREATE TABLE" soit filtré
            return s
              .split('\n')
              .filter(line => !line.trim().startsWith('--'))
              .join('\n')
              .trim();
          })
          .filter(s => {
            if (!s || s.length === 0) return false;
            const upper = s.toUpperCase();
            if (upper.startsWith('SET FOREIGN_KEY_CHECKS')) return false;
            if (upper.startsWith('SET NAMES'))              return false;
            if (upper.startsWith('SET TIME_ZONE'))          return false;
            return true;
          });

        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const stmt of statements) {
          try {
            await conn.query(stmt);
          } catch (err) {
            // Ignorer les erreurs "table already exists" / "duplicate key" — idempotent
            if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_KEYNAME') {
              continue;
            }
            throw new Error(`Migration ${file} — erreur sur : ${stmt.slice(0, 80)}\n  → ${err.message}`);
          }
        }
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');

        // Marquer comme jouée
        await conn.query(
          'INSERT INTO _migrations (filename) VALUES (?)',
          [file]
        );
        console.log(`✅ Migration appliquée : ${file}`);
        count++;
      }

      if (count === 0) {
        console.log('✅ Migrations : aucune nouvelle migration');
      } else {
        console.log(`✅ ${count} migration(s) appliquée(s)`);
      }
    } catch (error) {
      console.error('❌ Erreur migrations :', error.message);
      // Ne pas crasher le serveur — les tables de base existent déjà
    } finally {
      conn.release();
    }
  }

  // ── Méthode run ────────────────────────────────
  async run(sql, params = []) {
    // Remplace tous les undefined par null (MariaDB strict)
    const safeParams = params.map(p => (p === undefined ? null : p));
    const [result] = await this.pool.query(sql, safeParams);
    return {
      affectedRows: result.affectedRows,
      insertId:     result.insertId,
      changes:      result.affectedRows,
      lastID:       result.insertId,
    };
  }

  // ── Méthode get ────────────────────────────────
  async get(sql, params = []) {
    const safeParams = params.map(p => (p === undefined ? null : p));
    const [rows] = await this.pool.query(sql, safeParams);
    return rows[0] ?? undefined;
  }

  // ── Méthode all ────────────────────────────────
  async all(sql, params = []) {
    const safeParams = params.map(p => (p === undefined ? null : p));
    const [rows] = await this.pool.query(sql, safeParams);
    return rows || [];
  }

  // ── Fermeture propre ───────────────────────────
  async close() {
    await this.pool.end();
  }

  // ── Export JSON ────────────────────────────────
  async exportData() {
    return {
      timestamp:    new Date().toISOString(),
      version:      '2.0.0',
      categories:   await this.all('SELECT * FROM categories'),
      products:     await this.all('SELECT * FROM products'),
      transactions: await this.all('SELECT * FROM transactions'),
      users:        await this.all('SELECT id, username, email, role, profile FROM users'),
      settings:     await this.all('SELECT * FROM settings'),
    };
  }

  // ── Import JSON ────────────────────────────────
  // INSERT OR REPLACE SQLite → INSERT … ON DUPLICATE KEY UPDATE MariaDB
  async importData(data) {
    try {
      if (data.categories) {
        for (const c of data.categories) {
          await this.run(
            `INSERT INTO categories (id, name, description, image_url, color, order_index, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               name=VALUES(name), description=VALUES(description), image_url=VALUES(image_url),
               color=VALUES(color), order_index=VALUES(order_index), active=VALUES(active),
               updated_at=VALUES(updated_at)`,
            [c.id, c.name, c.description, c.image_url, c.color, c.order_index,
             c.active, c.created_at, c.updated_at]
          );
        }
      }

      if (data.products) {
        for (const p of data.products) {
          await this.run(
            `INSERT INTO products (id, name, description, category_id, price, cost, tax_rate, image_url, barcode, stock, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               name=VALUES(name), description=VALUES(description), category_id=VALUES(category_id),
               price=VALUES(price), cost=VALUES(cost), tax_rate=VALUES(tax_rate),
               image_url=VALUES(image_url), stock=VALUES(stock), active=VALUES(active),
               updated_at=VALUES(updated_at)`,
            [p.id, p.name, p.description, p.category_id, p.price, p.cost,
             p.tax_rate, p.image_url, p.barcode, p.stock, p.active,
             p.created_at, p.updated_at]
          );
        }
      }

      return { success: true, message: 'Data imported successfully' };
    } catch (error) {
      throw new Error(`Import failed: ${error.message}`);
    }
  }
}

export default Database;

