/**
 * Routes API : Variantes, Options et Sauces
 * ==========================================
 *
 * Endpoints :
 * - GET    /api/variants/groups                    → liste tous les groupes avec options
 * - POST   /api/variants/groups                    → créer groupe
 * - PUT    /api/variants/groups/:groupId           → modifier groupe
 * - DELETE /api/variants/groups/:groupId           → supprimer groupe
 * - GET    /api/variants/groups/:groupId/options   → options d'un groupe
 * - POST   /api/variants/groups/:groupId/options   → ajouter option au groupe
 * - PUT    /api/variants/groups/:groupId/options/:optionId → modifier option
 * - DELETE /api/variants/groups/:groupId/options/:optionId → supprimer option
 * - GET    /api/products/:productId/variants        → groupes assignés au produit
 * - POST   /api/products/:productId/variants        → assigner groupe au produit
 * - DELETE /api/products/:productId/variants/:assignmentId → retirer groupe du produit
 *
 * Accès : admin/manager uniquement
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { roleCheck } from '../middleware/auth.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GESTION DES GROUPES DE VARIANTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/variants/groups
 * Retourne tous les groupes de variantes avec leurs options (triés par position)
 * Accès: admin/manager ou utilisateur authentifié pour consultation
 */
router.get('/groups', async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Récupérer tous les groupes actifs
    const groups = await db.all(`
      SELECT * FROM variant_groups 
      WHERE active = 1
      ORDER BY position ASC, name ASC
    `);

    // Récupérer les options pour chaque groupe
    const result = await Promise.all(
      groups.map(async (group) => {
        const options = await db.all(`
          SELECT * FROM variant_options
          WHERE group_id = ? AND active = 1
          ORDER BY position ASC, name ASC
        `, [group.id]);

        return {
          ...group,
          options: options || []
        };
      })
    );

    res.json(result);
  } catch (error) {
    console.error('[/api/variants/groups] GET error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/variants/groups
 * Crée un groupe de variantes avec ses options en une seule requête
 * Body : { name, description, type, required, options: [{ name, description, price_modifier, is_default }] }
 */
router.post('/groups', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name, description, type, required, options = [] } = req.body;

    // Validation
    if (!name || !type) {
      return res.status(400).json({ error: 'name et type sont requis' });
    }
    if (!['single', 'multiple'].includes(type)) {
      return res.status(400).json({ error: 'type doit être "single" ou "multiple"' });
    }

    const groupId = uuidv4();
    const createdBy = req.user?.id || null;

    // Créer le groupe
    await db.run(`
      INSERT INTO variant_groups (id, name, description, type, required, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [groupId, name, description || null, type, required ? 1 : 0, createdBy]);

    // Ajouter les options
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (!opt.name) continue;

      const optionId = uuidv4();
      await db.run(`
        INSERT INTO variant_options (id, group_id, name, description, price_modifier, is_default, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        optionId,
        groupId,
        opt.name,
        opt.description || null,
        parseFloat(opt.price_modifier) || 0,
        opt.is_default ? 1 : 0,
        i
      ]);
    }

    // Retourner le groupe créé avec ses options
    const group = await db.get('SELECT * FROM variant_groups WHERE id = ?', [groupId]);
    const groupOptions = await db.all(
      'SELECT * FROM variant_options WHERE group_id = ? ORDER BY position ASC',
      [groupId]
    );

    res.status(201).json({
      ...group,
      options: groupOptions
    });
  } catch (error) {
    console.error('[/api/variants/groups] POST error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/variants/groups/:groupId
 * Modifie un groupe (nom, description, type, required)
 * Body : { name?, description?, type?, required?, options? }
 * Si options fourni, remplace toutes les options du groupe
 */
router.put('/groups/:groupId', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { groupId } = req.params;
    const { name, description, type, required, options } = req.body;

    // Vérifier que le groupe existe
    const group = await db.get('SELECT * FROM variant_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    // Mettre à jour le groupe
    if (name || type || description !== undefined || required !== undefined) {
      await db.run(`
        UPDATE variant_groups
        SET name = ?, description = ?, type = ?, required = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        name || group.name,
        description !== undefined ? description : group.description,
        type || group.type,
        required !== undefined ? (required ? 1 : 0) : group.required,
        groupId
      ]);
    }

    // Si options fourni, remplacer toutes les options
    if (options && Array.isArray(options)) {
      // Supprimer les anciennes options
      await db.run('DELETE FROM variant_options WHERE group_id = ?', [groupId]);

      // Ajouter les nouvelles
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (!opt.name) continue;

        const optionId = uuidv4();
        await db.run(`
          INSERT INTO variant_options (id, group_id, name, description, price_modifier, is_default, position)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          optionId,
          groupId,
          opt.name,
          opt.description || null,
          parseFloat(opt.price_modifier) || 0,
          opt.is_default ? 1 : 0,
          i
        ]);
      }
    }

    // Retourner le groupe modifié
    const updatedGroup = await db.get('SELECT * FROM variant_groups WHERE id = ?', [groupId]);
    const updatedOptions = await db.all(
      'SELECT * FROM variant_options WHERE group_id = ? ORDER BY position ASC',
      [groupId]
    );

    res.json({
      ...updatedGroup,
      options: updatedOptions
    });
  } catch (error) {
    console.error('[/api/variants/groups/:groupId] PUT error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/variants/groups/:groupId
 * Supprime un groupe et toutes ses options
 * Vérifie si le groupe est assigné à des produits (retourne erreur 409 si c'est le cas)
 */
router.delete('/groups/:groupId', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { groupId } = req.params;

    // Vérifier que le groupe existe
    const group = await db.get('SELECT * FROM variant_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    // Vérifier si le groupe est assigné à des produits
    const assignments = await db.all(`
      SELECT DISTINCT p.id, p.name
      FROM product_variant_groups pvg
      JOIN products p ON pvg.product_id = p.id
      WHERE pvg.group_id = ?
    `, [groupId]);

    if (assignments.length > 0) {
      return res.status(409).json({
        error: 'Ce groupe est assigné à des produits. Veuillez retirer l\'assignation avant de supprimer.',
        products: assignments
      });
    }

    // Supprimer le groupe (les options sont supprimées en cascade)
    await db.run('DELETE FROM variant_groups WHERE id = ?', [groupId]);

    res.json({ message: 'Groupe supprimé avec succès' });
  } catch (error) {
    console.error('[/api/variants/groups/:groupId] DELETE error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GESTION DES OPTIONS D'UN GROUPE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/variants/groups/:groupId/options
 * Retourne les options d'un groupe
 */
router.get('/groups/:groupId/options', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { groupId } = req.params;

    // Vérifier que le groupe existe
    const group = await db.get('SELECT * FROM variant_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    const options = await db.all(`
      SELECT * FROM variant_options
      WHERE group_id = ? AND active = 1
      ORDER BY position ASC, name ASC
    `, [groupId]);

    res.json(options);
  } catch (error) {
    console.error('[/api/variants/groups/:groupId/options] GET error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/variants/groups/:groupId/options
 * Ajoute une option à un groupe
 * Body : { name, description, price_modifier, is_default }
 */
router.post('/groups/:groupId/options', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { groupId } = req.params;
    const { name, description, price_modifier, is_default } = req.body;

    // Vérifier que le groupe existe
    const group = await db.get('SELECT * FROM variant_groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    if (!name) {
      return res.status(400).json({ error: 'name est requis' });
    }

    // Déterminer la position (dernière + 1)
    const lastOption = await db.get(
      'SELECT MAX(position) as maxPos FROM variant_options WHERE group_id = ?',
      [groupId]
    );
    const position = (lastOption?.maxPos || -1) + 1;

    const optionId = uuidv4();
    await db.run(`
      INSERT INTO variant_options (id, group_id, name, description, price_modifier, is_default, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      optionId,
      groupId,
      name,
      description || null,
      parseFloat(price_modifier) || 0,
      is_default ? 1 : 0,
      position
    ]);

    const option = await db.get('SELECT * FROM variant_options WHERE id = ?', [optionId]);
    res.status(201).json(option);
  } catch (error) {
    console.error('[/api/variants/groups/:groupId/options] POST error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/variants/groups/:groupId/options/:optionId
 * Modifie une option
 * Body : { name?, description?, price_modifier?, is_default? }
 */
router.put('/groups/:groupId/options/:optionId', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { groupId, optionId } = req.params;
    const { name, description, price_modifier, is_default } = req.body;

    // Vérifier que l'option existe et appartient au groupe
    const option = await db.get(
      'SELECT * FROM variant_options WHERE id = ? AND group_id = ?',
      [optionId, groupId]
    );
    if (!option) {
      return res.status(404).json({ error: 'Option non trouvée' });
    }

    await db.run(`
      UPDATE variant_options
      SET name = ?, description = ?, price_modifier = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name || option.name,
      description !== undefined ? description : option.description,
      price_modifier !== undefined ? parseFloat(price_modifier) : option.price_modifier,
      is_default !== undefined ? (is_default ? 1 : 0) : option.is_default,
      optionId
    ]);

    const updatedOption = await db.get('SELECT * FROM variant_options WHERE id = ?', [optionId]);
    res.json(updatedOption);
  } catch (error) {
    console.error('[/api/variants/groups/:groupId/options/:optionId] PUT error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/variants/groups/:groupId/options/:optionId
 * Supprime une option d'un groupe
 */
router.delete('/groups/:groupId/options/:optionId', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { groupId, optionId } = req.params;

    // Vérifier que l'option existe et appartient au groupe
    const option = await db.get(
      'SELECT * FROM variant_options WHERE id = ? AND group_id = ?',
      [optionId, groupId]
    );
    if (!option) {
      return res.status(404).json({ error: 'Option non trouvée' });
    }

    await db.run('DELETE FROM variant_options WHERE id = ?', [optionId]);
    res.json({ message: 'Option supprimée avec succès' });
  } catch (error) {
    console.error('[/api/variants/groups/:groupId/options/:optionId] DELETE error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNATION GROUPES ↔ PRODUITS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/products/:productId/variants
 * Retourne tous les groupes de variantes assignés à un produit avec leurs options
 * Trié par position
 */
router.get('/products/:productId/variants', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { productId } = req.params;

    // Vérifier que le produit existe
    const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    // Récupérer les groupes assignés au produit
    const assignments = await db.all(`
      SELECT pvg.id as assignmentId, vg.*
      FROM product_variant_groups pvg
      JOIN variant_groups vg ON pvg.group_id = vg.id
      WHERE pvg.product_id = ? AND vg.active = 1
      ORDER BY pvg.position ASC, vg.name ASC
    `, [productId]);

    // Pour chaque groupe, récupérer ses options
    const result = await Promise.all(
      assignments.map(async (group) => {
        const options = await db.all(`
          SELECT * FROM variant_options
          WHERE group_id = ? AND active = 1
          ORDER BY position ASC, name ASC
        `, [group.id]);

        return {
          ...group,
          options: options || []
        };
      })
    );

    res.json(result);
  } catch (error) {
    console.error('[/api/products/:productId/variants] GET error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/products/:productId/variants
 * Assigne des groupes existants à un produit
 * Body : { group_ids: ["id1", "id2"], positions: [0, 1] } ou simplement { group_id }
 */
router.post('/products/:productId/variants', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { productId } = req.params;
    const { group_ids, group_id, positions } = req.body;

    // Vérifier que le produit existe
    const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    const groupsToAssign = group_ids || (group_id ? [group_id] : []);
    if (!groupsToAssign.length) {
      return res.status(400).json({ error: 'group_ids ou group_id est requis' });
    }

    // Assigner chaque groupe
    for (let i = 0; i < groupsToAssign.length; i++) {
      const gId = groupsToAssign[i];
      const pos = positions ? positions[i] : i;

      // Vérifier que le groupe existe
      const group = await db.get('SELECT * FROM variant_groups WHERE id = ?', [gId]);
      if (!group) {
        return res.status(404).json({ error: `Groupe ${gId} non trouvé` });
      }

      // Vérifier que l'assignation n'existe pas déjà
      const existing = await db.get(
        'SELECT * FROM product_variant_groups WHERE product_id = ? AND group_id = ?',
        [productId, gId]
      );

      if (existing) {
        // Mettre à jour la position
        await db.run(
          'UPDATE product_variant_groups SET position = ? WHERE product_id = ? AND group_id = ?',
          [pos, productId, gId]
        );
      } else {
        // Créer la nouvelle assignation
        const assignmentId = uuidv4();
        await db.run(`
          INSERT INTO product_variant_groups (id, product_id, group_id, position)
          VALUES (?, ?, ?, ?)
        `, [assignmentId, productId, gId, pos]);
      }
    }

    // Retourner les groupes assignés
    const assignments = await db.all(`
      SELECT pvg.id as assignmentId, vg.*
      FROM product_variant_groups pvg
      JOIN variant_groups vg ON pvg.group_id = vg.id
      WHERE pvg.product_id = ? AND vg.active = 1
      ORDER BY pvg.position ASC
    `, [productId]);

    const result = await Promise.all(
      assignments.map(async (group) => {
        const options = await db.all(
          'SELECT * FROM variant_options WHERE group_id = ? AND active = 1 ORDER BY position ASC',
          [group.id]
        );
        return {
          ...group,
          options: options || []
        };
      })
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('[/api/products/:productId/variants] POST error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/products/:productId/variants/:assignmentId
 * Retire un groupe d'un produit (ne supprime pas le groupe, juste l'assignation)
 */
router.delete('/products/:productId/variants/:assignmentId', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { productId, assignmentId } = req.params;

    // Vérifier que l'assignation existe et appartient au produit
    const assignment = await db.get(
      'SELECT * FROM product_variant_groups WHERE id = ? AND product_id = ?',
      [assignmentId, productId]
    );
    if (!assignment) {
      return res.status(404).json({ error: 'Assignation non trouvée' });
    }

    await db.run('DELETE FROM product_variant_groups WHERE id = ?', [assignmentId]);
    res.json({ message: 'Groupe retiré du produit avec succès' });
  } catch (error) {
    console.error('[/api/products/:productId/variants/:assignmentId] DELETE error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

