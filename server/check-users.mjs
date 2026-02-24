import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
dotenv.config();
const pool = mysql.createPool({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
const [rows] = await pool.query("SELECT username, role, active FROM users ORDER BY role");
console.table(rows);
await pool.end();

