# פרחים ואב — Supabase Flower Shop

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase · Shadcn-style UI.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase + WhatsApp/payment numbers
npm run dev
```

Open <http://localhost:3000>.

## Supabase setup

1. Create a new Supabase project.
2. In the SQL editor, run, in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_profiles_and_auth.sql`
3. **Auth settings** — go to *Authentication → Providers → Email*:
   - For local dev: turn **OFF** "Confirm email" so signups can log in immediately.
   - For production: leave "Confirm email" ON and update the `register` route accordingly.
4. (Optional) Create the storage bucket:
   ```sql
   insert into storage.buckets (id, name, public)
     values ('product-images', 'product-images', true);
   ```
5. Storage RLS — allow public reads and admin uploads:
   ```sql
   create policy "product_images_public_read"
     on storage.objects for select
     using (bucket_id = 'product-images');

   create policy "product_images_admin_write"
     on storage.objects for insert
     using (bucket_id = 'product-images' and auth.role() = 'authenticated');
   ```
6. Set the admin PIN — either:
   - Update env `ADMIN_PIN`, **or**
   - In SQL: `update public.site_config set value = 'YOUR_PIN' where key = 'admin_pin';`

## Auth flow notes

- Login + register endpoints (`/api/auth/login`, `/api/auth/register`) use
  `@supabase/ssr` and write the session cookies onto the `NextResponse` so the
  session persists across requests. The shared helper
  `createClientForRoute()` returns the cookies the client tried to set — the
  route handler attaches them via `applyCookies()`.
- On signup a `profiles` row is auto-created by the
  `on_auth_user_created` trigger (see migration `002_profiles_and_auth.sql`).
- Email is read from `auth.users`, not from `profiles`; the profile only
  stores custom fields (name/phone/address).

## Admin

- URL: `/admin` (PIN gate)
- After PIN: `/admin/products`
- Supplier weekly aggregate: `/admin/products` (top card)
- Mutations go through `/api/admin/products/*`

## Reminders (pg_cron)

Run `supabase/sql/002_pg_cron.sql` once. Deploy the Edge Function:

```bash
supabase functions deploy send-reminders --no-verify-jwt
```

Set secrets:

```bash
supabase secrets set WHATSAPP_NUMBER=972500000000
```

## Architecture

```
src/
├─ app/                  # routes (App Router)
├─ components/           # UI + product/cart/confirmation components
├─ lib/supabase/         # server + browser + admin clients
├─ lib/utils.ts          # cn(), formatILS(), buildWhatsAppLink()
└─ types/index.ts        # shared TS types
supabase/
├─ migrations/001_initial_schema.sql
├─ functions/send-reminders/index.ts
└─ sql/002_pg_cron.sql
```

## RTL notes

- `<html dir="rtl">` set in `app/layout.tsx`.
- Tailwind logical properties used throughout (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`).
- Cart drawer slides from inline-start in RTL via Shadcn-style `Dialog`."# flowers-shop" 
