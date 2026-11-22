import type {
  ExamAssessmentMode,
  ExamQuestionItem,
  ExamSessionState,
  LectureProject,
  StudyGuide,
} from '../types/medical';
import { buildMultiBookOfflineFallbackGuide } from './multiBookEngine';
import {
  buildMedicalTopicBlueprint,
  enrichStudyGuideWithBlueprint,
} from './medicalBlueprintEngine';
import { canonicalizeMedicalTopic } from './topicCanonicalizer';

export const ACTIVE_EXAM_STORAGE_KEY = 'medatlas_active_exam_session_v1';
export const EXAM_HISTORY_STORAGE_KEY = 'medatlas_exam_history_v1';

export interface StartExamOptions {
  guide: StudyGuide;
  mode: ExamAssessmentMode;
  questionCount: number;
  durationMinutes: number;
  lectureId?: string;
  nowMs?: number;
}

export interface ExamScoreSummary {
  totalQuestions: number;
  answeredCount: number;
  unansweredCount: number;
  correctCount: number;
  incorrectCount: number;
  percentage: number;
  elapsedSeconds: number;
  autoSubmittedOnTimeout: boolean;
}

/**
 * Resolves or synthesizes a unified Blueprint-backed StudyGuide for any medical topic
 * (including saved guides, saved lecture topics, or brand-new user-entered topics).
 */
export function resolveExamTopicGuide(
  topicOrGuide: StudyGuide | string,
  savedGuides: StudyGuide[] = [],
  lectures: LectureProject[] = []
): StudyGuide {
  if (typeof topicOrGuide !== 'string') {
    return enrichStudyGuideWithBlueprint(topicOrGuide);
  }

  const cleanTopic = topicOrGuide.trim() || 'Heart Failure';
  const canon = canonicalizeMedicalTopic(cleanTopic);

  const matchingGuide = savedGuides.find(
    (g) =>
      (g.canonicalTopicId || canonicalizeMedicalTopic(g.topic).canonicalTopicId) ===
      canon.canonicalTopicId
  );
  if (matchingGuide) {
    return enrichStudyGuideWithBlueprint(matchingGuide);
  }

  const matchingLecture = lectures.find(
    (l) =>
      (l.canonicalTopicId || canonicalizeMedicalTopic(l.topic).canonicalTopicId) ===
      canon.canonicalTopicId
  );

  const nowIso = new Date().toISOString();
  const offlineBody = buildMultiBookOfflineFallbackGuide(
    [],
    matchingLecture?.topic || canon.canonicalTitle
  );
  const fullGuide: StudyGuide = {
    ...offlineBody,
    id: `guide-exam-${canon.canonicalTopicId}`,
    createdAt: nowIso,
    updatedAt: nowIso,
    answers: {},
  };
  return enrichStudyGuideWithBlueprint(fullGuide);
}

/**
 * Selects N unique, topic-locked MCQs evenly across the 30-item canonical blueprint question bank.
 */
export function selectExamQuestionsFromGuide(
  guide: StudyGuide,
  requestedCount: number
): ExamQuestionItem[] {
  const blueprint = guide.blueprint || buildMedicalTopicBlueprint(guide);
  const fullPool = blueprint.questionBank.mcqs;
  if (fullPool.length === 0) return [];

  const targetCount = Math.max(1, Math.min(fullPool.length, Math.round(requestedCount) || 10));
  if (targetCount >= fullPool.length) {
    return fullPool.map((q, idx) => ({ ...q, number: idx + 1 }));
  }

  const selected: ExamQuestionItem[] = [];
  const usedIds = new Set<string>();
  const step = fullPool.length / targetCount;

  for (let i = 0; i < targetCount; i++) {
    const candidateIdx = Math.min(fullPool.length - 1, Math.floor(i * step));
    const item = fullPool[candidateIdx];
    if (item && !usedIds.has(item.id)) {
      usedIds.add(item.id);
      selected.push(item);
    }
  }

  for (const item of fullPool) {
    if (selected.length >= targetCount) break;
    if (!usedIds.has(item.id)) {
      usedIds.add(item.id);
      selected.push(item);
    }
  }

  return selected.slice(0, targetCount).map((q, idx) => ({
    ...q,
    number: idx + 1,
  }));
}

