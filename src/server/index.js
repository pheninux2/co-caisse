import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import Database from './database/index.js';
import { authMiddleware, roleCheck } from './middleware/auth.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import transactionRoutes from './routes/transactions.js';
import userRoutes from './routes/users.js';
import reportRoutes from './routes/reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Initialize database
const db = new Database();
await db.initialize();

app.locals.db = db;

// Routes
app.use('/api/products', authMiddleware, productRoutes);
app.use('/api/categories', authMiddleware, categoryRoutes);
app.use('/api/transactions', authMiddleware, transactionRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/reports', authMiddleware, reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message,
    status: err.status || 500
  });
});

app.listen(PORT, () => {
  console.log(`✅ Serveur Co-Caisse démarré sur le port ${PORT}`);
});

export default app;

