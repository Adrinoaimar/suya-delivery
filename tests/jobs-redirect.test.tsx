import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import JobsRedirectPage from '@/pages/customer/JobsRedirectPage';
import { JOBS_SITE_URL, redirectToJobs } from '@/lib/jobsLink';

describe('puente público de Suya Jobs', () => {
  it('redirecciona siempre al destino fijo de Jobs', () => {
    const navigate = vi.fn();

    redirectToJobs(navigate);

    expect(navigate).toHaveBeenCalledWith(JOBS_SITE_URL);
  });

  it('mantiene un enlace manual accesible para el destino', () => {
    const redirect = vi.fn();
    render(<JobsRedirectPage redirect={redirect} />);

    expect(redirect).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Abrir Suya Jobs' })).toHaveAttribute(
      'href',
      JOBS_SITE_URL,
    );
  });
});
