"use client";

import { MotionConfig } from "motion/react";
import { NumberTicker } from "@/ui/beui/motion/number-ticker";
import { cn } from "@/ui/beui/lib/utils";

export interface XYTooltipRow {
  id: string;
  name: string;
  color: string;
  value: number | null;
}

function Value({ value, format }: { value: number; format: (value: number) => string }) {
  return (
    // Keep the short digit tween when composed inside spring-based Tabs.
    <MotionConfig transition={{ type: "tween" }}>
      <NumberTicker
        value={value}
        // Keep the consumer's exact formatting, including fractions and units.
        format={() => format(value)}
        startOnView={false}
        duration={0.2}
        stagger={0}
        className="whitespace-pre"
      />
    </MotionConfig>
  );
}

// ReLife: sans with tabular figures (not mono), larger text and a square swatch, to match the app.
export function XYTooltipContent({
  title,
  rows,
  formatValue,
  total,
  compact = false,
  className,
}: {
  title: string;
  rows: readonly XYTooltipRow[];
  formatValue: (value: number) => string;
  total?: number | null;
  /** Size to the content instead of a fixed panel width, for pointer-following readouts. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("block max-w-full min-w-0", compact ? "min-w-36" : "w-56", className)}>
      <span className={cn("block text-[12.5px] font-semibold text-foreground", compact ? "mb-1.5" : "mb-2")}>{title}</span>
      <span className={cn("grid", compact ? "gap-1" : "gap-1.5")}>
        {rows.map((row) => (
          <span key={row.id} className="flex items-center gap-2 text-[12.5px]">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-[3px]"
              style={{ backgroundColor: row.color }}
            />
            <span className="min-w-0 flex-1 truncate pr-3 text-muted-foreground">{row.name}</span>
            <span className="shrink-0 font-semibold text-foreground tabular-nums">
              {row.value === null ? "No data" : <Value value={row.value} format={formatValue} />}
            </span>
          </span>
        ))}
        {total !== undefined && total !== null ? (
          <span className="mt-0.5 flex items-center gap-2 border-t border-border pt-1.5 text-[11px]">
            <span className="flex-1 text-muted-foreground">Total</span>
            <span className="font-semibold text-foreground tabular-nums">
              <Value value={total} format={formatValue} />
            </span>
          </span>
        ) : null}
      </span>
    </span>
  );
}
