import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { roleCheck } from '../middleware/auth.js';

const router = express.Router();

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await db.get(
      'SELECT id, username, email, role, profile, active FROM users WHERE username = ? AND password = ? AND active = 1',
      [username, password]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log(`✅ User ${username} logged in`);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
router.post('/', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { username, password, email, role, profile } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = uuidv4();
    await db.run(
      `INSERT INTO users (id, username, password, email, role, profile)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, username, password, email, role, profile || 'standard']
    );

    const user = await db.get('SELECT id, username, email, role, profile FROM users WHERE id = ?', [id]);
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users
router.get('/', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const users = await db.all('SELECT id, username, email, role, profile, active FROM users ORDER BY username');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user profile (accessible à tous les rôles)
router.get('/me', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = await db.get(
      'SELECT id, username, email, role, profile, active FROM users WHERE id = ? AND active = 1',
      [req.userId]
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID (admin only)
router.get('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = await db.get('SELECT id, username, email, role, profile, active FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user
router.put('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { email, role, profile, active } = req.body;

    await db.run(
      `UPDATE users
       SET email = COALESCE(?, email),
           role = COALESCE(?, role),
           profile = COALESCE(?, profile),
           active = COALESCE(?, active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [email, role, profile, active, req.params.id]
    );

    const user = await db.get('SELECT id, username, email, role, profile, active FROM users WHERE id = ?', [req.params.id]);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

