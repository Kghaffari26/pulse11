import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { Pool } from "@neondatabase/serverless";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf-8");
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const DEFAULT_MIGRATIONS_DIR = resolve(process.cwd(), "src/db/migrations");

export interface MigrationClient {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
  end?: () => Promise<void>;
}

export interface MigrateOptions {
  client?: MigrationClient;
  migrationsDir?: string;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

async function query(client: MigrationClient, text: string, params?: unknown[]) {
  return client.query(text, params);
}

export async function runMigrations(opts: MigrateOptions = {}): Promise<MigrateResult> {
  const dir = opts.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
  const ownsClient = !opts.client;
  const client: MigrationClient =
    opts.client ??
    (new Pool({ connectionString: process.env.DATABASE_URL }) as unknown as MigrationClient);

  try {
    // Bootstrap migrations_log so we can query applied versions on first run.
    await query(
      client,
      `CREATE TABLE IF NOT EXISTS migrations_log (
         version TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );

    const { rows } = await query(client, "SELECT version FROM migrations_log");
    const already = new Set<string>(rows.map((r) => r.version as string));

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const applied: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (already.has(version)) {
        skipped.push(version);
        continue;
      }
      const sql = readFileSync(join(dir, file), "utf-8");
      await query(client, "BEGIN");
      try {
        await query(client, sql);
        await query(client, "INSERT INTO migrations_log (version) VALUES ($1)", [version]);
        await query(client, "COMMIT");
        applied.push(version);
      } catch (err) {
        await query(client, "ROLLBACK");
        throw new Error(`Migration ${version} failed: ${(err as Error).message}`);
      }
    }

    return { applied, skipped };
  } finally {
    if (ownsClient && client.end) await client.end();
  }
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Expected it in .env.local or process env.");
  }
  const result = await runMigrations();
  if (result.applied.length === 0) {
    console.log(`No pending migrations. ${result.skipped.length} already applied.`);
  } else {
    console.log(`Applied ${result.applied.length} migration(s):`);
    for (const v of result.applied) console.log(`  + ${v}`);
    if (result.skipped.length > 0) {
      console.log(`Skipped ${result.skipped.length} already-applied migration(s).`);
    }
  }
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] != null &&
  /[\\/]migrate\.(ts|js|mjs|cjs)$/.test(process.argv[1]);

if (invokedDirectly) {
  main().catch((e) => {
    console.error("migrate failed:", e);
    process.exit(1);
  });
}
