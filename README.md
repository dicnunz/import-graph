# Tutte

[Open the live demo](https://dicnunz.github.io/demos/boundary-atlas/)

Tutte is a static import analyzer for TypeScript and JavaScript repositories. It parses real imports with `ts-morph`, builds file, folder, and package graphs, and turns them into findings you can export as JSON, Markdown, or an offline HTML viewer.

## Detectors

| Signal | What Tutte flags |
| --- | --- |
| Cycles | strongly connected file, folder, or package graphs |
| Deep imports | imports that bypass a public entrypoint and reach into internals |
| Boundary violations | imports that cross a configured allow-list boundary |
| Cross-feature dependencies | one feature importing from several peer features |
| Dead exports | exports that are not imported or re-exported internally |
| Hotspots | nodes with unusually high fan-in or fan-out |
| Git drift | findings and hotspots added or removed between two refs |

## Example output

Bundled fixtures show the detectors on small example repositories.

- Sample output index: [`docs/samples/README.md`](docs/samples/README.md)
- Fixture catalog: [`fixtures/README.md`](fixtures/README.md)
- Default web demo report: `ts-cross-feature-portal`, preloaded in the viewer with a high-severity finding selected

In the viewer you can:

- Search module paths or import specifiers in file, folder, and package graphs. Matching import specifiers keep both endpoints visible.
- Select a module from the graph or the keyboard-accessible path table, follow incoming and outgoing dependencies, and focus its direct neighborhood.
- Filter the review queue by finding type, severity, or evidence text, then isolate a finding in the graph.
- Open a local v1 JSON report up to 20 MiB. Invalid JSON, unsupported versions, duplicate IDs, and missing graph references produce field-level errors while the current report remains open.

Report files are read in the browser and are never uploaded. Exported viewers use local assets and an embedded report. The default relative Vite base also supports hosting the viewer in a subdirectory.

```text
Boundary Atlas: ts-cross-feature-portal
Files: 9
Packages: 1
Edges: 10
Findings: 5
High severity: 1

Signals:
- cross-feature edges: 2
- dead exports: 1
- hotspots: 2

Top findings:
- [high][cross-feature] Cross-feature fan-out from src/features/checkout
- [warn][cross-feature] Cross-feature fan-out from src/features/reporting
- [warn][dead-export] Unused export opsPortalSnapshot
```

## Screens

![Tutte dependency map](docs/assets/app-home.png)

![Tutte finding inspector](docs/assets/app-detail.png)


## Quick Start

Install dependencies:

```bash
npm install
```

Install the Playwright browser once if you want local e2e runs or to regenerate screenshots:

```bash
npx playwright install chromium
```

Build the CLI and viewer:

```bash
npm run build
```

Analyze a repo and write JSON plus Markdown:

```bash
node packages/cli/dist/index.js analyze ./fixtures/ts-cycle-dashboard \
  --json ./output/ts-cycle-dashboard.json \
  --markdown ./output/ts-cycle-dashboard.md
```

Export the offline HTML viewer:

```bash
node packages/cli/dist/index.js analyze ./fixtures/ts-cross-feature-portal \
  --html ./output/ts-cross-feature-portal-html
```

Serve that directory locally, then open `http://localhost:8080`. All viewer assets and report data are included; no internet connection is needed. A local server is required because browsers restrict JavaScript modules opened directly with `file://`.

```bash
python3 -m http.server 8080 --directory ./output/ts-cross-feature-portal-html
```

Compare two refs for architecture drift:

```bash
node packages/cli/dist/index.js diff . \
  --base HEAD~1 \
  --head HEAD \
  --json ./output/self-drift.json \
  --markdown ./output/self-drift.md
```

## Committed Outputs

Example reports are committed for inspection.

- [`docs/samples/README.md`](docs/samples/README.md): index of committed reports
- [`docs/samples/fixtures/ts-cycle-dashboard/report.md`](docs/samples/fixtures/ts-cycle-dashboard/report.md): cycle report
- [`docs/samples/fixtures/js-deep-import-storefront/report.md`](docs/samples/fixtures/js-deep-import-storefront/report.md): deep import report
- [`docs/samples/fixtures/ts-dead-exports-reporting/report.md`](docs/samples/fixtures/ts-dead-exports-reporting/report.md): dead export report
- [`docs/samples/fixtures/ts-cross-feature-portal/report.md`](docs/samples/fixtures/ts-cross-feature-portal/report.md): cross-feature fan-out report
- [`docs/samples/self/report.md`](docs/samples/self/report.md): self-analysis report for this repo

## Config

Tutte auto-loads `boundary-atlas.config.json` from the target repo when present.

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

`from` matches importer paths. `allow` matches target paths. If an import matches `from` but not `allow`, Tutte reports it as a boundary violation with the concrete edge evidence.

## Output Formats

- JSON: full payload with graphs, findings, hotspots, dead exports, and optional drift
- Markdown: readable audit report with the same derived facts plus prioritized findings
- HTML: offline interactive viewer with the report embedded into the page

## Repo Layout

- `packages/core`: graph extraction, detectors, and report rendering
- `packages/cli`: `analyze` and `diff` commands plus JSON, Markdown, and HTML export
- `apps/web`: offline report viewer built with React and Vite
- `fixtures`: example repositories for the detectors
- `docs/samples`: saved reports for fixtures and self-analysis

## Demo Regeneration

Regenerate the saved reports and screenshots:

```bash
npm run build
npm run demo:fixtures
npm run demo:self
npm run docs:assets
```

## Validation

```bash
npm run verify
```

The full browser pass is available separately:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run demo:fixtures
npm run demo:self
npm run e2e
```

## Scope

v1 is intentionally TS/JS-only. Tutte analyzes static imports, re-exports, public entrypoints, configured boundaries, and graph structure inside the repository you point it at.

## Project status

AI-assisted personal project. Bundled examples and tests demonstrate a limited scope; they are not evidence of production use or independent validation.

## Design

The drawing-sheet layout uses circuit and [transit-diagram conventions](https://tfl.gov.uk/corporate/about-tfl/culture-and-heritage/harry-becks-tube-map): explicit connections, station-like nodes, and a single selection color. The name references Tutte’s [graph-drawing research](https://arxiv.org/abs/1201.3011). CLI, configuration and report contracts retain their existing names.
