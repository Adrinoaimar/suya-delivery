import { supabase } from '@/lib/supabase/client';
import type { TableQrResolution } from './types';

export interface TableService {
  resolve(token: string): Promise<TableQrResolution | null>;
  open(tableId: string): Promise<string>;
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
}
