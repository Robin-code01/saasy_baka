// src/features/tender-card.tsx
"use client";

import * as React from "react";
import cn from "@/utils/cn";

type TenderCardProps = {
  title: string;
  value: number;
  date: string;
  match: number;
  risk: number;
  isSelected?: boolean;
  onClick?: () => void;
};

/**
 * Continuous HSL interpolation for Match Score (0% = Red -> 50% = Amber -> 100% = Emerald Green)
 */
export function getSmoothMatchColor(score: number): string {
  const clamped = Math.min(100, Math.max(0, score));
  if (clamped <= 50) {
    const t = clamped / 50;
    const h = Math.round(t * 40); // 0 (Red) -> 40 (Amber)
    const s = Math.round(75 + t * 17);
    const l = Math.round(52 - t * 4);
    return `hsl(${h} ${s}% ${l}%)`;
  } else {
    const t = (clamped - 50) / 50;
    const h = Math.round(40 + t * 110); // 40 (Amber) -> 150 (Emerald Green)
    const s = Math.round(92 - t * 22);
    const l = Math.round(48 - t * 8);
    return `hsl(${h} ${s}% ${l}%)`;
  }
}

/**
 * Continuous HSL interpolation for Risk Score (0% = Emerald Green -> 40% = Amber -> 100% = Red)
 */
export function getSmoothRiskColor(score: number): string {
  const clamped = Math.min(100, Math.max(0, score));
  if (clamped <= 40) {
    const t = clamped / 40;
    const h = Math.round(150 - t * 110); // 150 (Emerald Green) -> 40 (Amber)
    const s = Math.round(70 + t * 22);
    const l = Math.round(40 + t * 8);
    return `hsl(${h} ${s}% ${l}%)`;
  } else {
    const t = (clamped - 40) / 60;
    const h = Math.round(40 - t * 40); // 40 (Amber) -> 0 (Red)
    const s = Math.round(92 - t * 17);
    const l = Math.round(48 + t * 4);
    return `hsl(${h} ${s}% ${l}%)`;
  }
}

export function getMatchCategory(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Good";
  if (score >= 50) return "Moderate";
  return "Low";
}

export function getRiskCategory(score: number): string {
  if (score <= 20) return "Low";
  if (score <= 40) return "Moderate";
  if (score <= 60) return "Elevated";
  return "High";
}

export default function TenderCard({
  title,
  value,
  date,
  match,
  risk,
  isSelected = false,
  onClick,
}: TenderCardProps) {
  const formattedValue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

  const matchColor = getSmoothMatchColor(match);
  const riskColor = getSmoothRiskColor(risk);
  const matchLabel = getMatchCategory(match);
  const riskLabel = getRiskCategory(risk);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onClick?.();
        }
      }}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-background/90 p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer shadow-xs",
        isSelected
          ? "border-ring/80 ring-1 ring-ring/40 bg-background shadow-sm"
          : "border-border hover:border-foreground/30 hover:bg-background"
      )}
    >
      {/* Title */}
      <h3 className="text-sm font-semibold tracking-tight text-foreground line-clamp-2 leading-snug">
        {title}
      </h3>

      {/* Primary Spec Line */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3 text-xs">
        <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
          {formattedValue}
        </span>
        <span className="font-mono text-xs text-foreground/60">
          Due: {date}
        </span>
      </div>

      {/* Metrics: Match & Risk with Dynamic Labels & Smooth Spectrum */}
      <div className="flex flex-col gap-2.5 pt-0.5">
        {/* Match Metric */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="uppercase tracking-wider text-foreground/60">
              Match Compatibility
            </span>
            <div className="flex items-center gap-1.5 font-medium">
              <span
                className="font-semibold transition-colors duration-500"
                style={{ color: matchColor }}
              >
                {matchLabel}
              </span>
              <span className="text-foreground/30">•</span>
              <span className="text-foreground">{match}%</span>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${Math.min(100, Math.max(0, match))}%`,
                backgroundColor: matchColor,
              }}
            />
          </div>
        </div>

        {/* Risk Metric */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="uppercase tracking-wider text-foreground/60">
              Risk Evaluation
            </span>
            <div className="flex items-center gap-1.5 font-medium">
              <span
                className="font-semibold transition-colors duration-500"
                style={{ color: riskColor }}
              >
                {riskLabel}
              </span>
              <span className="text-foreground/30">•</span>
              <span className="text-foreground">{risk}%</span>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${Math.min(100, Math.max(0, risk))}%`,
                backgroundColor: riskColor,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}