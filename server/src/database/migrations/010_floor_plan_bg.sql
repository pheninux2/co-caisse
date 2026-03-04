-- Migration 010 : Plan de salle — image de fond + éléments de dessin
-- Ajoute background_image (MEDIUMBLOB) et drawing_data (JSON) à floor_plans

ALTER TABLE `floor_plans`
  ADD COLUMN IF NOT EXISTS `background_image`      MEDIUMBLOB DEFAULT NULL
    COMMENT 'Image de fond du plan (JPG/PNG/SVG en base64)',
  ADD COLUMN IF NOT EXISTS `background_image_name` VARCHAR(255) DEFAULT NULL
    COMMENT 'Nom original du fichier image',
  ADD COLUMN IF NOT EXISTS `drawing_data`          LONGTEXT DEFAULT NULL
    COMMENT 'JSON : éléments de dessin (murs, portes, fenêtres, zones)';

