import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the database location relative to this file (not the current working
// directory) so the same database is used no matter where the server starts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'data', 'shopease.db');
export const dataDir = path.dirname(dbPath);
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL CHECK(price >= 0),
    image_url TEXT NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    rating REAL NOT NULL DEFAULT 0 CHECK(rating >= 0 AND rating <= 5),
    review_count INTEGER NOT NULL DEFAULT 0 CHECK(review_count >= 0)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Placed',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0)
  );
`);

const productColumns = new Set(db.pragma('table_info(products)').map(column => column.name));
if (!productColumns.has('rating')) {
  db.exec('ALTER TABLE products ADD COLUMN rating REAL NOT NULL DEFAULT 0');
}
if (!productColumns.has('review_count')) {
  db.exec('ALTER TABLE products ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0');
}

const products = [
  // Existing starter products
  {
    name: 'Wireless Headphones',
    description: 'Comfortable over-ear headphones with clear sound and long battery life.',
    price: 2499,
    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700',
    category: 'Electronics',
    stock: 20,
  },
  {
    name: 'Smart Watch',
    description: 'Track your activity, notifications and daily goals.',
    price: 3299,
    image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700',
    category: 'Electronics',
    stock: 15,
  },
  {
    name: 'Everyday Backpack',
    description: 'A durable backpack for work, college and travel.',
    price: 1499,
    image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700',
    category: 'Accessories',
    stock: 30,
  },
  {
    name: 'Running Shoes',
    description: 'Lightweight everyday running shoes with cushioned support.',
    price: 2799,
    image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=700',
    category: 'Fashion',
    stock: 18,
  },
  {
    name: 'Classic Sunglasses',
    description: 'Minimal frame sunglasses for everyday style.',
    price: 999,
    image_url: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=700',
    category: 'Fashion',
    stock: 25,
  },
  {
    name: 'Ceramic Coffee Mug',
    description: 'Simple ceramic mug for your morning coffee.',
    price: 399,
    image_url: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=700',
    category: 'Home & Kitchen',
    stock: 40,
  },

  // Additional Electronics
  {
    name: 'Bluetooth Speaker',
    description: 'Portable Bluetooth speaker with powerful sound.',
    price: 1799,
    image_url: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=700',
    category: 'Electronics',
    stock: 25,
  },
  {
    name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse for everyday use.',
    price: 699,
    image_url: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=700',
    category: 'Electronics',
    stock: 30,
  },
  {
    name: 'Mechanical Keyboard',
    description: 'Comfortable mechanical keyboard for work and gaming.',
    price: 2499,
    image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=700',
    category: 'Electronics',
    stock: 15,
  },
  {
    name: 'Digital Camera',
    description: 'Capture memorable moments with this compact camera.',
    price: 12999,
    image_url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=700',
    category: 'Electronics',
    stock: 8,
  },

  // Additional Fashion
  {
    name: 'Cotton T-Shirt',
    description: 'Comfortable premium cotton everyday T-shirt.',
    price: 599,
    image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=700',
    category: 'Fashion',
    stock: 40,
  },
  {
    name: 'Casual Jacket',
    description: 'Stylish casual jacket for everyday wear.',
    price: 1999,
    image_url: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=700',
    category: 'Fashion',
    stock: 20,
  },
  {
    name: 'Denim Jeans',
    description: 'Classic blue denim jeans with a comfortable fit.',
    price: 1499,
    image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=700',
    category: 'Fashion',
    stock: 25,
  },

  // Additional Accessories
  {
    name: 'Leather Wallet',
    description: 'Minimal everyday wallet with multiple card slots.',
    price: 799,
    image_url: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=700',
    category: 'Accessories',
    stock: 22,
  },
  {
    name: 'Travel Backpack',
    description: 'Spacious backpack suitable for travel and college.',
    price: 1899,
    image_url: 'https://images.unsplash.com/photo-1622560480654-d96214fdc887?w=700',
    category: 'Accessories',
    stock: 18,
  },
  {
    name: 'Classic Wrist Watch',
    description: 'Elegant wristwatch with a classic design.',
    price: 2199,
    image_url: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=700',
    category: 'Accessories',
    stock: 14,
  },

  // Home & Kitchen
  {
    name: 'Table Lamp',
    description: 'Modern table lamp for your bedroom or workspace.',
    price: 899,
    image_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=700',
    category: 'Home & Kitchen',
    stock: 16,
  },
  {
    name: 'Steel Water Bottle',
    description: 'Reusable stainless steel water bottle.',
    price: 499,
    image_url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=700',
    category: 'Home & Kitchen',
    stock: 35,
  },
  {
    name: 'Coffee Maker',
    description: 'Make fresh coffee at home with ease.',
    price: 3499,
    image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=700',
    category: 'Home & Kitchen',
    stock: 10,
  },

  // Beauty
  {
    name: 'Skincare Set',
    description: 'Daily skincare essentials for your routine.',
    price: 1199,
    image_url: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=700',
    category: 'Beauty',
    stock: 20,
  },
  {
    name: 'Perfume',
    description: 'Refreshing fragrance for everyday occasions.',
    price: 1599,
    image_url: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=700',
    category: 'Beauty',
    stock: 15,
  },

  // Sports
  {
    name: 'Yoga Mat',
    description: 'Non-slip yoga mat for home workouts.',
    price: 799,
    image_url: 'https://images.unsplash.com/photo-1592432678016-e910b452f9a2?w=700',
    category: 'Sports',
    stock: 20,
  },
  {
    name: 'Dumbbell Set',
    description: 'Fitness dumbbells for strength training.',
    price: 1499,
    image_url: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=700',
    category: 'Sports',
    stock: 12,
  },
  {
    name: 'Football',
    description: 'Durable football for practice and matches.',
    price: 899,
    image_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=700',
    category: 'Sports',
    stock: 18,
  },
  {
    name: 'Noise-Cancelling Earbuds',
    description: 'Compact wireless earbuds with clear sound and a pocket charging case.',
    price: 1899,
    image_url: 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods/1.webp',
    category: 'Electronics',
    stock: 24,
  },
  {
    name: 'Portable Power Bank',
    description: 'Slim portable charger for keeping your devices powered on the go.',
    price: 1299,
    image_url: 'https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpower-wireless-charger/1.webp',
    category: 'Electronics',
    stock: 28,
  },
  {
    name: 'USB-C Hub',
    description: 'Multi-port hub for connecting accessories and displays to your laptop.',
    price: 1599,
    image_url: 'https://cdn.dummyjson.com/product-images/mobile-accessories/amazon-echo-plus/1.webp',
    category: 'Electronics',
    stock: 17,
  },
  {
    name: 'Laptop Stand',
    description: 'Adjustable stand that raises your laptop for a more comfortable setup.',
    price: 999,
    image_url: 'https://cdn.dummyjson.com/product-images/laptops/apple-macbook-pro-14-inch-space-grey/1.webp',
    category: 'Electronics',
    stock: 19,
  },
  {
    name: 'Portable Projector',
    description: 'Compact projector for movie nights and presentations.',
    price: 8499,
    image_url: 'https://cdn.dummyjson.com/product-images/laptops/asus-zenbook-pro-dual-screen-laptop/1.webp',
    category: 'Electronics',
    stock: 7,
  },
  {
    name: 'Linen Summer Shirt',
    description: 'Lightweight button-up shirt made for warm-weather days.',
    price: 1099,
    image_url: 'https://cdn.dummyjson.com/product-images/mens-shirts/blue-%26-black-check-shirt/1.webp',
    category: 'Fashion',
    stock: 26,
  },
  {
    name: 'Hooded Sweatshirt',
    description: 'Soft, comfortable hoodie for relaxed everyday wear.',
    price: 1399,
    image_url: 'https://cdn.dummyjson.com/product-images/mens-shirts/gigabyte-aorus-men-tshirt/1.webp',
    category: 'Fashion',
    stock: 21,
  },
  {
    name: 'Everyday Sneakers',
    description: 'Versatile casual sneakers with a cushioned sole.',
    price: 2299,
    image_url: 'https://cdn.dummyjson.com/product-images/mens-shoes/nike-air-jordan-1-red-and-black/1.webp',
    category: 'Fashion',
    stock: 16,
  },
  {
    name: 'Canvas Tote Bag',
    description: 'Reusable canvas tote with room for daily essentials.',
    price: 499,
    image_url: 'https://cdn.dummyjson.com/product-images/womens-bags/white-faux-leather-backpack/1.webp',
    category: 'Fashion',
    stock: 32,
  },
  {
    name: 'Compact Crossbody Bag',
    description: 'A lightweight crossbody bag for carrying everyday essentials.',
    price: 1199,
    image_url: 'https://cdn.dummyjson.com/product-images/womens-bags/prada-women-bag/1.webp',
    category: 'Accessories',
    stock: 20,
  },
  {
    name: 'Card Holder',
    description: 'Slim card holder that keeps your essential cards organized.',
    price: 449,
    image_url: 'https://cdn.dummyjson.com/product-images/womens-jewellery/green-crystal-earring/1.webp',
    category: 'Accessories',
    stock: 27,
  },
  {
    name: 'Travel Organizer',
    description: 'Handy organizer for keeping travel documents and small items together.',
    price: 699,
    image_url: 'https://cdn.dummyjson.com/product-images/womens-bags/women-handbag-black/1.webp',
    category: 'Accessories',
    stock: 23,
  },
  {
    name: 'Polarized Sunglasses',
    description: 'Classic polarized lenses for comfortable outdoor wear.',
    price: 1299,
    image_url: 'https://cdn.dummyjson.com/product-images/sunglasses/black-sun-glasses/1.webp',
    category: 'Accessories',
    stock: 18,
  },
  {
    name: 'Ceramic Plant Pot',
    description: 'Minimal ceramic planter to brighten up a desk or windowsill.',
    price: 549,
    image_url: 'https://cdn.dummyjson.com/product-images/home-decoration/house-showpiece-plant/1.webp',
    category: 'Home & Kitchen',
    stock: 22,
  },
  {
    name: 'Insulated Travel Tumbler',
    description: 'Reusable insulated tumbler for hot or cold drinks on the move.',
    price: 799,
    image_url: 'https://cdn.dummyjson.com/product-images/kitchen-accessories/black-aluminium-cup/1.webp',
    category: 'Home & Kitchen',
    stock: 30,
  },
  {
    name: 'Pour-Over Coffee Set',
    description: 'Simple pour-over kit for brewing fresh coffee at home.',
    price: 1499,
    image_url: 'https://cdn.dummyjson.com/product-images/kitchen-accessories/boxed-blender/1.webp',
    category: 'Home & Kitchen',
    stock: 12,
  },
  {
    name: 'Serving Bowl Set',
    description: 'A set of versatile bowls for serving snacks and everyday meals.',
    price: 999,
    image_url: 'https://cdn.dummyjson.com/product-images/kitchen-accessories/plate/1.webp',
    category: 'Home & Kitchen',
    stock: 14,
  },
  {
    name: 'Soft Cushion Cover',
    description: 'Textured cushion cover to add a comfortable accent to your space.',
    price: 399,
    image_url: 'https://cdn.dummyjson.com/product-images/furniture/annibale-colombo-bed/1.webp',
    category: 'Home & Kitchen',
    stock: 35,
  },
  {
    name: 'Daily Face Moisturizer',
    description: 'Lightweight daily moisturizer for a simple skincare routine.',
    price: 699,
    image_url: 'https://cdn.dummyjson.com/product-images/beauty/powder-canister/1.webp',
    category: 'Beauty',
    stock: 24,
  },
  {
    name: 'Hydrating Face Serum',
    description: 'A lightweight hydrating serum for your daily skincare routine.',
    price: 899,
    image_url: 'https://cdn.dummyjson.com/product-images/skin-care/olay-ultra-moisture-shea-butter-body-wash/1.webp',
    category: 'Beauty',
    stock: 19,
  },
  {
    name: 'Nourishing Hand Cream',
    description: 'Travel-friendly hand cream for soft, moisturized hands.',
    price: 299,
    image_url: 'https://cdn.dummyjson.com/product-images/skin-care/attitude-super-leaves-hand-soap/1.webp',
    category: 'Beauty',
    stock: 31,
  },
  {
    name: 'Scented Candle',
    description: 'A gently scented candle for a calm evening at home.',
    price: 599,
    image_url: 'https://cdn.dummyjson.com/product-images/fragrances/calvin-klein-ck-one/1.webp',
    category: 'Beauty',
    stock: 16,
  },
  {
    name: 'Makeup Brush Set',
    description: 'Soft, versatile brushes for applying and blending everyday makeup.',
    price: 799,
    image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=700',
    category: 'Beauty',
    stock: 18,
  },
  {
    name: 'Beauty Gift Set',
    description: 'A curated collection of beauty essentials for your daily routine.',
    price: 1299,
    image_url: 'https://images.unsplash.com/photo-1526045478516-99145907023c?w=700',
    category: 'Beauty',
    stock: 11,
  },
  {
    name: 'Resistance Band Set',
    description: 'A set of resistance bands for stretching and home workouts.',
    price: 499,
    image_url: 'https://cdn.dummyjson.com/product-images/sports-accessories/american-football/1.webp',
    category: 'Sports',
    stock: 25,
  },
  {
    name: 'Skipping Rope',
    description: 'Lightweight speed rope for cardio workouts at home or outdoors.',
    price: 349,
    image_url: 'https://cdn.dummyjson.com/product-images/sports-accessories/baseball-ball/1.webp',
    category: 'Sports',
    stock: 29,
  },
  {
    name: 'Training Gloves',
    description: 'Comfortable grip gloves for weight training and gym sessions.',
    price: 799,
    image_url: 'https://cdn.dummyjson.com/product-images/sports-accessories/baseball-glove/1.webp',
    category: 'Sports',
    stock: 13,
  },
  {
    name: 'Sports Water Bottle',
    description: 'Durable reusable bottle to keep you hydrated during workouts.',
    price: 399,
    image_url: 'https://cdn.dummyjson.com/product-images/groceries/water/1.webp',
    category: 'Sports',
    stock: 34,
  },
  {
    name: 'Tennis Racket',
    description: 'Lightweight racket for casual tennis games and practice.',
    price: 1799,
    image_url: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=700',
    category: 'Sports',
    stock: 10,
  },
];

const findProduct = db.prepare('SELECT id FROM products WHERE name = ?');
const insertProduct = db.prepare(`
  INSERT INTO products (name, description, price, image_url, category, stock)
  VALUES (@name, @description, @price, @image_url, @category, @stock)
`);
const updateProductImage = db.prepare(
  'UPDATE products SET image_url = @image_url WHERE name = @name AND image_url != @image_url'
);

const seedProducts = db.transaction(() => {
  for (const product of products) {
    // Keep existing products and orders; only add products that are missing.
    if (!findProduct.get(product.name)) {
      insertProduct.run(product);
    }
    updateProductImage.run(product);
  }
});

seedProducts();

const seedRating = db.prepare(
  'UPDATE products SET rating = ?, review_count = ? WHERE id = ? AND review_count = 0'
);
for (const { id } of db.prepare('SELECT id FROM products').all()) {
  seedRating.run(3.6 + ((id * 7) % 14) / 10, 18 + ((id * 37) % 220), id);
}

export default db;
