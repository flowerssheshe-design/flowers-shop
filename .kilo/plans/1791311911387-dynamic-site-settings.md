# Plan: Dynamic Site Settings — Full Wiring & Hardcoded Constant Removal

## Goal
Fully wire the dynamic Site Settings feature so the storefront and backend read operational business values from `system_settings` (via `useSystemSettings`) instead of env-backed constants in `src/lib/constants.ts` and inline `process.env.*`. Add the missing admin Settings UI and keep settings propagating site-wide.

## Current state (verified by audit)
- `src/lib/useSystemSettings.ts` — **already complete**: type, defaults, fetch hook, `readValue`/`readBool` all cover every field the user listed (`delivery_fee`, `member_discount_percent`, `club_discount_threshold`, `preorder_deadline`, `same_day_deadline`, `pickup_hours`, `business_hours`, `whatsapp_number`, `business_phone`, `bit_number`, `paybox_number`, `pickup_address`, `announcement_banner_text`, `is_stall_open`). No schema changes needed.
- `src/lib/cycleTime.ts` — **already settings-driven**: `useCycleTime()` reads `preorder_deadline`/`same_day_deadline` from `useSystemSettings()`. The pure functions still take deadlines as args (good). No env var is referenced here.
- DB — migrations `020_system_settings.sql` and `026_system_settings_defaults.sql` already insert every required key.
- `src/app/api/admin/settings/route.ts` — **already complete**: GET returns key/value map, POST `z`-validates + upserts (admin-guarded).
- `ProductCard.tsx:45` — **BUG**: `const inPreorder = isPreorderPhase();` calls the function with **no args**, but `isPreorderPhase(preorderDeadline: string)` requires a deadline → `toMinutes(undefined)` → `undefined.split(":")` throws at render. Must be fixed.
- `AdminOrderForm.tsx`, `Storefront.tsx`, `OrderConfirmation.tsx` — import business constants from `@/lib/constants`. `OrderConfirmation` also reads `process.env.NEXT_PUBLIC_BUSINESS_PHONE` / `BUSINESS_HOURS` inline.
- **No admin Settings page exists.**
- **Conflict (resolved by user):** `system_settings.is_stall_open` vs the existing `store_settings.stall_open` (toggled in `AdminNav`/`StoreModeContext`). User chose **Option A (Unify)**: `system_settings.is_stall_open` is the single source of truth.

## Decisions
1. **Stall-open source of truth** = `system_settings.is_stall_open` (absolute boolean). The AdminNav "סטטוס דוכן" toggle is re-pointed to this key (no AdminNav UI change). The storefront stall toast keeps reading `useStoreMode().isStallOpen`, now backed by `system_settings`.
2. **`isLiveStallPhase` (cycleTime)** drives ordering-open/preorder state (e.g. ProductCard button labels), **not** the stall gate. Stall gate = the manual `is_stall_open` override + AdminNav toggle semantics (unchanged behavior).
3. **Real-time propagation** via a root `SystemSettingsProvider` (context) + a broadcast event `system-settings:updated` (window CustomEvent + localStorage bump for cross-tab). Avoids N+1 fetches (ProductCard renders many cards) and guarantees instant site-wide update.
4. **`useSystemSettings()` signature stays backward-compatible**: reads from context when a provider exists, and **falls back to a self-fetch** when used outside the provider (so existing callers like `useCycleTime` keep working).
5. **Admin Settings page** has exactly the 3 requested tabs. `is_stall_open` is **not** edited there (it is toggled via AdminNav, already wired to the unified key). `announcement_banner_text` lives in Tab 3 ("פרטי התקשרות ותשלום").
6. **Scope of constant removal** = the 4 named components + `cycleTime.ts` (done) + stall-open unification. Other business-constant consumers (`ProductForm`, `AccountUpsellDialog`, `LoginDialog`, `LoginPageView`, `ProfileView`, `admin/products`, `admin/orders/[id]`, `profile/page`, `lib/auth`, `api/orders`) and infra constants (`SUPABASE_*`, `ADMIN_PIN`, `STALL_PIN`, `COURIER_PIN`) remain env-backed — **out of scope** (flagged in risks). `@/types/index.ts` re-export of constants is left in place for those other consumers.
7. **OrderConfirmation**: only consumer is `Storefront.tsx`. It will read `whatsapp_number`/`pickup_address`/`business_phone`/`business_hours` from `useSystemSettings()`. `bitNumber`/`payboxNumber` props become optional; OrderConfirmation prefers `settings.bit_number`/`settings.paybox_number` and falls back to the prop for backward compatibility.

