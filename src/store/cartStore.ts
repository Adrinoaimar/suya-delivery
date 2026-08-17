import { create } from 'zustand';
import { STORAGE_KEYS, readLocal, writeLocal } from '@/lib/storage';
import { createId } from '@/utils/id';
import type { CartItem, Product, ProductExtra, Store } from '@/types';

export interface AddToCartInput {
  product: Product;
  quantity: number;
  extras: ProductExtra[];
  note: string;
}

interface CartState {
  items: CartItem[];
  storeId: string | null;
  /** Devuelve false si el carrito ya tiene productos de otro negocio. */
  addItem: (input: AddToCartInput, options?: { replaceStore?: boolean }) => boolean;
  increment: (lineId: string) => void;
  decrement: (lineId: string) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
}

interface PersistedCart {
  items: CartItem[];
  storeId: string | null;
}

function load(): PersistedCart {
  return readLocal<PersistedCart>(STORAGE_KEYS.cart, { items: [], storeId: null });
}

function persist(state: PersistedCart): void {
  writeLocal(STORAGE_KEYS.cart, { items: state.items, storeId: state.storeId });
}

/** Firma de una línea: producto + extras + nota. Permite sumar líneas idénticas. */
function signatureOf(input: AddToCartInput): string {
  const extras = input.extras
    .map((extra) => extra.id)
    .sort()
    .join('|');
  return `${input.product.id}::${extras}::${input.note.trim().toLowerCase()}`;
}

function signatureOfItem(item: CartItem): string {
  const extras = item.extras
    .map((extra) => extra.id)
    .sort()
    .join('|');
  return `${item.productId}::${extras}::${item.note.trim().toLowerCase()}`;
}

export const useCartStore = create<CartState>((set, get) => ({
  ...load(),

  addItem(input, options) {
    const { items, storeId } = get();
    const differentStore = storeId !== null && storeId !== input.product.storeId;
    if (differentStore && !options?.replaceStore) return false;

    const base = differentStore ? [] : items;
    const signature = signatureOf(input);
    const existing = base.find((item) => signatureOfItem(item) === signature);

    const nextItems = existing
      ? base.map((item) =>
          item.lineId === existing.lineId
            ? { ...item, quantity: item.quantity + input.quantity }
            : item,
        )
      : [
          ...base,
          {
            lineId: createId('line'),
            productId: input.product.id,
            storeId: input.product.storeId,
            name: input.product.name,
            unitPrice: input.product.price,
            quantity: input.quantity,
            extras: input.extras,
            note: input.note,
            image: input.product.image,
          },
        ];

    const next = { items: nextItems, storeId: input.product.storeId };
    persist(next);
    set(next);
    return true;
  },

  increment(lineId) {
    const items = get().items.map((item) =>
      item.lineId === lineId ? { ...item, quantity: item.quantity + 1 } : item,
    );
    const next = { items, storeId: get().storeId };
    persist(next);
    set(next);
  },

  decrement(lineId) {
    const items = get()
      .items.map((item) =>
        item.lineId === lineId ? { ...item, quantity: item.quantity - 1 } : item,
      )
      .filter((item) => item.quantity > 0);
    const next = { items, storeId: items.length > 0 ? get().storeId : null };
    persist(next);
    set(next);
  },

  removeItem(lineId) {
    const items = get().items.filter((item) => item.lineId !== lineId);
    const next = { items, storeId: items.length > 0 ? get().storeId : null };
    persist(next);
    set(next);
  },

  clear() {
    const next = { items: [], storeId: null };
    persist(next);
    set(next);
  },
}));

export function lineTotal(item: CartItem): number {
  const extras = item.extras.reduce((sum, extra) => sum + extra.price, 0);
  return (item.unitPrice + extras) * item.quantity;
}

export interface CartTotals {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  count: number;
  freeDelivery: boolean;
}

/** Cálculo único de totales; lo usan carrito, checkout y pedidos. */
export function cartTotals(
  items: CartItem[],
  store: Store | undefined,
  freeDeliveryThreshold: number,
  discount = 0,
): CartTotals {
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const baseFee = store?.deliveryFee ?? 0;
  const freeDelivery = subtotal >= freeDeliveryThreshold && (store?.isLocal ?? false);
  const deliveryFee = items.length === 0 || freeDelivery ? 0 : baseFee;
  const total = Math.max(0, subtotal + deliveryFee - discount);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    deliveryFee: Math.round(deliveryFee * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    total: Math.round(total * 100) / 100,
    count,
    freeDelivery,
  };
}