export function createExamSession(options: StartExamOptions): ExamSessionState {
  const {
    guide,
    mode,
    questionCount,
    durationMinutes,
    lectureId,
    nowMs = Date.now(),
  } = options;
  const enriched = enrichStudyGuideWithBlueprint(guide);
  const blueprint = enriched.blueprint!;
  const questions = selectExamQuestionsFromGuide(enriched, questionCount);
  const safeDurationMin = Math.max(1, Math.min(180, Math.round(durationMinutes) || 15));

  return {
    id: `exam-${blueprint.canonicalTopicId}-${nowMs}`,
    topic: blueprint.canonicalTitle,
    canonicalTopicId: blueprint.canonicalTopicId,
    sourceGuideId: enriched.id,
    sourceLectureId: lectureId,
    mode,
    status: 'in_progress',
    questionCount: questions.length,
    durationSeconds: mode === 'exam' ? safeDurationMin * 60 : 0,
    startedAtMs: nowMs,
    expiresAtMs: mode === 'exam' ? nowMs + safeDurationMin * 60 * 1000 : null,
    submittedAtMs: null,
    autoSubmittedOnTimeout: false,
    currentIndex: 0,
    questions,
    answers: {},
    flaggedQuestionIds: [],
  };
}

export function recordExamAnswer(
  session: ExamSessionState,
  questionId: string,
  optionIndex: number
): ExamSessionState {
  if (session.status !== 'in_progress') return session;
  if (optionIndex < 0 || optionIndex > 3) return session;
  return {
    ...session,
    answers: {
      ...session.answers,
      [questionId]: optionIndex,
    },
  };
}

export function toggleExamQuestionFlag(
  session: ExamSessionState,
  questionId: string
): ExamSessionState {
  if (session.status !== 'in_progress') return session;
  const exists = session.flaggedQuestionIds.includes(questionId);
  return {
    ...session,
    flaggedQuestionIds: exists
      ? session.flaggedQuestionIds.filter((id) => id !== questionId)
      : [...session.flaggedQuestionIds, questionId],
  };
}

export function navigateExamQuestion(
  session: ExamSessionState,
  targetIndex: number
): ExamSessionState {
  if (session.questions.length === 0) return session;
  const clamped = Math.max(0, Math.min(session.questions.length - 1, targetIndex));
  return {
    ...session,
    currentIndex: clamped,
  };
}

export function getRemainingExamSeconds(
  session: ExamSessionState,
  nowMs = Date.now()
): number | null {
  if (session.mode !== 'exam' || session.expiresAtMs === null) {
    return null;
  }
  if (session.status === 'submitted') {
    const endMs = session.submittedAtMs ?? nowMs;
    return Math.max(0, Math.ceil((session.expiresAtMs - endMs) / 1000));
  }
  return Math.max(0, Math.ceil((session.expiresAtMs - nowMs) / 1000));
}

export function submitExamSession(
  session: ExamSessionState,
  options: { autoSubmittedOnTimeout?: boolean; nowMs?: number } = {}
): ExamSessionState {
  if (session.status === 'submitted') return session;
  const nowMs = options.nowMs ?? Date.now();
  return {
    ...session,
    status: 'submitted',
    submittedAtMs: nowMs,
    autoSubmittedOnTimeout: Boolean(options.autoSubmittedOnTimeout),
  };
}

/**
 * Checks if a timed exam has reached or passed its expiry timestamp and auto-submits if so.
 */
export function checkAndAutoSubmitExpiredExam(
  session: ExamSessionState,
  nowMs = Date.now()
): ExamSessionState {
  if (
    session.status === 'in_progress' &&
    session.mode === 'exam' &&
    session.expiresAtMs !== null &&
    nowMs >= session.expiresAtMs
  ) {
    return submitExamSession(session, {
      autoSubmittedOnTimeout: true,
      nowMs: session.expiresAtMs,
    });
  }
  return session;
}

/**
 * Computes exam score ONLY after submission (`status === 'submitted'`).
 * Returns null while `status === 'in_progress'` so scores/answers are never leaked mid-exam.
 */
export function evaluateSubmittedExam(
  session: ExamSessionState
): ExamScoreSummary | null {
  if (session.status !== 'submitted') {
    return null;
  }
  const totalQuestions = session.questions.length;
  let answeredCount = 0;
  let correctCount = 0;

  for (const q of session.questions) {
    const chosen = session.answers[q.id];
    if (typeof chosen === 'number') {
      answeredCount += 1;
      if (chosen === q.correctIndex) {
        correctCount += 1;
      }
    }
  }

  const unansweredCount = Math.max(0, totalQuestions - answeredCount);
  const incorrectCount = Math.max(0, answeredCount - correctCount);
  const percentage =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const endMs = session.submittedAtMs ?? Date.now();
  const elapsedSeconds = Math.max(1, Math.round((endMs - session.startedAtMs) / 1000));

  return {
    totalQuestions,
    answeredCount,
    unansweredCount,
    correctCount,
    incorrectCount,
    percentage,
    elapsedSeconds,
    autoSubmittedOnTimeout: session.autoSubmittedOnTimeout,
  };
}

export function formatExamClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
