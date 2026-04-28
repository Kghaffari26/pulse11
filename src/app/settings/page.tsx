"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SettingsTabs, type SettingsTab } from "@/components/settings/settings-tabs";

function isTab(v: string | null): v is SettingsTab {
  return v === "general" || v === "api-key";
}

function SettingsBody() {
  const params = useSearchParams();
  const raw = params.get("tab");
  const initial: SettingsTab = isTab(raw) ? raw : "general";

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-20">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Tune Pulse to your workflow</p>
      </header>
      <SettingsTabs initial={initial} />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsBody />
    </Suspense>
  );
}
