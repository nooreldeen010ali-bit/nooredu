import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileDown,
  FileUp,
  Film,
  Layers,
  Loader2,
  Search,
} from 'lucide-react';
import type {
  BookUploadProgress,
  ExternalEvidenceItem,
  MedicalTextbook,
  PdfExportScope,
  StudyGuide,
} from '../types/medical';
import { PWAInstallButton } from './PWAInstallButton';
import { StudyGuideView } from './StudyGuideView';

interface TutorWorkspaceProps {
  textbooks: MedicalTextbook[];
  selectedTextbookIds: string[];
  onToggleTextbookSelection: (id: string) => void;
  onSelectAllTextbooks: () => void;
  onClearSelectedTextbooks?: () => void;
  onTriggerUpload: () => void;
  uploadQueue: BookUploadProgress[];
  topicInput: string;
  onChangeTopicInput: (val: string) => void;
  onSubmitTopic: (topicOverride?: string) => void;
  validationError: string | null;
  apiError: string | null;
  isGenerating: boolean;
  activeGuide: StudyGuide | null;
  onClearActiveGuide: () => void;
  sampleGuide: StudyGuide | null;
  onOpenSavedGuide: (guide: StudyGuide) => void;
  onOpenBookPage: (book: MedicalTextbook, pageNumber: number) => void;
  onOpenPage: (pageNumber: number, textbookId?: string) => void;
  onOpenPdfStudio: (initialScope?: PdfExportScope) => void;
  onAnimateLecture?: () => void;
  onOpenTimedExam?: () => void;
  onEvidenceLoaded: (items: ExternalEvidenceItem[], topicForEvidence?: string) => void;
  onSelectAnswer: (mcqId: string, optionIndex: number) => void;
  onResetQuiz: () => void;
  isOnline: boolean;
  isEnrichingArabic: boolean;
  onRequestArabicEnrichment: () => void;
  onUpdateFlashcardMastery: (cardId: string, status: 'mastered' | 'review') => void;
}

const DEFAULT_QUICK_TOPICS = [
  'Peptic Ulcer Disease',
  'Heart Failure',
  'Diabetic Ketoacidosis',
  'Bronchial Asthma',
  'Acute Kidney Injury',
];

