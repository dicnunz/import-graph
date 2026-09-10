import { useEffect, useMemo, useRef, useState } from 'react';
import { placeLabel, LabelIndex } from './graph-labels.js';
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
            onRenderFramePost={(context, scale) => {
              const positioned = data.nodes as Array<BoundaryAtlasGraphNode & { x?: number; y?: number }>;
              const fontSize = 12 / scale;
              const labelHeight = 18 / scale;
              const occupied = new LabelIndex(64 / scale);
              // Render labels only for visible nodes. All nodes remain in the graph and module list.
              const visible = positioned.filter(node => {
                const screen = engine.current?.graph2ScreenCoords(node.x ?? 0, node.y ?? 0);
                return screen && screen.x >= 0 && screen.y >= 0 && screen.x <= size.width && screen.y <= size.height;
              });
              visible.forEach(node => occupied.add({ x: (node.x ?? 0) - 8, y: (node.y ?? 0) - 8, width: 16, height: 16 }));
              context.font = `${fontSize}px ui-monospace, monospace`;
              // Keep interaction work bounded at overview scale; selection and finding evidence take priority.
              const ordered = visible.filter(node => scale > 0.6 || highlightedIds.has(node.id) || node.id === selectedNodeId)
                .sort((a, b) => Number(b.id === selectedNodeId) - Number(a.id === selectedNodeId)
                  || Number(highlightedIds.has(b.id)) - Number(highlightedIds.has(a.id)) || a.path.localeCompare(b.path)).slice(0, 96);
              for (const node of ordered) {
                const highlighted = highlightedIds.has(node.id) || node.id === selectedNodeId;
                if (scale <= 0.6 && !highlighted) continue;
                const label = node.path.split('/').slice(-2).join('/');
                const width = context.measureText(label).width + 6 / scale;
                const rect = placeLabel(node.x ?? 0, node.y ?? 0, width, labelHeight, highlighted ? 6 : 4.5, occupied);
                occupied.add(rect);
                if (Math.abs(rect.y + labelHeight / 2 - (node.y ?? 0)) > labelHeight / 2) {
                  context.beginPath();
                  context.moveTo(node.x ?? 0, node.y ?? 0);
                  context.lineTo(rect.x < (node.x ?? 0) ? rect.x + width : rect.x, rect.y + labelHeight / 2);
                  context.strokeStyle = '#8c959f';
                  context.lineWidth = 1 / scale;
                  context.stroke();
                }
                context.fillStyle = '#f6f8fa';
                context.fillRect(rect.x, rect.y, width, labelHeight);
                context.fillStyle = highlighted ? '#173f51' : '#4b6e7d';
                context.textBaseline = 'middle';
                context.fillText(label, rect.x + 3 / scale, rect.y + labelHeight / 2);
              }
            }}
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
