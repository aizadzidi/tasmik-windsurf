import ParentSignupPageClient from "@/components/auth/ParentSignupPageClient";

const tenantBaseDomain = (process.env.TENANT_SUBDOMAIN_BASE_DOMAIN ?? "eclazz.com")
  .trim()
  .toLowerCase();

export default function ParentSignupPage() {
  return (
    <ParentSignupPageClient tenantBaseDomain={tenantBaseDomain || "eclazz.com"} />
  );
}

