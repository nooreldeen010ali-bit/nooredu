import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileDown,
  FileSearch,
  Film,
  Globe,
  Info,
  Languages,
  Lightbulb,
  Loader2,
  Printer,
  Stethoscope,
} from 'lucide-react';
import type {
  ClinicalNoteCategory,
  ExternalEvidenceItem,
  LanguageMode,
  PdfExportScope,
  StudyGuide,
  TeachingDepthMode,
} from '../types/medical';
import {
  flattenClickableCitations,
  formatBookCitationsSummary,
} from '../utils/multiBookEngine';
import { buildPageCitationLabel } from '../utils/textbookEngine';
import { ClinicalCasesAndTableSection } from './ClinicalCasesAndTableSection';
import { FlashcardsDeckSection } from './FlashcardsDeckSection';
import { LatestEvidenceSection } from './LatestEvidenceSection';
import { MCQPracticeSection } from './MCQPracticeSection';
import { AnatomicalDiagramRenderer } from './visuals/AnatomicalDiagramRenderer';
import { FlowchartRenderer } from './visuals/FlowchartRenderer';
import { MindMapRenderer } from './visuals/MindMapRenderer';

export type GuideStudyTab = 'steps' | 'visuals' | 'cases' | 'practice' | 'evidence';

interface StudyGuideViewProps {
  guide: StudyGuide;
  isOnline: boolean;
  isEnrichingArabic?: boolean;
  onRequestArabicEnrichment?: () => void;
  onOpenPage: (pageNumber: number, textbookId?: string) => void;
  onOpenPdfStudio: (initialScope?: PdfExportScope) => void;
  onAnimateLecture?: () => void;
  onOpenTimedExam?: () => void;
  onEvidenceLoaded?: (items: ExternalEvidenceItem[], topicForEvidence?: string) => void;
  onSelectAnswer: (mcqId: string, optionIndex: number) => void;
  onResetQuiz: () => void;
  onUpdateFlashcardMastery: (cardId: string, status: 'mastered' | 'review') => void;
}

function getCategoryMeta(category: ClinicalNoteCategory) {
  switch (category) {
    case 'Red Flag':
      return {
        Icon: AlertTriangle,
        labelClass: 'text-red-700',
      };
    case 'Diagnostic Pitfall':
      return {
        Icon: Stethoscope,
        labelClass: 'text-amber-800',
      };
    case 'Management Protocol':
      return {
        Icon: ClipboardCheck,
        labelClass: 'text-[#0F4C81]',
      };
    case 'Clinical Pearl':
    default:
      return {
        Icon: Lightbulb,
        labelClass: 'text-emerald-800',
      };
  }
}

