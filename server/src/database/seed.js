/**
 * =============================================================================
 * Co-Caisse — Seed MariaDB
 * Version  : 2.0.0
 * Date     : 2026-02-22
 * =============================================================================
 */

import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import Database from './index.js';

// ── 1. Charger les variables d'environnement ──────────────────────────────────
dotenv.config();

// ── 2. Coût bcrypt ─────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;

// ── 3. Helpers ────────────────────────────────────────────────────────────────
async function q(conn, sql, params = []) {
  try {
    const [result] = await conn.execute(sql, params);
    return result;
  } catch (err) {
    throw new Error(`SQL Error: ${err.message}\n  SQL : ${sql.trim().slice(0, 120)}`);
  }
}

// ── 4. Données de test ────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: uuidv4(), name: 'Boissons',     description: 'Café, thé, jus, sodas',           color: '#3B82F6', image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=300&fit=crop', order: 1 },
  { id: uuidv4(), name: 'Viennoiseries',description: 'Croissants, pains au chocolat',    color: '#F59E0B', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=300&fit=crop', order: 2 },
  { id: uuidv4(), name: 'Sandwiches',   description: 'Baguettes, paninis',               color: '#10B981', image: 'https://images.unsplash.com/photo-1553909489-cd47e0907980?w=400&h=300&fit=crop', order: 3 },
  { id: uuidv4(), name: 'Pâtisseries',  description: 'Gâteaux, tartes, entremets',       color: '#EC4899', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=300&fit=crop', order: 4 },
  { id: uuidv4(), name: 'Snacks',       description: 'Chips, biscuits, barres',           color: '#8B5CF6', image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400&h=300&fit=crop', order: 5 },
];

const PRODUCTS = [
  { name: 'Café Espresso',           cat: 0, price: 1.50, cost: 0.50, stock: 100, barcode: '5412345670001', image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&h=400&fit=crop' },
  { name: 'Café Crème',              cat: 0, price: 2.00, cost: 0.65, stock:  80, barcode: '5412345670002', image: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&h=400&fit=crop' },
  { name: 'Thé',                     cat: 0, price: 1.80, cost: 0.40, stock:  60, barcode: '5412345670003', image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop' },
  { name: "Jus d'Orange",            cat: 0, price: 2.50, cost: 1.00, stock:  50, barcode: '5412345670004', image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&h=400&fit=crop' },
  { name: 'Coca-Cola',               cat: 0, price: 2.20, cost: 0.80, stock:  70, barcode: '5412345670005', image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=400&fit=crop' },
  { name: 'Croissant',               cat: 1, price: 1.20, cost: 0.40, stock:  40, barcode: '5412345671001', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=400&fit=crop' },
  { name: 'Pain au Chocolat',        cat: 1, price: 1.50, cost: 0.50, stock:  35, barcode: '5412345671002', image: 'https://images.unsplash.com/photo-1623334044303-241021148842?w=400&h=400&fit=crop' },
  { name: 'Chausson aux Pommes',     cat: 1, price: 1.60, cost: 0.55, stock:  30, barcode: '5412345671003', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=400&fit=crop' },
  { name: 'Mille-feuille',           cat: 1, price: 2.20, cost: 0.80, stock:  20, barcode: '5412345671004', image: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=400&h=400&fit=crop' },
  { name: 'Donut Sucré',             cat: 1, price: 1.80, cost: 0.60, stock:  25, barcode: '5412345671005', image: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop' },
  { name: 'Sandwich Jambon-Fromage', cat: 2, price: 4.50, cost: 1.50, stock:  15, barcode: '5412345672001', image: 'https://images.unsplash.com/photo-1553909489-cd47e0907980?w=400&h=400&fit=crop' },
  { name: 'Panini Thon-Tomate',      cat: 2, price: 5.00, cost: 1.80, stock:  12, barcode: '5412345672002', image: 'https://images.unsplash.com/photo-1621852004158-f3bc188ace2d?w=400&h=400&fit=crop' },
  { name: 'Wraps Poulet',            cat: 2, price: 5.50, cost: 1.90, stock:  10, barcode: '5412345672003', image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=400&fit=crop' },
  { name: 'Burger Classique',        cat: 2, price: 6.00, cost: 2.00, stock:   8, barcode: '5412345672004', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop' },
  { name: 'Religieuse au Chocolat',  cat: 3, price: 2.80, cost: 1.00, stock:   8, barcode: '5412345673001', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=400&fit=crop' },
  { name: 'Éclair Vanille',          cat: 3, price: 2.50, cost: 0.85, stock:  12, barcode: '5412345673002', image: 'https://images.unsplash.com/photo-1612201142855-c7d08120d1a3?w=400&h=400&fit=crop' },
  { name: 'Tarte aux Fraises',       cat: 3, price: 3.50, cost: 1.30, stock:   6, barcode: '5412345673003', image: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&h=400&fit=crop' },
  { name: 'Tiramisu',                cat: 3, price: 3.80, cost: 1.40, stock:   5, barcode: '5412345673004', image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&h=400&fit=crop' },
  { name: 'Mousse au Chocolat',      cat: 3, price: 3.20, cost: 1.10, stock:  10, barcode: '5412345673005', image: 'https://images.unsplash.com/photo-1541599468348-e96984315921?w=400&h=400&fit=crop' },
  { name: 'Chips Nature',            cat: 4, price: 1.50, cost: 0.50, stock:  50, barcode: '5412345674001', image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&h=400&fit=crop' },
  { name: 'Barre Chocolatée',        cat: 4, price: 1.30, cost: 0.45, stock:  60, barcode: '5412345674002', image: 'https://images.unsplash.com/photo-1606312619070-d48b4cac5ea4?w=400&h=400&fit=crop' },
  { name: 'Biscuits Sablés',         cat: 4, price: 1.80, cost: 0.60, stock:  40, barcode: '5412345674003', image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&h=400&fit=crop' },
  { name: 'Muesli Bar',              cat: 4, price: 2.00, cost: 0.70, stock:  35, barcode: '5412345674004', image: 'https://images.unsplash.com/photo-1604467715878-83e57e8bc129?w=400&h=400&fit=crop' },
];

const USERS_RAW = [
  { username: 'admin',    plainPassword: 'Admin123!',   email: 'admin@cocaisse.fr',    role: 'admin'   },
  { username: 'manager',  plainPassword: 'Manager123!', email: 'manager@cocaisse.fr',  role: 'manager' },
  { username: 'cashier1', plainPassword: 'Cashier123!', email: 'cashier1@cocaisse.fr', role: 'cashier' },
  { username: 'cashier2', plainPassword: 'Cashier123!', email: 'cashier2@cocaisse.fr', role: 'cashier' },
  { username: 'cook1',    plainPassword: 'Cook123!',    email: 'cook1@cocaisse.fr',    role: 'cook'    },
];

// ── 5. Fonction principale ────────────────────────────────────────────────────
async function seedDatabase() {
  let conn;

  // ── Initialiser DB + jouer les migrations automatiquement ────────────────
  console.log('\n🌱 Démarrage du seed Co-Caisse (MariaDB)…\n');
  const db = new Database();
  await db.initialize(); // crée toutes les tables + joue les migrations

  try {
    conn = await db.pool.getConnection();

    // ── Désactiver les FK pour les DELETE ────────────────────────────────────
    await q(conn, 'SET FOREIGN_KEY_CHECKS = 0');

    // ── Suppression dans l'ordre inverse des dépendances ─────────────────────
    // NOTE : licences / licence_events sont dans la DB co-caisse-admin — pas ici
    console.log('🗑️  Suppression des données existantes…');
    await q(conn, 'DELETE FROM `_migrations`');
    await q(conn, 'DELETE FROM `backups`');
    await q(conn, 'DELETE FROM `settings`');
    await q(conn, 'DELETE FROM `payment_methods`');
    await q(conn, 'DELETE FROM `transactions`');
    await q(conn, 'DELETE FROM `orders`');
    await q(conn, 'DELETE FROM `products`');
    await q(conn, 'DELETE FROM `categories`');
    await q(conn, 'DELETE FROM `users`');
    await q(conn, 'SET FOREIGN_KEY_CHECKS = 1');
    console.log('   ✅ Données supprimées\n');

    // ── Catégories ───────────────────────────────────────────────────────────
    console.log('📂 Insertion des catégories…');
    for (const cat of CATEGORIES) {
      await q(conn,
        `INSERT INTO \`categories\` (id, name, description, image_url, color, order_index, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [cat.id, cat.name, cat.description, cat.image, cat.color, cat.order]
      );
    }
    console.log(`   ✅ ${CATEGORIES.length} catégories insérées\n`);

    // ── Produits ─────────────────────────────────────────────────────────────
    console.log('📦 Insertion des produits…');
    let productCount = 0;
    for (const prod of PRODUCTS) {
      await q(conn,
        `INSERT INTO \`products\`
           (id, name, description, category_id, price, cost, tax_rate, image_url, barcode, stock, active)
         VALUES (?, ?, ?, ?, ?, ?, 20, ?, ?, ?, 1)`,
        [uuidv4(), prod.name, '', CATEGORIES[prod.cat].id, prod.price, prod.cost, prod.image, prod.barcode, prod.stock]
      );
      productCount++;
    }
    console.log(`   ✅ ${productCount} produits insérés\n`);

    // ── Utilisateurs (bcrypt) ─────────────────────────────────────────────────
    console.log('👤 Insertion des utilisateurs (hachage bcrypt en cours…)');
    const usersCreated = [];
    for (const u of USERS_RAW) {
      const id   = uuidv4();
      const hash = await bcrypt.hash(u.plainPassword, BCRYPT_ROUNDS);
      await q(conn,
        `INSERT INTO \`users\` (id, username, password, email, role, profile, active)
         VALUES (?, ?, ?, ?, ?, 'standard', 1)`,
        [id, u.username, hash, u.email, u.role]
      );
      usersCreated.push({ id, ...u });
    }
    console.log(`   ✅ ${usersCreated.length} utilisateurs insérés (bcrypt × ${BCRYPT_ROUNDS} rounds)\n`);

    // ── Moyens de paiement ────────────────────────────────────────────────────
    console.log('💳 Insertion des moyens de paiement…');
    await q(conn, `INSERT INTO \`payment_methods\` (id, name, code, enabled) VALUES (?, 'Espèces', 'cash', 1)`,       [uuidv4()]);
    await q(conn, `INSERT INTO \`payment_methods\` (id, name, code, enabled) VALUES (?, 'Carte bancaire', 'card', 1)`, [uuidv4()]);
    console.log('   ✅ 2 moyens de paiement insérés\n');

    // ── Paramètres ────────────────────────────────────────────────────────────
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
        'Boulangerie Martin', '12, rue de la Paix, 75000 PARIS', '01 23 45 67 89',
        'contact@boulangerie-martin.fr', 'FR12345678901',
        '============================\n  BOULANGERIE MARTIN\n  12, rue de la Paix\n  75000 PARIS\nTel: 01 23 45 67 89\n============================',
        'Merci de votre visite !\n============================\nSIRET: 123456789',
        15, 10, 20, 5, 30, 10,
      ]
    );
    console.log('   ✅ Paramètres insérés\n');

    // ── Résumé ────────────────────────────────────────────────────────────────
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
    if (conn) {
      conn.release();
      console.log('🔒  Connexion libérée.');
    }
    await db.pool.end();
    console.log('🔌  Pool fermé.\n');
  }
}

// ── Point d'entrée ────────────────────────────────────────────────────────────
seedDatabase();

