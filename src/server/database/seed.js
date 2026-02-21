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

// Simple SVG image generators for testing
function generateProductImage(emoji, color) {
  const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" fill="${color}"/>
    <text x="50" y="60" font-size="50" text-anchor="middle" alignment-baseline="middle">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Connection error:', err);
    process.exit(1);
  }
  console.log('✅ Database connected at:', DB_PATH);
});

async function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function seedDatabase() {
  try {
    console.log('\n🌱 Starting database seed...\n');

    // Drop existing tables first
    console.log('Dropping existing tables...');
    await runQuery('DROP TABLE IF EXISTS orders');
    await runQuery('DROP TABLE IF EXISTS transactions');
    await runQuery('DROP TABLE IF EXISTS products');
    await runQuery('DROP TABLE IF EXISTS categories');
    await runQuery('DROP TABLE IF EXISTS users');
    await runQuery('DROP TABLE IF EXISTS settings');
    console.log('✅ Existing tables dropped\n');

    // Create tables first
    console.log('Creating tables...');

    await runQuery(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'cashier',
      profile TEXT DEFAULT 'standard',
      active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await runQuery(`CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      color TEXT,
      order_index INTEGER,
      active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await runQuery(`CREATE TABLE IF NOT EXISTS products (
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
    )`);

    await runQuery(`CREATE TABLE IF NOT EXISTS transactions (
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
    )`);

    await runQuery(`CREATE TABLE IF NOT EXISTS orders (
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
    )`);

    await runQuery(`CREATE TABLE IF NOT EXISTS settings (
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
      alert_draft_minutes INTEGER DEFAULT 15,
      alert_validated_minutes INTEGER DEFAULT 10,
      alert_kitchen_minutes INTEGER DEFAULT 20,
      alert_ready_minutes INTEGER DEFAULT 5,
      alert_served_minutes INTEGER DEFAULT 30,
      alert_enabled BOOLEAN DEFAULT 1,
      alert_sound_enabled BOOLEAN DEFAULT 1,
      alert_remind_after_dismiss INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('✅ Tables created\n');

    // Insert Categories
    console.log('Inserting categories...');
    const categories = [
      { id: uuidv4(), name: 'Boissons', description: 'Café, thé, jus, sodas', color: '#3B82F6', image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=300&fit=crop', order: 1 },
      { id: uuidv4(), name: 'Viennoiseries', description: 'Croissants, pains au chocolat', color: '#F59E0B', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=300&fit=crop', order: 2 },
      { id: uuidv4(), name: 'Sandwiches', description: 'Baguettes, paninis', color: '#10B981', image: 'https://images.unsplash.com/photo-1553909489-cd47e0907980?w=400&h=300&fit=crop', order: 3 },
      { id: uuidv4(), name: 'Pâtisseries', description: 'Gâteaux, tartes, entremets', color: '#EC4899', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=300&fit=crop', order: 4 },
      { id: uuidv4(), name: 'Snacks', description: 'Chips, biscuits, barres', color: '#8B5CF6', image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400&h=300&fit=crop', order: 5 }
    ];

    for (const cat of categories) {
      await runQuery(
        `INSERT INTO categories (id, name, description, image_url, color, order_index, active) VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [cat.id, cat.name, cat.description, cat.image, cat.color, cat.order]
      );
    }
    console.log(`✅ ${categories.length} categories inserted\n`);

    // Insert Products
    console.log('Inserting products...');
    const products = [
      // Boissons
      { name: 'Café Espresso', cat: 0, price: 1.50, cost: 0.50, stock: 100, barcode: '5412345670001', image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&h=400&fit=crop' },
      { name: 'Café Crème', cat: 0, price: 2.00, cost: 0.65, stock: 80, barcode: '5412345670002', image: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&h=400&fit=crop' },
      { name: 'Thé', cat: 0, price: 1.80, cost: 0.40, stock: 60, barcode: '5412345670003', image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop' },
      { name: 'Jus d\'Orange', cat: 0, price: 2.50, cost: 1.00, stock: 50, barcode: '5412345670004', image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&h=400&fit=crop' },
      { name: 'Coca-Cola', cat: 0, price: 2.20, cost: 0.80, stock: 70, barcode: '5412345670005', image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=400&fit=crop' },
      // Viennoiseries
      { name: 'Croissant', cat: 1, price: 1.20, cost: 0.40, stock: 40, barcode: '5412345671001', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=400&fit=crop' },
      { name: 'Pain au Chocolat', cat: 1, price: 1.50, cost: 0.50, stock: 35, barcode: '5412345671002', image: 'https://images.unsplash.com/photo-1623334044303-241021148842?w=400&h=400&fit=crop' },
      { name: 'Chausson aux Pommes', cat: 1, price: 1.60, cost: 0.55, stock: 30, barcode: '5412345671003', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=400&fit=crop' },
      { name: 'Mille-feuille', cat: 1, price: 2.20, cost: 0.80, stock: 20, barcode: '5412345671004', image: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=400&h=400&fit=crop' },
      { name: 'Donut Sucré', cat: 1, price: 1.80, cost: 0.60, stock: 25, barcode: '5412345671005', image: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop' },
      // Sandwiches
      { name: 'Sandwich Jambon-Fromage', cat: 2, price: 4.50, cost: 1.50, stock: 15, barcode: '5412345672001', image: 'https://images.unsplash.com/photo-1553909489-cd47e0907980?w=400&h=400&fit=crop' },
      { name: 'Panini Thon-Tomate', cat: 2, price: 5.00, cost: 1.80, stock: 12, barcode: '5412345672002', image: 'https://images.unsplash.com/photo-1621852004158-f3bc188ace2d?w=400&h=400&fit=crop' },
      { name: 'Wraps Poulet', cat: 2, price: 5.50, cost: 1.90, stock: 10, barcode: '5412345672003', image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=400&fit=crop' },
      { name: 'Burger Classique', cat: 2, price: 6.00, cost: 2.00, stock: 8, barcode: '5412345672004', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop' },
      // Pâtisseries
      { name: 'Religieuse au Chocolat', cat: 3, price: 2.80, cost: 1.00, stock: 8, barcode: '5412345673001', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=400&fit=crop' },
      { name: 'Éclair Vanille', cat: 3, price: 2.50, cost: 0.85, stock: 12, barcode: '5412345673002', image: 'https://images.unsplash.com/photo-1612201142855-c7d08120d1a3?w=400&h=400&fit=crop' },
      { name: 'Tarte aux Fraises', cat: 3, price: 3.50, cost: 1.30, stock: 6, barcode: '5412345673003', image: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&h=400&fit=crop' },
      { name: 'Tiramisu', cat: 3, price: 3.80, cost: 1.40, stock: 5, barcode: '5412345673004', image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&h=400&fit=crop' },
      { name: 'Mousse au Chocolat', cat: 3, price: 3.20, cost: 1.10, stock: 10, barcode: '5412345673005', image: 'https://images.unsplash.com/photo-1541599468348-e96984315921?w=400&h=400&fit=crop' },
      // Snacks
      { name: 'Chips Nature', cat: 4, price: 1.50, cost: 0.50, stock: 50, barcode: '5412345674001', image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&h=400&fit=crop' },
      { name: 'Barre Chocolatée', cat: 4, price: 1.30, cost: 0.45, stock: 60, barcode: '5412345674002', image: 'https://images.unsplash.com/photo-1606312619070-d48b4cac5ea4?w=400&h=400&fit=crop' },
      { name: 'Biscuits Sablés', cat: 4, price: 1.80, cost: 0.60, stock: 40, barcode: '5412345674003', image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&h=400&fit=crop' },
      { name: 'Muesli Bar', cat: 4, price: 2.00, cost: 0.70, stock: 35, barcode: '5412345674004', image: 'https://images.unsplash.com/photo-1604467715878-83e57e8bc129?w=400&h=400&fit=crop' }
    ];

    let productCount = 0;
    for (const prod of products) {
      await runQuery(
        `INSERT INTO products (id, name, description, category_id, price, cost, tax_rate, image_url, barcode, stock, active)
         VALUES (?, ?, ?, ?, ?, ?, 20, ?, ?, ?, 1)`,
        [uuidv4(), prod.name, '', categories[prod.cat].id, prod.price, prod.cost, prod.image, prod.barcode, prod.stock]
      );
      productCount++;
    }
    console.log(`✅ ${productCount} products inserted\n`);

    // Insert Users
    console.log('Inserting users...');
    const users = [
      { id: uuidv4(), username: 'admin', password: 'admin123', email: 'admin@cocaisse.fr', role: 'admin' },
      { id: uuidv4(), username: 'manager', password: 'manager123', email: 'manager@cocaisse.fr', role: 'manager' },
      { id: uuidv4(), username: 'cashier1', password: 'cashier123', email: 'cashier1@cocaisse.fr', role: 'cashier' },
      { id: uuidv4(), username: 'cashier2', password: 'cashier123', email: 'cashier2@cocaisse.fr', role: 'cashier' }
    ];

    for (const user of users) {
      await runQuery(
        `INSERT INTO users (id, username, password, email, role, profile, active) VALUES (?, ?, ?, ?, ?, 'standard', 1)`,
        [user.id, user.username, user.password, user.email, user.role]
      );
    }
    console.log(`✅ ${users.length} users inserted\n`);

    // Insert Settings
    console.log('Inserting settings...');
    await runQuery(
      `INSERT INTO settings (
        id, company_name, company_address, company_phone, company_email, tax_number, 
        currency, default_tax_rate, receipt_header, receipt_footer,
        alert_draft_minutes, alert_validated_minutes, alert_kitchen_minutes, 
        alert_ready_minutes, alert_served_minutes, alert_enabled, alert_sound_enabled,
        alert_remind_after_dismiss
      ) VALUES (?, ?, ?, ?, ?, ?, 'EUR', 20, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      [
        uuidv4(),
        'Boulangerie Martin',
        '12, rue de la Paix, 75000 PARIS',
        '01 23 45 67 89',
        'contact@boulangerie-martin.fr',
        'FR12345678901',
        '============================\n  BOULANGERIE MARTIN\n  12, rue de la Paix\n  75000 PARIS\nTel: 01 23 45 67 89\n============================',
        'Merci de votre visite !\n============================\nSIRET: 123456789',
        15,  // alert_draft_minutes
        10,  // alert_validated_minutes
        20,  // alert_kitchen_minutes
        5,   // alert_ready_minutes
        30,  // alert_served_minutes
        10   // alert_remind_after_dismiss (relance après 10 min)
      ]
    );
    console.log('✅ Settings inserted\n');

    // Summary
    console.log('\n✨ Database seeded successfully!\n');
    console.log('📝 Test Users:');
    users.forEach(u => console.log(`   - ${u.username} (${u.role}) / Password: ${u.password}`));
    console.log('\n🏪 Categories:', categories.map(c => c.name).join(', '));
    console.log('📦 Total Products:', productCount);
    console.log('\n✅ Ready to use!\n');

    db.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    db.close();
    process.exit(1);
  }
}

seedDatabase();

