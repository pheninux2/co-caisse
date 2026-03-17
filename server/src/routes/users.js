/**
 * Co-Caisse — Routes utilisateurs
 *
 * POST /api/users/login  → public (pas de authMiddleware sur ce router dans index.js)
 * Toutes les autres routes → protégées par authMiddleware (déclaré dans index.js)
 */
import express from 'express';
import bcrypt  from 'bcryptjs';
import { authMiddleware, roleCheck, generateToken } from '../middleware/auth.js';
import { UserService } from '../services/user.service.js';
import { requireFields } from '../validators/common.js';

const router = express.Router();

// ── POST /login — Authentification publique ───────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const err = requireFields(req.body, 'username', 'password');
    if (err) return res.status(400).json({ error: err });

    const user = await UserService.getForAuth(req.app.locals.db, username);
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = generateToken(user);
    console.log(`✅ Connexion : ${user.username} (${user.role})`);

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
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await UserService.getByIdSafe(req.app.locals.db, req.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET / — Liste tous les utilisateurs (admin) ───────────────────────────────
router.get('/', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    res.json(await UserService.getAll(req.app.locals.db));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /:id — Détail d'un utilisateur (admin) ────────────────────────────────
router.get('/:id', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    const user = await UserService.getById(req.app.locals.db, req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST / — Créer un utilisateur (admin) ─────────────────────────────────────
router.post('/', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    const err = requireFields(req.body, 'username', 'password', 'role');
    if (err) return res.status(400).json({ error: err });

    res.status(201).json(await UserService.create(req.app.locals.db, req.body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /:id — Modifier un utilisateur (admin) ────────────────────────────────
router.put('/:id', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    res.json(await UserService.update(req.app.locals.db, req.params.id, req.body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /:id — Supprimer un utilisateur (admin) ────────────────────────────
router.delete('/:id', authMiddleware, roleCheck(['admin']), async (req, res) => {
  try {
    await UserService.remove(req.app.locals.db, req.params.id);
    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
