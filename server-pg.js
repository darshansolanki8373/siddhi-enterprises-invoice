const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { initDB, queryAll, queryOne, runSql, runSqlReturning, saveDB } = require('./db-pg');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const USERS = [
  { id: 1, username: 'admin', passwordHash: '$2b$10$wlnJ6VfzrJsWcco/Rl92Oedg4z7I4o56X0fqeYbt8wAyZAI4UHLbO' }
];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/collection', express.static(path.join(__dirname, 'collection')));

// ── Auth ──
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, username: user.username });
});

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Protect all /api routes except login
app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  authMiddleware(req, res, next);
});

// ── Products API ──
app.get('/api/products', async (req, res) => {
  const { brand } = req.query;
  let sql = 'SELECT * FROM products';
  const params = [];
  if (brand) { sql += ' WHERE brand = $1'; params.push(brand); }
  sql += ' ORDER BY name, packaging';
  res.json(await queryAll(sql, params));
});

app.post('/api/products', async (req, res) => {
  const { name, hsn_code, packaging, price, brand } = req.body;
  const row = await runSqlReturning('INSERT INTO products (name, hsn_code, packaging, price, brand) VALUES ($1, $2, $3, $4, $5) RETURNING id', [name, hsn_code, packaging, price, brand || 'pushp']);
  res.json({ id: row.id });
});

app.put('/api/products/:id', async (req, res) => {
  const { name, hsn_code, packaging, price } = req.body;
  await runSql('UPDATE products SET name=$1, hsn_code=$2, packaging=$3, price=$4 WHERE id=$5', [name, hsn_code, packaging, price, Number(req.params.id)]);
  res.json({ success: true });
});

