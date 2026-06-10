import { NextRequest } from "next/server";
import { createOnlinePaymentCheckout } from "@/lib/online/payments";
import { requireAuthenticatedStudentTenantUser } from "@/lib/requestAuth";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedStudentTenantUser(request);
  if (!auth.ok) return auth.response;

  return createOnlinePaymentCheckout(request, {
    kind: "student",
    userId: auth.userId,
    email: auth.email,
    tenantId: auth.tenantId,
    studentId: auth.studentId,
  });
}
