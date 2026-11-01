"use client";

import { useEffect } from "react";
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
  stallName,
}: {
  open: boolean;
  onClose: () => void;
  amount: number;
  bitNumber: string;
  qrUrl: string;
  stallName: string;
}) {
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

  const number = bitNumber.trim();
  let link: string | null = null;
  if (number) {
    try {
      link = buildBitLink(number, amount, `פרחים – ${stallName}`);
    } catch {
      link = null;
    }
  }
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

        {qrUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="ברקוד לתשלום בביט"
              className="h-auto w-full max-w-[280px] rounded-lg border bg-white p-2"
            />
            <p className="text-base text-gray-600">{W.bitScan}</p>
          </>
        ) : null}

        {showNumber && (
          <div>
            <p className="text-base text-gray-600">{W.bitNumber}</p>
            <p className="text-4xl font-bold tracking-wider" dir="ltr">
              {number}
            </p>
          </div>
        )}

        {!number && !qrUrl && <p className="max-w-xs text-base text-red-700">{W.bitNotSet}</p>}

        {link && (
          <a
            href={link}
            className="inline-flex h-14 w-full max-w-xs items-center justify-center rounded-lg bg-[#00c2c9] px-6 text-lg font-bold text-white"
          >
            {W.bitOpenApp}
          </a>
        )}
      </div>
    </div>
  );
}
