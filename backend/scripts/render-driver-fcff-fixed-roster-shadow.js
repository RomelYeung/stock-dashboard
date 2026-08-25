import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildFixedRosterShadow } from "./build-driver-fcff-vintage.js";

function parseArgs(args = []) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!["--fixture", "--results", "--shadow"].includes(arg) || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error("Usage: node render-driver-fcff-fixed-roster-shadow.js --fixture <path> --results <path> --shadow <path>");
    }
    parsed[arg.slice(2)] = args[++index];
  }
  for (const key of ["fixture", "results", "shadow"]) if (!parsed[key]) throw new Error(`Missing required argument: --${key}`);
  return parsed;
}

function renderFixedRosterShadow({ fixturePath, resultsPath, shadowPath, write = writeFileSync }) {
  const fixture = JSON.parse(readFileSync(resolve(fixturePath), "utf8"));
  const results = JSON.parse(readFileSync(resolve(resultsPath), "utf8"));
  const shadow = buildFixedRosterShadow({
    fixture,
    results,
    fixturePath: resolve(fixturePath),
    resultsPath: resolve(resultsPath),
  });
  const bytes = `${JSON.stringify(shadow, null, 2)}\n`;
  write(resolve(shadowPath), bytes, { flag: "wx" });
  return {
    shadowPath: resolve(shadowPath),
    fixtureSha256: shadow.fixture.sha256,
    resultsSha256: shadow.baseline.sha256,
    metrics: shadow.driverFCFFCohort.candidateSummary,
  };
}

function main(args = process.argv.slice(2)) {
  const parsed = parseArgs(args);
  return renderFixedRosterShadow({
    fixturePath: parsed.fixture,
    resultsPath: parsed.results,
    shadowPath: parsed.shadow,
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(main(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

export { main, parseArgs, renderFixedRosterShadow };
