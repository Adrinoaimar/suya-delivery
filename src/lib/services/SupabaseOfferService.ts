import { supabase } from '@/lib/supabase/client';
import type { AppOffer } from '@/types';
import type { CreateAppOfferInput, OfferService } from './types';

interface OfferRow {
  id: string;
  restaurant_id: string | null;
  title: string;
  description: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number | string;
  minimum_subtotal: number | string;
  starts_at: string;
  ends_at: string;
  max_redemptions: number | null;
  redeemed_count: number;
  is_active: boolean;
}

const columns = 'id, restaurant_id, title, description, code, discount_type, discount_value, minimum_subtotal, starts_at, ends_at, max_redemptions, redeemed_count, is_active';

function amount(value: number | string | null): number {
  return Number(value ?? 0);
}

function map(row: OfferRow): AppOffer {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    title: row.title,
    description: row.description,
    code: row.code,
    discountType: row.discount_type,
    discountValue: amount(row.discount_value),
    minimumSubtotal: amount(row.minimum_subtotal),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxRedemptions: row.max_redemptions,
    redeemedCount: row.redeemed_count,
    active: row.is_active,
  };
}

export class SupabaseOfferServiceImpl implements OfferService {
  private readonly client = supabase!;

  async listActive(): Promise<AppOffer[]> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('app_offers')
      .select(columns)
      .eq('is_active', true)
      .eq('app_only', true)
      .lte('starts_at', now)
      .gt('ends_at', now)
      .order('ends_at');
    if (error) throw error;
    return (data ?? []).map((row) => map(row as unknown as OfferRow));
  }

  async listManageable(): Promise<AppOffer[]> {
    const { data, error } = await this.client.from('app_offers').select(columns).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => map(row as unknown as OfferRow));
  }

  async create(input: CreateAppOfferInput): Promise<AppOffer> {
    const { data, error } = await this.client
      .from('app_offers')
      .insert({
        restaurant_id: input.restaurantId,
        title: input.title.trim(),
        description: input.description.trim(),
        code: input.code.trim().toUpperCase(),
        discount_type: input.discountType,
        discount_value: input.discountValue,
        minimum_subtotal: input.minimumSubtotal,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        max_redemptions: input.maxRedemptions,
      })
      .select(columns)
      .single();
    if (error) throw error;
    return map(data as unknown as OfferRow);
  }

  async setActive(id: string, active: boolean): Promise<boolean> {
    const { error } = await this.client.from('app_offers').update({ is_active: active }).eq('id', id);
    if (error) throw error;
    return true;
  }
}
