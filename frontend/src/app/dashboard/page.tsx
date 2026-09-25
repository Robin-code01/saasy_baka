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
import { API_BASE_URL } from "@/lib/auth";
import cn from "@/utils/cn";

const API_ENDPOINT = `${API_BASE_URL}/api/tenders/top-assessments/`;

export interface TenderDocumentItem {
  id?: string;
  title: string;
  url: string;
  format?: string;
  type?: string;
}

export interface Tender {
  id: string | number;
  title: string;
  value: number;
  date: string;
  description: string;
  match: number;
  risk: number;
  fitReason: string;
  riskReason: string;
  documentUrl?: string;
  documents: TenderDocumentItem[];
}

const SAMPLE_TENDERS: Tender[] = [
  {
    id: "sample-1",
    title: "Accessible Public Sector Digital Services & Management Platform",
    value: 200000,
    date: "2026-09-26T12:00:00+00:00",
    match: 88,
    risk: 18,
    fitReason:
      "Direct match with our core capability in web accessibility and digital portal architecture. Scope and delivery timeline align well with our current team capacity.",
    riskReason:
      "Strict delivery schedule with phased release milestones. Requires accredited hosting verification before deployment.",
    description:
      "Comprehensive digital architecture implementation and ongoing maintenance support. Focuses on Web Content Accessibility Guidelines (WCAG 2.2 AA) compliance, unified design systems, and citizen portal management.",
    documentUrl: "https://www.contractsfinder.service.gov.uk/",
    documents: [
      {
        title: "Tender Specification & Requirements Pack",
        url: "https://www.contractsfinder.service.gov.uk/",
        format: "application/pdf",
        type: "biddingDocuments",
      },
      {
        title: "Commercial & Pricing Schedule (Appendix B)",
        url: "https://www.contractsfinder.service.gov.uk/",
        format: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        type: "pricingSchedule",
      },
    ],
  },
  {
    id: "sample-2",
    title: "Cloud Infrastructure Modernisation & Support System",
    value: 580000,
    date: "2026-10-14T17:00:00+00:00",
    match: 75,
    risk: 25,
    fitReason:
      "Strong commercial scale and alignment with cloud migration expertise, though requires specialized security toolkit sign-off.",
    riskReason:
      "Short turnaround for security accreditation compliance and 24/7 on-call requirement during the migration phase.",
    description:
      "Migration of legacy on-premises databases to high-resilience UK sovereign cloud environments.",
    documentUrl: "https://www.contractsfinder.service.gov.uk/",
    documents: [
      {
        title: "Technical Architecture Brief",
        url: "https://www.contractsfinder.service.gov.uk/",
        format: "application/pdf",
        type: "biddingDocuments",
      },
    ],
  },
];

function formatDate(dateStr?: string | null): string {
  if (!dateStr || dateStr === "N/A") return "N/A";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const hasTime = dateStr.includes("T") && !dateStr.includes("T00:00:00");
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

function getDocumentBadge(format?: string, url?: string): string {
  const f = (format || "").toLowerCase();
  const u = (url || "").toLowerCase();
  if (f.includes("pdf") || u.endsWith(".pdf")) return "PDF";
  if (f.includes("word") || f.includes("officedocument.word") || u.endsWith(".doc") || u.endsWith(".docx")) return "DOC";
  if (f.includes("excel") || f.includes("spreadsheet") || u.endsWith(".xls") || u.endsWith(".xlsx") || u.endsWith(".csv")) return "XLS";
  if (f.includes("zip") || u.endsWith(".zip")) return "ZIP";
  if (f.includes("html")) return "LINK";
  return "DOC";
}

async function fetchTenders(): Promise<Tender[]> {
  const res = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ limit: 20 }),
  });

  if (!res.ok) throw new Error("Failed to fetch");
  const data = await res.json();

  return (data.results || []).map((item: any) => {
    const noticeId = item.tender?.notice_id;
    const rawDocs: any[] = Array.isArray(item.tender?.documents) ? item.tender.documents : [];

    const noticeDoc = rawDocs.find(
      (doc: any) =>
        doc.document_type === "tenderNotice" ||
        doc.title?.toLowerCase().includes("notice") ||
        doc.url?.includes("/Notice/")
    );

    const canonicalNoticeUrl =
      (noticeId ? `https://www.contractsfinder.service.gov.uk/Notice/${noticeId}` : null) ||
      noticeDoc?.url ||
      item.tender?.source_url ||
      item.documentUrl ||
      "#";

    const attachedDocuments: TenderDocumentItem[] = rawDocs
      .filter((d: any) => Boolean(d.url) && d.url !== canonicalNoticeUrl)
      .map((d: any) => ({
        id: d.document_id,
        title: d.title || d.document_type || "Tender Document",
        url: d.url,
        format: d.document_format,
        type: d.document_type,
      }));

    return {
      id: item.ocid || item.id,
      title: item.tender?.title || item.title || "Untitled Tender",
      value: item.tender?.value_amount ?? item.value ?? 0,
      date: item.tender?.closing_date || item.date || "N/A",
      description: item.tender?.description || item.description || "",
      match: item.assessment?.recommendation_rating ?? item.match ?? 50,
      risk: item.assessment?.risk_rating ?? item.risk ?? 50,
      fitReason: item.assessment?.fit_reasoning || item.fitReason || "No reasoning provided.",
      riskReason: item.assessment?.risks || item.riskReason || "No specific risks identified.",
      documentUrl: canonicalNoticeUrl,
      documents: attachedDocuments,
    };
  });
}

