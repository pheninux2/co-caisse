/**
 * Co-Caisse — Serveur Express
 * Version : 2.0.0 (MariaDB + JWT)
 */

// dotenv DOIT être chargé en premier, avant tout import qui lirait process.env
import dotenv from 'dotenv';
dotenv.config();

import express    from 'express';
import cors       from 'cors';
import bodyParser from 'body-parser';

import Database               from './database/index.js';
import { authMiddleware }     from './middleware/auth.js';
import { licenceMiddleware }  from './middleware/licence.js';
import productRoutes     from './routes/products.js';
import categoryRoutes    from './routes/categories.js';
import transactionRoutes from './routes/transactions.js';
import userRoutes        from './routes/users.js';
import reportRoutes      from './routes/reports.js';
import orderRoutes       from './routes/orders.js';
import settingsRoutes    from './routes/settings.js';
import licenceRoutes     from './routes/licences.js';
import adminRoutes       from './routes/admin.js';
import fiscalRoutes      from './routes/fiscal.js'; // NF525 anti-fraude TVA

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS ──────────────────────────────────────────────────────────────────────
// ALLOWED_ORIGIN accepte plusieurs origines séparées par des virgules
// Ex : http://localhost:3000,http://192.168.1.8:3000
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const isDev = process.env.NODE_ENV !== 'production';

app.use(cors({
  origin: (origin, cb) => {
    // Pas d'origin → Electron (file://), curl, Postman → toujours OK
    if (!origin) return cb(null, true);
    // En dev, accepte aussi toute origine localhost/* ou réseau local
    if (isDev && (origin.includes('localhost') || origin.match(/^http:\/\/192\.168\./))) {
      return cb(null, true);
    }
    if (allowedOrigins.includes(origin)) return cb(null, true);
    console.warn(`[CORS] Origine refusée : ${origin}`);
    cb(new Error(`CORS : origine non autorisée → ${origin}`));
  },
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    true,
}));

console.log(`   CORS origines autorisées : ${allowedOrigins.join(', ')}${isDev ? ' + réseau local (dev)' : ''}`);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ── Base de données ───────────────────────────────────────────────────────────
const db = new Database();
await db.initialize();
app.locals.db = db;

// ── Routes PUBLIQUES (sans JWT, sans contrôle licence) ───────────────────────
app.use('/api/licences', licenceRoutes);   // status, trial, activate, validate
app.use('/api/users',    userRoutes);      // login public + routes protégées internes

// ── Middleware de licence ─────────────────────────────────────────────────────
// Appliqué APRÈS les routes publiques — bloque si licence absente/expirée
// et vérifie que le module requis est activé sur chaque route
app.use(licenceMiddleware);

// ── Routes protégées par JWT ──────────────────────────────────────────────────
app.use('/api/products',     authMiddleware, productRoutes);
app.use('/api/categories',   authMiddleware, categoryRoutes);
app.use('/api/transactions', authMiddleware, transactionRoutes);
app.use('/api/orders',       authMiddleware, orderRoutes);
app.use('/api/reports',      authMiddleware, reportRoutes);
app.use('/api/settings',     authMiddleware, settingsRoutes);
app.use('/api/admin',        adminRoutes);   // auth + roleCheck admin dans le router
app.use('/api/fiscal',       authMiddleware, fiscalRoutes); // NF525 anti-fraude TVA

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), version: '2.0.0' });
});

// ── Gestionnaire d'erreurs global ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error:  err.message,
    status: err.status || 500,
  });
});

// ── Démarrage ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Serveur Co-Caisse démarré sur le port ${PORT}`);
  console.log(`   CORS autorisé pour : ${allowedOrigins.join(', ')}`);
});

export default app;

