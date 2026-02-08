import express from 'express';

const router = express.Router();

// Get daily sales report
router.get('/sales/daily', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { start_date, end_date } = req.query;

    let query = `
      SELECT
        DATE(transaction_date) as date,
        COUNT(*) as transaction_count,
        SUM(total) as total_sales,
        SUM(tax) as total_tax,
        SUM(discount) as total_discount,
        AVG(total) as average_transaction,
        MIN(total) as min_transaction,
        MAX(total) as max_transaction
      FROM transactions
      WHERE 1=1
    `;

    const params = [];

    if (start_date) {
      query += ' AND DATE(transaction_date) >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND DATE(transaction_date) <= ?';
      params.push(end_date);
    }

    query += ' GROUP BY DATE(transaction_date) ORDER BY date DESC';

    const report = await db.all(query, params);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get payment methods report
router.get('/payments', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { start_date, end_date } = req.query;

    let query = `
      SELECT
        payment_method,
        COUNT(*) as count,
        SUM(total) as total,
        AVG(total) as average
      FROM transactions
      WHERE 1=1
    `;

    const params = [];

    if (start_date) {
      query += ' AND DATE(transaction_date) >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND DATE(transaction_date) <= ?';
      params.push(end_date);
    }

    query += ' GROUP BY payment_method ORDER BY total DESC';

    const report = await db.all(query, params);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get products sales report
router.get('/products', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const report = await db.all(`
      SELECT
        id,
        name,
        COUNT(*) as times_sold,
        SUM(CAST(json_extract(t.items, '$.quantity') AS INTEGER)) as quantity_sold,
        SUM(total) as revenue
      FROM products p
      LEFT JOIN transactions t ON t.items LIKE '%' || p.id || '%'
      GROUP BY p.id
      ORDER BY revenue DESC
    `);

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

