const express = require('express');
const cors = require('cors');
const db = require('./db.js');
const multer = require('multer');
const { OpenAI } = require('openai');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const tesseract = require('tesseract.js');
const { parsePharmaInvoice } = require('./invoiceParser');
const axios = require('axios');
require('dotenv').config();

// ─── bcrypt helper ───
const SALT_ROUNDS = 10;
function hashPassword(plain) { return bcrypt.hashSync(plain, SALT_ROUNDS); }
function verifyPassword(plain, hash) {
  // Support legacy plain-text passwords during transition
  if (hash && (hash.startsWith('$2a$') || hash.startsWith('$2b$'))) {
    return bcrypt.compareSync(plain, hash);
  }
  return plain === hash; // plain-text fallback
}

const upload = multer({ storage: multer.memoryStorage() });

// Resolve uploads dir: writable userData in production, local in dev
function getUploadsDir() {
  if (process.env.USER_DATA_PATH) {
    return path.join(process.env.USER_DATA_PATH, 'uploads', 'bills');
  }
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      return path.join(app.getPath('userData'), 'uploads', 'bills');
    }
  } catch {
    // plain node dev
  }
  return path.join(__dirname, 'uploads', 'bills');
}

// Disk storage for bill images
const BILLS_DIR = getUploadsDir();
if (!fs.existsSync(BILLS_DIR)) fs.mkdirSync(BILLS_DIR, { recursive: true });
const billStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BILLS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `bill_${Date.now()}${ext}`);
  },
});
const uploadBill = multer({ storage: billStorage });

// OpenAI client – instantiate when needed: new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
// Serve stored bill images as static files
app.use('/api/bills', express.static(BILLS_DIR));

// ─── Schema migrations (safe — only adds if column is missing) ───
const runMigrations = () => {
  const productInfo = db.prepare("PRAGMA table_info(products)").all();
  const productCols = productInfo.map(c => c.name);
  if (!productCols.includes('purchase_price')) {
    db.prepare("ALTER TABLE products ADD COLUMN purchase_price REAL DEFAULT 0").run();
    console.log('[Migration] Added purchase_price column to products table');
  }
  if (!productCols.includes('category')) {
    db.prepare("ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'Other'").run();
    console.log('[Migration] Added category column to products table');
  }
  if (!productCols.includes('manufacturer')) {
    db.prepare("ALTER TABLE products ADD COLUMN manufacturer TEXT").run();
    console.log('[Migration] Added manufacturer column to products table');
  }
  if (!productCols.includes('pack_size')) {
    db.prepare("ALTER TABLE products ADD COLUMN pack_size INTEGER DEFAULT 1").run();
    console.log('[Migration] Added pack_size column to products table');
  }
  if (!productCols.includes('item_type')) {
    db.prepare("ALTER TABLE products ADD COLUMN item_type TEXT DEFAULT 'PHARMA'").run();
    console.log('[Migration] Added item_type column to products table');
  }
  if (!productCols.includes('hsn_code')) {
    db.prepare("ALTER TABLE products ADD COLUMN hsn_code TEXT DEFAULT '30049099'").run();
    console.log('[Migration] Added hsn_code column to products table');
  }
  if (!productCols.includes('discount')) {
    db.prepare('ALTER TABLE products ADD COLUMN discount REAL DEFAULT 0').run();
    console.log('[Migration] Added discount column to products table');
  }

  const customerInfo = db.prepare("PRAGMA table_info(customers)").all();
  const customerCols = customerInfo.map(c => c.name);
  if (!customerCols.includes('address')) {
    db.prepare("ALTER TABLE customers ADD COLUMN address TEXT").run();
    console.log('[Migration] Added address column to customers table');
  }
  if (!customerCols.includes('age')) {
    db.prepare("ALTER TABLE customers ADD COLUMN age INTEGER").run();
    console.log('[Migration] Added age column to customers table');
  }

  // purchases table migrations
  const purchaseInfo = db.prepare("PRAGMA table_info(purchases)").all();
  const purchaseCols = purchaseInfo.map(c => c.name);
  if (!purchaseCols.includes('image_path')) {
    db.prepare("ALTER TABLE purchases ADD COLUMN image_path TEXT").run();
    console.log('[Migration] Added image_path column to purchases table');
  }

  // draft_bills table (pending bills for medicines not yet in inventory)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS draft_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_name TEXT,
      patient_phone TEXT,
      patient_gender TEXT DEFAULT 'Male',
      patient_reference TEXT,
      prescriber_name TEXT,
      payment_mode TEXT DEFAULT 'cash',
      customer_id INTEGER,
      notes TEXT,
      items_json TEXT NOT NULL,
      estimated_total REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // stock_adjustments table for logging physical audits and stock corrections
  db.prepare(`
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      adjusted_stock INTEGER NOT NULL,
      difference INTEGER NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `).run();
};
runMigrations();

// ─── Cached prepared statements (compiled once, reused forever) ───

