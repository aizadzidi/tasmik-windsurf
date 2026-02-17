import { supabaseService } from "@/lib/supabaseServiceClient";

const DEFAULT_BILLPLZ_API_BASE = "https://www.billplz.com/api/v3";

type TenantGatewayKeyRow = {
  provider_id: string;
  key_version: string | null;
  api_key: string | null;
  collection_id: string | null;
  webhook_secret: string | null;
  api_base: string | null;
  is_primary: boolean | null;
  allow_webhook_verification: boolean | null;
  valid_from?: string | null;
  valid_to?: string | null;
  updated_at?: string | null;
};

type ProviderRow = {
  id: string;
};

export type BillplzRuntimeConfig = {
  providerId: string | null;
  keyVersion: string | null;
  apiBase: string;
  apiKeys: string[];
  primaryCollectionId: string;
  allowedCollectionIds: string[];
  webhookSecrets: string[];
  source: "tenant" | "env";
};

let providerIdCache: string | null = null;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function isMissingRelationError(error: unknown, relation: string): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: string; details?: string };
  const text = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("exist");
}

function normalizeUnique(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (value ?? "").trim())
        .filter((value) => value.length > 0)
    )
  );
}

function resolveEnvFallbackConfig(): BillplzRuntimeConfig {
  const apiKey = requireEnv(process.env.BILLPLZ_API_KEY, "BILLPLZ_API_KEY");
  const collectionId = requireEnv(process.env.BILLPLZ_COLLECTION_ID, "BILLPLZ_COLLECTION_ID");
  const webhookSecret = requireEnv(process.env.BILLPLZ_X_SIGNATURE, "BILLPLZ_X_SIGNATURE");
  const apiBase = process.env.BILLPLZ_API_BASE ?? DEFAULT_BILLPLZ_API_BASE;

  return {
    providerId: null,
    keyVersion: null,
    apiBase,
    apiKeys: [apiKey],
    primaryCollectionId: collectionId,
    allowedCollectionIds: [collectionId],
    webhookSecrets: [webhookSecret],
    source: "env",
  };
}

async function resolveBillplzProviderId(): Promise<string | null> {
  if (providerIdCache) return providerIdCache;

  const { data, error } = await supabaseService
    .from("payment_providers")
    .select("id")
    .eq("key", "billplz")
    .limit(1)
    .maybeSingle<ProviderRow>();

  if (error) {
    if (isMissingRelationError(error, "payment_providers")) {
      return null;
    }
    throw new Error(error.message);
  }

  providerIdCache = data?.id ?? null;
  return providerIdCache;
}

function toTenantConfig(rows: TenantGatewayKeyRow[]): BillplzRuntimeConfig | null {
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => {
    if (Boolean(a.is_primary) !== Boolean(b.is_primary)) {
      return a.is_primary ? -1 : 1;
    }
    return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
  });

  const primary = sorted[0];
  const apiKeys = normalizeUnique(sorted.map((row) => row.api_key));
  const webhookSecrets = normalizeUnique(
    sorted
      .filter((row) => row.allow_webhook_verification !== false)
      .map((row) => row.webhook_secret)
  );
  const allowedCollectionIds = normalizeUnique(sorted.map((row) => row.collection_id));
  const apiBase = (primary.api_base ?? "").trim() || DEFAULT_BILLPLZ_API_BASE;
  const primaryCollectionId = (primary.collection_id ?? "").trim();

  if (!apiKeys.length || !webhookSecrets.length || !allowedCollectionIds.length || !primaryCollectionId) {
    return null;
  }

  return {
    providerId: primary.provider_id ?? null,
    keyVersion: primary.key_version ?? null,
    apiBase,
    apiKeys,
    primaryCollectionId,
    allowedCollectionIds,
    webhookSecrets,
    source: "tenant",
  };
}

function isRowActiveNow(row: TenantGatewayKeyRow, now: Date): boolean {
  const validFrom = row.valid_from ? new Date(row.valid_from) : null;
  const validTo = row.valid_to ? new Date(row.valid_to) : null;
  if (validFrom && Number.isFinite(validFrom.getTime()) && validFrom > now) return false;
  if (validTo && Number.isFinite(validTo.getTime()) && validTo < now) return false;
  return true;
}

export async function resolveBillplzConfigForTenant(tenantId: string): Promise<BillplzRuntimeConfig> {
  const providerId = await resolveBillplzProviderId();
  if (!providerId) {
    return resolveEnvFallbackConfig();
  }

  const now = new Date();
  const { data, error } = await supabaseService
    .from("tenant_payment_gateway_keys")
    .select(
      "provider_id,key_version,api_key,collection_id,webhook_secret,api_base,is_primary,allow_webhook_verification,valid_from,valid_to,updated_at"
    )
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .in("status", ["active", "rotating"]);

  if (error) {
    if (isMissingRelationError(error, "tenant_payment_gateway_keys")) {
      return resolveEnvFallbackConfig();
    }
    throw new Error(error.message);
  }

  const tenantConfig = toTenantConfig(
    ((data ?? []) as TenantGatewayKeyRow[]).filter((row) => isRowActiveNow(row, now))
  );
  if (!tenantConfig) {
    return resolveEnvFallbackConfig();
  }

  return tenantConfig;
}
