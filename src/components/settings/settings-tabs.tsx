"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeyPanel } from "./api-key-panel";
import { GeneralPanel } from "./general-panel";

export type SettingsTab = "general" | "api-key";

interface Props {
  initial: SettingsTab;
}

export function SettingsTabs({ initial }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <Tabs
      value={initial}
      onValueChange={(v) => {
        const next = new URLSearchParams(Array.from(params.entries()));
        next.set("tab", v);
        router.replace(`/settings?${next.toString()}`);
      }}
    >
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="api-key">API Key</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="mt-4">
        <GeneralPanel />
      </TabsContent>
      <TabsContent value="api-key" className="mt-4">
        <ApiKeyPanel />
      </TabsContent>
    </Tabs>
  );
}
