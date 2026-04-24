"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Link2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export type ClaimLinkResult = {
  student_id: string;
  student_name: string;
  claim_url: string;
  expires_at: string;
};

type AdminOnlineClaimAccessCellProps = {
  studentName: string;
  claimed: boolean;
  hasLink: boolean;
  isExpanded: boolean;
  isGenerating: boolean;
  error?: string | null;
  onGenerate: () => void;
  onToggleExpanded: () => void;
};

type AdminOnlineClaimPanelProps = {
  studentName: string;
  result?: ClaimLinkResult | null;
  error?: string | null;
  isGenerating: boolean;
  onGenerate: () => void;
};

const formatExpiry = (value: string) =>
  new Date(value).toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export function AdminOnlineClaimAccessCell({
  studentName,
  claimed,
  hasLink,
  isExpanded,
  isGenerating,
  error,
  onGenerate,
  onToggleExpanded,
}: AdminOnlineClaimAccessCellProps) {
  if (claimed) {
    return (
      <div className="flex min-w-[200px] flex-col gap-2 rounded-3xl border border-emerald-100 bg-emerald-50/80 p-4">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          <CheckCircle2 className="size-3.5" />
          Claimed
        </span>
        <p className="text-sm font-medium text-slate-700">Portal already linked for {studentName}.</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-[220px] flex-col gap-3 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 transition-all duration-200">
      <div className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
          <Link2 className="size-3.5" />
          Portal access
        </span>
        <p className="text-sm leading-6 text-slate-600">
          Create a one-time signup link for this student portal.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={hasLink ? onToggleExpanded : onGenerate}
          disabled={isGenerating}
          className="h-10 rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-slate-800"
        >
          {isGenerating ? "Creating..." : hasLink ? (isExpanded ? "Hide link" : "Show link") : "Create signup link"}
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AdminOnlineClaimPanel({
  studentName,
  result,
  error,
  isGenerating,
  onGenerate,
}: AdminOnlineClaimPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "manual">("idle");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    setCopyState("idle");
    setCopyMessage(null);
  }, [result?.claim_url, error]);

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => {
      setCopyState("idle");
      setCopyMessage(null);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const selectInput = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
  };

  const handleCopy = async () => {
    if (!result?.claim_url) return;

    setCopyState("copying");
    setCopyMessage(null);

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.claim_url);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setCopyState("copied");
      setCopyMessage("Signup link copied.");
      return;
    } catch {
      try {
        selectInput();
        const copied = typeof document !== "undefined" && document.execCommand("copy");
        if (!copied) {
          throw new Error("Fallback copy failed");
        }
        setCopyState("copied");
        setCopyMessage("Signup link copied.");
        return;
      } catch {
        selectInput();
        setCopyState("manual");
        setCopyMessage("Copy is blocked here. The link is selected for manual copy.");
      }
    }
  };

  if (!result && !error) return null;

  if (error && !result) {
    return (
      <div className="rounded-[28px] border border-rose-200 bg-rose-50/90 p-5 shadow-sm shadow-rose-100/70 transition-all duration-200">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-600">Portal access</p>
            <h4 className="text-lg font-semibold text-slate-900">Could not create signup link</h4>
            <p className="text-sm leading-6 text-rose-700">{error}</p>
          </div>
          <Button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="h-10 rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {isGenerating ? "Trying again..." : "Try again"}
          </Button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(241,245,249,0.96))] p-5 shadow-lg shadow-slate-200/50 transition-all duration-200">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
            <Sparkles className="size-3.5" />
            Signup link ready
          </span>
          <div>
            <h4 className="text-lg font-semibold text-slate-900">{studentName}</h4>
            <p className="text-sm leading-6 text-slate-600">
              Share this link to let the student claim the existing portal record.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600">
          Expires {formatExpiry(result.expires_at)}
        </div>
      </div>

      <div className="mt-4">
        <Input
          ref={inputRef}
          type="text"
          readOnly
          value={result.claim_url}
          className="h-12 rounded-2xl border-slate-200 bg-white pr-4 font-mono text-xs text-slate-700 shadow-inner shadow-slate-100"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            onClick={() => void handleCopy()}
            disabled={copyState === "copying"}
            className="h-10 rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Copy className="size-4" />
            {copyState === "copying" ? "Copying..." : "Copy link"}
          </Button>
          <Button
            variant="outline"
            asChild
            className="h-10 rounded-2xl border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <a href={result.claim_url} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="size-4" />
              Open link
            </a>
          </Button>
        </div>

        <div className="min-h-5 text-sm text-slate-500" aria-live="polite">
          {copyMessage}
        </div>
      </div>
    </div>
  );
}
