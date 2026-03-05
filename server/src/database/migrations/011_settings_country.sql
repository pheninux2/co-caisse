-- Migration 011 : Ajout colonne country dans settings
-- Nécessaire pour le wizard de premier démarrage (POST /api/setup/complete)

ALTER TABLE `settings`
  ADD COLUMN IF NOT EXISTS `country` VARCHAR(5) DEFAULT 'FR'
    COMMENT 'Code pays ISO (FR, MA, BE, CH)';

