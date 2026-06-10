import { NextRequest } from "next/server";
import { createOnlinePaymentCheckout } from "@/lib/online/payments";
import { requireAuthenticatedTenantUser } from "@/lib/requestAuth";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedTenantUser(request);
  if (!auth.ok) return auth.response;

  return createOnlinePaymentCheckout(request, {
    kind: "parent",
    userId: auth.userId,
    email: auth.email,
    tenantId: auth.tenantId,
  });
}
