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
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
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

    const currentUser = await db.get('SELECT role, username FROM users WHERE id = ?', [req.userId]);
    const userRole = currentUser?.role || 'cashier';

    let query = `
      SELECT o.*, COALESCE(u.username, 'Utilisateur supprimé') as cashier_name
      FROM orders o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // Règle de gestion: caissiers ne voient que leurs commandes
    if (userRole === 'cashier') {
      query += ' AND o.created_by = ?';
      params.push(req.userId);
    }
    // Le cuisinier voit toutes les commandes en cuisine + prêtes
    if (userRole === 'cook') {
      query += ` AND o.status IN ('in_kitchen', 'ready')`;
    }

    if (status) { query += ' AND o.status = ?'; params.push(status); }
    if (order_type) { query += ' AND o.order_type = ?'; params.push(order_type); }
    if (table_number) { query += ' AND o.table_number = ?'; params.push(table_number); }
    if (start_date) { query += ' AND DATE(o.created_at) >= ?'; params.push(start_date); }
    if (end_date) { query += ' AND DATE(o.created_at) <= ?'; params.push(end_date); }

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const orders = await db.all(query, params);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route dédiée cuisine : commandes in_kitchen triées du plus ancien au plus récent
router.get('/kitchen/active', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const orders = await db.all(`
      SELECT o.*, COALESCE(u.username, 'Inconnu') as cashier_name
      FROM orders o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.status = 'in_kitchen'
      ORDER BY o.kitchen_at ASC, o.created_at ASC
    `);
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
      SELECT o.*, COALESCE(u.username, 'Utilisateur supprimé') as cashier_name
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
      `UPDATE orders SET status = 'validated', validated_at = datetime('now', 'localtime') WHERE id = ?`,
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
      `UPDATE orders SET status = 'in_kitchen', kitchen_at = datetime('now', 'localtime') WHERE id = ?`,
      [req.params.id]
    );

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marquer comme prête (in_kitchen → ready)
// Marquer comme prête (in_kitchen → ready) — cuisinier et admin seulement
router.post('/:id/mark-ready', async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Vérification du rôle
    const user = await db.get('SELECT role FROM users WHERE id = ?', [req.userId]);
    const userRole = user?.role || req.role;
    if (!['admin', 'cook'].includes(userRole)) {
      return res.status(403).json({ error: 'Seul un cuisinier ou un admin peut marquer une commande comme prête' });
    }

    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'in_kitchen') return res.status(400).json({ error: 'Order must be in kitchen' });

    await db.run(
      `UPDATE orders SET status = 'ready', ready_at = datetime('now', 'localtime') WHERE id = ?`,
      [req.params.id]
    );

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Prise en charge d'une commande par un cuisinier
router.post('/:id/kitchen-handle', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = await db.get('SELECT id, username, role FROM users WHERE id = ?', [req.userId]);
    if (!user || !['admin', 'cook'].includes(user.role)) {
      return res.status(403).json({ error: 'Seul un cuisinier ou admin peut prendre en charge une commande' });
    }

    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'in_kitchen') return res.status(400).json({ error: 'Order must be in kitchen' });

    // Ajouter le cuisinier à la liste des handlers (sans doublon)
    let handlers = [];
    try { handlers = JSON.parse(order.kitchen_handlers || '[]'); } catch { handlers = []; }

    const alreadyHandling = handlers.find(h => h.id === user.id);
    if (!alreadyHandling) {
      handlers.push({ id: user.id, username: user.username, taken_at: new Date().toISOString() });
      await db.run(
        `UPDATE orders SET kitchen_handlers = ? WHERE id = ?`,
        [JSON.stringify(handlers), req.params.id]
      );
    }

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    res.json({ ...updatedOrder, kitchen_handlers: handlers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ajouter/modifier un commentaire cuisinier
router.post('/:id/kitchen-comment', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const user = await db.get('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (!user || !['admin', 'cook'].includes(user.role)) {
      return res.status(403).json({ error: 'Seul un cuisinier ou admin peut commenter' });
    }

    const { comment } = req.body;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!['in_kitchen', 'ready'].includes(order.status)) {
      return res.status(400).json({ error: 'La commande doit être en cuisine ou prête pour ajouter un commentaire' });
    }

    await db.run(
      `UPDATE orders SET kitchen_comment = ? WHERE id = ?`,
      [comment || null, req.params.id]
    );

    res.json({ success: true, kitchen_comment: comment });
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
      `UPDATE orders SET status = 'served', served_at = datetime('now', 'localtime') WHERE id = ?`,
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
        paid_at = datetime('now', 'localtime'),
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

// Obtenir les commandes surveillées (pour alertes temps réel côté client)
router.get('/alerts/pending', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const settings = await db.get('SELECT * FROM settings LIMIT 1');
    if (!settings || !settings.alert_enabled) {
      return res.json([]);
    }

    const currentUser = await db.get('SELECT id, role, username FROM users WHERE id = ?', [req.userId]);
    const userRole = currentUser?.role || req.role || 'cashier';

    // Récupérer les commandes selon le rôle
    let query = `
      SELECT o.*, COALESCE(u.username, 'Inconnu') as cashier_name
      FROM orders o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.status IN ('draft', 'validated', 'in_kitchen', 'ready', 'served')
    `;
    const queryParams = [];

    if (userRole === 'cashier') {
      query += ' AND o.created_by = ?';
      queryParams.push(req.userId);
    }
    query += ' ORDER BY o.created_at ASC';

    const orders = await db.all(query, queryParams);

    // Enrichir chaque commande avec status_since et alert_threshold_minutes
    // Le client calcule lui-même si c'est en alerte (permet détection temps réel)
    const enriched = orders.map(order => {
      let statusDateStr, alertMinutes, statusLabel;

      switch(order.status) {
        case 'draft':
          statusDateStr = order.created_at;
          alertMinutes = settings.alert_draft_minutes || 15;
          statusLabel = 'Brouillon';
          break;
        case 'validated':
          statusDateStr = order.validated_at || order.created_at;
          alertMinutes = settings.alert_validated_minutes || 10;
          statusLabel = 'Validée';
          break;
        case 'in_kitchen':
          statusDateStr = order.kitchen_at || order.validated_at || order.created_at;
          alertMinutes = settings.alert_kitchen_minutes || 20;
          statusLabel = 'En cuisine';
          break;
        case 'ready':
          statusDateStr = order.ready_at || order.kitchen_at || order.created_at;
          alertMinutes = settings.alert_ready_minutes || 5;
          statusLabel = 'Prête';
          break;
        case 'served':
          statusDateStr = order.served_at || order.ready_at || order.created_at;
          alertMinutes = settings.alert_served_minutes || 30;
          statusLabel = 'Servie';
          break;
        default:
          return null;
      }

      // Parsing robuste SQLite "YYYY-MM-DD HH:MM:SS" → ISO sans Z (heure locale)
      const isoDate = statusDateStr.replace(' ', 'T');

      return {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        status_label: statusLabel,
        status_since: isoDate,                    // ← timestamp de début du statut
        alert_threshold_minutes: alertMinutes,     // ← seuil pour ce statut
        table_number: order.table_number,
        order_type: order.order_type,
        cashier_name: order.cashier_name,
        total: order.total,
        items: order.items,
        notes: order.notes,
        created_at: order.created_at
      };
    }).filter(Boolean);

    res.json(enriched);
  } catch (error) {
    console.error('[ALERTS] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Statistiques détaillées par statut avec temps moyen
router.get('/stats/detailed', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params = [];

    if (start_date) {
      dateFilter += ' AND DATE(o.created_at) >= ?';
      params.push(start_date);
    }

    if (end_date) {
      dateFilter += ' AND DATE(o.created_at) <= ?';
      params.push(end_date);
    }

    // Statistiques par statut
    const statusStats = await db.all(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(total) as total_amount,
        AVG(total) as avg_amount,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM orders o
      WHERE 1=1 ${dateFilter}
      GROUP BY status
    `, params);

    // Temps moyen par statut
    const timeStats = await db.all(`
      SELECT
        'draft_to_validated' as transition,
        AVG((julianday(validated_at) - julianday(created_at)) * 24 * 60) as avg_minutes,
        COUNT(*) as count
      FROM orders
      WHERE validated_at IS NOT NULL ${dateFilter}
      
      UNION ALL
      
      SELECT
        'validated_to_kitchen' as transition,
        AVG((julianday(kitchen_at) - julianday(validated_at)) * 24 * 60) as avg_minutes,
        COUNT(*) as count
      FROM orders
      WHERE kitchen_at IS NOT NULL ${dateFilter}
      
      UNION ALL
      
      SELECT
        'kitchen_to_ready' as transition,
        AVG((julianday(ready_at) - julianday(kitchen_at)) * 24 * 60) as avg_minutes,
        COUNT(*) as count
      FROM orders
      WHERE ready_at IS NOT NULL ${dateFilter}
      
      UNION ALL
      
      SELECT
        'ready_to_served' as transition,
        AVG((julianday(served_at) - julianday(ready_at)) * 24 * 60) as avg_minutes,
        COUNT(*) as count
      FROM orders
      WHERE served_at IS NOT NULL ${dateFilter}
      
      UNION ALL
      
      SELECT
        'served_to_paid' as transition,
        AVG((julianday(paid_at) - julianday(served_at)) * 24 * 60) as avg_minutes,
        COUNT(*) as count
      FROM orders
      WHERE paid_at IS NOT NULL ${dateFilter}
    `, params);

    res.json({
      status_stats: statusStats,
      time_stats: timeStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

