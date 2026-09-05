import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);

const STORAGE_KEY = 'globalpay_marketplace_cart';

const loadCart = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveCart = (items) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* quota exceeded — non-fatal */ }
};

/**
 * CartProvider — lightweight shopping cart for marketplace services.
 * Items are keyed by serviceId. Each item stores the full service object
 * plus the quantity the user chose at "Add to Cart" time (defaults to 1).
 */
export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(loadCart);

  useEffect(() => { saveCart(items); }, [items]);

  /** Add a service to the cart. If already present, bumps quantity. */
  const addItem = useCallback((service, quantity = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.serviceId === service.serviceId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: (next[idx].quantity || 1) + quantity };
        return next;
      }
      return [...prev, { ...service, quantity }];
    });
  }, []);

  /** Remove a service by serviceId. */
  const removeItem = useCallback((serviceId) => {
    setItems((prev) => prev.filter((i) => i.serviceId !== serviceId));
  }, []);

  /** Update the quantity of an item already in the cart. */
  const updateQuantity = useCallback((serviceId, quantity) => {
    if (quantity < 1) return;
    setItems((prev) => prev.map((i) => (i.serviceId === serviceId ? { ...i, quantity } : i)));
  }, []);

  /** Clear the entire cart. */
  const clearCart = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((n, i) => n + (i.quantity || 1), 0), [items]);
  const totalEstimate = useMemo(
    () => items.reduce((s, i) => s + (Number(i.unitPriceETH || 0) * (i.quantity || 1)), 0),
    [items]
  );

  const value = useMemo(
    () => ({ items, addItem, removeItem, updateQuantity, clearCart, count, totalEstimate }),
    [items, addItem, removeItem, updateQuantity, clearCart, count, totalEstimate]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
};

export default CartContext;
