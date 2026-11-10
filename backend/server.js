import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import db, { dataDir } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const distDir = path.join(__dirname, '..', 'frontend', 'dist');

// ---------------------------------------------------------------- JWT secret
// Use JWT_SECRET if provided, otherwise generate one once and keep it on disk
// so logins survive server restarts.
function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(dataDir, '.jwt_secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}
const JWT_SECRET = loadJwtSecret();

// ------------------------------------------------------------------ demo user
const DEMO_EMAIL = 'demo@shopease.com';
if (!db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_EMAIL)) {
  db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(
    'Demo User',
    DEMO_EMAIL,
    bcrypt.hashSync('demo123', 10)
  );
}

// ------------------------------------------------------------------- helpers
const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const publicUser = user => ({ id: user.id, name: user.name, email: user.email });
const signToken = user => jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
const fail = (res, status, message) => res.status(status).json({ message });

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 401, 'Please sign in to continue.');

  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id);
    if (!user) return fail(res, 401, 'Your session is no longer valid. Please sign in again.');
    req.user = user;
    next();
  } catch {
    fail(res, 401, 'Your session has expired. Please sign in again.');
  }
}

// Tiny in-memory rate limiter for login/register (per IP).
const attempts = new Map();
function authLimiter(req, res, next) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = attempts.get(req.ip);
  const recent = (entry || []).filter(time => now - time < windowMs);
  if (recent.length >= 30) {
    return fail(res, 429, 'Too many attempts. Please try again in a few minutes.');
  }
  recent.push(now);
  attempts.set(req.ip, recent);
  next();
}

// ---------------------------------------------------------------------- auth
app.post('/api/auth/register', authLimiter, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (name.length < 2) return fail(res, 400, 'Please enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Please enter a valid email address.');
  if (password.length < 6) return fail(res, 400, 'Password must be at least 6 characters.');

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return fail(res, 409, 'An account with this email already exists.');
  }

  const result = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name, email, bcrypt.hashSync(password, 10));
  const user = { id: Number(result.lastInsertRowid), name, email };
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    return fail(res, 401, 'You are not registered yet. Please register, then sign in.');
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return fail(res, 401, 'Incorrect email or password.');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ------------------------------------------------------------------ products
app.get('/api/categories', (_req, res) => {
  const rows = db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all();
  res.json({ categories: rows.map(row => row.category) });
});

app.get('/api/products', (req, res) => {
  const search = String(req.query.search || '').trim();
  const category = String(req.query.category || '').trim();

  const where = [];
  const params = [];
  if (search) {
    const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    where.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }
  if (category) {
    where.push('category = ?');
    params.push(category);
  }

  const sql = `SELECT * FROM products ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`;
  res.json({ products: db.prepare(sql).all(...params) });
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
  if (!product) return fail(res, 404, 'Product not found.');
  res.json({ product });
});

// -------------------------------------------------------------------- orders
const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
const reduceStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
const insertOrder = db.prepare('INSERT INTO orders (user_id, total) VALUES (?, ?)');
const insertItem = db.prepare(
  'INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)'
);

class OrderError extends Error {}

const createOrder = db.transaction((userId, items) => {
  let total = 0;
  const lines = [];

  for (const { productId, quantity } of items) {
    const product = getProduct.get(productId);
    if (!product) throw new OrderError('One of the products in your cart no longer exists.');
    if (product.stock < quantity) {
      throw new OrderError(
        product.stock === 0
          ? `${product.name} is out of stock.`
          : `Only ${product.stock} of ${product.name} available.`
      );
    }
    if (reduceStock.run(quantity, productId, quantity).changes !== 1) {
      throw new OrderError(`${product.name} just went out of stock.`);
    }
    total += product.price * quantity;
    lines.push({ product, quantity });
  }

  const orderId = Number(insertOrder.run(userId, total).lastInsertRowid);
  for (const { product, quantity } of lines) {
    insertItem.run(orderId, product.id, product.name, product.price, quantity);
  }
  return orderId;
});

app.post('/api/orders', requireAuth, (req, res) => {
  const raw = Array.isArray(req.body?.items) ? req.body.items : [];

  // Merge duplicate lines and validate every entry.
  const merged = new Map();
  for (const entry of raw) {
    const productId = Number(entry?.productId);
    const quantity = Number(entry?.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return fail(res, 400, 'Your cart contains an invalid item.');
    }
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  if (merged.size === 0) return fail(res, 400, 'Your cart is empty.');

  try {
    const orderId = createOrder(
      req.user.id,
      [...merged].map(([productId, quantity]) => ({ productId, quantity }))
    );
    res.status(201).json({ order: { id: orderId } });
  } catch (error) {
    if (error instanceof OrderError) return fail(res, 409, error.message);
    console.error(error);
    fail(res, 500, 'Could not place your order. Please try again.');
  }
});

app.get('/api/orders/my', requireAuth, (req, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id);
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
  res.json({ orders: orders.map(order => ({ ...order, items: itemsStmt.all(order.id) })) });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', (_req, res) => fail(res, 404, 'Not found.'));

// ------------------------------------------------- serve the built frontend
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res
      .status(200)
      .type('text/plain')
      .send('ShopEase API is running. Build the frontend with "npm run build", or use "npm run dev".')
  );
}

app.use((error, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') return fail(res, 400, 'Invalid JSON.');
  console.error(error);
  fail(res, 500, 'Something went wrong on the server.');
});

export default app;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`\n  ShopEase is running at  http://localhost:${PORT}`);
    console.log('  Demo login:            demo@shopease.com / demo123\n');
  });
}
