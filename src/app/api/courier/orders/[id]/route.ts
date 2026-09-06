import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import type { Order } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(
  _req: Request,
  ctx: RouteParams,
) {
  const store = cookies();
  if (store.get("flowers_courier_auth")?.value !== "1") {
    return NextResponse.json(
      { error: "????? ?????? ??????" },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .update({ status: "completed" })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: "????? ?????? ??????" },
        { status: 500 },
      );
    }
    return NextResponse.json({ order: data as Order });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "????? ???" }, { status: 500 });
  }
}
