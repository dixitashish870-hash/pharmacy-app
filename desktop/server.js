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
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      return path.join(app.getPath('userData'), 'uploads', 'bills');
    }
  } catch (_e) {
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
};
runMigrations();

// ─── Cached prepared statements (compiled once, reused forever) ───

const stmts = {
  // Auth
  getUser: db.prepare('SELECT id, username, role, password FROM users WHERE username = ?'),

  // Products
  getAllProducts:   db.prepare('SELECT * FROM products ORDER BY id DESC'),
  insertProduct:   db.prepare('INSERT INTO products (name, brand_name, salt_composition, description, price, stock, sku, batch, expiry, mrp, gst, pack_size, item_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  updateProduct:   db.prepare('UPDATE products SET name = ?, brand_name = ?, salt_composition = ?, description = ?, price = ?, stock = ?, sku = ?, batch = ?, expiry = ?, mrp = ?, gst = ?, pack_size = ?, item_type = ? WHERE id = ?'),
  deleteProduct:   db.prepare('DELETE FROM products WHERE id = ?'),
  expiringProducts: db.prepare("SELECT * FROM products WHERE expiry IS NOT NULL AND expiry != '' AND expiry >= ? AND expiry <= ? ORDER BY expiry ASC"),
  expiredProducts:  db.prepare("SELECT * FROM products WHERE expiry IS NOT NULL AND expiry != '' AND expiry < ? ORDER BY expiry ASC"),

  // Customers
  getAllCustomers: db.prepare('SELECT * FROM customers ORDER BY name ASC'),
  insertCustomer: db.prepare('INSERT INTO customers (name, phone, gender, reference_name) VALUES (?, ?, ?, ?)'),
  updateCustomer: db.prepare('UPDATE customers SET name = ?, phone = ?, gender = ?, reference_name = ? WHERE id = ?'),
  deleteCustomer: db.prepare('DELETE FROM customers WHERE id = ?'),
  getCustomer:    db.prepare('SELECT * FROM customers WHERE id = ?'),

  // Stats (combined into one query where possible)
  countProducts:  db.prepare('SELECT COUNT(*) AS count FROM products'),
  countLowStock:  db.prepare('SELECT COUNT(*) AS count FROM products WHERE stock <= 10'),
  countCustomers: db.prepare('SELECT COUNT(*) AS count FROM customers'),
  todaySales:     db.prepare(`
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
  settleCredit:  db.prepare('UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ?'),
  addCredit:     db.prepare('UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?'),

  // Sales
  insertSale:     db.prepare('INSERT INTO sales (customer_id, prescriber_name, subtotal, gst_total, discount_total, total_amount, payment_status, user_id, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  insertSaleItem: db.prepare('INSERT INTO sale_items (sale_id, product_id, quantity, price, mrp, gst, discount, purchase_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  updateStock:    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?'),
  restockProduct: db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?'),
  markSaleReturned: db.prepare('UPDATE sales SET is_returned = 1 WHERE id = ?'),
  updateRefundedAmount: db.prepare('UPDATE sales SET refunded_amount = refunded_amount + ? WHERE id = ?'),
  updateReturnedQuantity: db.prepare('UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE id = ?'),
  removeCredit:   db.prepare('UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ?'),
  getAllSales:     db.prepare('SELECT sales.*, users.username FROM sales JOIN users ON sales.user_id = users.id ORDER BY sales.created_at DESC'),
  getSale:        db.prepare('SELECT sales.*, customers.name AS customer_name FROM sales LEFT JOIN customers ON sales.customer_id = customers.id WHERE sales.id = ?'),
  getSaleItems:   db.prepare('SELECT sale_items.*, products.name, products.batch, products.expiry FROM sale_items JOIN products ON sale_items.product_id = products.id WHERE sale_id = ?'),
  // Suppliers
  getAllSuppliers: db.prepare('SELECT * FROM suppliers ORDER BY name ASC'),
  insertSupplier: db.prepare('INSERT INTO suppliers (name, phone, email, address, gstin) VALUES (?, ?, ?, ?, ?)'),
  updateSupplier: db.prepare('UPDATE suppliers SET name = ?, phone = ?, email = ?, address = ?, gstin = ? WHERE id = ?'),
  deleteSupplier: db.prepare('DELETE FROM suppliers WHERE id = ?'),
  getSupplier:    db.prepare('SELECT * FROM suppliers WHERE id = ?'),

  // Purchases
  insertPurchase:     db.prepare('INSERT INTO purchases (supplier_id, invoice_no, purchase_date, total_amount, gst_total, net_amount, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  insertPurchaseItem: db.prepare('INSERT INTO purchase_items (purchase_id, product_id, batch, expiry, quantity, purchase_price, mrp, gst) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  addStock:           db.prepare('UPDATE products SET stock = stock + ?, batch = ?, expiry = ?, mrp = ?, purchase_price = ?, price = ? WHERE id = ?'),
  reduceStock:        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?'),
  getAllPurchases:    db.prepare('SELECT purchases.*, suppliers.name AS supplier_name FROM purchases LEFT JOIN suppliers ON purchases.supplier_id = suppliers.id ORDER BY purchases.created_at DESC'),
  getPurchase:        db.prepare('SELECT purchases.*, suppliers.name AS supplier_name FROM purchases LEFT JOIN suppliers ON purchases.supplier_id = suppliers.id WHERE purchases.id = ?'),
  getPurchaseItems:   db.prepare('SELECT purchase_items.*, products.name FROM purchase_items JOIN products ON purchase_items.product_id = products.id WHERE purchase_id = ?'),
  updatePurchase:     db.prepare('UPDATE purchases SET supplier_id = ?, invoice_no = ?, purchase_date = ?, total_amount = ?, gst_total = ?, net_amount = ?, payment_status = ? WHERE id = ?'),
  deletePurchaseItems: db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?'),
};

// ─── Helper: build stats object ───
function buildStats(todayStr) {
  const todaySalesResult = stmts.todaySales.get(todayStr);
  return {
    totalProducts:  stmts.countProducts.get().count,
    lowStock:       stmts.countLowStock.get().count,
    totalCustomers: stmts.countCustomers.get().count,
    todaySales:     todaySalesResult.count,
    todayRevenue:   todaySalesResult.total,
    todayProfit:    todaySalesResult.profit,
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
  } catch (_error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POS Init (combined single-request bootstrap for Billing page) ───
app.get('/api/pos-init', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Read all settings as a flat key-value object
    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    const settings = settingsRows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
    res.json({
      products:  stmts.getAllProducts.all(),
      customers: stmts.getAllCustomers.all(),
      stats:     buildStats(today),
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
      expired:  stmts.expiredProducts.all(todayStr),
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
      let qtyMatch = (item.measurementUnit || '').match(/(\d+)\s*(?:Tablet|Capsule|Sachet|Vial)/i);
      if (!qtyMatch) qtyMatch = (item.name || '').match(/(?:Of|Pack of)\s*(\d+)/i);
      
      if (qtyMatch) {
        pack = `1x${qtyMatch[1]}`;
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

// ─── Stats ───
app.get('/api/stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    res.json(buildStats(today));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── Sales ───
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
            if (split.hasOwnProperty(d.method)) split[d.method] += d.amount || 0;
          }
          continue; // skip fallback
        } catch { /* fall through to legacy */ }
      }
      // Legacy: single payment_status
      const mode = row.payment_status === 'paid' ? 'cash' : (row.payment_status || 'cash');
      if (split.hasOwnProperty(mode)) split[mode] += row.total_amount || 0;
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
            'gst', si.gst
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
  try { res.json(stmts.getAllPurchases.all()); }
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

// ─── Purchases ───
app.get('/api/purchases', (req, res) => {
  try { res.json(stmts.getAllPurchases.all()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/purchases/:id', (req, res) => {
  try {
    const purchase = stmts.getPurchase.get(req.params.id);
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    const items = stmts.getPurchaseItems.all(req.params.id);
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
        stmts.addStock.run(item.quantity * packSize, item.batch, item.expiry, item.mrp || 0, item.purchase_price, newSellingPrice, item.product_id);
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
        stmts.addStock.run(item.quantity * packSize, item.batch, item.expiry, item.mrp || 0, item.purchase_price, newSellingPrice, item.product_id);
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

// ─── Users (management) ──────────────────────────────────────────────────────
// ─── Login Log (must be BEFORE :id routes) ──────────────────────────────────
app.get('/api/users/login-log', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const logs = db.prepare('SELECT * FROM login_logs ORDER BY created_at DESC LIMIT ?').all(limit);
    res.json(logs);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, role, permissions, is_active FROM users ORDER BY id ASC').all();
    res.json(users);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/users', (req, res) => {
  const { username, password, role, permissions } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const hashed = hashPassword(password);
    const defaultPerms = JSON.stringify({ can_give_discount: true, can_edit_bill: false, can_delete_bill: false, can_access_reports: false });
    const result = db.prepare('INSERT INTO users (username, password, role, permissions, is_active) VALUES (?, ?, ?, ?, 1)').run(
      username.trim(), hashed, role || 'staff', permissions || defaultPerms
    );
    res.json({ id: result.lastInsertRowid, username: username.trim(), role: role || 'staff' });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { username, role, permissions, is_active } = req.body;
  try {
    db.prepare('UPDATE users SET username = ?, role = ?, permissions = ?, is_active = ? WHERE id = ?').run(
      username, role, permissions ? JSON.stringify(permissions) : null, is_active != null ? is_active : 1, id
    );
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
    const hashed = hashPassword(password);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { requesterId } = req.body;
  if (String(id) === String(requesterId)) return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    // Soft delete — preserve audit trail
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// (login-log route moved above :id routes)

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
    const subtotal = resolvedItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const gstTotal = resolvedItems.reduce((s, i) => s + (i.price * i.quantity * (i.gst || 0) / 100), 0);
    const totalAmount = subtotal + gstTotal;

    const transaction = db.transaction(() => {
      const saleResult = stmts.insertSale.run(
        draft.customer_id || null,
        draft.prescriber_name || null,
        subtotal, gstTotal, 0,
        totalAmount,
        draft.payment_mode === 'credit' ? 'credit' : 'paid',
        user_id
      );
      const saleId = saleResult.lastInsertRowid;

      for (const item of resolvedItems) {
        const pPrice = item.product.purchase_price || 0;
        stmts.insertSaleItem.run(saleId, item.product_id, item.quantity, item.price, item.mrp || item.price, item.gst || 0, 0, pPrice);
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



// Global Error Handler to prevent HTML responses
app.use((err, req, res, next) => {
  console.error('Express Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

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
