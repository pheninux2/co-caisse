-- =============================================================================
-- Co-Caisse — Schéma MariaDB
-- Version  : 2.0.0
-- Date     : 2026-02-22
-- Moteur   : MariaDB 10.6+ / InnoDB / utf8mb4
-- Auteur   : Migration SQLite → MariaDB (Étape 3)
--
-- Usage :
--   mysql -u cocaisse -p cocaisse < schema.sql
--
-- Ordre de création :
--   users → categories → products → orders → transactions
--   → payment_methods → settings → backups
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- =============================================================================
-- TABLE : users
-- =============================================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id`         VARCHAR(36)   NOT NULL,
  `username`   VARCHAR(100)  NOT NULL,
  `password`   TEXT          NOT NULL,
  `email`      VARCHAR(255)  DEFAULT NULL,
  `role`       VARCHAR(50)   NOT NULL DEFAULT 'cashier',
                                       -- Valeurs : admin | manager | cashier | cook
  `profile`    VARCHAR(50)   DEFAULT 'standard',
  `active`     TINYINT(1)    NOT NULL  DEFAULT 1,
  `created_at` DATETIME      NOT NULL  DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME      NOT NULL  DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `idx_users_role`   (`role`),
  KEY `idx_users_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Utilisateurs de l''application (admin, manager, cashier, cook)';


