// src/app/profile/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { SessionGate } from "@/components/auth/session-gate";
import { DashboardHeader } from "@/components/layout/dashboard-header/header";
import { Button } from "@/components/ui/button";
import { API_BASE_URL, getSession } from "@/lib/auth";
import cn from "@/utils/cn";

interface CompanyFormState {
  companyName: string;
  website: string;
  companySize: string;
  overview: string;
  services: string;
  sectors: string;
  delivery: string;
  compliance: string;
  exclusions: string;
}

const INITIAL_FORM: CompanyFormState = {
  companyName: "",
  website: "",
  companySize: "",
  overview: "",
  services: "",
  sectors: "",
  delivery: "",
  compliance: "",
  exclusions: "",
};

const SAMPLE_FORM: CompanyFormState = {
  companyName: "Acme Digital Solutions Ltd",
  website: "https://acmesolutions.example.co.uk",
  companySize: "32 full-time staff (SME) • £3.8M annual turnover",
  overview:
    "We are a digital architecture consultancy delivering modern web applications, cloud hosting migrations, and digital accessibility compliance. Operating across England, Wales, and Scotland, with typical project values ranging between £100,000 and £1.8M.",
  services:
    "- Citizen-facing web portals and CMS platforms\n- Web Content Accessibility Guidelines (WCAG 2.2 AA) audits & remediation\n- Public cloud migrations (AWS & Azure sovereign regions)\n- 24/7 managed infrastructure support and SLA maintenance\n- Secure REST/GraphQL API integration and database modernization",
  sectors:
    "- Local councils and regional authorities\n- NHS Trusts and healthcare public bodies\n- Central government executive agencies\n- Higher education and research institutions",
  delivery:
    "Agile delivery with certified Scrum Masters, in-house UX/UI designers, and senior cloud architects. We run secure based DevOps pipelines, and source specialist technical contractors exclusively through vetted Crown Commercial Service channels.",
  compliance:
    "- Cyber Essentials Plus certified\n- ISO 27001 (Information Security) & ISO 9001 (Quality Management)\n- £5M Professional Indemnity & £10M Public Liability insurance\n- SC (Security Check) cleared engineers available",
  exclusions:
    "- No hardware manufacturing or physical cabling installation\n- No legacy mainframe/COBOL systems maintenance\n- No overseas data storage (EEA hosting only)\n- Cannot take on single projects exceeding £3M without joint-venture partners",
};

const FORM_DATA_PREFIX = "<!--proppy-form-data:";
const FORM_DATA_SUFFIX = ":proppy-form-data-->";
const LOCAL_STORAGE_KEY = "proppy_company_form_state";

function getUserFormStorageKey(): string {
  const session = getSession();
  return session?.user_id
    ? `${LOCAL_STORAGE_KEY}_${session.user_id}`
    : LOCAL_STORAGE_KEY;
}

/**
 * Strips legacy leaked header artifacts that were accidentally appended in previous versions.
 */
function cleanLegacyField(val: string, badPrefixes: string[] = []): string {
  let cleaned = val.trim();
  for (const prefix of badPrefixes) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^(?:#+\\s*|[-*]\\s*)?${escaped}\\s*:?\\s*`, "i");
    cleaned = cleaned.replace(regex, "").trim();
  }
  return cleaned;
}

/**
 * Robustly parses saved raw_information without contaminating field values with header text.
 */
