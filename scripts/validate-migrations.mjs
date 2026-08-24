import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
const names = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
const problems = [];

for (const name of names) {
  if (!/^\d{8,14}[a-z0-9_]*\.sql$/i.test(name)) {
    problems.push(`${name}: filename must start with an 8–14 digit date/version`);
  }
  const sql = await readFile(new URL(name, migrationsDir), "utf8");
  if (!sql.trim()) problems.push(`${name}: migration is empty`);
  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(sql)) {
    problems.push(`${name}: unresolved merge-conflict marker`);
  }
}

if (problems.length) {
  console.error(`Migration validation failed (${problems.length}):\n${problems.join("\n")}`);
  process.exit(1);
}

console.log(`Migration validation passed: ${names.length} SQL files checked.`);
