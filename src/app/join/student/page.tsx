import { Suspense } from "react";
import StudentJoinPageClient from "@/components/auth/StudentJoinPageClient";

export default function StudentJoinPage() {
  return (
    <Suspense>
      <StudentJoinPageClient />
    </Suspense>
  );
}
