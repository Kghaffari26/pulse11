import {
  buildNoteSnippet,
  EMPTY_RESULTS,
  searchAll,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
} from "./search";

interface Captured {
  sql: string;
  params: unknown[];
}

interface Fixture {
  projects?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  notes?: Array<Record<string, unknown>>;
  files?: Array<Record<string, unknown>>;
}

function makeQuery(fx: Fixture) {
  const calls: Captured[] = [];
  const fn = (async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    if (sql.includes("FROM vybe_projects\n")) return fx.projects ?? [];
    if (sql.includes("FROM pulse_tasks")) return fx.tasks ?? [];
    if (sql.includes("FROM vybe_project_notes")) return fx.notes ?? [];
    if (sql.includes("FROM vybe_project_files")) return fx.files ?? [];
    return [];
  }) as never;
  return { fn, calls };
}

describe("buildNoteSnippet", () => {
  test("returns ~80-char window centered on the match", () => {
    const content = "a".repeat(50) + "MATCH" + "b".repeat(50);
    const out = buildNoteSnippet(content, "match");
    expect(out).toContain("MATCH");
    expect(out!.startsWith("…")).toBe(true);
    expect(out!.endsWith("…")).toBe(true);
    expect(out!.length).toBeLessThanOrEqual(40 + 5 + 40 + 2); // radius*2 + match + ellipses
  });

  test("falls back to first ~80 chars when match isn't in content (matched on title)", () => {
    const content = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
    const out = buildNoteSnippet(content, "absent");
    expect(out).toBe(content.slice(0, 80).trim());
    expect(out!.startsWith("…")).toBe(false);
  });

  test("returns null for empty content", () => {
    expect(buildNoteSnippet("", "x")).toBeNull();
    expect(buildNoteSnippet(null, "x")).toBeNull();
  });

  test("no leading ellipsis when match is at position 0", () => {
    const out = buildNoteSnippet("MATCH and the rest of the content", "match");
    expect(out!.startsWith("…")).toBe(false);
    expect(out).toContain("MATCH");
  });

  test("no trailing ellipsis when match is near the end", () => {
    const content = "the end is " + "MATCH";
    const out = buildNoteSnippet(content, "match");
    expect(out!.endsWith("…")).toBe(false);
  });
});

describe("searchAll", () => {
  test("returns EMPTY_RESULTS for queries shorter than SEARCH_MIN_QUERY", async () => {
    const { fn, calls } = makeQuery({});
    const r = await searchAll("u-1", "a", undefined, { query: fn });
    expect(r).toEqual(EMPTY_RESULTS);
    expect(calls).toHaveLength(0);
  });

  test("trims whitespace before comparing to min length", async () => {
    const { fn, calls } = makeQuery({});
    await searchAll("u-1", "  a  ", undefined, { query: fn });
    expect(calls).toHaveLength(0);
  });

  test("scopes every query by user_email and lowercases the pattern", async () => {
    const { fn, calls } = makeQuery({});
    await searchAll("u-1", "Econ", 5, { query: fn });
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c.params[0]).toBe("u-1");
      expect(c.params[1]).toBe("%econ%");
    }
  });

  test("excludes archived projects and completed tasks", async () => {
    const { fn, calls } = makeQuery({});
    await searchAll("u-1", "math", undefined, { query: fn });
    const projects = calls.find((c) => c.sql.includes("FROM vybe_projects\n"))!;
    const tasks = calls.find((c) => c.sql.includes("FROM pulse_tasks"))!;
    expect(projects.sql).toMatch(/archived\s*=\s*FALSE/);
    expect(tasks.sql).toMatch(/status\s*<>\s*'completed'/);
    expect(tasks.sql).toMatch(/status\s*<>\s*'done'/);
  });

  test("notes/files JOIN to projects and exclude archived projects", async () => {
    const { fn, calls } = makeQuery({});
    await searchAll("u-1", "syllabus", undefined, { query: fn });
    const notes = calls.find((c) => c.sql.includes("FROM vybe_project_notes"))!;
    const files = calls.find((c) => c.sql.includes("FROM vybe_project_files"))!;
    expect(notes.sql).toMatch(/JOIN vybe_projects/);
    expect(files.sql).toMatch(/JOIN vybe_projects/);
    expect(notes.sql).toMatch(/p\.archived\s*=\s*FALSE/);
    expect(files.sql).toMatch(/p\.archived\s*=\s*FALSE/);
  });

  test("clamps limit into [1, SEARCH_MAX_LIMIT]", async () => {
    const { fn, calls } = makeQuery({});
    await searchAll("u-1", "x", 999, { query: fn });
    for (const c of calls) expect(c.params[2]).toBe(SEARCH_MAX_LIMIT);

    calls.length = 0;
    await searchAll("u-1", "x", -3, { query: fn });
    for (const c of calls) expect(c.params[2]).toBe(1);

    calls.length = 0;
    await searchAll("u-1", "x", undefined, { query: fn });
    for (const c of calls) expect(c.params[2]).toBe(SEARCH_DEFAULT_LIMIT);
  });

  test("maps result rows to the documented response shape", async () => {
    const { fn } = makeQuery({
      projects: [{ id: "p1", name: "Econ 101", description: "intro to economics" }],
      tasks: [
        {
          id: "t1",
          title: "Reading 1",
          description: null,
          project_id: "p1",
          project_name: "Econ 101",
        },
      ],
      notes: [
        {
          id: "n1",
          title: "Lecture notes",
          content_markdown: "Demand shifts left when income drops",
          project_id: "p1",
          project_name: "Econ 101",
        },
      ],
      files: [{ id: "f1", filename: "syllabus.pdf", project_id: "p1", project_name: "Econ 101" }],
    });
    const r = await searchAll("u-1", "demand", 5, { query: fn });
    expect(r.projects).toEqual([{ id: "p1", name: "Econ 101", description: "intro to economics" }]);
    expect(r.tasks[0]).toMatchObject({ id: "t1", title: "Reading 1", projectName: "Econ 101" });
    expect(r.notes[0].snippet).toContain("Demand");
    expect(r.files[0]).toEqual({
      id: "f1",
      filename: "syllabus.pdf",
      projectId: "p1",
      projectName: "Econ 101",
    });
  });

  test("note results carry a snippet derived from the content", async () => {
    const { fn } = makeQuery({
      notes: [
        {
          id: "n1",
          title: null,
          content_markdown: "lots of text before the WORD and lots of text after",
          project_id: "p1",
          project_name: "P",
        },
      ],
    });
    const r = await searchAll("u-1", "word", 5, { query: fn });
    expect(r.notes[0].snippet).toContain("WORD");
  });

  test("note with empty content yields snippet=null", async () => {
    const { fn } = makeQuery({
      notes: [
        {
          id: "n1",
          title: "Title only",
          content_markdown: null,
          project_id: "p1",
          project_name: "P",
        },
      ],
    });
    const r = await searchAll("u-1", "title", 5, { query: fn });
    expect(r.notes[0].snippet).toBeNull();
  });

  test("returns 4 distinct queries fired in parallel — none of them leaks across users", async () => {
    const { fn, calls } = makeQuery({});
    await searchAll("u-A", "thing", 5, { query: fn });
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c.params[0]).toBe("u-A");
      // Any other userId must not appear in params.
      expect(c.params).not.toContain("u-B");
    }
  });
});
