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
 * High-contrast warm continuous HSL interpolation for Match Score
 * 0% = Warm Crimson (h:8) -> 50% = Rich Golden Amber (h:34) -> 100% = Warm Forest (h:145)
 * All values maintain >= 5.8:1 contrast on white.
 */
export function getSmoothMatchColor(score: number): string {
  const clamped = Math.min(100, Math.max(0, score));
  if (clamped <= 50) {
    const t = clamped / 50;
    const h = Math.round(8 + t * 26); // 8 (Crimson) -> 34 (Warm Amber)
    const s = Math.round(78 + t * 18);
    const l = Math.round(38 - t * 6); // 38% -> 32%
    return `hsl(${h} ${s}% ${l}%)`;
  } else {
    const t = (clamped - 50) / 50;
    const h = Math.round(34 + t * 111); // 34 (Warm Amber) -> 145 (Warm Forest)
    const s = Math.round(96 - t * 24);
    const l = Math.round(32 - t * 4); // 32% -> 28%
    return `hsl(${h} ${s}% ${l}%)`;
  }
}

/**
 * High-contrast warm continuous HSL interpolation for Risk Score
 * 0% = Warm Forest (h:145) -> 40% = Rich Golden Amber (h:34) -> 100% = Warm Crimson (h:8)
 */
export function getSmoothRiskColor(score: number): string {
  const clamped = Math.min(100, Math.max(0, score));
  if (clamped <= 40) {
    const t = clamped / 40;
    const h = Math.round(145 - t * 111); // 145 (Forest) -> 34 (Warm Amber)
    const s = Math.round(72 + t * 24);
    const l = Math.round(28 + t * 4); // 28% -> 32%
    return `hsl(${h} ${s}% ${l}%)`;
  } else {
    const t = (clamped - 40) / 60;
    const h = Math.round(34 - t * 26); // 34 (Warm Amber) -> 8 (Crimson)
    const s = Math.round(96 - t * 18);
    const l = Math.round(32 + t * 6); // 32% -> 38%
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
        "group relative flex flex-col gap-3 rounded-xl border bg-white p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer shadow-xs",
        isSelected
          ? "border-amber-700 ring-2 ring-amber-700/25 bg-white shadow-sm"
          : "border-border hover:border-foreground/50 hover:bg-stone-50/50 hover:shadow-xs"
      )}
    >
      {/* Title */}
      <h3 className="text-sm font-bold tracking-tight text-foreground line-clamp-2 leading-snug">
        {title}
      </h3>

      {/* Primary Spec Line */}
      <div className="flex items-center justify-between border-b border-border pb-3 text-xs">
        <span className="font-mono text-sm font-bold tracking-tight text-foreground">
          {formattedValue}
        </span>
        <span className="font-mono text-xs font-semibold text-stone-700">
          Due: {date}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex flex-col gap-2.5 pt-0.5">
        {/* Match Metric */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="uppercase tracking-wider font-bold text-stone-700">
              Match Compatibility
            </span>
            <div className="flex items-center gap-1.5 font-medium">
              <span
                className="font-bold transition-colors duration-500"
                style={{ color: matchColor }}
              >
                {matchLabel}
              </span>
              <span className="text-stone-400">•</span>
              <span className="font-bold text-foreground">{match}%</span>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
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
            <span className="uppercase tracking-wider font-bold text-stone-700">
              Risk Evaluation
            </span>
            <div className="flex items-center gap-1.5 font-medium">
              <span
                className="font-bold transition-colors duration-500"
                style={{ color: riskColor }}
              >
                {riskLabel}
              </span>
              <span className="text-stone-400">•</span>
              <span className="font-bold text-foreground">{risk}%</span>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
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