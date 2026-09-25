// src/app/dashboard/page.tsx
"use client";

import * as React from "react";
import { SessionGate } from "@/components/auth/session-gate";
import { Header } from "@/components/layout/dashboard-header/header";
import { Button } from "@/components/ui/button";
import TenderCard, {
  getSmoothMatchColor,
  getSmoothRiskColor,
  getMatchCategory,
  getRiskCategory,
} from "@/features/tender-card";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  pulsePhase: number;
}

interface Wave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

function InteractiveBackground() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mouseRef = React.useRef<{ x: number; y: number; active: boolean }>({
    x: -1000,
    y: -1000,
    active: false,
  });
  const wavesRef = React.useRef<Wave[]>([]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];

    const initSize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      const count = Math.min(Math.floor((width * height) / 14000), 75);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: Math.random() * 1.8 + 1.2,
        baseAlpha: Math.random() * 0.4 + 0.25,
        pulsePhase: Math.random() * Math.PI * 2,
      }));
    };

    initSize();
    window.addEventListener("resize", initSize);

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };

    const onMouseLeave = () => {
      mouseRef.current.active = false;
    };

    const onPointerDown = (e: MouseEvent) => {
      wavesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        radius: 0,
        maxRadius: Math.max(width, height) * 0.65,
        alpha: 0.65,
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("mousedown", onPointerDown);

    let time = 0;
    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, width, height);

      const mouse = mouseRef.current;

      // 1. Radar wave rings
      for (let i = wavesRef.current.length - 1; i >= 0; i--) {
        const wave = wavesRef.current[i];
        wave.radius += 5.5;
        wave.alpha = Math.max(0, 0.65 * (1 - wave.radius / wave.maxRadius));

        ctx.save();
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(216, 51%, 44%, ${wave.alpha * 0.4})`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 6]);
        ctx.stroke();

        if (wave.radius > 30) {
          ctx.beginPath();
          ctx.arc(wave.x, wave.y, wave.radius - 20, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(216, 51%, 44%, ${wave.alpha * 0.15})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.stroke();
        }
        ctx.restore();

        if (wave.radius >= wave.maxRadius || wave.alpha <= 0) {
          wavesRef.current.splice(i, 1);
        }
      }

      // 2. Nodes and lines
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        let excited = 0;
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            excited = 1 - dist / 180;
            p.x += (dx / dist) * excited * 0.6;
            p.y += (dy / dist) * excited * 0.6;
          }
        }

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 125) {
            const lineAlpha = (1 - dist / 125) * 0.22;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `hsla(216, 51%, 44%, ${lineAlpha})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }

        if (mouse.active) {
          const mdx = mouse.x - p.x;
          const mdy = mouse.y - p.y;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mdist < 140) {
            const cursorLineAlpha = (1 - mdist / 140) * 0.38;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = `hsla(216, 51%, 44%, ${cursorLineAlpha})`;
            ctx.lineWidth = 1.1;
            ctx.stroke();
          }
        }

        const pulse = Math.sin(time * 2 + p.pulsePhase) * 0.15;
        const currentAlpha = Math.min(1, p.baseAlpha + pulse + excited * 0.5);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + (excited ? 1.5 : 0), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(216, 51%, 44%, ${currentAlpha})`;
        ctx.fill();

        if (excited > 0.1) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, (p.radius + 4) * (1 + excited), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(216, 51%, 44%, ${excited * 0.12})`;
          ctx.fill();
        }
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", initSize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: `radial-gradient(circle 500px at var(--mouse-x, 50%) var(--mouse-y, 40%), hsl(216 51% 44% / 0.11), transparent 75%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.38]"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(0 0% 87.84% / 0.6) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(0 0% 87.84% / 0.6) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

