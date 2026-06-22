const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Resolve DB path: use writable userData dir in production (packaged .asar),
// fall back to repo root in development.
function getDbPath() {
  if (process.env.USER_DATA_PATH) {
    const userDataPath = process.env.USER_DATA_PATH;
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    return path.join(userDataPath, 'pharmacy.db');
  }
  try {
    // electron is available in the main process
    const { app } = require('electron');
    if (app && app.isPackaged) {
      const userDataPath = app.getPath('userData');
      if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
      return path.join(userDataPath, 'pharmacy.db');
    }
  } catch {
    // not running inside electron (e.g. plain node server.js in dev)
  }
  return path.join(__dirname, '../pharmacy.db');
}

const dbPath = getDbPath();
console.log('[DB] Using database at:', dbPath);

const db = new Database(dbPath, { verbose: console.log });
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff'
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    gender TEXT,
    reference_name TEXT,
    credit_balance REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand_name TEXT,
    salt_composition TEXT,
    description TEXT,
    price REAL NOT NULL,
    purchase_price REAL DEFAULT 0,
    stock INTEGER NOT NULL,
    pack_size INTEGER DEFAULT 1,
    sku TEXT UNIQUE NOT NULL,
    batch TEXT,
    expiry TEXT,
    mrp REAL,
    gst INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    prescriber_name TEXT,
    subtotal REAL NOT NULL DEFAULT 0,
    gst_total REAL NOT NULL DEFAULT 0,
    discount_total REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'paid',
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    mrp REAL,
    gst INTEGER,
    discount REAL DEFAULT 0,
    FOREIGN KEY(sale_id) REFERENCES sales(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    gstin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER,
    invoice_no TEXT,
    purchase_date TEXT,
    total_amount REAL NOT NULL DEFAULT 0,
    gst_total REAL NOT NULL DEFAULT 0,
    net_amount REAL NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'paid',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch TEXT,
    expiry TEXT,
    quantity INTEGER NOT NULL,
    purchase_price REAL NOT NULL,
    mrp REAL,
    gst INTEGER,
    FOREIGN KEY(purchase_id) REFERENCES purchases(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  -- Settings (key-value store)
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Login activity log
  CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'login',
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ── Attendance Module ──────────────────────────────────────────────────────

  -- Staff profiles (extends users; can also exist without a login account)
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    designation TEXT,
    shift TEXT DEFAULT 'general',
    biometric_id INTEGER UNIQUE,
    joining_date TEXT,
    monthly_salary REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Raw punch log received from biometric device or manual entry
  CREATE TABLE IF NOT EXISTS attendance_punches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    biometric_id INTEGER,
    punch_time DATETIME NOT NULL,
    punch_type TEXT DEFAULT 'auto',
    device_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(staff_id) REFERENCES staff(id)
  );

  -- Processed daily attendance (computed from punches)
  CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    check_in DATETIME,
    check_out DATETIME,
    work_minutes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'absent',
    overtime_minutes INTEGER DEFAULT 0,
    notes TEXT,
    UNIQUE(staff_id, date),
    FOREIGN KEY(staff_id) REFERENCES staff(id)
  );

  -- Leave requests
  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    approved_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(staff_id) REFERENCES staff(id)
  );

  -- Performance Indexes
  CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
  CREATE INDEX IF NOT EXISTS idx_products_expiry ON products(expiry);
  CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
  CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(DATE(created_at));
  CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
  CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
  CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(date);
  CREATE INDEX IF NOT EXISTS idx_attendance_records_staff ON attendance_records(staff_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_punches_staff ON attendance_punches(staff_id);
  CREATE INDEX IF NOT EXISTS idx_leave_requests_staff ON leave_requests(staff_id);
`);

// Migrate existing DB schemas gracefully
try { db.exec('ALTER TABLE sales ADD COLUMN is_returned INTEGER DEFAULT 0'); } catch { /* ignore */ }
try { db.exec('ALTER TABLE sales ADD COLUMN refunded_amount REAL DEFAULT 0'); } catch { /* ignore */ }
try { db.exec('ALTER TABLE sale_items ADD COLUMN purchase_price REAL DEFAULT 0'); } catch { /* ignore */ }
try { db.exec('ALTER TABLE sale_items ADD COLUMN returned_quantity INTEGER DEFAULT 0'); } catch { /* ignore */ }
try { db.exec('ALTER TABLE products ADD COLUMN pack_size INTEGER DEFAULT 1'); } catch { /* ignore */ }
try { db.exec('ALTER TABLE products ADD COLUMN category TEXT'); } catch { /* ignore */ }
try { db.exec('ALTER TABLE products ADD COLUMN item_type TEXT DEFAULT "PHARMA"'); } catch { /* ignore */ }
try { db.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL"); } catch { /* ignore */ }
try { db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1'); } catch { /* ignore */ }
try { db.exec("ALTER TABLE sales ADD COLUMN payment_details TEXT DEFAULT NULL"); } catch { /* ignore */ }

// Seed default settings if not present
const defaultSettings = [
  ['pharmacy_name', 'My Pharmacy'],
  ['pharmacy_address', ''],
  ['drug_license_no', ''],
  ['gst_no', ''],
  ['pharmacy_phone', ''],
  ['pharmacy_email', ''],
  ['pharmacy_logo', ''],
  ['gst_enabled', '1'],
  ['gst_reg_type', 'regular'],
  ['gst_type', 'cgst_sgst'],
  ['default_hsn', '30049099'],
  ['bill_paper_size', 'a4'],
  ['bill_show_batch', '1'],
  ['bill_show_expiry', '1'],
  ['bill_show_gst', '1'],
  ['bill_show_mrp', '1'],
  ['bill_auto_print', '0'],
  ['bill_header', ''],
  ['bill_footer', 'Thank you for your purchase!'],
  ['bill_disclaimer', 'No return on loose medicines.'],
  ['bill_prefix', 'PH'],
  ['barcode_mode', 'auto'],
  ['session_timeout', '60'],
];
const upsertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of defaultSettings) {
  upsertSetting.run(key, value);
}

// Seed initial admin user if not exists
const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
if (!admin) {
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', 'admin123', 'admin');
}

module.exports = db;
