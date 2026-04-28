import { parsePlan, runAgentJob } from "./executor";
import type { JobStatusPatch, JobsStore } from "./jobs-store";
import type { AgentJob, AgentJobStatus, AgentStep } from "@/shared/models/ai";
import type { AgentToolContext } from "./tools";

function inMemoryJobsStore(initial: Partial<AgentJob>): JobsStore & { job: AgentJob } {
  const job: AgentJob = {
    id: "job-1",
    userEmail: "u-1",
    status: "queued",
    goal: "Plan my week",
    context: null,
    steps: [],
    output: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...initial,
  };
  return {
    job,
    async create() {
      return job;
    },
    async get(id, user) {
      return id === job.id && user === job.userEmail ? job : null;
    },
    async getForExecutor(id) {
      return id === job.id ? job : null;
    },
    async updateStatus(id: string, status: AgentJobStatus, patch?: JobStatusPatch) {
      if (id !== job.id) return;
      job.status = status;
      if (patch?.output !== undefined) job.output = patch.output;
      if (patch?.error !== undefined) job.error = patch.error;
    },
    async setSteps(id, steps: AgentStep[]) {
      if (id !== job.id) return;
      job.steps = steps;
    },
  };
}

describe("runAgentJob", () => {
  test("queued → running → completed happy path", async () => {
    const store = inMemoryJobsStore({});
    const calls: string[] = [];
    let call = 0;
    const generate = async (_userId: string, prompt: string) => {
      call++;
      calls.push(prompt.slice(0, 32));
      if (call === 1) {
        // planner
        return '["Gather inputs","Draft plan","Review plan"]';
      }
      return `output ${call - 1}`;
    };

    await runAgentJob("job-1", { jobsStore: store, generate });

    expect(store.job.status).toBe("completed");
    expect(store.job.steps).toHaveLength(3);
    expect(store.job.steps.map((s) => s.status)).toEqual(["completed", "completed", "completed"]);
    expect(store.job.steps[0].output).toBe("output 1");
    expect(store.job.output).toMatchObject({ stepCount: 3, summary: "output 3" });
    expect(call).toBe(4); // 1 planner + 3 steps
  });

  test("tolerates a markdown fence around the planner JSON", async () => {
    const store = inMemoryJobsStore({});
    let call = 0;
    const generate = async () => {
      call++;
      if (call === 1) return '```json\n["A","B","C"]\n```';
      return `step ${call - 1}`;
    };
    await runAgentJob("job-1", { jobsStore: store, generate });
    expect(store.job.status).toBe("completed");
    expect(store.job.steps).toHaveLength(3);
  });

  test("falls back to line-splitting when planner returns numbered list", async () => {
    const store = inMemoryJobsStore({});
    let call = 0;
    const generate = async () => {
      call++;
      if (call === 1) return "1. First\n2. Second\n3. Third";
      return `step ${call - 1}`;
    };
    await runAgentJob("job-1", { jobsStore: store, generate });
    expect(store.job.status).toBe("completed");
    expect(store.job.steps.map((s) => s.step)).toEqual(["First", "Second", "Third"]);
  });

  test("fails cleanly when the planner returns fewer than 3 steps", async () => {
    const store = inMemoryJobsStore({});
    const generate = async () => '["just one"]';
    await runAgentJob("job-1", { jobsStore: store, generate });
    expect(store.job.status).toBe("failed");
    expect(store.job.error).toMatch(/Planner returned/);
  });

  test("cancellation between steps exits cleanly without running more", async () => {
    const store = inMemoryJobsStore({});
    let call = 0;
    const generate = async () => {
      call++;
      if (call === 1) return '["A","B","C"]';
      if (call === 2) {
        // After this first step completes, simulate the user cancelling.
        store.job.status = "cancelled";
        return "step 1 output";
      }
      return `step ${call - 1}`;
    };
    await runAgentJob("job-1", { jobsStore: store, generate });
    expect(store.job.status).toBe("cancelled");
    expect(call).toBe(2); // planner + 1 step — second step skipped
    expect(store.job.steps[0].status).toBe("completed");
    expect(store.job.steps[1].status).toBe("pending");
  });

  test("step failure marks the job failed and records the error", async () => {
    const store = inMemoryJobsStore({});
    let call = 0;
    const generate = async () => {
      call++;
      if (call === 1) return '["A","B","C"]';
      if (call === 2) throw new Error("provider exploded");
      return `step ${call - 1}`;
    };
    await runAgentJob("job-1", { jobsStore: store, generate });
    expect(store.job.status).toBe("failed");
    expect(store.job.error).toBe("provider exploded");
    expect(store.job.steps[0].status).toBe("failed");
  });

  test("already-completed jobs are left untouched", async () => {
    const store = inMemoryJobsStore({ status: "completed" });
    const generate = async () => {
      throw new Error("should not be called");
    };
    await runAgentJob("job-1", { jobsStore: store, generate });
    expect(store.job.status).toBe("completed");
  });

  test("unknown job id is a no-op", async () => {
    const store = inMemoryJobsStore({});
    const generate = async () => "whatever";
    await runAgentJob("nonexistent", { jobsStore: store, generate });
    expect(store.job.status).toBe("queued");
  });

  test("dispatches a tool step instead of calling generate for that step", async () => {
    const store = inMemoryJobsStore({ context: { projectId: "p-1" } });
    let call = 0;
    const generate = async () => {
      call++;
      if (call === 1) {
        return JSON.stringify([
          { step: "Survey the syllabus", tool: "extract_tasks_from_file", args: { fileId: "f-1" } },
          "Reflect on extracted tasks",
          "Suggest priorities",
        ]);
      }
      return `text output ${call - 1}`;
    };
    const toolCalls: Array<{ name: string; args: Record<string, unknown>; ctx: AgentToolContext }> = [];
    const runTool = async (
      name: string,
      args: Record<string, unknown>,
      ctx: AgentToolContext,
    ): Promise<string> => {
      toolCalls.push({ name, args, ctx });
      return "tool produced 7 tasks";
    };

    await runAgentJob("job-1", { jobsStore: store, generate, runTool });

    expect(store.job.status).toBe("completed");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("extract_tasks_from_file");
    expect(toolCalls[0].args.fileId).toBe("f-1");
    // projectId is auto-injected from job.context when the planner omits it.
    expect(toolCalls[0].args.projectId).toBe("p-1");
    expect(toolCalls[0].ctx.userId).toBe("u-1");
    expect(toolCalls[0].ctx.projectId).toBe("p-1");
    expect(store.job.steps[0].output).toBe("tool produced 7 tasks");
    // Two text steps remain — planner + 2 text generations = 3 calls.
    expect(call).toBe(3);
  });

  test("tool failure marks the job failed with the tool's error", async () => {
    const store = inMemoryJobsStore({ context: { projectId: "p-1" } });
    const generate = async () =>
      JSON.stringify([
        { step: "Run the tool", tool: "summarize_file", args: { fileId: "f-1" } },
        "Reflect",
        "Wrap up",
      ]);
    const runTool = async (): Promise<string> => {
      throw new Error("file not accessible");
    };
    await runAgentJob("job-1", { jobsStore: store, generate, runTool });
    expect(store.job.status).toBe("failed");
    expect(store.job.error).toBe("file not accessible");
    expect(store.job.steps[0].status).toBe("failed");
  });
});

