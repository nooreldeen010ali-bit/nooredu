import React from 'react';
import { BookOpen, CheckCircle2, Globe, RotateCcw, XCircle } from 'lucide-react';
import type { LanguageMode, MCQItem } from '../types/medical';
import { buildPageCitationLabel, calculateQuizStats } from '../utils/textbookEngine';

interface MCQPracticeSectionProps {
  mcqs: MCQItem[];
  answers: Record<string, number>;
  languageMode?: LanguageMode;
  onSelectAnswer: (mcqId: string, optionIndex: number) => void;
  onResetQuiz: () => void;
  onOpenPage: (pageNumber: number) => void;
}

export const MCQPracticeSection: React.FC<MCQPracticeSectionProps> = ({
  mcqs,
  answers,
  languageMode = 'en',
  onSelectAnswer,
  onResetQuiz,
  onOpenPage,
}) => {
  const stats = calculateQuizStats(mcqs, answers);

  if (mcqs.length === 0) return null;

  return (
    <section aria-labelledby="mcq-heading" className="pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h3 id="mcq-heading" className="text-xl font-bold text-[#0F4C81]">
            Board-Style Self-Assessment MCQs
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
            <span>
              {stats.answeredCount} / {stats.totalCount} Answered
            </span>
            <span aria-hidden="true">·</span>
            <span>{stats.correctCount} Correct</span>
            {stats.answeredCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-[#0F4C81]">
                  {stats.accuracyPercent}% Accuracy
                </span>
              </>
            )}
          </div>
        </div>

        {stats.answeredCount > 0 && (
          <button
            type="button"
            onClick={onResetQuiz}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Answers</span>
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-200 border-t border-slate-200">
        {mcqs.map((mcq, qIdx) => {
          const selectedIdx = answers[mcq.id];
          const isAnswered = typeof selectedIdx === 'number';
          const isTextbook =
            mcq.sourceBasis === 'textbook' && mcq.pageNumbers.length > 0;
          const primaryPage = mcq.pageNumbers[0];

          return (
            <article key={mcq.id} className="py-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
                <span className="font-mono text-xs font-semibold text-[#0F4C81] tabular-nums">
                  Question {qIdx + 1} of {mcqs.length}
                </span>

                {isTextbook && primaryPage ? (
                  <button
                    type="button"
                    onClick={() => onOpenPage(primaryPage)}
                    className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums whitespace-nowrap shrink-0"
                  >
                    <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Textbook {buildPageCitationLabel(mcq.pageNumbers)}</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                    <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Supplementary Medical Knowledge</span>
                  </span>
                )}
              </div>

              <p className="font-serif text-[16px] leading-relaxed text-slate-900 mb-4 max-w-[75ch]">
                {mcq.question}
              </p>

              <div
                className="space-y-2.5 max-w-[75ch]"
                role="group"
                aria-label={`Question ${qIdx + 1} options`}
              >
                {mcq.options.map((optionText, optIdx) => {
                  const letter = String.fromCharCode(65 + optIdx);
                  const isSelected = selectedIdx === optIdx;
                  const isCorrectOption = optIdx === mcq.correctIndex;

                  let buttonStyle =
                    'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-[#0284C7] hover:bg-sky-50/40';
                  let statusLabel: React.ReactNode = null;

                  if (isAnswered) {
                    if (isCorrectOption) {
                      buttonStyle =
                        'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-medium';
                      statusLabel = (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 whitespace-nowrap shrink-0">
                          <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                          <span>Correct Answer</span>
                        </span>
                      );
                    } else if (isSelected) {
                      buttonStyle = 'border-red-400 bg-red-50/70 text-red-950';
                      statusLabel = (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-800 whitespace-nowrap shrink-0">
                          <XCircle className="h-4 w-4 text-red-700" aria-hidden="true" />
                          <span>Incorrect</span>
                        </span>
                      );
                    } else {
                      buttonStyle = 'border-slate-200 bg-white text-slate-500 opacity-80';
                    }
                  }

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => onSelectAnswer(mcq.id, optIdx)}
                      aria-pressed={isSelected}
                      className={`w-full min-h-[48px] flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C81] ${buttonStyle}`}
                    >
                      <span className="flex items-start gap-3">
                        <span className="font-mono font-semibold text-slate-600 shrink-0 mt-0.5">
                          {letter}.
                        </span>
                        <span className="leading-snug">{optionText}</span>
                      </span>
                      {statusLabel}
                    </button>
                  );
                })}
              </div>

              {isAnswered && (
                <div className="mt-4 pt-3 border-t border-slate-100 max-w-[75ch] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0F4C81]">
                      Answer Explanation (Correct Choice:{' '}
                      {String.fromCharCode(65 + mcq.correctIndex)})
                    </span>
                    {isTextbook && primaryPage ? (
                      <button
                        type="button"
                        onClick={() => onOpenPage(primaryPage)}
                        className="font-mono text-xs font-medium text-[#0284C7] hover:underline tabular-nums whitespace-nowrap"
                      >
                        Verify on {buildPageCitationLabel(mcq.pageNumbers)}
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-amber-800 whitespace-nowrap">
                        Source: Supplementary Medical Knowledge
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">{mcq.explanation}</p>
                  {languageMode === 'ar-eg' && mcq.explanationArabic && (
                    <p
                      dir="rtl"
                      className="text-sm leading-[1.85] text-slate-900 bg-sky-50/50 rounded-lg px-3.5 py-2.5"
                    >
                      <strong className="font-bold text-[#0F4C81]">التفسير بالمصري: </strong>
                      {mcq.explanationArabic}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
