/**
 * Co-Caisse Admin — Database (MariaDB mysql2/promise)
 * Base distincte : cocaisse_admin
 * Tables : licences, licence_events, _migrations
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  host:               process.env.ADMIN_DB_HOST || 'localhost',
  port:               parseInt(process.env.ADMIN_DB_PORT || '3306'),
  user:               process.env.ADMIN_DB_USER || 'cocaisse',
  password:           process.env.ADMIN_DB_PASS || 'cocaisse',
  database:           process.env.ADMIN_DB_NAME || 'cocaisse_admin',
  waitForConnections: true,
  connectionLimit:    10,
  charset:            'utf8mb4',
  timezone:           'local',
});

class AdminDatabase {
  constructor() { this.pool = pool; }

  async run(sql, params = []) {
    const [result] = await this.pool.execute(sql, params);
    return result;
  }

  async get(sql, params = []) {
    const [rows] = await this.pool.execute(sql, params);
    return rows[0];
  }

  async all(sql, params = []) {
    const [rows] = await this.pool.execute(sql, params);
    return rows;
  }

  async initialize() {
    const conn = await this.pool.getConnection();
    try {
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');

      // ── licences ──────────────────────────────────────────────────────────
      await conn.query(`
        CREATE TABLE IF NOT EXISTS licences (
          id            VARCHAR(36)   NOT NULL,
          client_name   VARCHAR(100)  NOT NULL,
          client_email  VARCHAR(255)  DEFAULT NULL,
          licence_key   VARCHAR(64)   NOT NULL,
          type          ENUM('trial','perpetual','subscription') NOT NULL DEFAULT 'perpetual',
          status        ENUM('active','expired','suspended')     NOT NULL DEFAULT 'active',
          modules       JSON          NOT NULL,
          trial_start   DATETIME      DEFAULT NULL,
          trial_end     DATETIME      DEFAULT NULL,
          expires_at    DATETIME      DEFAULT NULL,
          notes         TEXT          DEFAULT NULL,
          created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_licence_key (licence_key),
          KEY idx_status (status),
          KEY idx_type   (type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // ── licence_events ────────────────────────────────────────────────────
      await conn.query(`
        CREATE TABLE IF NOT EXISTS licence_events (
          id          VARCHAR(36)  NOT NULL,
          licence_id  VARCHAR(36)  NOT NULL,
          event_type  VARCHAR(50)  NOT NULL,
          metadata    JSON         DEFAULT NULL,
          created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_levents_licence (licence_id),
          KEY idx_levents_type    (event_type),
          CONSTRAINT fk_levents_licence
            FOREIGN KEY (licence_id) REFERENCES licences(id)
            ON UPDATE CASCADE ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // ── _migrations ───────────────────────────────────────────────────────
      await conn.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id         INT          NOT NULL AUTO_INCREMENT,
          filename   VARCHAR(255) NOT NULL,
          applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_migrations_filename (filename)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('✅ [admin-db] Tables créées/vérifiées (cocaisse_admin)');
    } finally {
      conn.release();
    }
  }
}

export default AdminDatabase;

