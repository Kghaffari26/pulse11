import {
  deleteCategoryWithReassign,
  seedDefaultCategoriesIfEmpty,
  type TxClient,
} from "./calendar-db";

/**
 * A tiny fake Postgres that backs the calendar tables. Pattern-matches on the
 * SQL we issue in the routes so the tests verify the real flow (not a
 * rewrite-by-accident) while staying in-process.
 */
interface Row {
  id: string;
  user_email: string;
  name: string;
  color: string;
  is_default: boolean;
  created_at: string;
}

function makeStore() {
  let idCounter = 0;
  const categories: Row[] = [];
  const events: { id: string; user_email: string; category_id: string | null }[] = [];

  function query(text: string, params: unknown[] = []): Record<string, unknown>[] {
    const p = params as (string | null | number | boolean)[];

    if (/SELECT\s+1\s+FROM\s+vybe_event_categories\s+WHERE\s+user_email\s+=\s+\$1\s+LIMIT\s+1/i.test(text)) {
      return categories.some((c) => c.user_email === p[0]) ? [{}] : [];
    }
    if (/INSERT\s+INTO\s+vybe_event_categories\b/i.test(text)) {
      idCounter++;
      const [user_email, name, color] = p as [string, string, string];
      categories.push({
        id: `cat-${idCounter}`,
        user_email,
        name,
        color,
        is_default: /TRUE/i.test(text),
        created_at: new Date(Date.now() + idCounter).toISOString(),
      });
      return [];
    }
    if (/SELECT\s+is_default\s+FROM\s+vybe_event_categories\s+WHERE\s+id\s+=\s+\$1\s+AND\s+user_email\s+=\s+\$2/i.test(text)) {
      const found = categories.find((c) => c.id === p[0] && c.user_email === p[1]);
      return found ? [{ is_default: found.is_default }] : [];
    }
    if (/SELECT\s+1\s+FROM\s+vybe_event_categories\s+WHERE\s+id\s+=\s+\$1\s+AND\s+user_email\s+=\s+\$2/i.test(text)) {
      const found = categories.find((c) => c.id === p[0] && c.user_email === p[1]);
      return found ? [{}] : [];
    }
    if (/SELECT\s+COUNT\(\*\)::int\s+AS\s+n\s+FROM\s+vybe_events/i.test(text)) {
      const n = events.filter((e) => e.user_email === p[0] && e.category_id === p[1]).length;
      return [{ n }];
    }
    if (/UPDATE\s+vybe_events\s+SET\s+category_id\s+=\s+NULL/i.test(text)) {
      for (const e of events) {
        if (e.user_email === p[0] && e.category_id === p[1]) e.category_id = null;
      }
      return [];
    }
    if (/UPDATE\s+vybe_events\s+SET\s+category_id\s+=\s+\$3/i.test(text)) {
      for (const e of events) {
        if (e.user_email === p[0] && e.category_id === p[1]) e.category_id = p[2] as string;
      }
      return [];
    }
    if (/DELETE\s+FROM\s+vybe_event_categories\s+WHERE\s+id\s+=\s+\$1\s+AND\s+user_email\s+=\s+\$2/i.test(text)) {
      const idx = categories.findIndex((c) => c.id === p[0] && c.user_email === p[1]);
      if (idx >= 0) categories.splice(idx, 1);
      return [];
    }
    if (/^BEGIN$/i.test(text) || /^COMMIT$/i.test(text) || /^ROLLBACK$/i.test(text) || /pg_advisory_xact_lock/i.test(text)) {
      return [];
    }
    throw new Error(`unhandled query: ${text}`);
  }

  return { categories, events, query };
}

describe("seedDefaultCategoriesIfEmpty", () => {
  test("seeds 4 default categories on first call for a new user", async () => {
    const store = makeStore();

    const result = await seedDefaultCategoriesIfEmpty("user-1", {
      query: async (t, p) => store.query(t, p),
      acquireClient: async () => ({
        query: async (text: string, params?: unknown[]) => ({ rows: store.query(text, params ?? []) }),
        release: () => {},
      }),
    });

    expect(result).toBe(true);
    const seeded = store.categories.filter((c) => c.user_email === "user-1");
    expect(seeded.map((c) => c.name)).toEqual(["Academic", "Personal", "Deadline", "Other"]);
    expect(seeded.every((c) => c.is_default)).toBe(true);
  });

  test("is a no-op when the user already has categories", async () => {
    const store = makeStore();
    store.categories.push({
      id: "pre-1",
      user_email: "user-1",
      name: "Existing",
      color: "#111111",
      is_default: false,
      created_at: new Date().toISOString(),
    });

    const result = await seedDefaultCategoriesIfEmpty("user-1", {
      query: async (t, p) => store.query(t, p),
      acquireClient: async () => ({
        query: async (text: string, params?: unknown[]) => ({ rows: store.query(text, params ?? []) }),
        release: () => {},
      }),
    });

    expect(result).toBe(false);
    expect(store.categories.length).toBe(1);
  });

  test("race-safe: two concurrent callers produce exactly 4 default rows", async () => {
    const store = makeStore();

    // Serialize acquireClient() as the advisory lock would: the second caller
    // awaits until the first's transaction completes.
    let locked: Promise<void> = Promise.resolve();

    const makeClient = async () => {
      // Wait on the current lock, then hold the lock for our own tx.
      const prev = locked;
      let release!: () => void;
      locked = new Promise<void>((r) => {
        release = r;
      });
      await prev;

      const client: TxClient & { release: () => void } = {
        query: async (text: string, params?: unknown[]) => ({
          rows: store.query(text, params ?? []),
        }),
        release: () => release(),
      };
      return client;
    };

    const [a, b] = await Promise.all([
      seedDefaultCategoriesIfEmpty("user-1", {
        query: async (t, p) => store.query(t, p),
        acquireClient: makeClient,
      }),
      seedDefaultCategoriesIfEmpty("user-1", {
        query: async (t, p) => store.query(t, p),
        acquireClient: makeClient,
      }),
    ]);

    expect([a, b].filter(Boolean).length).toBe(1);
    const seeded = store.categories.filter((c) => c.user_email === "user-1");
    expect(seeded.length).toBe(4);
    expect(seeded.map((c) => c.name).sort()).toEqual(
      ["Academic", "Deadline", "Other", "Personal"],
    );
  });

  test("rolls back and rethrows on error", async () => {
    const store = makeStore();
    const boom = new Error("boom");
    const result = seedDefaultCategoriesIfEmpty("user-1", {
      query: async (t, p) => store.query(t, p),
      acquireClient: async () => {
        let failed = false;
        return {
          query: async (text: string, params?: unknown[]) => {
            if (/INSERT INTO vybe_event_categories/.test(text) && !failed) {
              failed = true;
              throw boom;
            }
            return { rows: store.query(text, params ?? []) };
          },
          release: () => {},
        };
      },
    });
    await expect(result).rejects.toThrow("boom");
    expect(store.categories.length).toBe(0);
  });
});

