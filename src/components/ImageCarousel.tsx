"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Gallery carousel built on native CSS scroll-snap.
 *
 * Why scroll-snap instead of a JS animation library:
 * - Touch swipe is handled by the compositor (native momentum + snap), so it
 *   never blocks on JS and stays at 60/120fps on low-end phones.
 * - Button/dot navigation uses `scrollTo({ behavior: "smooth" })`, which the
 *   browser animates on the compositor thread -> no lag, no layout thrash.
 * - Only `transform`/`opacity`-composited work happens during a transition.
 *
 * Only a small window of slides around the active index is mounted, so a
 * 10-image product does not eagerly download 10 optimized images.
 */

export const IMAGE_FALLBACK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23f3f4f6'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='Heebo,sans-serif' font-size='24'>פרחים</text></svg>";

const BLUR_DATA_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 12'><rect width='16' height='12' fill='%23f6f1e7'/></svg>";

/** Slides kept mounted on each side of the active one. */
const PREV_RANGE = 1;
const NEXT_RANGE = 2;

/** How long scroll events are ignored after a programmatic scroll starts. */
const SCROLL_SETTLE_MS = 800;

type SlideProps = {
  src: string;
  alt: string;
  sizes: string;
  priority: boolean;
  className?: string;
};

function Slide({ src, alt, sizes, priority, className }: SlideProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Cached images can finish before React attaches onLoad.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <div className="relative h-full w-full shrink-0 snap-start overflow-hidden bg-cream">
      <Image
        ref={imgRef}
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : "eager"}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`object-cover transition-opacity duration-200 ease-out ${
          loaded ? "opacity-100" : "opacity-0"
        } ${className ?? ""}`}
      />
    </div>
  );
}

type Props = {
  images: string[];
  alt: string;
  /** Image hint forwarded to next/image. */
  sizes?: string;
  className?: string;
  /** Class applied to every slide image (e.g. hover zoom). */
  imageClassName?: string;
  /** Eagerly preload the first slide (only pass this for above-the-fold slots). */
  priority?: boolean;
  /** Controlled active index. Omit to let the carousel manage itself. */
  index?: number;
  onIndexChange?: (index: number) => void;
  /** Changes reset the carousel back to the first slide. */
  resetKey?: string | number;
  showDots?: boolean;
  labels?: {
    region?: string;
    slide?: (index: number, total: number) => string;
  };
  /** Rendered above the media (e.g. out-of-stock overlay). */
  children?: React.ReactNode;
};

