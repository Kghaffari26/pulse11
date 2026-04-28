"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { ExternalLink, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/client-lib/api-client";
import { FREE_TIER_MONTHLY_LIMIT } from "@/shared/models/ai";

interface KeyStatus {
  present: boolean;
  mask?: string;
  updatedAt?: string;
}

const KEY_URL = "/user/api-key";
const fetcher = (url: string) => apiClient.get<KeyStatus>(url).then((r) => r.data);

export function ApiKeyPanel() {
  const { data: status, isLoading } = useSWR<KeyStatus, Error>(KEY_URL, fetcher);
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status && !status.present) setEditing(true);
  }, [status]);

  const save = async () => {
    if (!value.trim()) {
      toast.error("Paste your Gemini API key");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(KEY_URL, { apiKey: value.trim() });
      await mutate(KEY_URL);
      setValue("");
      setEditing(false);
      toast.success("API key saved");
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Failed to save API key";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove your API key? You'll go back to the free tier.")) return;
    setSubmitting(true);
    try {
      await apiClient.delete(KEY_URL);
      await mutate(KEY_URL);
      setEditing(true);
      toast.success("API key removed");
    } catch {
      toast.error("Failed to remove API key");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Gemini API key</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Leave empty to use VYBE&apos;s free tier ({FREE_TIER_MONTHLY_LIMIT} AI requests / month). Add your own
        Gemini key for unlimited requests and access to the higher-quality model.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium underline hover:text-foreground"
        >
          Where to get a key <ExternalLink className="h-3 w-3" />
        </a>
      </p>

      {isLoading ? (
        <div className="mt-4 h-8 animate-pulse rounded bg-muted" />
      ) : status?.present && !editing ? (
        <div className="mt-4 flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <code className="flex-1 font-mono">{status.mask}</code>
          {status.updatedAt && (
            <span className="shrink-0 text-xs text-muted-foreground">
              updated {new Date(status.updatedAt).toLocaleDateString()}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={submitting}>
            Update
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={submitting} aria-label="Remove">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <Label htmlFor="api-key" className="text-xs uppercase tracking-wide text-muted-foreground">
            API key
          </Label>
          <div className="flex gap-2">
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="AIza..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
            <Button onClick={save} disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
            {status?.present && (
              <Button
                variant="ghost"
                onClick={() => {
                  setValue("");
                  setEditing(false);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Your key is encrypted at rest (AES-256-GCM) and used only on the server — it never reaches
            your browser after this form submits.
          </p>
        </div>
      )}
    </Card>
  );
}
