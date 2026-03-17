import express from 'express';
import { roleCheck } from '../middleware/auth.js';
import { SettingsService } from '../services/settings.service.js';

const router = express.Router();

// Récupérer les paramètres
router.get('/', async (req, res) => {
  try {
    res.json(await SettingsService.get(req.app.locals.db));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sauvegarder les paramètres — admin uniquement
router.post('/', roleCheck(['admin']), async (req, res) => {
  try {
    res.json(await SettingsService.upsert(req.app.locals.db, req.body));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
