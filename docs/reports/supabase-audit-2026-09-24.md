# Supabase audit — 2026-09-24

## Scope and access

Read-only inspection of the production Supabase project through its SQL Editor and Supabase CLI. `supabase db query --linked` now executes read-only queries through the Management API; this runtime still has no Supabase MCP tools. No production rows, credentials, schema, or migration history were changed. The separate staging project was not used. The production migration ledger reaches `20260921120000`.

## Findings

### Security

- All 28 tables in `public` have RLS enabled. No public table has a blanket `USING (true)` or `WITH CHECK (true)` policy.
- Six RLS-enabled public tables have no client policies and are service-role-only, which is default-deny.
- Two tables in `private` have RLS disabled. Neither grants table access to `anon` or `authenticated`; one grants `SELECT` to `service_role` for payment processing.
- All inspected `SECURITY DEFINER` functions in `public` and `private` set an explicit `search_path`.
- 37 public `SECURITY DEFINER` RPCs are executable by `anon`. Most support guest checkout, token-protected order flows, wallet observation, or consented analytics. Eight are intended for authenticated users: `get_order_codes`, `confirm_order_delivery`, `create_restaurant_table`, `regenerate_restaurant_table_qr`, `set_restaurant_table_active`, `list_restaurant_tables`, `list_suya_analytics_daily`, and `open_table_session`.
- `get_order_codes` compares `customer_id` to `auth.uid()` without rejecting a null identity. Guest orders also have a null `customer_id`, so an anonymous caller with an order UUID could reach this lookup. The new migration adds a non-null identity guard and removes anonymous execution.
- Two private trigger functions inherit default `EXECUTE` grants for client roles. They are not REST-exposed, but their privileges should be explicit.

### Runtime and data integrity

- Remote Supabase lint reports two PL/pgSQL errors: `record_cash_sale` and `add_cash_adjustment` have ambiguous unqualified `session_id` references. These cash-register RPCs can fail when called. Their current remote definitions differ from repository source.
- The live schema has zero invalid indexes. One unvalidated check constraint belongs to Supabase's managed `realtime.messages` table.
- A catalog scan found 25 foreign keys without a detected covering index across application and Supabase-managed schemas. This is a tuning backlog; prioritize hot paths using query plans and production traffic before adding indexes.
- One repository migration, `20260912223000_link_generated_menu_images.sql`, is absent from remote migration history. A read-only row-by-row reconciliation against its manifest confirmed all 58 expected Andá Paya mappings and all 29 expected Donde Joel mappings, including `image_is_stock=true`. The extra generated image currently visible for Donde Joel is outside this migration's 29-entry manifest. `supabase db push --dry-run` still stops because the historical migration is missing remotely. The effects now have evidence; repair the ledger only after production preflight and database test gates pass.
- The Supabase dashboard Advisor showed no findings. That does not catch the PL/pgSQL ambiguity or migration-ledger drift found by CLI and catalog checks.

### Accounts and release readiness

- One restaurant owner account is active, linked, and has a confirmed Auth user. Its password is unknown. The two Andá Paya profiles remain `pending_contact`, without contact email, owner link, or confirmed Auth user.
- The deployed Edge Function inventory contains only `route-driving`; `invite-restaurant-owner` is not deployed. Cloudflare reports Email Routing `unconfigured`, with no destination addresses or forwarding rules. The domain has no published MX records; the current Cloudflare connector has read-only zone permissions. No invitation or recovery email was sent. New official access therefore remains blocked until a deliverable mailbox exists and the owner invite flow is deployed/configured.
- Current release artifacts are Suya `1.7` / Android `versionCode 8`. No new APK was built: the prepared database fixes are not deployed, release-signing variables are absent, and the production build gate currently sees missing configuration and mock services.
- Payment production preflight is not ready: required Supabase build variables and Culqi webhook configuration are absent. Digital payments remain blocked.

## Prepared corrections

- `supabase/migrations/20260924140000_private_data_and_rpc_permissions.sql`: enables RLS on the two private tables, removes client access to trigger-only functions, restricts eight RPCs to authenticated users, and closes the null-identity order-code lookup.
- `supabase/tests/20260924140000_private_data_and_rpc_permissions.test.sql`: covers private-table access, RPC grants, preserved guest flows, and null-identity guard.
- `supabase/migrations/20260924150000_cash_register_ambiguity_repair.sql`: replaces the two remote cash-register RPC definitions with qualified column references.
- `supabase/tests/20260924150000_cash_register_ambiguity_repair.test.sql`: covers function security settings, grants, and qualified references.

These migrations are local-only and not applied to production.

## Verification

- Passed: `npm run typecheck`, `npm run lint`, `npm run security:secrets`, `npm test` (77 files, 393 tests), `npm run build`, `git diff --check`.
- Remote DB lint failed on the two cash-register ambiguities above.
- `npm run db:test` could not connect to local PostgreSQL because Docker is not running (`127.0.0.1:54322` refused the connection).
- `npm run verify:production` failed: required Supabase/map/analytics build configuration was absent and the local `dist` contained mock service bundles.
- APK verification could not inspect release APK manifests or signatures because Android `aapt2` and `apksigner` are missing. Android SDK, API 35 AVDs, and existing release APK files are present; no emulator was running.

## Next actions

1. Reconcile the missing migration record after verifying all expected image mappings, then rerun migration-list and dry-run.
2. Start the local Supabase/Docker stack, run the database tests and local SQL lint, and fix any remaining failures.
3. Pass production preflight before applying either prepared migration; rerun remote DB lint afterward.
4. Establish real mail delivery and verified owner contacts, then deploy/configure the owner invitation flow. Do not store passwords in assistant memory.
5. Build and sign a new APK after backend changes are validated and release-signing configuration is available.
