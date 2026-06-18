"use client";

import { motion } from "framer-motion";
import {
  BookText,
  Clock,
  Cpu,
  Layers,
  PenLine,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Device, EngineStatus } from "@/lib/dictation/useDictation";

export type WorkspaceView = "capture" | "history" | "dictionary" | "models" | "settings";

const NAV: { id: WorkspaceView; label: string; icon: LucideIcon }[] = [
  { id: "capture", label: "Capture", icon: PenLine },
  { id: "history", label: "History", icon: Clock },
  { id: "dictionary", label: "Snippets", icon: BookText },
  { id: "models", label: "Models", icon: Layers },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function AppSidebar({
  view,
  onSelect,
  engineStatus,
  device,
  desktop = false,
}: {
  view: WorkspaceView;
  onSelect: (v: WorkspaceView) => void;
  engineStatus: EngineStatus;
  device: Device | null;
  desktop?: boolean;
}) {
  return (
    <aside className="flex h-full w-[78px] shrink-0 flex-col items-center gap-1 border-r border-dictum-border bg-[#0f1014] py-5 lg:w-60 lg:items-stretch lg:px-4">
      <div
        className={cn(
          "mb-6 flex items-center justify-center gap-2 lg:justify-start lg:px-2",
          desktop && "select-none"
        )}
        {...(desktop ? { "data-tauri-drag-region": true } : {})}
      >
        <span className="inline-flex h-3 w-3 rounded-full bg-dictum-iris" />
        <span className="hidden text-base font-medium tracking-tight text-foreground lg:inline">
          Dictum
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "group relative flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors lg:justify-start",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl border border-dictum-iris/20 bg-dictum-iris/[0.08]"
                  transition={{ type: "spring", stiffness: 360, damping: 30 }}
                />
              )}
              <item.icon className="relative z-10 h-5 w-5 shrink-0" />
              <span className="relative z-10 hidden lg:inline">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto hidden rounded-xl border border-dictum-border bg-black/30 p-3 lg:block">
        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-foreground">
          <Cpu className="h-3.5 w-3.5 text-dictum-cyan" />
          Local engine
        </div>
        <div className="text-[11px] leading-relaxed text-muted-foreground">
          {engineStatus === "ready"
            ? "Model warm and ready."
            : engineStatus === "downloading"
              ? "Downloading model once…"
              : engineStatus === "warming"
                ? "Warming up…"
                : engineStatus === "error"
                  ? "Engine error — see Settings."
                  : "Loads on first dictation."}
        </div>
        {device && (
          <div className="mt-2 inline-flex items-center rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-widest text-dictum-cyan">
            {device === "webgpu" ? "WebGPU" : "WASM"}
          </div>
        )}
      </div>
    </aside>
  );
}
