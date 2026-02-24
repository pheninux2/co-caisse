/**
 * Co-Caisse Admin — Middleware Auth JWT
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const SECRET = process.env.JWT_SECRET || 'admin_jwt_fallback';

export const authMiddleware = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET);
    req.userId = payload.userId;
    req.role   = payload.role;
    next();
  } catch (e) {
    res.status(401).json({ error: e.name === 'TokenExpiredError' ? 'Token expiré' : 'Token invalide' });
  }
};

