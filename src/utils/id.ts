/** Generadores de identificadores locales (no criptográficos, solo para la demo). */

function randomChunk(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Código visible del pedido: `SUY-45872`. */
export function createOrderCode(): string {
  return `SUY-${Math.floor(10000 + Math.random() * 89999)}`;
}

export function createId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${randomChunk(4).toLowerCase()}`;
}

/** Código de 4 dígitos para confirmar la entrega o cancelar un pedido. */
export function createPinCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Token del enlace de seguimiento compartido: `demo-ABCD123`. */
export function createShareToken(): string {
  return `demo-${randomChunk(7)}`;
}
