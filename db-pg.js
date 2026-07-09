const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        hsn_code TEXT NOT NULL,
        packaging TEXT NOT NULL,
        price REAL NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        brand TEXT NOT NULL DEFAULT 'pushp'
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        mob_no TEXT,
        gst_no TEXT
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_no INTEGER NOT NULL UNIQUE,
        invoice_date TEXT NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        bill_type TEXT NOT NULL DEFAULT 'gst',
        subtotal REAL NOT NULL DEFAULT 0,
        cgst_rate REAL NOT NULL DEFAULT 2.5,
        sgst_rate REAL NOT NULL DEFAULT 2.5,
        cgst_total REAL NOT NULL DEFAULT 0,
        sgst_total REAL NOT NULL DEFAULT 0,
        discount_rate REAL NOT NULL DEFAULT 5,
        discount_total REAL NOT NULL DEFAULT 0,
        grand_total REAL NOT NULL DEFAULT 0,
        payment_mode TEXT NOT NULL DEFAULT 'cash',
        amount_paid REAL NOT NULL DEFAULT 0,
        brand TEXT NOT NULL DEFAULT 'pushp',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL DEFAULT 1,
        price REAL NOT NULL,
        amount REAL NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_log (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Seed products
    const { rows: [{ count: pCount }] } = await client.query('SELECT COUNT(*)::int as count FROM products');
    if (pCount === 0) {
      const products = [
        ['Pushp Haldi Powder', '0910', '100g', 30, 'pushp'],
        ['Pushp Haldi Powder', '0910', '200g', 55, 'pushp'],
        ['Pushp Haldi Powder', '0910', '500g', 130, 'pushp'],
        ['Pushp Haldi Powder', '0910', '1kg', 250, 'pushp'],
        ['Pushp Lal Mirchi Powder', '0904', '100g', 40, 'pushp'],
        ['Pushp Lal Mirchi Powder', '0904', '200g', 75, 'pushp'],
        ['Pushp Lal Mirchi Powder', '0904', '500g', 180, 'pushp'],
        ['Pushp Lal Mirchi Powder', '0904', '1kg', 340, 'pushp'],
        ['Pushp Dhaniya Powder', '0909', '100g', 25, 'pushp'],
        ['Pushp Dhaniya Powder', '0909', '200g', 45, 'pushp'],
        ['Pushp Dhaniya Powder', '0909', '500g', 110, 'pushp'],
        ['Pushp Garam Masala', '0910', '50g', 35, 'pushp'],
        ['Pushp Garam Masala', '0910', '100g', 65, 'pushp'],
        ['Pushp Garam Masala', '0910', '200g', 120, 'pushp'],
        ['Pushp Kitchen King Masala', '0910', '100g', 55, 'pushp'],
        ['Pushp Kitchen King Masala', '0910', '200g', 100, 'pushp'],
        ['Pushp Meat Masala', '0910', '100g', 60, 'pushp'],
        ['Pushp Biryani Masala', '0910', '50g', 40, 'pushp'],
        ['Pushp Sambhar Masala', '0910', '100g', 45, 'pushp'],
        ['Pushp Jeera Powder', '0909', '100g', 50, 'pushp'],
        ['Pushp Jeera Powder', '0909', '200g', 95, 'pushp'],
        ['Sapat Pariwar Chai', '0902', '100g', 30, 'sapat'],
        ['Sapat Pariwar Chai', '0902', '250g', 70, 'sapat'],
        ['Sapat Pariwar Chai', '0902', '500g', 135, 'sapat'],
        ['Sapat Pariwar Chai', '0902', '1kg', 260, 'sapat'],
        ['Sapat Pariwar Chai Premium', '0902', '100g', 40, 'sapat'],
        ['Sapat Pariwar Chai Premium', '0902', '250g', 95, 'sapat'],
        ['Sapat Pariwar Chai Premium', '0902', '500g', 180, 'sapat'],
        ['Sapat Pariwar Chai Premium', '0902', '1kg', 350, 'sapat'],
      ];
      for (const p of products) {
        await client.query('INSERT INTO products (name, hsn_code, packaging, price, brand) VALUES ($1, $2, $3, $4, $5)', p);
      }
    }

    // Seed customers
    const { rows: [{ count: cCount }] } = await client.query('SELECT COUNT(*)::int as count FROM customers');
    if (cCount === 0) {
      const customers = [
        ['Cash Customer', 'Walk-in', '', ''],
        ['Sharma General Store', 'Main Road, Beed', '9876543210', '27AABCS1234A1Z1'],
        ['Patil Kirana', 'Bus Stand, Beed', '9876543211', '27AABCP5678B1Z2'],
      ];
      for (const c of customers) {
        await client.query('INSERT INTO customers (name, address, mob_no, gst_no) VALUES ($1, $2, $3, $4)', c);
      }
    }
  } finally {
    client.release();
  }
}

async function queryAll(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows.length ? rows[0] : null;
}

async function runSql(sql, params = []) {
  return pool.query(sql, params);
}

async function runSqlReturning(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows.length ? rows[0] : null;
}

// No-op for compatibility
function saveDB() {}

module.exports = { initDB, queryAll, queryOne, runSql, runSqlReturning, saveDB };
