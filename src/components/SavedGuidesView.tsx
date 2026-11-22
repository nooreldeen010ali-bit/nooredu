import React, { useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  ClipboardList,
  FileDown,
  FileText,
  Layers,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  PdfDocumentExportMode,
  PdfExportScope,
  StudyGuide,
} from '../types/medical';
import { formatBookCitationsSummary } from '../utils/multiBookEngine';
import { calculateQuizStats } from '../utils/textbookEngine';

interface SavedGuidesViewProps {
  guides: StudyGuide[];
  onOpenGuide: (guide: StudyGuide) => void;
  onExportGuidePdf: (guide: StudyGuide) => void;
  onOpenMultiGuidePdfStudio: (
    scope: PdfExportScope,
    exportMode?: PdfDocumentExportMode
  ) => void;
  onDeleteGuide: (id: string) => void;
  onGoToTutor: () => void;
}

type GuideFilter = 'all' | 'completed' | 'unanswered';

export const SavedGuidesView: React.FC<SavedGuidesViewProps> = ({
  guides,
  onOpenGuide,
  onExportGuidePdf,
  onOpenMultiGuidePdfStudio,
  onDeleteGuide,
  onGoToTutor,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<GuideFilter>('all');

  const filteredGuides = guides.filter((g) => {
    const matchesSearch =
      !searchQuery.trim() ||
      g.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.textbookTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.summary.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    const stats = calculateQuizStats(g.mcqs, g.answers || {});
    if (filter === 'completed') return stats.isComplete;
    if (filter === 'unanswered') return !stats.isComplete;
    return true;
  });

  const pdfStudioActions: Array<{
    title: string;
    subtitle: string;
    scope: PdfExportScope;
    exportMode: PdfDocumentExportMode;
    Icon: React.FC<{ className?: string }>;
  }> = [
    {
      title: 'Single-Topic Study PDF',
      subtitle: 'Illustrated A4 medical textbook guide with diagrams & citations',
      scope: 'single_topic',
      exportMode: 'full_study_guide',
      Icon: FileText,
    },
    {
      title: 'Chapter Compendium PDF',
      subtitle: 'Compile indexed pages from an uploaded medical textbook',
      scope: 'chapter',
      exportMode: 'full_study_guide',
      Icon: BookOpen,
    },
    {
      title: 'Rapid Revision Sheet',
      subtitle: 'Dense high-yield summary for exam-week review',
      scope: 'revision_guide',
      exportMode: 'full_study_guide',
      Icon: Layers,
    },
    {
      title: '48-Item Exam Paper PDF',
      subtitle: 'Printable 30 MCQs, 10 written & 8 clinical cases',
      scope: 'single_topic',
      exportMode: 'question_bank_with_answers',
      Icon: ClipboardList,
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-full">
      {/* Header & Primary PDF Studio CTA */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#0284C7]">
              Printable A4 Vector Documents &amp; Saved Topics
            </p>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#0F4C81] [text-wrap:balance]">
              Study PDFs &amp; Saved Guides
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Generate real, selectable-text illustrated medical textbook PDFs for Android and desktop printing, or reopen any saved study guide offline.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              onOpenMultiGuidePdfStudio(
                guides.length > 0 ? 'single_topic' : 'chapter',
                'full_study_guide'
              )
            }
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0F4C81] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#0c3d68] transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="h-4 w-4 text-sky-200 shrink-0" aria-hidden="true" />
            <span>Open PDF Studio</span>
          </button>
        </div>

        {/* 4 Structured PDF Format Launchers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {pdfStudioActions.map(({ title, subtitle, scope, exportMode, Icon }) => (
            <button
              key={title}
              type="button"
              onClick={() => onOpenMultiGuidePdfStudio(scope, exportMode)}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 text-left hover:border-[#0284C7] hover:bg-sky-50/50 transition-colors"
            >
              <div className="space-y-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 text-[#0F4C81] group-hover:bg-[#0F4C81] group-hover:text-white transition-colors">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <h2 className="text-sm font-bold text-[#0F4C81]">{title}</h2>
                <p className="text-xs leading-relaxed text-slate-600">{subtitle}</p>
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7]">
                <span>Configure &amp; Preview</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search & Interactive Segmented Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md min-w-0">
          <label htmlFor="search-saved-guides" className="sr-only">
            Search saved study guides
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="search-saved-guides"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter saved guides by topic or textbook..."
            className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
          />
        </div>

        <div
          className="flex items-center gap-1 rounded-xl bg-slate-200/70 p-1 overflow-x-auto max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Filter study guides by quiz status"
        >
          {(
            [
              { id: 'all', label: `All (${guides.length})` },
              { id: 'unanswered', label: 'To Practice' },
              { id: 'completed', label: 'Completed' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                filter === tab.id
                  ? 'bg-white text-[#0F4C81] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredGuides.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-600">
            {guides.length === 0
              ? 'No study guides saved yet. Search a medical topic to generate your first illustrated study guide and PDF.'
              : 'No saved study guides match your current search or filter.'}
          </p>
          {guides.length === 0 && (
            <button
              type="button"
              onClick={onGoToTutor}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0c3d68] transition-colors"
            >
              <span>Search a Medical Topic</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGuides.map((guide) => {
            const stats = calculateQuizStats(guide.mcqs, guide.answers || {});
            const dateStr = new Date(guide.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const citationsLabel = formatBookCitationsSummary(
              guide.bookCitations,
              guide.referencedPages,
              guide.textbookTitle
            );

            return (
              <article
                key={guide.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 transition-colors hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-lg sm:text-xl font-bold text-[#0F4C81] break-words">
                      {guide.topic}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                      <span className="font-sans font-semibold text-slate-800 break-words">
                        {citationsLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        MCQs: {stats.answeredCount}/{stats.totalCount}
                        {stats.answeredCount > 0 ? ` (${stats.accuracyPercent}%)` : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{dateStr}</span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 line-clamp-2 max-w-[75ch] break-words">
                      {guide.summary}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteGuide(guide.id)}
                    aria-label={`Delete study guide ${guide.topic}`}
                    className="flex min-h-[44px] min-w-[44px] -mr-2 -mt-2 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-500 tabular-nums">
                    {guide.sections.length} Steps · {guide.flashcards?.length || 0} Flashcards ·{' '}
                    {guide.clinicalNotes.length} Pearls
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onExportGuidePdf(guide)}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/70 px-3.5 py-2 text-xs font-semibold text-[#0F4C81] hover:bg-sky-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      <FileDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Preview &amp; Download PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenGuide(guide)}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#0c3d68] transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Open in Tutor</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
