import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseStoreServiceImpl } from '@/lib/services/SupabaseStoreService';

/**
 * Cliente Supabase falso y determinista: sin red, sin credenciales.
 * Registra los filtros `eq` aplicados y responde desde datos en memoria.
 */

interface PostgrestError {
  message: string;
  code: string;
}

type Row = Record<string, unknown>;
type Filter = readonly [string, unknown];
interface FakeResponse {
  data: unknown;
  error: PostgrestError | null;
}
type TableHandler = (filters: Filter[]) => FakeResponse;

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((row) => filters.every(([field, value]) => row[field] === value));
}

class FakeQueryBuilder implements PromiseLike<FakeResponse> {
  private readonly filters: Filter[] = [];
  private readonly handler: TableHandler;

  constructor(handler: TableHandler) {
    this.handler = handler;
  }

  select(_columns: string): this {
    return this;
  }

  eq(field: string, value: unknown): this {
    this.filters.push([field, value] as const);
    return this;
  }

  order(_column: string): this {
    return this;
  }

  maybeSingle(): Promise<FakeResponse> {
    const { data, error } = this.handler(this.filters);
    const row = Array.isArray(data) ? (data[0] ?? null) : data;
    return Promise.resolve({ data: row, error });
  }

  then<TResult1 = FakeResponse, TResult2 = never>(
    onfulfilled?: ((value: FakeResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.handler(this.filters)).then(onfulfilled, onrejected);
  }
}

function createFakeSupabase(tables: Record<string, TableHandler>): {
  client: SupabaseClient;
  calls: string[];
} {
  const calls: string[] = [];
  const client = {
    from(table: string): FakeQueryBuilder {
      calls.push(table);
      const handler = tables[table];
      if (!handler) throw new Error(`Tabla no registrada en el cliente falso: ${table}`);
      return new FakeQueryBuilder(handler);
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const restaurantRow: Row = {
  id: 'r1',
  category_id: 'c1',
  name: 'Suya Grill',
  description: 'Parrillas y anticuchos al carbón',
  phone: null,
  address: 'Av. Sullana 123, Sullana',
  latitude: -4.9039,
  longitude: -80.6853,
  delivery_fee: '4.50',
  minimum_order: 15,
  eta_min_minutes: 20,
  eta_max_minutes: 35,
  schedule: { opens: '11:00', closes: '23:00' },
  theme: { primary: '#0E6B44', accent: '#8CC63F', surface: '#FAF7F1', onPrimary: '#FFFFFF' },
  image_url: 'https://img.example/local.jpg',
  logo_url: null,
  gallery: [
    { src: 'https://img.example/1.jpg', caption: 'Vista del local' },
    { src: '', caption: 'Sin fuente' },
    { src: 'https://img.example/2.jpg' },
    'entrada-invalida',
  ],
  tags: ['Norteño'],
  rating: null,
  review_count: null,
  featured: true,
  local_business: true,
  accepting_orders: true,
  data_note: 'Carta confirmada por el negocio.',
  promo_label: null,
  categories: { slug: 'parrillas', name: 'Parrillas' },
  active: true,
};

const productRow: Row = {
  id: 'p1',
  restaurant_id: 'r1',
  section: 'Anticuchos',
  name: 'Anticucho de corazón',
  description: 'Con ají panca y papa dorada',
  price: '12.90',
  image_url: null,
  image_is_stock: false,
  popular: true,
  extras: [
    { id: 'e1', label: 'Extra ají', price: '1.50' },
    { id: 'e2', label: 'Porción de cancha', price: 0 },
    { id: 'e3', label: 'Precio negativo', price: -1 },
    { id: '', label: 'Sin identificador', price: 1 },
    { label: 'Sin id', price: 1 },
    { id: 'e4', label: 'Sin precio' },
  ],
  sort_order: 1,
  active: true,
};

const otherRestaurantProduct: Row = {
  ...productRow,
  id: 'p9',
  restaurant_id: 'r2',
  section: 'Postres',
  name: 'King Kong',
  description: 'Dulce de manjarblanco',
  sort_order: 2,
};

function makeService(overrides: {
  categories?: TableHandler;
  restaurants?: TableHandler;
  products?: TableHandler;
}): { service: SupabaseStoreServiceImpl; calls: string[] } {
  const { client, calls } = createFakeSupabase({
    categories:
      overrides.categories ??
      ((filters) => ({
        data: applyFilters(
          [{ slug: 'parrillas', name: 'Parrillas', icon: 'utensils', accent: 'sun', sort_order: 1, active: true }],
          filters,
        ),
        error: null,
      })),
    restaurants:
      overrides.restaurants ??
      ((filters) => ({ data: applyFilters([restaurantRow], filters), error: null })),
    products:
      overrides.products ??
      ((filters) => ({
        data: applyFilters([productRow, otherRestaurantProduct], filters),
        error: null,
      })),
  });
  return { service: new SupabaseStoreServiceImpl(client), calls };
}

describe('SupabaseStoreService', () => {
  it('lista categorías activas con slug como id', async () => {
    const { service } = makeService({});

    await expect(service.listCategories()).resolves.toEqual([
      { id: 'parrillas', name: 'Parrillas', icon: 'utensils', accent: 'sun' },
    ]);
  });

  it('mapea negocio con categoría, montos, horario, tema y galería', async () => {
    const { service } = makeService({});

    const stores = await service.listStores();

    expect(stores).toHaveLength(1);
    const store = stores[0]!;
    expect(store).toMatchObject({
      id: 'r1',
      name: 'Suya Grill',
      categoryId: 'parrillas',
      deliveryFee: 4.5,
      minOrder: 15,
      etaMin: 20,
      etaMax: 35,
      rating: 0,
      reviews: 0,
      isFeatured: true,
      isLocal: true,
      acceptingOrders: true,
      dataNote: 'Carta confirmada por el negocio.',
      phone: '',
      address: 'Av. Sullana 123, Sullana',
      image: 'https://img.example/local.jpg',
      logo: null,
      schedule: { opens: '11:00', closes: '23:00' },
      theme: {
        primary: '#0E6B44',
        accent: '#8CC63F',
        surface: '#FAF7F1',
        onPrimary: '#FFFFFF',
      },
    });
    expect(store.tags.slice(0, 2)).toEqual(['Parrillas', 'Norteño']);
    expect(store.sections).toEqual(['Anticuchos']);
    expect(store.tags).toContain('Anticuchos');
    // Galería: solo entradas con src y caption válidos.
    expect(store.gallery).toEqual([
      { src: 'https://img.example/1.jpg', caption: 'Vista del local' },
    ]);
  });

  it('trata horario sin publicar como cerrado y tema incompleto como ausente', async () => {
    const draft: Row = {
      ...restaurantRow,
      id: 'r3',
      schedule: null,
      theme: { primary: '#0E6B44', accent: '#8CC63F' },
      gallery: null,
    };
    const { service } = makeService({
      restaurants: (filters) => ({ data: applyFilters([draft], filters), error: null }),
      products: () => ({ data: [], error: null }),
    });

    const store = await service.getStore('r3');

    expect(store?.schedule).toEqual({ opens: '00:00', closes: '00:00' });
    expect(store?.theme).toBeUndefined();
    expect(store?.gallery).toEqual([]);
    expect(store?.sections).toEqual([]);
  });

  it('mapea productos convirtiendo montos y descartando extras inválidos', async () => {
    const seen: Filter[][] = [];
    const { service } = makeService({
      products: (filters) => {
        seen.push(filters);
        return { data: applyFilters([productRow, otherRestaurantProduct], filters), error: null };
      },
    });

    const products = await service.listProducts('r1');

    expect(seen[0]).toContainEqual(['active', true]);
    expect(seen[0]).toContainEqual(['restaurant_id', 'r1']);
    expect(products).toHaveLength(1);
    expect(products[0]).toEqual({
      id: 'p1',
      storeId: 'r1',
      section: 'Anticuchos',
      name: 'Anticucho de corazón',
      description: 'Con ají panca y papa dorada',
      price: 12.9,
      image: null,
      imageIsStock: false,
      popular: true,
      extras: [
        { id: 'e1', label: 'Extra ají', price: 1.5 },
        { id: 'e2', label: 'Porción de cancha', price: 0 },
      ],
    });
  });

  it('getStore filtra por id y combina las secciones de sus productos', async () => {
    const seen: Filter[][] = [];
    const { service } = makeService({
      restaurants: (filters) => {
        seen.push(filters);
        return { data: applyFilters([restaurantRow], filters), error: null };
      },
    });

    const store = await service.getStore('r1');

    expect(seen[0]).toContainEqual(['id', 'r1']);
    expect(store?.id).toBe('r1');
    expect(store?.sections).toEqual(['Anticuchos']);
  });

  it('búsqueda normalizada ignora acentos y mayúsculas en productos y negocios', async () => {
    const { service } = makeService({});

    const byProduct = await service.search('  AJI  ');
    expect(byProduct.products.map((product) => product.id)).toEqual(['p1']);
    expect(byProduct.stores).toEqual([]);

    const byStoreTag = await service.search('PARRILLAS');
    expect(byStoreTag.stores.map((store) => store.id)).toEqual(['r1']);

    const byName = await service.search('corazon');
    expect(byName.products.map((product) => product.id)).toEqual(['p1']);

    const noMatch = await service.search('cebiche');
    expect(noMatch).toEqual({ stores: [], products: [] });
  });

  it('búsqueda vacía no consulta la base de datos', async () => {
    const { service, calls } = makeService({});

    const result = await service.search('   ');

    expect(result).toEqual({ stores: [], products: [] });
    expect(calls).toEqual([]);
  });

  it('propaga errores de PostgREST al listar negocios', async () => {
    const postgrestError: PostgrestError = {
      message: 'permission denied for table restaurants',
      code: '42501',
    };
    const { service } = makeService({
      restaurants: () => ({ data: null, error: postgrestError }),
    });

    await expect(service.listStores()).rejects.toMatchObject({ code: '42501' });
  });

  it('propaga errores de PostgREST al obtener un producto', async () => {
    const { service } = makeService({
      products: () => ({ data: null, error: { message: 'connection error', code: '08006' } }),
    });

    await expect(service.getProduct('p1')).rejects.toMatchObject({ code: '08006' });
  });

  it('devuelve undefined cuando el negocio o producto no existe', async () => {
    const { service } = makeService({});

    await expect(service.getStore('no-existe')).resolves.toBeUndefined();
    await expect(service.getProduct('no-existe')).resolves.toBeUndefined();
  });

  it('rechaza montos inválidos con un mensaje claro', async () => {
    const broken: Row = { ...restaurantRow, delivery_fee: 'no-es-numero' };
    const { service } = makeService({
      restaurants: (filters) => ({ data: applyFilters([broken], filters), error: null }),
    });

    await expect(service.listStores()).rejects.toThrow('Supabase devolvió un monto inválido.');
  });
});
