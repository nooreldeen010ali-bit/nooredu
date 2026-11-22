/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiAssistantView } from './components/AiAssistantView';
import { CloudSyncView } from './components/CloudSyncView';
import { EvidenceHubView } from './components/EvidenceHubView';
import { Header, type ActiveTab } from './components/Header';
import { HomeDashboardView } from './components/HomeDashboardView';
import { LectureStudioView } from './components/LectureStudioView';
import { MobileBottomNav } from './components/MobileBottomNav';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PageReaderModal } from './components/PageReaderModal';
import { SavedGuidesView } from './components/SavedGuidesView';
import { StudyPdfStudioModal } from './components/StudyPdfStudioModal';
import { TextbookLibraryView } from './components/TextbookLibraryView';
import { TimedExamsView } from './components/TimedExamsView';
import { TutorWorkspace } from './components/TutorWorkspace';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import type {
  BookUploadProgress,
  CloudSyncState,
  ExternalEvidenceItem,
  LectureProject,
  MedicalTextbook,
  PdfDocumentExportMode,
  PdfExportScope,
  StudyGuide,
} from './types/medical';
import {
  deleteLectureOffline,
  loadSavedLectures,
  saveLectureOffline,
} from './utils/lectureStorage';
import {
  buildLectureFromChapter,
  buildLectureFromStudyGuide,
  INITIAL_SAMPLE_LECTURE,
} from './utils/lectureStudioEngine';
import { enrichStudyGuideWithBlueprint } from './utils/medicalBlueprintEngine';
import {
  buildMultiBookOfflineFallbackGuide,
  retrieveAcrossTextbooks,
  sanitizeMultiBookStudyGuideResponse,
} from './utils/multiBookEngine';
import { parseUploadedPdf } from './utils/pdfParser';
import {
  getLastSyncedAt,
  getOrCreateWorkspaceKey,
  loadOfflineLibrary,
  pullLibraryFromCloud,
  pushLibraryToCloud,
  removeStudyGuideOffline,
  removeTextbookOffline,
  saveStudyGuideOffline,
  saveTextbookOffline,
  setWorkspaceKey,
} from './utils/storageVault';
import { validateTopicInput } from './utils/textbookEngine';
import { canonicalizeMedicalTopic } from './utils/topicCanonicalizer';

