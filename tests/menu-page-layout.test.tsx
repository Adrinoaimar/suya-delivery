import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from '@/pages/customer/MenuPage';
import { loadPublicMenu } from '@/lib/loadPublicMenu';
import { products, stores } from '@/data';
import { useCartStore } from '@/store/cartStore';

vi.mock('@/lib/loadPublicMenu', () => ({ loadPublicMenu: vi.fn() }));

describe('MenuPage', () => {
  const store = { ...stores.find((candidate) => candidate.id === 'don-pizza')!, isComingSoon: true };
  const product = products.find((candidate) => candidate.storeId === store.id)!;

  beforeEach(() => {
    useCartStore.setState({
      items: [],
      storeId: null,
      origin: 'delivery',
      menuSlug: null,
      offerCode: null,
    });
    vi.mocked(loadPublicMenu).mockResolvedValue({
      menu: {
        store,
        slug: 'pizzeria-don-pizza-menu',
        brand: {
          logoUrl: store.logo,
          heroImageUrl: null,
          primaryColor: '#D64045',
          accentColor: '#FFF1D6',
          fontFamily: 'Montserrat',
        },
      },
      products: products.filter((entry) => entry.storeId === store.id).slice(0, 1),
    });
  });

  it('mantiene visible la etiqueta pública junto al logo en móvil', async () => {
    render(
      <MemoryRouter initialEntries={['/menu/pizzeria-don-pizza-menu']}>
        <Routes>
          <Route path="/menu/:slug" element={<MenuPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const label = await screen.findByText('Menú público');
    expect(label).toHaveClass('right-4');
    expect(label).not.toHaveClass('left-4');
    expect(screen.getByRole('img', { name: 'Marca de Pizzería Don Pizza' })).toBeInTheDocument();
    expect(screen.getByText('Próximamente')).toBeInTheDocument();
  });

  it('conserva un carrito delivery al abrir el menú público', async () => {
    useCartStore.setState({
      items: [
        {
          lineId: 'delivery-line',
          productId: product.id,
          storeId: store.id,
          name: product.name,
          unitPrice: product.price,
          quantity: 1,
          extras: [],
          note: '',
          image: product.image,
        },
      ],
      storeId: store.id,
      origin: 'delivery',
      menuSlug: null,
      offerCode: null,
    });

    render(
      <MemoryRouter initialEntries={['/menu/pizzeria-don-pizza-menu']}>
        <Routes>
          <Route path="/menu/:slug" element={<MenuPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('Menú público');
    expect(useCartStore.getState().origin).toBe('delivery');
    expect(useCartStore.getState().menuSlug).toBeNull();
  });
});
