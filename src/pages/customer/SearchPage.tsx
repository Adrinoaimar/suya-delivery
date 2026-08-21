import { useEffect, useState } from 'react';
import { Clock, Search as SearchIcon, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { SearchInput } from '@/components/common/SearchInput';
import { SectionHeader } from '@/components/common/Card';
import { Price } from '@/components/common/Price';
import { ProductRowSkeleton } from '@/components/common/Skeleton';
import { Thumb } from '@/components/common/Thumb';
import { StoreCard } from '@/components/marketplace/StoreCard';
import { Chip } from '@/components/common/Chip';
import { useCatalogStore } from '@/store/catalogStore';
import { useUserStore } from '@/store/userStore';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const recentSearches = useUserStore((state) => state.recentSearches);
  const pushSearch = useUserStore((state) => state.pushSearch);
  const clearSearches = useUserStore((state) => state.clearSearches);

  const results = useCatalogStore((state) => state.searchResults);
  const categories = useCatalogStore((state) => state.categories);
  const searchStatus = useCatalogStore((state) => state.searchStatus);
  const searchError = useCatalogStore((state) => state.searchError);
  const search = useCatalogStore((state) => state.search);
  const catalogStores = useCatalogStore((state) => state.stores);
  const loadStores = useCatalogStore((state) => state.loadStores);
  const loadCategories = useCatalogStore((state) => state.loadCategories);

  useEffect(() => {
    setQuery(initial);
  }, [initial]);

  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    void loadStores();
    void loadCategories();
  }, [loadStores, loadCategories]);

  useEffect(() => {
    if (!hasQuery) return;
    void search(query);
  }, [query, hasQuery, search]);

  const searching = hasQuery && (searchStatus === 'idle' || searchStatus === 'loading');
  const searchReady = hasQuery && searchStatus === 'ready';

  function commit(term: string) {
    setQuery(term);
    const next = new URLSearchParams(params);
    if (term.trim().length === 0) next.delete('q');
    else next.set('q', term.trim());
    setParams(next, { replace: true });
    pushSearch(term);
  }

  return (
    <div className="shell space-y-6 py-4 lg:py-8">
      <div className="lg:max-w-xl">
        <h1 className="section-title mb-3">Buscar</h1>
        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={() => commit(query)}
          placeholder="Busca negocios o productos"
          autoFocus
        />
      </div>

      {!hasQuery && (
        <>
          {recentSearches.length > 0 && (
            <section>
              <SectionHeader
                title="Búsquedas recientes"
                action={
                  <button
                    type="button"
                    onClick={clearSearches}
                    className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7076] hover:text-suya-danger"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Borrar
                  </button>
                }
              />
              <ul className="flex flex-wrap gap-2">
                {recentSearches.map((term) => (
                  <li key={term}>
                    <Chip onClick={() => commit(term)}>
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      {term}
                    </Chip>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionHeader title="Explora por categoría" />
            <ul className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    to={`/stores?categoria=${category.id}`}
                    className="press inline-flex h-11 items-center rounded-full border border-suya-mist bg-white px-4 text-sm font-medium hover:border-suya-lime"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {hasQuery && searchError && (
        <ErrorState description={searchError} onRetry={() => void search(query)} />
      )}

      {searching && !searchError && (
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">Buscando…</span>
          {Array.from({ length: 3 }).map((_, index) => (
            <ProductRowSkeleton key={index} />
          ))}
        </div>
      )}

      {searchReady && results.stores.length === 0 && results.products.length === 0 && (
        <EmptyState
          icon={<SearchIcon className="h-6 w-6" />}
          title={`Sin resultados para «${query}»`}
          description="Revisa la escritura o busca por categoría."
        />
      )}

      {searchReady && results.stores.length > 0 && (
        <section>
          <SectionHeader title="Negocios" subtitle={`${results.stores.length} encontrados`} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {results.stores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        </section>
      )}

      {searchReady && results.products.length > 0 && (
        <section>
          <SectionHeader title="Productos" subtitle={`${results.products.length} encontrados`} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.products.slice(0, 24).map((product) => {
              const store = catalogStores.find((entry) => entry.id === product.storeId);
              return (
                <li key={product.id}>
                  <Link
                    to={`/store/${product.storeId}`}
                    className="press flex items-center gap-3 rounded-card border border-suya-mist bg-white p-3 hover:border-suya-lime"
                  >
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-suya-ivory">
                      <Thumb
                        name={product.name}
                        src={product.image}
                        variant="product"
                        rounded="rounded-xl"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] font-bold">
                        {product.name}
                      </span>
                      <span className="block truncate text-xs text-[#6B7076]">{store?.name}</span>
                    </span>
                    <Price value={product.price} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
