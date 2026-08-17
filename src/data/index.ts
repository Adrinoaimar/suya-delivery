/**
 * DEMO DATA — datos ficticios de Suya Delivery.
 *
 * Precios, horarios, calificaciones, promociones, repartidores y productos son inventados
 * para la demostración local. No representan información comercial oficial de ninguna empresa.
 * Para conectar datos reales, sustituir esta capa por `StoreService` / `OrderService` remotos.
 */
import type { Category, DemoRoute, Product, Promotion, Rider, Store } from '@/types';
import categoriesJson from './categories.json';
import storesJson from './stores.json';
import productsJson from './products.json';
import promotionsJson from './promotions.json';
import ridersJson from './riders.json';
import routeJson from './route.json';
import seedOrdersJson from './orders.json';

export const categories = categoriesJson as unknown as Category[];
export const stores = storesJson as unknown as Store[];
export const products = productsJson as unknown as Product[];
export const promotions = promotionsJson as unknown as Promotion[];
export const riders = ridersJson as unknown as Rider[];
export const demoRoute = routeJson as unknown as DemoRoute;

export interface SeedOrder {
  code: string;
  storeId: string;
  status: string;
  daysAgo: number;
  riderId: string | null;
  paymentMethod: string;
  discount: number;
  items: { productId: string; quantity: number }[];
}

export const seedOrders = seedOrdersJson as unknown as SeedOrder[];

export const CITY = 'Sullana, Perú';
export const FREE_DELIVERY_THRESHOLD = 20;
