import React, { useEffect, useState } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  ShoppingBag,
  ShoppingCart,
  Heart,
  User,
  LogOut,
  Search,
  SlidersHorizontal,
  Minus,
  Plus,
  Trash2,
  Package,
  ArrowLeft,
} from 'lucide-react';
import { api } from './api';
import { useStore } from './store';

const money = value => `₹${Number(value).toLocaleString('en-IN')}`;

// Inline fallback image: works offline and never triggers another request.
const FALLBACK_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">
      <rect width="600" height="450" fill="#e8f0e7"/>
      <text x="300" y="235" font-family="Arial, sans-serif" font-size="34" font-weight="700"
        fill="#538166" text-anchor="middle">ShopEase</text>
    </svg>`
  );

const handleImageError = event => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = FALLBACK_IMAGE;
};

// SQLite stores UTC timestamps as "YYYY-MM-DD HH:MM:SS".
const formatDate = value =>
  new Date(`${String(value).replace(' ', 'T')}Z`).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Header() {
  const { user, cart, favorites, logout } = useStore();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="header">
      <Link className="brand" to="/">
        <ShoppingBag /> ShopEase
      </Link>

      <nav>
        <NavLink to="/">Shop</NavLink>
        <NavLink to="/favorites">
          <Heart size={17} /> Favorites <span>{favorites.length}</span>
        </NavLink>
        {user && <NavLink to="/orders">My Orders</NavLink>}
        <NavLink to="/cart" className="cart-link">
          <ShoppingCart /> Cart <span>{cartCount}</span>
        </NavLink>
        {user ? (
          <button className="link-button" onClick={logout}>
            <LogOut size={17} /> Logout
          </button>
        ) : (
          <NavLink to="/login">
            <User size={17} /> Login
          </NavLink>
        )}
      </nav>
    </header>
  );
}

function ProductCard({ product }) {
  const { addToCart, favorites, toggleFavorite } = useStore();
  const isFavorite = favorites.some(item => item.id === product.id);

  return (
    <article className="product-card">
      <div className="product-image">
        <Link to={`/products/${product.id}`}>
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            onError={handleImageError}
          />
        </Link>
        <button
          type="button"
          className={`favorite-btn ${isFavorite ? 'favorited' : ''}`}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={isFavorite}
          onClick={() => toggleFavorite(product)}
        >
          <Heart size={19} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="product-info">
        <small>{product.category}</small>
        <Link className="product-name" to={`/products/${product.id}`}>
          {product.name}
        </Link>
        <ProductRating product={product} />
        <strong>{money(product.price)}</strong>
        <button
          disabled={product.stock < 1}
          onClick={() => addToCart(product)}
        >
          {product.stock > 0 ? 'Add to cart' : 'Out of stock'}
        </button>
      </div>
    </article>
  );
}

function ProductRating({ product }) {
  const rating = Number(product.rating) || 0;
  const reviewCount = Number(product.review_count) || 0;
  const filledStars = Math.round(rating);
  return (
    <span className="product-rating" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      <span className="rating-stars" aria-hidden="true">
        {'★'.repeat(filledStars)}{'☆'.repeat(5 - filledStars)}
      </span>
      <b>{rating.toFixed(1)}</b>
      <small>({reviewCount} reviews)</small>
    </span>
  );
}

function Home() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minRating, setMinRating] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([
    'Electronics',
    'Fashion',
    'Accessories',
    'Home & Kitchen',
    'Beauty',
    'Sports',
  ]);
  const debouncedSearch = useDebounced(search);
  const activeFilterCount = [
    category,
    minPrice,
    maxPrice,
    minRating,
  ].filter(Boolean).length;
  const visibleProducts = products.filter(product =>
    (!minPrice || product.price >= Number(minPrice)) &&
    (!maxPrice || product.price <= Number(maxPrice)) &&
    (!minRating || product.rating >= Number(minRating))
  );

  useEffect(() => {
    api('/categories')
      .then(data => data.categories.length && setCategories(data.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError('');

    api(
      `/products?search=${encodeURIComponent(debouncedSearch)}&category=${encodeURIComponent(category)}`
    )
      .then(data => {
        if (isMounted) setProducts(data.products);
      })
      .catch(err => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedSearch, category]);

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">EVERYDAY FINDS, MADE SIMPLE</p>
          <h1>
            Good things.
            <br />
            Great prices.
          </h1>
          <p>Discover useful products for your everyday life.</p>
          <a className="primary-btn" href="#products">
            Explore products
          </a>
        </div>

        <div className="hero-art">
          <ShoppingBag size={110} />
          <span>SHOP SMART</span>
        </div>
      </section>

      <section id="products" className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OUR COLLECTION</p>
            <h2>Explore products</h2>
            <p className="muted">{visibleProducts.length} products found</p>
          </div>

          <div className="product-filters">
            <label className="search">
              <Search size={18} />
              <input
                type="search"
                placeholder="Search products..."
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </label>
            <details className="filter-dropdown">
              <summary>
                <SlidersHorizontal size={17} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="filter-count">{activeFilterCount}</span>
                )}
              </summary>
              <div className="filter-panel">
                <label className="filter-field">
                  <span>Category</span>
                  <select
                    className="category-select"
                    value={category}
                    onChange={event => setCategory(event.target.value)}
                    aria-label="Filter by category"
                  >
                    <option value="">All Categories</option>
                    {categories.map(item => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="filter-field price-field">
                  <legend>Price range</legend>
                  <div className="price-filter">
                    <input
                      type="number"
                      min="0"
                      placeholder="Min"
                      aria-label="Minimum price"
                      value={minPrice}
                      onChange={event => setMinPrice(event.target.value)}
                    />
                    <span aria-hidden="true">to</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Max"
                      aria-label="Maximum price"
                      value={maxPrice}
                      onChange={event => setMaxPrice(event.target.value)}
                    />
                  </div>
                </fieldset>
                <label className="filter-field">
                  <span>Customer rating</span>
                  <select
                    className="category-select"
                    value={minRating}
                    onChange={event => setMinRating(event.target.value)}
                    aria-label="Filter by minimum customer rating"
                  >
                    <option value="">Any rating</option>
                    <option value="4">4+ stars</option>
                    <option value="3">3+ stars</option>
                    <option value="2">2+ stars</option>
                  </select>
                </label>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    className="clear-filters"
                    onClick={() => {
                      setCategory('');
                      setMinPrice('');
                      setMaxPrice('');
                      setMinRating('');
                    }}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading products...</p>}

        {!loading && !error && (
          <>
            <div className="products-grid">
              {visibleProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {visibleProducts.length === 0 && (
              <p className="empty-message">
                No products found. Try another search or category.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}

function ProductDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [similarError, setSimilarError] = useState('');
  const [error, setError] = useState('');
  const { addToCart, favorites, toggleFavorite } = useStore();
  const isFavorite = product && favorites.some(item => item.id === product.id);

  useEffect(() => {
    setProduct(null);
    setError('');
    api(`/products/${id}`)
      .then(data => setProduct(data.product))
      .catch(err => setError(err.message));
  }, [id]);

  useEffect(() => {
    if (!product) return undefined;
    let isMounted = true;
    setSimilarProducts([]);
    setSimilarError('');
    api(`/products?category=${encodeURIComponent(product.category)}`)
      .then(data => {
        if (isMounted) {
          setSimilarProducts(data.products.filter(item => item.id !== product.id));
        }
      })
      .catch(err => {
        if (isMounted) setSimilarError(err.message);
      });
    return () => {
      isMounted = false;
    };
  }, [product]);

  if (error) {
    return (
      <section className="section">
        <p className="error">{error}</p>
        <Link to="/">Back to shop</Link>
      </section>
    );
  }
  if (!product) return <p className="section">Loading product...</p>;

  return (
    <section className="detail">
      <img src={product.image_url} alt={product.name} onError={handleImageError} />
      <div>
        <Link className="back-link" to="/">
          <ArrowLeft size={16} /> All products
        </Link>
        <p className="eyebrow">{product.category}</p>
        <h1>{product.name}</h1>
        <ProductRating product={product} />
        <h2>{money(product.price)}</h2>
        <p>{product.description}</p>
        <p className={product.stock > 0 ? 'in-stock' : 'error'}>
          {product.stock === 0
            ? 'Out of stock'
            : product.stock <= 5
              ? `Only ${product.stock} left`
              : `${product.stock} available`}
        </p>
        <button
          className="primary-btn"
          disabled={!product.stock}
          onClick={() => addToCart(product)}
        >
          {product.stock > 0 ? 'Add to cart' : 'Out of stock'}
        </button>
        <button
          type="button"
          className={`favorite-detail-btn ${isFavorite ? 'favorited' : ''}`}
          aria-pressed={isFavorite}
          onClick={() => toggleFavorite(product)}
        >
          <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
          {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        </button>
      </div>
      <section className="similar-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MORE TO DISCOVER</p>
            <h2>You may also like</h2>
          </div>
        </div>
        {similarError && <p className="error">{similarError}</p>}
        {!similarError && similarProducts.length > 0 && (
          <div className="products-grid">
            {similarProducts.slice(0, 4).map(item => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function Favorites() {
  const { favorites } = useStore();

  return (
    <section className="section">
      <p className="eyebrow">SAVED FOR LATER</p>
      <h1>Your favorites</h1>
      {favorites.length > 0 ? (
        <div className="products-grid">
          {favorites.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Heart size={42} />
          <p>You haven't saved any favorites yet.</p>
          <Link className="primary-btn" to="/">Explore products</Link>
        </div>
      )}
    </section>
  );
}

function Auth({ mode }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || '/';
  const registrationNotice =
    mode === 'register' ? location.state?.notice : '';

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const data = await api(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      login(data);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">WELCOME TO SHOPEASE</p>
        <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        {registrationNotice && (
          <p className="auth-notice" role="status">{registrationNotice}</p>
        )}

        {mode === 'register' && (
          <input
            required
            placeholder="Full name"
            value={form.name}
            onChange={event =>
              setForm({ ...form, name: event.target.value })
            }
          />
        )}

        <input
          required
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={event =>
            setForm({ ...form, email: event.target.value })
          }
        />

        <input
          required
          minLength="6"
          type="password"
          placeholder="Password (min 6 characters)"
          value={form.password}
          onChange={event =>
            setForm({ ...form, password: event.target.value })
          }
        />

        {error && (
          <p className="error" role="alert">
            {error}{' '}
            {mode === 'login' && error.toLowerCase().includes('not registered') && (
              <Link
                to="/register"
                state={{
                  ...location.state,
                  notice: 'You are not registered yet. Please register, then sign in.',
                }}
              >
                Register now
              </Link>
            )}
          </p>
        )}
        <button className="primary-btn" disabled={busy}>
          {busy
            ? 'Please wait...'
            : mode === 'login'
              ? 'Sign in'
              : 'Register'}
        </button>

        {mode === 'login' && (
          <p className="muted demo-hint">
            Demo account: demo@shopease.com / demo123
          </p>
        )}

        <p>
          {mode === 'login'
            ? "Don't have an account? "
            : 'Already registered? '}
          <Link
            to={mode === 'login' ? '/register' : '/login'}
            state={location.state}
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </Link>
        </p>
      </form>
    </section>
  );
}

function Cart() {
  const { cart, changeQty } = useStore();
  const navigate = useNavigate();
  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <section className="section narrow">
      <p className="eyebrow">YOUR SELECTION</p>
      <h1>Shopping cart</h1>

      {cart.length === 0 ? (
        <div className="empty">
          <ShoppingCart size={45} />
          <p>Your cart is empty.</p>
          <Link className="primary-btn" to="/">
            Continue shopping
          </Link>
        </div>
      ) : (
        <>
          {cart.map(item => (
            <div className="cart-row" key={item.id}>
              <img src={item.image_url} alt={item.name} onError={handleImageError} />
              <div className="cart-product">
                <b>{item.name}</b>
                <span>{money(item.price)}</span>
                <small>{item.stock} in stock</small>
              </div>

              <div className="qty">
                <button
                  aria-label="Decrease quantity"
                  onClick={() => changeQty(item.id, item.quantity - 1)}
                >
                  <Minus size={15} />
                </button>
                <b>{item.quantity}</b>
                <button
                  aria-label="Increase quantity"
                  disabled={item.quantity >= item.stock}
                  onClick={() => changeQty(item.id, item.quantity + 1)}
                >
                  <Plus size={15} />
                </button>
              </div>

              <b>{money(item.price * item.quantity)}</b>
              <button
                className="icon-btn"
                aria-label="Remove product"
                onClick={() => changeQty(item.id, 0)}
              >
                <Trash2 />
              </button>
            </div>
          ))}

          <div className="cart-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <button
            className="primary-btn full"
            onClick={() => navigate('/checkout')}
          >
            Proceed to checkout
          </button>
        </>
      )}
    </section>
  );
}

function emptyAddress(name = '') {
  return {
    recipientName: name,
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
  };
}

function AddressFields({ address, onChange }) {
  return (
    <fieldset className="address-fields">
      <label>
        Full name
        <input name="recipientName" autoComplete="name" required minLength={2} maxLength={100}
          value={address.recipientName} onChange={onChange} />
      </label>
      <label>
        Phone number
        <input name="phone" type="tel" autoComplete="tel" required minLength={7} maxLength={20}
          value={address.phone} onChange={onChange} />
      </label>
      <label className="address-wide">
        Street address
        <input name="addressLine1" autoComplete="address-line1" required minLength={5} maxLength={200}
          value={address.addressLine1} onChange={onChange} />
      </label>
      <label className="address-wide">
        Apartment, suite, etc. <span className="muted">(optional)</span>
        <input name="addressLine2" autoComplete="address-line2" maxLength={200}
          value={address.addressLine2} onChange={onChange} />
      </label>
      <label>
        City
        <input name="city" autoComplete="address-level2" required minLength={2} maxLength={100}
          value={address.city} onChange={onChange} />
      </label>
      <label>
        State / Province
        <input name="state" autoComplete="address-level1" required minLength={2} maxLength={100}
          value={address.state} onChange={onChange} />
      </label>
      <label>
        Postal code
        <input name="postalCode" autoComplete="postal-code" required minLength={3} maxLength={12}
          value={address.postalCode} onChange={onChange} />
      </label>
      <label>
        Country
        <input name="country" autoComplete="country-name" required minLength={2} maxLength={80}
          value={address.country} onChange={onChange} />
      </label>
    </fieldset>
  );
}

function Checkout() {
  const { cart, user, clearCart } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [addressMode, setAddressMode] = useState(null);
  const [addressDraft, setAddressDraft] = useState(() => emptyAddress(user?.name));
  const [paymentMethod, setPaymentMethod] = useState('');
  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  async function refreshAddresses(preferredId) {
    const data = await api('/addresses');
    const nextAddresses = data.addresses;
    setAddresses(nextAddresses);
    const selected =
      nextAddresses.find(item => item.id === Number(preferredId)) ||
      nextAddresses.find(item => item.isDefault) ||
      nextAddresses[0];
    setSelectedAddressId(selected ? String(selected.id) : '');
    if (nextAddresses.length === 0) setAddressMode('new');
    return nextAddresses;
  }

  useEffect(() => {
    refreshAddresses().catch(err => setError(err.message)).finally(() => setAddressesLoading(false));
  }, []);

  function updateAddress(event) {
    const { name, value } = event.target;
    setAddressDraft(current => ({ ...current, [name]: value }));
  }

  function addAddress() {
    setError('');
    setAddressDraft(emptyAddress(user?.name));
    setAddressMode('new');
  }

  function editAddress(address) {
    setError('');
    setAddressDraft({
      recipientName: address.recipientName,
      phone: address.phone,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    });
    setAddressMode(address.id);
  }

  async function saveAddress(event) {
    event.preventDefault();
    setAddressBusy(true);
    setError('');
    try {
      const path = addressMode === 'new' ? '/addresses' : `/addresses/${addressMode}`;
      const result = await api(path, {
        method: addressMode === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify({ address: addressDraft }),
      });
      await refreshAddresses(result.address.id);
      setAddressMode(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddressBusy(false);
    }
  }

  async function makeDefault(addressId) {
    setAddressBusy(true);
    setError('');
    try {
      await api(`/addresses/${addressId}/default`, { method: 'PATCH' });
      await refreshAddresses(addressId);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddressBusy(false);
    }
  }

  async function deleteAddress(addressId) {
    if (!window.confirm('Delete this saved address?')) return;
    setAddressBusy(true);
    setError('');
    try {
      await api(`/addresses/${addressId}`, { method: 'DELETE' });
      const remaining = await refreshAddresses();
      if (remaining.length === 0) setAddressDraft(emptyAddress(user?.name));
    } catch (err) {
      setError(err.message);
    } finally {
      setAddressBusy(false);
    }
  }

  async function placeOrder(event) {
    event.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: '/checkout' } });
      return;
    }

    setBusy(true);
    setError('');

    try {
      await api('/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map(item => ({
            productId: item.id,
            quantity: item.quantity,
          })),
          addressId: Number(selectedAddressId),
          paymentMethod,
        }),
      });
      clearCart();
      navigate('/orders');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (cart.length === 0) {
    return (
      <section className="section">
        <h1>Your cart is empty</h1>
        <Link to="/">Go shopping</Link>
      </section>
    );
  }

  return (
    <section className="section narrow">
      <p className="eyebrow">ALMOST THERE</p>
      <h1>Checkout</h1>

      <div className="checkout-card">
        <section className="saved-addresses" aria-busy={addressesLoading || addressBusy}>
          <div className="address-heading">
            <div>
              <h2>Delivery address</h2>
              <p className="muted">Choose where you want your order delivered.</p>
            </div>
            {addressMode === null && (
              <button className="secondary-btn" type="button" onClick={addAddress} disabled={addressBusy}>
                Add new address
              </button>
            )}
          </div>

          {addressesLoading ? (
            <p className="muted">Loading saved addresses...</p>
          ) : addresses.length > 0 ? (
            <div className="saved-address-list">
              {addresses.map(address => (
                <article className={`saved-address ${String(address.id) === selectedAddressId ? 'selected' : ''}`}
                  key={address.id}>
                  <label className="saved-address-select">
                    <input type="radio" name="deliveryAddress" value={address.id}
                      checked={String(address.id) === selectedAddressId}
                      onChange={() => setSelectedAddressId(String(address.id))} />
                    <span>
                      <strong>{address.recipientName}</strong>
                      {address.isDefault && <small className="default-badge">Default</small>}
                      <span>{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ''}</span>
                      <span>{address.city}, {address.state} {address.postalCode}, {address.country}</span>
                      <span>{address.phone}</span>
                    </span>
                  </label>
                  <div className="address-actions">
                    {!address.isDefault && (
                      <button type="button" onClick={() => makeDefault(address.id)} disabled={addressBusy}>
                        Set as default
                      </button>
                    )}
                    <button type="button" onClick={() => editAddress(address)} disabled={addressBusy}>
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteAddress(address.id)} disabled={addressBusy}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            !addressesLoading && <p className="muted">Add a delivery address to continue.</p>
          )}

          {addressMode !== null && (
            <form className="address-editor" onSubmit={saveAddress}>
              <h3>{addressMode === 'new' ? 'Add a new address' : 'Edit address'}</h3>
              <AddressFields address={addressDraft} onChange={updateAddress} />
              <div className="address-editor-actions">
                <button className="primary-btn" type="submit" disabled={addressBusy}>
                  {addressBusy ? 'Saving...' : 'Save address'}
                </button>
                {addresses.length > 0 && (
                  <button className="secondary-btn" type="button" onClick={() => setAddressMode(null)}
                    disabled={addressBusy}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </section>

        {error && <p className="error" role="alert">{error}</p>}

        <form className="checkout-summary" onSubmit={placeOrder}>
        <fieldset className="payment-section">
          <legend>Payment method</legend>
          <p className="muted">Choose how you would like to pay. This demo does not process payments.</p>
          <div className="payment-method-grid">
            {['UPI', 'Card', 'Net Banking', 'Cash on Delivery'].map(method => (
              <label className={`payment-method ${paymentMethod === method ? 'selected' : ''}`} key={method}>
                <input type="radio" name="paymentMethod" value={method} required
                  checked={paymentMethod === method}
                  onChange={() => setPaymentMethod(method)} />
                <span>
                  <strong>{method}</strong>
                  <small>
                    {method === 'Cash on Delivery' ? 'Pay when your order arrives' : `Pay securely with ${method}`}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <p>Order summary</p>
          {cart.map(item => (
            <div className="summary-row" key={item.id}>
              <span>
                {item.name} × {item.quantity}
              </span>
              <b>{money(item.price * item.quantity)}</b>
            </div>
          ))}
          <hr />
          <div className="summary-row">
            <strong>Total</strong>
            <strong>{money(total)}</strong>
          </div>
        </div>
        <p className="muted">
          Demo checkout: payment details are not collected or processed.
        </p>
        <button className="primary-btn full" type="submit"
          disabled={busy || addressBusy || addressesLoading || !selectedAddressId}>
          {busy ? 'Placing order...' : 'Place order'}
        </button>
        </form>
      </div>
    </section>
  );
}

function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/orders/my')
      .then(data => setOrders(data.orders))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="section narrow">
      <p className="eyebrow">PURCHASE HISTORY</p>
      <h1>My orders</h1>

      {error && <p className="error">{error}</p>}

      {orders.map(order => (
        <article className="order-card" key={order.id}>
          <header className="order-header">
            <div>
              <h2>Order #{order.id}</h2>
              <time dateTime={`${String(order.created_at).replace(' ', 'T')}Z`}>
                {formatDate(order.created_at)}
              </time>
            </div>
            <span className="order-status">{order.status}</span>
          </header>

          <section className="order-products" aria-label="Products in this order">
            <h3>Products</h3>
            {order.items.map(item => (
              <div className="order-item" key={item.id}>
                <div>
                  <strong>{item.product_name}</strong>
                  <span>
                    Quantity: {item.quantity} × {money(item.price)} each
                  </span>
                </div>
                <strong>{money(item.price * item.quantity)}</strong>
              </div>
            ))}
          </section>

          <div className="order-info-grid">
            <section className="order-info">
              <h3>Delivery address</h3>
              {order.address_line1 ? (
                <address>
                  <strong>{order.recipient_name}</strong>
                  <span>{order.address_line1}</span>
                  {order.address_line2 && <span>{order.address_line2}</span>}
                  <span>{order.city}, {order.state} {order.postal_code}</span>
                  <span>{order.country}</span>
                  <span>{order.phone}</span>
                </address>
              ) : (
                <p className="muted">Address not available.</p>
              )}
            </section>
            <section className="order-info">
              <h3>Payment method</h3>
              <p>{order.payment_method || 'Not recorded'}</p>
            </section>
          </div>

          <div className="order-total">
            <span>Total amount</span>
            <strong>{money(order.total)}</strong>
          </div>
        </article>
      ))}

      {loading && <p className="muted">Loading orders...</p>}

      {!loading && orders.length === 0 && !error && (
        <div className="empty">
          <Package size={42} />
          <p>No orders yet.</p>
          <Link to="/">Start shopping</Link>
        </div>
      )}
    </section>
  );
}

function Protected({ children }) {
  const { user } = useStore();
  const location = useLocation();
  return user ? (
    children
  ) : (
    <Navigate to="/login" replace state={{ from: location.pathname }} />
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products/:id" element={<ProductDetails />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/login" element={<Auth mode="login" />} />
          <Route path="/register" element={<Auth mode="register" />} />
          <Route path="/cart" element={<Cart />} />
          <Route
            path="/checkout"
            element={
              <Protected>
                <Checkout />
              </Protected>
            }
          />
          <Route
            path="/orders"
            element={
              <Protected>
                <Orders />
              </Protected>
            }
          />
          <Route
            path="*"
            element={
              <section className="section">
                <h1>Page not found</h1>
                <Link to="/">Back to shop</Link>
              </section>
            }
          />
        </Routes>
      </main>
      <footer>
        © {new Date().getFullYear()} ShopEase · Built with React, Node.js and
        SQLite
      </footer>
    </>
  );
}
