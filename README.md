# ShopEase

ShopEase is a full-stack e-commerce demo built with React, Vite, Node.js, Express, and SQLite. It includes a browsable catalog, product pages, favorites, a cart, user accounts, checkout, and order history.

## Requirements

- Node.js 20 or newer (the LTS version is recommended)
- npm (included with Node.js)
- An internet connection to load product photos from the image host

## Quick start

Run these commands from the project root (the folder containing the root `package.json`):

```bash
npm install
npm run build
npm start
```

Open **http://localhost:4000** in your browser. Keep the terminal open while using the app; press **Ctrl+C** to stop the server.

The backend creates the SQLite database, demo account, and any missing catalog products automatically when it starts. Existing accounts, orders, stock, and ratings are kept when new products are seeded.

**Demo account**

- Email: `demo@shopease.com`
- Password: `demo123`

You can also create your own account from the Register page.

## Development

For frontend hot reload and a backend that restarts when server files change:

```bash
npm install
npm run dev
```

- Frontend: **http://localhost:5173**
- Backend API: **http://localhost:4000**
- Vite forwards `/api` requests to the backend.

Stop development servers with **Ctrl+C**.

## Build and tests

Build the frontend for production:

```bash
npm run build
```

Run the backend API tests:

```bash
npm test
```

After building, `npm start` serves the compiled frontend from the backend on port 4000.

## What’s included

- **53 distinct products** across six categories. Each product has its own image URL.
- Product search and filters for category, price range, and customer rating.
- Product detail pages with stock availability, star ratings, review counts, and similar products.
- Favorites accessible from the navigation bar. Favorites are saved in the current browser.
- A browser-saved cart with quantity controls and stock limits.
- Registration and sign-in using bcrypt password hashes and JWT sessions.
- Demo checkout, server-calculated order totals, stock checks, and order history.
- Responsive layout and a fallback image if a product photo cannot load.

Ratings and review counts are demo seed data, not reviews submitted by customers. Product photos are loaded from an external image host, so those photos require internet access.

## Product categories

The seeded catalog includes:

- Electronics
- Fashion
- Accessories
- Home & Kitchen
- Beauty
- Sports

There are at least eight products in each category. On startup, the backend adds missing products by name and refreshes the seeded image URLs for existing products. It does not remove extra products already present in your database.

## Data and configuration

By default, the database is created at `backend/data/shopease.db`. The backend also saves a generated JWT signing secret in `backend/data/.jwt_secret` if `JWT_SECRET` is not set. This lets login sessions survive a backend restart.

Configuration can be set using environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Port used by the backend |
| `JWT_SECRET` | Generated and saved in `backend/data/.jwt_secret` | Secret used to sign login tokens |
| `DB_PATH` | `backend/data/shopease.db` | Path to the SQLite database |

Example in macOS/Linux:

```bash
PORT=4001 npm start
```

Example in Windows PowerShell:

```powershell
$env:PORT = "4001"
npm start
```

The root `.env.example` documents these options; the app does not load `.env` files automatically.

To reset the demo database, stop the backend and remove `backend/data/shopease.db` and its related SQLite `-wal` / `-shm` files, if present. This deletes all registered users and order history. The database and demo account will be recreated on the next backend start. Back up the database first if you need to keep its data.

## API overview

All API routes are prefixed with `/api`.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Check whether the API is running |
| `GET` | `/categories` | List product categories |
| `GET` | `/products` | List products; accepts `search` and `category` query parameters |
| `GET` | `/products/:id` | Get one product |
| `POST` | `/auth/register` | Register an account |
| `POST` | `/auth/login` | Sign in |
| `GET` | `/auth/me` | Get the signed-in user |
| `POST` | `/orders` | Place an order (sign-in required) |
| `GET` | `/orders/my` | Get the signed-in user’s orders |

## Project structure

```text
backend/
  db.js           SQLite schema, migrations, and catalog seed data
  server.js       Express API and production static-file server
  server.test.js  Backend API tests
frontend/
  index.html
  vite.config.js
  src/
    App.jsx       Pages, navigation, and product UI
    api.js        Frontend API client
    store.jsx     Cart, favorites, and authentication state
    styles.css    App styles
package.json      Root workspace scripts and dependencies
```
