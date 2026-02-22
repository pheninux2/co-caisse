/**
 * Co-Caisse — Middleware d'authentification JWT
 * Version : 2.0.0
 *
 * Chaque requête protégée doit porter :
 *   Authorization: Bearer <token>
 *
 * Le token est signé avec JWT_SECRET (variable d'environnement).
 * Il contient { userId, role, username }.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cocaisse_dev_secret_changeme';

// ── authMiddleware ─────────────────────────────────────────────────────────────
// Vérifie la présence et la validité du JWT.
// Injecte req.userId, req.role, req.username si le token est valide.
// Laisse passer sans auth la route POST /api/users/login.
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant — Authorization: Bearer <token> requis' });
  }

  const token = authHeader.slice(7); // retire "Bearer "

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId   = payload.userId;
    req.role     = payload.role;
    req.username = payload.username;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré — veuillez vous reconnecter' });
    }
    return res.status(401).json({ error: 'Token invalide' });
  }
};

// ── roleCheck ─────────────────────────────────────────────────────────────────
// Middleware de vérification de rôle, à utiliser après authMiddleware.
// Ex : router.post('/', roleCheck(['admin','manager']), handler)
export const roleCheck = (allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.role)) {
    return res.status(403).json({
      error: `Accès refusé — rôle requis : ${allowedRoles.join(' | ')} (rôle actuel : ${req.role})`,
    });
  }
  next();
};

// ── generateToken ──────────────────────────────────────────────────────────────
// Utilitaire exporté pour la route /login dans users.js
export const generateToken = (user) => {
  return jwt.sign(
    { userId: user.id, role: user.role, username: user.username },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

