/**
 * =============================================================================
 * Co-Caisse — Seed MariaDB
 * Version  : 2.0.0
 * Date     : 2026-02-22
 *
 * Usage :
 *   node src/server/database/seed.js
 *
 * Prérequis :
 *   - MariaDB démarré et base "cocaisse" créée
 *   - Fichier server/.env avec DB_HOST, DB_USER, DB_PASS, DB_NAME
 *   - npm install (bcryptjs, mysql2, dotenv déjà dans package.json)
 * =============================================================================
 */

import dotenv from 'dotenv';
import mysql  from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// ── 1. Charger les variables d'environnement ──────────────────────────────────
dotenv.config();

// ── 2. Pool de connexion ──────────────────────────────────────────────────────
const pool = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER || 'cocaisse',
  password:           process.env.DB_PASS || 'cocaisse',
  database:           process.env.DB_NAME || 'cocaisse',
  waitForConnections: true,
  connectionLimit:    5,
  charset:            'utf8mb4',
});

// ── 3. Coût bcrypt ─────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;

// ── 4. Helpers ────────────────────────────────────────────────────────────────

/** Exécute une requête en paramétré, lève une exception lisible en cas d'erreur. */
async function q(conn, sql, params = []) {
  try {
    const [result] = await conn.execute(sql, params);
    return result;
  } catch (err) {
    throw new Error(`SQL Error: ${err.message}\n  SQL : ${sql.trim().slice(0, 120)}`);
  }
}

// ── 5. Données de test ────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: uuidv4(), name: 'Boissons',
    description: 'Café, thé, jus, sodas',
    color: '#3B82F6',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=300&fit=crop',
    order: 1,
  },
  {
    id: uuidv4(), name: 'Viennoiseries',
    description: 'Croissants, pains au chocolat',
    color: '#F59E0B',
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=300&fit=crop',
    order: 2,
  },
  {
    id: uuidv4(), name: 'Sandwiches',
    description: 'Baguettes, paninis',
    color: '#10B981',
    image: 'https://images.unsplash.com/photo-1553909489-cd47e0907980?w=400&h=300&fit=crop',
    order: 3,
  },
  {
    id: uuidv4(), name: 'Pâtisseries',
    description: 'Gâteaux, tartes, entremets',
    color: '#EC4899',
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=300&fit=crop',
    order: 4,
  },
  {
    id: uuidv4(), name: 'Snacks',
    description: 'Chips, biscuits, barres',
    color: '#8B5CF6',
    image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400&h=300&fit=crop',
    order: 5,
  },
];

