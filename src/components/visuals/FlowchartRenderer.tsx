import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, Download, Globe, ImageDown, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { FlowchartData, FlowchartNodeShape } from '../../types/medical';
import { buildPageCitationLabel } from '../../utils/textbookEngine';
import { downloadSvgElementAsPng, downloadSvgElementAsSvg } from '../../utils/svgExport';
import { computeFlowchartLayout, wrapSvgLabelLines } from '../../utils/visualLayout';

interface FlowchartRendererProps {
  flowcharts: FlowchartData[];
  onOpenPage: (pageNumber: number) => void;
}

function getNodeShapeStyle(nodeType: FlowchartNodeShape) {
  switch (nodeType) {
    case 'start':
      return {
        fill: '#EFF6FF',
        stroke: '#0F4C81',
        badge: 'Trigger / Entry',
        textFill: '#0F4C81',
      };
    case 'decision':
      return {
        fill: '#FFFBEB',
        stroke: '#D97706',
        badge: 'Clinical Decision',
        textFill: '#92400E',
      };
    case 'action':
      return {
        fill: '#F0FDF4',
        stroke: '#15803D',
        badge: 'Intervention',
        textFill: '#166534',
      };
    case 'alert':
      return {
        fill: '#FEF2F2',
        stroke: '#DC2626',
        badge: 'Critical Alert',
        textFill: '#991B1B',
      };
    case 'process':
    default:
      return {
        fill: '#F8FAFC',
        stroke: '#0284C7',
        badge: 'Mechanism Step',
        textFill: '#0F172A',
      };
  }
}

