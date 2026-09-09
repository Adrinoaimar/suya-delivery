import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/pages/shared/LoginPage';
import { isGoogleAuthEnabled } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  isGoogleAuthEnabled: vi.fn().mockResolvedValue(true),
  supabase: null,
}));

afterEach(() => {
  useAuthStore.setState({ status: 'idle', identity: null, error: null });
  vi.restoreAllMocks();
});

function renderCustomerLogin(entry: string | { pathname: string; search?: string; state?: unknown } = '/login') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <LoginPage title="Ingresa a Suya" allowed={['customer']} allowCustomerSignup defaultPath="/profile" />
    </MemoryRouter>,
  );
}

describe('flujo de cuenta de cliente', () => {
  it('ofrece Google solo cuando el registro de cliente está permitido', async () => {
    renderCustomerLogin();
    expect(await screen.findByRole('button', { name: 'Continuar con Google' })).toBeEnabled();
  });

  it('no ofrece Google en accesos operativos', () => {
    render(
      <MemoryRouter>
        <LoginPage title="Backoffice" allowed={['platform_admin']} defaultPath="/backoffice" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).not.toBeInTheDocument();
  });

  it('bloquea Google sin enviar al proveedor cuando Supabase lo tiene desactivado', async () => {
    vi.mocked(isGoogleAuthEnabled).mockResolvedValueOnce(false);
    const signInWithGoogle = vi.fn();
    useAuthStore.setState({ signInWithGoogle });
    renderCustomerLogin();

    const button = await screen.findByRole('button', { name: 'Google pendiente de activación' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  it('exige confirmar la contraseña antes de crear cuenta', () => {
    const signUpCustomer = vi.fn();
    useAuthStore.setState({ signUpCustomer });
    renderCustomerLogin();

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Ana Suya' } });
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'clave-segura' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'otra-clave' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(signUpCustomer).not.toHaveBeenCalled();
  });

  it('envía Google a un destino local validado', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ signInWithGoogle });
    renderCustomerLogin({ pathname: '/login', search: '?next=https%3A%2F%2Fevil.example' });

    fireEvent.click(await screen.findByRole('button', { name: 'Continuar con Google' }));

    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith('/profile'));
  });
});
