"use client";

import { useEffect } from "react";

export default function BatchRedirect() {
  useEffect(() => {
    window.location.replace("/screening");
  }, []);
  return null;
}