export function ImageCarousel({
  images,
  alt,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  className,
  imageClassName,
  priority = false,
  index,
  onIndexChange,
  resetKey,
  showDots = true,
  labels,
  children,
}: Props) {
  const list = useMemo(
    () => Array.from(new Set(images.filter(Boolean))) as string[],
    [images],
  );
  const count = list.length;

  const trackRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<{ startX: number; startScroll: number; active: boolean } | null>(null);
  const fromScrollRef = useRef(false);
  const resetRef = useRef(false);
  const suppressScrollRef = useRef(0);

  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex = index === undefined ? internalIndex : index;
  const [isDragging, setIsDragging] = useState(false);
  const [mounted, setMounted] = useState<Set<number>>(
    () => new Set([0, 1, 2].filter((i) => i < count)),
  );

  const isControlled = index !== undefined;
  const setIndex = useCallback(
    (next: number) => {
      if (!isControlled) setInternalIndex(next);
      onIndexChange?.(next);
    },
    [isControlled, onIndexChange],
  );

  // Single live place for the "what is on screen" decision.
  const readIndex = useCallback(() => {
    const track = trackRef.current;
    const width = track?.clientWidth ?? 0;
    if (!track || !width || count === 0) return 0;
    const raw = Math.round(track.scrollLeft / width);
    return Math.min(count - 1, Math.max(0, raw));
  }, [count]);

  const scrollBehavior = useCallback((): ScrollBehavior => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return "auto";
    }
    return "smooth";
  }, []);

  // Only mount a window of slides around the active one.
  useEffect(() => {
    setMounted((prev) => {
      const next = new Set(prev);
      for (
        let i = Math.max(0, activeIndex - PREV_RANGE);
        i <= Math.min(count - 1, activeIndex + NEXT_RANGE);
        i += 1
      ) {
        next.add(i);
      }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [activeIndex, count]);

  // Reset when the gallery identity changes (e.g. different product).
  useEffect(() => {
    const track = trackRef.current;
    setInternalIndex(0);
    setMounted(new Set([0, 1, 2].filter((i) => i < count)));
    fromScrollRef.current = false;
    resetRef.current = true;
    suppressScrollRef.current = performance.now() + SCROLL_SETTLE_MS;
    if (track) track.scrollTo({ left: 0, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Keep the track aligned with an externally driven index.
  useEffect(() => {
    if (resetRef.current) {
      resetRef.current = false;
      return;
    }
    if (fromScrollRef.current) {
      fromScrollRef.current = false;
      return;
    }
    const track = trackRef.current;
    const width = track?.clientWidth ?? 0;
    if (!track || !width) return;
    const target = activeIndex * width;
    if (Math.abs(track.scrollLeft - target) > 2) {
      track.scrollTo({ left: target, behavior: scrollBehavior() });
    }
  }, [activeIndex, scrollBehavior]);

  // Track the active slide while the user swipes or scrolls.
  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (performance.now() < suppressScrollRef.current) return;
      const next = readIndex();
      if (next !== activeIndex) {
        fromScrollRef.current = true;
        setIndex(next);
      }
    });
  }, [activeIndex, readIndex, setIndex]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const goTo = useCallback(
    (raw: number) => {
      const track = trackRef.current;
      const width = track?.clientWidth ?? 0;
      if (!track || !width || count === 0) return;

      const target = Math.min(count - 1, Math.max(0, raw));
      // Ignore the scroll events produced by the scroll we are about to run,
      // otherwise the wrap-around jump would overwrite the target.
      suppressScrollRef.current = performance.now() + SCROLL_SETTLE_MS;
      fromScrollRef.current = false;
      setIndex(target);

      // Wrapping (past either end) cannot animate; jump straight there.
      if (target !== raw) {
        track.scrollTo({ left: target * width, behavior: "auto" });
      }
    },
    [count, setIndex],
  );

  const step = useCallback(
    (delta: number) => goTo(activeIndex + delta),
    [activeIndex, goTo],
  );

  // Desktop mouse drag-to-scroll. Touch is intentionally left to the browser
  // so it keeps native momentum + snap behaviour.
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;
    dragRef.current = {
      startX: event.clientX,
      startScroll: track.scrollLeft,
      active: true,
    };
    track.setPointerCapture(event.pointerId);
    // Suspend snapping while the pointer drives the scroll position.
    track.style.scrollSnapType = "none";
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag?.active || !track) return;
    track.scrollLeft = drag.startScroll - (event.clientX - drag.startX);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag?.active || !track) return;
    dragRef.current = null;
    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }
    track.style.scrollSnapType = "";
    setIsDragging(false);
    const target = readIndex();
    if (target !== activeIndex) {
      fromScrollRef.current = true;
      setIndex(target);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  };

  const multi = count > 1;
  const slideLabel = labels?.slide ?? ((i: number, total: number) => `תמונה ${i + 1} מתוך ${total}`);

  const media = (
    <div
      ref={trackRef}
      dir="ltr"
      role="group"
      aria-roledescription="carousel"
      aria-label={labels?.region ?? alt}
      tabIndex={multi ? 0 : -1}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`no-scrollbar absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain ${
        isDragging ? "cursor-grabbing select-none" : ""
      }`}
    >
      {list.map((src, i) => (
        <div key={`${src}-${i}`} className="h-full w-full shrink-0 snap-start">
          {mounted.has(i) ? (
            <Slide
              src={src}
              alt={multi ? `${alt} — ${i + 1}` : alt}
              sizes={sizes}
              priority={priority && i === 0}
              className={isDragging ? undefined : imageClassName}
            />
          ) : null}
        </div>
      ))}
    </div>
  );

  if (count === 0) {
    return (
      <div
        className={`relative aspect-[4/3] w-full overflow-hidden bg-cream ${className ?? ""}`}
      >
        <Image
          src={IMAGE_FALLBACK}
          alt={alt}
          fill
          sizes={sizes}
          unoptimized
          className="object-cover"
        />
        {children}
      </div>
    );
  }

  return (
    <div
      className={`group/carousel relative aspect-[4/3] w-full overflow-hidden bg-cream ${className ?? ""}`}
    >
      {media}

      {multi && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => step(-1)}
            className="pointer-events-none absolute start-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground opacity-0 shadow-md transition-opacity duration-200 ease-out hover:bg-background group-focus-within/carousel:pointer-events-auto group-hover/carousel:pointer-events-auto group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100 md:pointer-events-auto md:opacity-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => step(1)}
            className="pointer-events-none absolute end-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground opacity-0 shadow-md transition-opacity duration-200 ease-out hover:bg-background group-focus-within/carousel:pointer-events-auto group-hover/carousel:pointer-events-auto group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100 md:pointer-events-auto md:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {showDots && (
            <div
              className="absolute bottom-2 start-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-background/85 p-1"
              role="group"
              aria-label="בחירת תמונה"
            >
              {list.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={slideLabel(i, count)}
                  aria-current={i === activeIndex ? "true" : undefined}
                  onClick={() => goTo(i)}
                  className={`h-2 rounded-full transition-[width,background-color] duration-200 ease-out ${
                    i === activeIndex
                      ? "w-5 bg-primary"
                      : "w-2 bg-foreground/40 hover:bg-foreground/70"
                  }`}
                />
              ))}
            </div>
          )}
        </>
      )}

      {children}
    </div>
  );
}
