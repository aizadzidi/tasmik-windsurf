import { Suspense } from "react";
import { CampusJoinPageClient } from "@/components/auth/JoinPageClient";

export default function CampusJoinPage() {
  return (
    <Suspense>
      <CampusJoinPageClient />
    </Suspense>
  );
}
