import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { AnalyticsDailyMetric, AnalyticsService } from './types';

type DailyMetricRow = {
  visit_day?: unknown;
  unique_visitors?: unknown;
};

function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('La analítica requiere Supabase configurado.');
  return supabase;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export class SupabaseAnalyticsService implements AnalyticsService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = requireClient()) {
    this.client = client;
  }

  async listDaily(days = 14): Promise<AnalyticsDailyMetric[]> {
    const { data, error } = await this.client.rpc('list_suya_analytics_daily', {
      p_days: days,
    });
    if (error) throw error;
    return (Array.isArray(data) ? data : [])
      .map((row) => {
        const item = row as DailyMetricRow;
        return {
          visitDay: text(item.visit_day),
          uniqueVisitors: number(item.unique_visitors),
        };
      })
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.visitDay));
  }
}
