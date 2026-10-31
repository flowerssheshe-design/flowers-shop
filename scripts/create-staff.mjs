#!/usr/bin/env node
// Creates a staff employee (phone + PIN login).
// Usage:
//   node scripts/create-staff.mjs --name "ישראל ישראלי" --phone 0501234567 --role owner [--work-types stall_seller,courier]
// The PIN is asked for interactively (hidden). --pin 1234 also works, but
// leaves the PIN in shell history.
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (or the environment).
import { readFileSync, existsSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROLES = ["owner", "ops_manager", "marketing", "worker"];

function fail(msg) {
  console.error(`שגיאה: ${msg}`);
  process.exit(1);
}

function loadEnvLocal() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const file = path.join(root, ".env.local");
  const env = {};
  if (!existsSync(file)) return env;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) fail(`ארגומנט לא מוכר: ${a}`);
    const eq = a.indexOf("=");
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) fail(`חסר ערך עבור ${a}`);
      out[a.slice(2)] = next;
      i++;
    }
  }
  return out;
}

// Same as normalizePhone in src/lib/staff/phone.ts — keep in sync.
function normalizePhone(input) {
  let digits = String(input).replace(/\D/g, "");
  if (digits.startsWith("00972")) digits = digits.slice(5);
  else if (digits.startsWith("972")) digits = digits.slice(3);
  if (!digits.startsWith("0")) digits = `0${digits}`;
  return /^0\d{8,9}$/.test(digits) ? digits : null;
}

// Same format as hashPin in src/lib/staff/pin.ts — keep in sync.
// scrypt$<saltB64>$<hashB64>, 16-byte salt, 64-byte key, default scrypt params.
function hashPin(pin) {
  const salt = randomBytes(16);
  const key = scryptSync(pin, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Reads a line from the terminal without echoing it, so the PIN stays out of
// the command line and shell history.
function promptHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    let value = "";
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.removeListener("data", onData);
          if (stdin.isTTY) stdin.setRawMode(wasRaw);
          stdin.pause();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const args = parseArgs(process.argv.slice(2));
const name = (args.name ?? "").trim();
const phone = normalizePhone(args.phone ?? "");
let pin = args.pin === undefined ? undefined : String(args.pin);
if (pin === undefined) {
  pin = await promptHidden("קוד PIN (4–8 ספרות, לא יוצג): ");
  const again = await promptHidden("הקלד/י שוב לאימות: ");
  if (pin !== again) fail("הקודים לא תואמים");
}
const role = (args.role ?? "").trim();
const workTypes = (args["work-types"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!name) fail("חסר --name");
if (!phone) fail("מספר טלפון לא תקין (--phone)");
if (!/^\d{4,8}$/.test(pin)) fail("קוד PIN חייב להיות 4–8 ספרות (--pin)");
if (!ROLES.includes(role)) fail(`תפקיד לא תקין (--role). אפשרויות: ${ROLES.join(", ")}`);
if (workTypes.some((w) => !/^[a-z_]+$/.test(w))) fail("סוגי עבודה לא תקינים (--work-types)");

const fileEnv = loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  fail("חסרים NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY ב-.env.local");
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from("employees")
  .insert({
    full_name: name,
    phone,
    pin_hash: hashPin(pin),
    role,
    work_types: workTypes,
    is_active: true,
  })
  .select("id")
  .single();

if (error) {
  if (error.code === "23505") fail(`כבר קיים עובד עם הטלפון ${phone}`);
  fail(`יצירת העובד נכשלה: ${error.message}`);
}

console.log(`✔ העובד/ת "${name}" נוצר/ה בהצלחה (תפקיד: ${role}, טלפון: ${phone}, מזהה: ${data.id})`);