describe("parsePlan", () => {
  test("string array still parses (Wave 4A back-compat)", () => {
    const out = parsePlan('["a","b","c"]');
    expect(out).toEqual([{ step: "a" }, { step: "b" }, { step: "c" }]);
  });

  test("object form preserves tool + args", () => {
    const raw = JSON.stringify([
      { step: "do a thing", tool: "summarize_file", args: { fileId: "x" } },
      "plain step",
    ]);
    const out = parsePlan(raw);
    expect(out).toEqual([
      { step: "do a thing", tool: "summarize_file", args: { fileId: "x" } },
      { step: "plain step" },
    ]);
  });

  test("strips fenced output and tolerates surrounding prose", () => {
    const raw = "Sure! Here's the plan:\n```json\n[\"a\",\"b\",\"c\"]\n```\nLet me know.";
    const out = parsePlan(raw);
    expect(out).toEqual([{ step: "a" }, { step: "b" }, { step: "c" }]);
  });

  test("falls back to numbered-list parsing when JSON fails", () => {
    const out = parsePlan("1. first\n2. second\n3. third");
    expect(out).toEqual([{ step: "first" }, { step: "second" }, { step: "third" }]);
  });

  test("drops object items missing a step field", () => {
    const raw = JSON.stringify([{ tool: "x" }, { step: "valid" }, ""]);
    const out = parsePlan(raw);
    expect(out).toEqual([{ step: "valid" }]);
  });
});
