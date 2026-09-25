// src/app/page.tsx
"use client";

import * as React from "react";
import { SessionGate } from "@/components/auth/session-gate";
import { Header } from "@/components/layout/landing-header/header";

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

      // Create high-tech tender node particles
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

    // Track mouse coordinates
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };

    const onMouseLeave = () => {
      mouseRef.current.active = false;
    };

    // Emit interactive radar shockwave on click
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

    // Animation Render Loop
    let time = 0;
    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, width, height);

      const mouse = mouseRef.current;

      // 1. Render & update shockwave radar rings
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

        // Secondary inner echo ring
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

      // 2. Update and draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around bounds
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Mouse gravitational attraction & proximity excitement
        let excited = 0;
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            excited = (1 - dist / 180);
            p.x += (dx / dist) * excited * 0.6;
            p.y += (dy / dist) * excited * 0.6;
          }
        }

        // Draw connections between neighboring nodes
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

        // Tether lines directly to cursor when nearby
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

        // Draw particle node
        const pulse = Math.sin(time * 2 + p.pulsePhase) * 0.15;
        const currentAlpha = Math.min(1, p.baseAlpha + pulse + excited * 0.5);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + (excited ? 1.5 : 0), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(216, 51%, 44%, ${currentAlpha})`;
        ctx.fill();

        // Node glow aura when excited by mouse
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
      {/* Interactive Cursor Spotlight Glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: `radial-gradient(circle 500px at var(--mouse-x, 50%) var(--mouse-y, 40%), hsl(216 51% 44% / 0.11), transparent 75%)`,
        }}
      />

      {/* Subtle high-tech background coordinate grid */}
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

      {/* Interactive Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

export default function Home() {
  // Sync mouse position for the CSS spotlight gradient
  React.useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty("--mouse-x", `${e.clientX}px`);
      document.documentElement.style.setProperty("--mouse-y", `${e.clientY}px`);
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  return (
    <SessionGate mode="guest">
      {/* High-tech interactive background */}
      <InteractiveBackground />

      <Header companyName="Proppy" />

      <main className="flex-1 flex flex-col justify-between max-w-4xl mx-auto w-full px-6 py-12 sm:py-16">
        <div>
          {/* Primary headline and summary */}
          <h1 className="mt-4 text-6xl sm:text-6xl font-semibold tracking-tight text-foreground">
            Get government tenders tailored to your company's speciality.
          </h1>

          <p className="mt-4 text-base sm:text-lg leading-relaxed text-foreground/80 max-w-2xl">
            
          </p>

          {/* Structural specifications (Avoiding standard 3-card feature blocks) */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-border pt-10">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground uppercase">
                Step 1:
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">
                Sign your company up for a deal with Proppy.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground uppercase">
                Step 2:
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">
                Find the most suitable and profitable government tenders for your company.
              </p>
            </div>
          </div>

          {/* Technical Data Specification Reference */}
          <div className="mt-10 rounded-xl border border-border bg-background p-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div className="border-b border-border/60 pb-3">
                <dt className="text-xs text-foreground/60">Matches</dt>
                <dd className="mt-1 font-mono text-xs font-medium text-foreground">
                  A specialized AI agent matches your company with the most suitable government tenders. 
                </dd>
              </div>
              <div className="border-b border-border/60 pb-3">
                <dt className="text-xs text-foreground/60">Evaluation</dt>
                <dd className="mt-1 text-xs font-mono font-medium text-foreground">
                  Receive a rating for compatibility and risk assessment.
                </dd>
              </div>
              <div className="border-border/60">
                <dt className="text-xs text-foreground/60">Quick Info</dt>
                <dd className="mt-1 font-mono text-xs font-medium text-foreground">
                  Discover the important details of each tender at a single glance. No sifting through pages of fluff.
                </dd>
              </div>
              <div className="border-border/60">
                <dt className="text-xs text-foreground/60">Draft</dt>
                <dd className="mt-1 text-xs font-mono font-medium text-foreground">
                  Create a drafted proposal for your application at the click of a button.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    </SessionGate>
  );
}
