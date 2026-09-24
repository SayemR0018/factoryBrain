"use client";

// Legacy connect step. The onboarding flow was shortened to
// welcome → profile → /app. The URL is kept stable for back-compat but
// now redirects straight to the dashboard. RFID / machine telemetry /
// energy / Documents are reachable later under /app/integrations.

import { redirect } from "next/navigation";

export default function ConnectPage() {
  redirect("/app");
}
