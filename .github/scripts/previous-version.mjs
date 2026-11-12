#!/usr/bin/env node
/**
 * Read `wrangler deployments list --json` and print the version id that is
 * currently at 100% traffic, as a GitHub Actions output line.
 * Newest deployment wins. Writes `version_id=<uuid>` to stdout.
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
const raw = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
const start = raw.indexOf("[");
if (start === -1) {
  console.error("wrangler deployments list --json did not return a JSON array.");
  process.exit(1);
}

let deployments;
try {
  deployments = JSON.parse(raw.slice(start));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid JSON.");
  process.exit(1);
}
if (!Array.isArray(deployments)) {
  console.error("Expected a JSON array of deployments.");
  process.exit(1);
}

const sorted = [...deployments].sort((a, b) =>
  String(a?.created_on ?? "").localeCompare(String(b?.created_on ?? "")),
);

let versionId = "";
for (let index = sorted.length - 1; index >= 0; index -= 1) {
  const versions = Array.isArray(sorted[index]?.versions) ? sorted[index].versions : [];
  const stable = versions.find(
    (version) => version && Number(version.percentage) === 100 && typeof version.version_id === "string",
  );
  if (stable) {
    versionId = stable.version_id;
    break;
  }
}

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId)) {
  console.error("No current 100% deployment was found to roll back to.");
  process.exit(1);
}

process.stdout.write(`version_id=${versionId}\n`);
