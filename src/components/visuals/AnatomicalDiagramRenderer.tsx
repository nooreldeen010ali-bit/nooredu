import React, { useRef, useState } from 'react';
import { BookOpen, Download, Globe, ImageDown, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  AnatomicalDiagramData,
  AnatomicalSystemTemplate,
} from '../../types/medical';
import { buildPageCitationLabel } from '../../utils/textbookEngine';
import { downloadSvgElementAsPng, downloadSvgElementAsSvg } from '../../utils/svgExport';

interface AnatomicalDiagramRendererProps {
  diagram: AnatomicalDiagramData;
  onOpenPage: (pageNumber: number) => void;
}

export function renderOrganSystemArtwork(template: AnatomicalSystemTemplate) {
  switch (template) {
    case 'cardiopulmonary':
      return (
        <g>
          {/* Left & Right Lung Fields */}
          <path
            d="M 275 110 C 200 115, 165 190, 170 295 C 173 330, 210 342, 265 330 C 285 325, 292 275, 290 155 Z"
            fill="#F0F9FF"
            stroke="#7DD3FC"
            strokeWidth={2}
          />
          <path
            d="M 525 110 C 600 115, 635 190, 630 295 C 627 330, 590 342, 535 330 C 515 325, 508 275, 510 155 Z"
            fill="#F0F9FF"
            stroke="#7DD3FC"
            strokeWidth={2}
          />
          {/* Pulmonary Capillary Alveolar Bed Lines */}
          <path
            d="M 205 255 Q 235 240 265 260 M 195 285 Q 235 270 270 290 M 535 260 Q 565 240 595 255 M 530 290 Q 565 270 605 285"
            fill="none"
            stroke="#38BDF8"
            strokeWidth={1.8}
            strokeDasharray="4 4"
          />
          {/* Superior & Inferior Vena Cava (Deoxygenated Venous Inflow) */}
          <path
            d="M 348 65 L 348 165 M 348 295 L 348 380"
            stroke="#0284C7"
            strokeWidth={18}
            strokeLinecap="round"
          />
          {/* Aortic Arch & Systemic Outflow */}
          <path
            d="M 418 175 C 418 92, 488 92, 488 180 L 488 375"
            fill="none"
            stroke="#DC2626"
            strokeWidth={18}
            strokeLinecap="round"
          />
          {/* Four-Chambered Heart Silhouette */}
          <path
            d="M 330 165 C 305 165, 292 195, 305 232 C 322 282, 385 334, 418 346 C 455 328, 495 270, 488 212 C 483 175, 452 160, 420 172 Z"
            fill="#FFF1F2"
            stroke="#BE123C"
            strokeWidth={2.5}
          />
          {/* Interventricular & Atrioventricular Septa */}
          <path
            d="M 392 172 L 414 342 M 312 226 L 482 222"
            stroke="#9F1239"
            strokeWidth={2}
            strokeDasharray="5 3"
          />
          {/* Chamber Labels */}
          <text x={352} y={208} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F4C81">
            RA
          </text>
          <text x={442} y={206} textAnchor="middle" fontSize="11" fontWeight="700" fill="#991B1B">
            LA
          </text>
          <text x={364} y={272} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F4C81">
            RV
          </text>
          <text x={445} y={272} textAnchor="middle" fontSize="11" fontWeight="700" fill="#991B1B">
            LV
          </text>
          {/* Kidney & RAAS Neurohormonal Loop at Base */}
          <ellipse
            cx={610}
            cy={370}
            rx={38}
            ry={24}
            fill="#FEF3C7"
            stroke="#D97706"
            strokeWidth={2}
          />
          <text x={610} y={374} textAnchor="middle" fontSize="10" fontWeight="700" fill="#92400E">
            Renal / RAAS
          </text>
        </g>
      );

    case 'renal':
      return (
        <g>
          {/* Afferent & Efferent Arterioles + Glomerular Tuft */}
          <path
            d="M 160 155 L 255 185 M 255 215 L 160 245"
            stroke="#DC2626"
            strokeWidth={10}
            strokeLinecap="round"
          />
          <circle cx={280} cy={200} r={44} fill="#EFF6FF" stroke="#0F4C81" strokeWidth={2.5} />
          <circle cx={275} cy={200} r={24} fill="#FEE2E2" stroke="#DC2626" strokeWidth={2} />
          <text x={275} y={142} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F4C81">
            Glomerulus &amp; Bowman&apos;s Capsule
          </text>
          {/* Proximal Tubule -> Loop of Henle -> Distal Tubule -> Collecting Duct */}
          <path
            d="M 324 200 C 375 180, 395 180, 415 220 L 415 355 C 415 385, 465 385, 465 355 L 465 210 C 485 175, 535 175, 575 200 L 620 200 L 620 385"
            fill="none"
            stroke="#0284C7"
            strokeWidth={14}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text x={375} y={170} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0369A1">
            Proximal Tubule (PCT)
          </text>
          <text x={440} y={405} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0369A1">
            Loop of Henle
          </text>
          <text x={535} y={168} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0369A1">
            Distal Tubule (DCT)
          </text>
          <text x={665} y={295} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0F4C81">
            Collecting Duct
          </text>
        </g>
      );

    case 'respiratory':
      return (
        <g>
          {/* Trachea & Mainstem Bronchi */}
          <path
            d="M 400 65 L 400 165 M 400 165 L 300 235 M 400 165 L 500 235"
            stroke="#0284C7"
            strokeWidth={18}
            strokeLinecap="round"
          />
          {/* Left & Right Lungs */}
          <path
            d="M 340 120 C 220 125, 175 215, 185 335 C 190 365, 315 365, 355 330 Z"
            fill="#F0F9FF"
            stroke="#0F4C81"
            strokeWidth={2.2}
          />
          <path
            d="M 460 120 C 580 125, 625 215, 615 335 C 610 365, 485 365, 445 330 Z"
            fill="#F0F9FF"
            stroke="#0F4C81"
            strokeWidth={2.2}
          />
          {/* Magnified Alveolar-Capillary Gas Exchange Unit */}
          <circle cx={400} cy={315} r={62} fill="#FFFFFF" stroke="#0284C7" strokeWidth={2.2} />
          <path
            d="M 332 365 Q 400 398 468 365"
            fill="none"
            stroke="#DC2626"
            strokeWidth={9}
            strokeLinecap="round"
          />
          <text x={400} y={312} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F4C81">
            Alveolus (O₂ / CO₂)
          </text>
          <text x={400} y={330} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#475569">
            Capillary Membrane
          </text>
        </g>
      );

    case 'endocrine':
      return (
        <g>
          {/* Hypothalamic-Pituitary Axis / Pancreatic Islet / Target Cell */}
          <rect
            x={310}
            y={62}
            width={180}
            height={52}
            rx={12}
            fill="#EFF6FF"
            stroke="#0F4C81"
            strokeWidth={2}
          />
          <text x={400} y={92} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0F4C81">
            Endocrine Control / Islet
          </text>
          {/* Pancreas & Liver / Adipose / Muscle Metabolic Axis */}
          <ellipse
            cx={250}
            cy={225}
            rx={95}
            ry={48}
            fill="#FEF3C7"
            stroke="#D97706"
            strokeWidth={2.2}
          />
          <text x={250} y={222} textAnchor="middle" fontSize="12" fontWeight="700" fill="#92400E">
            Hepatic Gluconeogenesis
          </text>
          <text x={250} y={239} textAnchor="middle" fontSize="10" fill="#92400E">
            &amp; Ketogenesis
          </text>

          <ellipse
            cx={555}
            cy={225}
            rx={95}
            ry={48}
            fill="#F0FDF4"
            stroke="#15803D"
            strokeWidth={2.2}
          />
          <text x={555} y={222} textAnchor="middle" fontSize="12" fontWeight="700" fill="#166534">
            Peripheral Tissue Uptake
          </text>
          <text x={555} y={239} textAnchor="middle" fontSize="10" fill="#166534">
            GLUT4 / Receptor Signaling
          </text>

          <rect
            x={290}
            y={325}
            width={220}
            height={58}
            rx={12}
            fill="#FEF2F2"
            stroke="#DC2626"
            strokeWidth={2}
          />
          <text x={400} y={352} textAnchor="middle" fontSize="12" fontWeight="700" fill="#991B1B">
            Systemic Bloodstream
          </text>
          <text x={400} y={369} textAnchor="middle" fontSize="10" fill="#991B1B">
            Osmolality · pH · Electrolytes (K⁺ / Na⁺)
          </text>

          <path
            d="M 400 114 L 275 177 M 400 114 L 530 177 M 265 273 L 350 325 M 535 273 L 450 325"
            stroke="#64748B"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        </g>
      );

    case 'hepatobiliary':
      return (
        <g>
          {/* Liver Lobes */}
          <path
            d="M 190 120 C 190 90, 440 85, 495 135 C 515 155, 480 230, 390 235 C 295 240, 210 265, 190 205 Z"
            fill="#FEF2F2"
            stroke="#B91C1C"
            strokeWidth={2.3}
          />
          <text x={325} y={165} textAnchor="middle" fontSize="13" fontWeight="700" fill="#991B1B">
            Hepatic Parenchyma &amp; Sinusoids
          </text>
          {/* Gallbladder & Biliary Tree */}
          <ellipse
            cx={385}
            cy={265}
            rx={34}
            ry={20}
            fill="#ECFDF5"
            stroke="#059669"
            strokeWidth={2}
          />
          <text x={385} y={269} textAnchor="middle" fontSize="10" fontWeight="700" fill="#065F46">
            Biliary Tract
          </text>
          {/* Portal Vein & Splanchnic Circulation */}
          <path
            d="M 330 375 L 330 235 M 470 325 L 330 315"
            stroke="#0284C7"
            strokeWidth={12}
            strokeLinecap="round"
          />
          {/* Pancreas */}
          <ellipse
            cx={535}
            cy={315}
            rx={82}
            ry={32}
            fill="#FEF3C7"
            stroke="#D97706"
            strokeWidth={2}
          />
          <text x={535} y={319} textAnchor="middle" fontSize="11" fontWeight="700" fill="#92400E">
            Pancreas &amp; Duct
          </text>
          <text x={255} y={348} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F4C81">
            Portal Venous Inflow
          </text>
        </g>
      );

    case 'neurology':
      return (
        <g>
          {/* Cerebral Hemisphere Sagittal Silhouette */}
          <path
            d="M 215 245 C 195 145, 285 82, 415 85 C 545 88, 610 155, 595 245 C 585 292, 515 305, 455 295 L 435 385 L 385 385 L 380 285 C 295 290, 228 280, 215 245 Z"
            fill="#EFF6FF"
            stroke="#0F4C81"
            strokeWidth={2.5}
          />
          {/* Gyral Sulci Curves */}
          <path
            d="M 275 165 Q 345 135 410 175 M 395 125 Q 475 145 535 185 M 270 220 Q 360 200 455 225"
            fill="none"
            stroke="#60A5FA"
            strokeWidth={2}
          />
          {/* Circle of Willis / Cerebral Perfusion & Blood-Brain Barrier */}
          <circle cx={408} cy={245} r={34} fill="#FEF2F2" stroke="#DC2626" strokeWidth={2} />
          <text x={408} y={248} textAnchor="middle" fontSize="10" fontWeight="700" fill="#991B1B">
            Neuro-Vascular
          </text>
          <text x={410} y={355} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0F4C81">
            Brainstem / Cord
          </text>
        </g>
      );

    case 'hematology':
    case 'immune':
    case 'general_physiology':
    default:
      return (
        <g>
          {/* Microvascular Endothelium, Cellular Receptor & Organ Target Plate */}
          <rect
            x={145}
            y={95}
            width={510}
            height={92}
            rx={44}
            fill="#FEF2F2"
            stroke="#DC2626"
            strokeWidth={2.2}
          />
          <text x={400} y={136} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#991B1B">
            Intravascular Compartment &amp; Circulating Mediators
          </text>
          <circle cx={235} cy={142} r={16} fill="#FCA5A5" stroke="#B91C1C" strokeWidth={1.5} />
          <circle cx={565} cy={142} r={16} fill="#BFDBFE" stroke="#1D4ED8" strokeWidth={1.5} />

          {/* Endothelial / Epithelial Barrier */}
          <line
            x1={155}
            y1={222}
            x2={645}
            y2={222}
            stroke="#0284C7"
            strokeWidth={4}
            strokeDasharray="12 6"
          />
          <text x={400} y={213} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0369A1">
            Endothelial / Cellular Membrane Interface
          </text>

          {/* Target Parenchymal Cell & Intracellular Signaling */}
          <rect
            x={195}
            y={252}
            width={410}
            height={128}
            rx={18}
            fill="#EFF6FF"
            stroke="#0F4C81"
            strokeWidth={2.2}
          />
          <text x={400} y={308} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0F4C81">
            Target Tissue &amp; Intracellular Response
          </text>
          <text x={400} y={332} textAnchor="middle" fontSize="11" fill="#475569">
            Receptor Activation · Ion Flux · End-Organ Function
          </text>
        </g>
      );
  }
}

