import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { roleCheck } from '../middleware/auth.js';

const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const products = await db.all(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY c.name, p.name
    `);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product
router.post('/', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name, description, category_id, price, cost, tax_rate, image_url, barcode, stock } = req.body;

    if (!name || !category_id || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = uuidv4();
    await db.run(
      `INSERT INTO products (id, name, description, category_id, price, cost, tax_rate, image_url, barcode, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, category_id, price, cost, tax_rate || 20, image_url, barcode, stock || 0]
    );

    const product = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product
router.put('/:id', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name, description, category_id, price, cost, tax_rate, image_url, barcode, stock, active } = req.body;

    await db.run(
      `UPDATE products
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           category_id = COALESCE(?, category_id),
           price = COALESCE(?, price),
           cost = COALESCE(?, cost),
           tax_rate = COALESCE(?, tax_rate),
           image_url = COALESCE(?, image_url),
           barcode = COALESCE(?, barcode),
           stock = COALESCE(?, stock),
           active = COALESCE(?, active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, description, category_id, price, cost, tax_rate, image_url, barcode, stock, active, req.params.id]
    );

    const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product
router.delete('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get products by category
router.get('/category/:category_id', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const products = await db.all(
      'SELECT * FROM products WHERE category_id = ? AND active = 1 ORDER BY name',
      [req.params.category_id]
    );
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search products
router.get('/search/:query', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const query = `%${req.params.query}%`;
    const products = await db.all(
      `SELECT * FROM products WHERE (name LIKE ? OR barcode LIKE ?) AND active = 1`,
      [query, query]
    );
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

