import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StoreGallery } from '@/components/marketplace/StoreGallery';

describe('StoreGallery', () => {
  it('preserva la carta completa y permite ampliarla en un diálogo', () => {
    render(
      <StoreGallery
        storeName="Donde Joel"
        gallery={[{ src: '/images/stores/donde-joel/menus/carta-1.jpg', caption: 'Carta 1' }]}
      />,
    );

    expect(screen.getByRole('img', { name: 'Carta 1' })).toHaveClass('object-contain');
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar Carta 1' }));
    expect(screen.getByRole('dialog', { name: 'Carta 1' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar' })[1]!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
