// Supabase Edge Function: send-reminders
//
// Deploy:
//   supabase functions deploy send-reminders --no-verify-jwt
//
// Triggered weekly by pg_cron (see supabase/sql/002_pg_cron.sql).
//
// Behavior:
// - Queries orders from the past week (status != 'cancelled').
// - Aggregates per product (same logic as supplier_week_aggregate).
// - Sends WhatsApp reminder via wa.me links (no API key needed).
//   For real WhatsApp Business API integration, set WHATSAPP_API_TOKEN +
//   WHATSAPP_PHONE_ID and replace the links section with the API call.
//
// This is a Deno-style function (Supabase Edge Functions use Deno).
// Plain JS for clarity — adjust imports/types if you adopt Deno tooling.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_NUMBER = Deno.env.get("WHATSAPP_NUMBER") ?? "";

async function buildSummary() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin.rpc("supplier_week_aggregate");
  if (error) throw error;
  return data as { product_id: string; title: string; total_qty: number }[];
}

function summarizeMessage(rows: { title: string; total_qty: number }[]) {
  if (!rows.length) return "אין הזמנות פעילות השבוע.";
  return [
    "תזכורת שבועית – הזמנת ספקים:",
    "",
    ...rows.map((r) => `• ${r.title} — ${r.total_qty} יחידות`),
  ].join("\n");
}

Deno.serve(async () => {
  try {
    const rows = await buildSummary();
    const msg = summarizeMessage(rows);
    const waLink = WHATSAPP_NUMBER
      ? `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`
      : null;
    console.log("Reminder payload:", msg);
    console.log("WhatsApp link:", waLink ?? "(no WHATSAPP_NUMBER set)");
    return new Response(JSON.stringify({ ok: true, link: waLink }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});