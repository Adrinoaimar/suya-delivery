import { beforeEach, describe, expect, it } from 'vitest';
import { cartTotals, lineTotal, useCartStore } from '@/store/cartStore';
import { products, stores } from '@/data';
import type { Product } from '@/types';

const pollo = products.find((product) => product.id === 'bs-1') as Product;
const chicha = products.find((product) => product.id === 'bs-5') as Product;
const pizza = products.find((product) => product.id === 'dp-1') as Product;
const elBuenSabor = stores.find((store) => store.id === 'el-buen-sabor')!;

describe('carrito', () => {
  beforeEach(() => {
    useCartStore.getState().clear();
  });

  it('agrega un producto y guarda el negocio', () => {
    useCartStore.getState().addItem({ product: pollo, quantity: 1, extras: [], note: '' });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.storeId).toBe('el-buen-sabor');
    expect(state.items[0]!.quantity).toBe(1);
  });

  it('suma cantidades cuando el producto y los extras coinciden', () => {
    const add = useCartStore.getState().addItem;
    add({ product: pollo, quantity: 1, extras: [], note: '' });
    add({ product: pollo, quantity: 2, extras: [], note: '' });

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]!.quantity).toBe(3);
  });

  it('crea una línea distinta cuando cambian los extras', () => {
    const add = useCartStore.getState().addItem;
    add({ product: pollo, quantity: 1, extras: [], note: '' });
    add({ product: pollo, quantity: 1, extras: [pollo.extras[0]!], note: '' });

    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('rechaza productos de otro negocio salvo que se reemplace el carrito', () => {
    const add = useCartStore.getState().addItem;
    add({ product: pollo, quantity: 1, extras: [], note: '' });

    expect(add({ product: pizza, quantity: 1, extras: [], note: '' })).toBe(false);
    expect(useCartStore.getState().items).toHaveLength(1);

    expect(add({ product: pizza, quantity: 1, extras: [], note: '' }, { replaceStore: true })).toBe(
      true,
    );
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().storeId).toBe('don-pizza');
  });

  it('quita la línea al disminuir por debajo de uno', () => {
    const store = useCartStore.getState();
    store.addItem({ product: chicha, quantity: 1, extras: [], note: '' });
    const lineId = useCartStore.getState().items[0]!.lineId;

    useCartStore.getState().decrement(lineId);

    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().storeId).toBeNull();
  });

  it('elimina una línea concreta', () => {
    const add = useCartStore.getState().addItem;
    add({ product: pollo, quantity: 1, extras: [], note: '' });
    add({ product: chicha, quantity: 1, extras: [], note: '' });
    const lineId = useCartStore.getState().items[0]!.lineId;

    useCartStore.getState().removeItem(lineId);

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]!.productId).toBe('bs-5');
  });

  it('calcula el total de una línea con extras', () => {
    const total = lineTotal({
      lineId: 'l1',
      productId: pollo.id,
      storeId: pollo.storeId,
      name: pollo.name,
      unitPrice: 10,
      quantity: 2,
      extras: [{ id: 'x', label: 'Extra', price: 2.5 }],
      note: '',
      image: null,
    });

    expect(total).toBe(25);
  });

  it('cobra el envío bajo el mínimo y lo libera al superarlo en negocios locales', () => {
    const add = useCartStore.getState().addItem;
    add({ product: chicha, quantity: 1, extras: [], note: '' });

    const small = cartTotals(useCartStore.getState().items, elBuenSabor, 20);
    expect(small.subtotal).toBeCloseTo(9.9, 2);
    expect(small.deliveryFee).toBe(elBuenSabor.deliveryFee);
    expect(small.total).toBeCloseTo(13.9, 2);

    add({ product: pollo, quantity: 1, extras: [], note: '' });
    const big = cartTotals(useCartStore.getState().items, elBuenSabor, 20);
    expect(big.freeDelivery).toBe(true);
    expect(big.deliveryFee).toBe(0);
    expect(big.count).toBe(2);
    expect(big.total).toBeCloseTo(69.8, 2);
  });

  it('aplica descuentos sin dejar el total en negativo', () => {
    useCartStore.getState().addItem({ product: chicha, quantity: 1, extras: [], note: '' });
    const totals = cartTotals(useCartStore.getState().items, elBuenSabor, 20, 500);
    expect(totals.total).toBe(0);
  });
});
