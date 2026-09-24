"use client";

// Legacy "understanding" step. Onboarding was shortened to
// welcome → profile → /app. URL kept stable for back-compat.

import { redirect } from "next/navigation";

export default function UnderstandingPage() {
  redirect("/app");
}
