import { runGenerateStudyPlan } from "./generate-study-plan";

interface Fixture {
  ownership: boolean;
  tasks: Array<{
    title: string;
    description: string | null;
    deadline: string | null;
    estimated_minutes: number;
    priority: string;
  }>;
  files: string[];
  notes: string[];
}

interface Captured {
  sql: string;
  params: unknown[];
}

function makeQuery(fx: Fixture) {
  const calls: Captured[] = [];
  const fn = (async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (sql.includes("FROM vybe_projects")) return fx.ownership ? [{ "?column?": 1 }] : [];
    if (sql.includes("FROM pulse_tasks")) return fx.tasks;
    if (sql.includes("FROM vybe_project_files")) return fx.files.map((filename) => ({ filename }));
    if (sql.includes("FROM vybe_project_notes")) return fx.notes.map((title) => ({ title }));
    if (sql.includes("INSERT INTO vybe_project_notes")) return [];
    return [];
  }) as never;
  return { fn, calls };
}

const NOW = new Date("2026-04-28T12:00:00Z");

describe("runGenerateStudyPlan", () => {
  const ctx = { userId: "u-1", aiGenerate: async () => "" };

  test("queries tasks/files/notes and saves a dated note with the plan", async () => {
    const { fn: query, calls } = makeQuery({
      ownership: true,
      tasks: [
        {
          title: "Midterm",
          description: "covers ch 1-7",
          deadline: "2026-05-10T00:00:00.000Z",
          estimated_minutes: 240,
          priority: "High",
        },
      ],
      files: ["lecture-1.pdf"],
      notes: ["Class notes"],
    });
    let receivedPrompt = "";
    const aiGenerate = async (prompt: string) => {
      receivedPrompt = prompt;
      return "## Week 1\nFocus on Midterm prep";
    };

    const result = await runGenerateStudyPlan(
      { projectId: "p-1", weeksAhead: 4 },
      { ...ctx, aiGenerate },
      { query, now: NOW },
    );

    expect(result).toBe("Study plan saved as note: Study plan (2026-04-28)");
    expect(calls.some((c) => c.sql.includes("FROM pulse_tasks"))).toBe(true);
    expect(calls.some((c) => c.sql.includes("FROM vybe_project_files"))).toBe(true);
    expect(calls.some((c) => c.sql.includes("FROM vybe_project_notes WHERE project_id"))).toBe(true);
    const insert = calls.find((c) => c.sql.includes("INSERT INTO vybe_project_notes"));
    expect(insert).toBeDefined();
    expect(insert?.params).toEqual([
      "p-1",
      "u-1",
      "Study plan (2026-04-28)",
      "## Week 1\nFocus on Midterm prep",
    ]);
    // Prompt should mention concrete data we passed in.
    expect(receivedPrompt).toContain("Midterm");
    expect(receivedPrompt).toContain("lecture-1.pdf");
    expect(receivedPrompt).toContain("Class notes");
    expect(receivedPrompt).toMatch(/4 weeks/);
  });

  test("returns a friendly message when project has no tasks/files/notes (skips AI)", async () => {
    const { fn: query, calls } = makeQuery({
      ownership: true,
      tasks: [],
      files: [],
      notes: [],
    });
    let aiCalled = false;
    const result = await runGenerateStudyPlan(
      { projectId: "p-1" },
      {
        ...ctx,
        aiGenerate: async () => {
          aiCalled = true;
          return "should not run";
        },
      },
      { query, now: NOW },
    );
    expect(result).toMatch(/Add some content first/);
    expect(aiCalled).toBe(false);
    expect(calls.find((c) => c.sql.includes("INSERT INTO vybe_project_notes"))).toBeUndefined();
  });

  test("rejects projects the user does not own", async () => {
    const { fn: query } = makeQuery({
      ownership: false,
      tasks: [],
      files: [],
      notes: [],
    });
    await expect(
      runGenerateStudyPlan(
        { projectId: "p-1" },
        { ...ctx, aiGenerate: async () => "anything" },
        { query, now: NOW },
      ),
    ).rejects.toThrow(/not found/i);
  });

  test("clamps weeksAhead into [1, 12]", async () => {
    const { fn: query } = makeQuery({
      ownership: true,
      tasks: [{ title: "x", description: null, deadline: null, estimated_minutes: 60, priority: "Medium" }],
      files: [],
      notes: [],
    });
    let receivedPrompt = "";
    await runGenerateStudyPlan(
      { projectId: "p-1", weeksAhead: 999 },
      {
        ...ctx,
        aiGenerate: async (p: string) => {
          receivedPrompt = p;
          return "plan";
        },
      },
      { query, now: NOW },
    );
    expect(receivedPrompt).toMatch(/12 weeks/);
  });
});
