/**
 * Co-Caisse — Création d'un compte admin
 *
 * Usage :
 *   node src/database/create-admin.js
 *   node src/database/create-admin.js <username> <password>
 *
 * Exemples :
 *   node src/database/create-admin.js
 *   node src/database/create-admin.js superadmin MonMotDePasse123!
 */

import dotenv from 'dotenv';
import mysql  from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'Admin123!';
const email    = `${username}@cocaisse.fr`;

const pool = mysql.createPool({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER || 'cocaisse',
  password: process.env.DB_PASS || 'cocaisse',
  database: process.env.DB_NAME || 'cocaisse',
});

async function createAdmin() {
  let conn;
  try {
    conn = await pool.getConnection();

    // Vérifier si l'utilisateur existe déjà
    const [existing] = await conn.execute(
      'SELECT id, username, role FROM users WHERE username = ?',
      [username]
    );

    if (existing.length > 0) {
      const u = existing[0];
      if (u.role === 'admin') {
        console.log(`\nℹ️  L'utilisateur "${username}" existe déjà avec le rôle admin.`);
        console.log(`   Mot de passe inchangé.\n`);
      } else {
        // Mettre à jour le rôle en admin + nouveau mot de passe
        const hash = await bcrypt.hash(password, 12);
        await conn.execute(
          'UPDATE users SET role = ?, password = ? WHERE username = ?',
          ['admin', hash, username]
        );
        console.log(`\n✅ Utilisateur "${username}" promu admin avec le nouveau mot de passe.\n`);
      }
      return;
    }

    // Créer le compte admin
    const hash = await bcrypt.hash(password, 12);
    await conn.execute(
      `INSERT INTO users (id, username, password, email, role, profile, active)
       VALUES (?, ?, ?, ?, 'admin', 'standard', 1)`,
      [uuidv4(), username, hash, email]
    );

    console.log('\n╔══════════════════════════════════════╗');
    console.log('║     ✅ Compte admin créé avec succès  ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║  Utilisateur : ${username.padEnd(22)}║`);
    console.log(`║  Mot de passe: ${password.padEnd(22)}║`);
    console.log(`║  Rôle        : admin                 ║`);
    console.log('╚══════════════════════════════════════╝\n');

  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error('\n❌ Impossible de se connecter à MariaDB.');
      console.error('   → Vérifiez que le container Docker est démarré : docker compose up -d\n');
    } else {
      console.error('\n❌ Erreur :', err.message, '\n');
    }
    process.exitCode = 1;
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

createAdmin();

