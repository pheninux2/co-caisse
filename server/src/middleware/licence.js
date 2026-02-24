/**
 * Co-Caisse — Middleware de licence
 * Version : 1.0.0
 *
 * - Vérifie au démarrage que la licence est valide
 * - Expose req.activeModules sur chaque requête
 * - Si licence expirée/absente → 403 sauf /api/licences/* et /api/users/login
 * - Si module non activé → 403 { error: "Module non activé", module: "X" }
 */

import { getStatus } from '../services/licence.service.js';

// ── Map route → module requis ─────────────────────────────────────────────────
// Toutes les routes non listées ici sont autorisées si la licence est valide.
const ROUTE_MODULE_MAP = [
  { prefix: '/api/orders',       module: 'commandes'   },
  { prefix: '/api/reports',      module: 'statistiques' },
  { prefix: '/api/transactions', module: 'historique'  },
  { prefix: '/api/products',     module: 'gestion'     },
  { prefix: '/api/categories',   module: 'gestion'     },
  { prefix: '/api/users',        module: 'gestion'     },
  // /api/settings → accessible dès que la licence est valide (admin)
];

// Routes totalement exclues du contrôle de licence
const PUBLIC_PATHS = [
  '/api/licences',    // status, trial, activate, validate
  '/api/users/login', // authentification
  '/api/health',
  '/api/admin',       // outil interne co-caisse-admin (auth + gestion licences)
];

// ── Middleware principal ───────────────────────────────────────────────────────
export const licenceMiddleware = async (req, res, next) => {
  // 1. Routes publiques → bypass total
  if (PUBLIC_PATHS.some(p => req.path.startsWith(p.replace('/api', '')))) {
    return next();
  }

  try {
    const db     = req.app.locals.db;
    const status = await getStatus(db);

    // 2. Aucune licence → bloquer sauf routes publiques
    if (!status.hasLicence) {
      return res.status(403).json({
        error:  'Aucune licence active — démarrez un essai ou activez une licence',
        code:   'NO_LICENCE',
      });
    }

    // 3. Licence suspendue → blocage total
    if (status.status === 'suspended') {
      return res.status(403).json({
        error:  'Licence suspendue — contactez le support',
        code:   'LICENCE_SUSPENDED',
        type:   status.type,
        status: 'suspended',
      });
    }

    // 4. Licence expirée → app accessible, mais routes de module bloquées
    //    Le client peut toujours se connecter et voir l'écran de contact.
    if (!status.valid) {
      const fullPath      = req.baseUrl + req.path;
      const matchedEntry  = ROUTE_MODULE_MAP.find(e => fullPath.startsWith(e.prefix));

      if (matchedEntry) {
        return res.status(403).json({
          error:  'Période d\'essai expirée — contactez-nous pour activer votre licence',
          code:   'TRIAL_EXPIRED',
          type:   status.type,
          status: 'expired',
        });
      }

      // Routes non-module (settings, health…) → laisser passer
      req.activeModules = [];
      return next();
    }

    // 5. Exposer les modules actifs sur la requête
    req.activeModules = status.modules || [];

    // 6. Vérifier si la route requiert un module spécifique
    const fullPath = req.baseUrl + req.path; // ex: /api/orders/...
    for (const entry of ROUTE_MODULE_MAP) {
      if (fullPath.startsWith(entry.prefix)) {
        // caisse est toujours autorisé (module de base)
        if (entry.module === 'caisse') break;

        if (!req.activeModules.includes(entry.module)) {
          return res.status(403).json({
            error:  `Module "${entry.module}" non activé sur cette licence`,
            code:   'MODULE_NOT_ACTIVE',
            module: entry.module,
          });
        }
        break;
      }
    }

    next();
  } catch (error) {
    console.error('[licenceMiddleware]', error.message);
    // En cas d'erreur DB inattendue → ne pas bloquer (fail open en dev)
    next();
  }
};

// ── Middleware de vérification de module ──────────────────────────────────────
// Utilisable sur une route spécifique : requireModule('cuisine')
export const requireModule = (moduleName) => (req, res, next) => {
  const active = req.activeModules || [];
  if (!active.includes(moduleName)) {
    return res.status(403).json({
      error:  `Module "${moduleName}" non activé sur cette licence`,
      code:   'MODULE_NOT_ACTIVE',
      module: moduleName,
    });
  }
  next();
};

