import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from '@/pages/customer/MenuPage';
import { loadPublicMenu } from '@/lib/loadPublicMenu';
import { products, stores } from '@/data';

vi.mock('@/lib/loadPublicMenu', () => ({ loadPublicMenu: vi.fn() }));

describe('MenuPage', () => {
  beforeEach(() => {
    const store = stores.find((candidate) => candidate.id === 'don-pizza')!;
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
      products: products.filter((product) => product.storeId === store.id).slice(0, 1),
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
  });
});
