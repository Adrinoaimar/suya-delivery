import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { RequireAccess } from '@/routes/RequireAccess';
import { useAuthStore } from '@/store/authStore';
import type { AccessRole, AuthIdentity } from '@/lib/auth/types';

function identity(access: AccessRole[]): AuthIdentity {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'persona@example.test',
    displayName: 'Persona Prueba',
    phone: '',
    defaultAddress: '',
    defaultReference: '',
    access,
    restaurantIds: [],
  };
}

function renderGuard(required: AccessRole[], current: AuthIdentity | null) {
  useAuthStore.setState({
    status: current ? 'authenticated' : 'anonymous',
    identity: current,
    error: null,
  });
  render(
    <MemoryRouter initialEntries={['/private']}>
      <Routes>
        <Route element={<RequireAccess anyOf={required} />}>
          <Route path="private" element={<p>Contenido protegido</p>} />
        </Route>
        <Route path="login" element={<p>Inicio de sesión</p>} />
        <Route path="unauthorized" element={<p>Sin permiso</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  useAuthStore.setState({ status: 'idle', identity: null, error: null });
});

describe('RequireAccess', () => {
  it('envía usuarios anónimos al login', () => {
    renderGuard(['customer'], null);
    expect(screen.getByText('Inicio de sesión')).toBeInTheDocument();
  });

  it('permite el rol requerido', () => {
    renderGuard(['rider'], identity(['customer', 'rider']));
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });

  it('rechaza una cuenta autenticada sin rol', () => {
    renderGuard(['restaurant_staff', 'platform_admin'], identity(['customer']));
    expect(screen.getByText('Sin permiso')).toBeInTheDocument();
  });

  it('acepta cualquiera de los roles administrativos permitidos', () => {
    renderGuard(['restaurant_staff', 'platform_admin'], identity(['customer', 'platform_admin']));
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });
});
