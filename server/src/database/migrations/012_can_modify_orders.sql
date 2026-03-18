-- Migration 012 : Ajout permission can_modify_orders sur les utilisateurs
-- Permet à l'admin de donner aux serveurs/caissiers le droit de modifier/annuler des commandes

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `can_modify_orders` TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Permission : peut modifier ou annuler une commande (accordée par l''admin)';