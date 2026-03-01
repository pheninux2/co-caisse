import express from 'express';
import { roleCheck } from '../middleware/auth.js';

const router = express.Router();

// Récupérer les paramètres
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const settings = await db.get('SELECT * FROM settings LIMIT 1');

    if (!settings) {
      // Retourner les valeurs par défaut
      return res.json({
        company_name: '',
        company_address: '',
        company_phone: '',
        company_email: '',
        tax_number: '',
        currency: 'EUR',
        default_tax_rate: 20,
        receipt_header: '',
        receipt_footer: '',
        alert_enabled: 1,
        alert_sound_enabled: 1,
        alert_draft_minutes: 15,
        alert_validated_minutes: 10,
        alert_kitchen_minutes: 20,
        alert_ready_minutes: 5,
        alert_served_minutes: 30,
        alert_remind_after_dismiss: 10
      });
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sauvegarder les paramètres — admin uniquement
router.post('/', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const {
      company_name,
      company_address,
      company_phone,
      company_email,
      tax_number,
      currency = 'EUR',
      default_tax_rate = 20,
      receipt_header,
      receipt_footer,
      alert_enabled = 1,
      alert_sound_enabled = 1,
      alert_draft_minutes = 15,
      alert_validated_minutes = 10,
      alert_kitchen_minutes = 20,
      alert_ready_minutes = 5,
      alert_served_minutes = 30,
      alert_remind_after_dismiss = 10,
      fiscal_chain_enabled = 0,
      fiscal_day_start_hour = 6,
      agec_enabled = 1,
      // RGPD — durée de conservation
      rgpd_retention_months = 120,
      rgpd_logs_retention_months = 12,
    } = req.body;

    // Vérifier si des settings existent déjà
    const existing = await db.get('SELECT id FROM settings LIMIT 1');

    if (existing) {
      // Mise à jour
      await db.run(
        `UPDATE settings SET
          company_name = ?,
          company_address = ?,
          company_phone = ?,
          company_email = ?,
          tax_number = ?,
          currency = ?,
          default_tax_rate = ?,
          receipt_header = ?,
          receipt_footer = ?,
          alert_enabled = ?,
          alert_sound_enabled = ?,
          alert_draft_minutes = ?,
          alert_validated_minutes = ?,
          alert_kitchen_minutes = ?,
          alert_ready_minutes = ?,
          alert_served_minutes = ?,
          alert_remind_after_dismiss = ?,
          fiscal_chain_enabled = ?,
          fiscal_day_start_hour = ?,
          agec_enabled = ?,
          rgpd_retention_months = ?,
          rgpd_logs_retention_months = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          company_name, company_address, company_phone, company_email, tax_number,
          currency, default_tax_rate, receipt_header, receipt_footer,
          alert_enabled, alert_sound_enabled,
          alert_draft_minutes, alert_validated_minutes, alert_kitchen_minutes,
          alert_ready_minutes, alert_served_minutes, alert_remind_after_dismiss,
          fiscal_chain_enabled, fiscal_day_start_hour, agec_enabled,
          Math.max(parseInt(rgpd_retention_months) || 1, 1),
          Math.max(parseInt(rgpd_logs_retention_months) || 1, 1),
          existing.id,
        ]
      );
    } else {
      // Création
      const { v4: uuidv4 } = await import('uuid');
      await db.run(
        `INSERT INTO settings (
          id, company_name, company_address, company_phone, company_email, tax_number,
          currency, default_tax_rate, receipt_header, receipt_footer,
          alert_enabled, alert_sound_enabled,
          alert_draft_minutes, alert_validated_minutes, alert_kitchen_minutes,
          alert_ready_minutes, alert_served_minutes, alert_remind_after_dismiss,
          fiscal_chain_enabled, fiscal_day_start_hour, agec_enabled,
          rgpd_retention_months, rgpd_logs_retention_months
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), company_name, company_address, company_phone, company_email, tax_number,
          currency, default_tax_rate, receipt_header, receipt_footer,
          alert_enabled, alert_sound_enabled,
          alert_draft_minutes, alert_validated_minutes, alert_kitchen_minutes,
          alert_ready_minutes, alert_served_minutes, alert_remind_after_dismiss,
          fiscal_chain_enabled, fiscal_day_start_hour, agec_enabled,
          Math.max(parseInt(rgpd_retention_months) || 1, 1),
          Math.max(parseInt(rgpd_logs_retention_months) || 1, 1),
        ]
      );
    }

    const updated = await db.get('SELECT * FROM settings LIMIT 1');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