export const StudyGuideView: React.FC<StudyGuideViewProps> = ({
  guide,
  isOnline,
  isEnrichingArabic = false,
  onRequestArabicEnrichment,
  onOpenPage,
  onOpenPdfStudio,
  onAnimateLecture,
  onOpenTimedExam,
  onEvidenceLoaded,
  onSelectAnswer,
  onResetQuiz,
  onUpdateFlashcardMastery,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<GuideStudyTab>('steps');
  const [depthMode, setDepthMode] = useState<TeachingDepthMode>('detailed');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('en');
  const [showPassages, setShowPassages] = useState<boolean>(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    guide.sections.forEach((_, idx) => {
      initial[idx] = true;
    });
    return initial;
  });

  // Reset expanded steps when switching to another guide
  useEffect(() => {
    const next: Record<number, boolean> = {};
    guide.sections.forEach((_, idx) => {
      next[idx] = true;
    });
    setExpandedSteps(next);
    setActiveSubTab('steps');
  }, [guide.id, guide.sections.length]);

  const formattedDate = new Date(guide.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const retrievedPassages = guide.retrievedPassages || [];
  const hasTextbookCitations =
    guide.referencedPages.length > 0 && guide.coverage !== 'none';
  const textbookSectionCount = guide.sections.filter(
    (s) => s.sourceBasis === 'textbook' && s.pageNumbers.length > 0
  ).length;
  const generalSectionCount = guide.sections.length - textbookSectionCount;

  const hasArabicContent = Boolean(
    guide.summaryArabic || guide.sections.some((s) => Boolean(s.contentArabic))
  );

  const handleToggleLanguage = (nextLang: LanguageMode) => {
    setLanguageMode(nextLang);
    if (
      nextLang === 'ar-eg' &&
      !hasArabicContent &&
      isOnline &&
      !isEnrichingArabic &&
      onRequestArabicEnrichment
    ) {
      onRequestArabicEnrichment();
    }
  };

  const setAllStepsExpanded = (open: boolean) => {
    const updated: Record<number, boolean> = {};
    guide.sections.forEach((_, idx) => {
      updated[idx] = open;
    });
    setExpandedSteps(updated);
  };

  const quickBullets =
    guide.quickRevisionBullets && guide.quickRevisionBullets.length > 0
      ? guide.quickRevisionBullets
      : guide.sections.map((s) => s.keyTakeaway).filter(Boolean);

  const clickableCitations = flattenClickableCitations(
    guide.bookCitations,
    guide.referencedPages,
    guide.textbookId,
    guide.textbookTitle
  );
  const citationsSummaryText = formatBookCitationsSummary(
    guide.bookCitations,
    guide.referencedPages,
    guide.textbookTitle
  );
  const searchedBookCount = guide.sourceTextbooks?.length ?? 0;
  const isZeroBookGuide =
    searchedBookCount === 0 && guide.textbookId === 'general-medical-knowledge';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 lg:p-7">
      {/* Compact Unified Blueprint Study Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-[#0F4C81]">
            {isZeroBookGuide ? 'General Medical Topic Blueprint' : guide.textbookTitle}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {hasTextbookCitations ? citationsSummaryText : '0 textbook pages cited'}
          </span>
          {!isZeroBookGuide && searchedBookCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {guide.totalPagesSearched || 0} pages searched across {searchedBookCount}{' '}
                book{searchedBookCount === 1 ? '' : 's'}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>Saved {formattedDate}</span>
        </div>

        <div className="mt-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <h1 className="text-xl sm:text-2xl lg:text-[28px] font-bold tracking-tight text-[#0F4C81] [text-wrap:balance]">
            {guide.topic}
          </h1>

          {/* Unified Blueprint Actions: 3D Lecture, Timed Exam, Study PDF */}
          <div className="no-print flex flex-wrap items-center gap-2 shrink-0">
            {onAnimateLecture && (
              <button
                type="button"
                onClick={onAnimateLecture}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-[#0284C7] bg-sky-50/70 px-3.5 py-2 text-xs font-bold text-[#0F4C81] hover:bg-sky-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Film className="h-4 w-4 text-[#0284C7] shrink-0" aria-hidden="true" />
                <span>3D Lecture</span>
              </button>
            )}
            {onOpenTimedExam && (
              <button
                type="button"
                onClick={onOpenTimedExam}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-[#0F4C81] hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <ClipboardCheck className="h-4 w-4 text-[#0284C7] shrink-0" aria-hidden="true" />
                <span>Timed Exam</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenPdfStudio('single_topic')}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#0F4C81] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#0c3d68] transition-colors whitespace-nowrap shadow-2xs cursor-pointer"
            >
              <FileDown className="h-4 w-4 text-sky-200 shrink-0" aria-hidden="true" />
              <span>Study PDF</span>
            </button>
          </div>
        </div>

        {/* Three-Tier Source Provenance Banner */}
        <div className="mt-3.5">
          {guide.coverage === 'none' ? (
            <div
              role="region"
              aria-label="Source provenance notice"
              className={`rounded-xl border p-3.5 text-sm ${
                isZeroBookGuide
                  ? 'border-sky-200 bg-sky-50/50 text-slate-800'
                  : 'border-amber-300 bg-amber-50/70 text-amber-950'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {isZeroBookGuide ? (
                  <Info
                    className="h-4 w-4 text-[#0284C7] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className="h-4 w-4 text-amber-700 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                )}
                <div className="space-y-0.5">
                  <p className="font-bold text-xs sm:text-sm">
                    {isZeroBookGuide
                      ? 'General Medical Knowledge & External Scientific Evidence (No Textbook Selected)'
                      : 'Topic Not Present in Uploaded Textbook — Taught via Verified Medical Science'}
                  </p>
                  <p className="text-xs leading-relaxed opacity-90">{guide.coverageNote}</p>
                </div>
              </div>
            </div>
          ) : guide.coverage === 'partial' ? (
            <div
              role="region"
              aria-label="Partial textbook coverage notice"
              className="rounded-xl border border-sky-200 bg-sky-50/40 p-3.5 text-sm text-slate-800"
            >
              <div className="flex items-start gap-2.5">
                <Info
                  className="h-4 w-4 text-[#0284C7] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <p className="font-bold text-[#0F4C81] text-xs sm:text-sm">
                    Uploaded Textbook ({citationsSummaryText}) + Supplementary Medical Science
                  </p>
                  <p className="text-xs leading-relaxed text-slate-700">
                    {guide.coverageNote}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div
              role="region"
              aria-label="Verified textbook coverage notice"
              className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 text-sm text-slate-800"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2
                  className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <p className="font-bold text-emerald-950 text-xs sm:text-sm">
                    Verified Uploaded Textbook Grounding ({citationsSummaryText})
                  </p>
                  <p className="text-xs leading-relaxed text-slate-700">
                    {guide.coverageNote}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Executive Overview (English + Egyptian Arabic when enabled) */}
        <p className="mt-4 font-serif text-[16px] sm:text-[17px] leading-[1.7] text-slate-700 max-w-[74ch]">
          {guide.summary}
        </p>

        {languageMode === 'ar-eg' && (
          <div className="mt-3 max-w-[74ch]">
            {isEnrichingArabic ? (
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#0F4C81]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Generating simple Egyptian Arabic explanation with English medical terms...</span>
              </div>
            ) : guide.summaryArabic ? (
              <div
                dir="rtl"
                className="rounded-xl border border-sky-200/80 bg-sky-50/40 px-4 py-3.5 text-[15px] leading-[1.9] text-slate-900"
              >
                <strong className="font-bold text-[#0F4C81] block mb-1">
                  ملخص الدرس بالمصري (مع المصطلحات الطبية بالإنجليزي):
                </strong>
                <span>{guide.summaryArabic}</span>
              </div>
            ) : (
              onRequestArabicEnrichment &&
              isOnline && (
                <button
                  type="button"
                  onClick={onRequestArabicEnrichment}
                  className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3.5 py-1.5 text-xs font-semibold text-[#0F4C81] hover:bg-sky-100 transition-colors"
                >
                  <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Generate Egyptian Arabic Explanation</span>
                </button>
              )
            )}
          </div>
        )}

        {/* Source Attribution Legend + Clickable Multi-Book Citations + Export / Print */}
        <div className="no-print mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {hasTextbookCitations && clickableCitations.length > 0 ? (
              <>
                <span className="text-xs font-medium text-slate-500 mr-1">
                  Verified Citations:
                </span>
                {clickableCitations.map((cit) => (
                  <button
                    key={cit.key}
                    type="button"
                    onClick={() => onOpenPage(cit.pageNumber, cit.textbookId)}
                    title={`${cit.textbookTitle} — Page ${cit.pageNumber}`}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-medium text-[#0F4C81] hover:border-[#0284C7] hover:bg-sky-50 transition-colors tabular-nums whitespace-nowrap shrink-0"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                    <span>
                      {cit.shortTitle} · p. {cit.pageNumber}
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
                <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  0 textbook pages matched — items below are Supplementary Medical Knowledge
                </span>
              </span>
            )}

            {retrievedPassages.length > 0 && hasTextbookCitations && (
              <button
                type="button"
                aria-expanded={showPassages}
                onClick={() => setShowPassages((v) => !v)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <FileSearch className="h-3.5 w-3.5 text-[#0F4C81]" aria-hidden="true" />
                <span>
                  {showPassages
                    ? 'Hide Retrieved Excerpts'
                    : `View ${retrievedPassages.length} Retrieved Excerpt${
                        retrievedPassages.length === 1 ? '' : 's'
                      }`}
                </span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenPdfStudio('revision_guide')}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-1.5 text-xs font-semibold text-[#0F4C81] hover:bg-sky-100 transition-colors whitespace-nowrap shrink-0"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Revision PDF</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>

        {/* Collapsible Retrieved Textbook Passages Drawer */}
        {showPassages && retrievedPassages.length > 0 && hasTextbookCitations && (
          <div className="mt-4 pt-4 border-t border-slate-200 divide-y divide-slate-200">
            {retrievedPassages.map((passage) => {
              const displayBody =
                passage.chapterTitle && passage.text.startsWith(passage.chapterTitle)
                  ? passage.text.slice(passage.chapterTitle.length).trim()
                  : passage.text;
              const bookTitleLabel = passage.textbookTitle || guide.textbookTitle;
              return (
                <article key={passage.passageId} className="py-3.5 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs">
                      <span className="font-bold text-[#0F4C81]">
                        {bookTitleLabel}
                      </span>
                      {passage.chapterTitle && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="font-semibold text-slate-700">
                            {passage.chapterTitle}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenPage(passage.pageNumber, passage.textbookId)}
                      className="font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums whitespace-nowrap"
                    >
                      Open Page {passage.pageNumber}
                    </button>
                  </div>
                  <p className="font-serif text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                    {displayBody || passage.text}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Workspace Learning Mode Toolbar (Depth Mode + Egyptian Arabic Toggle + Interactive Module Tabs) */}
      <div className="no-print py-4 border-b border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Teaching Depth Segmented Control */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Study Mode:</span>
            <div
              role="group"
              aria-label="Teaching depth mode"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1"
            >
              <button
                type="button"
                aria-pressed={depthMode === 'detailed'}
                onClick={() => setDepthMode('detailed')}
                className={`min-h-[36px] rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  depthMode === 'detailed'
                    ? 'bg-white text-[#0F4C81] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Detailed Teaching
              </button>
              <button
                type="button"
                aria-pressed={depthMode === 'quick'}
                onClick={() => setDepthMode('quick')}
                className={`min-h-[36px] rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  depthMode === 'quick'
                    ? 'bg-white text-[#0F4C81] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Quick Revision
              </button>
            </div>
          </div>

          {/* Language Mode Segmented Control */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Language:</span>
            <div
              role="group"
              aria-label="Explanation language mode"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1"
            >
              <button
                type="button"
                aria-pressed={languageMode === 'en'}
                onClick={() => handleToggleLanguage('en')}
                className={`min-h-[36px] rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  languageMode === 'en'
                    ? 'bg-white text-[#0F4C81] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                English Only
              </button>
              <button
                type="button"
                aria-pressed={languageMode === 'ar-eg'}
                onClick={() => handleToggleLanguage('ar-eg')}
                className={`min-h-[36px] rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  languageMode === 'ar-eg'
                    ? 'bg-white text-[#0F4C81] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Egyptian Arabic (شرح بالمصري)
              </button>
            </div>
          </div>
        </div>

        {/* Module Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Study guide learning modules"
          className="flex items-center gap-1.5 overflow-x-auto pb-1"
        >
          {(
            [
              { id: 'steps', label: `Step-by-Step (${guide.sections.length})` },
              { id: 'visuals', label: 'Visual Atlas & Flows' },
              { id: 'cases', label: 'Cases & Comparisons' },
              {
                id: 'practice',
                label: `Flashcards & MCQs (${(guide.flashcards?.length || 0) + guide.mcqs.length})`,
              },
              { id: 'evidence', label: 'Latest Evidence' },
            ] as const
          ).map((tab) => {
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSubTab(tab.id)}
                className={`min-h-[40px] rounded-lg px-3.5 py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  active
                    ? 'bg-[#0F4C81] text-white'
                    : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: STEP-BY-STEP TEACHING & QUICK REVISION */}
      {activeSubTab === 'steps' && (
        <div className="pt-6 space-y-8">
          {/* High-Yield Rapid Revision Summary Sheet (Prominent in Quick Revision mode, compact option in Detailed) */}
          {quickBullets.length > 0 && depthMode === 'quick' && (
            <section
              aria-labelledby="quick-revision-heading"
              className="pb-6 border-b border-slate-200 space-y-3"
            >
              <h2
                id="quick-revision-heading"
                className="text-lg sm:text-xl font-bold text-[#0F4C81]"
              >
                High-Yield Quick Revision Summary
              </h2>
              <ul className="space-y-2 text-sm sm:text-[15px] leading-relaxed text-slate-800 list-disc pl-5 max-w-[74ch]">
                {quickBullets.map((bullet, bIdx) => (
                  <li key={bIdx}>{bullet}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Step Controls Header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              <span className="font-bold text-slate-800">
                Progressive Teaching Steps ({guide.sections.length})
              </span>
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">
                {textbookSectionCount} Textbook-Supported · {generalSectionCount}{' '}
                Supplementary Knowledge
              </span>
            </div>

            <div className="no-print flex items-center gap-3 text-xs font-semibold text-[#0284C7]">
              <button
                type="button"
                onClick={() => setAllStepsExpanded(true)}
                className="hover:underline whitespace-nowrap"
              >
                Expand All Steps
              </button>
              <span className="text-slate-300" aria-hidden="true">
                |
              </span>
              <button
                type="button"
                onClick={() => setAllStepsExpanded(false)}
                className="hover:underline whitespace-nowrap"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Expandable / Collapsible Numbered Steps (Clean Textbook Hairline Rhythm) */}
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {guide.sections.map((section, idx) => {
              const stepNum = section.stepNumber || idx + 1;
              const isExpanded = expandedSteps[idx] !== false;
              const isTextbook =
                section.sourceBasis === 'textbook' && section.pageNumbers.length > 0;
              const primaryPage = section.pageNumbers[0];

              return (
                <section key={idx} className="py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedSteps((prev) => ({
                          ...prev,
                          [idx]: !isExpanded,
                        }))
                      }
                      className="flex-1 min-w-[220px] flex items-start gap-3 text-left group focus:outline-none"
                    >
                      <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0F4C81] font-mono text-xs font-bold text-white shrink-0 tabular-nums">
                        {stepNum}
                      </span>
                      <div className="space-y-0.5">
                        {section.stepPhase && (
                          <span className="block text-xs font-semibold text-[#0284C7]">
                            {section.stepPhase}
                          </span>
                        )}
                        <h2 className="text-base sm:text-lg font-bold text-[#0F4C81] group-hover:underline [text-wrap:balance]">
                          {section.heading}
                        </h2>
                      </div>
                      <span className="ml-auto mt-1 text-slate-400 group-hover:text-[#0F4C81] shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        )}
                      </span>
                    </button>

                    <div className="pl-10 sm:pl-0 shrink-0">
                      {isTextbook && primaryPage ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenPage(
                              section.bookCitations?.[0]?.pageNumbers[0] || primaryPage,
                              section.bookCitations?.[0]?.textbookId
                            )
                          }
                          className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums whitespace-nowrap"
                        >
                          <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {formatBookCitationsSummary(
                              section.bookCitations,
                              section.pageNumbers,
                              guide.textbookTitle
                            )}
                          </span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
                          <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>Supplementary Medical Knowledge</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pl-0 sm:pl-10 space-y-4 max-w-[76ch]">
                      {depthMode === 'quick' &&
                      section.quickSummaryPoints &&
                      section.quickSummaryPoints.length > 0 ? (
                        <ul className="space-y-1.5 text-sm sm:text-[15px] leading-relaxed text-slate-800 list-disc pl-5">
                          {section.quickSummaryPoints.map((pt, pIdx) => (
                            <li key={pIdx}>{pt}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="font-serif text-[16px] leading-[1.74] text-slate-800 whitespace-pre-line">
                          {section.content}
                        </div>
                      )}

                      {/* Simple Egyptian Arabic Explanation Preserving English Medical Terms */}
                      {languageMode === 'ar-eg' && section.contentArabic && (
                        <div
                          dir="rtl"
                          className="rounded-xl bg-sky-50/50 border border-sky-200/70 px-4 py-3.5 text-[15px] leading-[1.9] text-slate-900"
                        >
                          <strong className="font-bold text-[#0F4C81] block mb-1">
                            الشرح المبسط بالمصري:
                          </strong>
                          <p className="whitespace-pre-line">{section.contentArabic}</p>
                          {section.keyTakeawayArabic && (
                            <p className="mt-2 pt-2 border-t border-sky-200/70 text-sm font-semibold text-[#0F4C81]">
                              الخلاصة: {section.keyTakeawayArabic}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Difficult Medical Terminology Decoder */}
                      {section.termDefinitions && section.termDefinitions.length > 0 && (
                        <div className="pt-2 space-y-2">
                          <span className="text-xs font-bold text-slate-600 block">
                            Key Medical Terms Simplified:
                          </span>
                          <dl className="space-y-2 text-xs sm:text-sm text-slate-700">
                            {section.termDefinitions.map((td, tIdx) => (
                              <div key={tIdx} className="leading-relaxed">
                                <dt className="inline font-bold text-[#0F4C81]">
                                  {td.term}:{' '}
                                </dt>
                                <dd className="inline">{td.simpleExplanation}</dd>
                                {languageMode === 'ar-eg' && td.arabicExplanation && (
                                  <span
                                    dir="rtl"
                                    className="block mt-0.5 text-xs sm:text-sm font-medium text-[#0F4C81] leading-[1.8]"
                                  >
                                    بالمصري: {td.arabicExplanation}
                                  </span>
                                )}
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}

                      {/* Verbatim Supporting Excerpt from Textbook */}
                      {isTextbook && section.supportingQuote && depthMode === 'detailed' && (
                        <blockquote className="rounded-lg bg-slate-50 border border-slate-200/90 px-4 py-2.5 text-xs sm:text-sm text-slate-700">
                          <strong className="font-semibold text-[#0F4C81] not-italic">
                            Textbook Excerpt ({buildPageCitationLabel(section.pageNumbers)}):{' '}
                          </strong>
                          <span className="font-serif italic">
                            &ldquo;{section.supportingQuote}&rdquo;
                          </span>
                        </blockquote>
                      )}

                      <p className="text-sm text-slate-800 pt-1">
                        <strong className="font-bold text-[#0F4C81]">Key Takeaway: </strong>
                        {section.keyTakeaway}
                      </p>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* Clinical Notes & Exam Pearls */}
          {guide.clinicalNotes.length > 0 && (
            <section aria-labelledby="clinical-notes-heading" className="pt-4 space-y-4">
              <div>
                <h3
                  id="clinical-notes-heading"
                  className="text-xl font-bold text-[#0F4C81]"
                >
                  Clinical Notes, Red Flags &amp; Exam Pearls
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Provenance-labeled bedside alerts and high-yield exam discriminators.
                </p>
              </div>

              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {guide.clinicalNotes.map((note, idx) => {
                  const { Icon, labelClass } = getCategoryMeta(note.category);
                  const isTextbook =
                    note.sourceBasis === 'textbook' && note.pageNumbers.length > 0;
                  const primaryPage = note.pageNumbers[0];

                  return (
                    <div key={idx} className="py-4 space-y-1.5 max-w-[76ch]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-bold ${labelClass}`}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            {note.category} · {note.title}
                          </span>
                        </span>

                        {isTextbook && primaryPage ? (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenPage(
                                note.bookCitations?.[0]?.pageNumbers[0] || primaryPage,
                                note.bookCitations?.[0]?.textbookId
                              )
                            }
                            className="font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums whitespace-nowrap shrink-0"
                          >
                            {formatBookCitationsSummary(
                              note.bookCitations,
                              note.pageNumbers,
                              guide.textbookTitle
                            )}
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-amber-800">
                            Supplementary Medical Knowledge
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700">{note.detail}</p>
                      {languageMode === 'ar-eg' && note.detailArabic && (
                        <p dir="rtl" className="text-sm leading-[1.8] text-[#0F4C81]">
                          بالمصري: {note.detailArabic}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Smooth Guided Progression Bar to Interactive Visuals & Practice */}
          <div className="no-print pt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Continue exploring interactive diagrams, clinical cases, flashcards, and live PubMed guidelines:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('visuals')}
                className="min-h-[40px] rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c3d68] transition-colors whitespace-nowrap"
              >
                Open Visual Mind Map &amp; Diagrams
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('practice')}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#0F4C81] hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Practice Flashcards &amp; MCQs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE VISUAL LEARNING (SVG MIND MAP, FLOWCHARTS, ANATOMICAL DIAGRAM) */}
      {activeSubTab === 'visuals' && (
        <div className="pt-6 space-y-8">
          {guide.mindMap && (
            <MindMapRenderer mindMap={guide.mindMap} onOpenPage={onOpenPage} />
          )}

          {guide.flowcharts && guide.flowcharts.length > 0 && (
            <FlowchartRenderer flowcharts={guide.flowcharts} onOpenPage={onOpenPage} />
          )}

          {guide.anatomicalDiagram && (
            <AnatomicalDiagramRenderer
              diagram={guide.anatomicalDiagram}
              onOpenPage={onOpenPage}
            />
          )}
        </div>
      )}

      {/* TAB 3: CLINICAL CASES & DIFFERENTIAL COMPARISON TABLE */}
      {activeSubTab === 'cases' && (
        <div className="pt-6">
          <ClinicalCasesAndTableSection
            comparisonTable={guide.comparisonTable}
            clinicalCases={guide.clinicalCases}
            languageMode={languageMode}
            onOpenPage={onOpenPage}
          />
        </div>
      )}

      {/* TAB 4: ACTIVE-RECALL FLASHCARDS & BOARD-STYLE MCQS */}
      {activeSubTab === 'practice' && (
        <div className="pt-6">
          {guide.flashcards && guide.flashcards.length > 0 && (
            <FlashcardsDeckSection
              flashcards={guide.flashcards}
              mastery={guide.flashcardMastery || {}}
              languageMode={languageMode}
              onUpdateMastery={onUpdateFlashcardMastery}
              onOpenPage={onOpenPage}
            />
          )}

          <MCQPracticeSection
            mcqs={guide.mcqs}
            answers={guide.answers || {}}
            languageMode={languageMode}
            onSelectAnswer={onSelectAnswer}
            onResetQuiz={onResetQuiz}
            onOpenPage={onOpenPage}
          />
        </div>
      )}

      {/* TAB 5: LATEST EXTERNAL MEDICAL EVIDENCE (PUBMED, MEDLINEPLUS, CLINICALTRIALS.GOV, UPTODATE EXTERNAL) */}
      {activeSubTab === 'evidence' && (
        <div className="pt-6">
          <LatestEvidenceSection
            topic={guide.topic}
            isOnline={isOnline}
            initialItems={guide.externalEvidence}
            onEvidenceLoaded={onEvidenceLoaded}
          />
        </div>
      )}
    </div>
  );
};
