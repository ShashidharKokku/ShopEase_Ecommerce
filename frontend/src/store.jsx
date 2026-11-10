import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, getToken, setToken } from './api';

const StoreContext = createContext(null);

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable - ignore */
  }
}

export function StoreProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? read('shopease_user', null) : null));
  const [cart, setCart] = useState(() => read('shopease_cart', []));
  const [favorites, setFavorites] = useState(() => read('shopease_favorites', []));
  const [toast, setToast] = useState('');
  const toastTimer = useRef();

  useEffect(() => write('shopease_cart', cart), [cart]);
  useEffect(() => write('shopease_favorites', favorites), [favorites]);

  const showToast = useCallback(message => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    write('shopease_user', null);
    setUser(null);
  }, []);

  const login = useCallback(({ token, user: nextUser }) => {
    setToken(token);
    write('shopease_user', nextUser);
    setUser(nextUser);
  }, []);

  // Validate a stored session once on load, and sign out if the token expired.
  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me').catch(() => {});
    const onUnauthorized = () => logout();
    window.addEventListener('shopease:unauthorized', onUnauthorized);
    return () => window.removeEventListener('shopease:unauthorized', onUnauthorized);
  }, [logout]);

  const addToCart = useCallback(
    product => {
      const existing = cart.find(item => item.id === product.id);
      if (existing && existing.quantity >= product.stock) {
        showToast(`Only ${product.stock} available`);
        return;
      }

      setCart(current => {
        const found = current.find(item => item.id === product.id);
        if (found) {
          return current.map(item =>
            item.id === product.id
              ? { ...item, stock: product.stock, quantity: item.quantity + 1 }
              : item
          );
        }
        return [
          ...current,
          {
            id: product.id,
            name: product.name,
            price: product.price,
            image_url: product.image_url,
            stock: product.stock,
            quantity: 1,
          },
        ];
      });
      showToast(`${product.name} added to cart`);
    },
    [cart, showToast]
  );

  const changeQty = useCallback((id, quantity) => {
    setCart(current =>
      quantity <= 0
        ? current.filter(item => item.id !== id)
        : current.map(item =>
            item.id === id ? { ...item, quantity: Math.min(quantity, item.stock) } : item
          )
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);
  const toggleFavorite = useCallback(
    product => {
      const alreadyFavorite = favorites.some(item => item.id === product.id);
      setFavorites(current =>
        alreadyFavorite
          ? current.filter(item => item.id !== product.id)
          : [...current, product]
      );
      showToast(
        alreadyFavorite
          ? `${product.name} removed from favorites`
          : `${product.name} added to favorites`
      );
    },
    [favorites, showToast]
  );

  const value = useMemo(
    () => ({
      user,
      cart,
      favorites,
      login,
      logout,
      addToCart,
      changeQty,
      clearCart,
      toggleFavorite,
    }),
    [user, cart, favorites, login, logout, addToCart, changeQty, clearCart, toggleFavorite]
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside <StoreProvider>');
  return context;
}