const stmts = {
  // Auth
  getUser: db.prepare('SELECT id, username, role, password FROM users WHERE username = ?'),

  // Products
  getAllProducts: db.prepare('SELECT * FROM products ORDER BY id DESC'),
  insertProduct: db.prepare('INSERT INTO products (name, brand_name, salt_composition, description, price, stock, sku, batch, expiry, mrp, gst, pack_size, item_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  updateProduct: db.prepare('UPDATE products SET name = ?, brand_name = ?, salt_composition = ?, description = ?, price = ?, stock = ?, sku = ?, batch = ?, expiry = ?, mrp = ?, gst = ?, pack_size = ?, item_type = ? WHERE id = ?'),
  deleteProduct: db.prepare('DELETE FROM products WHERE id = ?'),
  expiringProducts: db.prepare("SELECT * FROM products WHERE expiry IS NOT NULL AND expiry != '' AND expiry >= ? AND expiry <= ? ORDER BY expiry ASC"),
  expiredProducts: db.prepare("SELECT * FROM products WHERE expiry IS NOT NULL AND expiry != '' AND expiry < ? ORDER BY expiry ASC"),

  // Customers
  getAllCustomers: db.prepare('SELECT * FROM customers ORDER BY name ASC'),
  insertCustomer: db.prepare('INSERT INTO customers (name, phone, gender, reference_name) VALUES (?, ?, ?, ?)'),
  updateCustomer: db.prepare('UPDATE customers SET name = ?, phone = ?, gender = ?, reference_name = ? WHERE id = ?'),
  deleteCustomer: db.prepare('DELETE FROM customers WHERE id = ?'),
  getCustomer: db.prepare('SELECT * FROM customers WHERE id = ?'),

  // Stats (combined into one query where possible)
  countProducts: db.prepare('SELECT COUNT(*) AS count FROM products'),
  countLowStock: db.prepare('SELECT COUNT(*) AS count FROM products WHERE stock <= 10'),
  countCustomers: db.prepare('SELECT COUNT(*) AS count FROM customers'),
  todaySales: db.prepare(`
    SELECT 
      COUNT(*) AS count, 
      COALESCE(SUM(total_amount - refunded_amount), 0) AS total,
      COALESCE(SUM(margin), 0) AS profit
    FROM (
      SELECT 
        s.id, 
        s.total_amount, 
        s.refunded_amount,
        (
          SELECT SUM(((si.price * (si.quantity - si.returned_quantity)) * (1 - si.discount/100)) - (si.purchase_price * (si.quantity - si.returned_quantity)))
          FROM sale_items si WHERE si.sale_id = s.id
        ) AS margin
      FROM sales s
      WHERE DATE(s.created_at) = ? AND s.is_returned = 0
    )
  `),
  totalValuation: db.prepare('SELECT SUM(stock * purchase_price) AS total FROM products'),
  todayPurchases: db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total FROM purchases WHERE DATE(purchase_date) = ?"),

  // Customer sales history
  customerSales: db.prepare('SELECT sales.*, users.username FROM sales JOIN users ON sales.user_id = users.id WHERE sales.customer_id = ? ORDER BY sales.created_at DESC'),
  settleCredit: db.prepare('UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ?'),
  addCredit: db.prepare('UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?'),

  // Sales
  insertSale: db.prepare('INSERT INTO sales (customer_id, prescriber_name, subtotal, gst_total, discount_total, total_amount, payment_status, user_id, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  insertSaleItem: db.prepare('INSERT INTO sale_items (sale_id, product_id, quantity, price, mrp, gst, discount, purchase_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  updateStock: db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?'),
  restockProduct: db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?'),
  markSaleReturned: db.prepare('UPDATE sales SET is_returned = 1 WHERE id = ?'),
  updateRefundedAmount: db.prepare('UPDATE sales SET refunded_amount = refunded_amount + ? WHERE id = ?'),
  updateReturnedQuantity: db.prepare('UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE id = ?'),
  removeCredit: db.prepare('UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ?'),
  getAllSales: db.prepare('SELECT sales.*, users.username FROM sales JOIN users ON sales.user_id = users.id ORDER BY sales.created_at DESC'),
  getSale: db.prepare('SELECT sales.*, customers.name AS customer_name, customers.phone AS customer_phone, customers.gender AS customer_gender, customers.reference_name AS customer_reference_name, users.username FROM sales LEFT JOIN customers ON sales.customer_id = customers.id JOIN users ON sales.user_id = users.id WHERE sales.id = ?'),
  getSaleItems: db.prepare('SELECT sale_items.*, products.name, products.batch, products.expiry, products.salt_composition, products.brand_name, products.item_type FROM sale_items JOIN products ON sale_items.product_id = products.id WHERE sale_id = ?'),
  // Suppliers
  getAllSuppliers: db.prepare('SELECT * FROM suppliers ORDER BY name ASC'),
  insertSupplier: db.prepare('INSERT INTO suppliers (name, phone, email, address, gstin) VALUES (?, ?, ?, ?, ?)'),
  updateSupplier: db.prepare('UPDATE suppliers SET name = ?, phone = ?, email = ?, address = ?, gstin = ? WHERE id = ?'),
  deleteSupplier: db.prepare('DELETE FROM suppliers WHERE id = ?'),
  getSupplier: db.prepare('SELECT * FROM suppliers WHERE id = ?'),

  // Purchases
  insertPurchase: db.prepare('INSERT INTO purchases (supplier_id, invoice_no, purchase_date, total_amount, gst_total, net_amount, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  insertPurchaseItem: db.prepare('INSERT INTO purchase_items (purchase_id, product_id, batch, expiry, quantity, purchase_price, mrp, gst) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  addStock: db.prepare('UPDATE products SET stock = stock + ?, batch = ?, expiry = ?, mrp = ?, purchase_price = ?, price = ?, discount = ? WHERE id = ?'),
  reduceStock: db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?'),
  getAllPurchases: db.prepare('SELECT purchases.*, suppliers.name AS supplier_name FROM purchases LEFT JOIN suppliers ON purchases.supplier_id = suppliers.id ORDER BY purchases.created_at DESC'),
  getPurchase: db.prepare('SELECT purchases.*, suppliers.name AS supplier_name FROM purchases LEFT JOIN suppliers ON purchases.supplier_id = suppliers.id WHERE purchases.id = ?'),
  getPurchaseItems: db.prepare('SELECT purchase_items.*, products.name FROM purchase_items JOIN products ON purchase_items.product_id = products.id WHERE purchase_id = ?'),
  updatePurchase: db.prepare('UPDATE purchases SET supplier_id = ?, invoice_no = ?, purchase_date = ?, total_amount = ?, gst_total = ?, net_amount = ?, payment_status = ? WHERE id = ?'),
  deletePurchaseItems: db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?'),
  getProductSupplierPrices: db.prepare(`
    WITH supplier_purchases AS (
      SELECT 
        pur.supplier_id,
        s.name AS supplier_name,
        s.phone AS supplier_phone,
        pi.purchase_price,
        pur.purchase_date,
        ROW_NUMBER() OVER (PARTITION BY pur.supplier_id ORDER BY pur.purchase_date DESC, pur.id DESC) as rn
      FROM purchase_items pi
      JOIN purchases pur ON pi.purchase_id = pur.id
      JOIN suppliers s ON pur.supplier_id = s.id
      WHERE pi.product_id = ?
    ),
    supplier_stats AS (
      SELECT 
        pur.supplier_id,
        MIN(pi.purchase_price) AS best_price,
        COUNT(*) AS purchase_count,
        MAX(pur.purchase_date) AS last_purchase_date
      FROM purchase_items pi
      JOIN purchases pur ON pi.purchase_id = pur.id
      WHERE pi.product_id = ?
      GROUP BY pur.supplier_id
    )
    SELECT 
      ss.supplier_id,
      sp.supplier_name,
      sp.supplier_phone,
      ss.best_price,
      sp.purchase_price AS last_price,
      ss.last_purchase_date,
      ss.purchase_count
    FROM supplier_stats ss
    JOIN supplier_purchases sp ON ss.supplier_id = sp.supplier_id AND sp.rn = 1
    ORDER BY ss.best_price ASC
  `),
  getLatestPurchaseDetails: db.prepare(`
    SELECT 
      pi.batch,
      pi.expiry,
      pi.purchase_price,
      pi.mrp,
      pi.gst
    FROM purchase_items pi
    JOIN purchases pur ON pi.purchase_id = pur.id
    WHERE pi.product_id = ?
    ORDER BY pur.purchase_date DESC, pur.id DESC
    LIMIT 1
  `),
  insertStockAdjustment: db.prepare('INSERT INTO stock_adjustments (product_id, previous_stock, adjusted_stock, difference, reason, notes) VALUES (?, ?, ?, ?, ?, ?)'),
  getStockAdjustments: db.prepare(`
    SELECT sa.*, p.name AS product_name, p.sku, p.batch, p.brand_name
    FROM stock_adjustments sa
    JOIN products p ON sa.product_id = p.id
    ORDER BY sa.created_at DESC
    LIMIT 50
  `),
};

// ─── Helper: build stats object ───
function buildStats(todayStr) {
  const todaySalesResult = stmts.todaySales.get(todayStr);
  return {
    totalProducts: stmts.countProducts.get().count,
    lowStock: stmts.countLowStock.get().count,
    totalCustomers: stmts.countCustomers.get().count,
    todaySales: todaySalesResult.count,
    todayRevenue: todaySalesResult.total,
    todayProfit: todaySalesResult.profit,
    totalValuation: stmts.totalValuation.get().total || 0,
    todayPurchases: stmts.todayPurchases.get(todayStr).total || 0,
  };
}

// ─── Auth ───
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const user = stmts.getUser.get(username);
    if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.is_active === 0) return res.status(403).json({ error: 'Account is deactivated. Contact admin.' });
    // Log login activity
    db.prepare('INSERT INTO login_logs (user_id, username, action, ip) VALUES (?, ?, ?, ?)').run(
      user.id, user.username, 'login', req.ip || req.connection?.remoteAddress || 'unknown'
    );
    const { password: _, ...userData } = user;
    res.json({ user: userData });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password (self-service)
app.put('/api/auth/change-password', (req, res) => {
  const { userId, currentPassword, newPassword } = req.body;
  if (!userId || !currentPassword || !newPassword) return res.status(400).json({ error: 'All fields required' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });
  try {
    const user = db.prepare('SELECT id, password FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!verifyPassword(currentPassword, user.password)) return res.status(401).json({ error: 'Current password is incorrect' });
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(newPassword), userId);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Internal server error' }); }
});

// ___ User Management ___

app.get('/api/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, role, is_active, permissions FROM users ORDER BY id ASC').all();
    res.json(users);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/users/login-log', (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  try {
    const logs = db.prepare('SELECT * FROM login_logs ORDER BY created_at DESC LIMIT ?').all(limit);
    res.json(logs);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/users', (req, res) => {
  const { username, password, role, permissions, is_active } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  try {
    const hashed = hashPassword(password);
    const permsJson = permissions ? JSON.stringify(permissions) : null;
    const result = db.prepare(
      'INSERT INTO users (username, password, role, permissions, is_active) VALUES (?, ?, ?, ?, ?)'
    ).run(username.trim(), hashed, role || 'billing', permsJson, is_active != null ? is_active : 1);
    res.json({ id: result.lastInsertRowid, username: username.trim(), role: role || 'billing', is_active: is_active != null ? is_active : 1 });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { username, role, permissions, is_active } = req.body;
  try {
    const permsJson = permissions ? JSON.stringify(permissions) : null;
    db.prepare('UPDATE users SET username = ?, role = ?, permissions = ?, is_active = ? WHERE id = ?')
      .run(username, role, permsJson, is_active != null ? is_active : 1, id);
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id/password', (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  try {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(password), id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/users/:id/status', (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  try {
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { requesterId } = req.body || {};
  if (String(requesterId) === String(id)) return res.status(400).json({ error: 'You cannot delete your own account' });
  try {
    const salesCount = db.prepare('SELECT COUNT(*) AS count FROM sales WHERE user_id = ?').get(id);
    if (salesCount && salesCount.count > 0) {
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
      return res.json({ success: true, deactivated: true, message: 'User deactivated (has sales records)' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── POS Init (combined single-request bootstrap for Billing page) ───
app.get('/api/pos-init', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Read all settings as a flat key-value object
    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    const settings = settingsRows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
    res.json({
      products: stmts.getAllProducts.all(),
      customers: stmts.getAllCustomers.all(),
      stats: buildStats(today),
      settings,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Products ───
app.get('/api/products', (req, res) => {
  try { res.json(stmts.getAllProducts.all()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/products', (req, res) => {
  const { name, brand_name, salt_composition, description, price, stock, sku, batch, expiry, mrp, gst, pack_size, item_type } = req.body;
  try {
    const result = stmts.insertProduct.run(name, brand_name, salt_composition, description, price, stock, sku, batch, expiry, mrp, gst, pack_size || 1, item_type || 'PHARMA');
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/products/:id', (req, res) => {
  const { name, brand_name, salt_composition, description, price, stock, sku, batch, expiry, mrp, gst, pack_size, item_type } = req.body;
  const { id } = req.params;
  try {
    stmts.updateProduct.run(name, brand_name, salt_composition, description, price, stock, sku, batch, expiry, mrp, gst, pack_size || 1, item_type || 'PHARMA', id);
    res.json({ id: Number(id), ...req.body });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  try { stmts.deleteProduct.run(id); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── Stock Adjustments & Verification ───
app.post('/api/products/:id/adjust-stock', (req, res) => {
  const { id } = req.params;
  const { adjusted_stock, reason, notes } = req.body;

  if (adjusted_stock == null || !reason) {
    return res.status(400).json({ error: 'adjusted_stock and reason are required' });
  }

  const newStock = parseInt(adjusted_stock, 10);
  if (isNaN(newStock) || newStock < 0) {
    return res.status(400).json({ error: 'Invalid adjusted_stock value' });
  }

  try {
    const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const previousStock = product.stock;
    const difference = newStock - previousStock;

    const executeAdjustment = db.transaction(() => {
      db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, id);
      stmts.insertStockAdjustment.run(
        Number(id),
        previousStock,
        newStock,
        difference,
        reason,
        notes || ''
      );
    });

    executeAdjustment();

    const updatedProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stock-adjustments', (req, res) => {
  try {
    const adjustments = stmts.getStockAdjustments.all();
    res.json(adjustments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Quick-add product (for manual purchase entry items not yet in DB) ───
app.post('/api/products/quick', (req, res) => {
  const { name, brand_name, salt_composition, category, mrp, purchase_price, gst, pack_size, item_type } = req.body;
  if (!name) return res.status(400).json({ error: 'Product name is required' });
  try {
    // Auto-generate a unique SKU: QA-<timestamp>-<4 random hex chars>
    const sku = `QA-${Date.now()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
    const result = db.prepare(
      `INSERT INTO products (name, brand_name, salt_composition, category, mrp, purchase_price, gst, stock, price, sku, pack_size, item_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    ).run(
      name,
      brand_name || '',
      salt_composition || '',
      category || 'Other',
      mrp || 0,
      purchase_price || 0,
      gst || 0,
      mrp || 0,
      sku,
      pack_size || 1,
      item_type || 'PHARMA'
    );
    res.json({ id: result.lastInsertRowid, name, sku });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── Supplier Price Comparison ───
app.get('/api/products/:id/supplier-prices', (req, res) => {
  const { id } = req.params;
  try {
    const prices = stmts.getProductSupplierPrices.all(id, id);
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Latest Purchase Details (Autofill) ───
app.get('/api/products/:id/latest-purchase-details', (req, res) => {
  const { id } = req.params;
  try {
    const details = stmts.getLatestPurchaseDetails.get(id);
    res.json(details || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Expiry Alerts ───
app.get('/api/products/expiring', (req, res) => {
  try {
    const today = new Date();
    const limit = new Date();
    limit.setDate(today.getDate() + 90);
    const todayStr = today.toISOString().slice(0, 7);
    const limitStr = limit.toISOString().slice(0, 7);
    res.json({
      expiring: stmts.expiringProducts.all(todayStr, limitStr),
      expired: stmts.expiredProducts.all(todayStr),
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── Online Search Proxy ───
app.get('/api/search-online', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);

  try {
    const response = await axios.get(`https://pharmeasy.in/api/search/search/?p=1&q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    const items = response.data?.data?.products || [];
    const formatted = items.map(item => {
      // Extract strength from product name e.g. "Azithromycin 500mg Tablet" → "500mg"
      const strengthMatch = item.name && item.name.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|IU|units?|%)\b)/i);
      const strength = strengthMatch ? strengthMatch[1].replace(/\s+/g, '') : '';

      // Build generic name with strength: "AZITHROMYCIN (500mg)"
      const molecule = item.moleculeName || '';
      const generic_name = molecule && strength ? `${molecule} (${strength})` : molecule;

      // Format Item Name: "DOLO 650MG TAB 1X15"
      let baseName = item.name || '';
      baseName = baseName.replace(/\s*\([^)]*\)\s*/g, ' '); // remove (Generic Name)
      const matchBase = baseName.match(/^(.*?)(?:Strip|Tablet|Syrup|Capsule|Drop|Injection|Ointment|Cream|Sachet|Vial)/i);
      if (matchBase) baseName = matchBase[1].trim();

      let form = 'TAB';
      const searchStr = (item.name + ' ' + (item.measurementUnit || '')).toLowerCase();
      if (searchStr.includes('syrup')) form = 'SYP';
      else if (searchStr.includes('capsule')) form = 'CAP';
      else if (searchStr.includes('drop')) form = 'DROP';
      else if (searchStr.includes('injection') || searchStr.includes('vial')) form = 'INJ';
      else if (searchStr.includes('ointment') || searchStr.includes('cream')) form = 'OINT';
      else if (searchStr.includes('sachet')) form = 'SACHET';

      let pack = '';
      let packSize = 1;
      let qtyMatch = (item.measurementUnit || '').match(/(\d+)\s*(?:Tablet|Capsule|Sachet|Vial)/i);
      if (!qtyMatch) qtyMatch = (item.name || '').match(/(?:Of|Pack of)\s*(\d+)/i);

      if (qtyMatch) {
        pack = `1x${qtyMatch[1]}`;
        packSize = parseInt(qtyMatch[1]) || 1;
      } else if (searchStr.includes('ml')) {
        const mlMatch = searchStr.match(/(\d+)\s*ml/i);
        if (mlMatch) pack = `${mlMatch[1]}ML`;
      } else if (searchStr.match(/(\d+(?:\.\d+)?)\s*(?:gm|g)/i)) {
        const gMatch = searchStr.match(/(\d+(?:\.\d+)?)\s*(?:gm|g)/i);
        pack = `${gMatch[1]}GM`;
      }

      const formattedName = `${baseName} ${form} ${pack}`.replace(/\s+/g, ' ').trim().toUpperCase();

      return {
        name: formattedName,
        brand_name: item.manufacturer || '',
        generic_name,
        mrp: parseFloat(item.mrpDecimal || 0),
        pack_size: packSize,
        pieces_per_unit: item.measurementUnit || '',
        schedule_category: item.isRxRequired ? 'H' : 'OTC',
        id: item.productId
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('Online search error:', error.message);
    res.status(500).json({ error: 'Failed to fetch online data' });
  }
});

// ─── Customers ───
const buildCustomersQuery = (query) => {
  const { search, filter_type } = query;
  let where = "1=1";
  let having = "1=1";
  const params = [];

  if (search) {
    where += ` AND (
      cast(c.id as text) LIKE ? OR
      c.name LIKE ? OR
      c.phone LIKE ?
    )`;
    const likeSearch = `%${search}%`;
    params.push(likeSearch, likeSearch, likeSearch);
  }

  if (filter_type === 'credit') {
    where += " AND c.credit_balance > 0";
  } else if (filter_type === 'high_value') {
    having += " AND total_purchase > 10000";
  } else if (filter_type === 'recent') {
    having += " AND last_visit_date >= date('now', '-7 days')";
  } else if (filter_type === 'inactive') {
    having += " AND (last_visit_date < date('now', '-30 days') OR last_visit_date IS NULL)";
  }

  return { where, having, params };
};

app.get('/api/customers/summary', (req, res) => {
  try {
    const summary = db.prepare(`
      SELECT
        COUNT(id) as total_customers,
        SUM(CASE WHEN credit_balance > 0 THEN 1 ELSE 0 END) as credit_customers,
        SUM(credit_balance) as total_outstanding,
        (SELECT COUNT(DISTINCT customer_id) FROM sales WHERE created_at >= date('now', '-30 days')) as active_customers_30d
      FROM customers
    `).get();
    res.json(summary);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/customers', (req, res) => {
  try {
    const { where, having, params } = buildCustomersQuery(req.query);
    const customers = db.prepare(`
      SELECT 
        c.*,
        COALESCE(SUM(CASE WHEN s.is_returned = 0 THEN s.total_amount ELSE 0 END), 0) AS total_purchase,
        MAX(s.created_at) AS last_visit_date,
        COUNT(CASE WHEN s.is_returned = 0 THEN s.id END) AS total_bills,
        AVG(CASE WHEN s.is_returned = 0 THEN s.total_amount END) AS avg_bill
      FROM customers c
      LEFT JOIN sales s ON c.id = s.customer_id
      WHERE ${where}
      GROUP BY c.id
      HAVING ${having}
      ORDER BY c.name ASC
    `).all(...params);
    res.json(customers);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/customers', (req, res) => {
  const { name, phone, gender, reference_name, address, age } = req.body;
  try {
    const result = db.prepare('INSERT INTO customers (name, phone, gender, reference_name, address, age) VALUES (?, ?, ?, ?, ?, ?)').run(name, phone, gender, reference_name, address, age);
    res.json({ id: result.lastInsertRowid, ...req.body, credit_balance: 0, total_purchase: 0 });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/customers/:id', (req, res) => {
  const { name, phone, gender, reference_name, address, age } = req.body;
  const { id } = req.params;
  try {
    db.prepare('UPDATE customers SET name = ?, phone = ?, gender = ?, reference_name = ?, address = ?, age = ? WHERE id = ?').run(name, phone, gender, reference_name, address, age, id);
    res.json({ id: Number(id), ...req.body });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  try {
    // Block deletion if the customer has any completed bills
    const salesCount = db.prepare('SELECT COUNT(*) AS count FROM sales WHERE customer_id = ?').get(id);
    if (salesCount && salesCount.count > 0) {
      return res.status(409).json({
        error: `Cannot delete this customer. They have ${salesCount.count} completed bill(s) on record. Bill history must be preserved.`
      });
    }
    stmts.deleteCustomer.run(id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/customers/:id/sales', (req, res) => {
  const { id } = req.params;
  try { res.json(stmts.customerSales.all(id)); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/customers/:id/settle', (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  try {
    stmts.settleCredit.run(amount, id);
    res.json(stmts.getCustomer.get(id));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── Low Stock Register (with last supplier name) ───
app.get('/api/products/low-stock', (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold || '10', 10);
    const rows = db.prepare(`
      SELECT
        p.*,
        COALESCE(sup.name, 'Unknown / Not Purchased') AS supplier_name,
        COALESCE(sup.phone, '') AS supplier_phone,
        COALESCE(sup.gstin, '') AS supplier_gstin,
        MAX(pur.purchase_date) AS last_purchase_date
      FROM products p
      LEFT JOIN purchase_items pi ON pi.product_id = p.id
      LEFT JOIN purchases pur ON pur.id = pi.purchase_id
      LEFT JOIN suppliers sup ON sup.id = pur.supplier_id
      WHERE p.stock <= ?
      GROUP BY p.id
      ORDER BY p.stock ASC, p.name ASC
    `).all(threshold);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── Stats ───
app.get('/api/stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    res.json(buildStats(today));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── GST Report (GSTR-1 output + GSTR-2 ITC) ───
app.get('/api/gst-report', (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    // Build date filters
    let salesWhere = "WHERE s.is_returned = 0";
    let purchaseWhere = "WHERE 1=1";
    const sParams = [];
    const pParams = [];
    if (date_from) { salesWhere += " AND DATE(s.created_at) >= ?"; sParams.push(date_from); purchaseWhere += " AND pur.purchase_date >= ?"; pParams.push(date_from); }
    if (date_to) { salesWhere += " AND DATE(s.created_at) <= ?"; sParams.push(date_to); purchaseWhere += " AND pur.purchase_date <= ?"; pParams.push(date_to); }

    // GSTR-1: HSN + GST slab wise outward supply
    const outputRows = db.prepare(`
      SELECT
        COALESCE(p.hsn_code, '30049099') AS hsn_code,
        COALESCE(si.gst, 0) AS gst_rate,
        ROUND(SUM(si.price * si.quantity * (1.0 - COALESCE(si.discount, 0) / 100.0)), 2) AS taxable_value,
        COUNT(DISTINCT s.id) AS invoice_count
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN products p ON si.product_id = p.id
      ${salesWhere}
      GROUP BY COALESCE(p.hsn_code, '30049099'), COALESCE(si.gst, 0)
      ORDER BY gst_rate, hsn_code
    `).all(...sParams);

    // GSTR-2: Purchase ITC
    const itcRows = db.prepare(`
      SELECT
        COALESCE(sup.name, 'Unknown Supplier') AS supplier_name,
        COALESCE(sup.gstin, '') AS supplier_gstin,
        pur.invoice_no,
        pur.purchase_date,
        COALESCE(pi.gst, 0) AS gst_rate,
        ROUND(SUM(pi.purchase_price * pi.quantity), 2) AS taxable_value,
        ROUND(SUM(pi.purchase_price * pi.quantity * COALESCE(pi.gst, 0) / 100.0), 2) AS gst_amount
      FROM purchases pur
      LEFT JOIN purchase_items pi ON pur.id = pi.purchase_id
      LEFT JOIN suppliers sup ON pur.supplier_id = sup.id
      ${purchaseWhere}
      GROUP BY pur.id, COALESCE(pi.gst, 0)
      ORDER BY pur.purchase_date DESC
    `).all(...pParams);

    // Monthly trend: last 12 months output vs ITC
    const monthlyOutput = db.prepare(`
      SELECT strftime('%Y-%m', s.created_at) AS month, ROUND(SUM(s.gst_total), 2) AS output_tax
      FROM sales s WHERE s.is_returned = 0
      GROUP BY month ORDER BY month DESC LIMIT 12
    `).all();

    const monthlyITC = db.prepare(`
      SELECT strftime('%Y-%m', pur.purchase_date) AS month, ROUND(SUM(pur.gst_total), 2) AS itc
      FROM purchases pur WHERE pur.purchase_date IS NOT NULL
      GROUP BY month ORDER BY month DESC LIMIT 12
    `).all();

    // Compute summary totals
    const outputTax = outputRows.reduce((sum, r) => sum + (r.taxable_value * r.gst_rate / 100), 0);
    const itcTotal = itcRows.reduce((sum, r) => sum + (r.gst_amount || 0), 0);
    const taxableValue = outputRows.reduce((sum, r) => sum + (r.taxable_value || 0), 0);

    res.json({
      outputRows,
      itcRows,
      monthlyOutput: monthlyOutput.reverse(),
      monthlyITC: monthlyITC.reverse(),
      summary: {
        outputTax: Math.round(outputTax * 100) / 100,
        itcTotal: Math.round(itcTotal * 100) / 100,
        netPayable: Math.round((outputTax - itcTotal) * 100) / 100,
        taxableValue: Math.round(taxableValue * 100) / 100,
      },
    });
  } catch (error) {
    console.error('[gst-report]', error);
    res.status(500).json({ error: error.message });
  }
});

// Distinct prescriber names for autocomplete (most-used first)
app.get('/api/sales/prescribers', (req, res) => {
  const { q } = req.query;
  try {
    let sql = `
      SELECT prescriber_name AS name, COUNT(*) AS uses
      FROM sales
      WHERE prescriber_name IS NOT NULL AND trim(prescriber_name) != ''
    `;
    const params = [];
    if (q && q.trim()) {
      sql += ` AND prescriber_name LIKE ?`;
      params.push(`%${q.trim()}%`);
    }
    sql += ` GROUP BY LOWER(TRIM(prescriber_name)) ORDER BY uses DESC LIMIT 20`;
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(r => r.name));
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/api/sales', (req, res) => {
  const { subtotal, gst_total, discount_total, total_amount, user_id, customer_id, prescriber_name, payment_status, payment_details, items } = req.body;
  if (!user_id || !items || items.length === 0) return res.status(400).json({ error: 'Invalid sale data' });

  try {
    const transaction = db.transaction(() => {
      // Determine effective payment_status
      let effectiveStatus = payment_status || 'paid';
      let detailsJson = null;
      if (payment_details && Array.isArray(payment_details) && payment_details.length > 0) {
        detailsJson = JSON.stringify(payment_details);
        if (payment_details.length > 1) {
          effectiveStatus = 'split';
        } else {
          effectiveStatus = payment_details[0].method === 'credit' ? 'credit' : 'paid';
        }
      }

      const saleResult = stmts.insertSale.run(customer_id || null, prescriber_name || null, subtotal || 0, gst_total || 0, discount_total || 0, total_amount, effectiveStatus, user_id, detailsJson);
      const saleId = saleResult.lastInsertRowid;
      for (const item of items) {
        // Fetch current purchase_price if not provided (safety)
        const product = db.prepare('SELECT purchase_price FROM products WHERE id = ?').get(item.product_id);
        const pPrice = item.purchase_price || (product ? product.purchase_price : 0);

        stmts.insertSaleItem.run(saleId, item.product_id, item.quantity, item.price, item.mrp || 0, item.gst || 0, item.discount || 0, pPrice);
        stmts.updateStock.run(item.quantity, item.product_id);
      }

      // Handle credit: for split payments, only add the credit portion
      if (customer_id) {
        if (effectiveStatus === 'split' && payment_details) {
          const creditSplit = payment_details.find(p => p.method === 'credit');
          if (creditSplit && creditSplit.amount > 0) {
            stmts.addCredit.run(creditSplit.amount, customer_id);
          }
        } else if (effectiveStatus === 'credit') {
          stmts.addCredit.run(total_amount, customer_id);
        }
      }
      return saleId;
    });

    const saleId = transaction();
    res.json({ success: true, saleId });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── Partial (item-level) return ───
app.post('/api/sales/:id/partial-return', (req, res) => {
  const { id } = req.params;
  const { items } = req.body; // [{sale_item_id, product_id, quantity, price, gst, discount}]
  if (!items || items.length === 0) return res.status(400).json({ error: 'No items provided for return' });

  try {
    const sale = stmts.getSale.get(id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.is_returned) return res.status(400).json({ error: 'This bill is already fully returned' });

    // Validate quantities against current sale_items
    const saleItems = stmts.getSaleItems.all(id);
    for (const item of items) {
      const dbItem = saleItems.find(si => si.id === item.sale_item_id);
      if (!dbItem) return res.status(400).json({ error: `Sale item not found: ${item.sale_item_id}` });
      const maxReturnable = dbItem.quantity - (dbItem.returned_quantity || 0);
      if (item.quantity > maxReturnable) {
        return res.status(400).json({ error: `Cannot return ${item.quantity} of "${dbItem.name}" — only ${maxReturnable} remaining to return.` });
      }
    }

    // Calculate refund total
    let refundAmount = 0;
    for (const item of items) {
      const lineTotal = item.price * item.quantity * (1 - (item.discount || 0) / 100);
      const gstAmt = lineTotal * ((item.gst || 0) / 100);
      refundAmount += lineTotal + gstAmt;
    }

    db.transaction(() => {
      // Restock each returned item
      for (const item of items) {
        stmts.restockProduct.run(item.quantity, item.product_id);
      }
      // Update bill with refunded amount
      stmts.updateRefundedAmount.run(refundAmount, id);

      // Update individual item returned quantities by sale_item primary key
      for (const item of items) {
        stmts.updateReturnedQuantity.run(item.quantity, item.sale_item_id);
      }

      // If credit sale, reduce outstanding credit by refund amount
      if (sale.payment_status === 'credit' && sale.customer_id) {
        stmts.removeCredit.run(refundAmount, sale.customer_id);
      }
    })();

    res.json({ success: true, refundAmount: refundAmount.toFixed(2) });
  } catch (error) {
    console.error('[partial-return] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sales/:id/return', (req, res) => {
  const { id } = req.params;
  try {
    const sale = stmts.getSale.get(id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.is_returned) return res.status(400).json({ error: 'Sale is already returned' });

    const items = stmts.getSaleItems.all(id);

    db.transaction(() => {
      // 1. Mark sale as returned
      stmts.markSaleReturned.run(id);

      // 2. Restock items (only unreturned quantities)
      for (const item of items) {
        const remainingQty = item.quantity - (item.returned_quantity || 0);
        if (remainingQty > 0) {
          stmts.restockProduct.run(remainingQty, item.product_id);
        }
      }

      // 3. Set refunded_amount to the remaining (not-yet-refunded) portion of the bill
      const remainingRefund = sale.total_amount - (sale.refunded_amount || 0);
      if (remainingRefund > 0) {
        stmts.updateRefundedAmount.run(remainingRefund, id);
      }

      // 4. Remove credit if applicable (only the remaining amount)
      if (sale.payment_status === 'credit' && sale.customer_id) {
        const creditToRemove = sale.total_amount - (sale.refunded_amount || 0);
        if (creditToRemove > 0) {
          stmts.removeCredit.run(creditToRemove, sale.customer_id);
        }
      }
    })();

    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

const buildSalesQuery = (query) => {
  const { search, date_from, date_to, payment_mode, is_returned } = query;
  let where = "1=1";
  const params = [];

  if (search) {
    where += ` AND (
      cast(s.id as text) LIKE ? OR
      c.name LIKE ? OR
      c.phone LIKE ? OR
      s.prescriber_name LIKE ? OR
      EXISTS (
        SELECT 1 FROM sale_items si2 
        JOIN products p2 ON si2.product_id = p2.id 
        WHERE si2.sale_id = s.id AND p2.name LIKE ?
      )
    )`;
    const likeSearch = `%${search}%`;
    params.push(likeSearch, likeSearch, likeSearch, likeSearch, likeSearch);
  }

  if (date_from) {
    where += " AND date(s.created_at) >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND date(s.created_at) <= ?";
    params.push(date_to);
  }
  if (payment_mode && payment_mode !== 'all') {
    where += " AND s.payment_status = ?";
    params.push(payment_mode);
  }
  if (is_returned === 'true' || is_returned === '1') {
    where += " AND s.is_returned = 1";
  } else if (is_returned === 'false' || is_returned === '0') {
    where += " AND COALESCE(s.is_returned, 0) = 0";
  }
  // also handle high value
  if (query.high_value === 'true' || query.high_value === '1') {
    where += " AND s.total_amount > 2000";
  }

  return { where, params };
};

app.get('/api/sales/summary', (req, res) => {
  try {
    const { where, params } = buildSalesQuery(req.query);
    const rows = db.prepare(`
      SELECT s.total_amount, s.payment_status, s.payment_details, s.is_returned
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE ${where}
    `).all(...params);

    let total_bills = 0, total_sales = 0;
    const split = { cash: 0, upi: 0, card: 0, credit: 0 };
    let returns_count = 0, returns_amount = 0;

    for (const row of rows) {
      total_bills++;
      total_sales += row.total_amount || 0;
      if (row.is_returned) { returns_count++; returns_amount += row.total_amount || 0; }

      // Parse payment details for accurate split
      if (row.payment_details) {
        try {
          const details = JSON.parse(row.payment_details);
          for (const d of details) {
            if (Object.prototype.hasOwnProperty.call(split, d.method)) split[d.method] += d.amount || 0;
          }
          continue; // skip fallback
        } catch { /* fall through to legacy */ }
      }
      // Legacy: single payment_status
      const mode = row.payment_status === 'paid' ? 'cash' : (row.payment_status || 'cash');
      if (Object.prototype.hasOwnProperty.call(split, mode)) split[mode] += row.total_amount || 0;
    }

    res.json({
      total_sales,
      total_bills,
      payment_split: split,
      returns: { count: returns_count, amount: returns_amount }
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/sales', (req, res) => {
  try {
    const { where, params } = buildSalesQuery(req.query);
    const limit = Number(req.query.limit) || 100;
    const offset = Number(req.query.offset) || 0;

    const sales = db.prepare(`
      SELECT
        s.*,
        u.username,
        c.name  AS customer_name,
        c.phone AS customer_phone,
        GROUP_CONCAT(p.name, ', ') AS item_names,
        json_group_array(
          CASE WHEN p.id IS NULL THEN NULL ELSE
          json_object(
            'id', p.id,
            'sale_item_id', si.id,
            'name', p.name,
            'quantity', si.quantity,
            'returned_quantity', si.returned_quantity,
            'price', si.price,
            'discount', si.discount,
            'mrp', si.mrp,
            'gst', si.gst,
            'purchase_price', si.purchase_price
          ) END
        ) AS items_json
      FROM sales s
      LEFT JOIN users     u ON s.user_id     = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN sale_items si ON si.sale_id  = s.id
      LEFT JOIN products   p  ON si.product_id = p.id
      WHERE ${where}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    res.json(sales);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/sales/:id', (req, res) => {
  const { id } = req.params;
  try {
    const sale = stmts.getSale.get(id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    const items = stmts.getSaleItems.all(id);
    res.json({ ...sale, items });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── Suppliers ───
app.get('/api/suppliers', (req, res) => {
  try { res.json(stmts.getAllSuppliers.all()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/suppliers', (req, res) => {
  const { name, phone, email, address, gstin } = req.body;
  try {
    const result = stmts.insertSupplier.run(name, phone, email, address, gstin);
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/suppliers/:id', (req, res) => {
  const { name, phone, email, address, gstin } = req.body;
  const { id } = req.params;
  try {
    stmts.updateSupplier.run(name, phone, email, address, gstin, id);
    res.json({ id: Number(id), ...req.body });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/suppliers/:id', (req, res) => {
  const { id } = req.params;
  try { stmts.deleteSupplier.run(id); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── Purchases ───
app.get('/api/purchases', (req, res) => {
  const { date_from, date_to } = req.query;
  try {
    let query = `
      SELECT purchases.*, suppliers.name AS supplier_name 
      FROM purchases 
      LEFT JOIN suppliers ON purchases.supplier_id = suppliers.id
    `;
    const params = [];
    const conditions = [];
    if (date_from) {
      conditions.push("date(purchases.purchase_date) >= ?");
      params.push(date_from);
    }
    if (date_to) {
      conditions.push("date(purchases.purchase_date) <= ?");
      params.push(date_to);
    }
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY purchases.created_at DESC";
    res.json(db.prepare(query).all(...params));
  }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/purchases/:id', (req, res) => {
  const { id } = req.params;
  try {
    const purchase = stmts.getPurchase.get(id);
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    const items = stmts.getPurchaseItems.all(id);
    res.json({ ...purchase, items });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/purchases', (req, res) => {
  const { supplier_id, invoice_no, purchase_date, total_amount, gst_total, net_amount, payment_status, items } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Invalid purchase data' });

  try {
    const transaction = db.transaction(() => {
      const purchaseResult = stmts.insertPurchase.run(supplier_id || null, invoice_no || null, purchase_date || null, total_amount || 0, gst_total || 0, net_amount || 0, payment_status || 'paid');
      const purchaseId = purchaseResult.lastInsertRowid;
      for (const item of items) {
        const prod = db.prepare('SELECT pack_size FROM products WHERE id = ?').get(item.product_id);
        const packSize = prod ? (prod.pack_size || 1) : 1;
        const newSellingPrice = item.selling_price || item.price || item.mrp || 0;
        stmts.insertPurchaseItem.run(purchaseId, item.product_id, item.batch, item.expiry, item.quantity, item.purchase_price, item.mrp || 0, item.gst || 0);
        stmts.addStock.run(item.quantity * packSize, item.batch, item.expiry, item.mrp || 0, item.purchase_price, newSellingPrice, item.discount || 0, item.product_id);
      }
      return purchaseId;
    });

    const purchaseId = transaction();
    res.json({ success: true, purchaseId });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/purchases/:id', (req, res) => {
  const { supplier_id, invoice_no, purchase_date, total_amount, gst_total, net_amount, payment_status, items } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Invalid purchase data' });

  try {
    const transaction = db.transaction(() => {
      // 1. Fetch old items
      const oldItems = stmts.getPurchaseItems.all(req.params.id);

      // 2. Reverse stock for old items
      for (const oldItem of oldItems) {
        const oldProd = db.prepare('SELECT pack_size FROM products WHERE id = ?').get(oldItem.product_id);
        const oldPackSize = oldProd ? (oldProd.pack_size || 1) : 1;
        stmts.reduceStock.run(oldItem.quantity * oldPackSize, oldItem.product_id);
      }

      // 3. Delete old items
      stmts.deletePurchaseItems.run(req.params.id);

      // 4. Update Header
      stmts.updatePurchase.run(supplier_id || null, invoice_no || null, purchase_date || null, total_amount || 0, gst_total || 0, net_amount || 0, payment_status || 'paid', req.params.id);

      // 5. Insert new items & Apply new stock
      for (const item of items) {
        const prod = db.prepare('SELECT pack_size FROM products WHERE id = ?').get(item.product_id);
        const packSize = prod ? (prod.pack_size || 1) : 1;
        const newSellingPrice = item.selling_price || item.price || item.mrp || 0;
        stmts.insertPurchaseItem.run(req.params.id, item.product_id, item.batch, item.expiry, item.quantity, item.purchase_price, item.mrp || 0, item.gst || 0);
        stmts.addStock.run(item.quantity * packSize, item.batch, item.expiry, item.mrp || 0, item.purchase_price, newSellingPrice, item.discount || 0, item.product_id);
      }
      return req.params.id;
    });

    transaction();
    res.json({ success: true, purchaseId: req.params.id });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/purchases/:id/return', (req, res) => {
  const { items } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'No items provided for return' });

  try {
    const originalPurchase = stmts.getPurchase.get(req.params.id);
    if (!originalPurchase) return res.status(404).json({ error: 'Original purchase not found' });

    let returnTotal = 0;
    let returnGst = 0;
    let returnNet = 0;

    for (const item of items) {
      if (item.return_quantity <= 0) continue;
      const sub = item.return_quantity * item.purchase_price;
      const gst = sub * (item.gst || 0) / 100;
      returnTotal += sub;
      returnGst += gst;
      returnNet += (sub + gst);
    }

    if (returnNet === 0) return res.status(400).json({ error: 'No valid return quantities' });

    const transaction = db.transaction(() => {
      // Create negative purchase record (Debit Note)
      const purchaseResult = stmts.insertPurchase.run(
        originalPurchase.supplier_id,
        `RET-${originalPurchase.invoice_no || req.params.id}`,
        new Date().toISOString().split('T')[0],
        -returnTotal,
        -returnGst,
        -returnNet,
        'refunded'
      );
      const purchaseId = purchaseResult.lastInsertRowid;

      for (const item of items) {
        if (item.return_quantity > 0) {
          const prod = db.prepare('SELECT pack_size FROM products WHERE id = ?').get(item.product_id);
          const packSize = prod ? (prod.pack_size || 1) : 1;
          // Negative quantities
          stmts.insertPurchaseItem.run(purchaseId, item.product_id, item.batch, item.expiry, -item.return_quantity, item.purchase_price, item.mrp || 0, item.gst || 0);
          // Deduct from live stock
          stmts.reduceStock.run(item.return_quantity * packSize, item.product_id);
        }
      }
      return purchaseId;
    });

    const purchaseId = transaction();
    res.json({ success: true, purchaseId });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Attach a bill image to an existing purchase
app.post('/api/purchases/:id/bill', uploadBill.single('billImage'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  try {
    db.prepare('UPDATE purchases SET image_path = ? WHERE id = ?').run(req.file.filename, req.params.id);
    res.json({ success: true, image_path: req.file.filename });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── AI Bill Scan ───
app.post('/api/scan-bill', upload.single('billImage'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });

  try {
    // Run OCR directly on memory buffer
    const { data: { text } } = await tesseract.recognize(req.file.buffer, 'eng');

    // Parse text using our custom parser
    const parsedData = parsePharmaInvoice(text);

    res.json(parsedData);
  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'Failed to process invoice image.' });
  }
});


// ─── Settings ───────────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
    res.json(obj);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/settings', (req, res) => {
  const updates = req.body; // { key: value, ... }
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Invalid payload' });
  try {
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(updates)) {
        upsert.run(key, value == null ? '' : String(value));
      }
    });
    tx();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Logo upload
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BILLS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `logo_${Date.now()}${ext}`);
  },
});
const uploadLogo = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 } });

app.post('/api/settings/logo', uploadLogo.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const logoPath = `/api/bills/${req.file.filename}`;
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('pharmacy_logo', logoPath);
    res.json({ success: true, logo: logoPath });
  } catch (error) { res.status(500).json({ error: error.message }); }
});


// ─── Bill Number ─────────────────────────────────────────────────────────────
app.get('/api/settings/next-bill-no', (req, res) => {
  try {
    const year = new Date().getFullYear();
    const count = db.prepare("SELECT COUNT(*) AS cnt FROM sales WHERE strftime('%Y', created_at) = ?").get(String(year));
    const seq = (count.cnt || 0) + 1;
    const formatted = `PH${year}/${String(seq).padStart(4, '0')}`;
    res.json({ bill_no: formatted, seq });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Pharmacy Express Backend running!' });
});

// ─── Draft Bills ─────────────────────────────────────────────────────────────
// GET all pending draft bills
app.get('/api/draft-bills', (req, res) => {
  try {
    const drafts = db.prepare('SELECT * FROM draft_bills WHERE status = ? ORDER BY created_at DESC').all('pending');
    res.json(drafts);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// POST create a new draft bill (no stock deduction)
app.post('/api/draft-bills', (req, res) => {
  const { patient_name, patient_phone, patient_gender, patient_reference, prescriber_name, payment_mode, customer_id, notes, items, estimated_total } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });
  if (!patient_name || !patient_phone) return res.status(400).json({ error: 'Patient name and phone are required' });
  try {
    const result = db.prepare(
      `INSERT INTO draft_bills (patient_name, patient_phone, patient_gender, patient_reference, prescriber_name, payment_mode, customer_id, notes, items_json, estimated_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      patient_name, patient_phone, patient_gender || 'Male',
      patient_reference || '', prescriber_name || '',
      payment_mode || 'cash', customer_id || null, notes || '',
      JSON.stringify(items), estimated_total || 0
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// DELETE discard a draft bill
app.delete('/api/draft-bills/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM draft_bills WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// POST complete a draft bill (finalise into a real sale, deduct stock)
app.post('/api/draft-bills/:id/complete', (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  try {
    const draft = db.prepare('SELECT * FROM draft_bills WHERE id = ?').get(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft bill not found' });
    if (draft.status !== 'pending') return res.status(400).json({ error: 'Draft is already completed or discarded' });

    const items = JSON.parse(draft.items_json);

    // ── Resolve each draft item to a live inventory product ──
    const missingItems = [];
    const resolvedItems = [];

    for (const item of items) {
      // Try match by product_id first (if set), then by exact name, then by name LIKE
      let product = null;
      if (item.product_id) {
        product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
      }
      if (!product) {
        product = db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(item.name);
      }
      if (!product) {
        product = db.prepare("SELECT * FROM products WHERE LOWER(name) LIKE LOWER('%' || ? || '%') LIMIT 1").get(item.name);
      }

      if (!product) {
        missingItems.push({ name: item.name, reason: 'Medicine not found in inventory' });
      } else if (product.stock < item.quantity) {
        missingItems.push({ name: item.name, reason: `Only ${product.stock} in stock, need ${item.quantity}` });
      } else {
        resolvedItems.push({ ...item, product_id: product.id, product });
      }
    }

    if (missingItems.length > 0) {
      return res.status(409).json({
        error: 'Some medicines are not available in inventory yet',
        missing: missingItems,
      });
    }

    // ── All items resolved — create the sale in a transaction ──
    // Use GST-inclusive MRP-based calculation (same as main POS checkout)
    // sellingPrice = mrp * qty * (1 - disc%/100)  [GST-inclusive final price]
    // taxableAmt   = sellingPrice / (1 + gst/100)
    // gstAmt       = sellingPrice - taxableAmt
    let subtotal = 0, gstTotal = 0, discountTotal = 0;
    for (const item of resolvedItems) {
      const packSize = parseInt(item.product.pack_size) || 1;
      const mrp = Math.round((parseFloat(item.product.mrp || item.product.price || 0) / packSize) * 100) / 100;
      const qty = parseInt(item.quantity) || 1;
      const gstPct = parseFloat(item.gst) || 0;
      const discPct = parseFloat(item.discount_pct) || 0;
      const grossMrp = mrp * qty;
      const discAmt = grossMrp * (discPct / 100);
      const sellingPrice = grossMrp - discAmt;
      const divisor = 1 + gstPct / 100;
      const taxableAmt = divisor > 0 ? sellingPrice / divisor : sellingPrice;
      const gstAmt = sellingPrice - taxableAmt;
      subtotal += taxableAmt;
      gstTotal += gstAmt;
      discountTotal += discAmt;
      // Store pre-tax unit price on item for insertSaleItem
      item._unitPrice = divisor > 0 ? (mrp * (1 - discPct / 100)) / divisor : mrp;
      item._mrp = mrp;
    }
    const totalAmount = subtotal + gstTotal; // == sum of sellingPrices

    const transaction = db.transaction(() => {
      const saleResult = stmts.insertSale.run(
        draft.customer_id || null,
        draft.prescriber_name || null,
        subtotal, gstTotal, discountTotal,
        totalAmount,
        draft.payment_mode === 'credit' ? 'credit' : 'paid',
        user_id
      );
      const saleId = saleResult.lastInsertRowid;

      for (const item of resolvedItems) {
        const pPrice = item.product.purchase_price || 0;
        const discPct = parseFloat(item.discount_pct) || 0;
        stmts.insertSaleItem.run(saleId, item.product_id, item.quantity, item._unitPrice, item._mrp, item.gst || 0, discPct, pPrice);
        stmts.updateStock.run(item.quantity, item.product_id);
      }

      if (draft.payment_mode === 'credit' && draft.customer_id) {
        stmts.addCredit.run(totalAmount, draft.customer_id);
      }

      // Mark draft as completed
      db.prepare("UPDATE draft_bills SET status = 'completed' WHERE id = ?").run(draft.id);

      return saleId;
    });

    const saleId = transaction();
    res.json({ success: true, saleId, totalAmount });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
// POST AI/Smart Billing Suggestions
app.post('/api/ai/suggest', async (req, res) => {
  const { cart } = req.body;
  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return res.json([]);
  }

  const suggestions = [];
  const seenProductIds = new Set(cart.map(i => i.product_id));

  // Helper to add suggestion if product exists and is not already in cart / suggested
  const addSuggestion = (product, type, label, reason) => {
    if (!product || seenProductIds.has(product.id)) return false;
    suggestions.push({
      product,
      type,
      label,
      reason
    });
    seenProductIds.add(product.id);
    return true;
  };

  try {
    // 1. TRY OPENAI IF KEY EXISTS
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const openai = new OpenAI({ apiKey: openaiKey });
        const cartDescription = cart.map(i =>
          `- ${i.name} (Salt: ${i.salt_composition || 'None'}, Brand: ${i.brand_name || 'None'}, Price: ₹${i.price}, Category: ${i.category || 'Other'})`
        ).join('\n');

        const prompt = `You are Pharmiq AI, a clinical pharmacy assistant.
Based on the current patient shopping cart:
${cartDescription}

Provide up to 3 clinical suggestions for cross-selling, co-prescribing, or generic substitutions.
Return the suggestions strictly as a JSON object of this structure:
{
  "suggestions": [
    {
      "type": "substitute", // or "cross-sell"
      "targetSearchTerm": "medicine name or salt to search in db",
      "label": "short suggestion title",
      "reason": "concise clinical explanation"
    }
  ]
}

Only suggest products that would be relevant to purchase alongside or instead of the cart items. Keep reasons concise.`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        });

        const result = JSON.parse(response.choices[0].message.content);
        if (result && Array.isArray(result.suggestions)) {
          for (const sug of result.suggestions) {
            const term = sug.targetSearchTerm;
            if (!term) continue;
            // Find a matching product in stock
            const match = db.prepare(`
              SELECT * FROM products 
              WHERE (name LIKE ? OR salt_composition LIKE ? OR brand_name LIKE ?) AND stock > 0
              LIMIT 1
            `).get(`%${term}%`, `%${term}%`, `%${term}%`);

            if (match) {
              addSuggestion(match, sug.type, sug.label, sug.reason);
            }
          }
        }
      } catch (aiErr) {
        console.error('[AI Suggestion Error, falling back to local engine]:', aiErr);
      }
    }

    // 2. RUN LOCAL ENGINE FALLBACKS (If OpenAI key is missing, or OpenAI failed, or returned < 3 results)
    if (suggestions.length < 3) {
      // Helper function for salt equivalence
      const isSimilarSalt = (salt1, salt2) => {
        if (!salt1 || !salt2) return false;
        const s1 = salt1.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
        const s2 = salt2.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
        const ignoreWords = new Set(['mg', 'mcg', 'ml', 'g', '%', 'usp', 'ip', 'bp', 'and', 'with', 'plus', '+']);
        const words1 = s1.filter(w => !ignoreWords.has(w));
        const words2 = s2.filter(w => !ignoreWords.has(w));
        if (words1.length === 0 || words2.length === 0) return false;
        const set2 = new Set(words2);
        return words1.every(w => set2.has(w)) && words2.every(w => new Set(words1).has(w));
      };

      for (const item of cart) {
        if (suggestions.length >= 3) break;

        // A. GENERIC SUBSTITUTE: Find cheaper alternative with same salt
        if (item.salt_composition) {
          const alternatives = db.prepare(`
            SELECT * FROM products 
            WHERE id != ? AND stock > 0 AND salt_composition IS NOT NULL AND salt_composition != ''
          `).all(item.product_id);

          for (const alt of alternatives) {
            if (isSimilarSalt(item.salt_composition, alt.salt_composition)) {
              if (alt.mrp < item.mrp || alt.price < item.price) {
                const savingsPct = Math.round((1 - alt.price / item.price) * 100);
                if (savingsPct > 5) {
                  addSuggestion(
                    alt,
                    'substitute',
                    'Generic Substitute',
                    `Save up to ${savingsPct}% with generic equivalent ${alt.name}.`
                  );
                  break; // Only suggest one alternative per cart item
                }
              }
            }
          }
        }

        // B. CLINICAL RULE CO-PRESCRIPTIONS
        const lowerName = (item.name || '').toLowerCase();
        const lowerSalt = (item.salt_composition || '').toLowerCase();

        // 1) Antibiotics -> PPIs/Probiotics
        const isAntibiotic = ['amoxicillin', 'clavulanic', 'cefixime', 'azithromycin', 'ofloxacin', 'doxycycline', 'levofloxacin', 'ciprofloxacin', 'cephalexin', 'metronidazole', 'tinidazole', 'cefuroxime', 'cefpodoxime'].some(w => lowerName.includes(w) || lowerSalt.includes(w));
        if (isAntibiotic) {
          // Find Pantoprazole or Omeprazole or Esomeprazole
          const ppi = db.prepare(`
            SELECT * FROM products 
            WHERE (name LIKE '%pantoprazole%' OR name LIKE '%omeprazole%' OR name LIKE '%esomeprazole%' OR name LIKE '%pan-d%' OR name LIKE '%aciloc%' OR name LIKE '%ranitidine%') AND stock > 0
            LIMIT 1
          `).get();
          if (ppi) {
            addSuggestion(ppi, 'cross-sell', 'Consider Antacid', `Commonly co-prescribed with antibiotics to prevent acidity and protect stomach lining.`);
          }
          const probiotic = db.prepare(`
            SELECT * FROM products 
            WHERE (name LIKE '%probiotic%' OR name LIKE '%sporlac%' OR name LIKE '%lactic acid%') AND stock > 0
            LIMIT 1
          `).get();
          if (probiotic) {
            addSuggestion(probiotic, 'cross-sell', 'Probiotics', `Maintains gut microflora balance when taking antibiotics.`);
          }
        }

        // 2) Painkillers (NSAIDs) -> PPIs
        const isNSAID = ['paracetamol', 'ibuprofen', 'diclofenac', 'aceclofenac', 'nimesulide', 'naproxen', 'tramadol', 'combiflam', 'dolo'].some(w => lowerName.includes(w) || lowerSalt.includes(w));
        if (isNSAID) {
          const ppi = db.prepare(`
            SELECT * FROM products 
            WHERE (name LIKE '%pantoprazole%' OR name LIKE '%omeprazole%' OR name LIKE '%ranitidine%' OR name LIKE '%aciloc%') AND stock > 0
            LIMIT 1
          `).get();
          if (ppi) {
            addSuggestion(ppi, 'cross-sell', 'Stomach Protection', `NSAIDs can cause stomach irritation. An antacid protects the gastric lining.`);
          }
        }

        // 3) Vomiting/Diarrhea -> ORS
        const isGastric = ['loperamide', 'ondansetron', 'domperidone', 'metoclopramide', 'vomikind', 'racecadotril'].some(w => lowerName.includes(w) || lowerSalt.includes(w));
        if (isGastric) {
          const ors = db.prepare(`
            SELECT * FROM products 
            WHERE (name LIKE '%ors%' OR name LIKE '%electral%' OR name LIKE '%electrolyte%') AND stock > 0
            LIMIT 1
          `).get();
          if (ors) {
            addSuggestion(ors, 'cross-sell', 'ORS Rehydration', `Recommended to restore hydration and essential electrolytes.`);
          }
        }

        // 4) Cough/Cold -> Immunity Booster
        const isCold = ['cough', 'cold', 'cetirizine', 'levocetirizine', 'montelukast', 'cough syrup', 'phenylephrine'].some(w => lowerName.includes(w) || lowerSalt.includes(w));
        if (isCold) {
          const vitC = db.prepare(`
            SELECT * FROM products 
            WHERE (name LIKE '%vitamin c%' OR name LIKE '%limcee%' OR name LIKE '%zinc%') AND stock > 0
            LIMIT 1
          `).get();
          if (vitC) {
            addSuggestion(vitC, 'cross-sell', 'Immunity Boost', `Vitamin C / Zinc supplements help boost immunity for faster recovery.`);
          }
        }

        // C. FREQUENTLY BOUGHT TOGETHER (Transactional DB association rules)
        const dbCrossSells = db.prepare(`
          SELECT p.*, COUNT(*) as occurrence
          FROM sale_items si1
          JOIN sale_items si2 ON si1.sale_id = si2.sale_id
          JOIN products p ON si2.product_id = p.id
          WHERE si1.product_id = ? AND si2.product_id != ? AND p.stock > 0
          GROUP BY si2.product_id
          ORDER BY occurrence DESC
          LIMIT 2
        `).all(item.product_id, item.product_id);

        for (const cs of dbCrossSells) {
          addSuggestion(cs, 'cross-sell', 'Frequently Bought Together', `Commonly purchased along with ${item.name}.`);
        }
      }
    }

    res.json(suggestions.slice(0, 3));
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: error.message });
  }
});
// Serve production frontend assets if they exist
const DIST_PATH = path.join(__dirname, '../dist');
if (fs.existsSync(DIST_PATH)) {
  app.use(express.static(DIST_PATH));
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(DIST_PATH, 'index.html'));
  });
}

// Global Error Handler to prevent HTML responses
app.use((err, req, res, next) => {
  console.error('Express Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── ATTENDANCE MODULE ───────────────────────────────────────────────────────

// Helper: compute status from work minutes and check-in time
function computeStatus(checkInISO, workMinutes) {
  if (!checkInISO) return 'absent';
  const checkIn = new Date(checkInISO);
  const hour = checkIn.getHours();
  const minute = checkIn.getMinutes();
  const lateThreshold = 10 * 60 + 15; // 10:15 AM in minutes
  const totalMinutes = hour * 60 + minute;
  const isLate = totalMinutes > lateThreshold;
  if (workMinutes >= 360) return isLate ? 'late' : 'present'; // >= 6h
  if (workMinutes >= 180) return 'half_day'; // >= 3h
  return 'absent';
}

// Helper: upsert attendance_record from a punch
function processPunch(staffId, punchTime) {
  const date = punchTime.split('T')[0] || punchTime.substring(0, 10);
  const existing = db.prepare('SELECT * FROM attendance_records WHERE staff_id = ? AND date = ?').get(staffId, date);
  if (!existing) {
    db.prepare(`INSERT INTO attendance_records (staff_id, date, check_in, status) VALUES (?, ?, ?, 'present')`).run(staffId, date, punchTime);
  } else if (!existing.check_out) {
    const checkInTime = new Date(existing.check_in).getTime();
    const checkOutTime = new Date(punchTime).getTime();
    const workMinutes = Math.max(0, Math.round((checkOutTime - checkInTime) / 60000));
    const status = computeStatus(existing.check_in, workMinutes);
    db.prepare('UPDATE attendance_records SET check_out = ?, work_minutes = ?, status = ? WHERE staff_id = ? AND date = ?')
      .run(punchTime, workMinutes, status, staffId, date);
  }
  // Additional punches beyond check-out are ignored (only first in + first out matter)
}

// ── Staff CRUD ───────────────────────────────────────────────────────────────
app.get('/api/attendance/staff', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const staff = db.prepare(`
      SELECT s.*,
        u.username,
        ar.check_in, ar.check_out, ar.work_minutes, ar.status AS today_status
      FROM staff s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN attendance_records ar ON ar.staff_id = s.id AND ar.date = ?
      WHERE s.is_active = 1
      ORDER BY s.name ASC
    `).all(today);
    res.json(staff);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/attendance/staff', (req, res) => {
  const { name, phone, designation, shift, biometric_id, joining_date, monthly_salary, user_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare(
      'INSERT INTO staff (name, phone, designation, shift, biometric_id, joining_date, monthly_salary, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name, phone || null, designation || null, shift || 'general', biometric_id || null, joining_date || null, monthly_salary || 0, user_id || null);
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/attendance/staff/:id', (req, res) => {
  const { name, phone, designation, shift, biometric_id, joining_date, monthly_salary, user_id, is_active } = req.body;
  const { id } = req.params;
  try {
    db.prepare(
      'UPDATE staff SET name=?, phone=?, designation=?, shift=?, biometric_id=?, joining_date=?, monthly_salary=?, user_id=?, is_active=? WHERE id=?'
    ).run(name, phone || null, designation || null, shift || 'general', biometric_id || null, joining_date || null, monthly_salary || 0, user_id || null, is_active ?? 1, id);
    res.json({ id: Number(id), ...req.body });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/attendance/staff/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('UPDATE staff SET is_active = 0 WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── Punch (manual override) ──────────────────────────────────────────────────
app.post('/api/attendance/punch', (req, res) => {
  try {
    const { staff_id, punch_time } = req.body;
    if (!staff_id) return res.status(400).json({ error: 'staff_id required' });
    const pt = punch_time || new Date().toISOString();
    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(staff_id);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    db.prepare('INSERT INTO attendance_punches (staff_id, biometric_id, punch_time, punch_type) VALUES (?, ?, ?, ?)')
      .run(staff_id, staff.biometric_id, pt, 'manual');
    processPunch(staff_id, pt);
    const date = pt.split('T')[0];
    const record = db.prepare('SELECT * FROM attendance_records WHERE staff_id = ? AND date = ?').get(staff_id, date);
    res.json({ success: true, record });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── Daily Records ────────────────────────────────────────────────────────────
app.get('/api/attendance/records', (req, res) => {
  try {
    const { date, staff_id, date_from, date_to } = req.query;
    let where = '1=1';
    const params = [];
    if (date) { where += ' AND ar.date = ?'; params.push(date); }
    if (date_from) { where += ' AND ar.date >= ?'; params.push(date_from); }
    if (date_to) { where += ' AND ar.date <= ?'; params.push(date_to); }
    if (staff_id) { where += ' AND ar.staff_id = ?'; params.push(staff_id); }
    const records = db.prepare(`
      SELECT ar.*, s.name AS staff_name, s.designation, s.shift
      FROM attendance_records ar
      JOIN staff s ON ar.staff_id = s.id
      WHERE ${where}
      ORDER BY ar.date DESC, s.name ASC
    `).all(...params);
    res.json(records);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── Monthly Summary ──────────────────────────────────────────────────────────
app.get('/api/attendance/report/monthly', (req, res) => {
  try {
    const { month, year } = req.query; // e.g. month=6 year=2026
    const y = year || new Date().getFullYear();
    const m = String(month || new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `${y}-${m}`;
    const summary = db.prepare(`
      SELECT
        s.id AS staff_id, s.name, s.designation, s.shift, s.monthly_salary,
        COUNT(CASE WHEN ar.status IN ('present','late') THEN 1 END) AS days_present,
        COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) AS days_absent,
        COUNT(CASE WHEN ar.status = 'half_day' THEN 1 END) AS days_half,
        COUNT(CASE WHEN ar.status = 'late' THEN 1 END) AS days_late,
        ROUND(SUM(ar.work_minutes) / 60.0, 1) AS total_hours,
        ROUND(AVG(CASE WHEN ar.work_minutes > 0 THEN ar.work_minutes END) / 60.0, 1) AS avg_hours,
        (SELECT COUNT(*) FROM leave_requests lr WHERE lr.staff_id = s.id AND lr.status = 'approved'
          AND lr.from_date LIKE ?) AS approved_leaves
      FROM staff s
      LEFT JOIN attendance_records ar ON ar.staff_id = s.id AND ar.date LIKE ?
      WHERE s.is_active = 1
      GROUP BY s.id
      ORDER BY s.name ASC
    `).all(`${prefix}%`, `${prefix}%`);
    res.json(summary);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── Today's Summary (for dashboard) ─────────────────────────────────────────
app.get('/api/attendance/today', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalStaff = db.prepare('SELECT COUNT(*) AS cnt FROM staff WHERE is_active = 1').get().cnt;
    const present = db.prepare(`SELECT COUNT(*) AS cnt FROM attendance_records WHERE date = ? AND status IN ('present','late')`).get(today).cnt;
    const halfDay = db.prepare(`SELECT COUNT(*) AS cnt FROM attendance_records WHERE date = ? AND status = 'half_day'`).get(today).cnt;
    const late = db.prepare(`SELECT COUNT(*) AS cnt FROM attendance_records WHERE date = ? AND status = 'late'`).get(today).cnt;
    const onLeave = db.prepare(`SELECT COUNT(*) AS cnt FROM leave_requests WHERE status = 'approved' AND from_date <= ? AND to_date >= ?`).get(today, today).cnt;
    res.json({ totalStaff, present, halfDay, late, absent: totalStaff - present - halfDay - onLeave, onLeave, date: today });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── Recent Punches ────────────────────────────────────────────────────────────
app.get('/api/attendance/punches', (req, res) => {
  try {
    const { date } = req.query;
    const d = date || new Date().toISOString().split('T')[0];
    const punches = db.prepare(`
      SELECT ap.*, s.name AS staff_name
      FROM attendance_punches ap
      JOIN staff s ON ap.staff_id = s.id
      WHERE DATE(ap.punch_time) = ?
      ORDER BY ap.punch_time DESC
      LIMIT 50
    `).all(d);
    res.json(punches);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── Notes / Status override ───────────────────────────────────────────────────
app.put('/api/attendance/records/:id', (req, res) => {
  const { notes, status } = req.body;
  const { id } = req.params;
  try {
    db.prepare('UPDATE attendance_records SET notes = ?, status = ? WHERE id = ?').run(notes, status, id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── Leave Requests ────────────────────────────────────────────────────────────
app.get('/api/attendance/leaves', (req, res) => {
  try {
    const { status, staff_id } = req.query;
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND lr.status = ?'; params.push(status); }
    if (staff_id) { where += ' AND lr.staff_id = ?'; params.push(staff_id); }
    const leaves = db.prepare(`
      SELECT lr.*, s.name AS staff_name
      FROM leave_requests lr
      JOIN staff s ON lr.staff_id = s.id
      WHERE ${where}
      ORDER BY lr.created_at DESC
    `).all(...params);
    res.json(leaves);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/attendance/leaves', (req, res) => {
  const { staff_id, from_date, to_date, reason } = req.body;
  if (!staff_id || !from_date || !to_date) return res.status(400).json({ error: 'staff_id, from_date, to_date required' });
  try {
    const result = db.prepare('INSERT INTO leave_requests (staff_id, from_date, to_date, reason) VALUES (?, ?, ?, ?)').run(staff_id, from_date, to_date, reason || null);
    res.json({ id: result.lastInsertRowid, ...req.body, status: 'pending' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/attendance/leaves/:id', (req, res) => {
  const { status, approved_by } = req.body;
  const { id } = req.params;
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    db.prepare('UPDATE leave_requests SET status = ?, approved_by = ? WHERE id = ?').run(status, approved_by || null, id);
    // If approved, mark attendance records as 'leave' for those days
    if (status === 'approved') {
      const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id);
      if (leave) {
        const start = new Date(leave.from_date);
        const end = new Date(leave.to_date);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          db.prepare(`INSERT INTO attendance_records (staff_id, date, status) VALUES (?, ?, 'leave')
            ON CONFLICT(staff_id, date) DO UPDATE SET status = 'leave'`).run(leave.staff_id, dateStr);
        }
      }
    }
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ── Device Test Connection (TCP ping) ────────────────────────────────────────
app.post('/api/attendance/device/test', (req, res) => {
  const { ip, port } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP required' });
  const net = require('net');
  const socket = new net.Socket();
  const timeout = 3000;
  let responded = false;
  socket.setTimeout(timeout);
  socket.connect(Number(port) || 4370, ip, () => {
    if (responded) return;
    responded = true;
    socket.destroy();
    res.json({ success: true, message: `Connected to ${ip}:${port}` });
  });
  socket.on('error', (err) => {
    if (responded) return;
    responded = true;
    socket.destroy();
    res.status(502).json({ error: err.message });
  });
  socket.on('timeout', () => {
    if (responded) return;
    responded = true;
    socket.destroy();
    res.status(504).json({ error: 'Connection timed out' });
  });
});

// ─── END ATTENDANCE MODULE ────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let lanIp = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIp = net.address;
        break;
      }
    }
    if (lanIp !== 'localhost') break;
  }
  console.log(`Express server running on:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${lanIp}:${PORT}`);
});

module.exports = app;