const SAMPLE_TENDERS = [
  {
    id: 1,
    title: "Accessible Public Sector Digital Services & Management Platform",
    value: 200000,
    date: "26/09/2026",
    match: 88,
    risk: 18,
    reference: "CF-2026-0926-01",
    authority: "Crown Commercial Service",
    description:
      "Comprehensive digital architecture implementation and ongoing maintenance support. Focuses on Web Content Accessibility Guidelines (WCAG 2.2 AA) compliance, unified design systems, cloud hosting migration, and multi-tenant citizen portal management.",
    documentUrl: "https://www.contractsfinder.service.gov.uk/notice/cf-sample-01",
  },
  {
    id: 2,
    title: "NHS Foundation Trust Cloud Infrastructure Modernisation & Support System",
    value: 580000,
    date: "14/10/2026",
    match: 75,
    risk: 25,
    reference: "CF-2026-1014-04",
    authority: "NHS England",
    description:
      "Migration of legacy on-premises databases to high-resilience UK sovereign cloud environments. Requires proven compliance with NHS Data Security and Protection Toolkit standards.",
    documentUrl: "https://www.contractsfinder.service.gov.uk/notice/cf-sample-02",
  },
  {
    id: 3,
    title: "Municipal Smart City Environmental Telemetry & Dashboard Portal",
    value: 145000,
    date: "02/11/2026",
    match: 70,
    risk: 20,
    reference: "CF-2026-1102-12",
    authority: "Greater Manchester Combined Authority",
    description:
      "Supply and software integration for city-wide air quality and transit sensor aggregators. Includes open data API endpoints and real-time public telemetry displays.",
    documentUrl: "https://www.contractsfinder.service.gov.uk/notice/cf-sample-03",
  },
  {
    id: 4,
    title: "Central Government Multi-Factor Identity & Access Architecture",
    value: 920000,
    date: "20/11/2026",
    match: 64,
    risk: 38,
    reference: "CF-2026-1120-07",
    authority: "Cabinet Office",
    description:
      "Enterprise Identity Provider integration with automated audit pipelines and FIDO2 authentication roll-out across hybrid internal departments.",
    documentUrl: "https://www.contractsfinder.service.gov.uk/notice/cf-sample-04",
  },
];

