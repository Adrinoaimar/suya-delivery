import { useMemo, useState } from 'react';
import { ArrowRight, Heart, Sparkles, Store as StoreIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ButtonLink } from '@/components/common/Button';
import { SectionHeader } from '@/components/common/Card';
import { Logo } from '@/components/common/Logo';
import { SearchInput } from '@/components/common/SearchInput';
import { CategoryRail } from '@/components/marketplace/CategoryRail';
import { PromoCard } from '@/components/marketplace/PromoCard';
import { StoreCard } from '@/components/marketplace/StoreCard';
import { MapProvider } from '@/components/map/MapProvider';
import { categories, demoRoute, promotions } from '@/data';
import { storeService } from '@/lib/services';
import { useUserStore } from '@/store/userStore';
import { isOpenNow } from '@/utils/schedule';

export default function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const pushSearch = useUserStore((state) => state.pushSearch);
  const favorites = useUserStore((state) => state.favorites);

  const stores = useMemo(() => storeService.listStores(), []);
  const featured = stores.filter((store) => store.isFeatured);
  const locals = stores.filter((store) => store.isLocal);
  const recommended = [...stores].sort((a, b) => b.rating - a.rating).slice(0, 4);
  const favoriteStores = stores.filter((store) => favorites.includes(store.id));
  const mainPromo = promotions[0]!;

  function submitSearch() {
    const term = query.trim();
    if (term.length === 0) {
      navigate('/search');
      return;
    }
    pushSearch(term);
    navigate(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <div className="pb-8">
      {/* Hero de escritorio */}
      <section className="hidden bg-white lg:block">
        <div className="shell grid grid-cols-2 items-center gap-10 py-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-suya-lime-soft px-3 py-1 text-xs font-semibold text-suya-green-dark">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Hecho para Sullana
            </span>
            <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05]">
              Todo lo que necesitas,
              <br />
              de tu ciudad a tu puerta.
            </h1>
            <p className="mt-4 max-w-md text-lg text-[#4A4F55]">
              Restaurantes, tiendas y negocios de Sullana en un solo lugar.
            </p>
            <div className="mt-7 flex gap-3">
              <ButtonLink to="/search" size="lg">
                Pedir ahora
              </ButtonLink>
              <ButtonLink to="/stores" size="lg" variant="secondary">
                Ver tiendas
              </ButtonLink>
            </div>
            <dl className="mt-9 flex gap-8">
              <div>
                <dt className="text-sm text-[#6B7076]">Negocios</dt>
                <dd className="font-display text-2xl font-bold">{stores.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-[#6B7076]">Entrega promedio</dt>
                <dd className="font-display text-2xl font-bold">28 min</dd>
              </div>
              <div>
                <dt className="text-sm text-[#6B7076]">Cobertura</dt>
                <dd className="font-display text-2xl font-bold">Sullana</dd>
              </div>
            </dl>
          </div>

          {/* Composición: mapa + teléfono + repartidor */}
          <div className="relative h-[380px]">
            <div className="absolute inset-0 overflow-hidden rounded-promo border border-suya-mist bg-suya-ivory shadow-soft">
              <MapProvider
                points={demoRoute.points}
                origin={demoRoute.origin}
                destination={demoRoute.destination}
                rider={demoRoute.points[7]}
                label="Mapa ilustrativo de una entrega en Sullana"
              />
            </div>
            <div className="absolute -bottom-2 right-6 w-[212px] overflow-hidden rounded-[26px] border-[7px] border-suya-carbon bg-white shadow-soft">
              <div className="bg-suya-green px-3 py-2.5 text-white">
                <Logo size="sm" tone="onDark" />
              </div>
              <div className="space-y-2 p-3">
                <div className="rounded-btn bg-suya-lime-soft px-2.5 py-2">
                  <p className="text-[11px] font-semibold text-suya-green-dark">En camino</p>
                  <p className="text-[11px] text-[#4A4F55]">Llega en 12–18 min</p>
                </div>
                <div className="h-2 w-4/5 rounded-full bg-suya-mist" />
                <div className="h-2 w-3/5 rounded-full bg-suya-mist" />
                <div className="flex items-center gap-2 rounded-btn border border-suya-mist p-2">
                  <span className="h-7 w-7 rounded-full bg-suya-sun" aria-hidden="true" />
                  <div className="flex-1 space-y-1">
                    <div className="h-1.5 w-3/4 rounded-full bg-suya-mist" />
                    <div className="h-1.5 w-1/2 rounded-full bg-suya-mist" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="shell space-y-8 pt-4 lg:pt-10">
        {/* Buscador móvil */}
        <section className="lg:hidden">
          <h1 className="sr-only">Suya Delivery — Sullana</h1>
          <SearchInput value={query} onChange={setQuery} onSubmit={submitSearch} />
        </section>

        <section>
          <SectionHeader title="¿Qué necesitas hoy?" />
          <CategoryRail categories={categories} />
        </section>

        <section>
          <PromoCard promotion={mainPromo} size="lg" className="w-full" />
        </section>

        {favoriteStores.length > 0 && (
          <section>
            <SectionHeader
              title="Tus favoritos"
              action={
                <Link
                  to="/stores"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-suya-green"
                >
                  Ver todo <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {favoriteStores.slice(0, 4).map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader
            title="Tiendas destacadas"
            subtitle="Los favoritos de Sullana esta semana"
            action={
              <Link
                to="/stores"
                className="inline-flex items-center gap-1 text-sm font-semibold text-suya-green"
              >
                Ver todo <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="Promociones" subtitle="Cupones y beneficios de demostración" />
          <div className="hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
            {promotions.slice(1).map((promotion) => (
              <PromoCard key={promotion.id} promotion={promotion} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeader
            title="Negocios locales"
            subtitle="Emprendimientos sullaneros en la plataforma"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {locals.map((store) => (
              <StoreCard key={store.id} store={store} layout="row" />
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="Recomendados para ti" subtitle="Mejor calificados y abiertos ahora" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recommended
              .filter((store) => isOpenNow(store.schedule))
              .map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
          </div>
        </section>

        {/* Banner editorial */}
        <section className="overflow-hidden rounded-promo bg-suya-green px-5 py-7 text-white sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-lg">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                Compra cerca, recibe rápido
              </span>
              <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
                Apoyamos a los negocios de Sullana
              </h2>
              <p className="mt-2 text-white/85">
                Cada pedido en un comercio local se queda en la ciudad. Suya Delivery conecta a las
                tiendas de tu barrio con tu puerta.
              </p>
            </div>
            <ButtonLink to="/stores" variant="sun" size="lg" className="shrink-0">
              <StoreIcon className="h-4 w-4" aria-hidden="true" />
              Explorar negocios
            </ButtonLink>
          </div>
        </section>
      </div>
    </div>
  );
}
