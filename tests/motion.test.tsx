import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/app/AppShell';
import { BottomSheet, ExpandableSheet } from '@/components/common/BottomSheet';
import { Drawer } from '@/components/common/Drawer';
import { Modal } from '@/components/common/Modal';
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

  it('mantiene el enlace de salto táctil cuando recibe foco', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <main id="contenido">Contenido</main>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveClass('focus:min-h-11');
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

    const dialog = screen.getByRole('dialog', { name: 'Navegación' });
    expect(dialog).toHaveClass(expectedClass, 'suya-drawer-panel');
    expect(dialog.parentElement).toHaveClass('z-[1100]');
  });

  it('mantiene opacas las superficies que pueden cubrir un mapa', () => {
    render(
      <>
        <Modal open onClose={vi.fn()} title="Detalle">
          Contenido
        </Modal>
        <BottomSheet open onClose={vi.fn()} title="Acciones">
          Contenido
        </BottomSheet>
        <ExpandableSheet
          title="Seguimiento"
          expanded
          onToggle={vi.fn()}
          summary="Pedido en camino"
        >
          Contenido
        </ExpandableSheet>
      </>,
    );

    expect(screen.getByRole('dialog', { name: 'Detalle' })).toHaveClass('bg-white');
    expect(screen.getByRole('dialog', { name: 'Acciones' })).toHaveClass('bg-white');
    expect(screen.getByRole('region', { name: 'Seguimiento' })).toHaveClass('bg-white');
  });
});
