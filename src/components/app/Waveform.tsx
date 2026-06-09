"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type WaveformProps = {
  bars: number[];
  active: boolean;
  className?: string;
  barClassName?: string;
  floor?: number;
  barWidth?: number;
  gap?: number;
};

const spring = { type: "spring" as const, stiffness: 520, damping: 34, mass: 0.35 };

export function Waveform({
  bars,
  active,
  className,
  barClassName,
  floor = 0.08,
  barWidth = 3,
  gap = 3,
}: WaveformProps) {
  return (
    <div
      className={cn("flex h-full w-full items-center justify-center", className)}
      style={{ gap }}
      aria-hidden
    >
      {bars.map((value, i) => {
        const center =
          1 - Math.abs(i - (bars.length - 1) / 2) / (bars.length / 2);
        const shaped = active
          ? Math.max(floor, value * (0.45 + center * 0.75))
          : floor * 0.55;
        const heightPct = Math.round(shaped * 100);

        return (
          <motion.span
            key={i}
            className={cn(
              "rounded-full bg-dictum-cyan/80",
              active && "bg-dictum-cyan",
              barClassName
            )}
            style={{ width: barWidth }}
            animate={{
              height: `${heightPct}%`,
              opacity: active ? 0.5 + shaped * 0.5 : 0.25,
            }}
            transition={active ? { duration: 0.07, ease: "easeOut" } : spring}
          />
        );
      })}
    </div>
  );
}

export function IdleWaveform({
  count = 7,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex h-full items-center justify-center gap-[2px]", className)}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => {
        const center = 1 - Math.abs(i - (count - 1) / 2) / (count / 2);
        return (
          <motion.span
            key={i}
            className="w-[2px] rounded-full bg-white/25"
            animate={{
              height: [
                `${16 + center * 12}%`,
                `${28 + center * 22}%`,
                `${18 + center * 14}%`,
              ],
              opacity: [0.25, 0.55, 0.3],
            }}
            transition={{
              duration: 1.9 + (i % 3) * 0.2,
              repeat: Infinity,
              repeatType: "mirror",
              ease: [0.45, 0, 0.55, 1],
              delay: i * 0.07,
            }}
          />
        );
      })}
    </div>
  );
}
