import LoginPageClient from "@/components/auth/LoginPageClient";

const tenantBaseDomain = (process.env.TENANT_SUBDOMAIN_BASE_DOMAIN ?? "eclazz.com")
  .trim()
  .toLowerCase();

export default function LoginPage() {
  return (
    <LoginPageClient
      tenantBaseDomain={tenantBaseDomain || "eclazz.com"}
    />
  );
}
