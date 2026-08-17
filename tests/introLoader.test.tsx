import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SuyaIntroLoader } from '@/components/common/SuyaIntroLoader';

describe('pantalla de carga', () => {
  it('mantiene la escala del repartidor fuera del elemento animado por CSS', () => {
    const { container } = render(<SuyaIntroLoader onFinish={vi.fn()} />);

    const rider = container.querySelector('.intro-rider');
    expect(rider).not.toBeNull();

    // La escala vive en un grupo propio…
    const scaled = rider!.querySelector('g[transform]');
    expect(scaled?.getAttribute('transform')).toBe('scale(0.42) translate(-80 -104)');

    // …y el grupo con animación CSS de transform no lleva atributo `transform`,
    // porque el CSS lo reemplazaría y el repartidor saldría a tamaño real.
    const body = container.querySelector('.intro-rider__body');
    expect(body).not.toBeNull();
    expect(body!.hasAttribute('transform')).toBe(false);
  });

  it('dibuja la escena de Sullana con la ruta que sigue la moto', () => {
    const { container } = render(<SuyaIntroLoader onFinish={vi.fn()} />);

    expect(container.querySelectorAll('.intro-draw').length).toBeGreaterThanOrEqual(14);
    expect(container.querySelector('#intro-road')).not.toBeNull();
    expect(container.querySelector('mpath')?.getAttribute('href')).toBe('#intro-road');
    expect(screen.getByText('Tu ciudad. Tus tiendas. Llegamos a ti.')).toBeInTheDocument();
  });

  it('avisa cuando termina la animación', () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<SuyaIntroLoader onFinish={onFinish} minDuration={1000} />);

    vi.advanceTimersByTime(1500);
    expect(onFinish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