## Data flow
```
Admin Settings page (POST /api/admin/settings)
   -> upsert system_settings rows
   -> on success dispatch window "system-settings:updated" + localStorage bump
StoreModeContext / SystemSettingsProvider / useSystemSettings listeners
   -> refetch /api/admin/settings (GET is force-dynamic, no-store)
-> React re-render with new values in Storefront, AdminOrderForm, OrderConfirmation, ProductCard
```

## Tasks (ordered)

### T1. Foundation — SystemSettingsProvider + live refresh
- Create `src/context/SystemSettingsContext.tsx`:
  - `SystemSettingsProvider`: on mount, fetch `/api/admin/settings`, merge with the existing `DEFAULTS` (so the page never blocks on empty DB), store in context state. Expose `{ settings, refresh }`.
  - Listen for `system-settings:updated` (window `CustomEvent`) **and** `storage` event on key `system-settings:refresh` → call `refresh`.
  - Keep `ToastProvider`/`StoreModeProvider` providers independent.
- Refactor `src/lib/useSystemSettings.ts`:
  - Add `export const SETTINGS_UPDATED_EVENT = "system-settings:updated"` and `export function broadcastSystemSettingsUpdate()`.
  - `useSystemSettings()`: read `SystemSettingsContext` if present; else fall back to the current fetch-on-mount behavior (no breaking change). Still never throws.
- `src/app/layout.tsx`: wrap `<StoreModeProvider>` children with `<SystemSettingsProvider>`.

### T2. Unify stall-open onto `system_settings.is_stall_open`
- `src/app/api/admin/store-mode/route.ts`:
  - GET: read `mode` from `store_settings` (unchanged); read `stall_open` from `system_settings.is_stall_open` (fallback to `store_settings.stall_open` for backward compat, else `false`). Return `{ mode, stall_open }`.
  - POST `{ stall_open }`: upsert `system_settings` key `is_stall_open` (deprecate writing `store_settings.stall_open`). Return `{ stall_open }`.
  - POST `{ mode }`: unchanged.
- `src/context/StoreModeContext.tsx`: add a `system-settings:updated` listener that calls `loadMode()` so Settings/toggle changes propagate to the storefront toast + AdminNav.
- One-time data migration (optional, low-risk): a new migration `supabase/migrations/027_migrate_stall_open.sql` to seed `system_settings.is_stall_open` from `store_settings.stall_open` if `is_stall_open` is at default. The GET fallback makes this non-required; mark as cleanup.

### T3. Create admin Settings page — `src/app/admin/settings/page.tsx`
- Mirror `admin/products/page.tsx` conventions:
  - Client component, gate with `isAdminAuthenticated()` → `window.location.replace("/admin")` if not.
  - Header: `AdminNav` + external links + logout.
- Local form state initialized from `useSystemSettings()`.
- 3 tabs via button toggles (Hebrew labels), persistent in component state:
  - **תמחור ומשלוחים**: `delivery_fee` (number), `member_discount_percent` (0–100), `club_discount_threshold` (number). Show live `formatILS` of fee.
  - **זמנים ומועדים**: `preorder_deadline` (HH:MM), `same_day_deadline` (HH:MM), `pickup_hours` (string), `business_hours` (string). Hint helper text for HH:MM format.
  - **פרטי התקשרות ותשלום**: `business_phone`, `whatsapp_number`, `bit_number`, `paybox_number`, `pickup_address`, `pickup_instructions` (textarea), `announcement_banner_text` (textarea, optional).
