// Netlify scheduled function: every hour, asks the site to send the weekly
// push notifications that are due (Tuesday / Thursday, Israel time). The site
// decides what is due, so the UTC schedule and daylight saving don't matter.
// Needs the CRON_SECRET environment variable (same value as the site's).

export default async () => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("push-reminders: URL or CRON_SECRET is missing");
    return new Response("missing config", { status: 500 });
  }
  const res = await fetch(`${base}/api/cron/push-reminders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await res.text();
  console.log("push-reminders:", res.status, text);
  return new Response(text, { status: res.status });
};

export const config = { schedule: "@hourly" };
