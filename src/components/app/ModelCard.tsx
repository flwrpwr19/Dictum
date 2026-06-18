"use client";

import { useState, type ReactNode } from "react";
import { Check, Cloud, Download, HardDrive, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DictumModel } from "@/lib/models/types";
import { PROVIDER_LABELS } from "@/lib/models/catalog";
import { RatingBars } from "./RatingBars";

export function ModelCard({
  model,
  active,
  ready,
  downloadPct,
  downloading,
  apiKey,
  onSelect,
  onDownload,
  onApiKeyChange,
}: {
  model: DictumModel;
  active: boolean;
  ready: boolean;
  downloadPct: number;
  downloading: boolean;
  apiKey?: string;
  onSelect: () => void;
  onDownload?: () => void;
  onApiKeyChange?: (key: string) => void;
}) {
  const isCloud = model.kind === "cloud";
  const hasKey = Boolean(apiKey?.trim());
  const [draftKey, setDraftKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);

  return (
    <article
      className={cn(
        "flex flex-col gap-4 border-b border-white/[0.06] px-4 py-4 last:border-b-0 lg:flex-row lg:items-center lg:gap-6",
        active && "bg-dictum-iris/[0.06]"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-medium text-foreground">
            {model.label}
          </h3>
          {active && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dictum-cyan/25 bg-dictum-cyan/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-widest text-dictum-cyan">
              <Check className="h-3 w-3" />
              Active
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          {isCloud ? (
            <span className="inline-flex items-center gap-1">
              <Cloud className="h-3 w-3" />
              Cloud
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              {model.size ?? "Local"}
            </span>
          )}
          {ready && <span className="text-dictum-cyan/90">Ready</span>}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground lg:max-w-md">
          {model.blurb}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-5 lg:gap-6">
        <RatingBars label="Speed" value={model.speed} tone="cyan" compact />
        <RatingBars label="Accuracy" value={model.accuracy} tone="iris" compact />
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center lg:w-[200px] lg:justify-end">
        {isCloud ? (
          <>
            {hasKey && !showKeyInput ? (
              <button
                type="button"
                onClick={() => setShowKeyInput(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-dictum-cyan/20 bg-dictum-cyan/[0.06] px-3 py-2 text-xs text-dictum-cyan"
              >
                <Check className="h-3.5 w-3.5 shrink-0" />
                Key saved
              </button>
            ) : (
              <input
                type="password"
                value={draftKey}
                placeholder={`${PROVIDER_LABELS[model.provider ?? ""] ?? "Provider"} key`}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-dictum-iris/40 focus:outline-none sm:w-36"
                onChange={(e) => setDraftKey(e.target.value)}
                onBlur={() => {
                  if (draftKey.trim()) {
                    onApiKeyChange?.(draftKey.trim());
                    setShowKeyInput(false);
                  }
                }}
              />
            )}
          </>
        ) : !ready ? (
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-white/[0.08] disabled:opacity-60"
          >
            {downloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {downloadPct}%
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Download
              </>
            )}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onSelect}
          disabled={!ready}
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
            active
              ? "border border-dictum-iris/30 bg-dictum-iris/15 text-foreground"
              : ready
                ? "bg-dictum-iris/90 text-white hover:bg-dictum-iris"
                : "cursor-not-allowed bg-white/[0.04] text-muted-foreground"
          )}
        >
          {active
            ? "Selected"
            : ready
              ? "Use"
              : isCloud
                ? "Add key"
                : "Download"}
        </button>
      </div>
    </article>
  );
}

function ModelList({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-dictum-border bg-dictum-panel">
      {children}
    </div>
  );
}

export { ModelList };