- "שמור הגדרות" button per tab (or global save bound to current tab):
  - Build payload of that tab's keys only; POST `/api/admin/settings`.
  - On success: `toast({ title: "ההגדרות נשמרו", variant: "success" })`, `broadcastSystemSettingsUpdate()`, `refresh()` (form re-syncs).
  - On error: `toast({ title: "שמירה נכשלה", description, variant: "error" })`.
  - Disable/dirty-state optional; keep simple (save always, toast result).
- Use existing `ui` components (`Input`, `Label`, `Textarea`, `Button`, `Switch` if added). No new deps.

### T4. Replace constants in `Storefront.tsx`
- Add `const settings = useSystemSettings();`.
- Replace:
  - `DELIVERY_FEE` → `settings.delivery_fee` (lines ~259, 790 CheckoutDialog, 828).
  - `MEMBER_DISCOUNT_PERCENT` → `settings.member_discount_percent` (line ~978).
  - `BIT_NUMBER`/`PAYBOX_NUMBER` → pass `bitNumber={settings.bit_number}`, `payboxNumber={settings.paybox_number}` to `<OrderConfirmation>`.
  - `PICKUP_ADDRESS` → `settings.pickup_address` (lines ~482, 695).
  - `BUSINESS_PHONE` → `settings.business_phone` (lines ~460-461).
  - `BUSINESS_EMAIL` → `settings.business_email` (lines ~466-467).
  - `BUSINESS_HOURS` → `settings.business_hours` (line ~472).
  - `PICKUP_HOURS` → `settings.pickup_hours` (line ~487).
- Remove unused `CLUB_DISCOUNT_THRESHOLD` import (line 52) and drop the whole `@/lib/constants` import if no constants remain in the file.
- `deliveryFee = deliveryType === "delivery" ? settings.delivery_fee : 0;` in both the cart scope and `CheckoutDialog`.

### T5. Replace constants in `AdminOrderForm.tsx`
- Add `const settings = useSystemSettings();`.
- Replace `DELIVERY_FEE` → `settings.delivery_fee` (lines ~100, 273).
- Replace `MEMBER_DISCOUNT_PERCENT` → `settings.member_discount_percent` (lines ~298, 420).
- Drop `import { DELIVERY_FEE, MEMBER_DISCOUNT_PERCENT } from "@/lib/constants"`.

### T6. Replace constants in `OrderConfirmation.tsx`
- Add `const settings = useSystemSettings();`.
- Replace `WHATSAPP_NUMBER` → `settings.whatsapp_number` (line ~116).
- Replace `PICKUP_ADDRESS` → `settings.pickup_address` (lines ~104, 255).
- Replace inline `process.env.NEXT_PUBLIC_BUSINESS_PHONE` → `settings.business_phone` (line ~390).
- Replace inline `process.env.NEXT_PUBLIC_BUSINESS_HOURS` → `settings.business_hours` (line ~394).
- `bitNumber`/`payboxNumber`: keep props optional; use `bitNumber ?? settings.bit_number` and `payboxNumber ?? settings.paybox_number`.
- Drop `import { WHATSAPP_NUMBER, PICKUP_ADDRESS } from "@/lib/constants"`.

### T7. Fix `ProductCard.tsx` (bug + dynamic constants)
- Replace broken `import { isPreorderPhase } from "@/lib/cycleTime"` + `isPreorderPhase()` with `useCycleTime()` from `@/lib/cycleTime` and read `inPreorder` from `useCycleTime().isPreorderPhase` (now non-crashing, deadline sourced from settings).
- Replace `@/types` constant imports with settings:
  - `MEMBER_DISCOUNT_PERCENT` → `settings.member_discount_percent` (lines ~168, 173).
  - `CLUB_DISCOUNT_THRESHOLD` → `settings.club_discount_threshold` (line ~174). Keep only `type Product` from `@/types`.
