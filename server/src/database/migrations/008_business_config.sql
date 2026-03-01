-- Migration 008 : table business_config (clé-valeur configuration établissement)
-- Permet de surcharger BUSINESS_CONFIG par pays/type sans modifier le code

CREATE TABLE IF NOT EXISTS `business_config` (
  `config_key`   VARCHAR(60)   NOT NULL,
  `config_value` TEXT,
  `updated_at`   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Valeurs par défaut (seront ignorées si la clé existe déjà)
INSERT IGNORE INTO `business_config` (`config_key`, `config_value`) VALUES
  ('country',          'FR'),
  ('business_type',    'restaurant'),
  ('vat_rates',        '5.5,10,20'),
  ('default_vat_rate', '20'),
  ('currency',         'EUR'),
  ('currency_symbol',  '€'),
  ('print_by_default', '0'),
  ('antifraud_mode',   '1'),
  ('closure_required', '1');

