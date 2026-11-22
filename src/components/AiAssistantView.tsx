import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ClipboardList,
  FileDown,
  Film,
  GraduationCap,
  Languages,
  Loader2,
  MessageSquareText,
  Send,
} from 'lucide-react';
import type {
  LanguageMode,
  MedicalTextbook,
  PdfDocumentExportMode,
  PdfExportScope,
  StudyGuide,
} from '../types/medical';
import {
  flattenClickableCitations,
  formatBookCitationsSummary,
} from '../utils/multiBookEngine';
import type { ActiveTab } from './Header';

interface AiAssistantViewProps {
  textbooks: MedicalTextbook[];
  selectedTextbookIds: string[];
  studyGuides: StudyGuide[];
  activeGuide: StudyGuide | null;
  topicInput: string;
  validationError: string | null;
  apiError: string | null;
  isGenerating: boolean;
  isOnline: boolean;
  isEnrichingArabic: boolean;
  onChangeTopicInput: (val: string) => void;
  onSubmitTopic: (topicOverride?: string) => void;
  onRequestArabicEnrichment: () => void;
  onSelectGuide: (guide: StudyGuide) => void;
  onOpenPage: (pageNumber: number, textbookId?: string) => void;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenPdfStudio: (
    scope?: PdfExportScope,
    exportMode?: PdfDocumentExportMode,
    guide?: StudyGuide
  ) => void;
  onAnimateLecture?: (guide: StudyGuide) => void;
}

