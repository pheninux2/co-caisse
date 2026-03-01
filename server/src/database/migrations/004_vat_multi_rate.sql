-- =============================================================================
-- Migration 004 — TVA multi-taux par produit
-- Date : 2026-02-28
-- =============================================================================
-- La colonne tax_rate existe déjà sur products (DOUBLE DEFAULT 20)
-- On s'assure juste que la valeur par défaut est bien 20 et on migre les NULL
-- =============================================================================

-- S'assurer que les produits sans taux ont le taux par défaut des paramètres (fallback 20)
UPDATE `products`
SET tax_rate = COALESCE(
  (SELECT CAST(default_tax_rate AS DECIMAL(4,2)) FROM `settings` LIMIT 1),
  20.00
)
WHERE tax_rate IS NULL OR tax_rate = 0;

-- =============================================================================

