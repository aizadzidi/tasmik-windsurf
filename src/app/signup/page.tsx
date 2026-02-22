"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type FormState = {
  schoolName: string;
  schoolSlug: string;
  country: string;
  timezone: string;
  studentCount: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
  adminPasswordConfirm: string;
  billingCycle: "monthly" | "annual";
  plan: string;
  currency: string;
  paymentProvider: string;
  domainType: "subdomain" | "custom";
  customDomain: string;
  dataRegion: string;
  billingEmail: string;
  affiliateCode: string;
};

const DEFAULT_FORM: FormState = {
  schoolName: "",
  schoolSlug: "",
  country: "Malaysia",
  timezone: "Asia/Kuala_Lumpur",
  studentCount: "",
  adminName: "",
  adminEmail: "",
  adminPhone: "",
  adminPassword: "",
  adminPasswordConfirm: "",
  billingCycle: "monthly",
  plan: "starter",
  currency: "MYR",
  paymentProvider: "Billplz",
  domainType: "subdomain",
  customDomain: "",
  dataRegion: "ap-southeast-1",
  billingEmail: "",
  affiliateCode: "",
};

const STEPS = [
  {
    title: "School Info",
    description: "Basic details to create your school tenant.",
  },
  {
    title: "Admin Account",
    description: "Primary admin account for the school.",
  },
  {
    title: "Initial Setup",
    description: "Domain, billing, and plan selection.",
  },
  {
    title: "Review & Submit",
    description: "Confirm details before submitting.",
  },
];

const PLAN_PRICES = {
  starter: 21,
  growth: 64,
  enterprise: 170,
} as const;