export const AnatomicalDiagramRenderer: React.FC<AnatomicalDiagramRendererProps> = ({
  diagram,
  onOpenPage,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [selectedCalloutId, setSelectedCalloutId] = useState<string | null>(
    diagram.callouts[0]?.id || null
  );

  const selectedCallout =
    diagram.callouts.find((c) => c.id === selectedCalloutId) ||
    diagram.callouts[0] ||
    null;

  return (
    <div
      className="space-y-4 pt-6 border-t border-slate-200"
      data-testid="anatomical-diagram-visualizer"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#0F4C81]">{diagram.title}</h3>
          <p className="text-xs text-slate-500">
            Labeled anatomical &amp; physiological schematic comparing normal baseline function against disease pathophysiology.
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-label="Zoom out anatomical diagram"
            onClick={() => setZoomPercent((z) => Math.max(70, z - 20))}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="px-2 font-mono text-xs font-semibold text-slate-600 tabular-nums">
            {zoomPercent}%
          </span>
          <button
            type="button"
            aria-label="Zoom in anatomical diagram"
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
            onClick={() => downloadSvgElementAsSvg(svgRef.current, diagram.title)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F4C81] hover:bg-sky-50 transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>SVG</span>
          </button>
          <button
            type="button"
            onClick={() => downloadSvgElementAsPng(svgRef.current, diagram.title)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F4C81] hover:bg-sky-50 transition-colors whitespace-nowrap"
          >
            <ImageDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>PNG</span>
          </button>
        </div>
      </div>

      {/* Normal Physiology vs Pathophysiology Split Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2 border-y border-slate-200 text-sm">
        <div>
          <span className="text-xs font-bold text-[#0F4C81] block mb-1">
            Normal Baseline Physiology
          </span>
          <p className="text-slate-700 leading-relaxed">{diagram.normalPhysiologySummary}</p>
        </div>
        <div className="md:border-l md:border-slate-200 md:pl-4">
          <span className="text-xs font-bold text-red-700 block mb-1">
            Pathophysiological Shift in Disease
          </span>
          <p className="text-slate-700 leading-relaxed">{diagram.pathophysiologySummary}</p>
        </div>
      </div>

      {/* Two-Zone Educational Layout: Interactive SVG Atlas + Numbered Callout Key */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-7 overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-[#F8FAFC] p-2.5 sm:p-3">
          <div
            style={{
              minWidth:
                zoomPercent > 100
                  ? `${Math.round(680 * (zoomPercent / 100))}px`
                  : undefined,
              width: zoomPercent === 100 ? '100%' : `${zoomPercent}%`,
            }}
            className="mx-auto transition-[width] duration-150"
          >
            <svg
              ref={svgRef}
              viewBox="0 0 800 440"
              role="img"
              aria-label={diagram.title}
              className="w-full h-auto block select-none"
            >
              <rect x={0} y={0} width={800} height={440} rx={12} fill="#FFFFFF" />
              <text
                x={24}
                y={30}
                fontSize="11.5"
                fontWeight="700"
                fill="#64748B"
              >
                {diagram.title}
              </text>

              {renderOrganSystemArtwork(diagram.systemTemplate)}

              {/* Interactive Numbered Callout Pins & Outward Leader Labels */}
              {diagram.callouts.map((callout) => {
                const cx = Math.round((callout.xPercent / 100) * 800);
                const cy = Math.round((callout.yPercent / 100) * 440);
                const isSelected = selectedCallout?.id === callout.id;
                const placeLeft = cx < 400;
                const labelX = placeLeft ? cx - 26 : cx + 26;
                const labelText = callout.structureName.slice(0, 24);
                const boxW = labelText.length * 6.1 + 14;

                return (
                  <g
                    key={callout.id}
                    onClick={() => setSelectedCalloutId(callout.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCalloutId(callout.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Anatomical callout ${callout.number}: ${callout.structureName}`}
                    className="cursor-pointer focus:outline-none"
                  >
                    <line
                      x1={placeLeft ? cx - 13 : cx + 13}
                      y1={cy}
                      x2={placeLeft ? labelX + 4 : labelX - 4}
                      y2={cy}
                      stroke="#0F4C81"
                      strokeWidth={1.4}
                    />
                    {isSelected && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={20}
                        fill="#0284C7"
                        fillOpacity={0.16}
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={13}
                      fill={isSelected ? '#0F4C81' : '#FFFFFF'}
                      stroke="#0F4C81"
                      strokeWidth={2.2}
                    />
                    <text
                      x={cx}
                      y={cy + 4}
                      textAnchor="middle"
                      fontSize="11.5"
                      fontWeight="700"
                      fill={isSelected ? '#FFFFFF' : '#0F4C81'}
                    >
                      {callout.number}
                    </text>

                    <rect
                      x={placeLeft ? labelX - boxW + 4 : labelX - 4}
                      y={cy - 11}
                      width={boxW}
                      height={22}
                      rx={5}
                      fill="#FFFFFF"
                      fillOpacity={0.96}
                      stroke={isSelected ? '#0F4C81' : '#CBD5E1'}
                      strokeWidth={1.2}
                    />
                    <text
                      x={placeLeft ? labelX - 2 : labelX + 2}
                      y={cy + 4}
                      textAnchor={placeLeft ? 'end' : 'start'}
                      fontSize="10.5"
                      fontWeight="700"
                      fill="#0F172A"
                    >
                      {labelText}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Synchronized Numbered Callout Legend List */}
        <div className="xl:col-span-5 divide-y divide-slate-200 border-t xl:border-t-0 border-slate-200">
          {diagram.callouts.map((callout) => {
            const isSelected = selectedCallout?.id === callout.id;
            const isTextbook =
              callout.sourceBasis === 'textbook' && callout.pageNumbers.length > 0;
            return (
              <div
                key={callout.id}
                className={`py-3 px-2.5 rounded-lg transition-colors ${
                  isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCalloutId(callout.id)}
                    className="inline-flex items-center gap-2 text-left text-sm font-bold text-[#0F4C81] hover:underline"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0F4C81] font-mono text-xs font-bold text-white shrink-0 tabular-nums">
                      {callout.number}
                    </span>
                    <span>{callout.structureName}</span>
                  </button>

                  {isTextbook ? (
                    <button
                      type="button"
                      onClick={() => onOpenPage(callout.pageNumbers[0])}
                      className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums whitespace-nowrap shrink-0"
                    >
                      <BookOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>{buildPageCitationLabel(callout.pageNumbers)}</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 whitespace-nowrap shrink-0">
                      <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>Gen. Med</span>
                    </span>
                  )}
                </div>

                <div className="mt-1.5 pl-8 space-y-1 text-xs leading-relaxed">
                  <p className="text-slate-700">
                    <strong className="font-semibold text-slate-900">Normal: </strong>
                    {callout.normalRole}
                  </p>
                  <p className="text-slate-700">
                    <strong className="font-semibold text-red-800">Pathology: </strong>
                    {callout.pathologicalChange}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
