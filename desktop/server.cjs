const express = require('express');
const cors = require('cors');
const db = require('./db.js');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Auth
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const user = db.prepare('SELECT id, username, role, password FROM users WHERE username = ?').get(username);
    if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
    const { password: _, ...userData } = user;
    res.json({ user: userData });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Products
app.get('/api/products', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', (req, res) => {
  const { name, description, price, stock, sku } = req.body;
  try {
    const result = db.prepare('INSERT INTO products (name, description, price, stock, sku) VALUES (?, ?, ?, ?, ?)').run(name, description, price, stock, sku);
    res.json({ id: result.lastInsertRowid, name, description, price, stock, sku });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  const { name, description, price, stock, sku } = req.body;
  const { id } = req.params;
  try {
    db.prepare('UPDATE products SET name = ?, description = ?, price = ?, stock = ?, sku = ? WHERE id = ?').run(name, description, price, stock, sku, id);
    res.json({ id: Number(id), name, description, price, stock, sku });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sales
app.post('/api/sales', (req, res) => {
  const { total_amount, user_id, items } = req.body;
  if (!user_id || !items || items.length === 0) return res.status(400).json({ error: 'Invalid sale data' });

  try {
    const insertSale = db.prepare('INSERT INTO sales (total_amount, user_id) VALUES (?, ?)');
    const insertSaleItem = db.prepare('INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    const transaction = db.transaction(() => {
      const saleResult = insertSale.run(total_amount, user_id);
      const saleId = saleResult.lastInsertRowid;
      for (const item of items) {
        insertSaleItem.run(saleId, item.product_id, item.quantity, item.price);
        updateStock.run(item.quantity, item.product_id);
      }
      return saleId;
    });

    const saleId = transaction();
    res.json({ success: true, saleId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sales', (req, res) => {
  try {
    const sales = db.prepare('SELECT sales.*, users.username FROM sales JOIN users ON sales.user_id = users.id ORDER BY sales.created_at DESC').all();
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sales/:id', (req, res) => {
  const { id } = req.params;
  try {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    const items = db.prepare('SELECT sale_items.*, products.name FROM sale_items JOIN products ON sale_items.product_id = products.id WHERE sale_id = ?').all(id);
    res.json({ ...sale, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Pharmacy Express Backend running in Electron!' });
});

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});

module.exports = app;
