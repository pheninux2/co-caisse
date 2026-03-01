-- =============================================================================
-- Migration 003 — Clôture journalière Z-ticket (NF525 France)
-- Date : 2026-02-28
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ── Table daily_closures ─────────────────────────────────────────────────────
-- Enregistrement immuable de chaque clôture journalière.
-- Une clôture ne peut jamais être supprimée ni modifiée.
CREATE TABLE IF NOT EXISTS `daily_closures` (
  `id`                  VARCHAR(36)    NOT NULL,
  `closure_number`      VARCHAR(10)    NOT NULL UNIQUE
                                       COMMENT 'Numéro séquentiel Z001, Z002…',
  `fiscal_day_start`    DATETIME       NOT NULL
                                       COMMENT 'Début de la journée fiscale (06:00)',
  `fiscal_day_end`      DATETIME       NOT NULL
                                       COMMENT 'Fin de la journée fiscale (05:59 J+1)',
  `closed_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       COMMENT 'Horodatage réel de la clôture',
  `closed_by`           VARCHAR(36)    NOT NULL
                                       COMMENT 'UUID du user admin ayant effectué la clôture',

  -- Totaux globaux
  `transaction_count`   INT            NOT NULL DEFAULT 0,
  `total_ttc`           DOUBLE         NOT NULL DEFAULT 0,
  `total_ht`            DOUBLE         NOT NULL DEFAULT 0,
  `total_tax`           DOUBLE         NOT NULL DEFAULT 0,
  `total_discount`      DOUBLE         NOT NULL DEFAULT 0,

  -- Ventilation TVA (JSON) : [{rate, base_ht, tax_amount, total_ttc}]
  `vat_breakdown`       JSON           DEFAULT NULL,

  -- Ventilation paiements (JSON) : {cash, card, mixed, other}
  `payment_breakdown`   JSON           DEFAULT NULL,

  -- Chaînage fiscal
  `last_transaction_id`   VARCHAR(36)  DEFAULT NULL,
  `last_transaction_hash` VARCHAR(64)  DEFAULT NULL,
  `closure_hash`          VARCHAR(64)  NOT NULL
                                       COMMENT 'HMAC-SHA256 du contenu + last_transaction_hash',

  -- Contenu brut du Z-ticket (pour réimpression)
  `zticket_content`     TEXT           DEFAULT NULL
                                       COMMENT 'Contenu texte du Z-ticket pour réimpression',

  `created_at`          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_daily_closures_fiscal_day`  (`fiscal_day_start`),
  KEY `idx_daily_closures_number`      (`closure_number`),
  KEY `idx_daily_closures_closed_at`   (`closed_at`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Clôtures journalières immuables — Z-tickets NF525'
  -- Empêcher DELETE et UPDATE via trigger
;

-- ── Trigger : empêcher la suppression d'une clôture ─────────────────────────
DROP TRIGGER IF EXISTS `prevent_closure_delete`;
CREATE TRIGGER `prevent_closure_delete`
  BEFORE DELETE ON `daily_closures`
  FOR EACH ROW
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'NF525 : une clôture journalière ne peut pas être supprimée';

-- ── Trigger : empêcher la modification d'une clôture ────────────────────────
DROP TRIGGER IF EXISTS `prevent_closure_update`;
CREATE TRIGGER `prevent_closure_update`
  BEFORE UPDATE ON `daily_closures`
  FOR EACH ROW
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'NF525 : une clôture journalière ne peut pas être modifiée';

-- ── Colonne fiscal_day_start_hour dans settings ──────────────────────────────
-- Heure de début de journée fiscale (défaut : 6 = 06:00)
ALTER TABLE `settings`
  ADD COLUMN IF NOT EXISTS `fiscal_day_start_hour` TINYINT NOT NULL DEFAULT 6
    COMMENT 'Heure de début de journée fiscale (0-23, défaut 6 = 06h00)';

SET FOREIGN_KEY_CHECKS = 1;
-- =============================================================================

