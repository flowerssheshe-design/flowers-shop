"use client";

import { useStaffRefresh } from "@/lib/staff/refresh";
import { copyText } from "@/lib/copy-text";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, Pencil, Plus, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { T } from "@/lib/staff/labels";
import { formatILS } from "@/lib/utils";
import { isValidSlug, normalizeSlugInput, suggestSlug } from "@/lib/staff/marketing/slug";
import { Card, EmptyState, ErrorState, Loading, api, formatDate } from "./ui";

type Link = {
  id: string;
  slug: string;
  name: string;
  source: string | null;
  is_active: boolean;
  created_at: string;
  visits: number;
  signups: number;
  orders: number;
  revenue: number;
};

function linkUrl(base: string, slug: string) {
  return `${base.replace(/\/$/, "")}/go/${slug}`;
}

export function TrackingLinks({ siteUrl }: { siteUrl: string }) {
  const { toast } = useToast();
  const [links, setLinks] = useState<Link[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState(siteUrl);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Link | null>(null);
  const [qrFor, setQrFor] = useState<Link | null>(null);
  const [toggling, setToggling] = useState<Link | null>(null);

  useEffect(() => {
    if (!siteUrl && typeof window !== "undefined") setBase(window.location.origin);
  }, [siteUrl]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<{ links: Link[] }>("/api/staff/marketing/links");
      setLinks(data.links);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useStaffRefresh(load);

  const copy = async (l: Link) => {
    if (await copyText(linkUrl(base, l.slug))) {
      toast({ title: "הקישור הועתק", variant: "success" });
    } else {
      toast({ title: "ההעתקה נכשלה. סמנו את הקישור והעתיקו ידנית.", variant: "error" });
    }
  };

  const setActive = async (l: Link, is_active: boolean) => {
    try {
      await api(`/api/staff/marketing/links/${l.id}`, { method: "PATCH", json: { is_active } });
      setLinks((prev) => prev?.map((x) => (x.id === l.id ? { ...x, is_active } : x)) ?? prev);
      toast({ title: is_active ? "הקישור הופעל" : "הקישור הושבת", variant: "success" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "error" });
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="min-h-11" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> קישור חדש
        </Button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !links ? (
        <Loading />
      ) : links.length === 0 ? (
        <EmptyState title="עוד אין קישורי מעקב">
          צרו קישור לכל מקור: סטורי באינסטגרם, פלאייר, קבוצת וואטסאפ. כך תדעו מאיפה מגיעים הלקוחות.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {links.map((l) => (
            <li key={l.id}>
              <Card className={l.is_active ? "" : "opacity-70"}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold">{l.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {l.source ? `${l.source} · ` : ""}נוצר {formatDate(l.created_at)}
                    </p>
                  </div>
                  <Badge variant={l.is_active ? "default" : "secondary"}>{l.is_active ? "פעיל" : "מושבת"}</Badge>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <code dir="ltr" className="min-w-0 flex-1 truncate text-left text-sm">
                    {linkUrl(base, l.slug)}
                  </code>
                  <Button variant="ghost" size="icon" onClick={() => copy(l)} aria-label="העתקת הקישור">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>

                <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["ביקורים", l.visits],
                    ["הרשמות", l.signups],
                    [T.orders, l.orders],
                    [T.revenue, formatILS(l.revenue)],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg border p-2">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-sm font-bold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" className="min-h-11" onClick={() => setQrFor(l)}>
                    <QrCode className="h-4 w-4" aria-hidden="true" /> ברקוד
                  </Button>
                  <Button variant="outline" className="min-h-11" onClick={() => setEditing(l)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" /> {T.edit}
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => (l.is_active ? setToggling(l) : void setActive(l, true))}
                  >
                    {l.is_active ? "השבתה" : "הפעלה מחדש"}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <CreateDialog
          base={base}
          onClose={() => setCreating(false)}
          onCreated={(l) => {
            setLinks((prev) => [l, ...(prev ?? [])]);
            setCreating(false);
            toast({ title: "הקישור נוצר", variant: "success" });
          }}
        />
      )}
      {editing && (
        <EditDialog
          link={editing}
          onClose={() => setEditing(null)}
          onSaved={(patch) => {
            setLinks((prev) => prev?.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)) ?? prev);
            setEditing(null);
            toast({ title: T.saved, variant: "success" });
          }}
        />
      )}
      {qrFor && <QrDialog link={qrFor} url={linkUrl(base, qrFor.slug)} onClose={() => setQrFor(null)} />}

      <Dialog open={!!toggling} onOpenChange={(o) => !o && setToggling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>להשבית את &quot;{toggling?.name}&quot;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            הקישור ימשיך להעביר לאתר, אבל כניסות חדשות דרכו לא ייספרו. הנתונים שכבר נאספו נשמרים, ואפשר להפעיל אותו שוב.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setToggling(null)}>
              {T.cancel}
            </Button>
            <Button variant="destructive" onClick={() => toggling && setActive(toggling, false)}>
              השבתה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDialog({
  base,
  onClose,
  onCreated,
}: {
  base: string;
  onClose: () => void;
  onCreated: (l: Link) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : name.trim() ? suggestSlug(name) : "";
  const slugOk = isValidSlug(effectiveSlug);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slugOk) {
      setError("הקוד בקישור יכול להכיל רק אותיות באנגלית קטנות, ספרות ומקפים.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await api<{ link: Link }>("/api/staff/marketing/links", {
        method: "POST",
        json: { name, slug: effectiveSlug, source: source || null },
      });
      onCreated(data.link);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>קישור מעקב חדש</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="link-name">שם (בשבילכם)</Label>
            <Input
              id="link-name"
              className="h-11"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="למשל: פלאייר במרכז המסחרי"
              required
              maxLength={80}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="link-slug">הקוד בקישור</Label>
            <Input
              id="link-slug"
              dir="ltr"
              className="h-11 text-left"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(normalizeSlugInput(e.target.value));
              }}
              placeholder="flyer-merkaz"
              required
            />
            <p dir="ltr" className="truncate text-left text-xs text-muted-foreground">
              {base.replace(/\/$/, "")}/go/{effectiveSlug || "…"}
            </p>
            <p className="text-xs text-muted-foreground">
              אותיות באנגלית קטנות, ספרות ומקפים. אי אפשר לשנות אחרי היצירה (הברקוד מודפס).
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="link-source">מקור (לא חובה)</Label>
            <Input
              id="link-source"
              className="h-11"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="אינסטגרם / פלאייר / וואטסאפ"
              maxLength={60}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {T.cancel}
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !slugOk}>
              {saving ? T.saving : "יצירת קישור"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  link,
  onClose,
  onSaved,
}: {
  link: Link;
  onClose: () => void;
  onSaved: (patch: Partial<Link>) => void;
}) {
  const [name, setName] = useState(link.name);
  const [source, setSource] = useState(link.source ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/staff/marketing/links/${link.id}`, {
        method: "PATCH",
        json: { name, source: source || null },
      });
      onSaved({ name: name.trim(), source: source.trim() || null });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>עריכת קישור</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="edit-name">שם</Label>
            <Input id="edit-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-source">מקור</Label>
            <Input id="edit-source" className="h-11" value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} />
          </div>
          <p className="text-xs text-muted-foreground">
            הקוד בקישור (<span dir="ltr">/go/{link.slug}</span>) לא משתנה.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {T.cancel}
            </Button>
            <Button type="submit" disabled={saving || name.trim().length < 2}>
              {saving ? T.saving : T.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({ link, url, onClose }: { link: Link; url: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0e3b2a", light: "#ffffff" } })
      .then((d) => alive && setDataUrl(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ברקוד: {link.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {error ? (
            <ErrorState message="יצירת הברקוד נכשלה." />
          ) : dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt={`ברקוד לקישור ${url}`} className="h-64 w-64 rounded-lg border" />
          ) : (
            <Loading />
          )}
          <button
            type="button"
            dir="ltr"
            className="flex max-w-full items-center gap-2 truncate text-sm text-muted-foreground"
            onClick={async () => {
              if (await copyText(url)) setCopied(true);
            }}
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {url}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            להדפסה על פלאיירים. מומלץ להדפיס לפחות 3×3 ס&quot;מ ולבדוק סריקה עם הטלפון לפני הדפסה גדולה.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {T.close}
          </Button>
          {dataUrl && (
            <Button asChild>
              <a href={dataUrl} download={`qr-${link.slug}.png`}>
                <Download className="h-4 w-4" aria-hidden="true" /> הורדת PNG
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