export default function App() {
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('tab');
      if (q === 'saved') return 'pdfs';
      if (q === 'qbank') return 'exams';
      if (
        q === 'home' ||
        q === 'tutor' ||
        q === 'lecture' ||
        q === 'library' ||
        q === 'pdfs' ||
        q === 'exams' ||
        q === 'research' ||
        q === 'guidelines' ||
        q === 'assistant' ||
        q === 'sync'
      ) {
        return q;
      }
    }
    return 'home';
  });
  const [textbooks, setTextbooks] = useState<MedicalTextbook[]>([]);
  const [selectedTextbookIds, setSelectedTextbookIds] = useState<string[]>([]);
  const [uploadQueue, setUploadQueue] = useState<BookUploadProgress[]>([]);
  const [studyGuides, setStudyGuides] = useState<StudyGuide[]>([]);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const [savedLectures, setSavedLectures] = useState<LectureProject[]>([
    INITIAL_SAMPLE_LECTURE,
  ]);
  const [activeLectureId, setActiveLectureId] = useState<string>(
    INITIAL_SAMPLE_LECTURE.id
  );

  const [topicInput, setTopicInput] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isEnrichingArabic, setIsEnrichingArabic] = useState<boolean>(false);

  const [workspaceKey, setWorkspaceKeyState] = useState<string>(() =>
    getOrCreateWorkspaceKey()
  );
  const [syncState, setSyncState] = useState<CloudSyncState>('synced');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => getLastSyncedAt());

  const [readerState, setReaderState] = useState<{
    book: MedicalTextbook;
    pageNumber: number;
    highlightTopic?: string;
  } | null>(null);

  const [pdfStudioState, setPdfStudioState] = useState<{
    isOpen: boolean;
    scope: PdfExportScope;
    exportMode: PdfDocumentExportMode;
    bookId?: string;
  }>({
    isOpen: false,
    scope: 'single_topic',
    exportMode: 'full_study_guide',
  });

  // Stable ref to activeGuideId so stable callbacks never recreate and trigger child useEffect loops
  const activeGuideIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeGuideIdRef.current = activeGuideId;
  }, [activeGuideId]);

  const syncToCloudQuietly = useCallback(
    async (
      key: string,
      nextBooks: MedicalTextbook[],
      nextGuides: StudyGuide[]
    ): Promise<void> => {
      if (!navigator.onLine) {
        setSyncState('offline');
        return;
      }
      setSyncState('syncing');
      try {
        const res = await pushLibraryToCloud(key, nextBooks, nextGuides);
        setLastSyncedAt(res.updatedAt);
        setSyncState('synced');
      } catch {
        setSyncState('error');
      }
    },
    []
  );

  // Initial boot: load offline IndexedDB library, enrich guides with Unified Medical Topic Blueprint, and sync with cloud vault
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const [local, storedLectures] = await Promise.all([
        loadOfflineLibrary(),
        loadSavedLectures(),
      ]);
      if (cancelled) return;
      const enrichedLocalGuides = local.studyGuides.map((g) =>
        enrichStudyGuideWithBlueprint(g)
      );
      setTextbooks(local.textbooks);
      setStudyGuides(enrichedLocalGuides);
      if (enrichedLocalGuides.length > 0) {
        setActiveGuideId((prev) => prev || enrichedLocalGuides[0].id);
      }
      if (storedLectures.length > 0) {
        setSavedLectures(storedLectures);
        setActiveLectureId(storedLectures[0].id);
      }
      if (local.textbooks.length > 0) {
        setSelectedTextbookIds(local.textbooks.map((b) => b.id));
      }

      const key = getOrCreateWorkspaceKey();
      if (navigator.onLine) {
        try {
          setSyncState('syncing');
          const pulled = await pullLibraryFromCloud(key);
          if (cancelled) return;
          if (pulled.found && pulled.textbooks.length >= local.textbooks.length) {
            const enrichedPulled = pulled.studyGuides.map((g) =>
              enrichStudyGuideWithBlueprint(g)
            );
            setTextbooks(pulled.textbooks);
            setStudyGuides(enrichedPulled);
            if (enrichedPulled.length > 0) {
              setActiveGuideId((prev) => prev || enrichedPulled[0].id);
            }
            if (pulled.textbooks.length > 0) {
              setSelectedTextbookIds((prev) =>
                prev.length > 0 ? prev : pulled.textbooks.map((b) => b.id)
              );
            }
            if (pulled.updatedAt) setLastSyncedAt(pulled.updatedAt);
            setSyncState('synced');
          } else {
            const pushed = await pushLibraryToCloud(
              key,
              local.textbooks,
              enrichedLocalGuides
            );
            if (!cancelled) {
              setLastSyncedAt(pushed.updatedAt);
              setSyncState('synced');
            }
          }
        } catch {
          if (!cancelled) setSyncState('error');
        }
      } else {
        setSyncState('offline');
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOnline) {
      setSyncState('offline');
    }
  }, [isOnline]);

  const activeGuide = studyGuides.find((g) => g.id === activeGuideId) || null;
  const activeLecture =
    savedLectures.find((l) => l.id === activeLectureId) ||
    savedLectures[0] ||
    INITIAL_SAMPLE_LECTURE;

  const handleSaveLectureProject = useCallback(async (project: LectureProject) => {
    await saveLectureOffline(project);
    setSavedLectures((prev) => {
      const exists = prev.some((p) => p.id === project.id);
      if (exists) {
        return prev.map((p) => (p.id === project.id ? project : p));
      }
      return [project, ...prev];
    });
  }, []);

  const handleDeleteLectureProject = useCallback(
    async (lectureId: string) => {
      await deleteLectureOffline(lectureId);
      setSavedLectures((prev) => {
        const remaining = prev.filter((p) => p.id !== lectureId);
        const safeList = remaining.length > 0 ? remaining : [INITIAL_SAMPLE_LECTURE];
        if (activeLectureId === lectureId) {
          setActiveLectureId(safeList[0].id);
        }
        return safeList;
      });
    },
    [activeLectureId]
  );

  const handleAnimateStudyGuide = useCallback(
    async (guide: StudyGuide) => {
      const enriched = enrichStudyGuideWithBlueprint(guide);
      const built = buildLectureFromStudyGuide(enriched);
      await handleSaveLectureProject(built);
      setActiveLectureId(built.id);
      setActiveTab('lecture');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [handleSaveLectureProject]
  );

  const handleAnimateBookChapter = useCallback(
    async (book: MedicalTextbook) => {
      const built = buildLectureFromChapter(book, 1);
      await handleSaveLectureProject(built);
      setActiveLectureId(built.id);
      setActiveTab('lecture');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [handleSaveLectureProject]
  );

  // Respect user's exact textbook selection (including 0 books for General Medical Topic Mode!)
  const selectedBooks = useMemo(
    () => textbooks.filter((b) => selectedTextbookIds.includes(b.id)),
    [textbooks, selectedTextbookIds]
  );

  const scrollToStudyGuideStage = () => {
    requestAnimationFrame(() => {
      if (window.innerWidth < 1024) {
        document
          .getElementById('active-study-guide-stage')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleToggleTextbookSelection = (id: string) => {
    setSelectedTextbookIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    setValidationError(null);
    setApiError(null);
  };

  const handleSelectAllTextbooks = () => {
    setSelectedTextbookIds(textbooks.map((b) => b.id));
  };

  const handleClearSelectedTextbooks = () => {
    setSelectedTextbookIds([]);
  };

  const processMultiplePdfFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setApiError(null);
    setValidationError(null);

    const queueItems: BookUploadProgress[] = files.map((file, idx) => ({
      id: `upload-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      fileName: file.name,
      title: file.name.replace(/\.pdf$/i, ''),
      currentPage: 0,
      totalPages: 0,
      percent: 0,
      status: 'queued',
    }));

    setUploadQueue((prev) => [...queueItems, ...prev]);

    let runningBooks = [...textbooks];
    const newlyAddedIds: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uId = queueItems[i].id;

      setUploadQueue((prev) =>
        prev.map((u) => (u.id === uId ? { ...u, status: 'indexing' } : u))
      );

      try {
        const parsedBook = await parseUploadedPdf(file, (curr, total) => {
          const pct = Math.min(100, Math.round((curr / Math.max(1, total)) * 100));
          setUploadQueue((prev) =>
            prev.map((u) =>
              u.id === uId
                ? {
                    ...u,
                    status: 'indexing',
                    currentPage: curr,
                    totalPages: total,
                    percent: pct,
                  }
                : u
            )
          );
        });

        await saveTextbookOffline(parsedBook);
        runningBooks = [parsedBook, ...runningBooks];
        newlyAddedIds.push(parsedBook.id);
        setTextbooks(runningBooks);
        setSelectedTextbookIds((prev) =>
          Array.from(new Set([parsedBook.id, ...prev]))
        );

        setUploadQueue((prev) =>
          prev.map((u) =>
            u.id === uId
              ? {
                  ...u,
                  title: parsedBook.title,
                  status: 'ready',
                  currentPage: parsedBook.pageCount,
                  totalPages: parsedBook.pageCount,
                  percent: 100,
                  subject: parsedBook.subject,
                }
              : u
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to parse PDF file.';
        setUploadQueue((prev) =>
          prev.map((u) =>
            u.id === uId ? { ...u, status: 'error', errorMessage: msg } : u
          )
        );
        setApiError(msg);
      }
    }

    if (newlyAddedIds.length > 0) {
      await syncToCloudQuietly(workspaceKey, runningBooks, studyGuides);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length > 0) {
      await processMultiplePdfFiles(files);
    }
  };

  const handleUpdateTextbookMeta = async (
    id: string,
    updates: { title: string; subject: string }
  ) => {
    const existing = textbooks.find((b) => b.id === id);
    if (!existing) return;
    const updatedBook: MedicalTextbook = {
      ...existing,
      title: updates.title,
      subject: updates.subject,
    };
    await saveTextbookOffline(updatedBook);
    const nextBooks = textbooks.map((b) => (b.id === id ? updatedBook : b));
    setTextbooks(nextBooks);
    await syncToCloudQuietly(workspaceKey, nextBooks, studyGuides);
  };

  // Unified Medical Topic Blueprint Generator: works for ANY medical topic (with OR without uploaded textbooks)
  const handleGenerateTopic = async (topicOverride?: string) => {
    const targetTopic = typeof topicOverride === 'string' ? topicOverride : topicInput;
    const validation = validateTopicInput(targetTopic, selectedBooks.length > 0);
    if (!validation.valid) {
      setValidationError(validation.error || 'Enter a valid medical topic.');
      return;
    }

    setValidationError(null);
    setApiError(null);
    setIsGenerating(true);

    try {
      let guideBody: Omit<StudyGuide, 'id' | 'createdAt' | 'updatedAt' | 'answers'>;

      if (!navigator.onLine) {
        guideBody = buildMultiBookOfflineFallbackGuide(selectedBooks, targetTopic);
      } else {
        const multiRetrieval = retrieveAcrossTextbooks(selectedBooks, targetTopic, 12);
        const primaryScannedBook =
          selectedBooks.length > 0 && multiRetrieval.passages.length === 0
            ? selectedBooks.find((b) => {
                if (!b.pdfBase64) return false;
                const totalExtractedChars = (b.pages || []).reduce(
                  (sum, p) => sum + (p.text ? p.text.trim().length : 0),
                  0
                );
                return totalExtractedChars < 120;
              })
            : undefined;
        const allowScannedPdfPages = Boolean(primaryScannedBook?.pdfBase64);

        const textbookTitleLabel =
          selectedBooks.length === 0
            ? 'General Medical Knowledge & External Evidence'
            : selectedBooks.length === 1
              ? selectedBooks[0].title
              : `${selectedBooks[0].title} + ${selectedBooks.length - 1} more`;

        const response = await fetch('/api/tutor/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: targetTopic.trim(),
            textbookTitle: textbookTitleLabel,
            pageCount: multiRetrieval.totalPagesSearched,
            coverage: multiRetrieval.coverage,
            books: selectedBooks.map((b, idx) => ({
              bookKey: `B${idx + 1}`,
              id: b.id,
              title: b.title,
              subject: b.subject,
              pageCount: b.pageCount,
            })),
            passages: multiRetrieval.passages,
            pdfBase64: allowScannedPdfPages ? primaryScannedBook?.pdfBase64 : undefined,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload.error || 'Unable to generate explanation from medical tutor server.'
          );
        }

        guideBody = sanitizeMultiBookStudyGuideResponse(
          payload.guide || {},
          selectedBooks,
          targetTopic,
          multiRetrieval,
          { allowScannedPdfPages }
        );
      }

      const now = new Date().toISOString();
      const rawGuide: StudyGuide = {
        ...guideBody,
        id: `guide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: now,
        updatedAt: now,
        answers: {},
      };
      const newGuide = enrichStudyGuideWithBlueprint(rawGuide);

      // Synchronize a continuous 3D Lecture Project from the exact same Medical Topic Blueprint
      const syncedLecture = buildLectureFromStudyGuide(newGuide);
      await Promise.all([
        saveStudyGuideOffline(newGuide),
        handleSaveLectureProject(syncedLecture),
      ]);
      setActiveLectureId(syncedLecture.id);

      const nextGuides = [newGuide, ...studyGuides];
      setStudyGuides(nextGuides);
      setActiveGuideId(newGuide.id);
      if (activeTab !== 'exams' && activeTab !== 'qbank' && activeTab !== 'assistant') {
        setActiveTab('tutor');
        scrollToStudyGuideStage();
      }
      await syncToCloudQuietly(workspaceKey, textbooks, nextGuides);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to generate study explanation.';
      setApiError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Stable, idempotent callback for attaching external PubMed/Guideline evidence.
   * Uses `[]` dependencies and compares sliced IDs + canonical topic match so Guidelines/Research
   * views NEVER enter a re-render or refetch flickering loop!
   */
  const handleAttachExternalEvidence = useCallback(
    (items: ExternalEvidenceItem[], topicForEvidence?: string) => {
      if (!Array.isArray(items) || items.length === 0) return;
      const targetSlice = items.slice(0, 10);
      const targetSignature = targetSlice.map((item) => item.id).join('|');
      const incomingCanon = topicForEvidence
        ? canonicalizeMedicalTopic(topicForEvidence).canonicalTopicId
        : null;

      setStudyGuides((prev) => {
        const currentId = activeGuideIdRef.current;
        if (!currentId) return prev;
        const targetGuide = prev.find((g) => g.id === currentId);
        if (!targetGuide) return prev;

        // Do not overwrite activeGuide's evidence if the user searched a different topic in Guidelines/Research
        if (incomingCanon) {
          const guideCanon =
            targetGuide.canonicalTopicId ||
            canonicalizeMedicalTopic(targetGuide.topic).canonicalTopicId;
          if (guideCanon !== incomingCanon) {
            return prev;
          }
        }

        const existingSignature = (targetGuide.externalEvidence || [])
          .slice(0, 10)
          .map((item) => item.id)
          .join('|');
        if (existingSignature === targetSignature) {
          return prev;
        }

        const updatedGuide = enrichStudyGuideWithBlueprint({
          ...targetGuide,
          externalEvidence: targetSlice,
          updatedAt: new Date().toISOString(),
        });
        void saveStudyGuideOffline(updatedGuide);
        return prev.map((g) => (g.id === updatedGuide.id ? updatedGuide : g));
      });
    },
    []
  );

  const handleUpdateStudyGuideFromStudio = useCallback(
    async (updatedGuide: StudyGuide) => {
      const enriched = enrichStudyGuideWithBlueprint(updatedGuide);
      await saveStudyGuideOffline(enriched);
      setStudyGuides((prev) => {
        const exists = prev.some((g) => g.id === enriched.id);
        const nextGuides = exists
          ? prev.map((g) => (g.id === enriched.id ? enriched : g))
          : [enriched, ...prev];
        void syncToCloudQuietly(workspaceKey, textbooks, nextGuides);
        return nextGuides;
      });
    },
    [workspaceKey, textbooks, syncToCloudQuietly]
  );

  const handleSelectAnswer = async (mcqId: string, optionIndex: number) => {
    if (!activeGuide) return;
    const updatedGuide: StudyGuide = {
      ...activeGuide,
      answers: {
        ...(activeGuide.answers || {}),
        [mcqId]: optionIndex,
      },
      updatedAt: new Date().toISOString(),
    };
    await saveStudyGuideOffline(updatedGuide);
    const nextGuides = studyGuides.map((g) => (g.id === updatedGuide.id ? updatedGuide : g));
    setStudyGuides(nextGuides);
    await syncToCloudQuietly(workspaceKey, textbooks, nextGuides);
  };

  const handleResetQuiz = async () => {
    if (!activeGuide) return;
    const updatedGuide: StudyGuide = {
      ...activeGuide,
      answers: {},
      updatedAt: new Date().toISOString(),
    };
    await saveStudyGuideOffline(updatedGuide);
    const nextGuides = studyGuides.map((g) => (g.id === updatedGuide.id ? updatedGuide : g));
    setStudyGuides(nextGuides);
    await syncToCloudQuietly(workspaceKey, textbooks, nextGuides);
  };

  const handleUpdateFlashcardMastery = async (
    cardId: string,
    status: 'mastered' | 'review'
  ) => {
    if (!activeGuide) return;
    const updatedGuide: StudyGuide = {
      ...activeGuide,
      flashcardMastery: {
        ...(activeGuide.flashcardMastery || {}),
        [cardId]: status,
      },
      updatedAt: new Date().toISOString(),
    };
    await saveStudyGuideOffline(updatedGuide);
    const nextGuides = studyGuides.map((g) => (g.id === updatedGuide.id ? updatedGuide : g));
    setStudyGuides(nextGuides);
    await syncToCloudQuietly(workspaceKey, textbooks, nextGuides);
  };

  const handleEnrichEgyptianArabic = async () => {
    if (!activeGuide || isEnrichingArabic || !navigator.onLine) return;
    setIsEnrichingArabic(true);
    try {
      const res = await fetch('/api/tutor/egyptian-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: activeGuide.topic,
          summary: activeGuide.summary,
          sections: activeGuide.sections.map((s) => ({
            heading: s.heading,
            content: s.content,
            keyTakeaway: s.keyTakeaway,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Unable to generate Egyptian Arabic explanation.');
      }

      const translations: Array<{ contentArabic?: string; keyTakeawayArabic?: string }> =
        Array.isArray(data.sectionTranslations) ? data.sectionTranslations : [];

      const updatedGuide = enrichStudyGuideWithBlueprint({
        ...activeGuide,
        summaryArabic:
          typeof data.summaryArabic === 'string' && data.summaryArabic.trim().length > 0
            ? data.summaryArabic.trim()
            : activeGuide.summaryArabic,
        sections: activeGuide.sections.map((sec, idx) => ({
          ...sec,
          contentArabic: translations[idx]?.contentArabic || sec.contentArabic,
          keyTakeawayArabic: translations[idx]?.keyTakeawayArabic || sec.keyTakeawayArabic,
        })),
        updatedAt: new Date().toISOString(),
      });

      await saveStudyGuideOffline(updatedGuide);
      const nextGuides = studyGuides.map((g) =>
        g.id === updatedGuide.id ? updatedGuide : g
      );
      setStudyGuides(nextGuides);
      await syncToCloudQuietly(workspaceKey, textbooks, nextGuides);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to generate Egyptian Arabic explanation.';
      setApiError(msg);
    } finally {
      setIsEnrichingArabic(false);
    }
  };

  const handleDeleteTextbook = async (id: string) => {
    await removeTextbookOffline(id);
    const nextBooks = textbooks.filter((b) => b.id !== id);
    setTextbooks(nextBooks);
    setSelectedTextbookIds((prev) => prev.filter((item) => item !== id));
    await syncToCloudQuietly(workspaceKey, nextBooks, studyGuides);
  };

  const handleDeleteGuide = async (id: string) => {
    await removeStudyGuideOffline(id);
    const nextGuides = studyGuides.filter((g) => g.id !== id);
    setStudyGuides(nextGuides);
    if (activeGuideId === id) {
      setActiveGuideId(nextGuides[0]?.id || null);
    }
    await syncToCloudQuietly(workspaceKey, textbooks, nextGuides);
  };

  const handleOpenPageFromGuide = (pageNumber: number, textbookId?: string) => {
    let targetBook: MedicalTextbook | undefined;

    if (textbookId) {
      targetBook = textbooks.find((b) => b.id === textbookId);
    }

    if (!targetBook && activeGuide?.bookCitations) {
      const matchingCitation = activeGuide.bookCitations.find((cit) =>
        cit.pageNumbers.includes(pageNumber)
      );
      if (matchingCitation) {
        targetBook = textbooks.find((b) => b.id === matchingCitation.textbookId);
      }
    }

    if (!targetBook && activeGuide) {
      targetBook = textbooks.find((b) => b.id === activeGuide.textbookId);
    }

    if (!targetBook) {
      targetBook = selectedBooks[0] || textbooks[0];
    }

    if (targetBook) {
      const clampedPage = Math.max(1, Math.min(targetBook.pageCount, pageNumber));
      setReaderState({
        book: targetBook,
        pageNumber: clampedPage,
        highlightTopic: activeGuide?.topic,
      });
    }
  };

  const handleManualSync = async () => {
    await syncToCloudQuietly(workspaceKey, textbooks, studyGuides);
  };

  const handleSwitchWorkspaceKey = async (
    rawKey: string
  ): Promise<{ message: string; isError?: boolean }> => {
    const normalized = setWorkspaceKey(rawKey);
    setWorkspaceKeyState(normalized);
    try {
      setSyncState('syncing');
      const pulled = await pullLibraryFromCloud(normalized);
      if (pulled.found) {
        const enrichedPulled = pulled.studyGuides.map((g) =>
          enrichStudyGuideWithBlueprint(g)
        );
        setTextbooks(pulled.textbooks);
        setStudyGuides(enrichedPulled);
        if (pulled.textbooks.length > 0) {
          setSelectedTextbookIds(pulled.textbooks.map((b) => b.id));
        }
        if (pulled.updatedAt) setLastSyncedAt(pulled.updatedAt);
        setSyncState('synced');
        return {
          message: `Connected to Cloud Vault ${normalized} and merged synced study materials.`,
        };
      }
      const pushed = await pushLibraryToCloud(normalized, textbooks, studyGuides);
      setLastSyncedAt(pushed.updatedAt);
      setSyncState('synced');
      return {
        message: `Initialized new encrypted Cloud Vault ${normalized} with your current library.`,
      };
    } catch (err) {
      setSyncState('error');
      return {
        message: err instanceof Error ? err.message : 'Unable to connect Cloud Vault.',
        isError: true,
      };
    }
  };

  const effectiveTab: ActiveTab = activeTab === 'qbank' ? 'exams' : activeTab;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col bg-[#F8FAFC] text-slate-900 pb-20 md:pb-10">
      {/* Hidden Multi-File PDF Input triggered by accessible Upload buttons */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileInputChange}
        className="sr-only"
      />

      <Header
        activeTab={effectiveTab}
        onSelectTab={(tab) => {
          setActiveTab(tab === 'qbank' ? 'exams' : tab);
          setValidationError(null);
          setApiError(null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onTriggerUpload={handleTriggerUpload}
        savedCount={studyGuides.length}
        textbookCount={textbooks.length}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-3.5 py-4 sm:px-6 sm:py-6 lg:px-8 min-w-0">
        {effectiveTab === 'home' && (
          <HomeDashboardView
            textbooks={textbooks}
            selectedTextbookIds={selectedTextbookIds}
            uploadQueue={uploadQueue}
            studyGuides={studyGuides}
            activeGuide={activeGuide}
            savedLectures={savedLectures}
            topicInput={topicInput}
            onChangeTopicInput={(val) => {
              setTopicInput(val);
              if (validationError) setValidationError(null);
            }}
            onSubmitTopic={handleGenerateTopic}
            validationError={validationError}
            apiError={apiError}
            isGenerating={isGenerating}
            onToggleTextbookSelection={handleToggleTextbookSelection}
            onSelectAllTextbooks={handleSelectAllTextbooks}
            onClearSelectedTextbooks={handleClearSelectedTextbooks}
            onTriggerUpload={handleTriggerUpload}
            onSelectTab={(tab) => {
              setActiveTab(tab === 'qbank' ? 'exams' : tab);
              setValidationError(null);
              setApiError(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenSavedGuide={(guide) => {
              setValidationError(null);
              setApiError(null);
              setActiveGuideId(guide.id);
              setActiveTab('tutor');
              scrollToStudyGuideStage();
            }}
            onOpenBookPage={(book, pageNumber) => setReaderState({ book, pageNumber })}
            onAnimateGuide={handleAnimateStudyGuide}
            onOpenPdfStudio={(
              scope = 'single_topic',
              exportMode = 'full_study_guide',
              guide
            ) => {
              if (guide) setActiveGuideId(guide.id);
              setPdfStudioState({ isOpen: true, scope, exportMode });
            }}
          />
        )}

        {effectiveTab === 'tutor' && (
          <TutorWorkspace
            textbooks={textbooks}
            selectedTextbookIds={selectedTextbookIds}
            onToggleTextbookSelection={handleToggleTextbookSelection}
            onSelectAllTextbooks={handleSelectAllTextbooks}
            onClearSelectedTextbooks={handleClearSelectedTextbooks}
            onTriggerUpload={handleTriggerUpload}
            uploadQueue={uploadQueue}
            topicInput={topicInput}
            onChangeTopicInput={(val) => {
              setTopicInput(val);
              if (validationError) setValidationError(null);
            }}
            onSubmitTopic={handleGenerateTopic}
            validationError={validationError}
            apiError={apiError}
            isGenerating={isGenerating}
            activeGuide={activeGuide}
            onClearActiveGuide={() => {
              setActiveGuideId(null);
              setValidationError(null);
              setApiError(null);
            }}
            sampleGuide={studyGuides[0] || null}
            onOpenSavedGuide={(guide) => {
              setValidationError(null);
              setApiError(null);
              setActiveGuideId(guide.id);
              setActiveTab('tutor');
              scrollToStudyGuideStage();
            }}
            onOpenBookPage={(book, pageNumber) => setReaderState({ book, pageNumber })}
            onOpenPage={handleOpenPageFromGuide}
            onOpenPdfStudio={(scope = 'single_topic') =>
              setPdfStudioState({
                isOpen: true,
                scope,
                exportMode: 'full_study_guide',
              })
            }
            onAnimateLecture={
              activeGuide
                ? () => handleAnimateStudyGuide(activeGuide)
                : studyGuides[0]
                  ? () => handleAnimateStudyGuide(studyGuides[0])
                  : undefined
            }
            onOpenTimedExam={() => {
              setActiveTab('exams');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onEvidenceLoaded={handleAttachExternalEvidence}
            onSelectAnswer={handleSelectAnswer}
            onResetQuiz={handleResetQuiz}
            isOnline={isOnline}
            isEnrichingArabic={isEnrichingArabic}
            onRequestArabicEnrichment={handleEnrichEgyptianArabic}
            onUpdateFlashcardMastery={handleUpdateFlashcardMastery}
          />
        )}

        {effectiveTab === 'lecture' && (
          <LectureStudioView
            textbooks={textbooks}
            selectedTextbookIds={selectedTextbookIds}
            onToggleTextbookSelection={handleToggleTextbookSelection}
            savedGuides={studyGuides}
            savedLectures={savedLectures}
            activeLecture={activeLecture}
            onSelectLecture={setActiveLectureId}
            onSaveLecture={handleSaveLectureProject}
            onDeleteLecture={handleDeleteLectureProject}
            onOpenPage={handleOpenPageFromGuide}
            onOpenTimedExam={(lectureTopic) => {
              const canon = canonicalizeMedicalTopic(lectureTopic);
              const matched = studyGuides.find(
                (g) =>
                  (g.canonicalTopicId ||
                    canonicalizeMedicalTopic(g.topic).canonicalTopicId) ===
                  canon.canonicalTopicId
              );
              if (matched) {
                setActiveGuideId(matched.id);
              }
              setActiveTab('exams');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            isOnline={isOnline}
          />
        )}

        {effectiveTab === 'library' && (
          <TextbookLibraryView
            textbooks={textbooks}
            selectedTextbookIds={selectedTextbookIds}
            uploadQueue={uploadQueue}
            onToggleSelectTextbook={handleToggleTextbookSelection}
            onSelectOnlyTextbookAndStudy={(id) => {
              setSelectedTextbookIds([id]);
              setActiveGuideId(null);
              setValidationError(null);
              setApiError(null);
              setActiveTab('tutor');
            }}
            onUpdateTextbookMeta={handleUpdateTextbookMeta}
            onOpenBookReader={(book, pageNumber) =>
              setReaderState({ book, pageNumber })
            }
            onExportBookChapterPdf={(bookId) =>
              setPdfStudioState({
                isOpen: true,
                scope: 'chapter',
                exportMode: 'full_study_guide',
                bookId,
              })
            }
            onAnimateBookChapter={handleAnimateBookChapter}
            onDeleteTextbook={handleDeleteTextbook}
            onFilesDropped={processMultiplePdfFiles}
            onTriggerUpload={handleTriggerUpload}
            onClearCompletedUploads={() => setUploadQueue([])}
          />
        )}

        {effectiveTab === 'pdfs' && (
          <SavedGuidesView
            guides={studyGuides}
            onOpenGuide={(guide) => {
              setValidationError(null);
              setApiError(null);
              setActiveGuideId(guide.id);
              setActiveTab('tutor');
              scrollToStudyGuideStage();
            }}
            onExportGuidePdf={(guide) => {
              setActiveGuideId(guide.id);
              setPdfStudioState({
                isOpen: true,
                scope: 'single_topic',
                exportMode: 'full_study_guide',
              });
            }}
            onOpenMultiGuidePdfStudio={(
              scope,
              exportMode = 'full_study_guide'
            ) =>
              setPdfStudioState({ isOpen: true, scope, exportMode })
            }
            onDeleteGuide={handleDeleteGuide}
            onGoToTutor={() => setActiveTab('home')}
          />
        )}

        {effectiveTab === 'exams' && (
          <TimedExamsView
            activeGuide={activeGuide}
            savedGuides={studyGuides}
            lectures={savedLectures}
            onSelectActiveGuide={(guide) => {
              setActiveGuideId(guide.id);
            }}
            onSaveGuide={handleUpdateStudyGuideFromStudio}
            onOpenPdfStudio={() =>
              setPdfStudioState({
                isOpen: true,
                scope: 'single_topic',
                exportMode: 'question_bank_with_answers',
              })
            }
            onOpenLectureStudio={() => {
              setActiveTab('lecture');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {effectiveTab === 'research' && (
          <EvidenceHubView
            mode="research"
            activeTopic={activeGuide?.topic || topicInput}
            studyGuides={studyGuides}
            isOnline={isOnline}
            onEvidenceLoaded={handleAttachExternalEvidence}
          />
        )}

        {effectiveTab === 'guidelines' && (
          <EvidenceHubView
            mode="guidelines"
            activeTopic={activeGuide?.topic || topicInput}
            studyGuides={studyGuides}
            isOnline={isOnline}
            onEvidenceLoaded={handleAttachExternalEvidence}
          />
        )}

        {effectiveTab === 'assistant' && (
          <AiAssistantView
            textbooks={textbooks}
            selectedTextbookIds={selectedTextbookIds}
            studyGuides={studyGuides}
            activeGuide={activeGuide}
            topicInput={topicInput}
            validationError={validationError}
            apiError={apiError}
            isGenerating={isGenerating}
            isOnline={isOnline}
            isEnrichingArabic={isEnrichingArabic}
            onChangeTopicInput={(val) => {
              setTopicInput(val);
              if (validationError) setValidationError(null);
            }}
            onSubmitTopic={handleGenerateTopic}
            onRequestArabicEnrichment={handleEnrichEgyptianArabic}
            onSelectGuide={(guide) => setActiveGuideId(guide.id)}
            onOpenPage={handleOpenPageFromGuide}
            onSelectTab={(tab) => {
              setActiveTab(tab === 'qbank' ? 'exams' : tab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenPdfStudio={(
              scope = 'single_topic',
              exportMode = 'full_study_guide',
              guide
            ) => {
              if (guide) setActiveGuideId(guide.id);
              setPdfStudioState({ isOpen: true, scope, exportMode });
            }}
            onAnimateLecture={handleAnimateStudyGuide}
          />
        )}

        {effectiveTab === 'sync' && (
          <CloudSyncView
            workspaceKey={workspaceKey}
            syncState={syncState}
            lastSyncedAt={lastSyncedAt}
            isOnline={isOnline}
            textbookCount={textbooks.length}
            guideCount={studyGuides.length}
            onSyncNow={handleManualSync}
            onSwitchWorkspaceKey={handleSwitchWorkspaceKey}
          />
        )}
      </main>

      <footer className="no-print border-t border-slate-200 bg-white py-4 mt-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 text-center sm:text-left">
          <span>
            MedAtlas Tutor — Unified Medical Education Platform; verify clinical decisions with institutional guidelines.
          </span>
          <span>Offline PWA · 3D Lectures · Vector Study PDFs · Timed Exams</span>
        </div>
      </footer>

      <MobileBottomNav
        activeTab={effectiveTab}
        onSelectTab={(tab) => {
          setActiveTab(tab === 'qbank' ? 'exams' : tab);
          setValidationError(null);
          setApiError(null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      <OfflineIndicator />

      <PageReaderModal
        textbook={readerState?.book || null}
        pageNumber={readerState?.pageNumber ?? null}
        highlightTopic={readerState?.highlightTopic}
        onSelectPage={(nextPage) =>
          setReaderState((prev) => (prev ? { ...prev, pageNumber: nextPage } : null))
        }
        onClose={() => setReaderState(null)}
      />

      <StudyPdfStudioModal
        isOpen={pdfStudioState.isOpen}
        initialScope={pdfStudioState.scope}
        initialExportMode={pdfStudioState.exportMode}
        initialBookId={pdfStudioState.bookId}
        activeGuide={activeGuide}
        pendingTopicInput={topicInput}
        savedGuides={studyGuides}
        textbooks={textbooks}
        isOnline={isOnline}
        isGeneratingTopic={isGenerating}
        onSelectActiveGuide={(guide) => setActiveGuideId(guide.id)}
        onGenerateTopic={handleGenerateTopic}
        onUpdateStudyGuide={handleUpdateStudyGuideFromStudio}
        onClose={() => setPdfStudioState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
