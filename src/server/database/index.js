import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/cocaisse.db');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

class Database {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('Database connection error:', err);
      else console.log('✅ Database connected');
    });
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Users table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT,
            role TEXT NOT NULL DEFAULT 'cashier',
            profile TEXT DEFAULT 'standard',
            active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Categories table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            image_url TEXT,
            color TEXT,
            order_index INTEGER,
            active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Products table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            category_id TEXT NOT NULL,
            price REAL NOT NULL,
            cost REAL,
            tax_rate REAL DEFAULT 20,
            image_url TEXT,
            barcode TEXT UNIQUE,
            stock INTEGER DEFAULT 0,
            active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(category_id) REFERENCES categories(id)
          )
        `);

        // Transactions table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            items TEXT NOT NULL,
            subtotal REAL NOT NULL,
            tax REAL DEFAULT 0,
            discount REAL DEFAULT 0,
            total REAL NOT NULL,
            payment_method TEXT NOT NULL,
            payment_status TEXT DEFAULT 'completed',
            change REAL DEFAULT 0,
            notes TEXT,
            receipt_number TEXT,
            order_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(order_id) REFERENCES orders(id)
          )
        `);

        // Orders table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            order_number TEXT UNIQUE NOT NULL,
            table_number TEXT,
            order_type TEXT DEFAULT 'dine_in',
            status TEXT DEFAULT 'draft',
            items TEXT NOT NULL,
            subtotal REAL NOT NULL,
            tax REAL DEFAULT 0,
            discount REAL DEFAULT 0,
            total REAL NOT NULL,
            customer_name TEXT,
            customer_phone TEXT,
            notes TEXT,
            kitchen_comment TEXT,
            kitchen_handlers TEXT DEFAULT '[]',
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            validated_at DATETIME,
            kitchen_at DATETIME,
            ready_at DATETIME,
            served_at DATETIME,
            paid_at DATETIME,
            transaction_id TEXT,
            FOREIGN KEY(created_by) REFERENCES users(id),
            FOREIGN KEY(transaction_id) REFERENCES transactions(id)
          )
        `);

        // Payment methods table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS payment_methods (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            enabled BOOLEAN DEFAULT 1,
            config TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Settings table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS settings (
            id TEXT PRIMARY KEY,
            company_name TEXT,
            company_address TEXT,
            company_phone TEXT,
            company_email TEXT,
            tax_number TEXT,
            currency TEXT DEFAULT 'EUR',
            default_tax_rate REAL DEFAULT 20,
            receipt_header TEXT,
            receipt_footer TEXT,
            printer_name TEXT,
            cashregister_port TEXT,
            alert_draft_minutes INTEGER DEFAULT 15,
            alert_validated_minutes INTEGER DEFAULT 10,
            alert_kitchen_minutes INTEGER DEFAULT 20,
            alert_ready_minutes INTEGER DEFAULT 5,
            alert_served_minutes INTEGER DEFAULT 30,
            alert_enabled BOOLEAN DEFAULT 1,
            alert_sound_enabled BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Backup table for data export
        this.db.run(`
          CREATE TABLE IF NOT EXISTS backups (
            id TEXT PRIMARY KEY,
            backup_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            backup_type TEXT,
            file_path TEXT,
            size INTEGER,
            status TEXT DEFAULT 'completed'
          )
        `, (err) => {
          if (err) reject(err);
          else {
            // Migration : ajouter les colonnes cuisine si elles n'existent pas
            this.db.run(`ALTER TABLE orders ADD COLUMN kitchen_comment TEXT`, () => {});
            this.db.run(`ALTER TABLE orders ADD COLUMN kitchen_handlers TEXT DEFAULT '[]'`, () => {});
            console.log('✅ All tables created/verified');
            resolve();
          }
        });
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Export data as JSON
  async exportData() {
    const data = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      categories: await this.all('SELECT * FROM categories'),
      products: await this.all('SELECT * FROM products'),
      transactions: await this.all('SELECT * FROM transactions'),
      users: await this.all('SELECT id, username, email, role, profile FROM users'),
      settings: await this.all('SELECT * FROM settings')
    };
    return data;
  }

  // Import data from JSON
  async importData(data) {
    try {
      if (data.categories) {
        for (const cat of data.categories) {
          await this.run(
            `INSERT OR REPLACE INTO categories VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cat.id, cat.name, cat.description, cat.image_url, cat.color, cat.order_index, cat.active, cat.created_at, cat.updated_at]
          );
        }
      }

      if (data.products) {
        for (const prod of data.products) {
          await this.run(
            `INSERT OR REPLACE INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [prod.id, prod.name, prod.description, prod.category_id, prod.price, prod.cost,
             prod.tax_rate, prod.image_url, prod.barcode, prod.stock, prod.active, prod.created_at, prod.updated_at]
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

