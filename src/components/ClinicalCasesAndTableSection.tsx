import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Globe, Stethoscope } from 'lucide-react';
import type {
  ClinicalCaseScenario,
  ComparisonTableData,
  LanguageMode,
} from '../types/medical';
import { buildPageCitationLabel } from '../utils/textbookEngine';

interface ClinicalCasesAndTableSectionProps {
  comparisonTable?: ComparisonTableData;
  clinicalCases?: ClinicalCaseScenario[];
  languageMode: LanguageMode;
  onOpenPage: (pageNumber: number) => void;
}

export const ClinicalCasesAndTableSection: React.FC<ClinicalCasesAndTableSectionProps> = ({
  comparisonTable,
  clinicalCases = [],
  languageMode,
  onOpenPage,
}) => {
  const [revealedCaseIds, setRevealedCaseIds] = useState<Record<string, boolean>>({});

  const toggleCase = (id: string) => {
    setRevealedCaseIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const hasTable =
    comparisonTable &&
    Array.isArray(comparisonTable.columns) &&
    comparisonTable.columns.length > 0 &&
    Array.isArray(comparisonTable.rows) &&
    comparisonTable.rows.length > 0;

  if (!hasTable && clinicalCases.length === 0) {
    return null;
  }

  return (
    <div className="space-y-10" data-testid="cases-and-table-section">
      {/* Differential & Subtype Comparison Table */}
      {hasTable && comparisonTable && (
        <section aria-labelledby="comparison-table-heading" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3
                id="comparison-table-heading"
                className="text-lg sm:text-xl font-bold text-[#0F4C81]"
              >
                {comparisonTable.title}
              </h3>
              <p className="text-xs text-slate-500">
                Side-by-side clinical comparison for differential diagnosis and board exam discrimination.
              </p>
            </div>

            {comparisonTable.sourceBasis === 'textbook' &&
            comparisonTable.pageNumbers.length > 0 ? (
              <button
                type="button"
                onClick={() => onOpenPage(comparisonTable.pageNumbers[0])}
                className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums whitespace-nowrap shrink-0"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Supported by Textbook ({buildPageCitationLabel(comparisonTable.pageNumbers)})
                </span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 whitespace-nowrap shrink-0">
                <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Supplementary Medical Knowledge</span>
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[540px] border-collapse text-left text-sm tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC]">
                  <th
                    scope="col"
                    className="py-3 px-4 font-bold text-[#0F4C81] w-[22%]"
                  >
                    Clinical Feature
                  </th>
                  {comparisonTable.columns.map((col, idx) => (
                    <th
                      key={idx}
                      scope="col"
                      className="py-3 px-4 font-bold text-slate-900 border-l border-slate-200/70"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {comparisonTable.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                    <th
                      scope="row"
                      className="py-3 px-4 font-semibold text-slate-900 align-top bg-slate-50/40"
                    >
                      {row.feature}
                    </th>
                    {comparisonTable.columns.map((_, cIdx) => (
                      <td
                        key={cIdx}
                        className="py-3 px-4 text-slate-700 leading-relaxed align-top border-l border-slate-100"
                      >
                        {row.cells[cIdx] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Interactive Bedside Clinical Case Scenarios */}
      {clinicalCases.length > 0 && (
        <section
          aria-labelledby="clinical-cases-heading"
          className={hasTable ? 'pt-8 border-t border-slate-200 space-y-6' : 'space-y-6'}
        >
          <div>
            <h3
              id="clinical-cases-heading"
              className="text-lg sm:text-xl font-bold text-[#0F4C81]"
            >
              Interactive Bedside Clinical Case Scenarios
            </h3>
            <p className="text-xs text-slate-500">
              Read each patient presentation and formulate your diagnostic &amp; therapeutic plan before revealing the solution.
            </p>
          </div>

          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {clinicalCases.map((scenario, idx) => {
              const isRevealed = Boolean(revealedCaseIds[scenario.id]);
              const isTextbook =
                scenario.sourceBasis === 'textbook' && scenario.pageNumbers.length > 0;

              return (
                <article key={scenario.id} className="py-6 space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Stethoscope
                        className="h-4 w-4 text-[#0F4C81] shrink-0"
                        aria-hidden="true"
                      />
                      <h4 className="text-base sm:text-lg font-bold text-slate-900">
                        Case {idx + 1}: {scenario.title}
                      </h4>
                    </div>

                    {isTextbook ? (
                      <button
                        type="button"
                        onClick={() => onOpenPage(scenario.pageNumbers[0])}
                        className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums whitespace-nowrap shrink-0"
                      >
                        <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>Textbook {buildPageCitationLabel(scenario.pageNumbers)}</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 whitespace-nowrap shrink-0">
                        <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>Supplementary Medical Knowledge</span>
                      </span>
                    )}
                  </div>

                  <p className="font-serif text-[16px] leading-[1.7] text-slate-800 max-w-[75ch]">
                    {scenario.patientPresentation}
                  </p>

                  <div className="rounded-lg bg-[#F8FAFC] border border-slate-200 px-4 py-2.5 font-mono text-xs text-slate-800 tabular-nums max-w-[75ch]">
                    <strong className="font-bold text-[#0F4C81]">Vitals &amp; Labs: </strong>
                    {scenario.vitalsAndLabs}
                  </div>

                  <p className="text-sm font-bold text-slate-900 max-w-[75ch]">
                    Clinical Challenge: {scenario.promptQuestion}
                  </p>

                  <div className="no-print">
                    <button
                      type="button"
                      aria-expanded={isRevealed}
                      onClick={() => toggleCase(scenario.id)}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#0F4C81] hover:border-[#0F4C81] hover:bg-sky-50/50 transition-colors whitespace-nowrap"
                    >
                      <span>
                        {isRevealed
                          ? 'Hide Workup & Management Plan'
                          : `Reveal Case ${idx + 1} Workup & Management`}
                      </span>
                      {isRevealed ? (
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  {isRevealed && (
                    <div className="pt-2 space-y-3 max-w-[75ch] text-sm leading-relaxed text-slate-800">
                      <div>
                        <strong className="font-bold text-[#0F4C81]">
                          Diagnostic Workup &amp; Assessment:{' '}
                        </strong>
                        <span>{scenario.idealWorkupAndDiagnosis}</span>
                      </div>
                      <div>
                        <strong className="font-bold text-emerald-800">
                          Stepwise Management Plan:{' '}
                        </strong>
                        <span>{scenario.managementPlan}</span>
                      </div>
                      <div>
                        <strong className="font-bold text-amber-900">
                          Bedside Exam Pearl:{' '}
                        </strong>
                        <span>{scenario.clinicalPearl}</span>
                      </div>
                      {languageMode === 'ar-eg' && scenario.arabicTakeaway && (
                        <div
                          dir="rtl"
                          className="rounded-lg bg-sky-50/60 border border-sky-200/80 px-4 py-3 text-sm leading-[1.85] text-slate-900"
                        >
                          <strong className="font-bold text-[#0F4C81] block mb-0.5">
                            الخلاصة الإكلينيكية بالمصري:
                          </strong>
                          <span>{scenario.arabicTakeaway}</span>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
