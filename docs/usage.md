# Configuration and reports

Import Graph auto-loads `boundary-atlas.config.json` from the target repo when present.

Example:

```json
{
  "publicEntrypoints": [
    "packages/*/src/index.ts",
    "**/index.ts",
    "**/index.js"
  ],
  "boundaries": [
    {
      "name": "cli-to-core",
      "from": ["packages/cli/src/**"],
      "allow": ["packages/cli/src/**", "packages/core/src/**"]
    }
  ]
}
```

`from` matches importer paths. `allow` matches target paths. If an import matches `from` but not `allow`, Import Graph reports it as a boundary violation with the concrete edge evidence.


## Export

JSON contains graphs, findings, hotspots, dead exports, and optional Git comparison results. Markdown presents those results as a report. HTML includes the interactive viewer, local assets, and embedded report.

```bash
node packages/cli/dist/index.js analyze ./fixtures/ts-cross-feature-portal \
  --html ./output/ts-cross-feature-portal-html
python3 -m http.server 8080 --directory ./output/ts-cross-feature-portal-html
```

Open `http://localhost:8080`. The viewer works without an internet connection. A local server is required because browsers restrict JavaScript modules opened through `file://`.

The viewer accepts v1 JSON reports up to 20 MiB. It validates versions, IDs, and graph references before replacing the displayed report. Files are read in the browser and never uploaded.

Search matches module paths and import specifiers. Select a module to follow its incoming and outgoing dependencies, or select a finding to isolate its edges. The path table supports keyboard selection.

## Regenerate examples

```bash
npm run build
npm run demo:fixtures
npm run demo:self
npx playwright install chromium
npm run docs:assets
```

Reports are saved under `docs/samples`; screenshots are under `docs/assets`.

## Development

`packages/core` extracts graphs, detects findings, and renders reports. `packages/cli` exposes `analyze` and `diff`. `apps/web` contains the React viewer. [Fixtures](../fixtures/README.md) exercise individual detectors.

`npm run verify` runs lint, type checks, unit tests, a build, fixture analysis, and self-analysis. Browser tests are separate: install Chromium with `npx playwright install chromium`, then run `npm run e2e`.
