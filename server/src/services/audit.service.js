/**
 * Co-Caisse — AuditService
 * Traçabilité des actions sensibles (commandes, tables, permissions).
 */
import { v4 as uuidv4 } from 'uuid';

export const AuditService = {

  /**
   * Enregistre une entrée dans audit_logs.
   * @param {object} db
   * @param {object} opts
   * @param {string|null} opts.userId     - ID de l'utilisateur acteur
   * @param {string|null} opts.userName   - Nom snapshot de l'utilisateur
   * @param {string}      opts.action     - Ex: 'order.update', 'table.assign', 'user.permission'
   * @param {string}      opts.targetType - 'order' | 'table' | 'user'
   * @param {string|null} opts.targetId   - ID de la ressource affectée
   * @param {object|null} opts.details    - { before, after, context }
   */
  async log(db, { userId = null, userName = null, action, targetType, targetId = null, details = null }) {
    try {
      await db.run(
        `INSERT INTO \`audit_logs\` (id, user_id, user_name, action, target_type, target_id, details)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, userName, action, targetType, targetId, details ? JSON.stringify(details) : null]
      );
    } catch (err) {
      // Ne jamais faire planter l'appel principal à cause d'un log raté
      console.error('[AUDIT] Erreur écriture log :', err.message);
    }
  },

  async getRecent(db, { limit = 100, targetType, targetId, userId } = {}) {
    let query = `
      SELECT id, user_id, user_name, action, target_type, target_id, details, created_at
      FROM \`audit_logs\`
      WHERE 1=1
    `;
    const params = [];
    if (targetType) { query += ' AND target_type = ?'; params.push(targetType); }
    if (targetId)   { query += ' AND target_id = ?';   params.push(targetId);   }
    if (userId)     { query += ' AND user_id = ?';     params.push(userId);     }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    return db.all(query, params);
  },

};