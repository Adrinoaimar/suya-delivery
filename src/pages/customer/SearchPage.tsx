import { useEffect, useMemo, useState } from 'react';
import { Clock, Search as SearchIcon, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { SearchInput } from '@/components/common/SearchInput';
import { SectionHeader } from '@/components/common/Card';
import { Price } from '@/components/common/Price';
import { Thumb } from '@/components/common/Thumb';
import { StoreCard } from '@/components/marketplace/StoreCard';
import { categories } from '@/data';
import { Chip } from '@/components/common/Chip';
import { storeService } from '@/lib/services';
import { useUserStore } from '@/store/userStore';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const recentSearches = useUserStore((state) => state.recentSearches);
  const pushSearch = useUserStore((state) => state.pushSearch);
  const clearSearches = useUserStore((state) => state.clearSearches);

  useEffect(() => {
    setQuery(initial);
  }, [initial]);

  const results = useMemo(() => storeService.search(query), [query]);
  const hasQuery = query.trim().length > 0;

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

      {hasQuery && results.stores.length === 0 && results.products.length === 0 && (
        <EmptyState
          icon={<SearchIcon className="h-6 w-6" />}
          title={`Sin resultados para «${query}»`}
          description="Revisa la escritura o busca por categoría."
        />
      )}

      {hasQuery && results.stores.length > 0 && (
        <section>
          <SectionHeader title="Negocios" subtitle={`${results.stores.length} encontrados`} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {results.stores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        </section>
      )}

      {hasQuery && results.products.length > 0 && (
        <section>
          <SectionHeader title="Productos" subtitle={`${results.products.length} encontrados`} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.products.slice(0, 24).map((product) => {
              const store = storeService.getStore(product.storeId);
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
