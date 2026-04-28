import {
  parseExtractedTasks,
  runExtractTasks,
} from "./extract-tasks";

interface Captured {
  sql: string;
  params: unknown[];
}

function makeQuery(file: { mime: string; blob: string; filename: string } | null) {
  const calls: Captured[] = [];
  const fn = (async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (sql.includes("FROM vybe_project_files")) {
      return file
        ? [{
            id: "f-1",
            project_id: "p-1",
            filename: file.filename,
            blob_url: file.blob,
            mime_type: file.mime,
          }]
        : [];
    }
    if (sql.includes("INSERT INTO pulse_tasks")) return [];
    return [];
  }) as never;
  return { fn, calls };
}

const mockExtract = (text: string) =>
  (async () => ({ text, truncated: false })) as never;

describe("parseExtractedTasks", () => {
  test("happy-path JSON with all fields", () => {
    const raw = JSON.stringify([
      {
        title: "Midterm exam",
        description: "Covers chapters 1-7",
        dueDate: "2026-05-15",
        estimatedHours: 8,
        priority: "high",
      },
    ]);
    expect(parseExtractedTasks(raw)).toEqual([
      {
        title: "Midterm exam",
        description: "Covers chapters 1-7",
        dueDate: "2026-05-15",
        estimatedHours: 8,
        priority: "high",
      },
    ]);
  });

  test("strips markdown fences", () => {
    const raw = '```json\n[{"title":"A"}]\n```';
    expect(parseExtractedTasks(raw)).toEqual([
      { title: "A", description: null, dueDate: null, estimatedHours: null, priority: null },
    ]);
  });

  test("recovers when prose surrounds the array", () => {
    const raw = 'Here are the tasks:\n[{"title":"Final paper"}]\nLet me know.';
    expect(parseExtractedTasks(raw)).toHaveLength(1);
  });

  test("returns [] on completely malformed output", () => {
    expect(parseExtractedTasks("I cannot extract tasks.")).toEqual([]);
  });

  test("drops items without a title", () => {
    const raw = JSON.stringify([{ priority: "high" }, { title: "valid" }]);
    expect(parseExtractedTasks(raw)).toEqual([
      { title: "valid", description: null, dueDate: null, estimatedHours: null, priority: null },
    ]);
  });

  test("ignores bad priority values", () => {
    const raw = JSON.stringify([{ title: "x", priority: "URGENT" }]);
    expect(parseExtractedTasks(raw)[0].priority).toBeNull();
  });
});

describe("runExtractTasks", () => {
  const ctx = { userId: "u-1", aiGenerate: async () => "" };

  test("inserts every task and returns a summary", async () => {
    const { fn: query, calls } = makeQuery({
      mime: "application/pdf",
      blob: "https://blob/x.pdf",
      filename: "syllabus.pdf",
    });
    const aiGenerate = async () =>
      JSON.stringify([
        { title: "Reading response", dueDate: "2026-05-01", priority: "low" },
        { title: "Final exam", estimatedHours: 10, priority: "high" },
      ]);

    const result = await runExtractTasks(
      { fileId: "f-1", projectId: "p-1" },
      { ...ctx, aiGenerate },
      { query, extract: mockExtract("syllabus body") },
    );

    expect(result).toMatch(/Extracted 2 tasks: Reading response, Final exam/);
    const inserts = calls.filter((c) => c.sql.includes("INSERT INTO pulse_tasks"));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params).toEqual(
      expect.arrayContaining(["u-1", "Reading response", "Low", "p-1"]),
    );
    // estimatedHours: 10 → 600 minutes
    const finalExamInsert = inserts[1].params;
    expect(finalExamInsert).toContain(600);
    expect(finalExamInsert).toContain("High");
  });

  test("returns a friendly message when zero tasks are extracted", async () => {
    const { fn: query } = makeQuery({
      mime: "application/pdf",
      blob: "https://blob/x.pdf",
      filename: "x.pdf",
    });
    const aiGenerate = async () => "[]";
    const result = await runExtractTasks(
      { fileId: "f-1", projectId: "p-1" },
      { ...ctx, aiGenerate },
      { query, extract: mockExtract("text") },
    );
    expect(result).toMatch(/No tasks found/);
  });

  test("does not insert tasks when AI returns malformed JSON", async () => {
    const { fn: query, calls } = makeQuery({
      mime: "application/pdf",
      blob: "https://blob/x.pdf",
      filename: "x.pdf",
    });
    const aiGenerate = async () => "I'm sorry, I can't help with that.";
    const result = await runExtractTasks(
      { fileId: "f-1", projectId: "p-1" },
      { ...ctx, aiGenerate },
      { query, extract: mockExtract("text") },
    );
    expect(result).toMatch(/No tasks found/);
    expect(calls.find((c) => c.sql.includes("INSERT INTO pulse_tasks"))).toBeUndefined();
  });

  test("throws when the file is not owned by the user", async () => {
    const { fn: query } = makeQuery(null);
    await expect(
      runExtractTasks(
        { fileId: "f-1", projectId: "p-1" },
        { ...ctx, aiGenerate: async () => "[]" },
        { query, extract: mockExtract("") },
      ),
    ).rejects.toThrow(/not found/i);
  });

  test("throws when the file has no mime type", async () => {
    const { fn: query } = makeQuery({ mime: "", blob: "x", filename: "f.bin" });
    await expect(
      runExtractTasks(
        { fileId: "f-1", projectId: "p-1" },
        { ...ctx, aiGenerate: async () => "[]" },
        { query, extract: mockExtract("") },
      ),
    ).rejects.toThrow(/mime/);
  });

  test("returns empty-text message when extractor returns no text", async () => {
    const { fn: query } = makeQuery({
      mime: "application/pdf",
      blob: "x",
      filename: "blank.pdf",
    });
    const result = await runExtractTasks(
      { fileId: "f-1", projectId: "p-1" },
      { ...ctx, aiGenerate: async () => "[]" },
      { query, extract: mockExtract("   ") },
    );
    expect(result).toMatch(/No readable text/i);
  });
});
