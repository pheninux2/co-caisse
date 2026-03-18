-- Migration 013 : Attribution de tables aux serveurs + logs d'audit + permissions can_see_all_orders

-- Ajout permission can_see_all_orders sur les utilisateurs
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `can_see_all_orders` TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Permission : peut voir les commandes de tous les serveurs (accordée par l''admin)';

-- Ajout serveur assigné sur les tables
ALTER TABLE `tables`
  ADD COLUMN IF NOT EXISTS `assigned_waiter_id` VARCHAR(36) DEFAULT NULL
  COMMENT 'Serveur (user.id) assigné à cette table — NULL = table libre pour tous';

-- Ajout paramètres de mode tables dans settings
ALTER TABLE `settings`
  ADD COLUMN IF NOT EXISTS `table_mode_enabled` TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'Mode avec tables activé (0 = mode sans table : pizzeria, fast-food, comptoir)';

ALTER TABLE `settings`
  ADD COLUMN IF NOT EXISTS `table_assignment_enabled` TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Attribution de tables par serveur activée (nécessite table_mode_enabled=1)';

-- Table de logs d'audit (traçabilité sans FK pour conserver l''historique même après suppression)
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`          VARCHAR(36)  NOT NULL,
  `user_id`     VARCHAR(36)  DEFAULT NULL
                             COMMENT 'Utilisateur ayant effectué l''action (NULL = système)',
  `user_name`   VARCHAR(100) DEFAULT NULL
                             COMMENT 'Nom snapshot au moment de l''action',
  `action`      VARCHAR(80)  NOT NULL
                             COMMENT 'Ex: order.update, order.cancel, table.assign, user.permission',
  `target_type` VARCHAR(50)  NOT NULL
                             COMMENT 'order | table | user',
  `target_id`   VARCHAR(36)  DEFAULT NULL,
  `details`     JSON         DEFAULT NULL
                             COMMENT 'Contexte : { before, after, reason }',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_target`  (`target_type`, `target_id`),
  KEY `idx_audit_user`    (`user_id`),
  KEY `idx_audit_date`    (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT 'Journal d''audit immuable — ne jamais supprimer';