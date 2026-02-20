import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Générer un numéro de commande unique
function generateOrderNumber() {
  const now = new Date();
  const date = now.toISOString().split('T')[0].replace(/-/g, '');
  const timestamp = now.getTime().toString().slice(-6);
  return `CMD-${date}-${timestamp}`;
}

// Créer une nouvelle commande
router.post('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const {
      table_number,
      order_type = 'dine_in',
      items,
      subtotal,
      tax,
      discount,
      total,
      customer_name,
      customer_phone,
      notes
    } = req.body;

    if (!items || !total) {
      return res.status(400).json({ error: 'Missing required fields: items, total' });
    }

    const id = uuidv4();
    const order_number = generateOrderNumber();

    await db.run(
      `INSERT INTO orders (
        id, order_number, table_number, order_type, status, items,
        subtotal, tax, discount, total, customer_name, customer_phone,
        notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        id, order_number, table_number, order_type, JSON.stringify(items),
        subtotal, tax || 0, discount || 0, total,
        customer_name, customer_phone, notes, req.userId
      ]
    );

    const order = await db.get('SELECT * FROM orders WHERE id = ?', [id]);
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lister toutes les commandes avec filtres
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { status, order_type, table_number, start_date, end_date, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT o.*, u.username as cashier_name
      FROM orders o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND o.status = ?';
      params.push(status);
    }

    if (order_type) {
      query += ' AND o.order_type = ?';
      params.push(order_type);
    }

    if (table_number) {
      query += ' AND o.table_number = ?';
      params.push(table_number);
    }

    if (start_date) {
      query += ' AND DATE(o.created_at) >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND DATE(o.created_at) <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const orders = await db.all(query, params);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtenir une commande par ID
router.get('/:id', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const order = await db.get(`
      SELECT o.*, u.username as cashier_name
      FROM orders o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.id = ?
    `, [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    order.items = JSON.parse(order.items);
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Modifier une commande (seulement si status = draft)
router.put('/:id', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'draft') {
      return res.status(400).json({ error: 'Can only modify draft orders' });
    }

    const {
      table_number,
      order_type,
      items,
      subtotal,
      tax,
      discount,
      total,
      customer_name,
      customer_phone,
      notes
    } = req.body;

    await db.run(
      `UPDATE orders SET
        table_number = ?, order_type = ?, items = ?,
        subtotal = ?, tax = ?, discount = ?, total = ?,
        customer_name = ?, customer_phone = ?, notes = ?
      WHERE id = ?`,
      [
        table_number, order_type, JSON.stringify(items),
        subtotal, tax, discount, total,
        customer_name, customer_phone, notes,
        req.params.id
      ]
    );

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Supprimer une commande (seulement si status = draft)
router.delete('/:id', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'draft') {
      return res.status(400).json({ error: 'Can only delete draft orders' });
    }

    await db.run('DELETE FROM orders WHERE id = ?', [req.params.id]);
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Valider une commande (draft → validated)
router.post('/:id/validate', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'draft') {
      return res.status(400).json({ error: 'Order must be in draft status' });
    }

    await db.run(
      `UPDATE orders SET status = 'validated', validated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id]
    );

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Envoyer en cuisine (validated → in_kitchen)
router.post('/:id/send-to-kitchen', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'validated') {
      return res.status(400).json({ error: 'Order must be validated first' });
    }

    await db.run(
      `UPDATE orders SET status = 'in_kitchen', kitchen_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id]
    );

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marquer comme prête (in_kitchen → ready)
router.post('/:id/mark-ready', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'in_kitchen') {
      return res.status(400).json({ error: 'Order must be in kitchen' });
    }

    await db.run(
      `UPDATE orders SET status = 'ready', ready_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id]
    );

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marquer comme servie (ready → served)
router.post('/:id/mark-served', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'ready') {
      return res.status(400).json({ error: 'Order must be ready' });
    }

    await db.run(
      `UPDATE orders SET status = 'served', served_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id]
    );

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Payer une commande (créer une transaction)
router.post('/:id/pay', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status === 'paid') {
      return res.status(400).json({ error: 'Order already paid' });
    }

    const { payment_method, change = 0, notes = '' } = req.body;

    if (!payment_method) {
      return res.status(400).json({ error: 'Payment method required' });
    }

    // Créer la transaction
    const transactionId = uuidv4();
    const receipt_number = `REC-${Date.now()}`;

    await db.run(
      `INSERT INTO transactions (
        id, user_id, items, subtotal, tax, discount, total,
        payment_method, payment_status, change, notes, receipt_number, order_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
      [
        transactionId, req.userId, order.items, order.subtotal,
        order.tax, order.discount, order.total, payment_method,
        change, notes, receipt_number, order.id
      ]
    );

    // Mettre à jour la commande
    await db.run(
      `UPDATE orders SET
        status = 'paid',
        paid_at = CURRENT_TIMESTAMP,
        transaction_id = ?
      WHERE id = ?`,
      [transactionId, req.params.id]
    );

    const transaction = await db.get('SELECT * FROM transactions WHERE id = ?', [transactionId]);
    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    res.json({ order: updatedOrder, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Statistiques des commandes
router.get('/stats/summary', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const today = new Date().toISOString().split('T')[0];

    const stats = await db.get(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
        SUM(CASE WHEN status = 'validated' THEN 1 ELSE 0 END) as validated_count,
        SUM(CASE WHEN status = 'in_kitchen' THEN 1 ELSE 0 END) as in_kitchen_count,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready_count,
        SUM(CASE WHEN status = 'served' THEN 1 ELSE 0 END) as served_count,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(total) as total_amount,
        AVG(total) as average_order
      FROM orders
      WHERE DATE(created_at) = ?
    `, [today]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

