import express from 'express';
import { roleCheck } from '../middleware/auth.js';
import { ProductService } from '../services/product.service.js';
import { requireFields, isPositiveNumber, firstError } from '../validators/common.js';

const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    res.json(await ProductService.getAll(req.app.locals.db));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get products by category
router.get('/category/:category_id', async (req, res) => {
  try {
    res.json(await ProductService.getByCategory(req.app.locals.db, req.params.category_id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search products
router.get('/search/:query', async (req, res) => {
  try {
    res.json(await ProductService.search(req.app.locals.db, req.params.query));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await ProductService.getById(req.app.locals.db, req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product
router.post('/', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const err = firstError(
      requireFields(req.body, 'name', 'category_id', 'price'),
      isPositiveNumber(req.body.price, 'price')
    );
    if (err) return res.status(400).json({ error: err });

    res.status(201).json(await ProductService.create(req.app.locals.db, req.body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product
router.put('/:id', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    res.json(await ProductService.update(req.app.locals.db, req.params.id, req.body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product
router.delete('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    await ProductService.remove(req.app.locals.db, req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
