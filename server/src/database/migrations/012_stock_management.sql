-- Migration 012 : Gestion des stocks
-- Ajoute les colonnes de gestion de stock sur products
-- et crée la table stock_movements pour l'historique

-- Activation de la gestion de stock par produit
ALTER TABLE `products`
  ADD COLUMN IF NOT EXISTS `stock_enabled`         TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Activer la gestion de stock pour ce produit (0=non, 1=oui)',
  ADD COLUMN IF NOT EXISTS `stock_alert_threshold` INT        NOT NULL DEFAULT 5
    COMMENT 'Seuil d''alerte stock (affiche alerte si stock <= seuil)',
  ADD COLUMN IF NOT EXISTS `stock_unit`            VARCHAR(20)          DEFAULT 'pièces'
    COMMENT 'Unité de mesure (pièces, kg, litres, etc.)';

-- Historique des mouvements de stock
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id`          VARCHAR(36)   NOT NULL PRIMARY KEY,
  `product_id`  VARCHAR(36)   NOT NULL,
  `quantity`    DECIMAL(10,3) NOT NULL COMMENT 'Positif = entrée, négatif = sortie',
  `stock_after` DECIMAL(10,3) NOT NULL COMMENT 'Stock restant après mouvement',
  `reason`      VARCHAR(50)   NOT NULL DEFAULT 'adjustment'
                COMMENT 'vente | adjustment | delivery | return | loss',
  `reference`   VARCHAR(100)  DEFAULT NULL COMMENT 'N° transaction ou note libre',
  `user_id`     VARCHAR(36)   NOT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_stock_mv_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
  CONSTRAINT `fk_stock_mv_user`    FOREIGN KEY (`user_id`)    REFERENCES `users`(`id`),
  INDEX `idx_stock_mv_product`  (`product_id`),
  INDEX `idx_stock_mv_created`  (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

