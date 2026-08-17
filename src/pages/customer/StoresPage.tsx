import { useMemo, useState } from 'react';
import { SlidersHorizontal, Store as StoreIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ButtonLink } from '@/components/common/Button';
import { Chip } from '@/components/common/Chip';
import { EmptyState } from '@/components/common/EmptyState';
import { SectionHeader } from '@/components/common/Card';
import { StoreCard } from '@/components/marketplace/StoreCard';
import { categories } from '@/data';
import { storeService } from '@/lib/services';
import { isOpenNow } from '@/utils/schedule';

type SortKey = 'recomendado' | 'tiempo' | 'rating' | 'envio';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recomendado', label: 'Recomendado' },
  { key: 'tiempo', label: 'Más rápido' },
  { key: 'rating', label: 'Mejor calificado' },
  { key: 'envio', label: 'Menor envío' },
];

export default function StoresPage() {
  const [params, setParams] = useSearchParams();
  const activeCategory = params.get('categoria');
  const [sort, setSort] = useState<SortKey>('recomendado');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyLocal, setOnlyLocal] = useState(false);

  const stores = useMemo(() => {
    let list = storeService.listStores();
    if (activeCategory) list = list.filter((store) => store.categoryId === activeCategory);
    if (onlyOpen) list = list.filter((store) => isOpenNow(store.schedule));
    if (onlyLocal) list = list.filter((store) => store.isLocal);

    const sorted = [...list];
    if (sort === 'tiempo') sorted.sort((a, b) => a.etaMin - b.etaMin);
    if (sort === 'rating') sorted.sort((a, b) => b.rating - a.rating);
    if (sort === 'envio') sorted.sort((a, b) => a.deliveryFee - b.deliveryFee);
    if (sort === 'recomendado') {
      sorted.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.rating - a.rating);
    }
    return sorted;
  }, [activeCategory, onlyOpen, onlyLocal, sort]);

  function selectCategory(id: string | null) {
    const next = new URLSearchParams(params);
    if (id === null) next.delete('categoria');
    else next.set('categoria', id);
    setParams(next, { replace: true });
  }

  const categoryName = categories.find((category) => category.id === activeCategory)?.name;

  return (
    <div className="shell space-y-5 py-4 lg:py-8">
      <SectionHeader
        title={categoryName ?? 'Todas las tiendas'}
        subtitle={`${stores.length} ${stores.length === 1 ? 'negocio' : 'negocios'} en Sullana`}
      />

      <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={activeCategory === null} onClick={() => selectCategory(null)}>
          Todas
        </Chip>
        {categories.map((category) => (
          <Chip
            key={category.id}
            active={activeCategory === category.id}
            onClick={() => selectCategory(category.id)}
          >
            {category.name}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6B7076]">
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          Ordenar
        </span>
        {SORTS.map((option) => (
          <Chip key={option.key} active={sort === option.key} onClick={() => setSort(option.key)}>
            {option.label}
          </Chip>
        ))}
        <Chip active={onlyOpen} onClick={() => setOnlyOpen((value) => !value)}>
          Abierto ahora
        </Chip>
        <Chip active={onlyLocal} onClick={() => setOnlyLocal((value) => !value)}>
          Solo locales
        </Chip>
      </div>

      {stores.length === 0 ? (
        <EmptyState
          icon={<StoreIcon className="h-6 w-6" />}
          title="No encontramos negocios con esos filtros"
          description="Prueba quitando algún filtro o revisa otra categoría."
          action={<ButtonLink to="/stores">Ver todas las tiendas</ButtonLink>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>
      )}
    </div>
  );
}
