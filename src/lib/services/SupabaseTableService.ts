import { supabase } from '@/lib/supabase/client';
import type { TableQrResolution, TableSummary } from './types';

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

  async list(restaurantIds: string[]): Promise<TableSummary[]> {
    if (!supabase) throw new Error('Supabase no está configurado.');
    if (restaurantIds.length === 0) return [];
    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('id, restaurant_id, table_number, status, table_sessions(id, status, total)')
      .in('restaurant_id', restaurantIds)
      .order('table_number');
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const sessions = Array.isArray(row.table_sessions) ? row.table_sessions : [];
      const session = sessions.find((item) => ['open', 'payment_pending'].includes(String((item as Record<string, unknown>).status))) as Record<string, unknown> | undefined;
      return {
        id: String(row.id), restaurantId: String(row.restaurant_id), tableNumber: String(row.table_number),
        status: row.status as TableSummary['status'], sessionId: session ? String(session.id) : null,
        sessionStatus: session ? session.status as TableSummary['sessionStatus'] : null,
        total: Number(session?.total ?? 0),
      };
    });
  }
}
