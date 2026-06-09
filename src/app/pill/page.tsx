"use client";

import { useCallback, useEffect, useState } from "react";
import { FlowPill, type PillController } from "@/components/app/FlowPill";
import type {
  EngineStatus,
  FlowState,
} from "@/lib/dictation/useDictation";

const BAR_COUNT = 28;

export default function PillWindow() {
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [level, setLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("ready");
  const [downloadPct, setDownloadPct] = useState(100);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.background = "transparent";
    body.style.background = "transparent";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    let startedAt = 0;
    let raf = 0;

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (disposed) return;

      unlisteners.push(
        await listen<{ state: FlowState }>("flow://state", (e) => {
          const s = e.payload.state;
          setFlowState(s);
          if (s === "listening") {
            startedAt = performance.now();
            const tick = () => {
              setElapsedMs(performance.now() - startedAt);
              raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          } else {
            cancelAnimationFrame(raf);
            setLevel(0);
            setBars(new Array(BAR_COUNT).fill(0));
          }
        })
      );

      unlisteners.push(
        await listen<{ level: number; bars: number[] }>("flow://level", (e) => {
          setLevel(e.payload.level);
          if (Array.isArray(e.payload.bars)) setBars(e.payload.bars);
        })
      );

      unlisteners.push(
        await listen<{ id: string; pct: number }>("model://progress", (e) => {
          setDownloadPct(e.payload.pct);
          setEngineStatus(e.payload.pct >= 100 ? "ready" : "downloading");
        })
      );
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      unlisteners.forEach((u) => u());
    };
  }, []);

  const toggle = useCallback(() => {
    void import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke("toggle_dictation")
    );
  }, []);

  const cancel = useCallback(() => {
    void import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke("stop_dictation")
    );
  }, []);

  const ctrl: PillController = {
    flowState,
    level,
    bars,
    elapsedMs,
    engineStatus,
    downloadPct,
    toggle,
    cancel,
  };

  return (
    <div className="h-full w-full overflow-hidden bg-transparent">
      <FlowPill ctrl={ctrl} overlay />
    </div>
  );
}
