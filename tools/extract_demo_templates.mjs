// Copy the ready-made maps (level_templates) from the backend's migrations into
// public/demo/templates.json, so the demo can offer them without any server.
//
//     node tools/extract_demo_templates.mjs [path/to/2D_Game_Engine/migrations]
//
// The migrations are read in order; a later insert of the same code replaces the
// earlier one (they use "on conflict do update"), and the order of first
// appearance is kept, like the backend's "order by id".
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrations = process.argv[2] ?? join(here, "..", "..", "2D_Game_Engine", "migrations");
const out = join(here, "..", "public", "demo", "templates.json");

/** The tuples of SQL literals after "values", up to the closing ";" (strings use '' for a quote). */
function tuples(sql, start) {
  const rows = [];
  let row = null;
  let i = start;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      let value = "";
      i += 1;
      for (;;) {
        if (sql[i] === "'" && sql[i + 1] === "'") { value += "'"; i += 2; continue; }
        if (sql[i] === "'") { i += 1; break; }
        value += sql[i];
        i += 1;
      }
      row?.push(value);
      continue;
    }
    if (ch === "(") row = [];
    else if (ch === ")") { if (row) rows.push(row); row = null; }
    else if (ch === ";" && row === null) break;
    i += 1;
  }
  return rows;
}

const templates = new Map();
for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(migrations, file), "utf8");
  const marker = /insert into level_templates \(code, name, description, scene\) values/gi;
  for (let match; (match = marker.exec(sql)) !== null;) {
    // Only rows of four literals: "on conflict (code)" also has parentheses.
    for (const [code, name, description, scene] of tuples(sql, marker.lastIndex).filter((row) => row.length === 4)) {
      const objects = JSON.parse(scene);
      templates.set(code, { code, name, description, object_count: objects.length, scene: objects });
    }
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify([...templates.values()]));
console.log(`wrote ${out}: ${templates.size} templates`);
