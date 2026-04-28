import { runSummarizeFile } from "./summarize-file";

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
            filename: file.filename,
            blob_url: file.blob,
            mime_type: file.mime,
          }]
        : [];
    }
    return [];
  }) as never;
  return { fn, calls };
}

const mockExtract = (text: string) =>
  (async () => ({ text, truncated: false })) as never;

describe("runSummarizeFile", () => {
  const ctx = { userId: "u-1", aiGenerate: async () => "" };

  test("inserts a note titled 'Summary of <filename>' with the AI's markdown", async () => {
    const { fn: query, calls } = makeQuery({
      mime: "application/pdf",
      blob: "https://blob/syllabus.pdf",
      filename: "syllabus.pdf",
    });
    const summary = "## Main thesis\nThe course covers economics.\n## Key points\n- a\n- b\n- c";
    const aiGenerate = async () => summary;

    const result = await runSummarizeFile(
      { fileId: "f-1", projectId: "p-1" },
      { ...ctx, aiGenerate },
      { query, extract: mockExtract("course material body") },
    );

    expect(result).toBe("Summary saved as note: Summary of syllabus.pdf");
    const insert = calls.find((c) => c.sql.includes("INSERT INTO vybe_project_notes"));
    expect(insert).toBeDefined();
    expect(insert?.params).toEqual([
      "p-1",
      "u-1",
      "Summary of syllabus.pdf",
      summary,
    ]);
  });

  test("throws when the file is not accessible", async () => {
    const { fn: query } = makeQuery(null);
    await expect(
      runSummarizeFile(
        { fileId: "f-1", projectId: "p-1" },
        { ...ctx, aiGenerate: async () => "anything" },
        { query, extract: mockExtract("") },
      ),
    ).rejects.toThrow(/not found/i);
  });

  test("returns a no-text message and skips the insert when extraction is empty", async () => {
    const { fn: query, calls } = makeQuery({
      mime: "application/pdf",
      blob: "x",
      filename: "blank.pdf",
    });
    const result = await runSummarizeFile(
      { fileId: "f-1", projectId: "p-1" },
      { ...ctx, aiGenerate: async () => "summary" },
      { query, extract: mockExtract("") },
    );
    expect(result).toMatch(/No readable text/i);
    expect(calls.find((c) => c.sql.includes("INSERT INTO vybe_project_notes"))).toBeUndefined();
  });

  test("throws when the model returns an empty summary", async () => {
    const { fn: query } = makeQuery({
      mime: "application/pdf",
      blob: "x",
      filename: "x.pdf",
    });
    await expect(
      runSummarizeFile(
        { fileId: "f-1", projectId: "p-1" },
        { ...ctx, aiGenerate: async () => "   " },
        { query, extract: mockExtract("body") },
      ),
    ).rejects.toThrow(/empty summary/i);
  });

  test("requires fileId and projectId", async () => {
    const { fn: query } = makeQuery(null);
    await expect(
      runSummarizeFile(
        { fileId: "", projectId: "p-1" },
        { ...ctx, aiGenerate: async () => "" },
        { query, extract: mockExtract("") },
      ),
    ).rejects.toThrow(/fileId/);
  });
});
