import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileDown,
  Flag,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Stethoscope,
  Video,
  XCircle,
} from 'lucide-react';
import type {
  ExamAssessmentMode,
  ExamSessionState,
  LectureProject,
  StudyGuide,
} from '../types/medical';
import { enrichStudyGuideWithBlueprint } from '../utils/medicalBlueprintEngine';
import {
  ACTIVE_EXAM_STORAGE_KEY,
  EXAM_HISTORY_STORAGE_KEY,
  checkAndAutoSubmitExpiredExam,
  createExamSession,
  evaluateSubmittedExam,
  formatExamClock,
  getRemainingExamSeconds,
  navigateExamQuestion,
  recordExamAnswer,
  resolveExamTopicGuide,
  submitExamSession,
  toggleExamQuestionFlag,
} from '../utils/timedExamEngine';

interface TimedExamsViewProps {
  activeGuide: StudyGuide | null;
  savedGuides: StudyGuide[];
  lectures: LectureProject[];
  onSelectActiveGuide: (guide: StudyGuide) => void;
  onSaveGuide?: (guide: StudyGuide) => Promise<void> | void;
  onOpenPdfStudio: () => void;
  onOpenLectureStudio: () => void;
}

interface StoredExamHistoryItem {
  id: string;
  topic: string;
  mode: ExamAssessmentMode;
  score: number;
  total: number;
  percentage: number;
  elapsedSeconds: number;
  autoSubmitted: boolean;
  completedAt: string;
}

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30] as const;
const DURATION_MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;

