import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type {
  CashRegisterAdjustment,
  CashRegisterSale,
  CashRegisterService,
  CashRegisterSession,
} from './types';

interface CashRegisterSessionRow {
  session_id: string;
  restaurant_id: string;
  status: CashRegisterSession['status'];
  opening_float: number | string;
  expected_cash: number | string;
  declared_cash: number | string | null;
  difference: number | string | null;
  opened_at: string;
  closed_at: string | null;
  entry_count: number | string;
}

interface CashRegisterSaleRow {
  entry_id: string;
  session_id: string;
  order_id: string;
  amount: number | string;
  received: number | string;
  change: number | string;
}

interface CashRegisterAdjustmentRow {
  entry_id: string;
  session_id: string;
  amount: number | string;
  note: string;
}

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado para caja.');
  return supabase;
}

function numberValue(value: number | string | null): number | null {
  if (value === null) return null;
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error('Supabase devolvió un saldo de caja inválido.');
  return result;
}

function requiredNumber(value: number | string): number {
  const result = numberValue(value);
  if (result === null) throw new Error('Supabase devolvió un saldo de caja vacío.');
  return result;
}

function mapSession(row: CashRegisterSessionRow): CashRegisterSession {
  return {
    id: String(row.session_id),
    restaurantId: String(row.restaurant_id),
    status: row.status,
    openingFloat: requiredNumber(row.opening_float),
    expectedCash: requiredNumber(row.expected_cash),
    declaredCash: numberValue(row.declared_cash),
    difference: numberValue(row.difference),
    openedAt: String(row.opened_at),
    closedAt: row.closed_at ? String(row.closed_at) : null,
    entryCount: requiredNumber(row.entry_count),
  };
}

function first<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return data && typeof data === 'object' ? data as T : null;
}

export class SupabaseCashRegisterService implements CashRegisterService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  async list(restaurantIds: string[]): Promise<CashRegisterSession[]> {
    if (restaurantIds.length === 0) return [];
    const { data, error } = await this.client.rpc('list_cash_register_sessions', {
      p_restaurant_ids: restaurantIds,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as CashRegisterSessionRow[]).map(mapSession);
  }

  async open(
    restaurantId: string,
    openingFloat: number,
    requestId: string,
  ): Promise<CashRegisterSession> {
    const { data, error } = await this.client.rpc('open_cash_register', {
      p_restaurant_id: restaurantId,
      p_opening_float: openingFloat,
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    const row = first<CashRegisterSessionRow>(data);
    if (!row) throw new Error('Supabase no devolvió el turno de caja abierto.');
    return mapSession(row);
  }

  async recordSale(
    sessionId: string,
    orderId: string,
    received: number,
    requestId: string,
  ): Promise<CashRegisterSale> {
    const { data, error } = await this.client.rpc('record_cash_sale', {
      p_session_id: sessionId,
      p_order_id: orderId,
      p_received: received,
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    const row = first<CashRegisterSaleRow>(data);
    if (!row) throw new Error('Supabase no devolvió el cobro de caja.');
    return {
      entryId: String(row.entry_id),
      sessionId: String(row.session_id),
      orderId: String(row.order_id),
      amount: requiredNumber(row.amount),
      received: requiredNumber(row.received),
      change: requiredNumber(row.change),
    };
  }

  async addAdjustment(
    sessionId: string,
    amount: number,
    note: string,
    requestId: string,
  ): Promise<CashRegisterAdjustment> {
    const { data, error } = await this.client.rpc('add_cash_adjustment', {
      p_session_id: sessionId,
      p_amount: amount,
      p_note: note.trim(),
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    const row = first<CashRegisterAdjustmentRow>(data);
    if (!row) throw new Error('Supabase no devolvió el ajuste de caja.');
    return {
      entryId: String(row.entry_id),
      sessionId: String(row.session_id),
      amount: requiredNumber(row.amount),
      note: String(row.note),
    };
  }

  async close(
    sessionId: string,
    declaredCash: number,
    note: string,
    requestId: string,
  ): Promise<CashRegisterSession> {
    const { data, error } = await this.client.rpc('close_cash_register', {
      p_session_id: sessionId,
      p_declared_cash: declaredCash,
      p_close_note: note.trim(),
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    const row = first<CashRegisterSessionRow>(data);
    if (!row) throw new Error('Supabase no devolvió el cierre de caja.');
    return mapSession(row);
  }
}
