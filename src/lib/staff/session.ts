import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  STAFF_ROLES,
  STAFF_SESSION_COOKIE,
  verifyToken,
  type StaffRole,
  type TokenPayload,
} from "@/lib/signed-token";

export type StaffEmployee = {
  id: string;
  full_name: string;
  role: StaffRole;
  /** Every responsibility (owner / ops_manager / marketing). */
  roles: string[];
  work_types: string[];
};

export type StaffSession = {
  employee: StaffEmployee;
  token: TokenPayload;
};

/**
 * Verifies the staff session cookie AND re-reads the employee from the DB
 * (must still exist and be active). Role / work types come from the DB, not the token.
 */
export async function getStaffSession(): Promise<StaffSession | null> {
  let raw: string | undefined;
  try {
    raw = cookies().get(STAFF_SESSION_COOKIE)?.value;
  } catch {
    return null;
  }
  const token = verifyToken(raw);
  if (!token || token.k !== "staff" || !token.eid) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("employees")
      .select("*")
      .eq("id", token.eid)
      .maybeSingle();
    if (error || !data || data.is_active !== true || data.deleted_at) return null;
    if (!STAFF_ROLES.includes(data.role as StaffRole)) return null;
    return {
      token,
      employee: {
        id: String(data.id),
        full_name: String(data.full_name ?? ""),
        role: data.role as StaffRole,
        roles: Array.isArray(data.roles) ? data.roles.map(String) : data.role === "worker" ? [] : [String(data.role)],
        work_types: Array.isArray(data.work_types) ? data.work_types.map(String) : [],
      },
    };
  } catch (e) {
    console.error("getStaffSession failed:", e);
    return null;
  }
}