export default function Dashboard() {
  const [selectedId, setSelectedId] = React.useState<number>(SAMPLE_TENDERS[0].id);

  const selectedTender =
    SAMPLE_TENDERS.find((t) => t.id === selectedId) || SAMPLE_TENDERS[0];

  const currentMatchColor = getSmoothMatchColor(selectedTender.match);
  const currentRiskColor = getSmoothRiskColor(selectedTender.risk);
  const currentMatchCategory = getMatchCategory(selectedTender.match);
  const currentRiskCategory = getRiskCategory(selectedTender.risk);

  React.useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty("--mouse-x", `${e.clientX}px`);
      document.documentElement.style.setProperty("--mouse-y", `${e.clientY}px`);
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  return (
    <SessionGate mode="auth">
      <InteractiveBackground />
      <Header className="relative z-10" companyName="Proppy" />

      {/* Main Container */}
      <main className="relative z-10 mx-auto flex h-[calc(100vh-64px)] w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid h-full grid-cols-1 gap-6 overflow-hidden lg:grid-cols-12">
          {/* Left Column: Tenders Feed */}
          <div className="flex h-full min-h-0 flex-col lg:col-span-5">
            {/* Feed Header */}
            <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-tight text-foreground">
                  Matched Tenders
                </span>
              </div>
            </div>

            {/* Scrollable Cards List */}
            <div className="custom-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto pr-1 pb-4">
              {SAMPLE_TENDERS.map((tender) => (
                <TenderCard
                  key={tender.id}
                  title={tender.title}
                  value={tender.value}
                  date={tender.date}
                  match={tender.match}
                  risk={tender.risk}
                  isSelected={tender.id === selectedId}
                  onClick={() => setSelectedId(tender.id)}
                />
              ))}
            </div>
          </div>

          {/* Right Column: Tender Detail Panel */}
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background/85 shadow-xs backdrop-blur-md lg:col-span-7">
            <div className="custom-scrollbar flex-1 overflow-y-auto p-6 sm:p-8">
              {/* Title & Authority */}
              <div>
                <p className="text-xs font-mono font-medium uppercase tracking-wider text-foreground/60">
                  {selectedTender.authority}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl leading-snug">
                  {selectedTender.title}
                </h1>
              </div>

              {/* Technical Data Specification Grid - Balanced & Unified Spacing */}
              <div className="mt-6 rounded-xl border border-border bg-background p-5">
                {/* 4 Stat Columns: Identical Baselines & Heights */}
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
                  <div className="border-b border-border/60 pb-3 sm:border-b-0 sm:pb-0">
                    <dt className="text-xs text-foreground/60">Total Value</dt>
                    <dd className="mt-1 font-mono text-sm font-semibold text-foreground">
                      ${selectedTender.value.toLocaleString()}
                    </dd>
                  </div>

                  <div className="border-b border-border/60 pb-3 sm:border-b-0 sm:pb-0">
                    <dt className="text-xs text-foreground/60">Deadline</dt>
                    <dd className="mt-1 font-mono text-xs sm:text-sm font-medium text-foreground">
                      {selectedTender.date}
                    </dd>
                  </div>

                  {/* Compatibility Stat with Dynamic Colored Pill */}
                  <div>
                    <dt className="text-xs text-foreground/60">Compatibility</dt>
                    <dd className="mt-1 flex items-center gap-1.5 font-mono text-xs sm:text-sm font-medium text-foreground">
                      <span>{selectedTender.match}%</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-mono font-medium transition-all duration-500"
                        style={{
                          backgroundColor: `${currentMatchColor}15`,
                          color: currentMatchColor,
                          borderColor: `${currentMatchColor}35`,
                          borderWidth: "1px",
                        }}
                      >
                        {currentMatchCategory}
                      </span>
                    </dd>
                  </div>

                  {/* Risk Stat with Dynamic Colored Pill */}
                  <div>
                    <dt className="text-xs text-foreground/60">Risk Rating</dt>
                    <dd className="mt-1 flex items-center gap-1.5 font-mono text-xs sm:text-sm font-medium text-foreground">
                      <span>{selectedTender.risk}%</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-mono font-medium transition-all duration-500"
                        style={{
                          backgroundColor: `${currentRiskColor}15`,
                          color: currentRiskColor,
                          borderColor: `${currentRiskColor}35`,
                          borderWidth: "1px",
                        }}
                      >
                        {currentRiskCategory}
                      </span>
                    </dd>
                  </div>
                </dl>

                {/* Dedicated Progress Bars Strip - Balanced 50/50 Split */}
                <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="uppercase tracking-wider text-foreground/60">
                        Compatibility Spectrum
                      </span>
                      <span
                        className="font-medium transition-colors duration-500"
                        style={{ color: currentMatchColor }}
                      >
                        {currentMatchCategory} ({selectedTender.match}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${selectedTender.match}%`,
                          backgroundColor: currentMatchColor,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="uppercase tracking-wider text-foreground/60">
                        Risk Evaluation
                      </span>
                      <span
                        className="font-medium transition-colors duration-500"
                        style={{ color: currentRiskColor }}
                      >
                        {currentRiskCategory} ({selectedTender.risk}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${selectedTender.risk}%`,
                          backgroundColor: currentRiskColor,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Description Section */}
              <div className="mt-8">
                <h2 className="border-b border-border/60 pb-2 text-xs font-semibold uppercase tracking-tight text-foreground">
                  Description & Scope of Work
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-foreground/80 sm:text-base">
                  {selectedTender.description}
                </p>
              </div>

              {/* Technical Specifications Reference Section */}
              <div className="mt-8 border-t border-border pt-6">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-tight text-foreground">
                  Attached Reference Documents
                </h2>

                <div className="flex items-center justify-between rounded-lg border border-border bg-background p-4 transition-colors hover:border-foreground/30">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-lightgrey/40 font-mono text-xs font-bold text-foreground">
                      DOC
                    </div>
                    <div>
                      <p className="text-sm font-semibold tracking-tight text-foreground">
                        Tender Specifications & Capability Questionnaire
                      </p>
                      <p className="font-mono text-xs text-foreground/60">
                        Official UK Contracts Finder Specification Archive
                      </p>
                    </div>
                  </div>

                  <a
                    href={selectedTender.documentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs font-medium text-ring hover:underline"
                  >
                    Open Link ↗
                  </a>
                </div>
              </div>

              {/* Action Bar */}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-mono text-xs"
                    onClick={() => window.open(selectedTender.documentUrl, "_blank")}
                  >
                    View Source Notice
                  </Button>
                  <Button variant="login" size="sm" className="font-mono text-xs">
                    Draft Proposal
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </SessionGate>
  );
}