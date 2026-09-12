import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Suya hardening guards', () => {
  it('limits anonymous order creation before the row is inserted', () => {
    const migration = source('supabase/migrations/20260908120000_guest_order_abuse_controls.sql');
    expect(migration).toMatch(/create table if not exists private\.guest_order_rate_limits/i);
    expect(migration).toMatch(/before insert on public\.orders/i);
    expect(migration).toMatch(/request\.headers/i);
    expect(migration).toMatch(/current_count > 30/i);
  });

  it('does not expose products from inactive restaurants to anonymous visitors', () => {
    const migration = source('supabase/migrations/20260908130000_product_visibility_hardening.sql');
    expect(migration).toMatch(/drop policy if exists products_anon_select/i);
    expect(migration).toMatch(/from public\.restaurants r[\s\S]*r\.active/i);
  });

  it('keeps menu image values out of an interpolated CSS declaration', () => {
    const app = source('apps/menu/app.js');
    expect(app).toContain("safeImageUrl(d.imageUrl)");
    expect(app).toContain("safeImageUrl(m.logoUrl");
    expect(app).toContain("safeImageUrl(m.coverUrl");
    expect(app).toContain("safeHexColor(m.primaryColor");
    expect(app).not.toContain("background-image:url('${esc(d.imageUrl)}')");
  });

  it('hardens the Android release and observer storage', () => {
    const gradle = source('android/app/build.gradle');
    const listener = source('android/app/src/main/java/com/suya/app/YapeNotificationListenerService.java');
    expect(gradle).toMatch(/minifyEnabled true/);
    expect(gradle).toMatch(/shrinkResources true/);
    expect(listener).toMatch(/AES\/GCM\/NoPadding/);
    expect(listener).not.toContain('putString(EVENTS_KEY, next.toString())');
  });

  it('ships defensive headers with every static Pages bundle', () => {
    expect(source('public/_headers')).toMatch(/frame-ancestors 'none'/);
    expect(source('public/_headers')).toMatch(/X-Content-Type-Options: nosniff/);
  });
});
