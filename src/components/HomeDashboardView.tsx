import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileDown,
  FileUp,
  Film,
  FlaskConical,
  GraduationCap,
  Layers,
  Loader2,
  Scale,
  Search,
} from 'lucide-react';
import type {
  BookUploadProgress,
  LectureProject,
  MedicalTextbook,
  PdfDocumentExportMode,
  PdfExportScope,
  StudyGuide,
} from '../types/medical';
import { formatBookCitationsSummary } from '../utils/multiBookEngine';
import type { ActiveTab } from './Header';
import { PWAInstallButton } from './PWAInstallButton';

interface HomeDashboardViewProps {
  textbooks: MedicalTextbook[];
  selectedTextbookIds: string[];
  uploadQueue: BookUploadProgress[];
  studyGuides: StudyGuide[];
  activeGuide?: StudyGuide | null;
  savedLectures: LectureProject[];
  topicInput: string;
  onChangeTopicInput: (val: string) => void;
  onSubmitTopic: (topicOverride?: string) => void;
  validationError: string | null;
  apiError: string | null;
  isGenerating: boolean;
  onToggleTextbookSelection: (id: string) => void;
  onSelectAllTextbooks: () => void;
  onClearSelectedTextbooks?: () => void;
  onTriggerUpload: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenSavedGuide: (guide: StudyGuide) => void;
  onOpenBookPage: (book: MedicalTextbook, pageNumber: number) => void;
  onAnimateGuide?: (guide: StudyGuide) => void;
  onOpenPdfStudio: (
    scope?: PdfExportScope,
    exportMode?: PdfDocumentExportMode,
    guide?: StudyGuide
  ) => void;
}

const DEFAULT_MEDICAL_TOPICS = [
  'Peptic Ulcer Disease',
  'Heart Failure',
  'Diabetic Ketoacidosis',
  'Acute Kidney Injury',
  'Bronchial Asthma',
  'Acute Appendicitis',
];

