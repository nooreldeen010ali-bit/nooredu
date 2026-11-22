import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  Globe,
  List,
  RotateCcw,
} from 'lucide-react';
import type { FlashcardItem, LanguageMode } from '../types/medical';
import { buildPageCitationLabel } from '../utils/textbookEngine';

interface FlashcardsDeckSectionProps {
  flashcards: FlashcardItem[];
  mastery: Record<string, 'mastered' | 'review'>;
  languageMode: LanguageMode;
  onUpdateMastery: (cardId: string, status: 'mastered' | 'review') => void;
  onOpenPage: (pageNumber: number) => void;
}

export const FlashcardsDeckSection: React.FC<FlashcardsDeckSectionProps> = ({
  flashcards,
  mastery,
  languageMode,
  onUpdateMastery,
  onOpenPage,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [viewAllList, setViewAllList] = useState<boolean>(false);

  if (!Array.isArray(flashcards) || flashcards.length === 0) {
    return null;
  }

  const safeIndex = Math.min(currentIndex, flashcards.length - 1);
  const currentCard = flashcards[safeIndex];
  const masteredCount = flashcards.filter((c) => mastery[c.id] === 'mastered').length;
  const reviewCount = flashcards.filter((c) => mastery[c.id] === 'review').length;

  const isTextbook =
    currentCard.sourceBasis === 'textbook' && currentCard.pageNumbers.length > 0;
  const currentStatus = mastery[currentCard.id];

  return (
    <section
      aria-labelledby="flashcards-heading"
      className="pb-8 border-b border-slate-200 space-y-5"
      data-testid="flashcards-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="flashcards-heading" className="text-xl font-bold text-[#0F4C81]">
            Active-Recall Flashcards
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
            <span>
              Card {safeIndex + 1} of {flashcards.length}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-800 font-semibold">{masteredCount} Mastered</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-800 font-semibold">{reviewCount} Needs Review</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setViewAllList((v) => !v)}
          className="no-print inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
        >
          <List className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{viewAllList ? 'Interactive Deck Mode' : 'View All Cards'}</span>
        </button>
      </div>

      {!viewAllList ? (
        <div className="space-y-4">
          {/* Interactive Single Flashcard Stage */}
          <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-5 sm:p-7 min-h-[220px] flex flex-col justify-between gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="font-bold text-[#0F4C81]">{currentCard.category}</span>
                <span aria-hidden="true">·</span>
                <span>{isFlipped ? 'Answer Side' : 'Prompt Side'}</span>
                {currentStatus && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        currentStatus === 'mastered'
                          ? 'font-semibold text-emerald-800'
                          : 'font-semibold text-amber-800'
                      }
                    >
                      {currentStatus === 'mastered' ? 'Marked Mastered' : 'Marked for Review'}
                    </span>
                  </>
                )}
              </div>

              {isTextbook ? (
                <button
                  type="button"
                  onClick={() => onOpenPage(currentCard.pageNumbers[0])}
                  className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums whitespace-nowrap"
                >
                  <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Textbook {buildPageCitationLabel(currentCard.pageNumbers)}</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 whitespace-nowrap">
                  <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Supplementary Medical Knowledge</span>
                </span>
              )}
            </div>

            {!isFlipped ? (
              <div className="py-2">
                <p className="font-serif text-lg sm:text-xl font-semibold leading-relaxed text-slate-900 max-w-[68ch]">
                  {currentCard.front}
                </p>
              </div>
            ) : (
              <div className="py-2 space-y-3 max-w-[70ch]">
                <p className="text-xs font-medium text-slate-500">
                  Prompt: {currentCard.front}
                </p>
                <p className="font-serif text-[16px] sm:text-[17px] leading-[1.7] text-slate-900">
                  {currentCard.back}
                </p>
                {languageMode === 'ar-eg' && currentCard.backArabic && (
                  <div
                    dir="rtl"
                    className="pt-2 border-t border-slate-200 text-sm leading-[1.85] text-slate-900"
                  >
                    <strong className="font-bold text-[#0F4C81]">بالمصري: </strong>
                    <span>{currentCard.backArabic}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/80">
              <button
                type="button"
                aria-pressed={isFlipped}
                onClick={() => setIsFlipped((f) => !f)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#0c3d68] transition-colors whitespace-nowrap"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                <span>{isFlipped ? 'Show Question Front' : 'Reveal Flashcard Answer'}</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateMastery(currentCard.id, 'review')}
                  aria-pressed={currentStatus === 'review'}
                  className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    currentStatus === 'review'
                      ? 'border-amber-500 bg-amber-50 text-amber-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Review Again</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateMastery(currentCard.id, 'mastered')}
                  aria-pressed={currentStatus === 'mastered'}
                  className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    currentStatus === 'mastered'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Mastered</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card Navigation Controls */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={safeIndex === 0}
              onClick={() => {
                setCurrentIndex((i) => Math.max(0, i - 1));
                setIsFlipped(false);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Previous Card</span>
            </button>

            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {flashcards.map((c, idx) => {
                const status = mastery[c.id];
                const active = idx === safeIndex;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={`Go to flashcard ${idx + 1}`}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setIsFlipped(false);
                    }}
                    className={`h-8 w-8 rounded-md font-mono text-xs font-bold tabular-nums transition-colors shrink-0 ${
                      active
                        ? 'bg-[#0F4C81] text-white'
                        : status === 'mastered'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                          : status === 'review'
                            ? 'bg-amber-50 text-amber-800 border border-amber-300'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={safeIndex >= flashcards.length - 1}
              onClick={() => {
                setCurrentIndex((i) => Math.min(flashcards.length - 1, i + 1));
                setIsFlipped(false);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap"
            >
              <span>Next Card</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 border-t border-slate-200">
          {flashcards.map((card, idx) => (
            <div key={card.id} className="py-4 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-bold text-[#0F4C81]">
                  #{idx + 1} · {card.category}
                </span>
                <span>
                  {card.sourceBasis === 'textbook' && card.pageNumbers.length > 0
                    ? `Textbook ${buildPageCitationLabel(card.pageNumbers)}`
                    : 'Supplementary Medical Knowledge'}
                </span>
              </div>
              <p className="font-semibold text-sm text-slate-900">Q: {card.front}</p>
              <p className="text-sm text-slate-700 leading-relaxed">A: {card.back}</p>
              {languageMode === 'ar-eg' && card.backArabic && (
                <p dir="rtl" className="text-sm text-[#0F4C81] leading-[1.8]">
                  بالمصري: {card.backArabic}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
