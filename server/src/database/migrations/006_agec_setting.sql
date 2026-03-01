-- =============================================================================
-- Migration 006 — Option activation ticket dématérialisé AGEC
-- =============================================================================

ALTER TABLE `settings`
  ADD COLUMN IF NOT EXISTS `agec_enabled` TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Activer la proposition de ticket dématérialisé (loi AGEC août 2023)';

-- =============================================================================

