import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'cocaisse',
  password: process.env.DB_PASS || 'cocaisse',
  database: process.env.DB_NAME || 'cocaisse',
});

try {
  const hash = await bcrypt.hash('Admin123!', 12);
  const id   = uuidv4();

  // Supprimer si existe déjà
  await pool.query("DELETE FROM users WHERE username = 'admin'");

  // Recréer proprement
  await pool.query(
    "INSERT INTO users (id, username, password, email, role, profile, active) VALUES (?, 'admin', ?, 'admin@cocaisse.fr', 'admin', 'standard', 1)",
    [id, hash]
  );

  console.log('\n✅ Compte admin créé !');
  console.log('   username : admin');
  console.log('   password : Admin123!');
  console.log('   role     : admin\n');

  const [rows] = await pool.query("SELECT username, role, active FROM users ORDER BY role");
  console.table(rows);

} catch(e) {
  console.error('❌ Erreur :', e.message);
} finally {
  await pool.end();
}

