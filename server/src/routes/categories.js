import express from 'express';
import { roleCheck } from '../middleware/auth.js';
import { CategoryService } from '../services/category.service.js';
import { requireFields } from '../validators/common.js';

const router = express.Router();

// Get all categories
router.get('/', async (req, res) => {
  try {
    res.json(await CategoryService.getAll(req.app.locals.db));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get category by ID
router.get('/:id', async (req, res) => {
  try {
    const category = await CategoryService.getById(req.app.locals.db, req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post('/', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const err = requireFields(req.body, 'name');
    if (err) return res.status(400).json({ error: err });

    res.status(201).json(await CategoryService.create(req.app.locals.db, req.body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update category
router.put('/:id', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    res.json(await CategoryService.update(req.app.locals.db, req.params.id, req.body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete category
router.delete('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    await CategoryService.remove(req.app.locals.db, req.params.id);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
