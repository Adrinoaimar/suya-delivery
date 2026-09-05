import { supabase } from '@/lib/supabase/client';
import type { TableQrResolution, TableService, TableSummary } from './types';

type TableRow = {
  table_id: string;
  restaurant_id: string;
  table_number: string;
  qr_token: string;
  status: TableSummary['status'];
  active: boolean;
  session_id: string | null;
  session_status: TableSummary['sessionStatus'];
  total: number | string;
};

function mapTable(row: TableRow): TableSummary {
  return {
    id: String(row.table_id),
    restaurantId: String(row.restaurant_id),
    tableNumber: String(row.table_number),
    status: row.status,
    sessionId: row.session_id ? String(row.session_id) : null,
    sessionStatus: row.session_status ?? null,
    total: Number(row.total ?? 0),
    qrToken: String(row.qr_token),
    active: Boolean(row.active),
  };
}

function firstRow(data: unknown): TableRow | null {
  if (Array.isArray(data)) return (data[0] as TableRow | undefined) ?? null;
  return data && typeof data === 'object' ? data as TableRow : null;
}

export class SupabaseTableService implements TableService {
  async resolve(token: string): Promise<TableQrResolution | null> {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.rpc('resolve_table_qr', { p_token: token.trim() });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      tableId: row.table_id,
      restaurantId: row.restaurant_id,
      tableNumber: row.table_number,
      restaurantName: row.restaurant_name,
      sessionId: row.session_id ?? null,
    };
  }

  async open(tableId: string): Promise<string> {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.rpc('open_table_session', { p_table_id: tableId });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async list(restaurantIds: string[]): Promise<TableSummary[]> {
    if (!supabase) throw new Error('Supabase no está configurado.');
    if (restaurantIds.length === 0) return [];
    const { data, error } = await supabase.rpc('list_restaurant_tables', { p_restaurant_ids: restaurantIds });
    if (error) throw new Error(error.message);
    return ((data ?? []) as TableRow[]).map(mapTable);
  }

  async create(restaurantId: string, tableNumber: string): Promise<TableSummary> {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.rpc('create_restaurant_table', {
      p_restaurant_id: restaurantId,
      p_table_number: tableNumber.trim(),
    });
    if (error) throw new Error(error.message);
    const row = firstRow(data);
    if (!row) throw new Error('Supabase no devolvió la mesa creada.');
    return mapTable(row);
  }

  async regenerateQr(tableId: string): Promise<TableSummary> {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.rpc('regenerate_restaurant_table_qr', { p_table_id: tableId });
    if (error) throw new Error(error.message);
    const row = firstRow(data);
    if (!row) throw new Error('Supabase no devolvió el QR actualizado.');
    return mapTable(row);
  }

  async setActive(tableId: string, active: boolean): Promise<boolean> {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.rpc('set_restaurant_table_active', {
      p_table_id: tableId,
      p_active: active,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }
}