app.put('/api/products/:id/stock', async (req, res) => {
  const { quantity, type, notes } = req.body;
  const qty = Number(quantity);
  if (type === 'in') {
    await runSql('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, Number(req.params.id)]);
  } else {
    await runSql('UPDATE products SET stock = stock - $1 WHERE id = $2', [qty, Number(req.params.id)]);
  }
  await runSql('INSERT INTO stock_log (product_id, type, quantity, notes) VALUES ($1, $2, $3, $4)',
    [Number(req.params.id), type || 'in', qty, notes || '']);
  const product = await queryOne('SELECT * FROM products WHERE id = $1', [Number(req.params.id)]);
  res.json({ success: true, stock: product.stock });
});

app.get('/api/stock-log', async (req, res) => {
  const { product_id, brand } = req.query;
  let sql = `SELECT sl.*, p.name as product_name, p.packaging
    FROM stock_log sl JOIN products p ON sl.product_id = p.id WHERE 1=1`;
  const params = [];
  let n = 1;
  if (product_id) { sql += ` AND sl.product_id = $${n++}`; params.push(Number(product_id)); }
  if (brand) { sql += ` AND p.brand = $${n++}`; params.push(brand); }
  sql += ' ORDER BY sl.created_at DESC';
  res.json(await queryAll(sql, params));
});

app.delete('/api/products/:id', async (req, res) => {
  await runSql('DELETE FROM products WHERE id=$1', [Number(req.params.id)]);
  res.json({ success: true });
});

// ── Customers API ──
app.get('/api/customers', async (req, res) => {
  res.json(await queryAll('SELECT * FROM customers ORDER BY name'));
});

app.post('/api/customers', async (req, res) => {
  const { name, address, mob_no, gst_no } = req.body;
  const row = await runSqlReturning('INSERT INTO customers (name, address, mob_no, gst_no) VALUES ($1, $2, $3, $4) RETURNING id', [name, address, mob_no, gst_no]);
  res.json({ id: row.id });
});

app.put('/api/customers/:id', async (req, res) => {
  const { name, address, mob_no, gst_no } = req.body;
  await runSql('UPDATE customers SET name=$1, address=$2, mob_no=$3, gst_no=$4 WHERE id=$5', [name, address, mob_no, gst_no, Number(req.params.id)]);
  res.json({ success: true });
});

app.delete('/api/customers/:id', async (req, res) => {
  await runSql('DELETE FROM customers WHERE id=$1', [Number(req.params.id)]);
  res.json({ success: true });
});

// ── Invoices API ──
app.get('/api/invoices/next-number', async (req, res) => {
  const { brand } = req.query;
  let sql = 'SELECT COALESCE(MAX(invoice_no), 0) + 1 as next_no FROM invoices';
  const params = [];
  if (brand) { sql += ' WHERE brand = $1'; params.push(brand); }
  const row = await queryOne(sql, params);
  res.json({ next_no: row.next_no });
});

app.post('/api/invoices', async (req, res) => {
  const { invoice_no, invoice_date, customer_id, bill_type, items, subtotal, cgst_rate, sgst_rate, cgst_total, sgst_total, discount_rate, discount_total, grand_total, payment_mode, amount_paid, brand } = req.body;
  try {
    const paidAmount = amount_paid != null ? Number(amount_paid) : (payment_mode === 'cash' ? grand_total : 0);
    const row = await runSqlReturning(
      'INSERT INTO invoices (invoice_no, invoice_date, customer_id, bill_type, subtotal, cgst_rate, sgst_rate, cgst_total, sgst_total, discount_rate, discount_total, grand_total, payment_mode, amount_paid, brand) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id',
      [invoice_no, invoice_date, customer_id, bill_type || 'gst', subtotal, cgst_rate || 0, sgst_rate || 0, cgst_total || 0, sgst_total || 0, discount_rate || 0, discount_total || 0, grand_total, payment_mode || 'cash', paidAmount, brand || 'pushp']);
    const invoiceId = row.id;
    for (const item of items) {
      await runSql('INSERT INTO invoice_items (invoice_id, product_id, quantity, price, amount) VALUES ($1, $2, $3, $4, $5)',
        [invoiceId, item.product_id, item.quantity, item.price, item.amount]);
      await runSql('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, item.product_id]);
      await runSql('INSERT INTO stock_log (product_id, type, quantity, notes) VALUES ($1, $2, $3, $4)',
        [item.product_id, 'sale', item.quantity, 'Invoice #' + invoice_no]);
    }
    res.json({ id: invoiceId, invoice_no });
  } catch (err) {
    console.error('Error creating invoice:', err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/invoices', async (req, res) => {
  const { customer_id, from_date, to_date, brand } = req.query;
  let sql = `SELECT i.*, c.name as customer_name, c.address as customer_address,
             c.mob_no as customer_mob, c.gst_no as customer_gst
             FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE 1=1`;
  const params = [];
  let n = 1;
  if (brand) { sql += ` AND i.brand = $${n++}`; params.push(brand); }
  if (customer_id) { sql += ` AND i.customer_id = $${n++}`; params.push(Number(customer_id)); }
  if (from_date) { sql += ` AND i.invoice_date >= $${n++}`; params.push(from_date); }
  if (to_date) { sql += ` AND i.invoice_date <= $${n++}`; params.push(to_date); }
  sql += ' ORDER BY i.invoice_no DESC';
  res.json(await queryAll(sql, params));
});

app.get('/api/invoices/:id', async (req, res) => {
  const invoice = await queryOne(`SELECT i.*, c.name as customer_name, c.address as customer_address,
    c.mob_no as customer_mob, c.gst_no as customer_gst
    FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE i.id = $1`, [Number(req.params.id)]);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const items = await queryAll(`SELECT ii.*, p.name as product_name, p.hsn_code, p.packaging
    FROM invoice_items ii JOIN products p ON ii.product_id = p.id WHERE ii.invoice_id = $1`, [Number(req.params.id)]);
  res.json({ ...invoice, items });
});

app.delete('/api/invoices/:id', async (req, res) => {
  await runSql('DELETE FROM invoice_items WHERE invoice_id = $1', [Number(req.params.id)]);
  await runSql('DELETE FROM invoices WHERE id = $1', [Number(req.params.id)]);
  res.json({ success: true });
});

// ── Customer Balances API ──
app.get('/api/customer-balances', async (req, res) => {
  const { brand } = req.query;
  let brandFilter = '';
  const params = [];
  if (brand) { brandFilter = ' AND i.brand = $1'; params.push(brand); }
  const balances = await queryAll(`
    SELECT c.id, c.name, c.mob_no,
      COALESCE(SUM(i.grand_total - i.amount_paid), 0) as total_credit,
      COALESCE(SUM(i.amount_paid), 0) as total_cash,
      COALESCE(SUM(i.grand_total), 0) as total_sales
    FROM customers c
    LEFT JOIN invoices i ON c.id = i.customer_id${brandFilter}
    GROUP BY c.id, c.name, c.mob_no
    HAVING COALESCE(SUM(i.grand_total - i.amount_paid), 0) > 0
    ORDER BY total_credit DESC
  `, params);
  res.json(balances);
});

app.get('/api/customer-balances/:id', async (req, res) => {
  const { brand } = req.query;
  let sql = `SELECT id, invoice_no, invoice_date, grand_total, amount_paid, payment_mode, bill_type,
    (grand_total - amount_paid) as credit_remaining
    FROM invoices WHERE customer_id = $1 AND (grand_total - amount_paid) > 0`;
  const params = [Number(req.params.id)];
  let n = 2;
  if (brand) { sql += ` AND brand = $${n++}`; params.push(brand); }
  sql += ' ORDER BY invoice_date DESC';
  res.json(await queryAll(sql, params));
});

app.put('/api/invoices/:id/mark-paid', async (req, res) => {
  const { amount, payment_date, notes } = req.body || {};
  const invoice = await queryOne('SELECT * FROM invoices WHERE id = $1', [Number(req.params.id)]);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const payAmount = amount != null ? Number(amount) : (invoice.grand_total - invoice.amount_paid);
  const newAmountPaid = invoice.amount_paid + payAmount;
  const newMode = newAmountPaid >= invoice.grand_total ? 'cash' : invoice.payment_mode;
  await runSql('UPDATE invoices SET amount_paid = $1, payment_mode = $2 WHERE id = $3', [newAmountPaid, newMode, Number(req.params.id)]);
  await runSql('INSERT INTO payment_log (invoice_id, amount, payment_date, notes) VALUES ($1, $2, $3, $4)',
    [Number(req.params.id), payAmount, payment_date || new Date().toISOString().slice(0, 10), notes || '']);
  res.json({ success: true });
});

app.get('/api/invoices/:id/payments', async (req, res) => {
  res.json(await queryAll('SELECT * FROM payment_log WHERE invoice_id = $1 ORDER BY payment_date DESC, created_at DESC', [Number(req.params.id)]));
});

// ── Reports API ──
app.get('/api/reports/unpaid', async (req, res) => {
  const { from_date, to_date, brand } = req.query;
  let sql = `SELECT i.invoice_no, i.invoice_date, c.name as customer_name, i.grand_total
             FROM invoices i JOIN customers c ON i.customer_id = c.id
             WHERE (i.grand_total - i.amount_paid) > 0`;
  const params = [];
  let n = 1;
  if (brand) { sql += ` AND i.brand = $${n++}`; params.push(brand); }
  if (from_date) { sql += ` AND i.invoice_date >= $${n++}`; params.push(from_date); }
  if (to_date) { sql += ` AND i.invoice_date <= $${n++}`; params.push(to_date); }
  sql += ' ORDER BY i.invoice_date DESC';
  res.json(await queryAll(sql, params));
});

app.get('/api/reports/monthly', async (req, res) => {
  const { month, bill_type, brand } = req.query;
  let sql = `SELECT i.invoice_no, i.invoice_date, c.name as customer_name, i.bill_type,
             i.subtotal, i.cgst_rate, i.sgst_rate, i.cgst_total, i.sgst_total,
             i.discount_total, i.grand_total
             FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE 1=1`;
  const params = [];
  let n = 1;
  if (brand) { sql += ` AND i.brand = $${n++}`; params.push(brand); }
  if (month) {
    sql += ` AND i.invoice_date >= $${n++} AND i.invoice_date <= $${n++}`;
    params.push(month + '-01');
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    params.push(month + '-' + String(lastDay).padStart(2, '0'));
  }
  if (bill_type && bill_type !== 'all') {
    sql += ` AND i.bill_type = $${n++}`;
    params.push(bill_type);
  }
  sql += ' ORDER BY i.invoice_date, i.invoice_no';
  res.json(await queryAll(sql, params));
});

app.get('/api/reports/product-sales', async (req, res) => {
  const { year, view, brand } = req.query;
  if (!year) return res.status(400).json({ error: 'Year required' });
  let sql = `SELECT p.id, p.name, p.packaging, ii.quantity, ii.amount, i.invoice_date
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    JOIN products p ON ii.product_id = p.id
    WHERE i.invoice_date >= $1 AND i.invoice_date <= $2`;
  const params = [year + '-01-01', year + '-12-31'];
  let n = 3;
  if (brand) { sql += ` AND p.brand = $${n++}`; params.push(brand); }
  sql += ' ORDER BY i.invoice_date';
  res.json(await queryAll(sql, params));
});

app.get('/api/reports/product-stock-report', async (req, res) => {
  const { month, brand } = req.query;
  if (!month) return res.status(400).json({ error: 'Month required' });
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const fromDate = month + '-01';
  const toDate = month + '-' + String(lastDay).padStart(2, '0');
  let sql = `SELECT p.id, p.name, p.hsn_code, p.packaging, p.price, p.stock as current_stock,
    COALESCE(SUM(ii.quantity), 0) as qty_sold,
    COALESCE(SUM(ii.amount), 0) as revenue
    FROM products p
    LEFT JOIN invoice_items ii ON p.id = ii.product_id
      AND ii.invoice_id IN (SELECT id FROM invoices WHERE invoice_date >= $1 AND invoice_date <= $2)
    WHERE 1=1`;
  const params = [fromDate, toDate];
  let n = 3;
  if (brand) { sql += ` AND p.brand = $${n++}`; params.push(brand); }
  sql += ' GROUP BY p.id ORDER BY qty_sold DESC, p.name';
  res.json(await queryAll(sql, params));
});

// ── Start ──
async function start() {
  await initDB();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Siddhi Enterprises Invoice App running on port ${PORT}`);
  });
}

start();
