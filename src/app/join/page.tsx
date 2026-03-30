import { Suspense } from "react";
import JoinPageClient from "@/components/auth/JoinPageClient";

export default function JoinPage() {
  return (
    <Suspense>
      <JoinPageClient />
    </Suspense>
  );
}