const CLINICAL_ASSISTANT_PROMPTS = [
  'Peptic Ulcer Disease',
  'Heart Failure',
  'Diabetic Ketoacidosis',
  'Acute Kidney Injury',
  'Community-Acquired Pneumonia',
];

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  textbooks,
  selectedTextbookIds,
  studyGuides,
  activeGuide,
  topicInput,
  validationError,
  apiError,
  isGenerating,
  isOnline,
  isEnrichingArabic,
  onChangeTopicInput,
  onSubmitTopic,
  onRequestArabicEnrichment,
  onSelectGuide,
  onOpenPage,
  onSelectTab,
  onOpenPdfStudio,
  onAnimateLecture,
}) => {
  const [languageMode, setLanguageMode] = useState<LanguageMode>('en');
  const currentGuide = activeGuide || studyGuides[0] || null;

  const selectedBooks = useMemo(() => {
    const matched = textbooks.filter((b) => selectedTextbookIds.includes(b.id));
    return matched.length > 0 ? matched : textbooks.slice(0, 1);
  }, [textbooks, selectedTextbookIds]);

  const totalPages = useMemo(
    () => selectedBooks.reduce((sum, b) => sum + b.pageCount, 0),
    [selectedBooks]
  );

  const handleLanguageChange = (next: LanguageMode) => {
    setLanguageMode(next);
    if (
      next === 'ar-eg' &&
      currentGuide &&
      !currentGuide.summaryArabic &&
      isOnline &&
      !isEnrichingArabic
    ) {
      onRequestArabicEnrichment();
    }
  };

  const clickableCitations = currentGuide
    ? flattenClickableCitations(
        currentGuide.bookCitations,
        currentGuide.referencedPages,
        currentGuide.textbookId,
        currentGuide.textbookTitle
      )
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full max-w-full">
      {/* Left Column: Prompt Composer & Recent Consultations */}
      <aside className="lg:col-span-4 space-y-4 min-w-0">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#0284C7]">
              <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Textbook-Grounded AI Assistant</span>
            </div>
            <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#0F4C81]">
              Medical Study Assistant
            </h1>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-600">
              Ask about any disease, physiological pathway, differential diagnosis, or drug class. Responses separate verified textbook citations from supplementary medical knowledge.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitTopic();
            }}
            noValidate
            className="space-y-3"
          >
            <label htmlFor="ai-assistant-topic-input" className="sr-only">
              Enter medical topic or clinical concept
            </label>
            <textarea
              id="ai-assistant-topic-input"
              rows={3}
              value={topicInput}
              onChange={(e) => onChangeTopicInput(e.target.value)}
              placeholder="Enter a medical topic to synthesize from your textbooks (e.g., Peptic Ulcer Disease, Heart Failure, Acute Pancreatitis)..."
              className="w-full rounded-xl border border-slate-300 bg-[#F8FAFC] p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
            />

            {(validationError || apiError) && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-800"
              >
                <AlertCircle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="break-words">{validationError || apiError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F4C81] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0c3d68] disabled:opacity-60 transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
                  <span>Synthesizing Textbook Answer...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Ask Medical Assistant</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 font-mono tabular-nums">
            Active scope: {selectedBooks.length} textbook{selectedBooks.length === 1 ? '' : 's'} ·{' '}
            {totalPages} indexed pages
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="block text-xs font-semibold text-slate-600">
              Suggested Clinical Topics:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CLINICAL_ASSISTANT_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => {
                    onChangeTopicInput(prompt);
                    onSubmitTopic(prompt);
                  }}
                  className="min-h-[36px] max-w-full truncate rounded-lg border border-slate-200 bg-[#F8FAFC] px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#0284C7] hover:bg-sky-50 hover:text-[#0F4C81]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Previous Assistant Topics */}
        {studyGuides.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-sm font-bold text-[#0F4C81]">
              Saved Topic Briefings ({studyGuides.length})
            </h2>
            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {studyGuides.map((g) => {
                const isSelected = currentGuide?.id === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelectGuide(g)}
                    className={`w-full min-h-[44px] py-2.5 px-2 text-left rounded-lg transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-sky-50 text-[#0F4C81] font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs sm:text-sm truncate">{g.topic}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#0284C7]" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      {/* Right Column: Structured Clinical Briefing & Next Actions */}
      <section className="lg:col-span-8 min-w-0">
        {isGenerating ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 text-center space-y-3"
          >
            <Loader2
              className="h-8 w-8 animate-spin text-[#0F4C81] mx-auto"
              aria-hidden="true"
            />
            <h2 className="text-lg font-bold text-[#0F4C81]">
              Retrieving Verified Passages &amp; Structuring Medical Explanation...
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Cross-checking {totalPages} pages across your selected medical textbooks.
            </p>
          </div>
        ) : !currentGuide ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 text-center space-y-3">
            <h2 className="text-lg font-bold text-[#0F4C81]">
              Ask a Medical Topic to Begin
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto">
              Enter any clinical condition or mechanism on the left to receive a structured, citation-backed medical briefing in English and Egyptian Arabic.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 space-y-6">
            {/* Header & Bilingual Switch */}
            <div className="border-b border-slate-200 pb-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-mono text-slate-500 tabular-nums">
                  {formatBookCitationsSummary(
                    currentGuide.bookCitations,
                    currentGuide.referencedPages,
                    currentGuide.textbookTitle
                  )}
                </p>

                <div
                  role="group"
                  aria-label="Assistant explanation language"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1"
                >
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('en')}
                    className={`min-h-[36px] rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      languageMode === 'en'
                        ? 'bg-white text-[#0F4C81] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('ar-eg')}
                    className={`min-h-[36px] inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      languageMode === 'ar-eg'
                        ? 'bg-white text-[#0F4C81] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Egyptian Arabic</span>
                  </button>
                </div>
              </div>

              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#0F4C81] break-words">
                {currentGuide.topic}
              </h2>

              <p className="font-serif text-[16px] leading-[1.7] text-slate-700 max-w-[74ch] break-words">
                {currentGuide.summary}
              </p>

              {languageMode === 'ar-eg' && (
                <div className="max-w-[74ch]">
                  {isEnrichingArabic ? (
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#0F4C81]">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Generating Egyptian Arabic explanation...</span>
                    </div>
                  ) : currentGuide.summaryArabic ? (
                    <div
                      dir="rtl"
                      className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 text-[15px] leading-[1.9] text-slate-900"
                    >
                      <strong className="block font-bold text-[#0F4C81] mb-1">
                        الشرح المبسط بالمصري:
                      </strong>
                      <span>{currentGuide.summaryArabic}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Direct Handoff Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectGuide(currentGuide);
                    onSelectTab('tutor');
                  }}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c3d68] transition-colors whitespace-nowrap"
                >
                  <GraduationCap className="h-4 w-4 text-sky-200 shrink-0" aria-hidden="true" />
                  <span>Full Tutor &amp; Diagrams</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onOpenPdfStudio('single_topic', 'full_study_guide', currentGuide)
                  }
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-2 text-xs font-semibold text-[#0F4C81] hover:bg-sky-100 transition-colors whitespace-nowrap"
                >
                  <FileDown className="h-4 w-4 text-[#0284C7] shrink-0" aria-hidden="true" />
                  <span>Study PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectGuide(currentGuide);
                    onSelectTab('qbank');
                  }}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <ClipboardList className="h-4 w-4 text-[#0284C7] shrink-0" aria-hidden="true" />
                  <span>48-Item Q-Bank</span>
                </button>

                {onAnimateLecture && (
                  <button
                    type="button"
                    onClick={() => onAnimateLecture(currentGuide)}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    <Film className="h-4 w-4 text-[#0284C7] shrink-0" aria-hidden="true" />
                    <span>Animate Lecture</span>
                  </button>
                )}
              </div>
            </div>

            {/* Key Structured Takeaways */}
            <div className="space-y-4">
              <h3 className="text-base sm:text-lg font-bold text-[#0F4C81]">
                Core Clinical Breakdown ({currentGuide.sections.length} Sections)
              </h3>
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {currentGuide.sections.map((sec, idx) => (
                  <div key={idx} className="py-4 space-y-1.5 max-w-[76ch]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm sm:text-base font-bold text-[#0F4C81]">
                        {idx + 1}. {sec.heading}
                      </h4>
                      <span className="font-mono text-xs text-slate-500 tabular-nums">
                        {sec.sourceBasis === 'textbook' && sec.pageNumbers.length > 0
                          ? `Textbook p. ${sec.pageNumbers.join(', ')}`
                          : 'Supplementary Knowledge'}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700 break-words">
                      {sec.keyTakeaway || sec.content}
                    </p>
                    {languageMode === 'ar-eg' && sec.contentArabic && (
                      <p
                        dir="rtl"
                        className="mt-1.5 rounded-lg bg-sky-50/50 px-3.5 py-2.5 text-sm leading-[1.85] text-slate-900"
                      >
                        {sec.keyTakeawayArabic || sec.contentArabic}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Clickable Verified Textbook Citations */}
            {clickableCitations.length > 0 && (
              <div className="space-y-2">
                <span className="block text-xs font-bold text-slate-600">
                  Verified Textbook Page Citations:
                </span>
                <div className="flex flex-wrap gap-2">
                  {clickableCitations.map((cit) => (
                    <button
                      key={cit.key}
                      type="button"
                      onClick={() => onOpenPage(cit.pageNumber, cit.textbookId)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 font-mono text-xs font-medium text-[#0F4C81] hover:border-[#0284C7] hover:bg-sky-50 tabular-nums"
                    >
                      <BookOpen className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                      <span>
                        {cit.shortTitle} · p. {cit.pageNumber}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
