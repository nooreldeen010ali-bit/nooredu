import React from 'react';
import { BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { MedicalTextbook } from '../types/medical';
import { analyzeMedicalTopicQuery } from '../utils/textbookEngine';

interface PageReaderModalProps {
  textbook: MedicalTextbook | null;
  pageNumber: number | null;
  highlightTopic?: string;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text: string, topic?: string): React.ReactNode {
  if (!topic || !topic.trim()) return text;

  const analyzed = analyzeMedicalTopicQuery(topic);
  const terms = new Set<string>();
  for (const g of analyzed.coreGroups) {
    for (const v of g.variants) {
      if (v.length >= 3) terms.add(v);
    }
  }
  const sortedTerms = Array.from(terms).sort((a, b) => b.length - a.length).slice(0, 8);
  if (sortedTerms.length === 0) return text;

  const pattern = new RegExp(`(\\b(?:${sortedTerms.map(escapeRegExp).join('|')})\\b)`, 'gi');
  const parts = text.split(pattern);
  if (parts.length <= 1) return text;

  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark key={idx} className="rounded bg-amber-100/90 px-0.5 text-slate-950">
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

export const PageReaderModal: React.FC<PageReaderModalProps> = ({
  textbook,
  pageNumber,
  highlightTopic,
  onSelectPage,
  onClose,
}) => {
  if (!textbook || pageNumber === null) return null;

  const clampedPage = Math.min(Math.max(1, pageNumber), textbook.pageCount);
  const pageData = textbook.pages.find((p) => p.pageNumber === clampedPage) || {
    pageNumber: clampedPage,
    text: 'Page content unavailable.',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-reader-title"
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <BookOpen className="h-3.5 w-3.5 text-[#0F4C81] shrink-0" aria-hidden="true" />
              <span className="truncate">{textbook.title}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[#0F4C81] font-medium shrink-0">
                Page {clampedPage} of {textbook.pageCount}
              </span>
            </div>
            <h3
              id="page-reader-title"
              className="mt-1 text-base font-bold text-slate-900 truncate"
            >
              {pageData.chapterTitle || `Textbook Page ${clampedPage}`}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close textbook page reader"
            className="flex min-h-[44px] min-w-[44px] -mr-2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Textbook Page Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 bg-[#FCFDFF]">
          {highlightTopic && (
            <p className="mb-4 text-xs text-slate-500">
              Verified textbook page for topic:{' '}
              <strong className="text-slate-800">{highlightTopic}</strong>
            </p>
          )}
          <div className="font-serif text-[16px] leading-[1.75] text-slate-800 whitespace-pre-line max-w-[70ch]">
            {renderHighlightedText(pageData.text, highlightTopic)}
          </div>
        </div>

        {/* Page Navigation Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:rounded-b-2xl">
          <button
            type="button"
            disabled={clampedPage <= 1}
            onClick={() => onSelectPage(clampedPage - 1)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>Previous Page</span>
          </button>

          <span className="font-mono text-xs tabular-nums text-slate-600">
            p. {clampedPage} / {textbook.pageCount}
          </span>

          <button
            type="button"
            disabled={clampedPage >= textbook.pageCount}
            onClick={() => onSelectPage(clampedPage + 1)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            <span>Next Page</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
