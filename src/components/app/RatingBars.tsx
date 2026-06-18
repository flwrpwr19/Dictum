"use client";

import { cn } from "@/lib/utils";
import type { Rating } from "@/lib/models/types";

const LEVELS: Rating[] = [1, 2, 3, 4, 5];

/** SuperWhisper-style 5-step speed or accuracy meter. */
export function RatingBars({
  label,
  value,
  tone = "iris",
  className,
  compact = false,
}: {
  label: string;
  value: Rating;
  tone?: "iris" | "cyan";
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        compact && "w-[88px] flex-col items-start gap-1",
        className
      )}
    >
      <span
        className={cn(
          "shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground",
          compact ? "w-full" : "w-14"
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          "flex items-end gap-[3px]",
          compact ? "w-full" : "flex-1"
        )}
        aria-hidden
      >
        {LEVELS.map((level) => {
          const filled = level <= value;
          const height = 6 + level * 3;
          return (
            <span
              key={level}
              className={cn(
                "w-[5px] rounded-sm transition-colors",
                filled
                  ? tone === "cyan"
                    ? "bg-dictum-cyan/85"
                    : "bg-dictum-iris/85"
                  : "bg-white/10"
              )}
              style={{ height }}
            />
          );
        })}
      </div>
    </div>
  );
}
