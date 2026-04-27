"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ComplianceQaRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/mlro-advisor");
  }, [router]);
  return null;
}
