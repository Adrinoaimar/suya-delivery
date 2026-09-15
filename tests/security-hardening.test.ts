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
    expect(listener).toMatch(/ingest_wallet_observation/);
    expect(listener).toMatch(/configureDeviceToken/);
    expect(listener).toMatch(/getPostTime\(\)/);
    expect(listener).toMatch(/getKey\(\)/);
    expect(listener).toMatch(/EXTRA_SUB_TEXT/);
    expect(listener).toMatch(/EXTRA_INFO_TEXT/);
    expect(listener).toMatch(/EXTRA_SUMMARY_TEXT/);
    expect(listener).toMatch(/The stable event/);
    expect(listener).toMatch(/mergeEvidenceField/);
    expect(listener).toMatch(/scheduleSyncJob/);
    expect(listener).toMatch(/pass < 2/);
    expect(listener).toMatch(/optBoolean\("synced", false\)/);
    expect(listener).not.toContain('service_role');
    expect(listener).not.toContain('putString(EVENTS_KEY, next.toString())');
    expect(source('android/app/src/main/java/com/suya/app/SuyaWalletSyncJobService.java')).toMatch(/jobFinished/);
    const manifest = source('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/RECEIVE_BOOT_COMPLETED/);
    expect(gradle).toMatch(/suyaWalletObserverEnabled = suyaAndroidAppId == 'com\.suya\.walletobserver'/);
    expect(manifest).toMatch(/android:enabled="\$\{suyaWalletObserverEnabled\}"/);
  });

  it('ships defensive headers with every static Pages bundle', () => {
    const headers = source('public/_headers');
    expect(headers).toMatch(/frame-ancestors 'none'/);
    expect(headers).toMatch(/X-Content-Type-Options: nosniff/);
    expect(headers).toMatch(/script-src[^\n]*https:\/\/js\.culqi\.com/);
    expect(headers).toMatch(/connect-src[^\n]*https:\/\/checkoutview\.culqi\.com/);
    expect(headers).toMatch(/connect-src[^\n]*https:\/\/suyadelivery\.com/);
    expect(headers).not.toMatch(/googletagmanager|google-analytics|region1\.google-analytics/iu);
    expect(headers).toMatch(/frame-src https:\/\/checkoutview\.culqi\.com/);
    expect(headers).toMatch(/\/mobile-updates\/latest\.json[\s\S]*Content-Type: application\/json[\s\S]*Cache-Control: no-store/);
    expect(headers).toMatch(/\/mobile-updates\/\*\.zip[\s\S]*Content-Type: application\/zip[\s\S]*Cache-Control: public, max-age=31536000, immutable/);
  });
});