-- =============================================================================
-- TABLE : categories
-- =============================================================================
CREATE TABLE IF NOT EXISTS `categories` (
  `id`          VARCHAR(36)   NOT NULL,
  `name`        VARCHAR(255)  NOT NULL,
  `description` TEXT          DEFAULT NULL,
  `image_url`   TEXT          DEFAULT NULL,
  `color`       VARCHAR(20)   DEFAULT NULL,
  `order_index` INT           DEFAULT NULL,
  `active`      TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_categories_active`      (`active`),
  KEY `idx_categories_order_index` (`order_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catégories de produits';


-- =============================================================================
-- TABLE : products
-- =============================================================================
CREATE TABLE IF NOT EXISTS `products` (
  `id`          VARCHAR(36)   NOT NULL,
  `name`        VARCHAR(255)  NOT NULL,
  `description` TEXT          DEFAULT NULL,
  `category_id` VARCHAR(36)   NOT NULL,
  `price`       DOUBLE        NOT NULL,
  `cost`        DOUBLE        DEFAULT NULL,
  `tax_rate`    DOUBLE        NOT NULL DEFAULT 20,
  `image_url`   TEXT          DEFAULT NULL,
  `barcode`     VARCHAR(100)  DEFAULT NULL,
  `stock`       INT           NOT NULL DEFAULT 0,
  `active`      TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_barcode`       (`barcode`),
  KEY        `idx_products_category_id`  (`category_id`),
  KEY        `idx_products_active`       (`active`),
  KEY        `idx_products_name`         (`name`),

  CONSTRAINT `fk_products_category`
    FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catalogue de produits';


-- =============================================================================
-- TABLE : orders
-- Déclarée AVANT transactions car transactions référence orders.id
-- =============================================================================
CREATE TABLE IF NOT EXISTS `orders` (
  `id`               VARCHAR(36)   NOT NULL,
  `order_number`     VARCHAR(100)  NOT NULL,
  `table_number`     VARCHAR(50)   DEFAULT NULL,
  `order_type`       VARCHAR(50)   NOT NULL DEFAULT 'dine_in',
                                             -- Valeurs : dine_in | takeaway | delivery
  `status`           VARCHAR(50)   NOT NULL DEFAULT 'draft',
                                             -- Valeurs : draft | validated | in_kitchen
                                             --           | ready | served | paid | cancelled
  `items`            LONGTEXT      NOT NULL, -- JSON : [{id, name, qty, price, tax_rate}]
  `subtotal`         DOUBLE        NOT NULL,
  `tax`              DOUBLE        NOT NULL DEFAULT 0,
  `discount`         DOUBLE        NOT NULL DEFAULT 0,
  `total`            DOUBLE        NOT NULL,
  `customer_name`    VARCHAR(255)  DEFAULT NULL,
  `customer_phone`   VARCHAR(50)   DEFAULT NULL,
  `notes`            TEXT          DEFAULT NULL,

  -- Champs cuisine
  `kitchen_comment`  TEXT          DEFAULT NULL,
  `kitchen_handlers` LONGTEXT      NOT NULL DEFAULT '[]',
                                             -- JSON : [{id, username, taken_at}]

  -- Traçabilité
  `created_by`       VARCHAR(36)   NOT NULL,
  `transaction_id`   VARCHAR(36)   DEFAULT NULL,

  -- Horodatages de statut (tous NULLABLE — renseignés au passage du statut)
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `validated_at`     DATETIME      NULL     DEFAULT NULL,
  `kitchen_at`       DATETIME      NULL     DEFAULT NULL,
  `ready_at`         DATETIME      NULL     DEFAULT NULL,
  `served_at`        DATETIME      NULL     DEFAULT NULL,
  `paid_at`          DATETIME      NULL     DEFAULT NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_order_number`  (`order_number`),
  KEY        `idx_orders_status`       (`status`),
  KEY        `idx_orders_created_by`   (`created_by`),
  KEY        `idx_orders_created_at`   (`created_at`),
  KEY        `idx_orders_table_number` (`table_number`),

  CONSTRAINT `fk_orders_user`
    FOREIGN KEY (`created_by`)
    REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT

  -- NOTE : fk_orders_transaction ajoutée après la table transactions
  --        (ALTER TABLE en bas du fichier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Commandes restaurant (cycle complet draft→paid)';


-- =============================================================================
-- TABLE : transactions
-- Référence orders(id) — orders doit exister avant
-- =============================================================================
CREATE TABLE IF NOT EXISTS `transactions` (
  `id`               VARCHAR(36)   NOT NULL,
  `user_id`          VARCHAR(36)   NOT NULL,
  `transaction_date` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `items`            LONGTEXT      NOT NULL, -- JSON : [{id, name, qty, price, tax_rate}]
  `subtotal`         DOUBLE        NOT NULL,
  `tax`              DOUBLE        NOT NULL DEFAULT 0,
  `discount`         DOUBLE        NOT NULL DEFAULT 0,
  `total`            DOUBLE        NOT NULL,
  `payment_method`   VARCHAR(50)   NOT NULL,
                                             -- Valeurs : cash | card
  `payment_status`   VARCHAR(50)   NOT NULL DEFAULT 'completed',
  `change`           DOUBLE        NOT NULL DEFAULT 0,
                                             -- ↑ mot réservé MariaDB → backticks obligatoires
  `notes`            TEXT          DEFAULT NULL,
  `receipt_number`   VARCHAR(100)  DEFAULT NULL,
  `order_id`         VARCHAR(36)   DEFAULT NULL,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_transactions_receipt`      (`receipt_number`),
  KEY        `idx_transactions_user_id`     (`user_id`),
  KEY        `idx_transactions_date`        (`transaction_date`),
  KEY        `idx_transactions_payment`     (`payment_method`),
  KEY        `idx_transactions_order_id`    (`order_id`),

  CONSTRAINT `fk_transactions_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT `fk_transactions_order`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Transactions de caisse (encaissements)';


-- =============================================================================
-- FK circulaire : orders.transaction_id → transactions.id
-- Ajoutée après création de transactions pour éviter le problème d'ordre
-- =============================================================================
ALTER TABLE `orders`
  ADD CONSTRAINT `fk_orders_transaction`
    FOREIGN KEY (`transaction_id`)
    REFERENCES `transactions` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL;


-- =============================================================================
-- TABLE : payment_methods
-- =============================================================================
CREATE TABLE IF NOT EXISTS `payment_methods` (
  `id`         VARCHAR(36)   NOT NULL,
  `name`       VARCHAR(100)  NOT NULL,
  `code`       VARCHAR(50)   NOT NULL,
  `enabled`    TINYINT(1)    NOT NULL DEFAULT 1,
  `config`     TEXT          DEFAULT NULL, -- JSON optionnel
  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_methods_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Moyens de paiement disponibles';


-- =============================================================================
-- TABLE : settings
-- Une seule ligne attendue (singleton)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `settings` (
  `id`                        VARCHAR(36)   NOT NULL,
  `company_name`              VARCHAR(255)  DEFAULT NULL,
  `company_address`           TEXT          DEFAULT NULL,
  `company_phone`             VARCHAR(50)   DEFAULT NULL,
  `company_email`             VARCHAR(255)  DEFAULT NULL,
  `tax_number`                VARCHAR(100)  DEFAULT NULL,
  `currency`                  VARCHAR(10)   NOT NULL DEFAULT 'EUR',
  `default_tax_rate`          DOUBLE        NOT NULL DEFAULT 20,
  `receipt_header`            TEXT          DEFAULT NULL,
  `receipt_footer`            TEXT          DEFAULT NULL,
  `printer_name`              VARCHAR(255)  DEFAULT NULL,
  `cashregister_port`         VARCHAR(50)   DEFAULT NULL,

  -- Seuils d'alerte par statut de commande (en minutes)
  `alert_draft_minutes`       INT           NOT NULL DEFAULT 15,
  `alert_validated_minutes`   INT           NOT NULL DEFAULT 10,
  `alert_kitchen_minutes`     INT           NOT NULL DEFAULT 20,
  `alert_ready_minutes`       INT           NOT NULL DEFAULT 5,
  `alert_served_minutes`      INT           NOT NULL DEFAULT 30,

  -- Configuration des alertes
  `alert_enabled`             TINYINT(1)    NOT NULL DEFAULT 1,
  `alert_sound_enabled`       TINYINT(1)    NOT NULL DEFAULT 1,
  `alert_remind_after_dismiss` INT          NOT NULL DEFAULT 10,
                                             -- Relance de la notif après N minutes si pas d'action

  `created_at`                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                        ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Paramètres de l''application (singleton — une seule ligne)';


-- =============================================================================
-- TABLE : backups
-- =============================================================================
CREATE TABLE IF NOT EXISTS `backups` (
  `id`          VARCHAR(36)  NOT NULL,
  `backup_date` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `backup_type` VARCHAR(50)  DEFAULT NULL,  -- Valeurs : manual | auto
  `file_path`   TEXT         DEFAULT NULL,
  `size`        BIGINT       DEFAULT NULL,  -- Taille en octets
  `status`      VARCHAR(50)  NOT NULL DEFAULT 'completed',

  PRIMARY KEY (`id`),
  KEY `idx_backups_date`   (`backup_date`),
  KEY `idx_backups_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Journal des sauvegardes';


-- =============================================================================
-- Données initiales : moyens de paiement par défaut
-- =============================================================================
INSERT IGNORE INTO `payment_methods` (`id`, `name`, `code`, `enabled`) VALUES
  (UUID(), 'Espèces',        'cash',   1),
  (UUID(), 'Carte bancaire', 'card',   1);


-- =============================================================================
-- TABLE : _migrations
-- Suivi des migrations automatiques jouées au démarrage du serveur
-- =============================================================================
CREATE TABLE IF NOT EXISTS `_migrations` (
  `id`         INT           NOT NULL AUTO_INCREMENT,
  `filename`   VARCHAR(255)  NOT NULL,
  `applied_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_migrations_filename` (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Suivi des migrations appliquées';


-- =============================================================================
-- NOTE : Les tables licences / licence_events sont gérées exclusivement par
-- co-caisse-admin (base de données distincte chez le développeur/vendeur).
-- La DB client ne contient que les tables métier listées ci-dessus.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 1;
-- =============================================================================

