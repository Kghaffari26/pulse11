import { LogList } from "@/components/agent/log-list";

export const metadata = {
  title: "Activity Log — Agent",
};

export default function AgentLogPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">Activity Log</h1>
        <p className="text-sm text-muted-foreground">
          Every agent run, newest first. Click a row to expand its plan and outputs.
        </p>
      </div>
      <LogList />
    </div>
  );
}
