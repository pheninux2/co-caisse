-- =============================================================================
-- Migration 005 — Ticket dématérialisé AGEC
-- Loi AGEC (août 2023) : ticket papier non imprimé par défaut en France
-- =============================================================================

-- Colonne email client sur les transactions (optionnelle, consentement RGPD)
ALTER TABLE `transactions`
  ADD COLUMN IF NOT EXISTS `customer_email` VARCHAR(255) DEFAULT NULL
    COMMENT 'Email client pour ticket dématérialisé (stocké avec consentement RGPD uniquement)';

-- Colonne email_sent : timestamp d'envoi (NULL = pas envoyé)
ALTER TABLE `transactions`
  ADD COLUMN IF NOT EXISTS `receipt_email_sent_at` DATETIME DEFAULT NULL
    COMMENT 'Horodatage envoi du ticket par email (NULL si pas envoyé)';

-- =============================================================================

