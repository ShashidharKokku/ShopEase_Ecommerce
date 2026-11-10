import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

// Use a throwaway database so tests never touch real data.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shopease-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');

let server;
let base;

before(async () => {
  const { default: app } = await import('./server.js');
  await new Promise(resolve => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function call(route, { method = 'GET', body, token } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

test('lists, searches and filters products', async () => {
  const all = await call('/products');
  assert.equal(all.status, 200);
  assert.ok(all.data.products.length >= 53);
  assert.equal(new Set(all.data.products.map(product => product.name)).size, all.data.products.length);
  assert.equal(new Set(all.data.products.map(product => product.image_url)).size, all.data.products.length);
  const categoryCounts = all.data.products.reduce((counts, product) => {
    counts.set(product.category, (counts.get(product.category) || 0) + 1);
    return counts;
  }, new Map());
  assert.equal(categoryCounts.size, 6);
  assert.ok([...categoryCounts.values()].every(count => count >= 8));
  assert.ok(all.data.products.every(p => p.rating >= 0 && p.rating <= 5));
  assert.ok(all.data.products.every(p => p.review_count > 0));

  const search = await call('/products?search=headphones');
  assert.equal(search.data.products.length, 1);

  const category = await call('/products?category=Sports');
  assert.ok(category.data.products.every(p => p.category === 'Sports'));

  assert.equal((await call('/products/99999')).status, 404);
});

test('register, login and session', async () => {
  const unregistered = await call('/auth/login', {
    method: 'POST',
    body: { email: 'new-user@example.com', password: 'secret1' },
  });
  assert.equal(unregistered.status, 401);
  assert.match(unregistered.data.message, /not registered yet/i);

  const email = 'tester@example.com';
  const reg = await call('/auth/register', {
    method: 'POST',
    body: { name: 'Tester', email, password: 'secret1' },
  });
  assert.equal(reg.status, 201);
  assert.ok(reg.data.token);

  const dupe = await call('/auth/register', {
    method: 'POST',
    body: { name: 'Tester', email, password: 'secret1' },
  });
  assert.equal(dupe.status, 409);

  const bad = await call('/auth/login', { method: 'POST', body: { email, password: 'wrong' } });
  assert.equal(bad.status, 401);
  assert.match(bad.data.message, /incorrect email or password/i);

  const good = await call('/auth/login', { method: 'POST', body: { email, password: 'secret1' } });
  assert.equal(good.status, 200);

  const me = await call('/auth/me', { token: good.data.token });
  assert.equal(me.data.user.email, email);
  assert.equal((await call('/auth/me')).status, 401);
});

test('placing an order reduces stock and shows in history', async () => {
  const login = await call('/auth/login', {
    method: 'POST',
    body: { email: 'demo@shopease.com', password: 'demo123' },
  });
  const token = login.data.token;

  const before = (await call('/products/1')).data.product;
  const order = await call('/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId: 1, quantity: 2 }, { productId: 1, quantity: 1 }] },
  });
  assert.equal(order.status, 201);

  const after = (await call('/products/1')).data.product;
  assert.equal(after.stock, before.stock - 3);

  const mine = await call('/orders/my', { token });
  assert.equal(mine.data.orders[0].total, before.price * 3);
  assert.equal(mine.data.orders[0].items[0].quantity, 3);
});

test('rejects unauthenticated, empty, invalid and oversold orders', async () => {
  assert.equal((await call('/orders', { method: 'POST', body: { items: [] } })).status, 401);

  const { token } = (
    await call('/auth/login', {
      method: 'POST',
      body: { email: 'demo@shopease.com', password: 'demo123' },
    })
  ).data;

  const empty = await call('/orders', { method: 'POST', token, body: { items: [] } });
  assert.equal(empty.status, 400);

  const invalid = await call('/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId: 1, quantity: -2 }] },
  });
  assert.equal(invalid.status, 400);

  const stock = (await call('/products/10')).data.product.stock;
  const oversold = await call('/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId: 10, quantity: stock + 1 }] },
  });
  assert.equal(oversold.status, 409);
  assert.equal((await call('/products/10')).data.product.stock, stock);
});