function parseRawInformation(text: string): CompanyFormState {
  if (!text || typeof text !== "string") return INITIAL_FORM;

  // 1. Lossless path: extract embedded JSON metadata if present
  const startIdx = text.indexOf(FORM_DATA_PREFIX);
  const endIdx = text.indexOf(FORM_DATA_SUFFIX);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    try {
      const jsonStr = text.substring(startIdx + FORM_DATA_PREFIX.length, endIdx);
      const parsed = JSON.parse(jsonStr);
      return {
        companyName: typeof parsed.companyName === "string" ? parsed.companyName : "",
        website: typeof parsed.website === "string" ? parsed.website : "",
        companySize: typeof parsed.companySize === "string" ? parsed.companySize : "",
        overview: typeof parsed.overview === "string" ? parsed.overview : "",
        services: typeof parsed.services === "string" ? parsed.services : "",
        sectors: typeof parsed.sectors === "string" ? parsed.sectors : "",
        delivery: typeof parsed.delivery === "string" ? parsed.delivery : "",
        compliance: typeof parsed.compliance === "string" ? parsed.compliance : "",
        exclusions: typeof parsed.exclusions === "string" ? parsed.exclusions : "",
      };
    } catch (e) {
      console.warn("Could not parse embedded JSON metadata:", e);
    }
  }

  // 2. Direct JSON payload fallback
  const trimmedText = text.trim();
  if (trimmedText.startsWith("{") && trimmedText.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmedText);
      return {
        companyName: typeof parsed.companyName === "string" ? parsed.companyName : "",
        website: typeof parsed.website === "string" ? parsed.website : "",
        companySize: typeof parsed.companySize === "string" ? parsed.companySize : "",
        overview: typeof parsed.overview === "string" ? parsed.overview : "",
        services: typeof parsed.services === "string" ? parsed.services : "",
        sectors: typeof parsed.sectors === "string" ? parsed.sectors : "",
        delivery: typeof parsed.delivery === "string" ? parsed.delivery : "",
        compliance: typeof parsed.compliance === "string" ? parsed.compliance : "",
        exclusions: typeof parsed.exclusions === "string" ? parsed.exclusions : "",
      };
    } catch {}
  }

  // 3. Resilient Markdown/KV line parser for legacy data
  const lines = text.split("\n");
  let currentKey: keyof CompanyFormState | null = null;
  const captured: Record<keyof CompanyFormState, string[]> = {
    companyName: [],
    website: [],
    companySize: [],
    overview: [],
    services: [],
    sectors: [],
    delivery: [],
    compliance: [],
    exclusions: [],
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("<!--") || trimmed.endsWith("-->")) continue;

    // Check section boundaries strictly at the start of lines
    if (/^#{1,3}\s+(company\s+)?overview/i.test(trimmed)) {
      currentKey = "overview";
      continue;
    }
    if (/^#{1,3}\s+(core\s+)?services/i.test(trimmed)) {
      currentKey = "services";
      continue;
    }
    if (/^#{1,3}\s+(typical\s+)?(client\s+)?sectors/i.test(trimmed)) {
      currentKey = "sectors";
      continue;
    }
    if (/^#{1,3}\s+delivery\s+capabilities/i.test(trimmed)) {
      currentKey = "delivery";
      continue;
    }
    if (
      /^#{1,3}\s+quality(,\s*safety)?(\s*(&|and)\s*compliance)?/i.test(trimmed) ||
      /^#{1,3}\s+compliance/i.test(trimmed)
    ) {
      currentKey = "compliance";
      continue;
    }
    if (/^#{1,3}\s+constraints/i.test(trimmed) || /^#{1,3}\s+exclusions/i.test(trimmed)) {
      currentKey = "exclusions";
      continue;
    }

    // Top-level single-line metadata
    if (/^company\s+name\s*:/i.test(trimmed)) {
      currentKey = "companyName";
      const val = trimmed.replace(/^company\s+name\s*:\s*/i, "").trim();
      if (val) captured.companyName.push(val);
      continue;
    }
    if (/^website\s*:/i.test(trimmed)) {
      currentKey = "website";
      let val = trimmed.replace(/^website\s*:\s*/i, "").trim();
      // Repair legacy bug where "Company Size & Capacity:" was accidentally merged into the website line
      if (/company\s+size/i.test(val)) {
        const parts = val.split(/company\s+size(?:\s*&\s*capacity)?\s*:\s*/i);
        val = parts[0]?.trim() || "";
        const sizePart = parts[1]?.trim();
        if (sizePart) captured.companySize.push(sizePart);
      }
      if (val) captured.website.push(val);
      continue;
    }
    if (/^(company\s+size(?:\s*&\s*capacity)?|team\s+size|headcount)\s*:/i.test(trimmed)) {
      currentKey = "companySize";
      const val = trimmed
        .replace(/^(company\s+size(?:\s*&\s*capacity)?|team\s+size|headcount)\s*:\s*/i, "")
        .trim();
      if (val) captured.companySize.push(val);
      continue;
    }

    // Capture content lines
    if (currentKey) {
      if (/^#{1,3}\s+/i.test(trimmed)) continue; // ignore stray duplicate header lines
      captured[currentKey].push(trimmed);
    } else if (!trimmed.startsWith("#")) {
      captured.overview.push(trimmed);
    }
  }

  return {
    companyName: captured.companyName.join(" ").trim(),
    website: captured.website.join(" ").trim(),
    companySize: captured.companySize.join(" ").trim(),
    overview: cleanLegacyField(captured.overview.join("\n"), ["Company Overview", "Overview"]),
    services: cleanLegacyField(captured.services.join("\n"), ["Core Services", "Services"]),
    sectors: cleanLegacyField(captured.sectors.join("\n"), [
      "Typical Client Sectors",
      "Client Sectors",
      "Sectors",
    ]),
    delivery: cleanLegacyField(captured.delivery.join("\n"), [
      "& Supply Chain",
      "Delivery Capabilities & Supply Chain",
      "Delivery Capabilities and Supply Chain",
      "Delivery Capabilities",
    ]),
    compliance: cleanLegacyField(captured.compliance.join("\n"), [
      "Quality, Safety, and Compliance",
      "Quality, Safety and Compliance",
      "Quality and Compliance",
      "Compliance",
    ]),
    exclusions: cleanLegacyField(captured.exclusions.join("\n"), [
      "Constraints & Exclusions",
      "Constraints and Exclusions",
      "Constraints",
      "Exclusions",
    ]),
  };
}