function InteractiveBackground() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mouseRef = React.useRef<{ x: number; y: number; active: boolean }>({
    x: -1000,
    y: -1000,
    active: false,
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;
    let particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      baseAlpha: number;
      pulsePhase: number;
    }> = [];

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

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);

    let time = 0;
    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 125) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `hsla(216, 51%, 44%, ${(1 - dist / 125) * 0.22})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }

        const pulse = Math.sin(time * 2 + p.pulsePhase) * 0.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(216, 51%, 44%, ${Math.min(1, p.baseAlpha + pulse)})`;
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", initSize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
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

export default function Dashboard() {
  const [tenders, setTenders] = React.useState<Tender[]>(SAMPLE_TENDERS);
  const [selectedId, setSelectedId] = React.useState<string | number>(SAMPLE_TENDERS[0].id);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  // Drafting State
  const [draftingId, setDraftingId] = React.useState<string | number | null>(null);
  const [draftStatus, setDraftStatus] = React.useState<{
    id: string | number;
    type: "success" | "error";
    message: string;
    pdfUrl?: string;
  } | null>(null);

  React.useEffect(() => {
    fetchTenders()
      .then((data) => {
        if (data.length > 0) {
          setTenders(data);
          setSelectedId(data[0].id);
        }
      })
      .catch((err) => {
        console.warn("Using sample tenders (backend unreachable):", err);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const selectedTender =
    tenders.find((t) => t.id === selectedId) || tenders[0] || SAMPLE_TENDERS[0];

  const currentMatchColor = getSmoothMatchColor(selectedTender.match);
  const currentRiskColor = getSmoothRiskColor(selectedTender.risk);
  const currentMatchCategory = getMatchCategory(selectedTender.match);
  const currentRiskCategory = getRiskCategory(selectedTender.risk);

  const handleDraftProposal = async (tender: Tender) => {
    if (draftingId) return;

    setDraftingId(tender.id);
    setDraftStatus(null);

    try {
      const draftUrl = `${API_BASE_URL}/api/tenders/${encodeURIComponent(String(tender.id))}/draft/`;
      const res = await fetch(draftUrl, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        let errorMsg = `Failed to generate draft (Status: ${res.status})`;
        try {
          const errData = await res.json();
          if (errData?.error) errorMsg = errData.error;
          else if (errData?.detail) errorMsg = errData.detail;
        } catch {
          // not JSON
        }
        throw new Error(errorMsg);
      }

      // Check Content-Disposition header for filename
      const disposition = res.headers.get("Content-Disposition");
      let filename = `tender_draft_${tender.id}.pdf`;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, "").trim();
        }
      }

      const blob = await res.blob();
      const pdfObjectUrl = window.URL.createObjectURL(blob);

      // Trigger browser download
      const link = document.createElement("a");
      link.href = pdfObjectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setDraftStatus({
        id: tender.id,
        type: "success",
        message: `Proposal draft downloaded as "${filename}"`,
        pdfUrl: pdfObjectUrl,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to generate proposal draft. Please try again.";
      setDraftStatus({
        id: tender.id,
        type: "error",
        message,
      });
    } finally {
      setDraftingId(null);
    }
  };

  return (
    <SessionGate mode="auth">
      <InteractiveBackground />
      <Header className="relative z-10" companyName="Proppy" />

      <main className="relative z-10 mx-auto flex h-[calc(100vh-64px)] w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid h-full grid-cols-1 gap-6 overflow-hidden lg:grid-cols-12">
          {/* Left Column: Tenders List */}
          <div className="flex h-full min-h-0 flex-col lg:col-span-5">
            <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
              <span className="text-xs font-semibold uppercase tracking-tight text-foreground">
                Matched Tenders
              </span>
              {isLoading && (
                <span className="font-mono text-[11px] text-foreground/50">Loading...</span>
              )}
            </div>

            <div className="custom-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto pr-1 pb-4">
              {tenders.map((tender) => (
                <TenderCard
                  key={tender.id}
                  title={tender.title}
                  value={tender.value}
                  date={formatDate(tender.date)}
                  match={tender.match}
                  risk={tender.risk}
                  isSelected={tender.id === selectedId}
                  onClick={() => setSelectedId(tender.id)}
                />
              ))}
            </div>
          </div>

          {/* Right Column: Selected Tender Details */}
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background/85 shadow-xs backdrop-blur-md lg:col-span-7">
            <div className="custom-scrollbar flex-1 overflow-y-auto p-6 sm:p-8">
              {/* Title */}
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl leading-snug">
                  {selectedTender.title}
                </h1>
              </div>

              {/* Total Value & Deadline */}
              <div className="mt-6 rounded-xl border border-border bg-background p-5">
                <dl className="grid grid-cols-2 gap-6 text-sm">
                  <div>
                    <dt className="text-xs text-foreground/60">Total Value</dt>
                    <dd className="mt-1 font-mono text-base font-semibold text-foreground">
                      ${selectedTender.value.toLocaleString()}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-foreground/60">Deadline</dt>
                    <dd className="mt-1 font-mono text-base font-medium text-foreground">
                      {formatDate(selectedTender.date)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Assessment Evaluations */}
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Match Evaluation */}
                <div className="flex flex-col rounded-xl border border-border bg-background p-5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold uppercase tracking-wider text-foreground">
                      Compatibility
                    </span>
                    <span className="font-bold" style={{ color: currentMatchColor }}>
                      {currentMatchCategory} ({selectedTender.match}%)
                    </span>
                  </div>

                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${selectedTender.match}%`,
                        backgroundColor: currentMatchColor,
                      }}
                    />
                  </div>

                  <div className="mt-4 border-t border-border/60 pt-3">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-foreground/60">
                      Reason for Compatibility
                    </span>
                    <p className="mt-1 text-xs sm:text-sm leading-relaxed text-foreground/80">
                      {selectedTender.fitReason}
                    </p>
                  </div>
                </div>

                {/* Risk Evaluation */}
                <div className="flex flex-col rounded-xl border border-border bg-background p-5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold uppercase tracking-wider text-foreground">
                      Risk Evaluation
                    </span>
                    <span className="font-bold" style={{ color: currentRiskColor }}>
                      {currentRiskCategory} ({selectedTender.risk}%)
                    </span>
                  </div>

                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${selectedTender.risk}%`,
                        backgroundColor: currentRiskColor,
                      }}
                    />
                  </div>

                  <div className="mt-4 border-t border-border/60 pt-3">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-foreground/60">
                      Reason for Risk
                    </span>
                    <p className="mt-1 text-xs sm:text-sm leading-relaxed text-foreground/80">
                      {selectedTender.riskReason}
                    </p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="mt-8">
                <h2 className="border-b border-border/60 pb-2 text-xs font-semibold uppercase tracking-tight text-foreground">
                  Description & Scope of Work
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-foreground/80 sm:text-base">
                  {selectedTender.description}
                </p>
              </div>

              {/* Attached Documents & Links */}
              {selectedTender.documents && selectedTender.documents.length > 0 && (
                <div className="mt-8">
                  <h2 className="border-b border-border/60 pb-2 text-xs font-semibold uppercase tracking-tight text-foreground">
                    Attached Documents & Links
                  </h2>
                  <div className="mt-3 flex flex-col gap-2">
                    {selectedTender.documents.map((doc, idx) => (
                      <a
                        key={idx}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between rounded-lg border border-border bg-background p-3 transition hover:border-foreground/30 hover:bg-lightgrey/30"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="shrink-0 rounded bg-border/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                            {getDocumentBadge(doc.format, doc.url)}
                          </span>
                          <span className="truncate text-xs font-medium text-foreground group-hover:underline">
                            {doc.title}
                          </span>
                        </div>
                        <svg
                          className="h-3.5 w-3.5 shrink-0 text-foreground/40 transition group-hover:text-foreground"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions Footer */}
              <div className="mt-8 border-t border-border/60 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button
                      variant="login"
                      size="sm"
                      isLoading={draftingId === selectedTender.id}
                      onClick={() => handleDraftProposal(selectedTender)}
                      className="font-mono text-xs whitespace-nowrap shrink-0 transition-all hover:opacity-90 cursor-pointer"
                      icon={
                        <svg
                          className="mr-1.5 h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                          />
                        </svg>
                      }
                    >
                      {draftingId === selectedTender.id
                        ? "Generating AI Draft..."
                        : "Draft Proposal"}
                    </Button>

                    {draftStatus?.id === selectedTender.id &&
                      draftStatus.type === "success" &&
                      draftStatus.pdfUrl && (
                        <a
                          href={draftStatus.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-4xl border border-border bg-background px-3 py-1.5 font-mono text-xs font-medium text-foreground transition hover:border-foreground/30 hover:bg-lightgrey/30"
                        >
                          <svg
                            className="h-3.5 w-3.5 text-foreground/60"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                          View in Browser
                        </a>
                      )}
                  </div>
                </div>

                {/* Draft Status Feedback Banner */}
                {draftStatus?.id === selectedTender.id && (
                  <div
                    className={cn(
                      "mt-3 flex items-center justify-between rounded-lg border p-3 text-xs transition-all",
                      draftStatus.type === "success"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                        : "border-red-500/30 bg-red-500/10 text-red-700"
                    )}
                  >
                    <div className="flex items-center gap-2 font-mono">
                      {draftStatus.type === "success" ? (
                        <svg
                          className="h-4 w-4 shrink-0 text-emerald-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="h-4 w-4 shrink-0 text-red-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      )}
                      <span>{draftStatus.message}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDraftStatus(null)}
                      className="ml-3 text-xs opacity-60 hover:opacity-100 cursor-pointer"
                      aria-label="Dismiss message"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </SessionGate>
  );
}