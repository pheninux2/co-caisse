-- =============================================================================
-- Migration 007 — RGPD : durée de conservation + table rgpd_purge_logs
-- =============================================================================

-- Paramètres RGPD dans settings
ALTER TABLE `settings`
  ADD COLUMN IF NOT EXISTS `rgpd_retention_months`  SMALLINT UNSIGNED NOT NULL DEFAULT 120
    COMMENT 'Durée de conservation des données clients (mois) — minimum légal 120 (10 ans)',
  ADD COLUMN IF NOT EXISTS `rgpd_logs_retention_months` SMALLINT UNSIGNED NOT NULL DEFAULT 12
    COMMENT 'Durée de conservation des logs applicatifs (mois)';

-- Journal des purges RGPD (immuable — ne jamais supprimer)
CREATE TABLE IF NOT EXISTS `rgpd_purge_logs` (
  `id`                  VARCHAR(36)   NOT NULL PRIMARY KEY,
  `run_at`              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `triggered_by`        VARCHAR(20)   NOT NULL DEFAULT 'cron'
                        COMMENT 'cron | manual',
  `triggered_by_user`   VARCHAR(36)   DEFAULT NULL
                        COMMENT 'UUID admin si déclenchement manuel',
  `retention_months`    SMALLINT      NOT NULL,
  `cutoff_date`         DATETIME      NOT NULL
                        COMMENT 'Date pivot : données antérieures = anonymisées',
  `transactions_anonymized` INT       NOT NULL DEFAULT 0,
  `logs_deleted`        INT           NOT NULL DEFAULT 0,
  `status`              VARCHAR(20)   NOT NULL DEFAULT 'success'
                        COMMENT 'success | error | partial',
  `error_message`       TEXT          DEFAULT NULL,
  `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================

