import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { StoreCard } from '@/components/marketplace/StoreCard';
import type { Store } from '@/types';

const store: Store = {
  id: 'anda-paya',
  name: 'Andá Paya',
  categoryId: 'restaurantes',
  tags: ['Comida norteña'],
  description: 'Cocina norteña.',
  rating: 0,
  reviews: 0,
  etaMin: 25,
  etaMax: 45,
  deliveryFee: 4,
  minOrder: 15,
  distanceKm: 1,
  isLocal: true,
  isFeatured: true,
  isRealBrand: true,
  isBeta: true,
  promoLabel: null,
  schedule: { opens: '10:00', closes: '21:00' },
  address: 'Sullana, Piura',
  phone: '',
  image: '/images/stores/anda-paya/menus/carta-2026-09-06.jpg',
  logo: '/brand/stores/anda-paya-logo.webp',
  sections: ['Ceviches'],
};

describe('StoreCard', () => {
  it('mantiene la portada y muestra el logo autorizado como distintivo', () => {
    render(
      <MemoryRouter>
        <StoreCard store={store} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'Logo de Andá Paya' })).toHaveAttribute(
      'src',
      '/brand/stores/anda-paya-logo.webp',
    );
  });

  it('usa el logo como visual principal cuando la ficha no tiene portada', () => {
    render(
      <MemoryRouter>
        <StoreCard store={{ ...store, id: 'kfc', name: 'KFC', image: null, logo: '/brand/stores/kfc-logo.png' }} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'KFC' })).toHaveAttribute(
      'src',
      '/brand/stores/kfc-logo.png',
    );
  });
});
