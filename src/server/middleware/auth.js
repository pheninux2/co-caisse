// Middleware d'authentification
export const authMiddleware = (req, res, next) => {
  // TODO: Implémenter JWT ou session
  // Pour le développement, on accepte toutes les requêtes
  req.userId = req.headers['user-id'] || 'system';
  req.role = req.headers['user-role'] || 'admin';
  next();
};

// Vérifier les rôles
export const roleCheck = (allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};