// Index court : 0=Boissons 1=Viennoiseries 2=Sandwiches 3=Pâtisseries 4=Snacks
const PRODUCTS = [
  // ── Boissons (cat 0) ──────────────────────────────────────────────────────
  { name: 'Café Espresso',         cat: 0, price: 1.50, cost: 0.50, stock: 100, barcode: '5412345670001', image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&h=400&fit=crop' },
  { name: 'Café Crème',            cat: 0, price: 2.00, cost: 0.65, stock:  80, barcode: '5412345670002', image: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&h=400&fit=crop' },
  { name: 'Thé',                   cat: 0, price: 1.80, cost: 0.40, stock:  60, barcode: '5412345670003', image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop' },
  { name: "Jus d'Orange",          cat: 0, price: 2.50, cost: 1.00, stock:  50, barcode: '5412345670004', image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&h=400&fit=crop' },
  { name: 'Coca-Cola',             cat: 0, price: 2.20, cost: 0.80, stock:  70, barcode: '5412345670005', image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=400&fit=crop' },

  // ── Viennoiseries (cat 1) ─────────────────────────────────────────────────
  { name: 'Croissant',             cat: 1, price: 1.20, cost: 0.40, stock:  40, barcode: '5412345671001', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=400&fit=crop' },
  { name: 'Pain au Chocolat',      cat: 1, price: 1.50, cost: 0.50, stock:  35, barcode: '5412345671002', image: 'https://images.unsplash.com/photo-1623334044303-241021148842?w=400&h=400&fit=crop' },
  { name: 'Chausson aux Pommes',   cat: 1, price: 1.60, cost: 0.55, stock:  30, barcode: '5412345671003', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=400&fit=crop' },
  { name: 'Mille-feuille',         cat: 1, price: 2.20, cost: 0.80, stock:  20, barcode: '5412345671004', image: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=400&h=400&fit=crop' },
  { name: 'Donut Sucré',           cat: 1, price: 1.80, cost: 0.60, stock:  25, barcode: '5412345671005', image: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop' },

  // ── Sandwiches (cat 2) ────────────────────────────────────────────────────
  { name: 'Sandwich Jambon-Fromage', cat: 2, price: 4.50, cost: 1.50, stock: 15, barcode: '5412345672001', image: 'https://images.unsplash.com/photo-1553909489-cd47e0907980?w=400&h=400&fit=crop' },
  { name: 'Panini Thon-Tomate',      cat: 2, price: 5.00, cost: 1.80, stock: 12, barcode: '5412345672002', image: 'https://images.unsplash.com/photo-1621852004158-f3bc188ace2d?w=400&h=400&fit=crop' },
  { name: 'Wraps Poulet',            cat: 2, price: 5.50, cost: 1.90, stock: 10, barcode: '5412345672003', image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=400&fit=crop' },
  { name: 'Burger Classique',        cat: 2, price: 6.00, cost: 2.00, stock:  8, barcode: '5412345672004', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop' },

  // ── Pâtisseries (cat 3) ───────────────────────────────────────────────────
  { name: 'Religieuse au Chocolat', cat: 3, price: 2.80, cost: 1.00, stock:  8, barcode: '5412345673001', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=400&fit=crop' },
  { name: 'Éclair Vanille',          cat: 3, price: 2.50, cost: 0.85, stock: 12, barcode: '5412345673002', image: 'https://images.unsplash.com/photo-1612201142855-c7d08120d1a3?w=400&h=400&fit=crop' },
  { name: 'Tarte aux Fraises',       cat: 3, price: 3.50, cost: 1.30, stock:  6, barcode: '5412345673003', image: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&h=400&fit=crop' },
  { name: 'Tiramisu',                cat: 3, price: 3.80, cost: 1.40, stock:  5, barcode: '5412345673004', image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&h=400&fit=crop' },
  { name: 'Mousse au Chocolat',      cat: 3, price: 3.20, cost: 1.10, stock: 10, barcode: '5412345673005', image: 'https://images.unsplash.com/photo-1541599468348-e96984315921?w=400&h=400&fit=crop' },

  // ── Snacks (cat 4) ────────────────────────────────────────────────────────
  { name: 'Chips Nature',            cat: 4, price: 1.50, cost: 0.50, stock: 50, barcode: '5412345674001', image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&h=400&fit=crop' },
  { name: 'Barre Chocolatée',        cat: 4, price: 1.30, cost: 0.45, stock: 60, barcode: '5412345674002', image: 'https://images.unsplash.com/photo-1606312619070-d48b4cac5ea4?w=400&h=400&fit=crop' },
  { name: 'Biscuits Sablés',         cat: 4, price: 1.80, cost: 0.60, stock: 40, barcode: '5412345674003', image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&h=400&fit=crop' },
  { name: 'Muesli Bar',              cat: 4, price: 2.00, cost: 0.70, stock: 35, barcode: '5412345674004', image: 'https://images.unsplash.com/photo-1604467715878-83e57e8bc129?w=400&h=400&fit=crop' },
];

// Mots de passe en clair (affichés dans le résumé final — jamais stockés tels quels)
const USERS_RAW = [
  { username: 'admin',    plainPassword: 'Admin123!',    email: 'admin@cocaisse.fr',    role: 'admin'   },
  { username: 'manager',  plainPassword: 'Manager123!',  email: 'manager@cocaisse.fr',  role: 'manager' },
  { username: 'cashier1', plainPassword: 'Cashier123!',  email: 'cashier1@cocaisse.fr', role: 'cashier' },
  { username: 'cashier2', plainPassword: 'Cashier123!',  email: 'cashier2@cocaisse.fr', role: 'cashier' },
  { username: 'cook1',    plainPassword: 'Cook123!',     email: 'cook1@cocaisse.fr',    role: 'cook'    },
];

// ── 6. Fonction principale ────────────────────────────────────────────────────

async function seedDatabase() {
  let conn;

  try {
    conn = await pool.getConnection();
    console.log('\n🌱 Démarrage du seed Co-Caisse (MariaDB)…\n');

    // ── 6.1 Désactiver les FK pour les DROP ──────────────────────────────────
    await q(conn, 'SET FOREIGN_KEY_CHECKS = 0');

    // ── 6.2 Suppression dans l'ordre inverse des dépendances ─────────────────
    console.log('🗑️  Suppression des tables existantes…');
    await q(conn, 'DROP TABLE IF EXISTS `backups`');
    await q(conn, 'DROP TABLE IF EXISTS `settings`');
    await q(conn, 'DROP TABLE IF EXISTS `payment_methods`');
    await q(conn, 'DROP TABLE IF EXISTS `transactions`');
    await q(conn, 'DROP TABLE IF EXISTS `orders`');
    await q(conn, 'DROP TABLE IF EXISTS `products`');
    await q(conn, 'DROP TABLE IF EXISTS `categories`');
    await q(conn, 'DROP TABLE IF EXISTS `users`');
    console.log('   ✅ Tables supprimées\n');

    // ── 6.3 Recréation des tables (schéma complet) ───────────────────────────
    console.log('🏗️  Création des tables…');

    await q(conn, `
      CREATE TABLE \`users\` (
        \`id\`         VARCHAR(36)   NOT NULL,
        \`username\`   VARCHAR(100)  NOT NULL,
        \`password\`   TEXT          NOT NULL,
        \`email\`      VARCHAR(255)  DEFAULT NULL,
        \`role\`       VARCHAR(50)   NOT NULL DEFAULT 'cashier',
        \`profile\`    VARCHAR(50)   DEFAULT 'standard',
        \`active\`     TINYINT(1)    NOT NULL DEFAULT 1,
        \`created_at\` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_users_username\` (\`username\`),
        KEY \`idx_users_role\`   (\`role\`),
        KEY \`idx_users_active\` (\`active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await q(conn, `
      CREATE TABLE \`categories\` (
        \`id\`          VARCHAR(36)   NOT NULL,
        \`name\`        VARCHAR(255)  NOT NULL,
        \`description\` TEXT          DEFAULT NULL,
        \`image_url\`   TEXT          DEFAULT NULL,
        \`color\`       VARCHAR(20)   DEFAULT NULL,
        \`order_index\` INT           DEFAULT NULL,
        \`active\`      TINYINT(1)    NOT NULL DEFAULT 1,
        \`created_at\`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_categories_active\`      (\`active\`),
        KEY \`idx_categories_order_index\` (\`order_index\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await q(conn, `
      CREATE TABLE \`products\` (
        \`id\`          VARCHAR(36)   NOT NULL,
        \`name\`        VARCHAR(255)  NOT NULL,
        \`description\` TEXT          DEFAULT NULL,
        \`category_id\` VARCHAR(36)   NOT NULL,
        \`price\`       DOUBLE        NOT NULL,
        \`cost\`        DOUBLE        DEFAULT NULL,
        \`tax_rate\`    DOUBLE        NOT NULL DEFAULT 20,
        \`image_url\`   TEXT          DEFAULT NULL,
        \`barcode\`     VARCHAR(100)  DEFAULT NULL,
        \`stock\`       INT           NOT NULL DEFAULT 0,
        \`active\`      TINYINT(1)    NOT NULL DEFAULT 1,
        \`created_at\`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_products_barcode\`      (\`barcode\`),
        KEY        \`idx_products_category_id\` (\`category_id\`),
        KEY        \`idx_products_active\`      (\`active\`),
        CONSTRAINT \`fk_products_category\`
          FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`)
          ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await q(conn, `
      CREATE TABLE \`orders\` (
        \`id\`               VARCHAR(36)   NOT NULL,
        \`order_number\`     VARCHAR(100)  NOT NULL,
        \`table_number\`     VARCHAR(50)   DEFAULT NULL,
        \`order_type\`       VARCHAR(50)   NOT NULL DEFAULT 'dine_in',
        \`status\`           VARCHAR(50)   NOT NULL DEFAULT 'draft',
        \`items\`            LONGTEXT      NOT NULL,
        \`subtotal\`         DOUBLE        NOT NULL,
        \`tax\`              DOUBLE        NOT NULL DEFAULT 0,
        \`discount\`         DOUBLE        NOT NULL DEFAULT 0,
        \`total\`            DOUBLE        NOT NULL,
        \`customer_name\`    VARCHAR(255)  DEFAULT NULL,
        \`customer_phone\`   VARCHAR(50)   DEFAULT NULL,
        \`notes\`            TEXT          DEFAULT NULL,
        \`kitchen_comment\`  TEXT          DEFAULT NULL,
        \`kitchen_handlers\` LONGTEXT      NOT NULL DEFAULT '[]',
        \`created_by\`       VARCHAR(36)   NOT NULL,
        \`transaction_id\`   VARCHAR(36)   DEFAULT NULL,
        \`created_at\`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`validated_at\`     DATETIME      NULL     DEFAULT NULL,
        \`kitchen_at\`       DATETIME      NULL     DEFAULT NULL,
        \`ready_at\`         DATETIME      NULL     DEFAULT NULL,
        \`served_at\`        DATETIME      NULL     DEFAULT NULL,
        \`paid_at\`          DATETIME      NULL     DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_orders_order_number\` (\`order_number\`),
        KEY \`idx_orders_status\`       (\`status\`),
        KEY \`idx_orders_created_by\`   (\`created_by\`),
        KEY \`idx_orders_created_at\`   (\`created_at\`),
        CONSTRAINT \`fk_orders_user\`
          FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`)
          ON UPDATE CASCADE ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await q(conn, `
      CREATE TABLE \`transactions\` (
        \`id\`               VARCHAR(36)   NOT NULL,
        \`user_id\`          VARCHAR(36)   NOT NULL,
        \`transaction_date\` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`items\`            LONGTEXT      NOT NULL,
        \`subtotal\`         DOUBLE        NOT NULL,
        \`tax\`              DOUBLE        NOT NULL DEFAULT 0,
        \`discount\`         DOUBLE        NOT NULL DEFAULT 0,
        \`total\`            DOUBLE        NOT NULL,
        \`payment_method\`   VARCHAR(50)   NOT NULL,
        \`payment_status\`   VARCHAR(50)   NOT NULL DEFAULT 'completed',
        \`change\`           DOUBLE        NOT NULL DEFAULT 0,
        \`notes\`            TEXT          DEFAULT NULL,
        \`receipt_number\`   VARCHAR(100)  DEFAULT NULL,
        \`order_id\`         VARCHAR(36)   DEFAULT NULL,
        \`created_at\`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_transactions_receipt\`   (\`receipt_number\`),
        KEY        \`idx_transactions_user_id\`  (\`user_id\`),
        KEY        \`idx_transactions_date\`     (\`transaction_date\`),
        KEY        \`idx_transactions_order_id\` (\`order_id\`),
        CONSTRAINT \`fk_transactions_user\`
          FOREIGN KEY (\`user_id\`)  REFERENCES \`users\`  (\`id\`)
          ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT \`fk_transactions_order\`
          FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`)
          ON UPDATE CASCADE ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // FK circulaire orders → transactions (après création de transactions)
    await q(conn, `
      ALTER TABLE \`orders\`
        ADD CONSTRAINT \`fk_orders_transaction\`
          FOREIGN KEY (\`transaction_id\`) REFERENCES \`transactions\` (\`id\`)
          ON UPDATE CASCADE ON DELETE SET NULL
    `);

    await q(conn, `
      CREATE TABLE \`payment_methods\` (
        \`id\`         VARCHAR(36)   NOT NULL,
        \`name\`       VARCHAR(100)  NOT NULL,
        \`code\`       VARCHAR(50)   NOT NULL,
        \`enabled\`    TINYINT(1)    NOT NULL DEFAULT 1,
        \`config\`     TEXT          DEFAULT NULL,
        \`created_at\` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_payment_methods_code\` (\`code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await q(conn, `
      CREATE TABLE \`settings\` (
        \`id\`                         VARCHAR(36)  NOT NULL,
        \`company_name\`               VARCHAR(255) DEFAULT NULL,
        \`company_address\`            TEXT         DEFAULT NULL,
        \`company_phone\`              VARCHAR(50)  DEFAULT NULL,
        \`company_email\`              VARCHAR(255) DEFAULT NULL,
        \`tax_number\`                 VARCHAR(100) DEFAULT NULL,
        \`currency\`                   VARCHAR(10)  NOT NULL DEFAULT 'EUR',
        \`default_tax_rate\`           DOUBLE       NOT NULL DEFAULT 20,
        \`receipt_header\`             TEXT         DEFAULT NULL,
        \`receipt_footer\`             TEXT         DEFAULT NULL,
        \`printer_name\`               VARCHAR(255) DEFAULT NULL,
        \`cashregister_port\`          VARCHAR(50)  DEFAULT NULL,
        \`alert_draft_minutes\`        INT          NOT NULL DEFAULT 15,
        \`alert_validated_minutes\`    INT          NOT NULL DEFAULT 10,
        \`alert_kitchen_minutes\`      INT          NOT NULL DEFAULT 20,
        \`alert_ready_minutes\`        INT          NOT NULL DEFAULT 5,
        \`alert_served_minutes\`       INT          NOT NULL DEFAULT 30,
        \`alert_enabled\`              TINYINT(1)   NOT NULL DEFAULT 1,
        \`alert_sound_enabled\`        TINYINT(1)   NOT NULL DEFAULT 1,
        \`alert_remind_after_dismiss\` INT          NOT NULL DEFAULT 10,
        \`created_at\`                 DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`                 DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await q(conn, `
      CREATE TABLE \`backups\` (
        \`id\`          VARCHAR(36)  NOT NULL,
        \`backup_date\` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`backup_type\` VARCHAR(50)  DEFAULT NULL,
        \`file_path\`   TEXT         DEFAULT NULL,
        \`size\`        BIGINT       DEFAULT NULL,
        \`status\`      VARCHAR(50)  NOT NULL DEFAULT 'completed',
        PRIMARY KEY (\`id\`),
        KEY \`idx_backups_date\`   (\`backup_date\`),
        KEY \`idx_backups_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Réactiver les FK maintenant que les tables sont créées
    await q(conn, 'SET FOREIGN_KEY_CHECKS = 1');
    console.log('   ✅ Tables créées\n');

    // ── 6.4 Catégories ───────────────────────────────────────────────────────
    console.log('📂 Insertion des catégories…');
    for (const cat of CATEGORIES) {
      await q(conn,
        `INSERT INTO \`categories\`
           (id, name, description, image_url, color, order_index, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [cat.id, cat.name, cat.description, cat.image, cat.color, cat.order]
      );
    }
    console.log(`   ✅ ${CATEGORIES.length} catégories insérées\n`);

    // ── 6.5 Produits ─────────────────────────────────────────────────────────
    console.log('📦 Insertion des produits…');
    let productCount = 0;
    for (const prod of PRODUCTS) {
      await q(conn,
        `INSERT INTO \`products\`
           (id, name, description, category_id, price, cost, tax_rate, image_url, barcode, stock, active)
         VALUES (?, ?, ?, ?, ?, ?, 20, ?, ?, ?, 1)`,
        [
          uuidv4(), prod.name, '',
          CATEGORIES[prod.cat].id,
          prod.price, prod.cost,
          prod.image, prod.barcode, prod.stock,
        ]
      );
      productCount++;
    }
    console.log(`   ✅ ${productCount} produits insérés\n`);

    // ── 6.6 Utilisateurs (mots de passe hashés avec bcrypt) ──────────────────
    console.log('👤 Insertion des utilisateurs (hachage bcrypt en cours…)');
    const usersCreated = [];

    for (const u of USERS_RAW) {
      const id   = uuidv4();
      const hash = await bcrypt.hash(u.plainPassword, BCRYPT_ROUNDS);

      await q(conn,
        `INSERT INTO \`users\`
           (id, username, password, email, role, profile, active)
         VALUES (?, ?, ?, ?, ?, 'standard', 1)`,
        [id, u.username, hash, u.email, u.role]
      );

      usersCreated.push({ id, ...u });
    }
    console.log(`   ✅ ${usersCreated.length} utilisateurs insérés (bcrypt × ${BCRYPT_ROUNDS} rounds)\n`);

    // ── 6.7 Moyens de paiement ────────────────────────────────────────────────
    console.log('💳 Insertion des moyens de paiement…');
    await q(conn,
      `INSERT INTO \`payment_methods\` (id, name, code, enabled) VALUES (?, ?, ?, 1)`,
      [uuidv4(), 'Espèces', 'cash']
    );
    await q(conn,
      `INSERT INTO \`payment_methods\` (id, name, code, enabled) VALUES (?, ?, ?, 1)`,
      [uuidv4(), 'Carte bancaire', 'card']
    );
    console.log('   ✅ 2 moyens de paiement insérés\n');

    // ── 6.8 Paramètres ────────────────────────────────────────────────────────
    console.log('⚙️  Insertion des paramètres…');
    await q(conn,
      `INSERT INTO \`settings\` (
        id, company_name, company_address, company_phone, company_email, tax_number,
        currency, default_tax_rate, receipt_header, receipt_footer,
        alert_draft_minutes, alert_validated_minutes, alert_kitchen_minutes,
        alert_ready_minutes, alert_served_minutes,
        alert_enabled, alert_sound_enabled, alert_remind_after_dismiss
      ) VALUES (?, ?, ?, ?, ?, ?, 'EUR', 20, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      [
        uuidv4(),
        'Boulangerie Martin',
        '12, rue de la Paix, 75000 PARIS',
        '01 23 45 67 89',
        'contact@boulangerie-martin.fr',
        'FR12345678901',
        // receipt_header
        '============================\n  BOULANGERIE MARTIN\n  12, rue de la Paix\n  75000 PARIS\nTel: 01 23 45 67 89\n============================',
        // receipt_footer
        'Merci de votre visite !\n============================\nSIRET: 123456789',
        15,  // alert_draft_minutes
        10,  // alert_validated_minutes
        20,  // alert_kitchen_minutes
        5,   // alert_ready_minutes
        30,  // alert_served_minutes
        10,  // alert_remind_after_dismiss
      ]
    );
    console.log('   ✅ Paramètres insérés\n');

    // ── 6.9 Résumé ────────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════');
    console.log('✨  Seed terminé avec succès !\n');
    console.log('📝  Utilisateurs de test :');
    usersCreated.forEach(u =>
      console.log(`   • ${u.username.padEnd(10)} (${u.role.padEnd(8)})  →  ${u.plainPassword}`)
    );
    console.log('\n🏪  Catégories :', CATEGORIES.map(c => c.name).join(' | '));
    console.log(`📦  Produits   : ${productCount}`);
    console.log('═══════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌  Erreur durant le seed :', err.message);
    process.exitCode = 1;

  } finally {
    // ── Libération garantie de la connexion ─────────────────────────────────
    if (conn) {
      conn.release();
      console.log('🔒  Connexion libérée.');
    }
    await pool.end();
    console.log('🔌  Pool fermé.\n');
  }
}

// ── 7. Point d'entrée ─────────────────────────────────────────────────────────
seedDatabase();

