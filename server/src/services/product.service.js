/**
 * Co-Caisse — ProductService
 */
import { v4 as uuidv4 } from 'uuid';

export const ProductService = {

  async getAll(db) {
    return db.all(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY c.name, p.name
    `);
  },

  async getById(db, id) {
    return db.get('SELECT * FROM products WHERE id = ?', [id]);
  },

  async getByCategory(db, categoryId) {
    return db.all(
      'SELECT * FROM products WHERE category_id = ? AND active = 1 ORDER BY name',
      [categoryId]
    );
  },

  async search(db, query) {
    const q = `%${query}%`;
    return db.all(
      'SELECT * FROM products WHERE (name LIKE ? OR barcode LIKE ?) AND active = 1',
      [q, q]
    );
  },

  async create(db, data) {
    const { name, description, category_id, price, cost, tax_rate, image_url, barcode, stock } = data;
    const id = uuidv4();
    await db.run(
      `INSERT INTO products (id, name, description, category_id, price, cost, tax_rate, image_url, barcode, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, category_id, price, cost, tax_rate ?? 20, image_url, barcode, stock ?? 0]
    );
    return db.get('SELECT * FROM products WHERE id = ?', [id]);
  },

  async update(db, id, data) {
    const { name, description, category_id, price, cost, tax_rate, image_url, barcode, stock, active } = data;
    await db.run(
      `UPDATE products
       SET name        = COALESCE(?, name),
           description = COALESCE(?, description),
           category_id = COALESCE(?, category_id),
           price       = COALESCE(?, price),
           cost        = COALESCE(?, cost),
           tax_rate    = COALESCE(?, tax_rate),
           image_url   = COALESCE(?, image_url),
           barcode     = COALESCE(?, barcode),
           stock       = COALESCE(?, stock),
           active      = COALESCE(?, active),
           updated_at  = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, description, category_id, price, cost, tax_rate, image_url, barcode, stock, active, id]
    );
    return db.get('SELECT * FROM products WHERE id = ?', [id]);
  },

  async remove(db, id) {
    await db.run('DELETE FROM products WHERE id = ?', [id]);
  },

};
