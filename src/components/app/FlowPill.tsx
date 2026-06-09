"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Mic, Square, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DictationController } from "@/lib/dictation/useDictation";
import { IdleWaveform, Waveform } from "./Waveform";

const ease = [0.32, 0.72, 0, 1] as const;
const spring = { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.82 };
const DRAG_THRESHOLD = 6;

export type PillController = Pick<
  DictationController,
  | "flowState"
  | "level"
  | "bars"
  | "elapsedMs"
  | "engineStatus"
  | "downloadPct"
  | "toggle"
  | "cancel"
>;

function formatClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type FlowPillProps = {
  ctrl: PillController;
  overlay?: boolean;
};

export function FlowPill({ ctrl, overlay = false }: FlowPillProps) {
  const { flowState, level, bars, elapsedMs } = ctrl;

  const listening = flowState === "listening";
  const transcribing = flowState === "transcribing";
  const ready = flowState === "ready";
  const errored = flowState === "error";

  const [successFlash, setSuccessFlash] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (flowState !== "ready") return;
    setSuccessFlash(true);
    const t = window.setTimeout(() => setSuccessFlash(false), 1400);
    return () => window.clearTimeout(t);
  }, [flowState]);

  const expanded = listening || transcribing || errored || successFlash;

  const startWindowDrag = useCallback(() => {
    if (!overlay) return;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      void getCurrentWindow().startDragging();
    });
  }, [overlay]);

  const onShellPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!overlay || e.button !== 0) return;
      dragOrigin.current = { x: e.clientX, y: e.clientY };
      dragging.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [overlay]
  );

  const onShellPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!overlay || !dragOrigin.current || dragging.current) return;
      const dx = e.clientX - dragOrigin.current.x;
      const dy = e.clientY - dragOrigin.current.y;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        dragging.current = true;
        dragOrigin.current = null;
        startWindowDrag();
      }
    },
    [overlay, startWindowDrag]
  );

  const onShellPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!overlay) return;
      if (dragOrigin.current && !dragging.current) {
        const dx = e.clientX - dragOrigin.current.x;
        const dy = e.clientY - dragOrigin.current.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
          ctrl.toggle();
        }
      }
      dragOrigin.current = null;
      dragging.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [overlay, ctrl]
  );

  const shellProps = overlay
    ? {
        onPointerDown: onShellPointerDown,
        onPointerMove: onShellPointerMove,
        onPointerUp: onShellPointerUp,
        style: { touchAction: "none" as const },
      }
    : {};

  const pillFace = (
    <motion.div
      layout
      animate={{
        width: expanded ? (listening ? 312 : transcribing ? 252 : 210) : 128,
      }}
      transition={spring}
      className={cn(
        "relative flex h-11 items-center gap-2 overflow-hidden rounded-full px-1.5",
        overlay
          ? "bg-[#12131a]"
          : "border border-white/10 bg-[#12131a]",
        listening && "ring-1 ring-dictum-iris/30",
        errored && "ring-1 ring-destructive/35"
      )}
    >
      <button
        type="button"
        data-pill-toggle
        onClick={(e) => {
          e.stopPropagation();
          if (!transcribing) ctrl.toggle();
        }}
        disabled={transcribing}
        aria-label={listening ? "Stop dictation" : "Start dictation"}
        className={cn(
          "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
          listening
            ? "bg-dictum-iris text-white"
            : transcribing
              ? "bg-white/8 text-dictum-cyan"
              : successFlash
                ? "bg-dictum-cyan/15 text-dictum-cyan"
                : errored
                  ? "bg-destructive/15 text-destructive"
                  : "bg-white/8 text-foreground/90"
        )}
      >
        {!expanded && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-dictum-iris/15"
            animate={{ scale: [1, 1.3, 1], opacity: [0.35, 0, 0.35] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${flowState}-${successFlash}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.18, ease }}
            className="relative z-10"
          >
            {transcribing ? (
              <TranscribeRing />
            ) : listening ? (
              <Square className="h-3 w-3 fill-current" />
            ) : successFlash ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : errored ? (
              <TriangleAlert className="h-3.5 w-3.5" />
            ) : (
              <Mic className="h-3.5 w-3.5" strokeWidth={2} />
            )}
          </motion.span>
        </AnimatePresence>
      </button>

      <div className="flex min-w-0 flex-1 items-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {listening ? (
            <motion.div
              key="wave"
              initial={{ opacity: 0, scaleX: 0.7 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0, scaleX: 0.7 }}
              transition={{ duration: 0.3, ease }}
              className="flex h-7 w-full items-center gap-2.5 pr-1"
            >
              <div className="h-full min-w-0 flex-1">
                <Waveform bars={bars} active barWidth={2} gap={2} />
              </div>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-dictum-cyan/90">
                {formatClock(elapsedMs)}
              </span>
              <button
                type="button"
                data-pill-cancel
                onClick={(e) => {
                  e.stopPropagation();
                  ctrl.cancel();
                }}
                aria-label="Discard dictation"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          ) : expanded ? (
            <motion.div
              key="status"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.24, ease }}
              className="min-w-0 pr-2 text-left"
            >
              <span className="block truncate text-[12px] font-medium text-foreground">
                {transcribing
                  ? "Transcribing…"
                  : successFlash
                    ? "Captured"
                    : errored
                      ? "Try again"
                      : "Dictum"}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-5 w-12"
            >
              <IdleWaveform count={6} className="h-full w-full" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  if (overlay) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden">
        <div
          className="pointer-events-auto select-none"
          {...shellProps}
        >
          {pillFace}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
      <motion.div
        role="group"
        aria-label="Dictation controls"
        layout
        className={cn(
          "pointer-events-auto",
          !transcribing && "cursor-pointer"
        )}
        onClick={(e) => {
          if (transcribing) return;
          if ((e.target as HTMLElement).closest("[data-pill-toggle]")) return;
          if ((e.target as HTMLElement).closest("[data-pill-cancel]")) return;
          ctrl.toggle();
        }}
        whileHover={{ scale: transcribing ? 1 : 1.02 }}
        whileTap={{ scale: transcribing ? 1 : 0.97 }}
      >
        {pillFace}
      </motion.div>
    </div>
  );
}

function TranscribeRing() {
  return (
    <span className="relative flex h-4 w-4 items-center justify-center">
      <motion.span
        className="absolute inset-0 rounded-full border border-dictum-cyan/30"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        aria-hidden
      />
      <span className="h-1 w-1 rounded-full bg-dictum-cyan" aria-hidden />
    </span>
  );
}
