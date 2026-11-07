"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildBitLink, formatILS } from "@/lib/utils";
import { W } from "@/lib/staff/work/labels";

/** Full-screen screen to show the customer: amount, Bit number and QR. */
export function BitPayModal({
  open,
  onClose,
  amount,
  bitNumber,
  qrUrl,
  groupUrl,
  stallName,
}: {
  open: boolean;
  onClose: () => void;
  amount: number;
  bitNumber: string;
  qrUrl: string;
  /** Bit group link: when set, the QR is made from it and the customer pays into the group. */
  groupUrl?: string;
  stallName: string;
}) {
  const group = (groupUrl ?? "").trim();
  const [groupQr, setGroupQr] = useState<string | null>(null);
  useEffect(() => {
    if (!group) {
      setGroupQr(null);
      return;
    }
    let alive = true;
    QRCode.toDataURL(group, { margin: 1, width: 560 })
      .then((d) => {
        if (alive) setGroupQr(d);
      })
      .catch(() => {
        if (alive) setGroupQr(null);
      });
    return () => {
      alive = false;
    };
  }, [group]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  // The group (when set) wins over the uploaded QR picture; the Bit number is
  // still shown under it, in case the group doesn't work.
  const number = bitNumber.trim();
  const qr = group ? groupQr ?? "" : qrUrl;
  let numberLink: string | null = null;
  if (number) {
    try {
      numberLink = buildBitLink(number, amount, `פרחים – ${stallName}`);
    } catch {
      numberLink = null;
    }
  }
  const link: string | null = group || numberLink;
  const showNumber = number && !/^(https?|bit):\/\//.test(number);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={W.showBit}
      className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-white text-black"
      dir="rtl"
    >
      <div className="flex justify-start p-3">
        <Button variant="outline" onClick={onClose} className="h-12 gap-2 text-base">
          <X className="h-5 w-5" aria-hidden="true" />
          סגירה
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pb-10 text-center">
        {amount > 0 && (
          <>
            <p className="text-lg text-gray-600">{W.bitAmount}</p>
            <p className="text-6xl font-extrabold tabular-nums">{formatILS(amount)}</p>
          </>
        )}

        {qr ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt="ברקוד לתשלום בביט"
              className="h-auto w-full max-w-[280px] rounded-lg border bg-white p-2"
            />
            <p className="text-base text-gray-600">{W.bitScan}</p>
          </>
        ) : null}

        {link && (
          <a
            href={link}
            className="inline-flex h-14 w-full max-w-xs items-center justify-center rounded-lg bg-[#00c2c9] px-6 text-lg font-bold text-white"
          >
            {group ? "פתיחת קבוצת הביט" : W.bitOpenApp}
          </a>
        )}

        {showNumber && (
          <div className={group ? "w-full max-w-xs rounded-lg border border-gray-200 p-3" : undefined}>
            <p className="text-base text-gray-600">{group ? "הקבוצה לא עובדת? אפשר לשלם למספר:" : W.bitNumber}</p>
            <p className={group ? "text-3xl font-bold tracking-wider" : "text-4xl font-bold tracking-wider"} dir="ltr">
              {number}
            </p>
            {group && numberLink && (
              <a href={numberLink} className="mt-2 inline-block text-base font-medium text-[#008f94] underline">
                פתיחת ביט למספר הזה
              </a>
            )}
          </div>
        )}

        {!group && !number && !qrUrl && <p className="max-w-xs text-base text-red-700">{W.bitNotSet}</p>}
      </div>
    </div>
  );
}
