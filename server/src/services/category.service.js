/**
 * Co-Caisse — CategoryService
 */
import { v4 as uuidv4 } from 'uuid';

export const CategoryService = {

  async getAll(db) {
    return db.all('SELECT * FROM categories WHERE active = 1 ORDER BY order_index, name');
  },

  async getById(db, id) {
    return db.get('SELECT * FROM categories WHERE id = ?', [id]);
  },

  async create(db, data) {
    const { name, description, image_url, color, order_index } = data;
    const id = uuidv4();
    await db.run(
      `INSERT INTO categories (id, name, description, image_url, color, order_index)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, description, image_url, color, order_index ?? 0]
    );
    return db.get('SELECT * FROM categories WHERE id = ?', [id]);
  },

  async update(db, id, data) {
    const { name, description, image_url, color, order_index, active } = data;
    await db.run(
      `UPDATE categories
       SET name        = COALESCE(?, name),
           description = COALESCE(?, description),
           image_url   = COALESCE(?, image_url),
           color       = COALESCE(?, color),
           order_index = COALESCE(?, order_index),
           active      = COALESCE(?, active),
           updated_at  = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, description, image_url, color, order_index, active, id]
    );
    return db.get('SELECT * FROM categories WHERE id = ?', [id]);
  },

  async remove(db, id) {
    await db.run('DELETE FROM categories WHERE id = ?', [id]);
  },

};
