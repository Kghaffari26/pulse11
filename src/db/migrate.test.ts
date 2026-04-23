import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations, type MigrationClient } from "./migrate";

function makeClient(initialApplied: string[] = []) {
  const queries: { text: string; params?: unknown[] }[] = [];
  const applied: string[] = [...initialApplied];
  const rollbacks: number[] = [];
  const client: MigrationClient = {
    query: async (text: string, params?: unknown[]) => {
      queries.push({ text, params });
      if (text === "ROLLBACK") rollbacks.push(queries.length);
      if (/SELECT version FROM migrations_log/.test(text)) {
        return { rows: applied.map((v) => ({ version: v })) };
      }
      if (/INSERT INTO migrations_log/.test(text)) {
        const ver = (params as string[])[0];
        if (ver) applied.push(ver);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  return { client, queries, rollbacks, getApplied: () => [...applied] };
}

describe("runMigrations", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pulse-mig-"));
    writeFileSync(join(dir, "001_foo.sql"), "SELECT 1;");
    writeFileSync(join(dir, "002_bar.sql"), "SELECT 2;");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("applies all pending migrations on first run, in sorted order", async () => {
    const { client, queries } = makeClient();
    const r = await runMigrations({ client, migrationsDir: dir });
    expect(r.applied).toEqual(["001_foo", "002_bar"]);
    expect(r.skipped).toEqual([]);
    // Bootstrap + each migration wrapped in BEGIN/COMMIT
    expect(queries.filter((q) => q.text === "BEGIN")).toHaveLength(2);
    expect(queries.filter((q) => q.text === "COMMIT")).toHaveLength(2);
    // migrations_log bootstrap always runs before version lookup
    const bootstrapIdx = queries.findIndex((q) => /CREATE TABLE IF NOT EXISTS migrations_log/.test(q.text));
    const selectIdx = queries.findIndex((q) => /SELECT version FROM migrations_log/.test(q.text));
    expect(bootstrapIdx).toBeGreaterThanOrEqual(0);
    expect(selectIdx).toBeGreaterThan(bootstrapIdx);
  });

  it("skips already-applied migrations and applies the rest", async () => {
    const { client } = makeClient(["001_foo"]);
    const r = await runMigrations({ client, migrationsDir: dir });
    expect(r.skipped).toEqual(["001_foo"]);
    expect(r.applied).toEqual(["002_bar"]);
  });

  it("idempotency: applying then re-applying is a no-op", async () => {
    const { client, getApplied } = makeClient();
    const first = await runMigrations({ client, migrationsDir: dir });
    const second = await runMigrations({ client, migrationsDir: dir });
    expect(first.applied).toEqual(["001_foo", "002_bar"]);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(["001_foo", "002_bar"]);
    // No duplicate version records.
    expect(getApplied()).toEqual(["001_foo", "002_bar"]);
  });

  it("rolls back the failing migration and surfaces the error", async () => {
    const { client, rollbacks } = makeClient();
    const originalQuery = client.query;
    client.query = async (text: string, params?: unknown[]) => {
      if (text === "SELECT 2;") throw new Error("boom");
      return originalQuery(text, params);
    };

    await expect(runMigrations({ client, migrationsDir: dir })).rejects.toThrow(
      /Migration 002_bar failed/,
    );
    expect(rollbacks.length).toBe(1);
  });
});
