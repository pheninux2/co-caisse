-- =============================================================================
-- Migration 002 — Chaînage fiscal NF525 (anti-fraude TVA France)
-- Date     : 2026-02-28
-- Moteur   : MariaDB 10.6+ / InnoDB
--
-- Ajoute :
--   1. Colonne transaction_hash dans la table transactions
--   2. Table fiscal_chain (dernier hash de la chaîne)
--   3. Table fiscal_anomalies (journal des ruptures de chaîne détectées)
--   4. Colonne fiscal_chain_enabled dans settings (activation/désactivation)
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ── 1. Colonne transaction_hash ──────────────────────────────────────────────
-- NULL si le chaînage n'était pas encore activé lors de la transaction
ALTER TABLE `transactions`
  ADD COLUMN IF NOT EXISTS `transaction_hash` VARCHAR(64) DEFAULT NULL
    COMMENT 'HMAC-SHA256 de la transaction + hash précédent (NF525)';

-- ── 2. Table fiscal_chain ────────────────────────────────────────────────────
-- Singleton : une seule ligne, contenant le dernier hash connu de la chaîne
CREATE TABLE IF NOT EXISTS `fiscal_chain` (
  `id`           INT           NOT NULL DEFAULT 1,
  `last_hash`    VARCHAR(64)   NOT NULL DEFAULT 'GENESIS',
  `last_tx_id`   VARCHAR(36)   DEFAULT NULL
                               COMMENT 'ID de la dernière transaction chaînée',
  `chain_length` BIGINT        NOT NULL DEFAULT 0
                               COMMENT 'Nombre de transactions dans la chaîne',
  `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Singleton — dernier hash de la chaîne fiscale NF525';

-- Insérer la ligne singleton si absente
INSERT IGNORE INTO `fiscal_chain` (`id`, `last_hash`, `chain_length`)
  VALUES (1, 'GENESIS', 0);

-- ── 3. Table fiscal_anomalies ─────────────────────────────────────────────────
-- Journal des ruptures de chaîne détectées lors d'une vérification
CREATE TABLE IF NOT EXISTS `fiscal_anomalies` (
  `id`               VARCHAR(36)   NOT NULL,
  `detected_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `tx_id`            VARCHAR(36)   NOT NULL
                                   COMMENT 'ID de la transaction en rupture',
  `expected_hash`    VARCHAR(64)   NOT NULL,
  `actual_hash`      VARCHAR(64)   DEFAULT NULL,
  `anomaly_type`     VARCHAR(50)   NOT NULL DEFAULT 'hash_mismatch',
                                   -- Valeurs : hash_mismatch  missing_hash  order_break
  `details`          TEXT          DEFAULT NULL,
  `resolved`         TINYINT(1)    NOT NULL DEFAULT 0,
  `resolved_at`      DATETIME      DEFAULT NULL,
  `resolved_by`      VARCHAR(36)   DEFAULT NULL,

  PRIMARY KEY (`id`),
  KEY `idx_fiscal_anomalies_detected_at` (`detected_at`),
  KEY `idx_fiscal_anomalies_tx_id`       (`tx_id`),
  KEY `idx_fiscal_anomalies_resolved`    (`resolved`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Journal des anomalies fiscales détectées (ruptures de chaîne NF525)';

-- ── 4. Colonne fiscal_chain_enabled dans settings ────────────────────────────
ALTER TABLE `settings`
  ADD COLUMN IF NOT EXISTS `fiscal_chain_enabled` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Activer le chaînage HMAC-SHA256 NF525 (loi anti-fraude TVA)';

SET FOREIGN_KEY_CHECKS = 1;
-- =============================================================================