/**
 * Compiles the form with embedded metadata so subsequent loads remain 100% faithful to user inputs.
 */
function compileRawInformation(form: CompanyFormState): string {
  const parts: string[] = [];

  // Embed lossless metadata JSON for deterministic reconstruction
  parts.push(`${FORM_DATA_PREFIX}${JSON.stringify(form)}${FORM_DATA_SUFFIX}`);

  if (form.companyName.trim()) {
    parts.push(`Company Name: ${form.companyName.trim()}`);
  }
  if (form.website.trim()) {
    parts.push(`Website: ${form.website.trim()}`);
  }
  if (form.companySize.trim()) {
    parts.push(`Company Size & Capacity: ${form.companySize.trim()}`);
  }
  if (form.overview.trim()) {
    parts.push(`## Company Overview\n${form.overview.trim()}`);
  }
  if (form.services.trim()) {
    parts.push(`## Core Services\n${form.services.trim()}`);
  }
  if (form.sectors.trim()) {
    parts.push(`## Typical Client Sectors\n${form.sectors.trim()}`);
  }
  if (form.delivery.trim()) {
    parts.push(`## Delivery Capabilities & Supply Chain\n${form.delivery.trim()}`);
  }
  if (form.compliance.trim()) {
    parts.push(`## Quality, Safety, and Compliance\n${form.compliance.trim()}`);
  }
  if (form.exclusions.trim()) {
    parts.push(`## Constraints & Exclusions\n${form.exclusions.trim()}`);
  }

  return parts.join("\n\n");
}

/**
 * Dependency-free Markdown viewer for clean display of the generated capability dossier.
 */
