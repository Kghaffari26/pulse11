import { RunTaskForm } from "@/components/agent/run-task-form";

export const metadata = {
  title: "Run Task — Agent",
};

export default function RunAgentPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">Run Task</h1>
        <p className="text-sm text-muted-foreground">
          Describe what you want the agent to do. It plans the work as a sequence of steps —
          some written reasoning, some tool calls (extracting tasks from a file, summarizing a
          document, building a study plan) — and runs them end-to-end. You can cancel mid-run.
        </p>
      </div>
      <RunTaskForm />
    </div>
  );
}
