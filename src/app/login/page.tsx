import LoginPageClient from "@/components/auth/LoginPageClient";

const enableLegacySignup =
  (process.env.ENABLE_LEGACY_LOGIN_SIGNUP ?? "false").toLowerCase() === "true";
const tenantBaseDomain = (process.env.TENANT_SUBDOMAIN_BASE_DOMAIN ?? "eclazz.com")
  .trim()
  .toLowerCase();

export default function LoginPage() {
  return (
    <LoginPageClient
      enableLegacySignup={enableLegacySignup}
      tenantBaseDomain={tenantBaseDomain || "eclazz.com"}
    />
  );
}

