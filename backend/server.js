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

// --------------------------------------------------------------- addresses
const savedAddressColumns = `
  recipient_name, phone, address_line1, address_line2, city, state, postal_code, country
`;
const getSavedAddress = db.prepare(
  'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?'
);
const listSavedAddresses = db.prepare(
  'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, id'
);
const countSavedAddresses = db.prepare(
  'SELECT COUNT(*) AS count FROM user_addresses WHERE user_id = ?'
);
const clearDefaultAddress = db.prepare(
  'UPDATE user_addresses SET is_default = 0 WHERE user_id = ? AND is_default = 1'
);
const saveAddressRow = db.prepare(`
  INSERT INTO user_addresses (user_id, ${savedAddressColumns}, is_default)
  VALUES (@userId, @recipient_name, @phone, @address_line1, @address_line2,
          @city, @state, @postal_code, @country, @is_default)
`);
const addressFromRow = row => ({
  id: row.id,
  recipientName: row.recipient_name,
  phone: row.phone,
  addressLine1: row.address_line1,
  addressLine2: row.address_line2,
  city: row.city,
  state: row.state,
  postalCode: row.postal_code,
  country: row.country,
  isDefault: Boolean(row.is_default),
});
const serializeAddress = row => addressFromRow(row);

function validateAddress(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Please enter a delivery address.' };
  }
  const fields = [
    ['recipientName', 'Recipient name', 2, 100],
    ['phone', 'Phone number', 7, 20],
    ['addressLine1', 'Street address', 5, 200],
    ['city', 'City', 2, 100],
    ['state', 'State or province', 2, 100],
    ['postalCode', 'Postal code', 3, 12],
    ['country', 'Country', 2, 80],
  ];
  const address = {};
  for (const [field, label, minLength, maxLength] of fields) {
    const value = typeof input[field] === 'string' ? input[field].trim() : '';
    if (value.length < minLength || value.length > maxLength) {
      return { error: `Please enter a valid ${label.toLowerCase()}.` };
    }
    address[field] = value;
  }
  address.addressLine2 =
    typeof input.addressLine2 === 'string' ? input.addressLine2.trim() : '';
  if (address.addressLine2.length > 200) {
    return { error: 'Address line 2 must be 200 characters or fewer.' };
  }
  if (!/^[+0-9][0-9\s()-]{6,19}$/.test(address.phone)) {
    return { error: 'Please enter a valid phone number.' };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,10}[A-Za-z0-9]$/.test(address.postalCode)) {
    return { error: 'Please enter a valid postal code.' };
  }
  return { address };
}

const createSavedAddress = db.transaction((userId, address, makeDefault) => {
  const shouldBeDefault = makeDefault || countSavedAddresses.get(userId).count === 0;
  if (shouldBeDefault) clearDefaultAddress.run(userId);
  const result = saveAddressRow.run({
    userId,
    recipient_name: address.recipientName,
    phone: address.phone,
    address_line1: address.addressLine1,
    address_line2: address.addressLine2,
    city: address.city,
    state: address.state,
    postal_code: address.postalCode,
    country: address.country,
    is_default: shouldBeDefault ? 1 : 0,
  });
  return getSavedAddress.get(Number(result.lastInsertRowid), userId);
});

app.get('/api/addresses', requireAuth, (req, res) => {
  res.json({ addresses: listSavedAddresses.all(req.user.id).map(serializeAddress) });
});

app.post('/api/addresses', requireAuth, (req, res) => {
  const result = validateAddress(req.body?.address);
  if (result.error) return fail(res, 400, result.error);
  const address = createSavedAddress(req.user.id, result.address, req.body?.isDefault === true);
  res.status(201).json({ address: serializeAddress(address) });
});

app.put('/api/addresses/:id', requireAuth, (req, res) => {
  const addressId = Number(req.params.id);
  if (!Number.isInteger(addressId) || addressId < 1) return fail(res, 400, 'Invalid address.');
  const current = getSavedAddress.get(addressId, req.user.id);
  if (!current) return fail(res, 404, 'Address not found.');
  const result = validateAddress(req.body?.address);
  if (result.error) return fail(res, 400, result.error);

  const update = db.transaction(() => {
    if (req.body?.isDefault === true) clearDefaultAddress.run(req.user.id);
    db.prepare(`
      UPDATE user_addresses
      SET recipient_name = @recipient_name, phone = @phone,
          address_line1 = @address_line1, address_line2 = @address_line2,
          city = @city, state = @state, postal_code = @postal_code, country = @country
      WHERE id = @id AND user_id = @user_id
    `).run({
      id: addressId,
      user_id: req.user.id,
      recipient_name: result.address.recipientName,
      phone: result.address.phone,
      address_line1: result.address.addressLine1,
      address_line2: result.address.addressLine2,
      city: result.address.city,
      state: result.address.state,
      postal_code: result.address.postalCode,
      country: result.address.country,
    });
    if (req.body?.isDefault === true) {
      db.prepare('UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ?')
        .run(addressId, req.user.id);
    }
    return getSavedAddress.get(addressId, req.user.id);
  });
  res.json({ address: serializeAddress(update()) });
});

