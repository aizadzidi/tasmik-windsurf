import { Suspense } from "react";
import JoinPageClient from "@/components/auth/JoinPageClient";

type Props = {
  params: Promise<{ code: string }>;
};

export default async function JoinWithCodePage({ params }: Props) {
  const { code } = await params;
  return (
    <Suspense>
      <JoinPageClient inviteCode={code} />
    </Suspense>
  );
}
