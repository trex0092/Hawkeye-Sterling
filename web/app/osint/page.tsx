"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OsintRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/ongoing-monitor");
  }, [router]);
  return null;
}
