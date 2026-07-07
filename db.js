const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Use /data volume on Railway, local directory otherwise
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DB_PATH = path.join(DATA_DIR, 'invoices.db');
let db;

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hsn_code TEXT NOT NULL,
      packaging TEXT NOT NULL,
      price REAL NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      mob_no TEXT,
      gst_no TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no INTEGER NOT NULL UNIQUE,
      invoice_date TEXT NOT NULL,
      customer_id INTEGER NOT NULL,
      bill_type TEXT NOT NULL DEFAULT 'gst',
      subtotal REAL NOT NULL DEFAULT 0,
      cgst_rate REAL NOT NULL DEFAULT 2.5,
      sgst_rate REAL NOT NULL DEFAULT 2.5,
      cgst_total REAL NOT NULL DEFAULT 0,
      sgst_total REAL NOT NULL DEFAULT 0,
      discount_rate REAL NOT NULL DEFAULT 5,
      discount_total REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Seed products
  const [{ values: [[pCount]] }] = db.exec('SELECT COUNT(*) FROM products');
  if (pCount === 0) {
    const products = [
      ['Pushp Haldi Powder', '0910', '100g', 30],
      ['Pushp Haldi Powder', '0910', '200g', 55],
      ['Pushp Haldi Powder', '0910', '500g', 130],
      ['Pushp Haldi Powder', '0910', '1kg', 250],
      ['Pushp Lal Mirchi Powder', '0904', '100g', 40],
      ['Pushp Lal Mirchi Powder', '0904', '200g', 75],
      ['Pushp Lal Mirchi Powder', '0904', '500g', 180],
      ['Pushp Lal Mirchi Powder', '0904', '1kg', 340],
      ['Pushp Dhaniya Powder', '0909', '100g', 25],
      ['Pushp Dhaniya Powder', '0909', '200g', 45],
      ['Pushp Dhaniya Powder', '0909', '500g', 110],
      ['Pushp Garam Masala', '0910', '50g', 35],
      ['Pushp Garam Masala', '0910', '100g', 65],
      ['Pushp Garam Masala', '0910', '200g', 120],
      ['Pushp Kitchen King Masala', '0910', '100g', 55],
      ['Pushp Kitchen King Masala', '0910', '200g', 100],
      ['Pushp Meat Masala', '0910', '100g', 60],
      ['Pushp Biryani Masala', '0910', '50g', 40],
      ['Pushp Sambhar Masala', '0910', '100g', 45],
      ['Pushp Jeera Powder', '0909', '100g', 50],
      ['Pushp Jeera Powder', '0909', '200g', 95],
      ['Sapat Pariwar Chai', '0902', '100g', 30],
      ['Sapat Pariwar Chai', '0902', '250g', 70],
      ['Sapat Pariwar Chai', '0902', '500g', 135],
      ['Sapat Pariwar Chai', '0902', '1kg', 260],
      ['Sapat Pariwar Chai Premium', '0902', '100g', 40],
      ['Sapat Pariwar Chai Premium', '0902', '250g', 95],
      ['Sapat Pariwar Chai Premium', '0902', '500g', 180],
      ['Sapat Pariwar Chai Premium', '0902', '1kg', 350],
    ];
    const stmt = db.prepare('INSERT INTO products (name, hsn_code, packaging, price) VALUES (?, ?, ?, ?)');
    for (const p of products) { stmt.run(p); }
    stmt.free();
  }

  // Seed customers
  const [{ values: [[cCount]] }] = db.exec('SELECT COUNT(*) FROM customers');
  if (cCount === 0) {
    const customers = [
      ['Cash Customer', 'Walk-in', '', ''],
      ['Sharma General Store', 'Main Road, Beed', '9876543210', '27AABCS1234A1Z1'],
      ['Patil Kirana', 'Bus Stand, Beed', '9876543211', '27AABCP5678B1Z2'],
    ];
    const stmt = db.prepare('INSERT INTO customers (name, address, mob_no, gst_no) VALUES (?, ?, ?, ?)');
    for (const c of customers) { stmt.run(c); }
    stmt.free();
  }

  saveDB();
  return db;
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getDB() { return db; }

// Helper: run SELECT and return array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

function runSql(sql, params = []) {
  if (params.length) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  } else {
    db.run(sql);
  }
}

function getLastId() {
  const result = db.exec('SELECT last_insert_rowid() as id');
  if (result.length && result[0].values.length) {
    return result[0].values[0][0];
  }
  return 0;
}

module.exports = { initDB, getDB, saveDB, queryAll, queryOne, runSql, getLastId };