export const HomeDashboardView: React.FC<HomeDashboardViewProps> = ({
  textbooks,
  selectedTextbookIds,
  uploadQueue,
  studyGuides,
  activeGuide = null,
  savedLectures,
  topicInput,
  onChangeTopicInput,
  onSubmitTopic,
  validationError,
  apiError,
  isGenerating,
  onToggleTextbookSelection,
  onSelectAllTextbooks,
  onClearSelectedTextbooks,
  onTriggerUpload,
  onSelectTab,
  onOpenSavedGuide,
  onOpenBookPage,
  onAnimateGuide,
  onOpenPdfStudio,
}) => {
  const [showSourcePicker, setShowSourcePicker] = useState(false);

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

  const suggestedTopics = useMemo(() => {
    const cleaned: string[] = [];
    for (const book of selectedBooks) {
      for (const p of book.pages) {
        const topicName = (p.chapterTitle || '')
          .replace(/^Chapter\s+\d+\s*(\(Page\s*\d+\))?:\s*/i, '')
          .split('—')[0]
          .split('&')[0]
          .trim();
        if (topicName.length >= 4 && topicName.length <= 54) {
          cleaned.push(topicName);
        }
      }
    }
    const unique = Array.from(new Set([...cleaned, ...DEFAULT_MEDICAL_TOPICS]));
    return unique.slice(0, 6);
  }, [selectedBooks]);

  const currentBlueprintGuide = activeGuide || studyGuides[0] || null;

  const modules: Array<{
    id: ActiveTab;
    title: string;
    metric: string;
    description: string;
    Icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'tutor',
      title: 'Tutor',
      metric: `${studyGuides.length} blueprint${studyGuides.length === 1 ? '' : 's'}`,
      description: 'Step-by-step medical explanation, diagrams, and bilingual mode.',
      Icon: GraduationCap,
    },
    {
      id: 'library',
      title: 'Textbooks',
      metric: `${textbooks.length} book${textbooks.length === 1 ? '' : 's'}`,
      description: 'Upload medical PDFs, index pages offline, and inspect citations.',
      Icon: BookOpen,
    },
    {
      id: 'lecture',
      title: '3D Lectures',
      metric: `${savedLectures.length} lecture${savedLectures.length === 1 ? '' : 's'}`,
      description: 'Continuous 3D doctor lectures, smartboard visuals, TTS & MP4.',
      Icon: Film,
    },
    {
      id: 'pdfs',
      title: 'Study PDFs',
      metric: 'A4 Vector PDF',
      description: 'Colorful medical textbook study guides and revision compendiums.',
      Icon: FileDown,
    },
    {
      id: 'exams',
      title: 'Exams',
      metric: 'Timed & Practice',
      description: 'Countdown exams, free navigation, auto-save, and explanations.',
      Icon: ClipboardCheck,
    },
    {
      id: 'research',
      title: 'Research',
      metric: 'PubMed · Trials',
      description: 'Search live NCBI PubMed literature and ClinicalTrials.gov.',
      Icon: FlaskConical,
    },
    {
      id: 'guidelines',
      title: 'Guidelines',
      metric: 'NICE · WHO · NIH',
      description: 'Clinical practice guidelines and evidence-based decision portals.',
      Icon: Scale,
    },
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitTopic();
  };

  return (
    <div className="space-y-5 w-full max-w-full">
      {/* COMPACT SECTION 1: Unified Medical Topic Search & Blueprint Generator */}
      <section
        aria-labelledby="home-search-heading"
        className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1
              id="home-search-heading"
              className="text-lg sm:text-xl font-bold tracking-tight text-[#0F4C81]"
            >
              Medical Topic Blueprint Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Enter any medical topic—even without an uploaded textbook—to generate one
              unified explanation, 3D lecture, colorful A4 PDF, and timed exam.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start sm:self-center rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-[#0F4C81] shrink-0">
            <Layers className="h-3.5 w-3.5 text-[#0284C7]" />
            <span>Single Source of Truth</span>
          </span>
        </div>

        {/* Prominent Topic Search Form */}
        <form onSubmit={handleSearchSubmit} noValidate className="mt-3.5">
          <label htmlFor="home-medical-topic-search" className="sr-only">
            Search medical topic
          </label>
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#0284C7]"
                aria-hidden="true"
              />
              <input
                id="home-medical-topic-search"
                type="search"
                value={topicInput}
                onChange={(e) => onChangeTopicInput(e.target.value)}
                placeholder="Enter any medical topic (e.g., Peptic Ulcer Disease, Heart Failure, Acute Appendicitis)..."
                className="w-full min-h-[46px] rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
              />
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#0F4C81] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0c3d68] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
                  <span>Building Blueprint...</span>
                </>
              ) : (
                <>
                  <span>Generate Blueprint</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </>
              )}
            </button>
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

          {isGenerating && (
            <div
              role="status"
              aria-live="polite"
              className="mt-2.5 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs font-medium text-[#0F4C81]"
            >
              <Loader2 className="h-4 w-4 animate-spin shrink-0 text-[#0284C7]" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {selectedBooks.length > 0
                  ? `Synthesizing Unified Medical Topic Blueprint across ${selectedBooks.length} textbook${
                      selectedBooks.length === 1 ? '' : 's'
                    } (${totalSelectedPages} pages) + medical science...`
                  : 'Synthesizing Unified Medical Topic Blueprint from verified medical knowledge...'}
              </span>
            </div>
          )}
        </form>

        {/* Compact Textbook Scope & Quick Topics */}
        <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <BookOpen className="h-3.5 w-3.5 text-[#0F4C81] shrink-0" aria-hidden="true" />
              {selectedBooks.length > 0 ? (
                <span className="tabular-nums">
                  Source grounding: <strong>{selectedBooks.length}</strong> of {textbooks.length}{' '}
                  book{textbooks.length === 1 ? '' : 's'} ({totalSelectedPages} pp.) + General
                  Medical Science
                </span>
              ) : (
                <span className="text-slate-600">
                  General Medical Topic Mode (0 uploaded books selected — zero fabricated citations)
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {textbooks.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showSourcePicker}
                  onClick={() => setShowSourcePicker((v) => !v)}
                  className="inline-flex min-h-[36px] items-center gap-1 font-semibold text-[#0F4C81] hover:underline whitespace-nowrap cursor-pointer"
                >
                  <span>{showSourcePicker ? 'Hide Books' : 'Choose Books'}</span>
                  {showSourcePicker ? (
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onTriggerUpload}
                className="inline-flex min-h-[36px] items-center gap-1 font-semibold text-[#0284C7] hover:underline whitespace-nowrap cursor-pointer"
              >
                <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span>+ Upload PDF</span>
              </button>
            </div>
          </div>

          {activeIndexingUploads.length > 0 && (
            <div
              role="status"
              className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 space-y-1 text-xs text-[#0F4C81]"
            >
              {activeIndexingUploads.map((u) => {
                const pct =
                  u.totalPages > 0 ? Math.round((u.currentPage / u.totalPages) * 100) : 0;
                return (
                  <div key={u.id} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold truncate">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      <span className="truncate">Indexing {u.fileName}</span>
                    </span>
                    <span className="font-mono tabular-nums shrink-0">
                      {u.totalPages > 0 ? `${pct}%` : '...'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {showSourcePicker && textbooks.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-2.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700">
                  Selected Textbooks ({selectedBooks.length}/{textbooks.length})
                </span>
                <div className="flex items-center gap-3">
                  {selectedBooks.length < textbooks.length && (
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
                      className="font-semibold text-slate-600 hover:underline cursor-pointer"
                    >
                      Use General Knowledge Only
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-slate-200/80 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {textbooks.map((book) => {
                  const checked = selectedBooks.some((b) => b.id === book.id);
                  return (
                    <label
                      key={book.id}
                      className="flex min-h-[42px] items-center justify-between gap-3 px-3 py-1.5 cursor-pointer hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleTextbookSelection(book.id)}
                          className="h-4 w-4 rounded border-slate-300 text-[#0F4C81] shrink-0"
                        />
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {book.title}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                        {book.pageCount} pp.
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick-Start Clinical Topics */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 mr-0.5">
              Quick topics:
            </span>
            {suggestedTopics.map((topic) => (
              <button
                key={topic}
                type="button"
                disabled={isGenerating}
                onClick={() => {
                  onChangeTopicInput(topic);
                  onSubmitTopic(topic);
                }}
                className="min-h-[34px] max-w-full truncate rounded-lg border border-slate-200 bg-[#F8FAFC] px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[#0284C7] hover:bg-sky-50 hover:text-[#0F4C81] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* COMPACT SECTION 2: Active Unified Medical Topic Blueprint Strip */}
      {currentBlueprintGuide && (
        <section
          aria-label="Active Medical Topic Blueprint"
          className="rounded-xl border border-sky-200 bg-white p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded bg-[#0F4C81] px-2 py-0.5 font-bold text-white">
                ACTIVE BLUEPRINT
              </span>
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                {currentBlueprintGuide.coverage === 'none'
                  ? 'General Medical Knowledge (0 Book Pages Cited)'
                  : formatBookCitationsSummary(
                      currentBlueprintGuide.bookCitations,
                      currentBlueprintGuide.referencedPages,
                      currentBlueprintGuide.textbookTitle
                    )}
              </span>
              {(currentBlueprintGuide.externalEvidence?.length || 0) > 0 && (
                <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 tabular-nums">
                  {currentBlueprintGuide.externalEvidence!.length} External References
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-[#0F4C81] truncate">
              {currentBlueprintGuide.topic}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenSavedGuide(currentBlueprintGuide)}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-[#0F4C81] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0c3d68] cursor-pointer"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              <span>Tutor</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onAnimateGuide
                  ? onAnimateGuide(currentBlueprintGuide)
                  : onSelectTab('lecture')
              }
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-[#0F4C81] hover:bg-sky-100 cursor-pointer"
            >
              <Film className="h-3.5 w-3.5 text-[#0284C7]" />
              <span>3D Lecture</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenPdfStudio('single_topic', 'full_study_guide', currentBlueprintGuide)
              }
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <FileDown className="h-3.5 w-3.5 text-[#0284C7]" />
              <span>Study PDF</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('exams')}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ClipboardCheck className="h-3.5 w-3.5 text-[#0284C7]" />
              <span>Timed Exam</span>
            </button>
          </div>
        </section>
      )}

      {/* COMPACT SECTION 3: Learning & Clinical Reference Modules */}
      <section aria-labelledby="workspace-modules-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="workspace-modules-heading"
            className="text-base sm:text-lg font-bold text-[#0F4C81]"
          >
            Platform Modules
          </h2>
          <span className="text-xs text-slate-500">
            All modules synchronize with your active Medical Topic Blueprint
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {modules.map(({ id, title, metric, description, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-[#0284C7] hover:shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C81] cursor-pointer"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-[#0F4C81] group-hover:bg-[#0F4C81] group-hover:text-white transition-colors shrink-0">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-[11px] font-medium text-slate-500 tabular-nums truncate">
                    {metric}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#0F4C81] group-hover:underline">
                    {title}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                    {description}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#0284C7]">
                <span>Open {title}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* COMPACT SECTION 4: Recent Blueprints & Indexed Textbooks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <section
          aria-labelledby="recent-guides-heading"
          className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="recent-guides-heading" className="text-sm sm:text-base font-bold text-[#0F4C81]">
                Recent Topic Blueprints
              </h2>
              <p className="text-xs text-slate-500">
                Saved offline for Tutor reading, 3D Lectures, Study PDFs &amp; Timed Exams
              </p>
            </div>
            {studyGuides.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectTab('pdfs')}
                className="text-xs font-semibold text-[#0284C7] hover:underline whitespace-nowrap cursor-pointer"
              >
                View All ({studyGuides.length})
              </button>
            )}
          </div>

          {studyGuides.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-[#F8FAFC] p-5 text-center space-y-1">
              <p className="text-xs sm:text-sm font-medium text-slate-700">
                No topic blueprints saved yet
              </p>
              <p className="text-xs text-slate-500">
                Enter any medical topic above to create your first unified study blueprint.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {studyGuides.slice(0, 4).map((guide) => {
                const citationsLabel =
                  guide.coverage === 'none'
                    ? 'General Medical Knowledge'
                    : formatBookCitationsSummary(
                        guide.bookCitations,
                        guide.referencedPages,
                        guide.textbookTitle
                      );
                return (
                  <div
                    key={guide.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 break-words">
                        {guide.topic}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums truncate">
                        {citationsLabel} · {guide.sections.length} steps · 48 exam items
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenPdfStudio('single_topic', 'full_study_guide', guide)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-sky-200 bg-sky-50/70 px-2.5 py-1.5 text-xs font-semibold text-[#0F4C81] hover:bg-sky-100 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5 shrink-0" />
                        <span>PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenSavedGuide(guide)}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-[#0F4C81] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0c3d68] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <span>Open</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="lg:col-span-5 space-y-3">
          <section
            aria-labelledby="active-library-heading"
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2
                  id="active-library-heading"
                  className="text-sm sm:text-base font-bold text-[#0F4C81]"
                >
                  Uploaded Textbooks (Optional)
                </h2>
                <p className="text-xs text-slate-500">
                  Index medical PDFs for exact page citations
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectTab('library')}
                className="text-xs font-semibold text-[#0284C7] hover:underline whitespace-nowrap cursor-pointer"
              >
                Manage Library
              </button>
            </div>

            {textbooks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-[#F8FAFC] p-4 text-center space-y-2.5">
                <p className="text-xs text-slate-600">
                  Study any topic immediately using general medical knowledge, or upload a
                  textbook PDF for page-level citations.
                </p>
                <button
                  type="button"
                  onClick={onTriggerUpload}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0F4C81] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0c3d68] cursor-pointer"
                >
                  <FileUp className="h-3.5 w-3.5" />
                  <span>Upload PDF Book</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {textbooks.slice(0, 3).map((book) => (
                  <div
                    key={book.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {book.title}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {book.subject || 'Medicine'} · {book.pageCount} pages
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenBookPage(book, 1)}
                      className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-[#F8FAFC] px-2.5 py-1 text-xs font-semibold text-[#0F4C81] hover:bg-sky-50 shrink-0 cursor-pointer"
                    >
                      Read
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-bold text-[#0F4C81]">
                Android &amp; Offline Ready
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Install on mobile or desktop for offline access.
              </p>
            </div>
            <PWAInstallButton compact />
          </div>
        </div>
      </div>
    </div>
  );
};