export const TimedExamsView: React.FC<TimedExamsViewProps> = ({
  activeGuide,
  savedGuides,
  lectures,
  onSelectActiveGuide,
  onSaveGuide,
  onOpenPdfStudio,
  onOpenLectureStudio,
}) => {
  // Configuration state
  const [selectedSourceType, setSelectedSourceType] = useState<
    'blueprint' | 'lecture' | 'custom'
  >(() => (activeGuide || savedGuides.length > 0 ? 'blueprint' : 'custom'));
  const [selectedGuideId, setSelectedGuideId] = useState<string>(
    () => activeGuide?.id || savedGuides[0]?.id || ''
  );
  const [selectedLectureId, setSelectedLectureId] = useState<string>(
    () => lectures[0]?.id || ''
  );
  const [customTopicInput, setCustomTopicInput] = useState<string>(
    () => activeGuide?.topic || ''
  );

  const [mode, setMode] = useState<ExamAssessmentMode>('exam');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [durationMinutes, setDurationMinutes] = useState<number>(15);
  const [supplementaryTab, setSupplementaryTab] = useState<
    'overview' | 'written' | 'cases'
  >('overview');
  const [revealedWrittenIds, setRevealedWrittenIds] = useState<Record<string, boolean>>(
    {}
  );
  const [revealedCaseIds, setRevealedCaseIds] = useState<Record<string, boolean>>({});

  // Active or submitted session persisted in localStorage
  const [session, setSession] = useState<ExamSessionState | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(ACTIVE_EXAM_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ExamSessionState;
      if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        return null;
      }
      return checkAndAutoSubmitExpiredExam(parsed, Date.now());
    } catch {
      return null;
    }
  });

  const [examHistory, setExamHistory] = useState<StoredExamHistoryItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(EXAM_HISTORY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredExamHistoryItem[]) : [];
    } catch {
      return [];
    }
  });

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [lastSavedAt, setLastSavedAt] = useState<string>('');

  // Keep selectedGuideId synchronized when activeGuide changes externally
  useEffect(() => {
    if (activeGuide) {
      setSelectedGuideId(activeGuide.id);
      setSelectedSourceType('blueprint');
    }
  }, [activeGuide]);

  // Persist active/submitted exam session automatically on every answer, flag, or navigation update
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (session) {
        window.localStorage.setItem(ACTIVE_EXAM_STORAGE_KEY, JSON.stringify(session));
        setLastSavedAt(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      } else {
        window.localStorage.removeItem(ACTIVE_EXAM_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota exceptions
    }
  }, [session]);

  // Live countdown ticker + automatic submission when countdown hits 00:00
  useEffect(() => {
    if (!session || session.status !== 'in_progress' || session.mode !== 'exam') {
      return;
    }
    const interval = window.setInterval(() => {
      const tick = Date.now();
      setNowMs(tick);
      setSession((prev) => {
        if (!prev || prev.status !== 'in_progress') return prev;
        const checked = checkAndAutoSubmitExpiredExam(prev, tick);
        if (checked.status === 'submitted' && prev.status === 'in_progress') {
          appendHistoryEntry(checked);
        }
        return checked;
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [session?.id, session?.status, session?.mode]);

  const appendHistoryEntry = (submitted: ExamSessionState) => {
    const scoreSummary = evaluateSubmittedExam(submitted);
    if (!scoreSummary) return;
    const item: StoredExamHistoryItem = {
      id: submitted.id,
      topic: submitted.topic,
      mode: submitted.mode,
      score: scoreSummary.correctCount,
      total: scoreSummary.totalQuestions,
      percentage: scoreSummary.percentage,
      elapsedSeconds: scoreSummary.elapsedSeconds,
      autoSubmitted: scoreSummary.autoSubmittedOnTimeout,
      completedAt: new Date(submitted.submittedAtMs || Date.now()).toLocaleDateString(
        'en-US',
        { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      ),
    };
    setExamHistory((prev) => {
      const deduped = [item, ...prev.filter((h) => h.id !== item.id)].slice(0, 12);
      try {
        window.localStorage.setItem(EXAM_HISTORY_STORAGE_KEY, JSON.stringify(deduped));
      } catch {
        // Ignore storage errors
      }
      return deduped;
    });
  };

  // Resolve target topic blueprint for setup & supplementary written/cases preview
  const resolvedTargetGuide = useMemo<StudyGuide | null>(() => {
    if (selectedSourceType === 'blueprint') {
      const found =
        savedGuides.find((g) => g.id === selectedGuideId) || activeGuide || savedGuides[0];
      return found ? enrichStudyGuideWithBlueprint(found) : null;
    }
    if (selectedSourceType === 'lecture') {
      const lec = lectures.find((l) => l.id === selectedLectureId) || lectures[0];
      if (!lec) return activeGuide ? enrichStudyGuideWithBlueprint(activeGuide) : null;
      return resolveExamTopicGuide(lec.topic, savedGuides, lectures);
    }
    const clean = customTopicInput.trim();
    if (clean.length >= 2) {
      return resolveExamTopicGuide(clean, savedGuides, lectures);
    }
    return activeGuide ? enrichStudyGuideWithBlueprint(activeGuide) : null;
  }, [
    selectedSourceType,
    selectedGuideId,
    selectedLectureId,
    customTopicInput,
    activeGuide,
    savedGuides,
    lectures,
  ]);

  const handleStartExam = async () => {
    let targetGuide = resolvedTargetGuide;
    if (!targetGuide) {
      targetGuide = resolveExamTopicGuide('Heart Failure', savedGuides, lectures);
    }
    const enriched = enrichStudyGuideWithBlueprint(targetGuide);
    onSelectActiveGuide(enriched);
    const existsInSaved = savedGuides.some((g) => g.id === enriched.id);
    if (!existsInSaved && onSaveGuide) {
      await onSaveGuide(enriched);
    }

    const newSession = createExamSession({
      guide: enriched,
      mode,
      questionCount,
      durationMinutes,
      lectureId: selectedSourceType === 'lecture' ? selectedLectureId : undefined,
      nowMs: Date.now(),
    });
    setNowMs(Date.now());
    setSession(newSession);
  };

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    setSession((prev) =>
      prev ? recordExamAnswer(prev, questionId, optionIndex) : null
    );
  };

  const handleToggleFlag = (questionId: string) => {
    setSession((prev) =>
      prev ? toggleExamQuestionFlag(prev, questionId) : null
    );
  };

  const handleNavigateQuestion = (idx: number) => {
    setSession((prev) => (prev ? navigateExamQuestion(prev, idx) : null));
  };

  const handleManualSubmit = () => {
    if (!session || session.status !== 'in_progress') return;
    const submitted = submitExamSession(session, {
      autoSubmittedOnTimeout: false,
      nowMs: Date.now(),
    });
    setSession(submitted);
    appendHistoryEntry(submitted);
  };

  const handleExitOrNewExam = () => {
    setSession(null);
  };

  const remainingSeconds = session ? getRemainingExamSeconds(session, nowMs) : null;
  const submittedSummary = session ? evaluateSubmittedExam(session) : null;
  const activeQuestion =
    session && session.questions[session.currentIndex]
      ? session.questions[session.currentIndex]
      : null;

  // ============================================================================
  // 1. ACTIVE EXAM RUNNER (STRICT PRE-SUBMISSION CONFIDENTIALITY)
  // ============================================================================
  if (session && session.status === 'in_progress' && activeQuestion) {
    const answeredCount = Object.keys(session.answers).length;
    const isFlagged = session.flaggedQuestionIds.includes(activeQuestion.id);
    const selectedOption = session.answers[activeQuestion.id];
    const isUrgent =
      remainingSeconds !== null && remainingSeconds <= 60;
    const isWarning =
      remainingSeconds !== null && remainingSeconds > 60 && remainingSeconds <= 180;

    return (
      <div className="space-y-4">
        {/* Top Sticky Exam Control Bar */}
        <section className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#0F4C81] px-2 py-0.5 text-[11px] font-bold text-white">
                  {session.mode === 'exam' ? 'TIMED EXAM MODE' : 'PRACTICE MODE (UNTIMED)'}
                </span>
                <span className="text-xs font-semibold text-slate-600 tabular-nums">
                  Answered {answeredCount} / {session.questions.length}
                </span>
                {lastSavedAt && (
                  <span className="text-[11px] text-emerald-700 font-medium">
                    Auto-saved {lastSavedAt}
                  </span>
                )}
              </div>
              <h2 className="mt-1 text-base sm:text-lg font-bold text-[#0F4C81] truncate">
                {session.topic}
              </h2>
            </div>

            <div className="flex items-center gap-2.5">
              {session.mode === 'exam' && remainingSeconds !== null ? (
                <div
                  aria-live="polite"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold tabular-nums ${
                    isUrgent
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : isWarning
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-sky-200 bg-sky-50/70 text-[#0F4C81]'
                  }`}
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>{formatExamClock(remainingSeconds)}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span>Untimed</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleManualSubmit}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg bg-[#0F4C81] hover:bg-[#0C3B66] px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Submit Exam
              </button>
            </div>
          </div>

          {/* Numbered Question Navigation Palette */}
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
              <span className="font-semibold text-slate-700">
                Question Navigator (Click any item to jump freely)
              </span>
              <span>
                Flagged: <strong className="tabular-nums">{session.flaggedQuestionIds.length}</strong>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {session.questions.map((q, idx) => {
                const isCurrent = idx === session.currentIndex;
                const isAnswered = typeof session.answers[q.id] === 'number';
                const qFlagged = session.flaggedQuestionIds.includes(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleNavigateQuestion(idx)}
                    aria-label={`Jump to question ${idx + 1}`}
                    className={`min-w-[36px] h-9 px-2 rounded-lg text-xs font-bold tabular-nums border transition-all cursor-pointer ${
                      isCurrent
                        ? 'border-[#0F4C81] bg-[#0F4C81] text-white ring-2 ring-sky-200'
                        : qFlagged
                          ? 'border-amber-300 bg-amber-50 text-amber-900'
                          : isAnswered
                            ? 'border-sky-300 bg-sky-50 text-[#0F4C81]'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Active Single-Best-Answer Question Card (Zero Explanations or Answer Reveals!) */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-[#0F4C81] tabular-nums">
                Question {session.currentIndex + 1} of {session.questions.length}
              </span>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                {activeQuestion.discipline}
              </span>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {activeQuestion.difficulty}
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleToggleFlag(activeQuestion.id)}
              className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                isFlagged
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              {isFlagged ? 'Flagged for Review' : 'Flag for Review'}
            </button>
          </div>

          <p className="text-sm sm:text-base font-semibold text-slate-900 leading-relaxed">
            {activeQuestion.stem}
          </p>

          <div className="space-y-2.5">
            {activeQuestion.options.map((opt, optIdx) => {
              const letter = String.fromCharCode(65 + optIdx);
              const isChosen = selectedOption === optIdx;
              return (
                <button
                  key={optIdx}
                  type="button"
                  onClick={() => handleSelectOption(activeQuestion.id, optIdx)}
                  className={`w-full min-h-[48px] text-left rounded-xl border p-3.5 text-xs sm:text-sm transition-all flex items-start gap-3 cursor-pointer ${
                    isChosen
                      ? 'border-[#0284C7] bg-sky-50/80 text-slate-900 font-semibold ring-1 ring-[#0284C7]'
                      : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50/70 text-slate-800'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                      isChosen
                        ? 'bg-[#0F4C81] text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {letter}
                  </span>
                  <span className="pt-0.5 leading-relaxed">{opt}</span>
                </button>
              );
            })}
          </div>

          {/* Bottom Question Navigation Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={session.currentIndex === 0}
              onClick={() => handleNavigateQuestion(session.currentIndex - 1)}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <span className="text-xs text-slate-500">
              Scores and explanations are revealed after submission.
            </span>

            {session.currentIndex < session.questions.length - 1 ? (
              <button
                type="button"
                onClick={() => handleNavigateQuestion(session.currentIndex + 1)}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] px-4 py-2 text-xs sm:text-sm font-semibold text-white cursor-pointer"
              >
                Next Question
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleManualSubmit}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg bg-[#0F4C81] hover:bg-[#0C3B66] px-4 py-2 text-xs sm:text-sm font-semibold text-white cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Finish & Submit Exam
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  // ============================================================================
  // 2. POST-SUBMISSION SCORE & EXPLANATION REVIEW
  // ============================================================================
  if (session && session.status === 'submitted' && submittedSummary) {
    return (
      <div className="space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  <Award className="w-3.5 h-3.5" />
                  Exam Submitted
                </span>
                {submittedSummary.autoSubmittedOnTimeout && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-300 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Auto-Submitted When Timer Expired
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-[#0F4C81]">
                {session.topic} — Assessment Results
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                Completed in {formatExamClock(submittedSummary.elapsedSeconds)} ·{' '}
                {session.mode === 'exam' ? 'Timed Exam Mode' : 'Untimed Practice Mode'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExitOrNewExam}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg bg-[#0F4C81] hover:bg-[#0C3B66] px-4 py-2 text-xs sm:text-sm font-semibold text-white cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Configure New Exam
              </button>
              <button
                type="button"
                onClick={onOpenLectureStudio}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#0F4C81] cursor-pointer"
              >
                <Video className="w-4 h-4 text-[#0284C7]" />
                3D Lecture
              </button>
              <button
                type="button"
                onClick={onOpenPdfStudio}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer"
              >
                <FileDown className="w-4 h-4 text-[#0284C7]" />
                Study PDF
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Final Score
              </p>
              <p className="mt-1 text-2xl font-bold text-[#0F4C81] tabular-nums">
                {submittedSummary.correctCount} / {submittedSummary.totalQuestions} (
                {submittedSummary.percentage}%)
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                Correct Answers
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-800 tabular-nums">
                {submittedSummary.correctCount}
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">
                Incorrect
              </p>
              <p className="mt-1 text-2xl font-bold text-rose-800 tabular-nums">
                {submittedSummary.incorrectCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Unanswered
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">
                {submittedSummary.unansweredCount}
              </p>
            </div>
          </div>
        </section>

        {/* Detailed Answer Key & Explanations */}
        <section className="space-y-3">
          <h3 className="text-sm sm:text-base font-bold text-[#0F4C81]">
            Complete Answer Key & Medical Explanations
          </h3>
          {session.questions.map((q, idx) => {
            const chosen = session.answers[q.id];
            const isAnswered = typeof chosen === 'number';
            const isCorrect = isAnswered && chosen === q.correctIndex;
            return (
              <article
                key={q.id}
                className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#0F4C81] tabular-nums">
                      Q{idx + 1}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {q.discipline} · {q.difficulty}
                    </span>
                    <span className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600">
                      {q.sourceBasis === 'textbook' && q.pageNumbers.length > 0
                        ? `Uploaded Textbook (p. ${q.pageNumbers.join(', ')})`
                        : 'General Medical Knowledge'}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-bold ${
                      isCorrect
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : isAnswered
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                    }`}
                  >
                    {isCorrect ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Correct
                      </>
                    ) : isAnswered ? (
                      <>
                        <XCircle className="w-3.5 h-3.5" />
                        Incorrect
                      </>
                    ) : (
                      'Unanswered'
                    )}
                  </span>
                </div>

                <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                  {q.stem}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {q.options.map((opt, optIdx) => {
                    const letter = String.fromCharCode(65 + optIdx);
                    const isRight = optIdx === q.correctIndex;
                    const isUserPick = chosen === optIdx;
                    return (
                      <div
                        key={optIdx}
                        className={`rounded-lg border p-2.5 text-xs flex items-start gap-2 ${
                          isRight
                            ? 'border-emerald-400 bg-emerald-50/80 text-emerald-950 font-semibold'
                            : isUserPick
                              ? 'border-rose-300 bg-rose-50/80 text-rose-950 font-medium'
                              : 'border-slate-200 bg-slate-50/50 text-slate-700'
                        }`}
                      >
                        <span className="font-bold shrink-0">{letter}.</span>
                        <span>{opt}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs text-slate-800 leading-relaxed">
                  <strong className="text-[#0F4C81]">Explanation: </strong>
                  {q.explanation}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    );
  }

  // ============================================================================
  // 3. EXAM BUILDER & SUPPLEMENTARY WRITTEN / CLINICAL CASES BANK
  // ============================================================================
  const blueprint = resolvedTargetGuide?.blueprint || null;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0284C7]">
              <ClipboardCheck className="w-4 h-4" />
              <span>Unified Medical Topic Blueprint Assessment</span>
            </div>
            <h1 className="mt-0.5 text-lg sm:text-xl font-bold text-[#0F4C81]">
              Medical Exams & Practice Assessments
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Configure a timed countdown exam or untimed practice session for any medical
              topic, saved blueprint, or 3D lecture. Scores and explanations appear strictly
              after submission.
            </p>
          </div>

          {resolvedTargetGuide && (
            <button
              type="button"
              onClick={onOpenPdfStudio}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3.5 py-2 text-xs font-semibold text-[#0F4C81] shrink-0 cursor-pointer"
            >
              <FileDown className="w-4 h-4 text-[#0284C7]" />
              Export 48-Question Exam PDF
            </button>
          )}
        </div>

        {/* Step 1: Select Topic Source */}
        <div className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            1. Select Medical Topic or Lecture
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSelectedSourceType('blueprint')}
              disabled={savedGuides.length === 0 && !activeGuide}
              className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-semibold text-left flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-45 ${
                selectedSourceType === 'blueprint'
                  ? 'border-[#0284C7] bg-sky-50/70 text-[#0F4C81]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <BookOpen className="w-4 h-4 text-[#0284C7] shrink-0" />
              <span>Saved Topic Blueprint ({savedGuides.length || (activeGuide ? 1 : 0)})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSourceType('lecture')}
              disabled={lectures.length === 0}
              className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-semibold text-left flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-45 ${
                selectedSourceType === 'lecture'
                  ? 'border-[#0284C7] bg-sky-50/70 text-[#0F4C81]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Video className="w-4 h-4 text-[#0284C7] shrink-0" />
              <span>Saved 3D Lecture ({lectures.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSourceType('custom')}
              className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-semibold text-left flex items-center gap-2 transition-colors cursor-pointer ${
                selectedSourceType === 'custom'
                  ? 'border-[#0284C7] bg-sky-50/70 text-[#0F4C81]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-4 h-4 text-[#0284C7] shrink-0" />
              <span>Enter Any Medical Topic</span>
            </button>
          </div>

          {selectedSourceType === 'blueprint' && (savedGuides.length > 0 || activeGuide) && (
            <select
              aria-label="Select saved medical topic blueprint"
              value={selectedGuideId}
              onChange={(e) => setSelectedGuideId(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-[#0284C7] focus:outline-none"
            >
              {(savedGuides.length > 0 ? savedGuides : activeGuide ? [activeGuide] : []).map(
                (g) => (
                  <option key={g.id} value={g.id}>
                    {g.topic} —{' '}
                    {g.coverage === 'none'
                      ? 'General Medical Knowledge'
                      : `Textbook Grounded (${g.coverage})`}
                  </option>
                )
              )}
            </select>
          )}

          {selectedSourceType === 'lecture' && lectures.length > 0 && (
            <select
              aria-label="Select saved 3D lecture"
              value={selectedLectureId}
              onChange={(e) => setSelectedLectureId(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-[#0284C7] focus:outline-none"
            >
              {lectures.map((lec) => (
                <option key={lec.id} value={lec.id}>
                  {lec.title} ({lec.topic})
                </option>
              ))}
            </select>
          )}

          {selectedSourceType === 'custom' && (
            <input
              type="text"
              value={customTopicInput}
              onChange={(e) => setCustomTopicInput(e.target.value)}
              placeholder="Enter any medical topic (e.g., Peptic Ulcer Disease, Heart Failure, Acute Appendicitis)..."
              className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0284C7] focus:outline-none"
            />
          )}
        </div>

        {/* Step 2: Mode, Question Count, and Duration */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Mode */}
          <div className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Assessment Mode
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('exam')}
                className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  mode === 'exam'
                    ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Exam Mode (Timed)
              </button>
              <button
                type="button"
                onClick={() => setMode('practice')}
                className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  mode === 'practice'
                    ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Practice (Untimed)
              </button>
            </div>
          </div>

          {/* Question Count */}
          <div className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              3. Number of Questions
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUESTION_COUNT_OPTIONS.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setQuestionCount(cnt)}
                  className={`min-h-[44px] flex-1 min-w-[46px] rounded-lg border text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                    questionCount === cnt
                      ? 'border-[#0284C7] bg-sky-50 text-[#0F4C81]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              4. Exam Duration (Minutes)
            </span>
            {mode === 'exam' ? (
              <div className="flex items-center gap-2">
                <select
                  aria-label="Exam duration minutes"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 15)}
                  className="flex-1 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-900 tabular-nums"
                >
                  {DURATION_MINUTE_OPTIONS.map((min) => (
                    <option key={min} value={min}>
                      {min} minutes
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={180}
                  aria-label="Custom duration in minutes"
                  value={durationMinutes}
                  onChange={(e) =>
                    setDurationMinutes(
                      Math.max(1, Math.min(180, Number(e.target.value) || 1))
                    )
                  }
                  className="w-20 min-h-[44px] rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs sm:text-sm font-bold text-slate-900 tabular-nums"
                />
              </div>
            ) : (
              <div className="min-h-[44px] flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600">
                No time limit in Practice Mode (answers still revealed on submission).
              </div>
            )}
          </div>
        </div>

        {/* Start Button + Provenance Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-600">
            {blueprint ? (
              <span>
                Ready Blueprint: <strong className="text-[#0F4C81]">{blueprint.canonicalTitle}</strong>{' '}
                · 30 MCQs, 10 Written Questions & 8 Clinical Cases available.
              </span>
            ) : (
              <span>Enter any medical topic above to start an exam immediately.</span>
            )}
          </div>

          <button
            type="button"
            onClick={handleStartExam}
            className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F4C81] hover:bg-[#0C3B66] px-6 py-2.5 text-sm font-bold text-white shadow-xs transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            Start {mode === 'exam' ? `${durationMinutes}-Min Timed Exam` : 'Practice Session'} (
            {questionCount} MCQs)
          </button>
        </div>
      </section>

      {/* Supplementary Written Questions, Clinical Cases & Past Exam History */}
      {blueprint && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#0F4C81]">
                {blueprint.canonicalTitle} — Written Questions & Clinical Cases
              </h2>
              <p className="text-xs text-slate-600">
                Generated from the same Unified Medical Topic Blueprint as the Tutor, 3D
                Lecture, and Study PDF.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSupplementaryTab('overview')}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  supplementaryTab === 'overview'
                    ? 'bg-[#0F4C81] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Recent Attempts ({examHistory.length})
              </button>
              <button
                type="button"
                onClick={() => setSupplementaryTab('written')}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  supplementaryTab === 'written'
                    ? 'bg-[#0F4C81] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Written Questions ({blueprint.questionBank.writtenQuestions.length})
              </button>
              <button
                type="button"
                onClick={() => setSupplementaryTab('cases')}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  supplementaryTab === 'cases'
                    ? 'bg-[#0F4C81] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Clinical Cases ({blueprint.questionBank.clinicalCases.length})
              </button>
            </div>
          </div>

          {supplementaryTab === 'overview' && (
            <div>
              {examHistory.length === 0 ? (
                <p className="text-xs sm:text-sm text-slate-500 py-4">
                  No completed exams recorded yet. Configure and start an exam above to track
                  your performance across medical topics.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {examHistory.map((item) => (
                    <div
                      key={item.id}
                      className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-900">{item.topic}</p>
                        <p className="text-slate-500">
                          {item.mode === 'exam' ? 'Timed Exam' : 'Practice'} ·{' '}
                          {item.completedAt}
                          {item.autoSubmitted ? ' · Auto-submitted' : ''}
                        </p>
                      </div>
                      <span className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-1 font-bold text-[#0F4C81] tabular-nums">
                        {item.score} / {item.total} ({item.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {supplementaryTab === 'written' && (
            <div className="space-y-3">
              {blueprint.questionBank.writtenQuestions.map((wq) => {
                const open = Boolean(revealedWrittenIds[wq.id]);
                return (
                  <div
                    key={wq.id}
                    className="rounded-xl border border-slate-200 p-3.5 sm:p-4 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0F4C81]">
                        Written Q{wq.number} · {wq.commandVerb} ({wq.totalMarks} Marks)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedWrittenIds((prev) => ({
                            ...prev,
                            [wq.id]: !open,
                          }))
                        }
                        className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1 text-xs font-semibold text-[#0F4C81] cursor-pointer"
                      >
                        {open ? 'Hide Rubric & Answer' : 'Show Rubric & Model Answer'}
                      </button>
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-slate-900">
                      {wq.prompt}
                    </p>
                    {open && (
                      <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 text-xs space-y-2">
                        <ul className="list-disc pl-4 space-y-1 text-slate-700">
                          {wq.markingPoints.map((mp, idx) => (
                            <li key={idx}>
                              {mp.point} <strong>({mp.marks}m)</strong>
                            </li>
                          ))}
                        </ul>
                        <p className="text-slate-800 pt-1 border-t border-sky-100">
                          <strong className="text-[#0F4C81]">Model Answer: </strong>
                          {wq.modelAnswer}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {supplementaryTab === 'cases' && (
            <div className="space-y-3">
              {blueprint.questionBank.clinicalCases.map((cs) => {
                const open = Boolean(revealedCaseIds[cs.id]);
                return (
                  <div
                    key={cs.id}
                    className="rounded-xl border border-slate-200 p-3.5 sm:p-4 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F4C81]">
                        <Stethoscope className="w-3.5 h-3.5 text-[#0284C7]" />
                        Case {cs.number}: {cs.title}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedCaseIds((prev) => ({
                            ...prev,
                            [cs.id]: !open,
                          }))
                        }
                        className="min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1 text-xs font-semibold text-[#0F4C81] cursor-pointer"
                      >
                        {open ? 'Hide Case Solutions' : 'Show Progressive Answers'}
                      </button>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                      {cs.patientPresentation}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {cs.vitalsAndLabs.map((vl, idx) => (
                        <span
                          key={idx}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 tabular-nums"
                        >
                          {vl.parameter}: <strong>{vl.value}</strong>
                        </span>
                      ))}
                    </div>
                    <div className="space-y-2 pt-1">
                      {cs.progressiveQuestions.map((pq, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs space-y-1"
                        >
                          <p className="font-semibold text-slate-900">
                            {pq.partLabel} ({pq.focusArea}): {pq.question}
                          </p>
                          {open && (
                            <p className="text-slate-700 pt-1">
                              <strong className="text-[#0F4C81]">Answer: </strong>
                              {pq.modelAnswer} — <em>{pq.rationale}</em>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
