import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEYS,
  clearSuyaStorage,
  readLocal,
  readSession,
  removeLocal,
  writeLocal,
  writeSession,
} from '@/lib/storage';

describe('almacenamiento local', () => {
  it('persiste y recupera un valor', () => {
    writeLocal(STORAGE_KEYS.recentSearches, ['pollo', 'pizza']);
    expect(readLocal<string[]>(STORAGE_KEYS.recentSearches, [])).toEqual(['pollo', 'pizza']);
  });

  it('devuelve el valor por defecto cuando la clave no existe', () => {
    expect(readLocal(STORAGE_KEYS.favorites, ['default'])).toEqual(['default']);
  });

  it('devuelve el valor por defecto cuando el contenido está corrupto', () => {
    window.localStorage.setItem(STORAGE_KEYS.cart, '{no-es-json');
    expect(readLocal(STORAGE_KEYS.cart, { items: [] })).toEqual({ items: [] });
  });

  it('elimina una clave concreta', () => {
    writeLocal(STORAGE_KEYS.user, { name: 'Ana' });
    removeLocal(STORAGE_KEYS.user);
    expect(readLocal(STORAGE_KEYS.user, null)).toBeNull();
  });

  it('usa sessionStorage para la animación de entrada', () => {
    writeSession(STORAGE_KEYS.introSeen, true);
    expect(readSession(STORAGE_KEYS.introSeen, false)).toBe(true);
    expect(readLocal(STORAGE_KEYS.introSeen, false)).toBe(false);
  });

  it('borra todos los datos de la demo', () => {
    writeLocal(STORAGE_KEYS.orders, [{ id: '1' }]);
    writeLocal(STORAGE_KEYS.favorites, ['kfc']);
    writeSession(STORAGE_KEYS.introSeen, true);

    clearSuyaStorage();

    expect(readLocal(STORAGE_KEYS.orders, null)).toBeNull();
    expect(readLocal(STORAGE_KEYS.favorites, null)).toBeNull();
    expect(readSession(STORAGE_KEYS.introSeen, false)).toBe(false);
  });
});
