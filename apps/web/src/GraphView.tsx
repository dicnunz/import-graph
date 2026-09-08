import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { BoundaryAtlasGraph, BoundaryAtlasGraphNode } from './report-types.js';

interface Props {
  graph: BoundaryAtlasGraph;
  highlightedIds: ReadonlySet<string>;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  onReset: () => void;
}

export function GraphView({ graph, highlightedIds, selectedNodeId, onSelect, onReset }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const engine = useRef<ForceGraphMethods<BoundaryAtlasGraphNode> | undefined>(undefined);
  const fitted = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The force engine mutates positions and link endpoints. Never pass it report objects.
  const data = useMemo(() => ({
    nodes: graph.nodes.map((node) => ({ ...node })),
    links: graph.edges.map((edge) => ({ ...edge }))
  }), [graph]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fitted.current = false;
  }, [data]);

  useEffect(() => {
    const link = engine.current?.d3Force('link');
    link?.distance(85);
  }, [data, size.width, size.height]);

  const fit = () => engine.current?.zoomToFit(250, 65);

  return (
    <>
      <div className="graph-frame" ref={container} role="group" aria-label={`${graph.granularity} dependency graph: ${graph.nodes.length} nodes and ${graph.edges.length} edges. Use the module list below to inspect nodes with a keyboard.`}>
        {graph.nodes.length === 0 ? (
          <div className="empty-state">
            <strong>No modules in this view</strong>
            <p>Try a different path, import specifier, or graph scope.</p>
            <button className="quiet-button" type="button" onClick={onReset}>Reset graph filters</button>
          </div>
        ) : size.width > 0 && size.height > 0 ? (
          <ForceGraph2D
            ref={engine}
            graphData={data}
            width={size.width}
            height={size.height}
            cooldownTicks={100}
            warmupTicks={30}
            nodeRelSize={5}
            nodeLabel={() => ''}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={0.88}
            linkColor={() => '#8da7b1'}
            linkWidth={1.2}
            onEngineStop={() => {
              if (!fitted.current) { fit(); fitted.current = true; }
            }}
            onNodeClick={(node) => onSelect(node.id)}
            nodeCanvasObject={(node, context, scale) => {
              const highlighted = highlightedIds.has(node.id) || node.id === selectedNodeId;
              const radius = highlighted ? 6 : 4.5;
              context.beginPath();
              context.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
              context.fillStyle = highlighted ? '#125f75' : '#fff';
              context.fill();
              context.strokeStyle = highlighted ? "#125f75" : "#688b99";
              context.lineWidth = 1.5 / scale;
              context.stroke();
              if (node.id === selectedNodeId) {
                context.beginPath();
                context.arc(node.x ?? 0, node.y ?? 0, radius + 3, 0, 2 * Math.PI);
                context.strokeStyle = '#125f75';
                context.lineWidth = 1 / scale;
                context.stroke();
              }
              if (scale > 0.6 || highlighted) {
                const fontSize = 11 / scale;
                const label = node.path.split('/').slice(-2).join('/');
                context.font = `${fontSize}px ui-monospace, monospace`;
                context.fillStyle = highlighted ? '#173f51' : '#4b6e7d';
                context.fillText(label, (node.x ?? 0) + radius + 3, (node.y ?? 0) + fontSize / 3);
              }
            }}
          />
        ) : null}
      </div>
      <div className="graph-footer">
        <span><i className="legend-dot" /> Selected modules <span className="legend-direction">· Importer → dependency</span></span>
        <div className="graph-navigation" aria-label="Graph navigation">
          <button type="button" aria-label="Zoom out" disabled={!graph.nodes.length} onClick={() => engine.current?.zoom((engine.current?.zoom() ?? 1) / 1.4, 180)}>−</button>
          <button type="button" aria-label="Zoom in" disabled={!graph.nodes.length} onClick={() => engine.current?.zoom((engine.current?.zoom() ?? 1) * 1.4, 180)}>+</button>
          <button type="button" disabled={!graph.nodes.length} onClick={fit}>Fit graph</button>
        </div>
      </div>
    </>
  );
}
