"use client";

import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePrefs, updatePrefs } from "@/client-lib/api-client";
import { ModeSwitch } from "@/components/pulse/mode-switch";

export function GeneralPanel() {
  const { data: prefs } = usePrefs();

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <Label>Mode</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose how Pulse adapts its UI and defaults
            </p>
          </div>
          <ModeSwitch />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <Label>Notifications</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              In-app alerts for start-now, falling-behind, and overdue tasks.
            </p>
          </div>
          <Switch
            checked={prefs?.notificationsEnabled ?? true}
            onCheckedChange={async (v) => {
              try {
                await updatePrefs({ notificationsEnabled: v });
                toast.success(v ? "Notifications on" : "Notifications off");
              } catch {
                toast.error("Couldn't update preference");
              }
            }}
          />
        </div>
      </Card>

      <Card className="p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">About the Urgency Engine</p>
        <p className="mt-2">
          Pulse calculates a live urgency score (0-100) from: time remaining until the deadline,
          time needed to finish, and your priority setting. When the ratio of required work to
          remaining time approaches 1, Pulse switches from &quot;on-track&quot; suggestions to
          &quot;start now&quot; alerts.
        </p>
      </Card>
    </div>
  );
}
