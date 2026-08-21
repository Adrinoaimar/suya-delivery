import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { normalize } from '@/utils/format';
import type { Accent, Category, Product, ProductExtra, Schedule, Store } from '@/types';
import type { StoreService } from './types';

type JsonObject = Record<string, unknown>;

interface RestaurantRow {
  id: string;
  category_id: string;
  name: string;
  description: string;
  phone: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  delivery_fee: number | string;
  minimum_order: number | string;
  eta_min_minutes: number;
  eta_max_minutes: number;
  schedule: unknown;
  theme: unknown;
  image_url: string | null;
  logo_url: string | null;
  gallery: unknown;
  tags: string[];
  rating: number | string | null;
  review_count: number | null;
  featured: boolean;
  local_business: boolean;
  accepting_orders: boolean;
  data_note: string | null;
  promo_label: string | null;
  categories: { slug: string; name: string } | { slug: string; name: string }[];
}

interface ProductRow {
  id: string;
  restaurant_id: string;
  section: string;
  name: string;
  description: string;
  price: number | string;
  image_url: string | null;
  image_is_stock: boolean;
  popular: boolean;
  extras: unknown;
  sort_order: number;
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function number(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Supabase devolvió un monto inválido.');
  return parsed;
}

function mapSchedule(value: unknown): Schedule {
  const row = object(value);
  const opens = text(row?.opens);
  const closes = text(row?.closes);
  if (opens && closes) return { opens, closes };
  // Horario aún no publicado: 00:00/00:00 hace que la interfaz lo trate como cerrado.
  return { opens: '00:00', closes: '00:00' };
}

function mapTheme(value: unknown): Store['theme'] {
  const row = object(value);
  const primary = text(row?.primary);
  const accent = text(row?.accent);
  const surface = text(row?.surface);
  const onPrimary = text(row?.onPrimary);
  return primary && accent && surface && onPrimary
    ? { primary, accent, surface, onPrimary }
    : undefined;
}

function mapGallery(value: unknown): Store['gallery'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = object(entry);
    const src = text(row?.src);
    const caption = text(row?.caption);
    return src && caption ? [{ src, caption }] : [];
  });
}

function mapExtras(value: unknown): ProductExtra[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = object(entry);
    const id = text(row?.id);
    const label = text(row?.label);
    const priceValue = row?.price;
    if (!id || !label || (typeof priceValue !== 'number' && typeof priceValue !== 'string')) return [];
    const price = number(priceValue);
    return price >= 0 ? [{ id, label, price }] : [];
  });
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    storeId: row.restaurant_id,
    section: row.section,
    name: row.name,
    description: row.description,
    price: number(row.price),
    image: row.image_url,
    imageIsStock: row.image_is_stock,
    popular: row.popular,
    extras: mapExtras(row.extras),
  };
}

function categoryOf(row: RestaurantRow): { slug: string; name: string } {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  if (!category) throw new Error('El negocio no tiene una categoría válida.');
  return category;
}

function mapStore(row: RestaurantRow, sections: string[]): Store {
  const category = categoryOf(row);
  const verifiedTags = Array.isArray(row.tags) ? row.tags.filter((tag) => text(tag)) : [];
  return {
    id: row.id,
    name: row.name,
    categoryId: category.slug,
    tags: [...new Set([category.name, ...verifiedTags, ...sections])].slice(0, 4),
    description: row.description,
    rating: row.rating === null ? 0 : number(row.rating),
    reviews: row.review_count ?? 0,
    etaMin: row.eta_min_minutes,
    etaMax: row.eta_max_minutes,
    deliveryFee: number(row.delivery_fee),
    minOrder: number(row.minimum_order),
    distanceKm: 0,
    isLocal: row.local_business,
    isFeatured: row.featured,
    acceptingOrders: row.accepting_orders,
    isRealBrand: true,
    dataNote: row.data_note ?? undefined,
    promoLabel: row.promo_label,
    schedule: mapSchedule(row.schedule),
    address: row.address,
    phone: row.phone ?? '',
    image: row.image_url,
    logo: row.logo_url,
    theme: mapTheme(row.theme),
    gallery: mapGallery(row.gallery),
    sections,
  };
}

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado para Suya Delivery.');
  return supabase;
}

export class SupabaseStoreServiceImpl implements StoreService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  async listCategories(): Promise<Category[]> {
    const { data, error } = await this.client
      .from('categories')
      .select('slug, name, icon, accent, sort_order')
      .eq('active', true)
      .order('sort_order')
      .order('name');
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.slug as string,
      name: row.name as string,
      icon: row.icon as string,
      accent: (['green', 'lime', 'sun'].includes(row.accent as string)
        ? row.accent
        : 'green') as Accent,
    }));
  }

  private async restaurantRows(id?: string): Promise<RestaurantRow[]> {
    let query = this.client
      .from('restaurants')
      .select(
        'id, category_id, name, description, phone, address, latitude, longitude, delivery_fee, minimum_order, eta_min_minutes, eta_max_minutes, schedule, theme, image_url, logo_url, gallery, tags, rating, review_count, featured, local_business, accepting_orders, data_note, promo_label, categories!inner(slug, name)',
      )
      .eq('active', true);
    if (id) query = query.eq('id', id);
    const { data, error } = await query.order('name');
    if (error) throw error;
    return (data ?? []) as unknown as RestaurantRow[];
  }

  private async productRows(restaurantId?: string): Promise<ProductRow[]> {
    let query = this.client
      .from('products')
      .select(
        'id, restaurant_id, section, name, description, price, image_url, image_is_stock, popular, extras, sort_order',
      )
      .eq('active', true);
    if (restaurantId) query = query.eq('restaurant_id', restaurantId);
    const { data, error } = await query.order('sort_order').order('name');
    if (error) throw error;
    return (data ?? []) as unknown as ProductRow[];
  }

  async listStores(): Promise<Store[]> {
    const [restaurants, products] = await Promise.all([
      this.restaurantRows(),
      this.productRows(),
    ]);
    return restaurants.map((restaurant) => {
      const sections = [...new Set(
        products
          .filter((product) => product.restaurant_id === restaurant.id)
          .map((product) => product.section),
      )];
      return mapStore(restaurant, sections);
    });
  }

  async getStore(id: string): Promise<Store | undefined> {
    const [restaurant, products] = await Promise.all([
      this.restaurantRows(id).then((rows) => rows[0]),
      this.productRows(id),
    ]);
    return restaurant ? mapStore(restaurant, [...new Set(products.map((row) => row.section))]) : undefined;
  }

  async listProducts(storeId: string): Promise<Product[]> {
    return (await this.productRows(storeId)).map(mapProduct);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const { data, error } = await this.client
      .from('products')
      .select(
        'id, restaurant_id, section, name, description, price, image_url, image_is_stock, popular, extras, sort_order',
      )
      .eq('active', true)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapProduct(data as unknown as ProductRow) : undefined;
  }

  async search(query: string): Promise<{ stores: Store[]; products: Product[] }> {
    const term = normalize(query).trim();
    if (!term) return { stores: [], products: [] };
    const [stores, productRows] = await Promise.all([this.listStores(), this.productRows()]);
    const products = productRows.map(mapProduct);
    return {
      stores: stores.filter((store) =>
        normalize([store.name, store.description, ...store.tags].join(' ')).includes(term),
      ),
      products: products.filter((product) =>
        normalize(`${product.name} ${product.description} ${product.section}`).includes(term),
      ),
    };
  }
}
