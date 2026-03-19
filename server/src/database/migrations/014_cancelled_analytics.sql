-- Migration 014 : Horodatage annulation + analytics commandes

-- Ajouter cancelled_at et cancelled_by sur les commandes
ALTER TABLE `orders`
  ADD COLUMN IF NOT EXISTS `cancelled_at` DATETIME DEFAULT NULL
  COMMENT 'Horodatage de l''annulation';

ALTER TABLE `orders`
  ADD COLUMN IF NOT EXISTS `cancelled_by` VARCHAR(36) DEFAULT NULL
  COMMENT 'User id ayant annulé la commande';

-- Index pour accélérer les requêtes analytics sur les commandes
ALTER TABLE `orders`
  ADD INDEX IF NOT EXISTS `idx_orders_created_at` (`created_at`);