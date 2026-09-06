import { NextRequest, NextResponse } from "next/server";
import { STALL_PIN } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const { pin } = await req.json();
  if (pin !== STALL_PIN) {
    return NextResponse.json(
      { success: false, error: "PIN שגוי" },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set("flowers_stall_auth", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
