import { runAgentJob } from "./executor";
import type { JobStatusPatch, JobsStore } from "./jobs-store";
import type { AgentJob, AgentJobStatus, AgentStep } from "@/shared/models/ai";

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
});