app.patch('/api/addresses/:id/default', requireAuth, (req, res) => {
  const addressId = Number(req.params.id);
  if (!Number.isInteger(addressId) || addressId < 1) return fail(res, 400, 'Invalid address.');
  const setDefault = db.transaction(() => {
    const address = getSavedAddress.get(addressId, req.user.id);
    if (!address) return null;
    clearDefaultAddress.run(req.user.id);
    db.prepare('UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ?')
      .run(addressId, req.user.id);
    return getSavedAddress.get(addressId, req.user.id);
  });
  const address = setDefault();
  if (!address) return fail(res, 404, 'Address not found.');
  res.json({ address: serializeAddress(address) });
});

app.delete('/api/addresses/:id', requireAuth, (req, res) => {
  const addressId = Number(req.params.id);
  if (!Number.isInteger(addressId) || addressId < 1) return fail(res, 400, 'Invalid address.');
  const removeAddress = db.transaction(() => {
    const address = getSavedAddress.get(addressId, req.user.id);
    if (!address) return false;
    db.prepare('DELETE FROM user_addresses WHERE id = ? AND user_id = ?')
      .run(addressId, req.user.id);
    if (address.is_default) {
      const replacement = db.prepare(
        'SELECT id FROM user_addresses WHERE user_id = ? ORDER BY id LIMIT 1'
      ).get(req.user.id);
      if (replacement) {
        db.prepare('UPDATE user_addresses SET is_default = 1 WHERE id = ?')
          .run(replacement.id);
      }
    }
    return true;
  });
  if (!removeAddress()) return fail(res, 404, 'Address not found.');
  res.json({ ok: true });
});

// -------------------------------------------------------------------- orders
const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
const reduceStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
const insertOrder = db.prepare(`
  INSERT INTO orders (
    user_id, total, recipient_name, phone, address_line1, address_line2, city, state, postal_code, country, payment_method
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertItem = db.prepare(
  'INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)'
);
const getOrderAddress = db.prepare(
  'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?'
);

class OrderError extends Error {}

const createOrder = db.transaction((userId, items, addressId, submittedAddress, paymentMethod) => {
  let address;
  if (addressId) {
    const savedAddress = getOrderAddress.get(addressId, userId);
    if (!savedAddress) throw new OrderError('That saved address is no longer available.');
    address = addressFromRow(savedAddress);
  } else {
    address = submittedAddress;
  }

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

  if (!addressId && countSavedAddresses.get(userId).count === 0) {
    createSavedAddress(userId, address, true);
  }

  const orderId = Number(
    insertOrder.run(
      userId,
      total,
      address.recipientName,
      address.phone,
      address.addressLine1,
      address.addressLine2,
      address.city,
      address.state,
      address.postalCode,
      address.country,
      paymentMethod
    ).lastInsertRowid
  );
  for (const { product, quantity } of lines) {
    insertItem.run(orderId, product.id, product.name, product.price, quantity);
  }
  return orderId;
});

app.post('/api/orders', requireAuth, (req, res) => {
  const raw = Array.isArray(req.body?.items) ? req.body.items : [];
  const paymentMethods = ['UPI', 'Card', 'Net Banking', 'Cash on Delivery'];
  const paymentMethod = req.body?.paymentMethod;
  if (!paymentMethods.includes(paymentMethod)) {
    return fail(res, 400, 'Please select a valid payment method.');
  }

  let addressId = 0;
  let address;
  if (req.body?.addressId !== undefined) {
    addressId = Number(req.body.addressId);
    if (!Number.isInteger(addressId) || addressId < 1) return fail(res, 400, 'Invalid address.');
  } else {
    const result = validateAddress(req.body?.address);
    if (result.error) return fail(res, 400, result.error);
    address = result.address;
  }

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
      [...merged].map(([productId, quantity]) => ({ productId, quantity })),
      addressId,
      address,
      paymentMethod
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
