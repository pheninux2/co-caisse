-- =============================================================================
-- Migration 001 — Tables licences & licence_events (DB client)
-- Date     : 2026-02-24
-- Moteur   : MariaDB 10.6+ / InnoDB
--
-- La DB client stocke la clé activée localement (vérification HMAC hors ligne).
-- L'historique complet des licences est dans cocaisse_admin (DB admin).
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ── licences ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `licences` (
  `id`          VARCHAR(36)   NOT NULL,
  `client_name` VARCHAR(100)  NOT NULL,
  `licence_key` VARCHAR(64)   NOT NULL,
  `type`        ENUM('trial','perpetual','subscription') NOT NULL DEFAULT 'perpetual',
  `status`      ENUM('active','expired','suspended')     NOT NULL DEFAULT 'active',
  `modules`     JSON          NOT NULL,
  `trial_start` DATETIME      DEFAULT NULL,
  `trial_end`   DATETIME      DEFAULT NULL,
  `expires_at`  DATETIME      DEFAULT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_licence_key` (`licence_key`),
  KEY `idx_licences_status` (`status`),
  KEY `idx_licences_type`   (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Licence activée localement sur cette installation';

-- ── licence_events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `licence_events` (
  `id`         VARCHAR(36)  NOT NULL,
  `licence_id` VARCHAR(36)  NOT NULL,
  `event_type` VARCHAR(50)  NOT NULL,
  `metadata`   JSON         DEFAULT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_levents_licence` (`licence_id`),
  KEY `idx_levents_type`    (`event_type`),
  CONSTRAINT `fk_levents_licence`
    FOREIGN KEY (`licence_id`) REFERENCES `licences` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Journal des événements de licence (trial_started, activated, expired…)';

SET FOREIGN_KEY_CHECKS = 1;