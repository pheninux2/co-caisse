/**
 * Co-Caisse — Routes utilisateurs
 * Version : 2.0.0 (bcrypt + JWT)
 *
 * POST /api/users/login  → public (pas de authMiddleware sur ce router dans index.js)
 * Toutes les autres routes → protégées par authMiddleware (déclaré dans index.js)
 */

import express from 'express';
import bcrypt  from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, roleCheck, generateToken } from '../middleware/auth.js';

const router = express.Router();

const BCRYPT_ROUNDS = 12;

// ── POST /login — Authentification publique ───────────────────────────────────
// Cette route N'est PAS protégée par authMiddleware.
// index.js monte le router sur /api/users sans guard, les autres routes
// sont protégées individuellement ci-dessous.
router.post('/login', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }

    // Récupérer l'utilisateur (avec le hash — champ password inclus)
    const user = await db.get(
      'SELECT * FROM `users` WHERE username = ? AND active = 1',
      [username]
    );

    if (!user) {
      // Réponse volontairement générique pour ne pas divulguer l'existence du compte
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Comparer le mot de passe fourni avec le hash bcrypt stocké
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Générer le JWT
    const token = generateToken(user);

    console.log(`✅ Connexion : ${user.username} (${user.role})`);

    // Répondre sans renvoyer le hash
    res.json({
      token,
      user: {
        id:       user.id,
        username: user.username,
        email:    user.email,
        role:     user.role,
        profile:  user.profile,
        active:   user.active,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /me — Profil de l'utilisateur connecté ───────────────────────────────
// Accessible à tous les rôles authentifiés
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db   = req.app.locals.db;
    const user = await db.get(
      'SELECT id, username, email, role, profile, active FROM `users` WHERE id = ? AND active = 1',
      [req.userId]
    );

    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET / — Liste tous les utilisateurs (admin) ───────────────────────────────
router.get('/', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const users = await db.all(
      'SELECT id, username, email, role, profile, active FROM `users` ORDER BY username'
    );
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /:id — Détail d'un utilisateur (admin) ────────────────────────────────
router.get('/:id', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    const db   = req.app.locals.db;
    const user = await db.get(
      'SELECT id, username, email, role, profile, active FROM `users` WHERE id = ?',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST / — Créer un utilisateur (admin) ─────────────────────────────────────
router.post('/', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { username, password, email, role, profile } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Champs requis manquants : username, password, role' });
    }

    const id   = uuidv4();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await db.run(
      'INSERT INTO `users` (id, username, password, email, role, profile) VALUES (?, ?, ?, ?, ?, ?)',
      [id, username, hash, email, role, profile || 'standard']
    );

    const user = await db.get(
      'SELECT id, username, email, role, profile, active FROM `users` WHERE id = ?',
      [id]
    );
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /:id — Modifier un utilisateur (admin) ────────────────────────────────
router.put('/:id', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { email, role, profile, active, password } = req.body;

    // Si un nouveau mot de passe est fourni, le hasher
    if (password) {
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await db.run(
        `UPDATE \`users\` SET
           email    = COALESCE(?, email),
           role     = COALESCE(?, role),
           profile  = COALESCE(?, profile),
           active   = COALESCE(?, active),
           password = ?
         WHERE id = ?`,
        [email, role, profile, active, hash, req.params.id]
      );
    } else {
      await db.run(
        `UPDATE \`users\` SET
           email   = COALESCE(?, email),
           role    = COALESCE(?, role),
           profile = COALESCE(?, profile),
           active  = COALESCE(?, active)
         WHERE id = ?`,
        [email, role, profile, active, req.params.id]
      );
    }

    const user = await db.get(
      'SELECT id, username, email, role, profile, active FROM `users` WHERE id = ?',
      [req.params.id]
    );
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /:id — Supprimer un utilisateur (admin) ────────────────────────────
router.delete('/:id', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    await db.run('DELETE FROM `users` WHERE id = ?', [req.params.id]);
    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

