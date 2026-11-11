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
  const address = {
    recipientName: 'Demo User',
    phone: '+91 9876543210',
    addressLine1: '12 Market Street',
    addressLine2: 'Apartment 4',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
  };
  const order = await call('/orders', {
    method: 'POST',
    token,
    body: {
      items: [{ productId: 1, quantity: 2 }, { productId: 1, quantity: 1 }],
      address,
      paymentMethod: 'UPI',
    },
  });
  assert.equal(order.status, 201);

  const after = (await call('/products/1')).data.product;
  assert.equal(after.stock, before.stock - 3);

  const mine = await call('/orders/my', { token });
  assert.equal(mine.data.orders[0].total, before.price * 3);
  assert.equal(mine.data.orders[0].items[0].quantity, 3);
  assert.equal(mine.data.orders[0].recipient_name, address.recipientName);
  assert.equal(mine.data.orders[0].address_line1, address.addressLine1);
  assert.equal(mine.data.orders[0].address_line2, address.addressLine2);
  assert.equal(mine.data.orders[0].postal_code, address.postalCode);
  assert.equal(mine.data.orders[0].payment_method, 'UPI');

  const saved = await call('/addresses', { token });
  assert.equal(saved.data.addresses.length, 1);
  assert.equal(saved.data.addresses[0].addressLine1, address.addressLine1);
  assert.equal(saved.data.addresses[0].isDefault, true);
});

test('manages saved addresses per account and keeps one default', async () => {
  const demo = await call('/auth/login', {
    method: 'POST',
    body: { email: 'demo@shopease.com', password: 'demo123' },
  });
  const demoToken = demo.data.token;
  const other = await call('/auth/login', {
    method: 'POST',
    body: { email: 'tester@example.com', password: 'secret1' },
  });
  const otherToken = other.data.token;
  const baseAddress = {
    recipientName: 'Tester',
    phone: '+91 9876543210',
    addressLine1: '12 Market Street',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
  };

  assert.equal((await call('/addresses')).status, 401);
  assert.deepEqual((await call('/addresses', { token: otherToken })).data.addresses, []);

  const first = await call('/addresses', {
    method: 'POST',
    token: otherToken,
    body: { address: baseAddress, isDefault: false },
  });
  assert.equal(first.status, 201);
  assert.equal(first.data.address.isDefault, true);

  const second = await call('/addresses', {
    method: 'POST',
    token: otherToken,
    body: { address: { ...baseAddress, addressLine1: '48 River Road' } },
  });
  assert.equal(second.status, 201);
  assert.equal(second.data.address.isDefault, false);

  const foreignUpdate = await call(`/addresses/${first.data.address.id}`, {
    method: 'PUT',
    token: demoToken,
    body: { address: baseAddress },
  });
  assert.equal(foreignUpdate.status, 404);

  const selectedDefault = await call(`/addresses/${second.data.address.id}/default`, {
    method: 'PATCH',
    token: otherToken,
  });
  assert.equal(selectedDefault.data.address.isDefault, true);

  const edited = await call(`/addresses/${second.data.address.id}`, {
    method: 'PUT',
    token: otherToken,
    body: { address: { ...baseAddress, addressLine1: '50 River Road' } },
  });
  assert.equal(edited.data.address.addressLine1, '50 River Road');
  assert.equal(edited.data.address.isDefault, true);

  assert.equal((await call(`/addresses/${second.data.address.id}`, {
    method: 'DELETE',
    token: otherToken,
  })).status, 200);
  const remaining = await call('/addresses', { token: otherToken });
  assert.equal(remaining.data.addresses.length, 1);
  assert.equal(remaining.data.addresses[0].isDefault, true);

  assert.equal((await call(`/addresses/${first.data.address.id}`, {
    method: 'DELETE',
    token: otherToken,
  })).status, 200);
  assert.deepEqual((await call('/addresses', { token: otherToken })).data.addresses, []);
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

  const address = {
    recipientName: 'Demo User',
    phone: '+91 9876543210',
    addressLine1: '12 Market Street',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
  };
  const missingAddress = await call('/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId: 1, quantity: 1 }], paymentMethod: 'UPI' },
  });
  assert.equal(missingAddress.status, 400);

  const missingPayment = await call('/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId: 1, quantity: 1 }], address },
  });
  assert.equal(missingPayment.status, 400);

  const invalidPayment = await call('/orders', {
    method: 'POST',
    token,
    body: {
      items: [{ productId: 1, quantity: 1 }],
      address,
      paymentMethod: 'Cryptocurrency',
    },
  });
  assert.equal(invalidPayment.status, 400);

  const invalidAddress = await call('/orders', {
    method: 'POST',
    token,
    body: {
      items: [{ productId: 1, quantity: 1 }],
      address: { ...address, postalCode: '!' },
      paymentMethod: 'Card',
    },
  });
  assert.equal(invalidAddress.status, 400);

  const invalid = await call('/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId: 1, quantity: -2 }], address, paymentMethod: 'Card' },
  });
  assert.equal(invalid.status, 400);

  const stock = (await call('/products/10')).data.product.stock;
  const oversold = await call('/orders', {
    method: 'POST',
    token,
    body: { items: [{ productId: 10, quantity: stock + 1 }], address, paymentMethod: 'Cash on Delivery' },
  });
  assert.equal(oversold.status, 409);
  assert.equal((await call('/products/10')).data.product.stock, stock);
});
