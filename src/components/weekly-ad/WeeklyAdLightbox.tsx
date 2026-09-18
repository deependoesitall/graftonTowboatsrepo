'use client';
// Fullscreen weekly-ad page zoom: hi-res srcLarge, pinch + pan + double-tap.
// No swipe-between-pages — vertical scroll on /weekly-ad handles paging.
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn } from 'lucide-react';

export interface WeeklyAdLightboxPage {
  sequence: number;
  src: string;
  srcLarge: string;
  width: number;
  height: number;
  label: string;
}

interface Props {
  page: WeeklyAdLightboxPage;
  onClose: () => void;
}

const MIN = 1;
const MAX = 5;
const DOUBLE_MS = 280;
const DOUBLE_ZOOM = 2.5;

type Pt = { x: number; y: number };

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function WeeklyAdLightbox({ page, onClose }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const g = useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    pointers: new Map<number, Pt>(),
    // pan
    panStart: null as Pt | null,
    panOrigTx: 0,
    panOrigTy: 0,
    // pinch
    pinchStartDist: 0,
    pinchStartScale: 1,
    pinchStartTx: 0,
    pinchStartTy: 0,
    pinchStartMid: null as Pt | null,
    // double-tap
    lastTapAt: 0,
    lastTap: null as Pt | null,
  });

  const clamp = useCallback((s: number, x: number, y: number) => {
    const el = viewportRef.current;
    const cs = Math.max(MIN, Math.min(MAX, s));
    if (!el || cs <= 1.01) return { s: cs <= 1.01 ? 1 : cs, x: 0, y: 0 };
    const { clientWidth: w, clientHeight: h } = el;
    const maxX = ((cs - 1) * w) / 2 + w * 0.2;
    const maxY = ((cs - 1) * h) / 2 + h * 0.2;
    return {
      s: cs,
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const apply = useCallback((s: number, x: number, y: number) => {
    const n = clamp(s, x, y);
    g.current.scale = n.s;
    g.current.tx = n.x;
    g.current.ty = n.y;
    setScale(n.s);
    setTx(n.x);
    setTy(n.y);
  }, [clamp]);

  /** Map client point → viewport-centered coords. */
  const toLocal = useCallback((client: Pt): Pt => {
    const el = viewportRef.current!;
    const rect = el.getBoundingClientRect();
    return {
      x: client.x - rect.left - rect.width / 2,
      y: client.y - rect.top - rect.height / 2,
    };
  }, []);

  /**
   * Zoom to nextScale. Content under focusClient (at baseScale/baseTx/baseTy)
   * moves to land under targetClient afterward.
   */
  const zoomFocus = useCallback((
    nextScale: number,
    focusClient: Pt,
    targetClient: Pt,
    baseScale: number,
    baseTx: number,
    baseTy: number,
  ) => {
    if (!viewportRef.current) return;
    const focus = toLocal(focusClient);
    const target = toLocal(targetClient);
    const ratio = nextScale / baseScale;
    apply(
      nextScale,
      target.x - (focus.x - baseTx) * ratio,
      target.y - (focus.y - baseTy) * ratio,
    );
  }, [apply, toLocal]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const st = g.current;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...st.pointers.values()];

      if (pts.length === 2) {
        st.pinchStartDist = dist(pts[0], pts[1]) || 1;
        st.pinchStartScale = st.scale;
        st.pinchStartTx = st.tx;
        st.pinchStartTy = st.ty;
        st.pinchStartMid = mid(pts[0], pts[1]);
        st.panStart = null;
        return;
      }

      if (pts.length === 1) {
        const tap: Pt = { x: e.clientX, y: e.clientY };
        const now = Date.now();
        if (
          st.lastTap &&
          now - st.lastTapAt < DOUBLE_MS &&
          dist(tap, st.lastTap) < 40
        ) {
          st.lastTapAt = 0;
          st.lastTap = null;
          st.panStart = null;
          if (st.scale > 1.05) apply(1, 0, 0);
          else zoomFocus(DOUBLE_ZOOM, tap, tap, st.scale, st.tx, st.ty);
          return;
        }
        st.lastTapAt = now;
        st.lastTap = tap;
        st.panStart = tap;
        st.panOrigTx = st.tx;
        st.panOrigTy = st.ty;
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!st.pointers.has(e.pointerId)) return;
      st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...st.pointers.values()];

      if (pts.length >= 2 && st.pinchStartMid && st.pinchStartDist > 0) {
        const d = dist(pts[0], pts[1]) || 1;
        const next = st.pinchStartScale * (d / st.pinchStartDist);
        const m = mid(pts[0], pts[1]);
        // Content under the original pinch mid stays under the *current* mid
        // (handles pinch + two-finger pan together).
        zoomFocus(next, st.pinchStartMid, m, st.pinchStartScale, st.pinchStartTx, st.pinchStartTy);
        return;
      }

      if (pts.length === 1 && st.panStart && st.scale > 1.01) {
        const dx = e.clientX - st.panStart.x;
        const dy = e.clientY - st.panStart.y;
        apply(st.scale, st.panOrigTx + dx, st.panOrigTy + dy);
      }
    };

    const onUp = (e: PointerEvent) => {
      st.pointers.delete(e.pointerId);
      try { el.releasePointerCapture(e.pointerId); } catch { /* ok */ }
      const pts = [...st.pointers.values()];
      if (pts.length < 2) {
        st.pinchStartDist = 0;
        st.pinchStartMid = null;
      }
      if (pts.length === 1) {
        st.panStart = pts[0];
        st.panOrigTx = st.tx;
        st.panOrigTy = st.ty;
      } else {
        st.panStart = null;
        if (st.scale < 1.05) apply(1, 0, 0);
      }
    };

    // Prevent iOS Safari from treating two-finger gestures as page zoom
    // while the lightbox owns the gesture (touch-action:none + this).
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [apply, zoomFocus]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Zoomed weekly ad — ${page.label}`}
      className="fixed inset-0 z-[80] bg-black flex flex-col"
    >
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <p className="text-white/90 text-sm font-semibold truncate">
          {page.label}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white text-brand-navy font-bold text-sm px-4 py-2.5 shadow-lg active:scale-95"
          aria-label="Close zoom"
        >
          <X className="w-5 h-5" />
          Close
        </button>
      </div>

      <div
        ref={viewportRef}
        className="flex-1 overflow-hidden relative select-none"
        style={{ touchAction: 'none' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={page.srcLarge}
          alt={page.label}
          draggable={false}
          className="absolute top-1/2 left-1/2 will-change-transform"
          style={{
            width: 'min(100%, 100vw)',
            height: 'auto',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        />
      </div>

      <div className="absolute bottom-0 inset-x-0 z-10 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
        <p className="inline-flex items-center gap-1.5 text-white/80 text-xs font-medium bg-black/40 rounded-full px-3 py-1.5">
          <ZoomIn className="w-3.5 h-3.5" />
          Pinch or double-tap to zoom
        </p>
      </div>
    </div>
  );
}
