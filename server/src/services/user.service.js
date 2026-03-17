/**
 * Co-Caisse — UserService
 */
import { v4 as uuidv4 } from 'uuid';
import bcrypt           from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const SELECT_SAFE   = 'id, username, email, role, profile, active';

export const UserService = {

  async getAll(db) {
    return db.all(`SELECT ${SELECT_SAFE} FROM \`users\` ORDER BY username`);
  },

  async getById(db, id) {
    return db.get(`SELECT ${SELECT_SAFE} FROM \`users\` WHERE id = ?`, [id]);
  },

  async getByIdSafe(db, id) {
    return db.get(
      `SELECT ${SELECT_SAFE} FROM \`users\` WHERE id = ? AND active = 1`,
      [id]
    );
  },

  /** Retourne la ligne complète (avec password hashé) pour l'authentification. */
  async getForAuth(db, username) {
    return db.get(
      'SELECT * FROM `users` WHERE username = ? AND active = 1',
      [username]
    );
  },

  async create(db, data) {
    const { username, password, email, role, profile } = data;
    const id   = uuidv4();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.run(
      'INSERT INTO `users` (id, username, password, email, role, profile) VALUES (?, ?, ?, ?, ?, ?)',
      [id, username, hash, email, role, profile ?? 'standard']
    );
    return db.get(`SELECT ${SELECT_SAFE} FROM \`users\` WHERE id = ?`, [id]);
  },

  async update(db, id, data) {
    const { email, role, profile, active, password } = data;
    if (password) {
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await db.run(
        `UPDATE \`users\` SET
           email    = COALESCE(?, email),
           role     = COALESCE(?, role),
           profile  = COALESCE(?, profile),
           active   = COALESCE(?, active),
           password = ?
         WHERE id = ?`,
        [email, role, profile, active, hash, id]
      );
    } else {
      await db.run(
        `UPDATE \`users\` SET
           email   = COALESCE(?, email),
           role    = COALESCE(?, role),
           profile = COALESCE(?, profile),
           active  = COALESCE(?, active)
         WHERE id = ?`,
        [email, role, profile, active, id]
      );
    }
    return db.get(`SELECT ${SELECT_SAFE} FROM \`users\` WHERE id = ?`, [id]);
  },

  async remove(db, id) {
    await db.run('DELETE FROM `users` WHERE id = ?', [id]);
  },

};
