import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileDown,
  Globe,
  Loader2,
  RotateCcw,
  Search,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import type {
  LanguageMode,
  PdfDocumentExportMode,
  PdfExportScope,
  QuestionDifficultyTier,
  StudyGuide,
} from '../types/medical';
import { ensureCompleteInfographicTopicPack } from '../utils/infographicQuestionBankEngine';
import { buildPageCitationLabel } from '../utils/textbookEngine';
import { FlashcardsDeckSection } from './FlashcardsDeckSection';

interface QuestionBankViewProps {
  studyGuides: StudyGuide[];
  activeGuide: StudyGuide | null;
  topicInput: string;
  isGenerating: boolean;
  onChangeTopicInput: (val: string) => void;
  onSubmitTopic: (topicOverride?: string) => void;
  onSelectGuide: (guide: StudyGuide) => void;
  onOpenPage: (pageNumber: number, textbookId?: string) => void;
  onUpdateFlashcardMastery: (cardId: string, status: 'mastered' | 'review') => void;
  onOpenPdfStudio: (
    scope?: PdfExportScope,
    exportMode?: PdfDocumentExportMode,
    guide?: StudyGuide
  ) => void;
}

type QBankTab = 'mcqs' | 'written' | 'cases' | 'flashcards';

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  studyGuides,
  activeGuide,
  topicInput,
  isGenerating,
  onChangeTopicInput,
  onSubmitTopic,
  onSelectGuide,
  onOpenPage,
  onUpdateFlashcardMastery,
  onOpenPdfStudio,
}) => {
  const targetGuide = activeGuide || studyGuides[0] || null;

  const [activeSubTab, setActiveSubTab] = useState<QBankTab>('mcqs');
  const [difficultyFilter, setDifficultyFilter] = useState<'ALL' | QuestionDifficultyTier>('ALL');
  const [mcqSelections, setMcqSelections] = useState<Record<string, number>>({});
  const [revealedWritten, setRevealedWritten] = useState<Record<string, boolean>>({});
  const [writtenDrafts, setWrittenDrafts] = useState<Record<string, string>>({});
  const [revealedCases, setRevealedCases] = useState<Record<string, boolean>>({});
  const [languageMode] = useState<LanguageMode>('en');

  const compiledPack = useMemo(() => {
    if (!targetGuide) return null;
    return ensureCompleteInfographicTopicPack(targetGuide, targetGuide.infographicPack);
  }, [targetGuide]);

  const mcqs = compiledPack?.questionBank.mcqs || [];
  const writtenQuestions = compiledPack?.questionBank.writtenQuestions || [];
  const clinicalCases = compiledPack?.questionBank.clinicalCases || [];
  const flashcards = targetGuide?.flashcards || [];

  const filteredMcqs = useMemo(() => {
    if (difficultyFilter === 'ALL') return mcqs;
    return mcqs.filter((q) => q.difficulty === difficultyFilter);
  }, [mcqs, difficultyFilter]);

  const answeredCount = useMemo(
    () => mcqs.filter((q) => typeof mcqSelections[q.id] === 'number').length,
    [mcqs, mcqSelections]
  );

  const correctCount = useMemo(
    () => mcqs.filter((q) => mcqSelections[q.id] === q.correctIndex).length,
    [mcqs, mcqSelections]
  );

  const accuracyPct =
    answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  return (
    <div className="space-y-6 w-full max-w-full">
      {/* Header & Topic Switcher */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#0284C7]">
              <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Comprehensive Medical Assessment</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#0F4C81] [text-wrap:balance]">
              Medical Question Bank &amp; Self-Testing
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Practice 30 single-best-answer MCQs, 10 structured written exam questions, 8 progressive clinical cases, and active-recall flashcards for every studied medical topic.
            </p>
          </div>

          {targetGuide && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onOpenPdfStudio('single_topic', 'question_bank_self_test', targetGuide)
                }
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#0F4C81] hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <FileDown className="h-4 w-4 text-[#0284C7] shrink-0" aria-hidden="true" />
                <span>Exam Paper PDF</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onOpenPdfStudio('single_topic', 'question_bank_with_answers', targetGuide)
                }
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#0F4C81] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#0c3d68] transition-colors whitespace-nowrap"
              >
                <FileDown className="h-4 w-4 text-sky-200 shrink-0" aria-hidden="true" />
                <span>Q-Bank + Key PDF</span>
              </button>
            </div>
          )}
        </div>

        {/* Select Saved Topic or Generate New Topic Bank */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-4 border-t border-slate-100 items-end">
          {studyGuides.length > 0 && (
            <div className="lg:col-span-5 min-w-0">
              <label
                htmlFor="qbank-topic-select"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                Active Study Topic ({studyGuides.length} available)
              </label>
              <select
                id="qbank-topic-select"
                value={targetGuide?.id || ''}
                onChange={(e) => {
                  const found = studyGuides.find((g) => g.id === e.target.value);
                  if (found) onSelectGuide(found);
                }}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0F4C81] focus:border-[#0F4C81] focus:outline-none"
              >
                {studyGuides.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.topic}
                  </option>
                ))}
              </select>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitTopic();
            }}
            className={studyGuides.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'}
          >
            <label
              htmlFor="qbank-new-topic-input"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              Generate Question Bank for Another Medical Topic
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="qbank-new-topic-input"
                  type="search"
                  value={topicInput}
                  onChange={(e) => onChangeTopicInput(e.target.value)}
                  placeholder="Enter medical topic (e.g., Acute Pancreatitis, Sepsis)..."
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isGenerating}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#0F4C81] bg-sky-50/70 px-4 py-2 text-xs sm:text-sm font-semibold text-[#0F4C81] hover:bg-sky-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Building...</span>
                  </>
                ) : (
                  <span>Generate Topic Bank</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Main Question Bank Workspace */}
      {!targetGuide || !compiledPack ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 text-center space-y-3">
          <h2 className="text-lg font-bold text-[#0F4C81]">
            Search a Medical Topic Above to Unlock Its 48-Item Question Bank
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Each generated medical topic automatically compiles 30 board-style MCQs, 10 written exam questions with marking rubrics, and 8 clinical cases.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 space-y-6">
          {/* Active Topic Banner & Assessment Tabs */}
          <div className="border-b border-slate-200 pb-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-mono text-slate-500 tabular-nums">
                  {targetGuide.textbookTitle} · Canonical Topic Pack
                </p>
                <h2 className="mt-0.5 font-serif text-xl sm:text-2xl font-bold text-[#0F4C81] break-words">
                  {targetGuide.topic}
                </h2>
              </div>

              {answeredCount > 0 && (
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                  <span className="rounded-lg bg-sky-50 px-3 py-1.5 font-semibold text-[#0F4C81]">
                    Score: {correctCount}/{answeredCount} ({accuracyPct}%)
                  </span>
                  <button
                    type="button"
                    onClick={() => setMcqSelections({})}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-sans font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reset</span>
                  </button>
                </div>
              )}
            </div>

            <div
              role="tablist"
              aria-label="Question bank sections"
              className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {(
                [
                  { id: 'mcqs', label: `MCQs (${mcqs.length})` },
                  { id: 'written', label: `Written Questions (${writtenQuestions.length})` },
                  { id: 'cases', label: `Clinical Cases (${clinicalCases.length})` },
                  { id: 'flashcards', label: `Flashcards (${flashcards.length})` },
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
                    className={`min-h-[42px] rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      active
                        ? 'bg-[#0F4C81] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SUB-TAB 1: 30 MCQs */}
          {activeSubTab === 'mcqs' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="group"
                  aria-label="Filter MCQs by difficulty"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {(
                    [
                      'ALL',
                      'Foundational',
                      'Clinical Application',
                      'Critical Thinking',
                    ] as const
                  ).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setDifficultyFilter(tier)}
                      className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        difficultyFilter === tier
                          ? 'bg-[#0F4C81] text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {tier === 'ALL' ? `All Tiers (${mcqs.length})` : tier}
                    </button>
                  ))}
                </div>

                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  Showing {filteredMcqs.length} question{filteredMcqs.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="divide-y divide-slate-200 border-t border-slate-200">
                {filteredMcqs.map((q) => {
                  const chosen = mcqSelections[q.id];
                  const isAnswered = typeof chosen === 'number';
                  const isTextbook =
                    q.sourceBasis === 'textbook' && q.pageNumbers.length > 0;

                  return (
                    <article key={q.id} className="py-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-[#0F4C81] tabular-nums">
                            MCQ #{q.number}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="font-semibold text-[#0284C7]">{q.difficulty}</span>
                        </div>

                        {isTextbook ? (
                          <button
                            type="button"
                            onClick={() => onOpenPage(q.pageNumbers[0])}
                            className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#0284C7] hover:underline tabular-nums"
                          >
                            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>Textbook {buildPageCitationLabel(q.pageNumbers)}</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                            <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>Supplementary Medical Knowledge</span>
                          </span>
                        )}
                      </div>

                      <p className="font-serif text-[16px] leading-relaxed text-slate-900 max-w-[76ch] break-words">
                        {q.stem}
                      </p>

                      <div className="space-y-2 max-w-[76ch]">
                        {q.options.map((optText, optIdx) => {
                          const letter = String.fromCharCode(65 + optIdx);
                          const isSelected = chosen === optIdx;
                          const isCorrect = optIdx === q.correctIndex;

                          let btnClass =
                            'border-slate-200 bg-[#F8FAFC] text-slate-800 hover:border-[#0284C7] hover:bg-sky-50/40';
                          if (isAnswered) {
                            if (isCorrect) {
                              btnClass =
                                'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-medium';
                            } else if (isSelected) {
                              btnClass = 'border-red-400 bg-red-50/70 text-red-950';
                            } else {
                              btnClass = 'border-slate-200 bg-white text-slate-500 opacity-80';
                            }
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() =>
                                setMcqSelections((prev) => ({ ...prev, [q.id]: optIdx }))
                              }
                              className={`w-full min-h-[48px] flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${btnClass}`}
                            >
                              <span className="flex items-start gap-2.5 min-w-0">
                                <span className="font-mono font-bold shrink-0 mt-0.5">
                                  {letter}.
                                </span>
                                <span className="leading-snug break-words">{optText}</span>
                              </span>
                              {isAnswered && isCorrect && (
                                <CheckCircle2
                                  className="h-4 w-4 text-emerald-700 shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                              {isAnswered && isSelected && !isCorrect && (
                                <XCircle
                                  className="h-4 w-4 text-red-700 shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {isAnswered && (
                        <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 max-w-[76ch] space-y-1.5 text-sm">
                          <p className="font-bold text-[#0F4C81]">
                            Correct Answer: {String.fromCharCode(65 + q.correctIndex)}
                          </p>
                          <p className="text-slate-700 leading-relaxed break-words">
                            {q.explanation}
                          </p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* SUB-TAB 2: 10 WRITTEN QUESTIONS */}
          {activeSubTab === 'written' && (
            <div className="divide-y divide-slate-200 border-t border-slate-200">
              {writtenQuestions.map((wq) => {
                const open = Boolean(revealedWritten[wq.id]);
                return (
                  <article key={wq.id} className="py-6 space-y-4 max-w-[78ch]">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#0F4C81] tabular-nums">
                        Written Q{wq.number}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-semibold text-[#0284C7]">{wq.commandVerb}</span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-slate-500">{wq.difficulty}</span>
                    </div>

                    <p className="font-serif text-[16px] font-semibold leading-relaxed text-slate-900 break-words">
                      {wq.prompt}
                    </p>

                    <div>
                      <label htmlFor={`draft-${wq.id}`} className="sr-only">
                        Practice written response for question {wq.number}
                      </label>
                      <textarea
                        id={`draft-${wq.id}`}
                        rows={3}
                        value={writtenDrafts[wq.id] || ''}
                        onChange={(e) =>
                          setWrittenDrafts((prev) => ({ ...prev, [wq.id]: e.target.value }))
                        }
                        placeholder="Draft your structured medical answer here before checking the marking rubric..."
                        className="w-full rounded-xl border border-slate-300 bg-[#F8FAFC] p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:bg-white focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() =>
                        setRevealedWritten((prev) => ({ ...prev, [wq.id]: !open }))
                      }
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#0F4C81] hover:bg-sky-50/50 transition-colors"
                    >
                      <span>{open ? 'Hide Model Answer & Rubric' : 'Reveal Model Answer & Rubric'}</span>
                      {open ? (
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>

                    {open && (
                      <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-3 text-sm">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-[#0F4C81] mb-1">
                            Model Answer
                          </p>
                          <p className="text-slate-800 leading-relaxed whitespace-pre-line break-words">
                            {wq.modelAnswer}
                          </p>
                        </div>

                        {wq.markingPoints.length > 0 && (
                          <div className="pt-2 border-t border-sky-200/70">
                            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800 mb-1.5">
                              Examiner Marking Checkpoints ({wq.totalMarks} marks)
                            </p>
                            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-slate-700">
                              {wq.markingPoints.map((mp, idx) => (
                                <li key={idx}>
                                  {mp.point}{' '}
                                  <span className="font-mono text-xs text-emerald-800">
                                    ({mp.marks}m)
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* SUB-TAB 3: 8 CLINICAL CASES */}
          {activeSubTab === 'cases' && (
            <div className="divide-y divide-slate-200 border-t border-slate-200">
              {clinicalCases.map((c) => {
                const open = Boolean(revealedCases[c.id]);
                return (
                  <article key={c.id} className="py-6 space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Stethoscope className="h-4 w-4 text-[#0F4C81] shrink-0" aria-hidden="true" />
                      <span className="font-mono font-bold text-[#0F4C81] tabular-nums">
                        Case #{c.number}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-semibold text-[#0284C7]">{c.difficulty}</span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-slate-900 break-words">
                      {c.title}
                    </h3>

                    <p className="font-serif text-[16px] leading-relaxed text-slate-800 max-w-[78ch] break-words">
                      {c.patientPresentation}
                    </p>

                    {c.vitalsAndLabs.length > 0 && (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-[#F8FAFC] max-w-[78ch]">
                        <table className="w-full min-w-[420px] text-left text-xs sm:text-sm tabular-nums">
                          <thead>
                            <tr className="border-b border-slate-200 bg-white text-[#0F4C81]">
                              <th className="py-2.5 px-3.5 font-bold">Parameter</th>
                              <th className="py-2.5 px-3.5 font-bold">Patient Value</th>
                              <th className="py-2.5 px-3.5 font-bold">Reference</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/80">
                            {c.vitalsAndLabs.map((vl, idx) => (
                              <tr key={idx}>
                                <td className="py-2 px-3.5 font-semibold text-slate-800">
                                  {vl.parameter}
                                </td>
                                <td
                                  className={`py-2 px-3.5 font-mono font-semibold ${
                                    vl.flag === 'critical' || vl.flag === 'high'
                                      ? 'text-red-700'
                                      : vl.flag === 'low'
                                        ? 'text-amber-800'
                                        : 'text-emerald-800'
                                  }`}
                                >
                                  {vl.value}
                                </td>
                                <td className="py-2 px-3.5 font-mono text-slate-500">
                                  {vl.referenceRange || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="space-y-3 max-w-[78ch]">
                      {c.progressiveQuestions.map((sq, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-200 bg-white p-4 space-y-2"
                        >
                          <p className="text-xs font-bold text-[#0284C7]">
                            {sq.partLabel} · {sq.focusArea}
                          </p>
                          <p className="text-sm font-semibold text-slate-900 break-words">
                            {sq.question}
                          </p>
                          {open && (
                            <div className="pt-2 border-t border-slate-100 space-y-1 text-xs sm:text-sm text-slate-700">
                              <p>
                                <strong className="text-[#0F4C81]">Answer: </strong>
                                {sq.modelAnswer}
                              </p>
                              <p className="text-slate-600">
                                <strong className="text-emerald-800">Rationale: </strong>
                                {sq.rationale}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() =>
                          setRevealedCases((prev) => ({ ...prev, [c.id]: !open }))
                        }
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c3d68] transition-colors"
                      >
                        <span>
                          {open ? 'Hide Case Solutions' : `Reveal Case #${c.number} Solutions`}
                        </span>
                      </button>
                      {open && c.clinicalPearl && (
                        <span className="text-xs font-medium text-emerald-900 max-w-xl">
                          <strong>Bedside Pearl:</strong> {c.clinicalPearl}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* SUB-TAB 4: FLASHCARDS */}
          {activeSubTab === 'flashcards' && (
            <div>
              {flashcards.length > 0 ? (
                <FlashcardsDeckSection
                  flashcards={flashcards}
                  mastery={targetGuide.flashcardMastery || {}}
                  languageMode={languageMode}
                  onUpdateMastery={onUpdateFlashcardMastery}
                  onOpenPage={(p) => onOpenPage(p)}
                />
              ) : (
                <p className="py-6 text-sm text-slate-600">
                  No flashcards recorded for this guide yet.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
