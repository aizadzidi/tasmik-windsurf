import { Suspense } from "react";
import FamilyJoinPageClient from "@/components/auth/FamilyJoinPageClient";

export default function FamilyJoinPage() {
  return (
    <Suspense>
      <FamilyJoinPageClient />
    </Suspense>
  );
}
