const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { initDB, queryAll, queryOne, runSql, saveDB, getLastId } = require('./db');

const app = express();
const JWT_SECRET = crypto.randomBytes(32).toString('hex');

const USERS = [
  { id: 1, username: 'admin', passwordHash: '$2b$10$BkI6/6cRqFQP92NQzbhjH.yP76ugXPHGMZKzAf1U7LJtfMWE1aorO' }
];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
app.get('/api/products', (req, res) => {
  res.json(queryAll('SELECT * FROM products ORDER BY name, packaging'));
});

app.post('/api/products', (req, res) => {
  const { name, hsn_code, packaging, price } = req.body;
  runSql('INSERT INTO products (name, hsn_code, packaging, price) VALUES (?, ?, ?, ?)', [name, hsn_code, packaging, price]);
  const id = getLastId();
  saveDB();
  res.json({ id });
});

app.put('/api/products/:id', (req, res) => {
  const { name, hsn_code, packaging, price } = req.body;
  runSql('UPDATE products SET name=?, hsn_code=?, packaging=?, price=? WHERE id=?', [name, hsn_code, packaging, price, Number(req.params.id)]);
  saveDB();
  res.json({ success: true });
});

app.delete('/api/products/:id', (req, res) => {
  runSql('DELETE FROM products WHERE id=?', [Number(req.params.id)]);
  saveDB();
  res.json({ success: true });
});

// ── Customers API ──
app.get('/api/customers', (req, res) => {
  res.json(queryAll('SELECT * FROM customers ORDER BY name'));
});

app.post('/api/customers', (req, res) => {
  const { name, address, mob_no, gst_no } = req.body;
  runSql('INSERT INTO customers (name, address, mob_no, gst_no) VALUES (?, ?, ?, ?)', [name, address, mob_no, gst_no]);
  const id = getLastId();
  saveDB();
  res.json({ id });
});

app.put('/api/customers/:id', (req, res) => {
  const { name, address, mob_no, gst_no } = req.body;
  runSql('UPDATE customers SET name=?, address=?, mob_no=?, gst_no=? WHERE id=?', [name, address, mob_no, gst_no, Number(req.params.id)]);
  saveDB();
  res.json({ success: true });
});

app.delete('/api/customers/:id', (req, res) => {
  runSql('DELETE FROM customers WHERE id=?', [Number(req.params.id)]);
  saveDB();
  res.json({ success: true });
});

// ── Invoices API ──
app.get('/api/invoices/next-number', (req, res) => {
  const row = queryOne('SELECT COALESCE(MAX(invoice_no), 0) + 1 as next_no FROM invoices');
  res.json({ next_no: row.next_no });
});

app.post('/api/invoices', (req, res) => {
  const { invoice_no, invoice_date, customer_id, items, subtotal, cgst_total, sgst_total, grand_total } = req.body;
  try {
    runSql('INSERT INTO invoices (invoice_no, invoice_date, customer_id, subtotal, cgst_total, sgst_total, grand_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [invoice_no, invoice_date, customer_id, subtotal, cgst_total, sgst_total, grand_total]);
    const invoiceId = getLastId();
    for (const item of items) {
      runSql('INSERT INTO invoice_items (invoice_id, product_id, quantity, price, amount) VALUES (?, ?, ?, ?, ?)',
        [invoiceId, item.product_id, item.quantity, item.price, item.amount]);
    }
    saveDB();
    res.json({ id: invoiceId, invoice_no });
  } catch (err) {
    console.error('Error creating invoice:', err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/invoices', (req, res) => {
  const { customer_id, from_date, to_date } = req.query;
  let sql = `SELECT i.*, c.name as customer_name, c.address as customer_address,
             c.mob_no as customer_mob, c.gst_no as customer_gst
             FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE 1=1`;
  const params = [];
  if (customer_id) { sql += ' AND i.customer_id = ?'; params.push(Number(customer_id)); }
  if (from_date) { sql += ' AND i.invoice_date >= ?'; params.push(from_date); }
  if (to_date) { sql += ' AND i.invoice_date <= ?'; params.push(to_date); }
  sql += ' ORDER BY i.invoice_no DESC';
  res.json(queryAll(sql, params));
});

app.get('/api/invoices/:id', (req, res) => {
  const invoice = queryOne(`SELECT i.*, c.name as customer_name, c.address as customer_address,
    c.mob_no as customer_mob, c.gst_no as customer_gst
    FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE i.id = ?`, [Number(req.params.id)]);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const items = queryAll(`SELECT ii.*, p.name as product_name, p.hsn_code, p.packaging
    FROM invoice_items ii JOIN products p ON ii.product_id = p.id WHERE ii.invoice_id = ?`, [Number(req.params.id)]);
  res.json({ ...invoice, items });
});

app.delete('/api/invoices/:id', (req, res) => {
  runSql('DELETE FROM invoice_items WHERE invoice_id = ?', [Number(req.params.id)]);
  runSql('DELETE FROM invoices WHERE id = ?', [Number(req.params.id)]);
  saveDB();
  res.json({ success: true });
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