export const FlowchartRenderer: React.FC<FlowchartRendererProps> = ({
  flowcharts,
  onOpenPage,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const safeFlows = Array.isArray(flowcharts) ? flowcharts : [];
  const activeFlow = safeFlows[activeIndex] || safeFlows[0] || null;

  const layout = useMemo(
    () => (activeFlow ? computeFlowchartLayout(activeFlow) : null),
    [activeFlow]
  );

  if (!activeFlow || !layout) return null;

  const activeNode =
    activeFlow.nodes.find((n) => n.id === selectedNodeId) || activeFlow.nodes[0] || null;

  const isTextbook =
    activeFlow.sourceBasis === 'textbook' && activeFlow.pageNumbers.length > 0;

  return (
    <div className="space-y-4 pt-6 border-t border-slate-200" data-testid="flowchart-visualizer">
      {/* Header + Flowchart Selector + Export Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#0F4C81]">
            Clinical Mechanism &amp; Decision Flowcharts
          </h3>
          <p className="text-xs text-slate-500">
            Directed clinical algorithms showing pathophysiology cascades, diagnostic branching, and stepwise therapy.
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-label="Zoom out flowchart"
            onClick={() => setZoomPercent((z) => Math.max(60, z - 20))}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="px-2 font-mono text-xs font-semibold text-slate-600 tabular-nums">
            {zoomPercent}%
          </span>
          <button
            type="button"
            aria-label="Zoom in flowchart"
            onClick={() => setZoomPercent((z) => Math.min(180, z + 20))}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {zoomPercent !== 100 && (
            <button
              type="button"
              onClick={() => setZoomPercent(100)}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadSvgElementAsSvg(svgRef.current, activeFlow.title)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F4C81] hover:bg-sky-50 transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>SVG</span>
          </button>
          <button
            type="button"
            onClick={() => downloadSvgElementAsPng(svgRef.current, activeFlow.title)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F4C81] hover:bg-sky-50 transition-colors whitespace-nowrap"
          >
            <ImageDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>PNG</span>
          </button>
        </div>
      </div>

      {/* Multi-Flowchart Segmented Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {safeFlows.length > 1 ? (
          <div
            role="tablist"
            aria-label="Select clinical flowchart"
            className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1"
          >
            {safeFlows.map((flow, idx) => {
              const selected = idx === activeIndex;
              return (
                <button
                  key={flow.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setActiveIndex(idx);
                    setSelectedNodeId(flow.nodes[0]?.id || null);
                  }}
                  className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-white text-[#0F4C81] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {flow.title}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="text-sm font-semibold text-slate-800">{activeFlow.title}</span>
        )}

        {isTextbook ? (
          <button
            type="button"
            onClick={() => onOpenPage(activeFlow.pageNumbers[0])}
            className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums whitespace-nowrap shrink-0"
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Supported by Textbook ({buildPageCitationLabel(activeFlow.pageNumbers)})</span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 whitespace-nowrap shrink-0">
            <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Supplementary Medical Knowledge</span>
          </span>
        )}
      </div>

      {/* Directed SVG Flowchart Stage */}
      <div className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 sm:p-4 max-h-[580px]">
        <div
          style={{
            minWidth:
              zoomPercent > 100
                ? `${Math.round((layout.width * zoomPercent) / 100)}px`
                : '620px',
            width: zoomPercent === 100 ? '100%' : `${zoomPercent}%`,
          }}
          className="mx-auto transition-[width] duration-150"
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={`Directed clinical flowchart: ${activeFlow.title}`}
            className="w-full h-auto block select-none"
          >
            <defs>
              <marker
                id="flow-arrowhead"
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#0F4C81" />
              </marker>
            </defs>

            <rect
              x={0}
              y={0}
              width={layout.width}
              height={layout.height}
              rx={12}
              fill="#FFFFFF"
            />

            {/* Edges with Arrows */}
            {layout.edges.map((e) => {
              const labelText = (e.edge.label || '').trim().slice(0, 24);
              const labelW = Math.max(52, labelText.length * 6.4 + 14);
              return (
                <g key={e.id}>
                  <path
                    d={e.pathD}
                    fill="none"
                    stroke="#0F4C81"
                    strokeWidth={2}
                    markerEnd="url(#flow-arrowhead)"
                  />
                  {labelText && (
                    <g transform={`translate(${e.labelX}, ${e.labelY})`}>
                      <rect
                        x={-labelW / 2}
                        y={-10}
                        width={labelW}
                        height={19}
                        rx={4}
                        fill="#EFF6FF"
                        stroke="#BFDBFE"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="700"
                        fill="#0F4C81"
                      >
                        {labelText}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Flowchart Nodes */}
            {layout.nodes.map((pos) => {
              const style = getNodeShapeStyle(pos.node.nodeType);
              const isSelected = activeNode?.id === pos.node.id;
              const lines = wrapSvgLabelLines(pos.node.label, 24, 2);
              const hw = pos.width / 2;
              const hh = pos.height / 2;

              // Decision nodes get hexagonal-diamond chamfers for instant visual distinction
              const decisionPolygon = `0,${-hh - 4} ${hw + 8},0 0,${hh + 4} ${-hw - 8},0`;

              return (
                <g
                  key={pos.node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => setSelectedNodeId(pos.node.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      setSelectedNodeId(pos.node.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Flowchart step: ${pos.node.label}`}
                  className="cursor-pointer focus:outline-none"
                >
                  {pos.node.nodeType === 'decision' ? (
                    <polygon
                      points={decisionPolygon}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={isSelected ? 2.8 : 1.8}
                    />
                  ) : (
                    <rect
                      x={-hw}
                      y={-hh}
                      width={pos.width}
                      height={pos.height}
                      rx={pos.node.nodeType === 'start' ? 28 : 10}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={isSelected ? 2.8 : 1.75}
                    />
                  )}

                  {pos.node.nodeType !== 'decision' && (
                    <text
                      x={0}
                      y={-hh + 15}
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="700"
                      fill={style.stroke}
                    >
                      {style.badge}
                    </text>
                  )}

                  {lines.map((line, lIdx) => (
                    <text
                      key={lIdx}
                      x={0}
                      y={
                        pos.node.nodeType === 'decision'
                          ? lines.length === 1
                            ? 4
                            : -4 + lIdx * 14
                          : lines.length === 1
                            ? 8
                            : 1 + lIdx * 14
                      }
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      fill={style.textFill}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Selected Step Explanation Bar */}
      {activeNode && (
        <div className="border-t border-slate-200 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-sm text-slate-700 max-w-[74ch]">
            <strong className="font-bold text-[#0F4C81]">{activeNode.label}: </strong>
            <span>
              {activeNode.detail ||
                'Select adjacent nodes in the algorithm above to trace the downstream clinical pathway.'}
            </span>
          </div>
          <span className="text-xs font-mono text-slate-500 whitespace-nowrap">
            {getNodeShapeStyle(activeNode.nodeType).badge}
          </span>
        </div>
      )}
    </div>
  );
};
