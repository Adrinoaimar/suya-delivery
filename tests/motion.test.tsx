import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/app/AppShell';
import { Drawer } from '@/components/common/Drawer';
import { useUserStore } from '@/store/userStore';

afterEach(() => {
  useUserStore.setState((state) => ({
    preferences: { ...state.preferences, reduceMotion: false },
  }));
  delete document.documentElement.dataset.reduceMotion;
});

describe('movimiento accesible', () => {
  it('expone la preferencia manual en el documento', async () => {
    window.sessionStorage.setItem('suya_intro_seen', 'true');
    useUserStore.setState((state) => ({
      preferences: { ...state.preferences, reduceMotion: true },
    }));

    render(
      <MemoryRouter>
        <AppShell>
          <main id="contenido">Contenido</main>
        </AppShell>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute('data-reduce-motion', 'true'),
    );
  });

  it.each([
    ['left', 'animate-drawer-left'],
    ['right', 'animate-drawer-right'],
  ] as const)('abre el drawer %s desde su borde', (side, expectedClass) => {
    render(
      <Drawer open onClose={vi.fn()} title="Navegación" side={side}>
        <button type="button">Destino</button>
      </Drawer>,
    );

    expect(screen.getByRole('dialog', { name: 'Navegación' })).toHaveClass(expectedClass);
  });
});
