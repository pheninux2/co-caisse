/**
 * Co-Caisse Admin — Serveur Express dédié
 * Port : 5001 (distinct du serveur client sur 5000)
 */

import express    from 'express';
import cors       from 'cors';
import dotenv     from 'dotenv';
import path       from 'path';
import { fileURLToPath } from 'url';

// Charge le .env depuis la racine co-caisse-admin/ (deux niveaux au-dessus de src/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app  = express();
const PORT = parseInt(process.env.ADMIN_SERVER_PORT || '5001');

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:4000',   // webpack-dev-server renderer
    'http://localhost:5001',
    /^file:\/\//,              // Electron en production
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Database ────────────────────────────────────────────────────────────────
const db = new AdminDatabase();
app.locals.db = db;

// ── Routes ──────────────────────────────────────────────────────────────────
// Route publique : POST /api/auth/login
// Routes protégées : toutes les autres sous /api
app.use('/api', adminRoutes);

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'co-caisse-admin', port: PORT }));

// ── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route introuvable' }));

// ── Démarrage ────────────────────────────────────────────────────────────────
(async () => {
  try {
    await db.initialize();
    app.listen(PORT, () => {
      console.log(`✅ [co-caisse-admin] Serveur démarré sur le port ${PORT}`);
      console.log(`   DB : ${process.env.ADMIN_DB_NAME || 'cocaisse_admin'} @ ${process.env.ADMIN_DB_HOST || 'localhost'}`);
    });
  } catch (err) {
    console.error('❌ Erreur démarrage :', err.message);
    process.exit(1);
  }
})();

