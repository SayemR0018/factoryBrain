"use client";

// Legacy "ready" step. Onboarding was shortened to
// welcome → profile → /app. URL kept stable for back-compat.

import { redirect } from "next/navigation";

export default function ReadyPage() {
  redirect("/app");
}