function MarkdownViewer({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = (key: string) => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={key} className="my-2.5 space-y-1.5 list-disc pl-5 text-xs sm:text-sm text-foreground/90">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  const renderInline = (text: string) => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(
          <strong key={match.index} className="font-bold text-foreground">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(
          <em key={match.index} className="italic text-foreground/90">
            {token.slice(1, -1)}
          </em>
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(
          <code
            key={match.index}
            className="rounded bg-stone-200/80 px-1 py-0.5 font-mono text-xs text-foreground"
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    return parts.length > 0 ? parts : text;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList(`list-${i}`);
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushList(`list-${i}`);
      elements.push(
        <h3
          key={`h3-${i}`}
          className="mt-4 mb-1.5 text-xs sm:text-sm font-bold tracking-tight text-foreground uppercase font-mono"
        >
          {renderInline(trimmed.substring(4))}
        </h3>
      );
    } else if (trimmed.startsWith("## ")) {
      flushList(`list-${i}`);
      elements.push(
        <h2
          key={`h2-${i}`}
          className="mt-5 mb-2 border-b border-border pb-1.5 text-sm sm:text-base font-bold tracking-tight text-foreground"
        >
          {renderInline(trimmed.substring(3))}
        </h2>
      );
    } else if (trimmed.startsWith("# ")) {
      flushList(`list-${i}`);
      elements.push(
        <h1
          key={`h1-${i}`}
          className="mt-2 mb-3 text-base sm:text-lg font-bold tracking-tight text-foreground"
        >
          {renderInline(trimmed.substring(2))}
        </h1>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      inList = true;
      listItems.push(
        <li key={`li-${i}`} className="leading-relaxed">
          {renderInline(trimmed.substring(2))}
        </li>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushList(`list-${i}`);
      const textAfterNumber = trimmed.replace(/^\d+\.\s/, "");
      elements.push(
        <div key={`ol-${i}`} className="ml-2 my-1 flex gap-2 text-xs sm:text-sm leading-relaxed text-foreground/90">
          <span className="font-mono text-xs font-bold text-stone-500">
            {trimmed.match(/^\d+/)?.[0]}.
          </span>
          <div>{renderInline(textAfterNumber)}</div>
        </div>
      );
    } else {
      flushList(`list-${i}`);
      elements.push(
        <p key={`p-${i}`} className="mb-2.5 text-xs sm:text-sm leading-relaxed text-foreground/90 font-medium">
          {renderInline(trimmed)}
        </p>
      );
    }
  }

  flushList("list-end");
  return <div className="space-y-1">{elements}</div>;
}

function InteractiveBackground() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

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
            ctx.strokeStyle = `hsla(28, 80%, 42%, ${(1 - dist / 125) * 0.24})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }

        const pulse = Math.sin(time * 2 + p.pulsePhase) * 0.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(28, 80%, 42%, ${Math.min(1, p.baseAlpha + pulse)})`;
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", initSize);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(circle 500px at var(--mouse-x, 50%) var(--mouse-y, 40%), hsl(28 90% 45% / 0.12), transparent 75%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(32 14% 74% / 0.6) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(32 14% 74% / 0.6) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

export default function Profile() {
  const [form, setForm] = React.useState<CompanyFormState>(INITIAL_FORM);
  const [markdownContext, setMarkdownContext] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isGenerating, setIsGenerating] = React.useState<boolean>(false);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [isReassessing, setIsReassessing] = React.useState<boolean>(false);
  const [activeTab, setActiveTab] = React.useState<"preview" | "edit">("preview");
  const [copied, setCopied] = React.useState<boolean>(false);
  const [statusMessage, setStatusMessage] = React.useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Initialize cached form from localStorage on mount (instant recovery)
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const storageKey = getUserFormStorageKey();
        const cached = localStorage.getItem(storageKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === "object") {
            setForm((prev) => ({ ...prev, ...parsed }));
          }
        } else {
          setForm(INITIAL_FORM);
        }
      } catch {}
    }
  }, []);

  // Load existing profile from backend on mount
  React.useEffect(() => {
    async function fetchProfile() {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/profile/business-info/`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          const storageKey = getUserFormStorageKey();

          if (data.raw_information) {
            const parsedForm = parseRawInformation(data.raw_information);
            setForm(parsedForm);
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem(storageKey, JSON.stringify(parsedForm));
              } catch {}
            }
          } else {
            // New or empty profile: reset to initial if no active draft exists for this specific user
            const hasDraft =
              typeof window !== "undefined" && Boolean(localStorage.getItem(storageKey));
            if (!hasDraft) {
              setForm(INITIAL_FORM);
            }
          }

          if (data.markdown_context) {
            setMarkdownContext(data.markdown_context);
          } else {
            setMarkdownContext("");
          }
        }
      } catch (err) {
        console.warn("Could not load existing profile:", err);
      } finally {
        setIsLoading(false);
      }
    }

    void fetchProfile();
  }, []);

  const handleFieldChange = (field: keyof CompanyFormState, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(getUserFormStorageKey(), JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  const handleAutoFillExample = () => {
    setForm(SAMPLE_FORM);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(getUserFormStorageKey(), JSON.stringify(SAMPLE_FORM));
      } catch {}
    }
    setStatusMessage({
      type: "info",
      text: "Realistic contractor example inserted. Review or tweak any answers, then click 'Generate AI Capabilities Profile'.",
    });
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const compiledRaw = compileRawInformation(form);
    if (!compiledRaw.trim() || (!form.companyName.trim() && !form.services.trim())) {
      setStatusMessage({
        type: "error",
        text: "Please provide at least your company name and core services before generating.",
      });
      return;
    }

    setIsGenerating(true);
    setStatusMessage(null);

    try {
      // 1. Generate the Markdown capability dossier
      const res = await fetch(`${API_BASE_URL}/api/profile/business-info/generate/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ raw_information: compiledRaw }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || data?.detail || "Failed to generate capability profile.");
      }

      const generated = data.markdown_context || "";
      setMarkdownContext(generated);
      setActiveTab("preview");

      // 2. Assess active tenders against the new profile
      const assessRes = await fetch(`${API_BASE_URL}/api/tenders/assess-active/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ limit: 20 }),
      });

      const assessData = await assessRes.json().catch(() => null);

      if (!assessRes.ok) {
        const errorMsg =
          assessData?.error || assessData?.detail || `Endpoint error HTTP ${assessRes.status}`;
        setStatusMessage({
          type: "error",
          text: `Profile generated, but assessment endpoint failed: ${errorMsg}`,
        });
        return;
      }

      const assessedCount = assessData?.assessed ?? 0;
      const failedCount = assessData?.failed ?? 0;
      const selectedCount = assessData?.selected_active_tenders ?? 0;
      const failureList = assessData?.failures ? Object.values(assessData.failures) : [];

      if (failedCount > 0 && assessedCount === 0) {
        const firstReason = failureList[0] || "Unknown assessment failure";
        setStatusMessage({
          type: "error",
          text: `Profile saved, but tenders failed to assess: "${firstReason}". Check backend .env/API key.`,
        });
      } else if (selectedCount === 0) {
        setStatusMessage({
          type: "info",
          text: "Profile saved, but no active tenders were found in the database to assess.",
        });
      } else if (failedCount > 0) {
        setStatusMessage({
          type: "info",
          text: `Profile saved! ${assessedCount} tender(s) assessed (${failedCount} failed). Check the dashboard.`,
        });
      } else {
        setStatusMessage({
          type: "success",
          text: `Profile saved and ${assessedCount} active tender(s) successfully assessed! Click "View Matched Tenders" to see them.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI generation failed. Please try again.";
      setStatusMessage({
        type: "error",
        text: msg,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Saves manual markdown changes, with optional immediate tender re-assessment.
   */
  const handleSaveMarkdown = async (shouldAssess = false) => {
    if (!markdownContext.trim()) {
      setStatusMessage({
        type: "error",
        text: "Markdown capability content cannot be empty.",
      });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/business-info/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ markdown_context: markdownContext }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Failed to save capability changes.");
      }

      if (shouldAssess) {
        const assessRes = await fetch(`${API_BASE_URL}/api/tenders/assess-active/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ limit: 20 }),
        });
        const assessData = await assessRes.json().catch(() => null);
        const assessedCount = assessData?.assessed ?? 0;

        setStatusMessage({
          type: "success",
          text: `Markdown profile saved and ${assessedCount} active tender(s) re-assessed against your edits!`,
        });
      } else {
        setStatusMessage({
          type: "success",
          text: "Markdown capability profile updated successfully.",
        });
      }

      setActiveTab("preview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update profile.";
      setStatusMessage({
        type: "error",
        text: msg,
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Re-evaluates tenders against current markdown context on demand without regenerating text.
   */
  const handleReassessOnly = async () => {
    if (!markdownContext.trim()) {
      setStatusMessage({
        type: "error",
        text: "Please generate or save a capability profile before running tender matching.",
      });
      return;
    }

    setIsReassessing(true);
    setStatusMessage(null);

    try {
      const assessRes = await fetch(`${API_BASE_URL}/api/tenders/assess-active/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ limit: 20 }),
      });
      const assessData = await assessRes.json().catch(() => null);

      if (!assessRes.ok) {
        throw new Error(assessData?.error || "Tender matching failed.");
      }

      const assessedCount = assessData?.assessed ?? 0;
      setStatusMessage({
        type: "success",
        text: `${assessedCount} active tender(s) evaluated against your capability dossier!`,
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Tender matching failed.",
      });
    } finally {
      setIsReassessing(false);
    }
  };

  const handleDownload = () => {
    if (!markdownContext) return;
    const blob = new Blob([markdownContext], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "company_capabilities_profile.md";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    if (!markdownContext) return;
    void navigator.clipboard.writeText(markdownContext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SessionGate mode="auth">
      <InteractiveBackground />
      <DashboardHeader className="relative z-10" companyName="Proppy" />

      <main className="relative z-10 mx-auto flex h-[calc(100vh-64px)] w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        {/* Top Header / Breadcrumb Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Company Setup & Capabilities
              </span>
              {markdownContext ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Matching Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                  Profile Incomplete
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-foreground/75">
              Answer the prompts below or edit your capability dossier directly. Proppy evaluates tender compatibility against your profile.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-4xl border border-border bg-white px-3.5 py-1.5 font-mono text-xs font-bold text-foreground shadow-2xs transition hover:border-foreground/60 hover:bg-stone-50"
            >
              <svg
                className="h-3.5 w-3.5 text-stone-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              View Matched Tenders
            </Link>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {statusMessage && (
          <div
            className={cn(
              "mb-4 flex items-center justify-between rounded-lg border p-3 text-xs font-semibold shrink-0 transition-all shadow-xs",
              statusMessage.type === "success" && "border-emerald-700 bg-emerald-50 text-emerald-950",
              statusMessage.type === "error" && "border-red-700 bg-red-50 text-red-950",
              statusMessage.type === "info" && "border-amber-700 bg-amber-50 text-amber-950"
            )}
          >
            <div className="flex items-center gap-2 font-mono">
              {statusMessage.type === "success" && (
                <svg className="h-4 w-4 shrink-0 text-emerald-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {statusMessage.type === "error" && (
                <svg className="h-4 w-4 shrink-0 text-red-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {statusMessage.type === "info" && (
                <svg className="h-4 w-4 shrink-0 text-amber-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span>{statusMessage.text}</span>
            </div>

            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="ml-3 text-xs opacity-75 hover:opacity-100 cursor-pointer"
              aria-label="Dismiss feedback"
            >
              ✕
            </button>
          </div>
        )}

        {/* Two-Column Setup Layout */}
        <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-12">
          {/* Left Column: Structured Guided Questions Form */}
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm lg:col-span-5">
            <div className="flex items-center justify-between border-b border-border bg-stone-50/75 px-5 py-3.5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 font-mono text-[10px] font-bold text-white">
                  1
                </span>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
                  Business Details & Questionnaire
                </span>
              </div>

              <button
                type="button"
                onClick={handleAutoFillExample}
                className="text-[11px] font-mono font-bold text-amber-800 hover:text-amber-900 hover:underline cursor-pointer"
              >
                Auto-fill Example
              </button>
            </div>

            {/* Guided Form */}
            <form onSubmit={handleGenerate} className="flex flex-1 min-h-0 flex-col p-5">
              <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
                {/* 1. Identity & Scale */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="comp-name" className="block text-xs font-bold uppercase tracking-wider text-stone-700 font-mono">
                      Company Name
                    </label>
                    <input
                      id="comp-name"
                      type="text"
                      value={form.companyName}
                      onChange={(e) => handleFieldChange("companyName", e.target.value)}
                      placeholder="e.g. Apex Digital Solutions Ltd"
                      className="mt-1.5 w-full rounded-lg border border-border bg-stone-50/50 px-3 py-2 text-xs sm:text-sm text-foreground placeholder:text-stone-400 focus:border-foreground focus:bg-white focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="comp-website" className="block text-xs font-bold uppercase tracking-wider text-stone-700 font-mono">
                      Website (Optional)
                    </label>
                    <input
                      id="comp-website"
                      type="text"
                      value={form.website}
                      onChange={(e) => handleFieldChange("website", e.target.value)}
                      placeholder="e.g. https://apexsolutions.co.uk"
                      className="mt-1.5 w-full rounded-lg border border-border bg-stone-50/50 px-3 py-2 text-xs sm:text-sm text-foreground placeholder:text-stone-400 focus:border-foreground focus:bg-white focus:outline-none transition"
                    />
                  </div>
                </div>

                {/* Company Scale / Capacity */}
                <div>
                  <label htmlFor="comp-size" className="block text-xs font-bold uppercase tracking-wider text-stone-700 font-mono">
                    Company Size & Capacity
                  </label>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    Team headcount, SME scale, or annual turnover (helps match suitability thresholds).
                  </p>
                  <input
                    id="comp-size"
                    type="text"
                    value={form.companySize}
                    onChange={(e) => handleFieldChange("companySize", e.target.value)}
                    placeholder="e.g. 25 full-time engineers (Medium SME) • £2.5M turnover"
                    className="mt-1.5 w-full rounded-lg border border-border bg-stone-50/50 px-3 py-2 text-xs sm:text-sm text-foreground placeholder:text-stone-400 focus:border-foreground focus:bg-white focus:outline-none transition"
                  />
                </div>

                {/* 2. Company Overview */}
                <div>
                  <label htmlFor="comp-overview" className="block text-xs font-bold uppercase tracking-wider text-stone-700 font-mono">
                    Company Overview
                  </label>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    Describe your core business, target delivery regions, and typical project sizes.
                  </p>
                  <textarea
                    id="comp-overview"
                    rows={2}
                    value={form.overview}
                    onChange={(e) => handleFieldChange("overview", e.target.value)}
                    placeholder="e.g. A digital contractor delivering cloud infrastructure and portal software across England & Wales."
                    className="custom-scrollbar mt-1.5 w-full resize-none rounded-lg border border-border bg-stone-50/50 p-2.5 text-xs sm:text-sm text-foreground placeholder:text-stone-400 focus:border-foreground focus:bg-white focus:outline-none transition"
                  />
                </div>

                {/* 3. Core Services */}
                <div>
                  <label htmlFor="comp-services" className="block text-xs font-bold uppercase tracking-wider text-stone-700 font-mono">
                    Core Services & Capabilities
                  </label>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    What specific services do you deliver?
                  </p>
                  <textarea
                    id="comp-services"
                    rows={3}
                    value={form.services}
                    onChange={(e) => handleFieldChange("services", e.target.value)}
                    placeholder="e.g. WCAG 2.2 AA accessibility audits, public cloud migration (AWS/Azure), citizen self-service portals"
                    className="custom-scrollbar mt-1.5 w-full resize-none rounded-lg border border-border bg-stone-50/50 p-2.5 text-xs sm:text-sm text-foreground placeholder:text-stone-400 focus:border-foreground focus:bg-white focus:outline-none transition"
                  />
                </div>

                {/* 4. Typical Client Sectors */}
                <div>
                  <label htmlFor="comp-sectors" className="block text-xs font-bold uppercase tracking-wider text-stone-700 font-mono">
                    Typical Client Sectors
                  </label>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    Who do you usually work for? (e.g. councils, NHS trusts, education).
                  </p>
                  <textarea
                    id="comp-sectors"
                    rows={2}
                    value={form.sectors}
                    onChange={(e) => handleFieldChange("sectors", e.target.value)}
                    placeholder="e.g. Local authorities, NHS Trusts, education providers, central government departments"
                    className="custom-scrollbar mt-1.5 w-full resize-none rounded-lg border border-border bg-stone-50/50 p-2.5 text-xs sm:text-sm text-foreground placeholder:text-stone-400 focus:border-foreground focus:bg-white focus:outline-none transition"
                  />
                </div>

                {/* 5. Delivery Capabilities & Supply Chain */}
                <div>
                  <label htmlFor="comp-delivery" className="block text-xs font-bold uppercase tracking-wider text-stone-700 font-mono">
                    Delivery Capabilities & Supply Chain
                  </label>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    Describe your project delivery approach, management, and subcontractors.
                  </p>
                  <textarea
                    id="comp-delivery"
                    rows={2}
                    value={form.delivery}
                    onChange={(e) => handleFieldChange("delivery", e.target.value)}
                    placeholder="e.g. Agile delivery with certified project managers, in-house technical leads, and vetted subcontractors"
                    className="custom-scrollbar mt-1.5 w-full resize-none rounded-lg border border-border bg-stone-50/50 p-2.5 text-xs sm:text-sm text-foreground placeholder:text-stone-400 focus:border-foreground focus:bg-white focus:outline-none transition"
                  />
                </div>

                {/* 6. Quality, Safety, and Compliance */}
                <div>
                  <label htmlFor="comp-compliance" className="block text-xs font-bold uppercase tracking-wider text-stone-700 font-mono">
                    Quality, Safety, and Compliance
                  </label>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    What certifications or standards do you hold?
                  </p>
                  <textarea
                    id="comp-compliance"
                    rows={2}
                    value={form.compliance}
                    onChange={(e) => handleFieldChange("compliance", e.target.value)}
                    placeholder="e.g. Cyber Essentials Plus, ISO 27001, £5M Professional Indemnity, SC cleared personnel"
                    className="custom-scrollbar mt-1.5 w-full resize-none rounded-lg border border-border bg-stone-50/50 p-2.5 text-xs sm:text-sm text-foreground placeholder:text-stone-400 focus:border-foreground focus:bg-white focus:outline-none transition"
                  />
                </div>

                {/* 7. Constraints & Exclusions */}
                <div>
                  <label htmlFor="comp-exclusions" className="block text-xs font-bold uppercase tracking-wider text-stone-700 font-mono">
                    Constraints & Exclusions
                  </label>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    What kind of work do you NOT do? (Crucial for risk calculation).
                  </p>
                  <textarea
                    id="comp-exclusions"
                    rows={2}
                    value={form.exclusions}
                    onChange={(e) => handleFieldChange("exclusions", e.target.value)}
                    placeholder="e.g. No projects exceeding £2.5M, no overseas hosting, no hardware/cabling installation"
                    className="custom-scrollbar mt-1.5 w-full resize-none rounded-lg border border-border bg-stone-50/50 p-2.5 text-xs sm:text-sm text-foreground placeholder:text-stone-400 focus:border-foreground focus:bg-white focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Action Bar Footer */}
              <div className="mt-4 border-t border-border pt-4 shrink-0 flex items-center justify-end">
                <Button
                  type="submit"
                  size="sm"
                  isLoading={isGenerating}
                  className="font-mono text-xs shadow-xs bg-stone-900 hover:bg-stone-800 text-stone-50 transition hover:opacity-95 cursor-pointer"
                  icon={
                    <svg
                      className="mr-1.5 h-3.5 w-3.5 text-amber-400"
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
                  {isGenerating ? "Synthesizing AI Profile..." : "Generate AI Capabilities Profile"}
                </Button>
              </div>
            </form>
          </div>

          {/* Right Column: AI-Synthesized Capability Profile Dossier */}
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm lg:col-span-7">
            {/* Panel Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-stone-50/75 px-5 py-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 font-mono text-[10px] font-bold text-white">
                  2
                </span>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
                  AI Capabilities Dossier (.md)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Always-accessible View/Edit Mode Tabs */}
                <div className="inline-flex rounded-lg border border-border bg-white p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab("preview")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-mono text-[11px] font-bold transition cursor-pointer",
                      activeTab === "preview"
                        ? "bg-stone-900 text-white"
                        : "text-stone-600 hover:text-foreground"
                    )}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("edit")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-mono text-[11px] font-bold transition cursor-pointer",
                      activeTab === "edit"
                        ? "bg-stone-900 text-white"
                        : "text-stone-600 hover:text-foreground"
                    )}
                  >
                    Edit Markdown
                  </button>
                </div>

                {markdownContext ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-stone-700 shadow-2xs hover:bg-stone-50 cursor-pointer"
                      title="Copy markdown content"
                    >
                      {copied ? (
                        <span className="text-emerald-700">Copied!</span>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownload}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-stone-700 shadow-2xs hover:bg-stone-50 cursor-pointer"
                      title="Download as .md file for business use"
                    >
                      <svg className="h-3.5 w-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download .md
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {/* Panel Body Content */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-5">
              {isLoading ? (
                <div className="flex h-full items-center justify-center text-xs font-mono font-bold text-stone-500">
                  Loading company profile...
                </div>
              ) : activeTab === "edit" ? (
                /* Editable Markdown View */
                <div className="flex-1 min-h-0 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs text-stone-600 font-mono">
                    <span>Direct Markdown Editor</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("preview")}
                      className="text-amber-800 hover:underline cursor-pointer"
                    >
                      Switch to Formatted Preview &rarr;
                    </button>
                  </div>
                  <textarea
                    value={markdownContext}
                    onChange={(e) => setMarkdownContext(e.target.value)}
                    placeholder="# Company Name: Acme Ltd&#10;&#10;## Company Overview&#10;Write or paste your company capability profile in Markdown here..."
                    className="custom-scrollbar flex-1 w-full resize-none rounded-lg border border-border bg-stone-50/50 p-3.5 font-mono text-xs leading-relaxed text-foreground placeholder:text-stone-400 focus:border-foreground focus:bg-white focus:outline-none transition"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isLoading={isSaving}
                      onClick={() => handleSaveMarkdown(false)}
                      className="font-mono text-xs shadow-2xs cursor-pointer"
                    >
                      Save Changes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      isLoading={isSaving}
                      onClick={() => handleSaveMarkdown(true)}
                      className="font-mono text-xs bg-stone-900 hover:bg-stone-800 text-stone-50 shadow-xs cursor-pointer"
                    >
                      Save & Re-assess Tenders
                    </Button>
                  </div>
                </div>
              ) : markdownContext ? (
                /* Formatted Preview View */
                <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto pr-2">
                  <MarkdownViewer content={markdownContext} />
                </div>
              ) : (
                /* Clean Empty State with Direct Create/Paste Action */
                <div className="flex h-full flex-col items-center justify-center text-center p-6 sm:p-10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-stone-100 shadow-2xs">
                    <svg
                      className="h-6 w-6 text-stone-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-foreground">
                    No capability profile created yet
                  </h3>
                  <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-stone-600">
                    Answer the prompts on the left and click{" "}
                    <strong className="font-semibold text-foreground">"Generate AI Capabilities Profile"</strong>,
                    or write and paste your own markdown capabilities directly.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("edit")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 font-mono text-xs font-bold text-foreground shadow-2xs transition hover:bg-stone-50 cursor-pointer"
                    >
                      Write or Paste Markdown
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Dossier Footer Call to Action */}
            {markdownContext && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-stone-50/80 px-5 py-3 shrink-0">
                <span className="font-mono text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Profile active for tender evaluations
                </span>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleReassessOnly}
                    disabled={isReassessing}
                    className="font-mono text-xs font-bold text-stone-600 hover:text-stone-900 transition hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {isReassessing ? "Re-evaluating..." : "Re-assess Tenders"}
                  </button>

                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1 font-mono text-xs font-bold text-stone-900 hover:text-amber-800 transition hover:underline"
                  >
                    Go to Matched Tenders &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </SessionGate>
  );
}