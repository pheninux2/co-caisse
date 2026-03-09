-- =============================================================================
-- Migration 013 : Système de variantes, options et sauces personnalisables
-- Version  : 1.0.0
-- Date     : 2026-03-08
-- Auteur   : Implémentation système variantes
--
-- OBJECTIF :
-- Créer une structure permettant à l'admin de :
-- 1. Créer des groupes de variantes réutilisables (ex: "Taille", "Sauce", "Cuisson")
-- 2. Ajouter des options à chaque groupe (ex: Petite, Moyenne, Grande)
-- 3. Assigner des groupes à des produits
-- 4. Les caissiers sélectionnent les variantes avant d'ajouter au panier
-- 5. Les variantes sont stockées dans les commandes en JSON
--
-- STRUCTURE :
-- - variant_groups  : Groupes créés par l'admin (réutilisables)
-- - variant_options : Options à l'intérieur d'un groupe
-- - product_variant_groups : Association produits ↔ groupes
--
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- TABLE : variant_groups
-- Groupes de variantes créés par l'admin, réutilisables sur plusieurs produits
-- =============================================================================
CREATE TABLE IF NOT EXISTS `variant_groups` (
  `id`          VARCHAR(36)   NOT NULL,
  `name`        VARCHAR(100)  NOT NULL,
  `description` TEXT          DEFAULT NULL,
  `type`        VARCHAR(20)   NOT NULL DEFAULT 'single',
                                       -- 'single' (radio) | 'multiple' (checkbox)
  `required`    TINYINT(1)    NOT NULL DEFAULT 0,
                                       -- 1 = au moins 1 option doit être sélectionnée
  `position`    INT           NOT NULL DEFAULT 0,
                                       -- Ordre d'affichage dans la modal
  `active`      TINYINT(1)    NOT NULL DEFAULT 1,
  `created_by`  VARCHAR(36)   DEFAULT NULL,
                                       -- ID de l'admin qui a créé ce groupe
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_variant_groups_active`   (`active`),
  KEY `idx_variant_groups_position` (`position`),
  KEY `idx_variant_groups_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Groupes de variantes réutilisables (ex: Taille, Sauce, Cuisson)';


-- =============================================================================
-- TABLE : variant_options
-- Options à l'intérieur d'un groupe de variantes
-- =============================================================================
CREATE TABLE IF NOT EXISTS `variant_options` (
  `id`               VARCHAR(36)   NOT NULL,
  `group_id`         VARCHAR(36)   NOT NULL,
  `name`             VARCHAR(100)  NOT NULL,
  `description`      TEXT          DEFAULT NULL,
  `price_modifier`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                                           -- Surcharge du prix pour cette option
  `is_default`       TINYINT(1)    NOT NULL DEFAULT 0,
                                           -- Pré-sélectionnée à l'ouverture de la modal
  `position`         INT           NOT NULL DEFAULT 0,
                                           -- Ordre d'affichage dans le groupe
  `active`           TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                              ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_variant_options_group_id`    (`group_id`),
  KEY `idx_variant_options_active`      (`active`),
  KEY `idx_variant_options_position`    (`position`),

  CONSTRAINT `fk_variant_options_group`
    FOREIGN KEY (`group_id`)
    REFERENCES `variant_groups` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Options individuelles d''un groupe de variantes';


-- =============================================================================
-- TABLE : product_variant_groups
-- Association produit ↔ groupe de variantes (un groupe peut s''appliquer à plusieurs produits)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `product_variant_groups` (
  `id`          VARCHAR(36)   NOT NULL,
  `product_id`  INT           NOT NULL,
  `group_id`    VARCHAR(36)   NOT NULL,
  `position`    INT           NOT NULL DEFAULT 0,
                                       -- Ordre d'affichage dans la modal pour ce produit
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_group` (`product_id`, `group_id`),
  KEY `idx_product_variant_groups_product_id` (`product_id`),
  KEY `idx_product_variant_groups_group_id`   (`group_id`),
  KEY `idx_product_variant_groups_position`   (`position`),


  CONSTRAINT `fk_product_variant_groups_group`
    FOREIGN KEY (`group_id`)
    REFERENCES `variant_groups` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Assignation d''un groupe de variantes à un produit';


SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- Notes :
-- - Les variantes d'une commande sont stockées dans order.items en JSON
-- - Format : [{ "groupId": "...", "groupName": "...", "optionId": "...", "optionName": "...", "priceModifier": 0.50 }]
-- - La suppression d'un groupe en cascade n'affecte pas l'historique (JSON figé)
-- - Un groupe peut être assigné à plusieurs produits
-- - Un produit peut avoir plusieurs groupes (ordonnés par position)
-- =============================================================================

