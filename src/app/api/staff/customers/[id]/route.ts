import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { getUserOrderStats } from "@/lib/auth";
import { loadProfiles } from "@/lib/staff/owner/customers-server";
import { badRequest, notConfigured, readJson, serverError } from "@/lib/staff/owner/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IdSchema = z.string().uuid();

const PatchSchema = z.object({
  full_name: z.string().trim().min(2, "שם קצר מדי").max(100),
  phone: z.string().trim().max(30).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  customer_status: z.enum(["regular", "returning"]),
  discount_percent: z.number().min(0).max(100),
  admin_notes: z.string().max(2000).optional().default(""),
  notification_opt_in: z.boolean(),
});

type Ctx = { params: { id: string } | Promise<{ id: string }> };

/** One customer: profile, effective discount, signup source and orders. */
export async function GET(_req: Request, ctx: Ctx) {
  const guard = await requireStaff("customers");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const { id } = await ctx.params;
  if (!IdSchema.safeParse(id).success) return badRequest("מזהה לקוח לא תקין.");

  try {
    const admin = createAdminClient();
    const [profiles, userRes, ordersRes, stats] = await Promise.all([
      loadProfiles(admin, id),
      admin.auth.admin.getUserById(id),
      admin
        .from("orders")
        .select("id, created_at, status, order_type, total_amount, delivery_type, items, payment_method")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      getUserOrderStats(id),
    ]);
    const profile = profiles[0] ?? null;
    const user = userRes.data?.user ?? null;
    if (!profile && !user) return NextResponse.json({ error: "הלקוח לא נמצא." }, { status: 404 });
    if (ordersRes.error) throw new Error(`orders: ${ordersRes.error.message}`);

    let source: string | null = null;
    if (profile?.signup_link_id) {
      const { data } = await admin.from("tracking_links").select("name").eq("id", profile.signup_link_id).maybeSingle();
      source = (data as { name?: string } | null)?.name ?? null;
    }

    const orders = (ordersRes.data ?? []).map((o) => ({
      id: o.id as string,
      created_at: o.created_at as string,
      status: o.status as string,
      order_type: (o.order_type as string | null) ?? null,
      total_amount: Number(o.total_amount) || 0,
      delivery_type: (o.delivery_type as string | null) ?? null,
      payment_method: (o.payment_method as string | null) ?? null,
      items_count: Array.isArray(o.items)
        ? (o.items as { qty?: number }[]).reduce((s, it) => s + (Number(it?.qty) || 0), 0)
        : 0,
    }));

    return NextResponse.json({
      customer: {
        id,
        email: user?.email ?? null,
        full_name: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
        address: profile?.address ?? null,
        notification_opt_in: profile?.notification_opt_in ?? true,
        customer_status: profile?.customer_status === "returning" ? "returning" : "regular",
        discount_percent: Number(profile?.discount_percent ?? 0) || 0,
        admin_notes: profile?.admin_notes ?? "",
        created_at: profile?.created_at ?? user?.created_at ?? null,
        source,
      },
      discount: stats,
      orders,
    });
  } catch (e) {
    return serverError("customers/id", e);
  }
}

/** Edit a customer (never the password). */
export async function PATCH(req: Request, ctx: Ctx) {
  const guard = await requireStaff("customers");
  if (!guard.ok) return guard.response;
  const nc = notConfigured();
  if (nc) return nc;
  const { id } = await ctx.params;
  if (!IdSchema.safeParse(id).success) return badRequest("מזהה לקוח לא תקין.");

  const parsed = PatchSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return badRequest(first?.path[0] === "discount_percent" ? "הנחה אישית חייבת להיות בין 0 ל-100." : "חלק מהפרטים לא תקינים. בדקו את השם והטלפון.");
  }
  const body = parsed.data;

  try {
    const admin = createAdminClient();
    await admin.rpc("ensure_profile", { uid: id });
    const { error } = await admin
      .from("profiles")
      .update({
        full_name: body.full_name,
        phone: body.phone || null,
        address: body.address || null,
        customer_status: body.customer_status,
        discount_percent: Math.round(body.discount_percent * 100) / 100,
        admin_notes: body.admin_notes.trim() || null,
        notification_opt_in: body.notification_opt_in,
      })
      .eq("id", id);
    if (error) throw new Error(`profiles: ${error.message}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError("customers/id", e);
  }
}