function formatPrice(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function Field({
  label,
  htmlFor,
  helper,
  children,
}: {
  label: string;
  htmlFor?: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {helper ? <p className="mt-2 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

function buildSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function SignupPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedDomain, setSubmittedDomain] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "unavailable">(
    "idle"
  );
  const [slugStatusMessage, setSlugStatusMessage] = useState("");
  const formRef = useRef<HTMLDivElement | null>(null);
  const envBaseDomain = (
    process.env.NEXT_PUBLIC_TENANT_SUBDOMAIN_BASE_DOMAIN ?? "eclazz.com"
  ).trim().toLowerCase() || "eclazz.com";
  const [baseDomain, setBaseDomain] = useState(envBaseDomain);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname.toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1") {
      setBaseDomain(envBaseDomain);
      return;
    }
    setBaseDomain(host.replace(/^www\./, ""));
  }, [envBaseDomain]);

  const previewDomain = useMemo(() => {
    const slug = form.schoolSlug || "school-name";
    return `${slug}.${baseDomain}`;
  }, [form.schoolSlug, baseDomain]);

  const pricingCopy = useMemo(() => {
    if (form.billingCycle === "monthly") {
      return {
        starter: formatPrice(PLAN_PRICES.starter),
        growth: formatPrice(PLAN_PRICES.growth),
        enterprise: `${formatPrice(PLAN_PRICES.enterprise)}+`,
        note: "/month",
        subnote: "Billed monthly. Cancel anytime.",
      };
    }
    return {
      starter: formatPrice(PLAN_PRICES.starter * 0.83),
      growth: formatPrice(PLAN_PRICES.growth * 0.8),
      enterprise: `${formatPrice(PLAN_PRICES.enterprise * 0.8)}+`,
      note: "/month",
      subnote: "Billed annually. Save 17% on Starter, 20% on Growth & Enterprise.",
    };
  }, [form.billingCycle]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(currentStep: number) {
    if (currentStep === 0) {
      if (!form.schoolName.trim()) return "School name is required.";
      if (!form.schoolSlug.trim()) return "School slug is required.";
      if (!form.country.trim()) return "Country is required.";
      if (!form.timezone.trim()) return "Timezone is required.";
      if (slugStatus === "checking") return "Please wait for slug availability check.";
      if (slugStatus === "unavailable") return "School slug is unavailable.";
    }
    if (currentStep === 1) {
      if (!form.adminName.trim()) return "Admin name is required.";
      if (!form.adminEmail.trim()) return "Admin email is required.";
      if (!form.adminPassword.trim()) return "Password is required.";
      if (form.adminPassword !== form.adminPasswordConfirm) {
        return "Passwords do not match.";
      }
    }
    if (currentStep === 2) {
      if (!form.billingEmail.trim()) return "Billing email is required.";
    }
    return "";
  }

  function handleNext() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  }

  function handleBack() {
    setError("");
    setStep((prev) => Math.max(prev - 1, 0));
  }

  async function checkSlugAvailability(slug: string) {
    const normalized = buildSlug(slug);
    if (!normalized) {
      setSlugStatus("idle");
      setSlugStatusMessage("");
      return;
    }
    setSlugStatus("checking");
    setSlugStatusMessage("Checking slug availability...");
    try {
      const response = await fetch(
        `/api/public/tenant/slug-availability?slug=${encodeURIComponent(normalized)}`
      );
      const payload = (await response.json().catch(() => null)) as
        | { available?: boolean; error?: string }
        | null;
      if (!response.ok) {
        setSlugStatus("unavailable");
        setSlugStatusMessage(payload?.error || "Unable to verify slug right now.");
        return;
      }
      if (payload?.available) {
        setSlugStatus("available");
        setSlugStatusMessage("Slug is available.");
        return;
      }
      setSlugStatus("unavailable");
      setSlugStatusMessage("Slug is already in use.");
    } catch {
      setSlugStatus("unavailable");
      setSlugStatusMessage("Unable to verify slug right now.");
    }
  }

  async function handleSubmit() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/public/tenant/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolName: form.schoolName,
          schoolSlug: form.schoolSlug,
          country: form.country,
          timezone: form.timezone,
          studentCount: form.studentCount,
          adminName: form.adminName,
          adminEmail: form.adminEmail,
          adminPhone: form.adminPhone,
          adminPassword: form.adminPassword,
          billingCycle: form.billingCycle,
          plan: form.plan,
          paymentProvider: "billplz",
          billingEmail: form.billingEmail,
          affiliateCode: form.affiliateCode,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            code?: string;
            tenant?: { domain?: string };
            request_id?: string;
          }
        | null;

      if (!response.ok) {
        const reference = payload?.request_id ? ` (Ref: ${payload.request_id})` : "";
        setError((payload?.error || "Failed to submit onboarding request.") + reference);
        return;
      }

      const code = payload?.code || "TENANT_REGISTERED";
      setSubmittedDomain(payload?.tenant?.domain || previewDomain);
      setSuccessMessage(
        code === "TENANT_ALREADY_REGISTERED"
          ? "This signup request already exists. Continue to login on your tenant domain."
          : "Tenant provisioned successfully. You can now login as school admin."
      );
      setSubmitted(true);
    } catch {
      setError("Unexpected error while submitting onboarding request.");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePlanSelect(plan: FormState["plan"]) {
    update("plan", plan);
    setStep(2);
    setError("");
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#f6f4f0] via-[#eef6f1] to-[#f5f1e8] px-4 py-10">
      <div className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-gradient-to-tr from-amber-200 via-rose-100 to-emerald-100 opacity-60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-80 w-80 rounded-full bg-gradient-to-tr from-emerald-200 via-sky-100 to-amber-100 opacity-60 blur-3xl" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 lg:flex-row">
        <section className="relative z-10 flex-1 space-y-8">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-700">
              Multi-tenant onboarding
            </p>
            <h1 className="text-4xl font-semibold text-slate-900 md:text-5xl">
              Launch your school in 5 minutes.
            </h1>
            <p className="max-w-lg text-base text-slate-600">
              Self-serve onboarding with automatic tenant provisioning.
              Trial starts on first admin login.
            </p>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/60 p-6 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between text-sm font-medium text-slate-600">
              <span>Onboarding path</span>
              <span>
                Step {step + 1} / {STEPS.length}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
              {STEPS.map((item, index) => {
                const active = index === step;
                return (
                  <div key={item.title} className="flex items-center gap-3">
                    <div
                      className={`rounded-full px-3 py-2 ${
                        active
                          ? "bg-emerald-600 text-white"
                          : "bg-white text-slate-600"
                      }`}
                    >
                      {index + 1}. {item.title}
                    </div>
                    {index < STEPS.length - 1 && (
                      <span className="text-emerald-400">→</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative z-10 rounded-3xl border border-white/80 bg-white/70 p-6 shadow-lg backdrop-blur pointer-events-auto">
            <h3 className="text-lg font-semibold text-slate-900">Pricing Plan</h3>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  form.billingCycle === "monthly"
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-slate-600"
                }`}
                onClick={() => update("billingCycle", "monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  form.billingCycle === "annual"
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-slate-600"
                }`}
                onClick={() => update("billingCycle", "annual")}
              >
                Annual (Save up to 20%)
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">{pricingCopy.subnote}</p>
            <div className="mt-4 grid gap-4">
              <div
                className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                  form.plan === "starter"
                    ? "border-emerald-400 ring-2 ring-emerald-200"
                    : "border-emerald-100"
                }`}
                onClick={() => handlePlanSelect("starter")}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    handlePlanSelect("starter");
                  }
                }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-emerald-700">Starter</span>
                  <span className="text-lg font-semibold text-slate-900">
                    {pricingCopy.starter}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {pricingCopy.note} (up to 100 students)
                </p>
                {form.plan === "starter" && (
                  <p className="mt-2 text-xs font-semibold text-emerald-700">
                    Selected
                  </p>
                )}
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  onClick={() => handlePlanSelect("starter")}
                >
                  Choose Starter
                </button>
              </div>
              <div
                className={`rounded-2xl border bg-gradient-to-br from-white to-emerald-50 p-4 shadow-sm transition ${
                  form.plan === "growth"
                    ? "border-emerald-400 ring-2 ring-emerald-200"
                    : "border-slate-200"
                }`}
                onClick={() => handlePlanSelect("growth")}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    handlePlanSelect("growth");
                  }
                }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-emerald-700">Growth</span>
                  <span className="text-lg font-semibold text-slate-900">
                    {pricingCopy.growth}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {pricingCopy.note} (up to 500 students)
                </p>
                {form.plan === "growth" && (
                  <p className="mt-2 text-xs font-semibold text-emerald-700">
                    Selected
                  </p>
                )}
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  onClick={() => handlePlanSelect("growth")}
                >
                  Choose Growth
                </button>
              </div>
              <div
                className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                  form.plan === "enterprise"
                    ? "border-emerald-400 ring-2 ring-emerald-200"
                    : "border-slate-200"
                }`}
                onClick={() => handlePlanSelect("enterprise")}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    handlePlanSelect("enterprise");
                  }
                }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-emerald-700">Enterprise</span>
                  <span className="text-lg font-semibold text-slate-900">
                    {pricingCopy.enterprise}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {pricingCopy.note} (1,000+ students)
                </p>
                {form.plan === "enterprise" && (
                  <p className="mt-2 text-xs font-semibold text-emerald-700">
                    Selected
                  </p>
                )}
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl border border-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-900 hover:text-white"
                  onClick={() => handlePlanSelect("enterprise")}
                >
                  Talk to Sales
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="flex-1">
          <div className="rounded-3xl border border-white/80 bg-white/80 p-8 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between" ref={formRef}>
              <div>
                <p className="text-sm font-semibold text-emerald-700">
                  {STEPS[step].title}
                </p>
                <h2 className="text-2xl font-semibold text-slate-900">
                  {STEPS[step].description}
                </h2>
              </div>
              <Link
                href="/login"
                className="text-sm font-semibold text-slate-500 hover:text-slate-800"
              >
                Already have an account?
              </Link>
            </div>

            {error && (
              <Alert variant="error" className="mt-6">
                {error}
              </Alert>
            )}

            {submitted ? (
              <div className="mt-8 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
                <h3 className="text-xl font-semibold">Tenant ready</h3>
                <p className="text-sm">{successMessage}</p>
                <p className="rounded-xl bg-white px-4 py-2 font-semibold text-emerald-700">
                  {submittedDomain || previewDomain}
                </p>
                <Button
                  className="w-full"
                  onClick={() => {
                    setSubmitted(false);
                    setStep(0);
                    setForm(DEFAULT_FORM);
                    setSubmittedDomain("");
                    setSuccessMessage("");
                    setSlugStatus("idle");
                    setSlugStatusMessage("");
                  }}
                >
                  Start Over
                </Button>
              </div>
            ) : (
              <form className="mt-8 space-y-6">
                {step === 0 && (
                  <div className="grid gap-4">
                    <Field label="School name" htmlFor="schoolName">
                      <Input
                        id="schoolName"
                        placeholder="e.g., Al Khayr Academy"
                        value={form.schoolName}
                        onChange={(event) => {
                          const value = event.target.value;
                          update("schoolName", value);
                          if (!form.schoolSlug) {
                            update("schoolSlug", buildSlug(value));
                          }
                        }}
                      />
                    </Field>
                    <Field
                      label="School slug"
                      htmlFor="schoolSlug"
                      helper={
                        slugStatusMessage
                          ? `Temporary domain: ${previewDomain} • ${slugStatusMessage}`
                          : `Temporary domain: ${previewDomain}`
                      }
                    >
                      <Input
                        id="schoolSlug"
                        placeholder="e.g., alkhayr"
                        value={form.schoolSlug}
                        onChange={(event) => {
                          update("schoolSlug", buildSlug(event.target.value));
                          setSlugStatus("idle");
                          setSlugStatusMessage("");
                        }}
                        onBlur={() => {
                          void checkSlugAvailability(form.schoolSlug);
                        }}
                      />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Country" htmlFor="country">
                        <select
                          id="country"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                          value={form.country}
                          onChange={(event) => update("country", event.target.value)}
                        >
                          <option>Malaysia</option>
                          <option>Singapore</option>
                          <option>Indonesia</option>
                          <option>Brunei</option>
                        </select>
                      </Field>
                      <Field label="Timezone" htmlFor="timezone">
                        <select
                          id="timezone"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                          value={form.timezone}
                          onChange={(event) => update("timezone", event.target.value)}
                        >
                          <option>Asia/Kuala_Lumpur</option>
                          <option>Asia/Singapore</option>
                          <option>Asia/Jakarta</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Estimated student count" htmlFor="studentCount">
                      <Input
                        id="studentCount"
                        placeholder="e.g., 300"
                        value={form.studentCount}
                        onChange={(event) =>
                          update("studentCount", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                )}

                {step === 1 && (
                  <div className="grid gap-4">
                    <Field label="Admin name" htmlFor="adminName">
                      <Input
                        id="adminName"
                        placeholder="e.g., Aisyah Rahman"
                        value={form.adminName}
                        onChange={(event) => update("adminName", event.target.value)}
                      />
                    </Field>
                    <Field label="Admin email" htmlFor="adminEmail">
                      <Input
                        id="adminEmail"
                        type="email"
                        placeholder="admin@school.com"
                        value={form.adminEmail}
                        onChange={(event) => update("adminEmail", event.target.value)}
                      />
                    </Field>
                    <Field label="Admin phone" htmlFor="adminPhone">
                      <Input
                        id="adminPhone"
                        placeholder="+60 12-345 6789"
                        value={form.adminPhone}
                        onChange={(event) => update("adminPhone", event.target.value)}
                      />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Password" htmlFor="adminPassword">
                        <Input
                          id="adminPassword"
                          type="password"
                          placeholder="Minimum 8 characters"
                          value={form.adminPassword}
                          onChange={(event) =>
                            update("adminPassword", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Confirm password" htmlFor="adminPasswordConfirm">
                        <Input
                          id="adminPasswordConfirm"
                          type="password"
                          placeholder="Repeat password"
                          value={form.adminPasswordConfirm}
                          onChange={(event) =>
                            update("adminPasswordConfirm", event.target.value)
                          }
                        />
                      </Field>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="grid gap-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Plan" htmlFor="plan">
                        <select
                          id="plan"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                          value={form.plan}
                          onChange={(event) => update("plan", event.target.value)}
                        >
                          <option value="starter">Starter (up to 100 students)</option>
                          <option value="growth">Growth (up to 500 students)</option>
                          <option value="enterprise">Enterprise (1,000+ students)</option>
                        </select>
                      </Field>
                      <Field label="Billing cycle" htmlFor="billingCycle">
                        <select
                          id="billingCycle"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                          value={form.billingCycle}
                          onChange={(event) =>
                            update("billingCycle", event.target.value as FormState["billingCycle"])
                          }
                        >
                          <option value="monthly">Monthly</option>
                          <option value="annual">Annual (Save up to 20%)</option>
                        </select>
                      </Field>
                      <Field label="Currency" htmlFor="currency">
                        <select
                          id="currency"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                          value={form.currency}
                          onChange={(event) => update("currency", event.target.value)}
                        >
                          <option>MYR</option>
                          <option>SGD</option>
                          <option>IDR</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Billing email" htmlFor="billingEmail">
                      <Input
                        id="billingEmail"
                        type="email"
                        placeholder="billing@school.com"
                        value={form.billingEmail}
                        onChange={(event) => update("billingEmail", event.target.value)}
                      />
                    </Field>
                    <Field label="Affiliate code (optional)" htmlFor="affiliateCode">
                      <Input
                        id="affiliateCode"
                        placeholder="e.g., PARTNER2025"
                        value={form.affiliateCode}
                        onChange={(event) => update("affiliateCode", event.target.value)}
                      />
                    </Field>
                    <Field label="Payment provider" htmlFor="paymentProvider">
                      <select
                        id="paymentProvider"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                        value={form.paymentProvider}
                        onChange={() => update("paymentProvider", "Billplz")}
                        disabled
                      >
                        <option>Billplz</option>
                      </select>
                    </Field>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-700">
                        Domain
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="rounded-full px-4 py-2 text-sm font-semibold transition bg-emerald-600 text-white"
                          onClick={() => update("domainType", "subdomain")}
                        >
                          Eclazz subdomain
                        </button>
                      </div>
                      <p className="mt-3 text-sm text-slate-500">
                        Active domain: <span className="font-semibold">{previewDomain}</span>
                      </p>
                    </div>
                    <Field label="Data region" htmlFor="dataRegion">
                      <select
                        id="dataRegion"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                        value={form.dataRegion}
                        onChange={(event) => update("dataRegion", event.target.value)}
                      >
                        <option value="ap-southeast-1">Singapore (ap-southeast-1)</option>
                        <option value="ap-southeast-2">Sydney (ap-southeast-2)</option>
                        <option value="eu-west-1">Ireland (eu-west-1)</option>
                      </select>
                    </Field>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">School</span>
                      <span>{form.schoolName || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Domain</span>
                      <span>{previewDomain}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Admin</span>
                      <span>{form.adminName || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Plan</span>
                      <span className="capitalize">{form.plan}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Payments</span>
                      <span>{form.paymentProvider}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Region</span>
                      <span>{form.dataRegion}</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleBack}
                    disabled={step === 0}
                  >
                    Back
                  </Button>
                  {step < STEPS.length - 1 ? (
                    <Button type="button" onClick={handleNext}>
                      Next
                    </Button>
                  ) : (
                    <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
                      {submitting ? "Submitting..." : "Submit request"}
                    </Button>
                  )}
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
