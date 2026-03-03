-- Migration 009 : Plan de salle visuel interactif
-- Tables : floor_plans (plan de salle) + tables (tables physiques)

CREATE TABLE IF NOT EXISTS `floor_plans` (
  `id`               VARCHAR(36)   NOT NULL,
  `name`             VARCHAR(100)  NOT NULL DEFAULT 'Salle principale',
  `width`            INT           NOT NULL DEFAULT 1100,
  `height`           INT           NOT NULL DEFAULT 650,
  `background_color` VARCHAR(20)   NOT NULL DEFAULT '#f3f4f6',
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `tables` (
  `id`            VARCHAR(36)  NOT NULL,
  `floor_plan_id` VARCHAR(36)  DEFAULT NULL,
  `label`         VARCHAR(50)  NOT NULL,
  `shape`         ENUM('rect','circle') NOT NULL DEFAULT 'rect',
  `x`             INT          NOT NULL DEFAULT 50,
  `y`             INT          NOT NULL DEFAULT 50,
  `width`         INT          NOT NULL DEFAULT 80,
  `height`        INT          NOT NULL DEFAULT 80,
  `capacity`      TINYINT      NOT NULL DEFAULT 4,
  `active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tables_label` (`label`),
  CONSTRAINT `fk_tables_floor_plan` FOREIGN KEY (`floor_plan_id`) REFERENCES `floor_plans`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Plan de salle par défaut (singleton)
INSERT IGNORE INTO `floor_plans` (`id`, `name`) VALUES ('default-floor-plan', 'Salle principale');

