import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsBootstrap } from '@/app/AnalyticsBootstrap';

vi.mock('@/lib/analytics', () => ({
  analyticsConfigured: vi.fn(() => true),
  captureCampaign: vi.fn(() => ({})),
  getAnalyticsConsent: vi.fn(() => null),
  setAnalyticsConsent: vi.fn(),
  track: vi.fn(),
}));

describe('banner de consentimiento de analítica', () => {
  beforeEach(() => vi.clearAllMocks());

  it('no bloquea controles de la página bajo el banner', () => {
    render(
      <MemoryRouter>
        <AnalyticsBootstrap />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Ayúdanos a mejorar Suya' });
    expect(dialog).toHaveClass('pointer-events-none');
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(dialog).toHaveAttribute('aria-describedby', 'analytics-consent-description');
    expect(dialog.querySelector('.pointer-events-auto')).not.toBeNull();
  });
});