export const TutorWorkspace: React.FC<TutorWorkspaceProps> = ({
  textbooks,
  selectedTextbookIds,
  onToggleTextbookSelection,
  onSelectAllTextbooks,
  onClearSelectedTextbooks,
  onTriggerUpload,
  uploadQueue,
  topicInput,
  onChangeTopicInput,
  onSubmitTopic,
  validationError,
  apiError,
  isGenerating,
  activeGuide,
  onClearActiveGuide,
  sampleGuide,
  onOpenSavedGuide,
  onOpenBookPage,
  onOpenPage,
  onOpenPdfStudio,
  onAnimateLecture,
  onOpenTimedExam,
  onEvidenceLoaded,
  onSelectAnswer,
  onResetQuiz,
  isOnline,
  isEnrichingArabic,
  onRequestArabicEnrichment,
  onUpdateFlashcardMastery,
}) => {
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  const selectedBooks = useMemo(
    () => textbooks.filter((b) => selectedTextbookIds.includes(b.id)),
    [textbooks, selectedTextbookIds]
  );

  const totalSelectedPages = useMemo(
    () => selectedBooks.reduce((sum, b) => sum + b.pageCount, 0),
    [selectedBooks]
  );

  const activeIndexingUploads = useMemo(
    () => uploadQueue.filter((u) => u.status === 'indexing' || u.status === 'queued'),
    [uploadQueue]
  );

  const suggestedTopics: string[] = useMemo(() => {
    const cleaned: string[] = [];
    for (const book of selectedBooks) {
      for (const p of book.pages) {
        const topicName = (p.chapterTitle || '')
          .replace(/^Chapter\s+\d+\s*(\(Page\s*\d+\))?:\s*/i, '')
          .split('—')[0]
          .split('&')[0]
          .trim();
        if (topicName.length >= 4 && topicName.length <= 58) {
          cleaned.push(topicName);
        }
      }
    }
    return Array.from(new Set([...cleaned, ...DEFAULT_QUICK_TOPICS])).slice(0, 5);
  }, [selectedBooks]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMobileControlsOpen(false);
    onSubmitTopic();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start w-full max-w-full">
      {/* Mobile Quick Toggle when an Active Study Guide is Open */}
      {activeGuide && !isGenerating && (
        <div className="lg:hidden rounded-xl border border-slate-200 bg-white p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#0F4C81] truncate">
              Blueprint: {activeGuide.topic}
            </p>
            <p className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
              {selectedBooks.length > 0
                ? `${selectedBooks.length} source book${selectedBooks.length === 1 ? '' : 's'} (${totalSelectedPages} pp.)`
                : 'General Medical Topic Mode'}
            </p>
          </div>
          <button
            type="button"
            aria-expanded={mobileControlsOpen}
            onClick={() => setMobileControlsOpen((v) => !v)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#0F4C81] hover:bg-sky-50 shrink-0 cursor-pointer"
          >
            <Search className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
            <span>{mobileControlsOpen ? 'Hide Search' : 'New Topic'}</span>
            {mobileControlsOpen ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      )}

      {/* Left Control Column */}
      <aside
        className={`lg:col-span-4 space-y-3.5 min-w-0 ${
          activeGuide && !isGenerating && !mobileControlsOpen ? 'hidden lg:block' : 'block'
        }`}
      >
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <form onSubmit={handleFormSubmit} noValidate>
            <label
              htmlFor="medical-topic-input"
              className="block text-sm sm:text-base font-bold text-[#0F4C81] mb-1"
            >
              1. Enter Any Medical Topic
            </label>
            <p className="text-xs text-slate-600 mb-3">
              Generates a Unified Medical Topic Blueprint for explanations, diagrams, 3D
              lecture, Study PDF, and Timed Exams—with or without uploaded textbooks.
            </p>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#0284C7]"
                aria-hidden="true"
              />
              <input
                id="medical-topic-input"
                type="search"
                value={topicInput}
                onChange={(e) => onChangeTopicInput(e.target.value)}
                placeholder="e.g., Peptic Ulcer Disease, Heart Failure, DKA..."
                className="w-full min-h-[46px] rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
              />
            </div>

            {(validationError || apiError) && (
              <div
                role="alert"
                className="mt-2.5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
              >
                <AlertCircle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="break-words">{validationError || apiError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isGenerating}
              className="mt-3 w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F4C81] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0c3d68] disabled:opacity-60 transition-colors cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
                  <span>Synthesizing Blueprint...</span>
                </>
              ) : (
                <>
                  <span>Generate Topic Blueprint</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          {/* Suggested Topics */}
          {suggestedTopics.length > 0 && (
            <div className="mt-3.5 pt-3.5 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-2">Quick Topics:</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedTopics.map((suggested) => (
                  <button
                    key={suggested}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => {
                      onChangeTopicInput(suggested);
                      setMobileControlsOpen(false);
                      onSubmitTopic(suggested);
                    }}
                    className="min-h-[34px] max-w-full truncate rounded-lg border border-slate-200 bg-[#F8FAFC] px-2.5 py-1 text-left text-xs font-medium text-slate-700 hover:border-[#0284C7] hover:bg-sky-50 hover:text-[#0F4C81] transition-colors cursor-pointer"
                  >
                    {suggested}
                  </button>
                ))}
              </div>
            </div>
          )}

          <hr className="my-4 border-slate-200" />

          {/* Optional Source Textbooks Selector */}
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs sm:text-sm font-bold text-[#0F4C81]">
              2. Source Textbooks ({selectedBooks.length}/{textbooks.length})
            </h2>
            <div className="flex items-center gap-2 text-xs">
              {textbooks.length > 0 && selectedBooks.length < textbooks.length && (
                <button
                  type="button"
                  onClick={onSelectAllTextbooks}
                  className="font-semibold text-[#0284C7] hover:underline cursor-pointer"
                >
                  Select All
                </button>
              )}
              {selectedBooks.length > 0 && onClearSelectedTextbooks && (
                <button
                  type="button"
                  onClick={onClearSelectedTextbooks}
                  className="font-semibold text-slate-500 hover:underline cursor-pointer"
                >
                  None
                </button>
              )}
            </div>
          </div>

          {activeIndexingUploads.length > 0 && (
            <div
              role="status"
              className="mb-3 space-y-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-[#0F4C81]"
            >
              {activeIndexingUploads.map((u) => {
                const pct =
                  u.totalPages > 0 ? Math.round((u.currentPage / u.totalPages) * 100) : 0;
                return (
                  <div key={u.id} className="flex items-center gap-2 min-w-0">
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    <span className="truncate">
                      Indexing {u.fileName}:{' '}
                      {u.totalPages > 0
                        ? `p. ${u.currentPage}/${u.totalPages} (${pct}%)`
                        : 'reading...'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {textbooks.length > 0 ? (
            <div className="space-y-2">
              <div
                role="group"
                aria-label="Select optional medical textbooks as sources"
                className="max-h-52 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-[#F8FAFC]"
              >
                {textbooks.map((book) => {
                  const checked = selectedBooks.some((b) => b.id === book.id);
                  return (
                    <div
                      key={book.id}
                      className={`flex items-start justify-between gap-2 px-3 py-2 transition-colors ${
                        checked ? 'bg-sky-50/50' : 'bg-white'
                      }`}
                    >
                      <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleTextbookSelection(book.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-[#0F4C81] shrink-0"
                        />
                        <span className="min-w-0 block">
                          <span className="block text-xs font-bold text-slate-900 leading-snug break-words">
                            {book.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-500 font-mono tabular-nums">
                            {book.subject || 'Medicine'} · {book.pageCount} pp.
                          </span>
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={() => onOpenBookPage(book, 1)}
                        className="mt-0.5 text-[11px] font-semibold text-[#0284C7] hover:underline shrink-0 cursor-pointer"
                      >
                        Read
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-mono tabular-nums">
                  {selectedBooks.length > 0
                    ? `${totalSelectedPages} pages selected`
                    : 'General Topic Mode (0 books)'}
                </span>
                <button
                  type="button"
                  onClick={onTriggerUpload}
                  className="font-semibold text-[#0F4C81] hover:underline whitespace-nowrap cursor-pointer"
                >
                  + Add PDF Book
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3.5 text-center space-y-2">
              <p className="text-xs text-slate-600">
                Optional: upload textbook PDFs for page-level citations, or study any
                medical topic directly above.
              </p>
              <button
                type="button"
                onClick={onTriggerUpload}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#0F4C81] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0c3d68] cursor-pointer"
              >
                <FileUp className="h-3.5 w-3.5" />
                <span>Upload Textbook PDF</span>
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-[#0F4C81]">
              Android &amp; Offline Access
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Install for offline study and direct PDF downloads.
            </p>
          </div>
          <PWAInstallButton compact />
        </div>
      </aside>

      {/* Right Main Stage */}
      <div id="active-study-guide-stage" className="lg:col-span-8 min-w-0 scroll-mt-20">
        {isGenerating ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10 text-center"
          >
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sky-50 text-[#0F4C81]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
            <h2 className="mt-3 text-lg font-bold text-[#0F4C81]">
              Building Unified Medical Topic Blueprint
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 max-w-md mx-auto break-words">
              {selectedBooks.length > 0
                ? `Cross-referencing ${selectedBooks.length} textbook${
                    selectedBooks.length === 1 ? '' : 's'
                  } (${totalSelectedPages} pages) and medical knowledge to align explanation, diagrams, 3D lecture, PDF, and exam items.`
                : 'Synthesizing aligned step-by-step explanation, medical diagrams, 3D lecture script, colorful PDF pack, and exam items.'}
            </p>
          </div>
        ) : activeGuide ? (
          <div className="space-y-3">
            <div className="no-print flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">
                Unified Medical Topic Blueprint · Saved offline &amp; synced to vault
              </span>
              <button
                type="button"
                onClick={onClearActiveGuide}
                className="min-h-[36px] text-xs font-semibold text-[#0F4C81] hover:underline whitespace-nowrap cursor-pointer"
              >
                Close Active Blueprint
              </button>
            </div>

            <StudyGuideView
              guide={activeGuide}
              isOnline={isOnline}
              isEnrichingArabic={isEnrichingArabic}
              onRequestArabicEnrichment={onRequestArabicEnrichment}
              onOpenPage={onOpenPage}
              onOpenPdfStudio={onOpenPdfStudio}
              onAnimateLecture={onAnimateLecture}
              onOpenTimedExam={onOpenTimedExam}
              onEvidenceLoaded={onEvidenceLoaded}
              onSelectAnswer={onSelectAnswer}
              onResetQuiz={onResetQuiz}
              onUpdateFlashcardMastery={onUpdateFlashcardMastery}
            />
          </div>
        ) : (
          /* Compact Minimalist Starter Card (Replaces Oversized Hero Image) */
          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-50 border border-sky-200 px-2.5 py-0.5 text-[11px] font-semibold text-[#0F4C81]">
                <Layers className="h-3.5 w-3.5 text-[#0284C7]" />
                Unified Medical Topic Blueprint
              </span>
              <h1 className="text-lg sm:text-xl font-bold text-[#0F4C81]">
                Study Any Medical Topic Step-by-Step
              </h1>
              <p className="text-xs sm:text-sm leading-relaxed text-slate-600 max-w-2xl">
                Enter any disease, mechanism, or clinical syndrome on the left. MedAtlas
                creates one canonical Medical Topic Blueprint powering your interactive
                explanation, anatomical &amp; pathway diagrams, continuous 3D lecture,
                printable A4 Study PDF, and Timed Exam—clearly distinguishing uploaded
                textbook pages from external evidence and general medical knowledge.
              </p>
            </div>

            {sampleGuide && (
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  Recent Blueprint:{' '}
                  <strong className="text-[#0F4C81]">{sampleGuide.topic}</strong>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenSavedGuide(sampleGuide)}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#0F4C81] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0c3d68] cursor-pointer"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-sky-200" />
                    <span>Open Blueprint</span>
                  </button>
                  {onAnimateLecture && (
                    <button
                      type="button"
                      onClick={onAnimateLecture}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs font-semibold text-[#0F4C81] hover:bg-sky-100 cursor-pointer"
                    >
                      <Film className="h-3.5 w-3.5 text-[#0284C7]" />
                      <span>3D Lecture</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenPdfStudio('single_topic')}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <FileDown className="h-3.5 w-3.5 text-[#0284C7]" />
                    <span>Study PDF</span>
                  </button>
                  {onOpenTimedExam && (
                    <button
                      type="button"
                      onClick={onOpenTimedExam}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5 text-[#0284C7]" />
                      <span>Timed Exam</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
