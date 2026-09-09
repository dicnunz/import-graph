import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { GraphView } from './GraphView.js';
import { FINDING_LABELS, GRANULARITIES, filterGraph, findingNodeIds, findNodeGranularity, neighborhoodIds, nodeConnections, prioritizeFindings } from './explore-graph.js';
import { MAX_REPORT_BYTES, parseReport, validateReport, type ReportValidation } from './validate-report.js';
import type { BoundaryAtlasFinding, BoundaryAtlasGranularity, BoundaryAtlasReport } from './report-types.js';

declare global {
  interface Window { __BOUNDARY_ATLAS_EMBEDDED_REPORT__?: unknown }
}

type LoadError = Extract<ReportValidation, { ok: false }>;
type Focus = 'all' | 'finding' | 'neighbors';

export function App() {
  const [report, setReport] = useState<BoundaryAtlasReport | null>(null);
  const [source, setSource] = useState('Loading example report…');
  const [error, setError] = useState<LoadError | null>(null);
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState<BoundaryAtlasGranularity>('file');
  const [search, setSearch] = useState('');
  const [findingSearch, setFindingSearch] = useState('');
  const [findingType, setFindingType] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [focus, setFocus] = useState<Focus>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  const deferredSearch = useDeferredValue(search);
  const deferredFindingSearch = useDeferredValue(findingSearch);
  // Clear/reset actions must not keep filtering by a deferred query from the previous view.
  const graphQuery = search.trim() ? deferredSearch : '';
  const findingQuery = findingSearch.trim() ? deferredFindingSearch : '';

  const applyReport = useCallback((nextReport: BoundaryAtlasReport, nextSource: string) => {
    const featured = prioritizeFindings(nextReport.findings)[0];
    startTransition(() => {
      setReport(nextReport);
      setSource(nextSource);
      setError(null);
      setSearch('');
      setFindingSearch('');
      setFindingType('all');
      setSeverity('all');
      setFocus('all');
      setSelectedFindingId(featured?.id ?? null);
      setSelectedNodeId(featured?.nodeIds[0] ?? null);
      setGranularity(findNodeGranularity(nextReport, featured?.nodeIds[0] ?? null));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sequence = loadSequence.current;
    const load = async () => {
      try {
        let result: ReportValidation;
        const embedded = window.__BOUNDARY_ATLAS_EMBEDDED_REPORT__;
        if (embedded !== undefined) {
          result = validateReport(embedded);
        } else {
          const response = await fetch('./demo-report.json');
          if (!response.ok) throw new Error(`Example report could not be loaded (${response.status}).`);
          result = parseReport(await response.text());
        }
        if (cancelled || sequence !== loadSequence.current) return;
        if (result.ok) applyReport(result.report, embedded !== undefined ? 'Embedded report' : 'Example report');
        else { setError(result); setSource('No report loaded'); }
      } catch (cause) {
        if (!cancelled && sequence === loadSequence.current) {
          setSource('No report loaded');
          setError({ ok: false, message: cause instanceof Error ? cause.message : 'Could not load the report.', issues: ['Open a Boundary Atlas report JSON to continue.'] });
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [applyReport]);

  const handleFileLoad = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // A corrected file with the same name can be selected again.
    if (!file) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      if (file.size > MAX_REPORT_BYTES) {
        setError({ ok: false, message: 'This report is larger than 20 MiB.', issues: ['Analyze a smaller repository or package, then open its JSON report.'] });
        return;
      }
      const result = parseReport(await file.text());
      if (sequence !== loadSequence.current) return;
      if (result.ok) applyReport(result.report, file.name);
      else setError(result);
    } catch {
      if (sequence === loadSequence.current) setError({ ok: false, message: 'This file could not be read.', issues: ['Choose the file again or export a new JSON report.'] });
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };

  const findings = useMemo(() => prioritizeFindings(report?.findings ?? []), [report]);
  const selectedFinding = findings.find((finding) => finding.id === selectedFindingId) ?? null;
  const activeGraph = report?.graphs[granularity];
  const selectedNode = activeGraph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const evidenceIds = useMemo(() => selectedFinding && activeGraph ? findingNodeIds(activeGraph, selectedFinding) : [], [selectedFinding, activeGraph]);
  const selectedIds = useMemo(() => new Set(evidenceIds), [evidenceIds]);
  const focusIds = useMemo(() => focus === 'finding' ? evidenceIds
    : focus === 'neighbors' && activeGraph && selectedNodeId ? neighborhoodIds(activeGraph, selectedNodeId) : null,
  [activeGraph, focus, evidenceIds, selectedNodeId]);
  const visibleGraph = useMemo(() => activeGraph ? filterGraph(activeGraph, graphQuery, focusIds) : null,
    [activeGraph, graphQuery, focusIds]);
  const connections = useMemo(() => activeGraph && selectedNode ? nodeConnections(activeGraph, selectedNode.id) : null, [activeGraph, selectedNode]);
  const visibleFindings = useMemo(() => {
    const query = findingQuery.trim().toLowerCase();
    return findings.filter((finding) =>
      (findingType === 'all' || finding.type === findingType)
      && (severity === 'all' || finding.severity === severity)
      && (!query || [finding.title, finding.summary, finding.type, ...finding.evidence.flatMap((item) => [item.label, item.sourcePath ?? '', item.targetPath ?? '', item.specifier ?? ''])].join(' ').toLowerCase().includes(query))
    );
  }, [findings, findingType, severity, findingQuery]);
  const sortedNodes = useMemo(() => visibleGraph?.nodes.slice().sort((left, right) => left.path.localeCompare(right.path)) ?? [], [visibleGraph]);
  const highCount = findings.filter((finding) => finding.severity === 'high').length;

  const selectNode = (id: string) => {
    setSelectedNodeId(id);
    setSelectedFindingId(null);
    if (focus === 'finding') setFocus('neighbors');
  };
  const selectFinding = (finding: BoundaryAtlasFinding) => {
    if (!report) return;
    setSelectedFindingId(finding.id);
    setSelectedNodeId(finding.nodeIds[0] ?? null);
    setGranularity(findNodeGranularity(report, finding.nodeIds[0] ?? null));
    setSearch('');
    setFocus('all');
  };
  const resetGraph = () => { setSearch(''); setFocus('all'); };

  return (
    <main className="atlas-shell">
      <header className="atlas-header">
        <a className="brand" href="#workspace" aria-label="Import Graph report workspace">
          <img src="./mark.svg" alt="" width="34" height="34" />
          <span>Import Graph</span>
        </a>
        <div className="atlas-actions">
          <span className="local-badge"><i /> Local report viewer</span>
          <button className="primary-button" type="button" disabled={loading} onClick={() => inputRef.current?.click()}>{loading ? 'Reading report…' : 'Open report JSON'} <span aria-hidden="true">↗</span></button>
          <input ref={inputRef} hidden type="file" accept=".json,application/json" aria-label="Open report JSON" onChange={handleFileLoad} />
        </div>
      </header>

      {error ? (
        <section className="import-error" role="alert">
          <div><strong>{error.message}</strong><p>{report ? 'Your current report is still open. Fix these fields or choose another report.' : 'Choose a Boundary Atlas JSON report to continue.'}</p>
            <ul>{error.issues.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            <p className="muted">Export a fresh report with <code>boundary-atlas analyze ./repo --json report.json</code></p>
          </div>
          <button className="quiet-button" type="button" onClick={() => setError(null)}>Dismiss</button>
        </section>
      ) : null}

      <section className="report-heading" aria-label="Report summary">
        <div className="report-copy">
          <p className="eyebrow">{report?.kind === 'diff' ? 'Architecture comparison' : 'Repository analysis'}</p>
          <h1>{report?.project.label || 'Explore your architecture'}</h1>

          <div className="report-meta"><span className="source-label" role="status">{source}</span>{report ? <time dateTime={report.generatedAt}>{new Date(report.generatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })} · UTC</time> : null}</div>
        </div>
        {report ? <dl className="summary-strip">
          <div><dt>Files</dt><dd>{report.summary.fileCount}</dd></div>
          <div><dt>Import edges</dt><dd>{report.summary.internalEdgeCount}</dd></div>
          <div><dt>Findings</dt><dd>{findings.length}</dd></div>
          <div className={highCount > 0 ? 'summary-alert' : ''}><dt>High severity</dt><dd>{highCount}</dd></div>
        </dl> : null}
      </section>

      {report && activeGraph && visibleGraph ? <>
        {report.drift ? <section className="drift-strip" aria-label="Git drift"><span className="eyebrow">Git comparison</span><code>{report.drift.baseRef} → {report.drift.headRef}</code><span>+{report.drift.addedFindings.length} findings</span><span>−{report.drift.removedFindings.length} findings</span><span>{report.drift.hotspotDeltas.length} hotspot changes</span></section> : null}
        <section className="workspace-grid" id="workspace">
          <div className="explorer-column">
            <section className="graph-panel panel" aria-labelledby="graph-title">
              <div className="panel-header">
                <div><h2 id="graph-title">{granularity[0]!.toUpperCase() + granularity.slice(1)} view</h2></div>
                <div className="granularity-toggle" role="group" aria-label="Graph granularity">
                  {GRANULARITIES.map((entry) => <button key={entry} type="button" aria-pressed={entry === granularity} onClick={() => { setGranularity(entry); setSelectedNodeId(null); setSelectedFindingId(null); resetGraph(); }}>{entry[0]!.toUpperCase() + entry.slice(1)}</button>)}
                </div>
              </div>
              <div className="graph-controls">
                <label className="search-field"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search modules or import specifiers" placeholder="Find a path or import specifier…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                <span className="result-count" aria-live="polite">{visibleGraph.nodes.length} of {activeGraph.nodes.length} nodes · {visibleGraph.edges.length} {visibleGraph.edges.length === 1 ? 'edge' : 'edges'}</span>
              </div>
              {focus !== 'all' ? <div className="focus-banner"><span>{focus === 'finding' ? 'Showing selected finding' : `Dependencies of ${selectedNode?.label ?? 'selected node'}`}</span><button type="button" onClick={() => setFocus('all')}>Show all nodes ×</button></div> : null}
              <GraphView graph={visibleGraph} highlightedIds={selectedIds} selectedNodeId={selectedNodeId} onSelect={selectNode} onReset={resetGraph} />
            </section>

            <section className="module-panel panel" aria-labelledby="modules-title">
              <div className="panel-header"><div><h2 id="modules-title">Modules <span className="count-badge">{sortedNodes.length}</span></h2></div></div>
              <div className="module-table-wrap">
                <table className="module-table"><thead><tr><th scope="col">Path</th><th scope="col" title="Incoming edges">In</th><th scope="col" title="Outgoing edges">Out</th></tr></thead><tbody>
                  {sortedNodes.map((node) => <tr key={node.id} className={node.id === selectedNodeId ? 'selected-module' : ''}><td><button type="button" aria-pressed={node.id === selectedNodeId} onClick={() => selectNode(node.id)}><span className="module-icon" aria-hidden="true">{node.kind === 'file' ? '◇' : '▱'}</span><span>{node.path}</span>{node.isPublicEntrypoint ? <span className="entrypoint-tag">public</span> : null}</button></td><td>{node.fanIn}</td><td>{node.fanOut}</td></tr>)}
                </tbody></table>
                {sortedNodes.length === 0 ? <p className="list-empty">No matching modules. Reset the graph filters to start again.</p> : null}
              </div>
            </section>
          </div>

          <aside className="inspector-column" aria-label="Findings and details">
            <section className="panel findings-panel" aria-labelledby="findings-title">
              <div className="panel-header"><div><h2 id="findings-title">Findings <span className="count-badge">{findings.length}</span></h2></div></div>
              <div className="finding-filters">
                <label className="search-field"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search findings" placeholder="Search findings…" value={findingSearch} onChange={(event) => setFindingSearch(event.target.value)} /></label>
                <div className="filter-selects"><select aria-label="Filter finding type" value={findingType} onChange={(event) => setFindingType(event.target.value)}><option value="all">All finding types</option>{Object.entries(FINDING_LABELS).map(([type, label]) => <option key={type} value={type}>{label} ({findings.filter((finding) => finding.type === type).length})</option>)}</select><select aria-label="Filter severity" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All severities</option><option value="high">High</option><option value="warn">Warning</option><option value="info">Info</option></select></div>
              </div>
              <p className="finding-count" aria-live="polite">{visibleFindings.length} of {findings.length} findings</p>
              <div className="finding-list">
                {visibleFindings.map((finding) => <button type="button" key={finding.id} className={`finding-row${finding.id === selectedFindingId ? ' is-active' : ''}`} aria-pressed={finding.id === selectedFindingId} onClick={() => selectFinding(finding)}><span className="finding-row-meta"><span className={`severity-chip severity-${finding.severity}`}>{finding.severity === 'warn' ? 'warning' : finding.severity}</span><span>{FINDING_LABELS[finding.type]}</span></span><strong>{finding.title}</strong><span className="finding-arrow" aria-hidden="true">↗</span></button>)}
                {visibleFindings.length === 0 ? <div className="list-empty"><strong>{findings.length === 0 ? 'No structural findings' : 'No findings match these filters'}</strong><p>{findings.length === 0 ? 'You can still explore every module and dependency.' : 'Try another search, severity, or finding type.'}</p>{findings.length > 0 ? <button type="button" className="quiet-button" onClick={() => { setFindingSearch(''); setFindingType('all'); setSeverity('all'); }}>Clear finding filters</button> : null}</div> : null}
              </div>
            </section>

            <section className="panel inspector-panel" aria-labelledby="detail-title">
              <div className="panel-header"><div><h2 id="detail-title">{selectedFinding ? 'Finding detail' : selectedNode ? 'Node detail' : 'Select a module or finding'}</h2></div></div>
              {selectedFinding ? <div className="finding-card">
                <span className={`severity-chip severity-${selectedFinding.severity}`}>{selectedFinding.severity === 'warn' ? 'warning' : selectedFinding.severity}</span>
                <h3>{selectedFinding.title}</h3><p>{selectedFinding.summary}</p>
                <div className="why-risky"><h4>Why this matters</h4><p>{selectedFinding.whyRisky}</p></div>
                {selectedFinding.nodeIds.length > 0 ? <button className="quiet-button focus-button" type="button" aria-pressed={focus === 'finding'} onClick={() => { setSearch(''); setFocus(focus === 'finding' ? 'all' : 'finding'); }}>{focus === 'finding' ? 'Show full graph' : 'Isolate finding in graph'}</button> : null}
                <h4>Evidence <span className="count-badge">{selectedFinding.evidence.length}</span></h4>
                <ul className="evidence-list">{selectedFinding.evidence.map((item, index) => <li key={index}><strong>{item.label}</strong>{item.sourcePath ? <code>{item.sourcePath}</code> : null}{item.targetPath ? <code>→ {item.targetPath}</code> : null}{item.specifier ? <span>Import: <code>{item.specifier}</code></span> : null}{item.details ? <p>{item.details}</p> : null}</li>)}</ul>
              </div> : selectedNode && connections ? <div className="node-card">
                <span className="node-kind">{selectedNode.kind}{selectedNode.isPublicEntrypoint ? ' · public entrypoint' : ''}</span><h3>{selectedNode.path}</h3>
                <dl className="node-metrics"><div><dt>Fan-in</dt><dd>{selectedNode.fanIn}</dd></div><div><dt>Fan-out</dt><dd>{selectedNode.fanOut}</dd></div></dl>
                {selectedNode.packageName ? <p className="node-package">Package <code>{selectedNode.packageName}</code></p> : null}
                <button className="quiet-button focus-button" type="button" aria-pressed={focus === 'neighbors'} onClick={() => { setSearch(''); setFocus(focus === 'neighbors' ? 'all' : 'neighbors'); }}>{focus === 'neighbors' ? 'Show full graph' : 'Focus direct dependencies'}</button>
                {(['outgoing', 'incoming'] as const).map((direction) => <div className="connections" key={direction}><h4>{direction === 'outgoing' ? 'Imports' : 'Imported by'} <span className="count-badge">{connections[direction].length}</span></h4>{connections[direction].length ? <ul>{connections[direction].map(({ node, edge }) => <li key={edge.id}><button type="button" onClick={() => selectNode(node.id)}><strong>{node.path}</strong><span>{edge.kind === 'reexport' ? 'Re-export' : 'Import'} · {edge.importCount} {edge.importCount === 1 ? 'statement' : 'statements'}</span><code>{edge.specifiers.join(', ')}</code></button></li>)}</ul> : <p className="muted small">No {direction === 'outgoing' ? 'outgoing' : 'incoming'} internal dependencies.</p>}</div>)}
              </div> : <div className="list-empty"><p>Choose a node in the map or module list to trace incoming and outgoing dependencies. Select a finding to inspect its source evidence.</p></div>}
            </section>
          </aside>
        </section>
      </> : <section className="welcome-panel panel"><h2>Open a local architecture report</h2><p>Generate a report from a TypeScript or JavaScript repository, then open its JSON file here.</p><code>boundary-atlas analyze ./repo --json report.json</code></section>}
      <footer className="atlas-footer"><span>Import Graph · TS/JS static analysis</span><span>Local report · No uploads</span></footer>
    </main>
  );
}
