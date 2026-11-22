import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, Download, Globe, ImageDown, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { MindMapData } from '../../types/medical';
import { buildPageCitationLabel } from '../../utils/textbookEngine';
import { downloadSvgElementAsPng, downloadSvgElementAsSvg } from '../../utils/svgExport';
import {
  computeMindMapLayout,
  MIND_MAP_CATEGORY_PALETTE,
  wrapSvgLabelLines,
} from '../../utils/visualLayout';

interface MindMapRendererProps {
  mindMap: MindMapData;
  onOpenPage: (pageNumber: number) => void;
}

export const MindMapRenderer: React.FC<MindMapRendererProps> = ({ mindMap, onOpenPage }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    mindMap.nodes[0]?.id || null
  );

  const layout = useMemo(() => computeMindMapLayout(mindMap), [mindMap]);

  const selectedNode = useMemo(
    () =>
      mindMap.nodes.find((n) => n.id === selectedNodeId) || mindMap.nodes[0] || null,
    [mindMap.nodes, selectedNodeId]
  );

  const centerTitleLines = useMemo(
    () => wrapSvgLabelLines(mindMap.centralTopic, 22, 3),
    [mindMap.centralTopic]
  );

  const scaledMinWidth = Math.round((layout.width * zoomPercent) / 100);

  return (
    <div className="space-y-4" data-testid="mindmap-visualizer">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#0F4C81]">
            Revision Mind Map — Connected Concept Network
          </h3>
          <p className="text-xs text-slate-500">
            Select any branch node to inspect its clinical relationship and source provenance. Scroll or zoom on mobile.
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-label="Zoom out mind map"
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
            aria-label="Zoom in mind map"
            onClick={() => setZoomPercent((z) => Math.min(180, z + 20))}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {zoomPercent !== 100 && (
            <button
              type="button"
              aria-label="Reset mind map zoom"
              onClick={() => setZoomPercent(100)}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              downloadSvgElementAsSvg(svgRef.current, `${mindMap.centralTopic}-mindmap`)
            }
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F4C81] hover:bg-sky-50 transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>SVG</span>
          </button>
          <button
            type="button"
            onClick={() =>
              downloadSvgElementAsPng(svgRef.current, `${mindMap.centralTopic}-mindmap`)
            }
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F4C81] hover:bg-sky-50 transition-colors whitespace-nowrap"
          >
            <ImageDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>PNG</span>
          </button>
        </div>
      </div>

      {/* Category Color Key (Clean Unboxed Editorial Legend) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
        {Object.entries(MIND_MAP_CATEGORY_PALETTE).map(([key, meta]) => (
          <span key={key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: meta.colorHex }}
              aria-hidden="true"
            />
            <span>{meta.title}</span>
          </span>
        ))}
      </div>

      {/* Interactive Zoomable & Scrollable SVG Canvas */}
      <div className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-[#F8FAFC] p-2.5 sm:p-4 max-h-[560px]">
        <div
          style={{
            minWidth: zoomPercent > 100 ? `${scaledMinWidth}px` : undefined,
            width: zoomPercent === 100 ? '100%' : `${zoomPercent}%`,
          }}
          className="mx-auto transition-[width] duration-150"
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={`Interactive medical mind map for ${mindMap.centralTopic}`}
            className="w-full h-auto block select-none"
          >
            <defs>
              <marker
                id="mm-arrow-default"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#475569" />
              </marker>
            </defs>

            {/* Subtle Textbook Surface Background */}
            <rect
              x={0}
              y={0}
              width={layout.width}
              height={layout.height}
              rx={12}
              fill="#FFFFFF"
            />

            {/* Directed Curved Relationship Edges */}
            {layout.edges.map((edge) => {
              const isSelectedEdge = selectedNode?.id === edge.toId;
              const labelText = edge.label.slice(0, 18);
              const badgeWidth = Math.max(54, labelText.length * 5.7 + 12);
              return (
                <g key={edge.id}>
                  <path
                    d={edge.pathD}
                    fill="none"
                    stroke={isSelectedEdge ? edge.colorHex : '#94A3B8'}
                    strokeWidth={isSelectedEdge ? 2.6 : 1.75}
                    markerEnd="url(#mm-arrow-default)"
                  />
                  {labelText && (
                    <g transform={`translate(${edge.labelX}, ${edge.labelY})`}>
                      <rect
                        x={-badgeWidth / 2}
                        y={-9}
                        width={badgeWidth}
                        height={17}
                        rx={4}
                        fill="#FFFFFF"
                        stroke="#E2E8F0"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={2.5}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="600"
                        fill="#475569"
                      >
                        {labelText}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Central Root Topic Node */}
            <g transform={`translate(${layout.centerX}, ${layout.centerY})`}>
              <rect
                x={-layout.centerWidth / 2}
                y={-layout.centerHeight / 2}
                width={layout.centerWidth}
                height={layout.centerHeight}
                rx={14}
                fill="#0F4C81"
                stroke="#082F49"
                strokeWidth={2}
              />
              {centerTitleLines.map((line, idx) => {
                const startY =
                  -((centerTitleLines.length - 1) * 15) / 2 + idx * 15 + 3;
                return (
                  <text
                    key={idx}
                    x={0}
                    y={startY}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="700"
                    fill="#FFFFFF"
                  >
                    {line}
                  </text>
                );
              })}
            </g>

            {/* Connected Branch Nodes */}
            {layout.nodes.map((pos) => {
              const isSelected = selectedNode?.id === pos.node.id;
              const lines = wrapSvgLabelLines(pos.node.label, 21, 2);
              const citeTag =
                pos.node.sourceBasis === 'textbook' && pos.node.pageNumbers.length > 0
                  ? `Textbook p. ${pos.node.pageNumbers[0]}`
                  : 'Gen. Med Knowledge';

              return (
                <g
                  key={pos.node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => setSelectedNodeId(pos.node.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedNodeId(pos.node.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect mind map node: ${pos.node.label}`}
                  className="cursor-pointer focus:outline-none"
                >
                  <rect
                    x={-pos.width / 2}
                    y={-pos.height / 2}
                    width={pos.width}
                    height={pos.height}
                    rx={10}
                    fill={pos.tintHex}
                    stroke={isSelected ? pos.colorHex : pos.borderHex}
                    strokeWidth={isSelected ? 2.6 : 1.5}
                  />
                  {/* Top thin semantic bar */}
                  <line
                    x1={-pos.width / 2 + 10}
                    y1={-pos.height / 2 + 6}
                    x2={pos.width / 2 - 10}
                    y2={-pos.height / 2 + 6}
                    stroke={pos.colorHex}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                  {lines.map((line, lIdx) => (
                    <text
                      key={lIdx}
                      x={0}
                      y={lines.length === 1 ? -1 : -8 + lIdx * 14}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      fill="#0F172A"
                    >
                      {line}
                    </text>
                  ))}
                  <text
                    x={0}
                    y={pos.height / 2 - 9}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="600"
                    fill={pos.colorHex}
                  >
                    {citeTag}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Synchronized Node Concept Detail Strip */}
      {selectedNode && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <div className="space-y-1 max-w-[74ch]">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-[#0F4C81]">{selectedNode.label}</span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="font-medium text-slate-600">
                Relation: {selectedNode.relationLabel}
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="text-slate-500">
                {MIND_MAP_CATEGORY_PALETTE[selectedNode.category]?.title || 'Clinical Concept'}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{selectedNode.summary}</p>
          </div>

          {selectedNode.sourceBasis === 'textbook' &&
          selectedNode.pageNumbers.length > 0 ? (
            <button
              type="button"
              onClick={() => onOpenPage(selectedNode.pageNumbers[0])}
              className="inline-flex min-h-[38px] items-center gap-1.5 font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums whitespace-nowrap shrink-0"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Textbook {buildPageCitationLabel(selectedNode.pageNumbers)}</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 whitespace-nowrap shrink-0">
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Supplementary Medical Knowledge</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
