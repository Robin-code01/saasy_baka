// src/components/ui/logo.tsx
import * as React from "react";
import cn from "@/utils/cn";

export function ProppyLogo({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center select-none", className)}>
      {/* Outer ambient radar pulse */}
      <span className="absolute -inset-1 rounded-xl bg-amber-500/20 blur-xs animate-pulse pointer-events-none" />
      
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative h-8 w-8 drop-shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
      >
        {/* Background rounded badge */}
        <rect width="36" height="36" rx="9" fill="currentColor" className="text-foreground" />
        
        {/* Geometric Tender Radar / "P" monogram */}
        <path
          d="M10 27V9H19.5C22.5376 9 25 11.4624 25 14.5C25 17.5376 22.5376 20 19.5 20H15.5V27H10Z"
          fill="var(--color-card)"
        />
        
        {/* Warm focal lens & reticle */}
        <circle cx="17" cy="14.5" r="2.5" fill="hsl(28 90% 42%)" />
        <path
          d="M17 8V11M17 18V21M10.5 14.5H13.5M20.5 14.5H23.5"
          stroke="hsl(28 90% 42%)"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}