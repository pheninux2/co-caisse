import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { roleCheck } from '../middleware/auth.js';

const router = express.Router();

// Get all categories
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const categories = await db.all('SELECT * FROM categories WHERE active = 1 ORDER BY order_index, name');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get category by ID
router.get('/:id', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const category = await db.get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post('/', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name, description, image_url, color, order_index } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const id = uuidv4();
    await db.run(
      `INSERT INTO categories (id, name, description, image_url, color, order_index)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, description, image_url, color, order_index || 0]
    );

    const category = await db.get('SELECT * FROM categories WHERE id = ?', [id]);
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update category
router.put('/:id', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name, description, image_url, color, order_index, active } = req.body;

    await db.run(
      `UPDATE categories
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           image_url = COALESCE(?, image_url),
           color = COALESCE(?, color),
           order_index = COALESCE(?, order_index),
           active = COALESCE(?, active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, description, image_url, color, order_index, active, req.params.id]
    );

    const category = await db.get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete category
router.delete('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    await db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

