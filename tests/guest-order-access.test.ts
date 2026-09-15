import { beforeEach, describe, expect, it } from 'vitest';
import {
  consumeGuestOrderTokenFromHash,
  guestOrderAccessFragment,
  readGuestOrderToken,
  saveGuestOrderToken,
} from '@/lib/services/guestOrderAccess';

const orderId = '10000000-0000-4000-8000-000000000001';
const token = 'a'.repeat(64);

describe('acceso recuperable de pedido invitado', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', `/pedido/${orderId}`);
  });

  it('conserva el token fuera de la URL y construye el fragmento solo cuando existe', () => {
    expect(guestOrderAccessFragment(orderId)).toBe('');
    saveGuestOrderToken(orderId, token);

    expect(readGuestOrderToken(orderId)).toBe(token);
    expect(guestOrderAccessFragment(orderId)).toBe(`#access=${token}`);
  });

  it('consume el fragmento una vez y lo retira del historial', () => {
    window.history.replaceState({}, '', `/pedido/${orderId}?view=receipt#access=${token}`);

    expect(consumeGuestOrderTokenFromHash(orderId, window.location.hash)).toBe(token);
    expect(readGuestOrderToken(orderId)).toBe(token);
    expect(window.location.pathname).toBe(`/pedido/${orderId}`);
    expect(window.location.search).toBe('?view=receipt');
    expect(window.location.hash).toBe('');
  });

  it('no persiste tokens cortos o con caracteres no permitidos', () => {
    saveGuestOrderToken(orderId, 'short');
    expect(readGuestOrderToken(orderId)).toBeNull();

    window.history.replaceState({}, '', `/pedido/${orderId}#access=${'a'.repeat(64)}!`);
    expect(consumeGuestOrderTokenFromHash(orderId, window.location.hash)).toBeNull();
    expect(window.location.hash).toBe('');
  });
});
