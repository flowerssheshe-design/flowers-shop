import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/staff/guard";
import { cancelOrderWithRefund, openOrdersWithProduct, swapOrderBouquet } from "@/lib/staff/ops/order-fix-server";
import { UUID_RE, jsonError, parseBody, serverError } from "@/lib/staff/ops/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** This week's open customer orders that have a bouquet (one the supplier didn't have). */
export async function GET(req: Request) {
  const guard = await requireStaff(["stalls", "orders"]);
  if (!guard.ok) return guard.response;
  const productId = new URL(req.url).searchParams.get("product_id") ?? "";
  if (!UUID_RE.test(productId)) return jsonError("הזר לא נמצא", 404);
  try {
    return NextResponse.json({ orders: await openOrdersWithProduct(createAdminClient(), productId) });
  } catch (e) {
    return serverError(e, "supply orders GET");
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("swap"), order_id: z.string().uuid(), from: z.string().uuid(), to: z.string().uuid() }),
  z.object({ action: z.literal("cancel"), order_id: z.string().uuid() }),
]);

/** Swap the missing bouquet for another one (same price), or cancel the order (paid = refund to send back). */
export async function POST(req: Request) {
  const guard = await requireStaff(["stalls", "orders"]);
  if (!guard.ok) return guard.response;
  const body = await parseBody(req, Body);
  if (!body.ok) return body.response;
  const v = body.data;
  try {
    const admin = createAdminClient();
    const res =
      v.action === "swap" ? await swapOrderBouquet(admin, v.order_id, v.from, v.to) : await cancelOrderWithRefund(admin, v.order_id);
    if (!res.ok) return jsonError(res.error, res.status);
    return NextResponse.json(res);
  } catch (e) {
    return serverError(e, "supply orders POST");
  }
}