describe("deleteCategoryWithReassign", () => {
  function seedBase() {
    const store = makeStore();
    store.categories.push(
      { id: "cat-a", user_email: "user-1", name: "Academic", color: "#3B82F6", is_default: true, created_at: "" },
      { id: "cat-b", user_email: "user-1", name: "Custom", color: "#00AA00", is_default: false, created_at: "" },
      { id: "cat-c", user_email: "user-1", name: "Alt", color: "#FF00FF", is_default: false, created_at: "" },
    );
    return store;
  }

  const ctx = (store: ReturnType<typeof seedBase>) => ({
    query: async (t: string, p?: unknown[]) => store.query(t, p ?? []),
  });

  test("404 when category not owned by user", async () => {
    const store = seedBase();
    const r = await deleteCategoryWithReassign("other-user", "cat-b", undefined, ctx(store));
    expect(r).toEqual({ ok: false, status: 404, error: expect.any(String) });
  });

  test("400 when deleting a default category", async () => {
    const store = seedBase();
    const r = await deleteCategoryWithReassign("user-1", "cat-a", undefined, ctx(store));
    expect(r).toEqual({ ok: false, status: 400, error: expect.stringMatching(/default/i) });
    expect(store.categories.find((c) => c.id === "cat-a")).toBeDefined();
  });

  test("deletes immediately when the category has no events", async () => {
    const store = seedBase();
    const r = await deleteCategoryWithReassign("user-1", "cat-b", undefined, ctx(store));
    expect(r).toEqual({ ok: true });
    expect(store.categories.find((c) => c.id === "cat-b")).toBeUndefined();
  });

  test("409 when events exist and no reassignTo is provided", async () => {
    const store = seedBase();
    store.events.push({ id: "e1", user_email: "user-1", category_id: "cat-b" });
    const r = await deleteCategoryWithReassign("user-1", "cat-b", undefined, ctx(store));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toMatch(/1 event/);
    }
    // Category still present.
    expect(store.categories.find((c) => c.id === "cat-b")).toBeDefined();
  });

  test("reassigns to an existing category and deletes", async () => {
    const store = seedBase();
    store.events.push(
      { id: "e1", user_email: "user-1", category_id: "cat-b" },
      { id: "e2", user_email: "user-1", category_id: "cat-b" },
      { id: "e3", user_email: "user-1", category_id: "cat-c" },
    );
    const r = await deleteCategoryWithReassign("user-1", "cat-b", "cat-c", ctx(store));
    expect(r).toEqual({ ok: true });
    expect(store.categories.find((c) => c.id === "cat-b")).toBeUndefined();
    expect(store.events.filter((e) => e.category_id === "cat-c").length).toBe(3);
  });

  test("clears category_id when reassignTo is an empty string", async () => {
    const store = seedBase();
    store.events.push({ id: "e1", user_email: "user-1", category_id: "cat-b" });
    const r = await deleteCategoryWithReassign("user-1", "cat-b", "", ctx(store));
    expect(r).toEqual({ ok: true });
    expect(store.events[0].category_id).toBeNull();
  });

  test("400 when reassignTo references an unknown id", async () => {
    const store = seedBase();
    store.events.push({ id: "e1", user_email: "user-1", category_id: "cat-b" });
    const r = await deleteCategoryWithReassign("user-1", "cat-b", "cat-unknown", ctx(store));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
    // No silent delete.
    expect(store.categories.find((c) => c.id === "cat-b")).toBeDefined();
  });

  test("400 when reassignTo points at the same category being deleted", async () => {
    const store = seedBase();
    store.events.push({ id: "e1", user_email: "user-1", category_id: "cat-b" });
    const r = await deleteCategoryWithReassign("user-1", "cat-b", "cat-b", ctx(store));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
});