- Add `const settings = useSystemSettings();` (provided by the root provider → single fetch for all cards).
- Decision: `inPreorder` is currently unused in JSX. Either remove the dead line **or** wire it to the preorder button label. Recommendation: remove the unused `inPreorder` line after switching to `useCycleTime()` to avoid dead code, **unless** a preorder-closed banner is desired (out of scope). If removed, `useCycleTime` becomes unused in ProductCard → then do not import it and instead read `settings.preorder_deadline`/`same_day_deadline` directly only if needed. **Chosen:** keep `useCycleTime()` and use `inPreorder` to refine the preorder button text ("הזמנה מראש" vs "הוסף לסל" already mode-driven) — document the choice; minimal: just fix the crash by supplying the dynamic deadline.

### T8. Verify settings-driven cycleTime (no env reliance)
- `cycleTime.ts` already reads from settings; no env variables present. Confirm no caller passes env constants. (Only caller is ProductCard, fixed in T7.) No file change required beyond confirming; close the task.

## Validation
- `npm run lint` — expect zero errors (no unused vars, no missing imports, React-hooks rules OK).
- `npx tsc --noEmit` — expect zero type errors (new page/component additions, `useSystemSettings` fallback path, optional props).
- Manual smoke:
  1. Open `/admin/settings` (auth-gated), edit `delivery_fee`/`member_discount_percent`, save → success toast → reopen → persisted.
  2. Without reload, open storefront → delivery fee / discount % / pickup address / phone / WhatsApp link reflect new values.
  3. AdminNav "סטטוס דוכן" toggle → persists to `system_settings.is_stall_open` and the storefront stall toast updates (same tab + cross-tab via storage event).
  4. `ProductCard` renders (no crash); "הנחת לקוח קבוע" text shows dynamic `%` and order-count threshold.
  5. Place an order → `OrderConfirmation` WhatsApp link uses dynamic number; pickup address dynamic; contact footer uses dynamic phone/hours.
  6. Edit `preorder_deadline`/`same_day_deadline` from Settings → `ProductCard`/`useCycleTime` `inPreorder` reflects new deadline without reload.

## Risks & out of scope
- N+1 settings fetches eliminated by the provider (T1); if the provider is skipped, ProductCard would fetch once per card.
- `StoreModeContext` and `store-mode` API change (T2) touches shared stall logic — test AdminNav toggle + storefront toast together.
- `constants.ts` keeps infra constants (`SUPABASE_*`, `ADMIN_PIN`, etc.) and business constants used by out-of-scope files; removing them fully is a follow-up.
- `@/types/index.ts` still re-exports `CLUB_DISCOUNT_THRESHOLD`/`MEMBER_DISCOUNT_PERCENT` as env constants; other consumers (LoginDialog, AccountUpsellDialog, ProductForm, admin tables, `api/orders`, `lib/auth`) remain env-bound. Do NOT remove the re-export in this plan.
- `OrderConfirmation` `bitNumber`/`payboxNumber` props: only caller is `Storefront`; safe to keep optional.
- The stall page (`/stall/page.tsx`) live-sale flow is unaffected (it doesn't use the constants being swapped); no changes required there.

## Files to change (summary)
- NEW `src/context/SystemSettingsContext.tsx`
- `src/lib/useSystemSettings.ts` (add event + broadcast + context fallback)
- `src/app/layout.tsx` (wrap provider)
- `src/app/api/admin/store-mode/route.ts` (stall_open → system_settings)
- `src/context/StoreModeContext.tsx` (listen for settings broadcast)
- NEW `src/app/admin/settings/page.tsx`
- `src/components/Storefront.tsx`
- `src/components/AdminOrderForm.tsx`
- `src/components/OrderConfirmation.tsx`
- `src/components/ProductCard.tsx`
- OPTIONAL `supabase/migrations/027_migrate_stall_open.sql`

## Open questions (none blocking — decisions above)
None. User resolved the stall-open unification (Option A). All remaining decisions are documented above.
