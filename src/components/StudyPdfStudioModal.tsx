import React, { useEffect, useMemo, useRef, useState } from 'react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  MedicalTextbook,
  PdfDocumentExportMode,
  PdfExportScope,
  PdfGeneratorConfig,
  PdfPageOrientation,
  PdfStudyStyle,
  StudyGuide,
} from '../types/medical';
import {
  DISCIPLINE_META,
  generateAiInfographicPackWithProgress,
  type InfographicGenerationProgress,
} from '../utils/infographicQuestionBankEngine';
import {
  getBrowserPreviewAtlasUrl,
  loadPdfAtlasImagesInBrowser,
} from '../utils/pdfImageAssets';
import {
  generateStudyPdfBlob,
  generateStudyPdfDocument,
  triggerPdfBlobDownload,
} from '../utils/studyPdfGenerator';
import { buildStudyPdfDocumentModel } from '../utils/studyPdfModel';
import { canonicalizeMedicalTopic } from '../utils/topicCanonicalizer';

let studioPdfJsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function getStudioPdfJs() {
  if (!studioPdfJsPromise) {
    studioPdfJsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return lib;
    });
  }
  return studioPdfJsPromise;
}

interface StudyPdfStudioModalProps {
  isOpen: boolean;
  initialScope?: PdfExportScope;
  initialExportMode?: PdfDocumentExportMode;
  initialBookId?: string;
  activeGuide: StudyGuide | null;
  pendingTopicInput?: string;
  savedGuides: StudyGuide[];
  textbooks: MedicalTextbook[];
  isOnline?: boolean;
  isGeneratingTopic?: boolean;
  onSelectActiveGuide?: (guide: StudyGuide) => void;
  onGenerateTopic?: (topicOverride?: string) => Promise<void> | void;
  onUpdateStudyGuide?: (updated: StudyGuide) => void | Promise<void>;
  onClose: () => void;
}

type StudioPreviewTab = 'live_pdf' | 'infographic_sheet' | 'question_bank';
type QuestionBankSubTab = 'mcqs' | 'written' | 'cases';

export const StudyPdfStudioModal: React.FC<StudyPdfStudioModalProps> = ({
  isOpen,
  initialScope = 'single_topic',
  initialExportMode = 'full_study_guide',
  initialBookId,
  activeGuide,
  pendingTopicInput = '',
  savedGuides,
  textbooks,
  isOnline = true,
  isGeneratingTopic = false,
  onSelectActiveGuide,
  onGenerateTopic,
  onUpdateStudyGuide,
  onClose,
}) => {
  const [scope, setScope] = useState<PdfExportScope>(initialScope);
  const [exportMode, setExportMode] =
    useState<PdfDocumentExportMode>(initialExportMode);
  const [orientation, setOrientation] = useState<PdfPageOrientation>('portrait');
  const [autoLandscapeWidePages, setAutoLandscapeWidePages] = useState<boolean>(true);
  const [style, setStyle] = useState<PdfStudyStyle>('detailed');
  const [customTitle, setCustomTitle] = useState<string>('');

  const [selectedGuideIds, setSelectedGuideIds] = useState<string[]>([]);
  const [chapterBookId, setChapterBookId] = useState<string>('');
  const [chapterPageNumbers, setChapterPageNumbers] = useState<number[]>([1]);

  const [includeCoverPage, setIncludeCoverPage] = useState<boolean>(true);
  const [includeTableOfContents, setIncludeTableOfContents] = useState<boolean>(true);
  const [includeVisualDiagrams, setIncludeVisualDiagrams] = useState<boolean>(true);
  const [includeComparisonAndCases, setIncludeComparisonAndCases] =
    useState<boolean>(true);
  const [includeMcqsWithAnswers, setIncludeMcqsWithAnswers] = useState<boolean>(true);
  const [includeQuestionBank, setIncludeQuestionBank] = useState<boolean>(true);
  const [includeReferences, setIncludeReferences] = useState<boolean>(true);

  const [atlasImagesMap, setAtlasImagesMap] = useState<Record<string, string>>({});
  const [isLoadingAtlas, setIsLoadingAtlas] = useState<boolean>(false);

  const [previewTab, setPreviewTab] = useState<StudioPreviewTab>('live_pdf');
  const [qbSubTab, setQbSubTab] = useState<QuestionBankSubTab>('mcqs');
  const [showAnswerKeysInPreview, setShowAnswerKeysInPreview] =
    useState<boolean>(false);
  const [selfTestMcqSelections, setSelfTestMcqSelections] = useState<
    Record<string, number>
  >({});

  // AI 4-Stage Infographic & 48-Question Synthesis state
  const [isSynthesizingAi, setIsSynthesizingAi] = useState<boolean>(false);
  const [aiProgress, setAiProgress] = useState<InfographicGenerationProgress | null>(
    null
  );
  const [aiError, setAiError] = useState<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  // Live PDF Canvas Preview state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfPreviewPage, setPdfPreviewPage] = useState<number>(1);
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(1);
  const [pdfPageDimensionsLabel, setPdfPageDimensionsLabel] = useState<string>(
    'A4 Portrait · 210 × 297 mm'
  );
  const [isRenderingCanvas, setIsRenderingCanvas] = useState<boolean>(false);
  const [canvasError, setCanvasError] = useState<string | null>(null);

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<{
    filename: string;
    pageCount: number;
    sizeKb: number;
    modeLabel: string;
  } | null>(null);

  // Preload embedded high-res medical illustrations when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingAtlas(true);
    loadPdfAtlasImagesInBrowser()
      .then((loaded) => {
        if (!cancelled) {
          setAtlasImagesMap(loaded);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAtlas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Cancel in-flight AI request on close/unmount
  useEffect(() => {
    if (!isOpen && aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
      setIsSynthesizingAi(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmedPending = pendingTopicInput.trim();
    if (!activeGuide && trimmedPending.length >= 3 && onSelectActiveGuide) {
      const pendingCanon = canonicalizeMedicalTopic(trimmedPending);
      const exactSaved = savedGuides.find(
        (g) =>
          (g.canonicalTopicId || canonicalizeMedicalTopic(g.topic).canonicalTopicId) ===
          pendingCanon.canonicalTopicId
      );
      if (exactSaved) {
        onSelectActiveGuide(exactSaved);
      }
    }

    const defaultScope: PdfExportScope = initialScope || 'single_topic';
    const defaultExportMode: PdfDocumentExportMode =
      initialExportMode || 'full_study_guide';
    setScope(defaultScope);
    setExportMode(defaultExportMode);
    setPreviewTab(
      defaultExportMode === 'full_study_guide' ? 'live_pdf' : 'question_bank'
    );
    setStyle(defaultScope === 'revision_guide' ? 'compact' : 'detailed');
    setCustomTitle('');
    setExportError(null);
    setExportSuccess(null);
    setAiError(null);
    setPdfPreviewPage(1);
    setSelfTestMcqSelections({});
    setShowAnswerKeysInPreview(false);

    const defaultGuideSelection =
      savedGuides.length > 0
        ? savedGuides.slice(0, Math.min(3, savedGuides.length)).map((g) => g.id)
        : activeGuide
          ? [activeGuide.id]
          : [];
    setSelectedGuideIds(defaultGuideSelection);

    const targetBook =
      textbooks.find((b) => b.id === initialBookId) ||
      (activeGuide && textbooks.find((b) => b.id === activeGuide.textbookId)) ||
      textbooks[0] ||
      null;
    if (targetBook) {
      setChapterBookId(targetBook.id);
      const defaultPage =
        activeGuide &&
        activeGuide.textbookId === targetBook.id &&
        activeGuide.referencedPages.length > 0
          ? activeGuide.referencedPages[0]
          : targetBook.pages[0]?.pageNumber || 1;
      setChapterPageNumbers([defaultPage]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialScope, initialBookId]);

  const selectedChapterBook = useMemo(
    () => textbooks.find((b) => b.id === chapterBookId) || textbooks[0] || null,
    [textbooks, chapterBookId]
  );

  const selectedGuides = useMemo(
    () => savedGuides.filter((g) => selectedGuideIds.includes(g.id)),
    [savedGuides, selectedGuideIds]
  );

  const config: PdfGeneratorConfig = useMemo(
    () => ({
      scope,
      exportMode,
      orientation,
      autoLandscapeWidePages:
        orientation === 'portrait' ? autoLandscapeWidePages : false,
      style,
      customTitle: customTitle.trim() || undefined,
      includeCoverPage,
      includeTableOfContents,
      includeVisualDiagrams,
      includeComparisonAndCases,
      includeMcqsWithAnswers,
      includeQuestionBank,
      includeReferences,
      embeddedAtlasImages: atlasImagesMap,
    }),
    [
      scope,
      exportMode,
      orientation,
      autoLandscapeWidePages,
      style,
      customTitle,
      includeCoverPage,
      includeTableOfContents,
      includeVisualDiagrams,
      includeComparisonAndCases,
      includeMcqsWithAnswers,
      includeQuestionBank,
      includeReferences,
      atlasImagesMap,
    ]
  );

  const pdfModel = useMemo(
    () =>
      buildStudyPdfDocumentModel({
        config,
        activeGuide,
        selectedGuides,
        chapterBook: selectedChapterBook,
        chapterPageNumbers,
        allTextbooks: textbooks,
      }),
    [
      config,
      activeGuide,
      selectedGuides,
      selectedChapterBook,
      chapterPageNumbers,
      textbooks,
    ]
  );

  // Compile PDF bytes in memory for Live PDF Canvas Preview whenever model changes & live_pdf tab is active
  const compiledPdfPreview = useMemo(() => {
    if (!isOpen || previewTab !== 'live_pdf' || pdfModel.units.length === 0) {
      return null;
    }
    try {
      const { doc, pageCount, filename } = generateStudyPdfDocument(pdfModel);
      const buffer = doc.output('arraybuffer');
      return {
        bytes: new Uint8Array(buffer),
        pageCount,
        filename,
      };
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to render live PDF page preview.',
        bytes: null,
        pageCount: 0,
        filename: 'medatlas-study-guide.pdf',
      };
    }
  }, [isOpen, previewTab, pdfModel]);

  useEffect(() => {
    if (!compiledPdfPreview || !compiledPdfPreview.bytes) {
      if (compiledPdfPreview?.error) {
        setCanvasError(compiledPdfPreview.error);
      }
      return;
    }
    setPdfTotalPages(compiledPdfPreview.pageCount);
    setPdfPreviewPage((prev) =>
      Math.min(Math.max(1, prev), Math.max(1, compiledPdfPreview.pageCount))
    );
  }, [compiledPdfPreview]);

  // Render active page onto HTML5 canvas via pdfjs-dist
  useEffect(() => {
    if (
      !isOpen ||
      previewTab !== 'live_pdf' ||
      !compiledPdfPreview?.bytes ||
      !canvasRef.current
    ) {
      return;
    }

    let cancelled = false;
    setIsRenderingCanvas(true);
    setCanvasError(null);

    const safePageNum = Math.min(
      Math.max(1, pdfPreviewPage),
      compiledPdfPreview.pageCount
    );

    (async () => {
      try {
        const pdfjsLib = await getStudioPdfJs();
        // Copy bytes because pdf.js worker transfers underlying ArrayBuffer
        const byteCopy = new Uint8Array(compiledPdfPreview.bytes!);
        const loadingTask = pdfjsLib.getDocument({ data: byteCopy });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        const page = await pdfDoc.getPage(safePageNum);
        const baseViewport = page.getViewport({ scale: 1 });
        const isLandscapePage = baseViewport.width > baseViewport.height;
        setPdfPageDimensionsLabel(
          isLandscapePage
            ? 'A4 Landscape · 297 × 210 mm (Wide Visual / Table Spread)'
            : 'A4 Portrait · 210 × 297 mm (Textbook Spread)'
        );

        const dpr = Math.min(window.devicePixelRatio || 1.5, 2);
        const targetDisplayWidth = isLandscapePage ? 740 : 560;
        const scale = (targetDisplayWidth / baseViewport.width) * dpr;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) {
          await loadingTask.destroy();
          return;
        }
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        }
        await loadingTask.destroy();
      } catch (err) {
        if (!cancelled) {
          setCanvasError(
            err instanceof Error
              ? err.message
              : 'Unable to rasterize PDF preview page.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsRenderingCanvas(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, previewTab, compiledPdfPreview, pdfPreviewPage]);

  if (!isOpen) return null;

  const primaryUnit = pdfModel.units[0] || null;
  const activePack = primaryUnit?.infographicPack || null;
  const isExportBlocked = pdfModel.units.length === 0 || !pdfModel.validation.valid;

  const trimmedPendingTopic = pendingTopicInput.trim();
  const pendingCanonical =
    trimmedPendingTopic.length >= 3 ? canonicalizeMedicalTopic(trimmedPendingTopic) : null;
  const activeCanonical = activeGuide
    ? canonicalizeMedicalTopic(activeGuide.topic)
    : null;
  const hasPendingTopicDrift = Boolean(
    scope === 'single_topic' &&
      pendingCanonical &&
      (!activeCanonical ||
        pendingCanonical.canonicalTopicId !== activeCanonical.canonicalTopicId)
  );
  const matchingSavedForPending = pendingCanonical
    ? savedGuides.find(
        (g) =>
          (g.canonicalTopicId || canonicalizeMedicalTopic(g.topic).canonicalTopicId) ===
          pendingCanonical.canonicalTopicId
      ) || null
    : null;

  const handleSynthesizeAiPack = async () => {
    const targetGuide =
      scope === 'single_topic' && activeGuide
        ? activeGuide
        : selectedGuides[0] || activeGuide;
    if (!targetGuide || isSynthesizingAi) return;

    if (!isOnline) {
      setAiError(
        'You are currently offline. Connect to the internet to run Gemini AI Infographic & 48-Question synthesis, or export immediately using the compiled textbook pack.'
      );
      return;
    }

    const controller = new AbortController();
    aiAbortRef.current = controller;
    setIsSynthesizingAi(true);
    setAiError(null);
    setExportSuccess(null);

    try {
      const synthesizedPack = await generateAiInfographicPackWithProgress(
        targetGuide,
        textbooks,
        (prog) => setAiProgress(prog),
        controller.signal
      );

      const updatedGuide: StudyGuide = {
        ...targetGuide,
        infographicPack: synthesizedPack,
        updatedAt: new Date().toISOString(),
      };
      await onUpdateStudyGuide?.(updatedGuide);
      setPdfPreviewPage(1);
    } catch (err) {
      if (controller.signal.aborted) return;
      setAiError(
        err instanceof Error
          ? err.message
          : 'AI synthesis encountered an error. You can retry or export the verified compiled pack.'
      );
    } finally {
      setIsSynthesizingAi(false);
      aiAbortRef.current = null;
    }
  };

  const handleToggleGuideId = (id: string) => {
    setSelectedGuideIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    setExportSuccess(null);
    setPdfPreviewPage(1);
  };

  const handleToggleChapterPage = (pageNum: number) => {
    setChapterPageNumbers((prev) => {
      if (prev.includes(pageNum)) {
        return prev.length > 1 ? prev.filter((n) => n !== pageNum) : prev;
      }
      return [...prev, pageNum].sort((a, b) => a - b);
    });
    setExportSuccess(null);
    setPdfPreviewPage(1);
  };

  const handleDownloadWithMode = (targetMode: PdfDocumentExportMode) => {
    setExportError(null);
    setExportSuccess(null);

    if (pdfModel.units.length === 0) {
      setExportError(
        'Select at least one medical topic or textbook chapter before generating the PDF.'
      );
      return;
    }

    setIsExporting(true);
    try {
      const targetConfig: PdfGeneratorConfig = {
        ...config,
        exportMode: targetMode,
      };
      const modelToExport =
        targetMode === exportMode
          ? pdfModel
          : buildStudyPdfDocumentModel({
              config: targetConfig,
              activeGuide,
              selectedGuides,
              chapterBook: selectedChapterBook,
              chapterPageNumbers,
              allTextbooks: textbooks,
            });

      if (!modelToExport.validation.valid) {
        throw new Error(
          `PDF Export Blocked — Topic/Content Mismatch: ${modelToExport.validation.issues
            .map((i) => i.message)
            .join(' | ')}`
        );
      }

      const { blob, pageCount, filename } = generateStudyPdfBlob(modelToExport);
      if (!blob || blob.size < 400) {
        throw new Error('Generated PDF document was unexpectedly small or empty.');
      }
      triggerPdfBlobDownload(blob, filename);

      const modeLabel =
        targetMode === 'question_bank_self_test'
          ? 'Self-Test Exam Paper (Questions Only)'
          : targetMode === 'question_bank_with_answers'
            ? 'Standalone 48-Question Bank + Answer Keys'
            : 'Full Illustrated Medical Textbook Study Guide';

      setExportSuccess({
        filename,
        pageCount,
        sizeKb: Math.max(1, Math.round(blob.size / 1024)),
        modeLabel,
      });
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Unable to compile PDF study guide. Please verify selected content.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const mcqAnsweredCount = Object.keys(selfTestMcqSelections).length;
  const mcqCorrectCount = (activePack?.questionBank.mcqs || []).reduce(
    (acc, q) =>
      selfTestMcqSelections[q.id] === q.correctIndex ? acc + 1 : acc,
    0
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-studio-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-2 sm:p-4 lg:p-5 overflow-y-auto"
    >
      <div className="my-auto flex max-h-[95vh] w-full max-w-[1380px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#0F4C81] px-4 py-3.5 sm:px-6 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 shrink-0">
              <FileDown className="h-5 w-5 text-sky-200" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="pdf-studio-modal-title"
                className="text-base sm:text-lg font-bold tracking-tight truncate"
              >
                Medical Textbook Infographic PDF &amp; 48-Question Bank Studio
              </h2>
              <p className="text-xs text-sky-100 truncate">
                Selectable vector text · Embedded medical illustrations · Integrated sciences · 30 MCQs + 10 Written + 8 Clinical Cases
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 max-w-full">
            <button
              type="button"
              onClick={() => handleDownloadWithMode(exportMode)}
              disabled={isExporting || isExportBlocked}
              title={
                isExportBlocked && pdfModel.validation.issues[0]
                  ? pdfModel.validation.issues[0].message
                  : undefined
              }
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-white px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-[#0F4C81] hover:bg-sky-50 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {exportMode === 'full_study_guide'
                  ? 'Download Illustrated Study PDF (.pdf)'
                  : exportMode === 'question_bank_with_answers'
                    ? 'Download Question Bank + Key (.pdf)'
                    : 'Download Exam Paper Only (.pdf)'}
              </span>
              <span className="sm:hidden">Download PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Study PDF Studio"
              className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors shrink-0"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Status / Feedback Banner */}
        {(exportError || exportSuccess) && (
          <div className="border-b border-slate-200 px-4 py-2.5 sm:px-6 bg-slate-50">
            {exportError && (
              <div
                role="alert"
                className="flex items-center gap-2 text-xs sm:text-sm font-medium text-red-800"
              >
                <AlertCircle className="h-4 w-4 text-red-700 shrink-0" aria-hidden="true" />
                <span>{exportError}</span>
              </div>
            )}
            {exportSuccess && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-medium text-emerald-900"
              >
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2
                    className="h-4 w-4 text-emerald-700 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    Exported <strong>{exportSuccess.filename}</strong> ({exportSuccess.pageCount}{' '}
                    A4 pages · {exportSuccess.sizeKb} KB · {exportSuccess.modeLabel}). Ready for Android, desktop &amp; print.
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Main Studio Split Layout */}
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
          {/* LEFT CONFIGURATION & AI SYNTHESIS PANEL */}
          <div className="lg:col-span-5 xl:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-4 sm:p-5 lg:overflow-y-auto space-y-5">
            {/* Typed Topic vs Active Guide Drift Guard */}
            {hasPendingTopicDrift && pendingCanonical && (
              <div
                role="alert"
                className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 space-y-2.5"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-800 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-950 space-y-1">
                    <p className="font-bold">
                      Unsynthesized Search Topic Detected: &ldquo;{pendingCanonical.canonicalTitle}&rdquo;
                    </p>
                    <p>
                      {activeGuide
                        ? `Your search bar has "${trimmedPendingTopic}", while the currently loaded guide is "${activeGuide.topic}". Generate or switch to "${pendingCanonical.canonicalTitle}" so your PDF matches your intended topic.`
                        : `You typed "${trimmedPendingTopic}" in the topic bar, but have not generated its study guide yet.`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {matchingSavedForPending && onSelectActiveGuide && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectActiveGuide(matchingSavedForPending);
                        setCustomTitle('');
                        setPdfPreviewPage(1);
                      }}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#0F4C81] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0c3e6b]"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Load Saved &ldquo;{matchingSavedForPending.topic}&rdquo;</span>
                    </button>
                  )}
                  {onGenerateTopic && (
                    <button
                      type="button"
                      disabled={isGeneratingTopic}
                      onClick={async () => {
                        setCustomTitle('');
                        await onGenerateTopic(trimmedPendingTopic);
                        setPdfPreviewPage(1);
                      }}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-amber-700 bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-60"
                    >
                      {isGeneratingTopic ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Generating &ldquo;{pendingCanonical.canonicalTitle}&rdquo;...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Generate &ldquo;{pendingCanonical.canonicalTitle}&rdquo; Now</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Automated Topic & Assessment Coherence Gate Status */}
            {pdfModel.units.length > 0 && (
              <div
                className={`rounded-lg border p-3 text-xs space-y-2 ${
                  pdfModel.validation.valid
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
                    : 'border-red-300 bg-red-50 text-red-950'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    {pdfModel.validation.valid ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-700 shrink-0" />
                    )}
                    <span>
                      {pdfModel.validation.valid
                        ? 'Canonical Topic & Assessment Gate: PASSED'
                        : 'PDF Export Blocked — Topic/Content Mismatch'}
                    </span>
                  </div>
                  {primaryUnit?.canonicalTopicId && (
                    <span className="rounded border border-current/20 bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold shrink-0">
                      ID: {primaryUnit.canonicalTopicId}
                    </span>
                  )}
                </div>

                {pdfModel.validation.valid ? (
                  <p className="text-[11px] text-emerald-900">
                    Verified match across Cover Title, Lesson Sections, Organ-Specific Diagrams (
                    <code className="font-mono">
                      {primaryUnit?.coverAtlasKey || 'vector:anatomy'}
                    </code>
                    ), 30 MCQs, 10 Written Questions, 8 Clinical Cases, Answer Keys &amp; Source Provenance.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <ul className="space-y-1 text-[11px] text-red-900 list-disc pl-4">
                      {pdfModel.validation.issues.slice(0, 4).map((iss, idx) => (
                        <li key={`${iss.code}-${idx}`}>{iss.message}</li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {customTitle.trim().length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCustomTitle('')}
                          className="rounded border border-red-300 bg-white px-2.5 py-1 text-[11px] font-bold text-red-800 hover:bg-red-100"
                        >
                          Reset Custom Cover Title
                        </button>
                      )}
                      {customTitle.trim().length >= 3 && onGenerateTopic && (
                        <button
                          type="button"
                          disabled={isGeneratingTopic}
                          onClick={async () => {
                            const desired = customTitle.trim();
                            setCustomTitle('');
                            await onGenerateTopic(desired);
                            setPdfPreviewPage(1);
                          }}
                          className="rounded bg-red-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-800 disabled:opacity-60"
                        >
                          Generate Study Guide for &ldquo;{customTitle.trim()}&rdquo;
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Infographic & 48-Question Synthesis Card */}
            {primaryUnit && (scope === 'single_topic' || scope === 'selected_topics') && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-[#0F4C81] shrink-0" aria-hidden="true" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F4C81]">
                        Textbook Infographic &amp; 48-Item Exam Engine
                      </h3>
                    </div>
                    <p className="text-xs text-slate-700 mt-1">
                      Topic: <strong className="text-slate-900">{primaryUnit.topic}</strong>
                    </p>
                  </div>
                  <span className="rounded border border-sky-300 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#0F4C81] shrink-0">
                    {activePack?.generationMethod === 'ai_verified'
                      ? 'AI-Synthesized'
                      : 'Verified Ready'}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="rounded border border-slate-200 bg-white px-1.5 py-1.5">
                    <span className="block font-mono text-xs font-bold text-[#0F4C81]">
                      {activePack?.integratedDisciplines.length || 0}
                    </span>
                    <span className="block text-[10px] text-slate-600">Sciences</span>
                  </div>
                  <div className="rounded border border-slate-200 bg-white px-1.5 py-1.5">
                    <span className="block font-mono text-xs font-bold text-[#0F4C81]">
                      {activePack?.questionBank.mcqs.length || 30}
                    </span>
                    <span className="block text-[10px] text-slate-600">MCQs</span>
                  </div>
                  <div className="rounded border border-slate-200 bg-white px-1.5 py-1.5">
                    <span className="block font-mono text-xs font-bold text-[#0F4C81]">
                      {activePack?.questionBank.writtenQuestions.length || 10}
                    </span>
                    <span className="block text-[10px] text-slate-600">Written</span>
                  </div>
                  <div className="rounded border border-slate-200 bg-white px-1.5 py-1.5">
                    <span className="block font-mono text-xs font-bold text-[#0F4C81]">
                      {activePack?.questionBank.clinicalCases.length || 8}
                    </span>
                    <span className="block text-[10px] text-slate-600">Cases</span>
                  </div>
                </div>

                {isSynthesizingAi && aiProgress && (
                  <div className="rounded border border-sky-200 bg-white p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#0F4C81]">
                      <span>{aiProgress.label}</span>
                      <span className="font-mono">{aiProgress.percent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full bg-[#0284C7] transition-all duration-300"
                        style={{ width: `${aiProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {aiError && (
                  <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 space-y-1.5">
                    <div className="flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-red-700 shrink-0 mt-0.5" />
                      <span>{aiError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSynthesizeAiPack}
                      className="inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-50"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Retry AI Synthesis</span>
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={handleSynthesizeAiPack}
                    disabled={isSynthesizingAi}
                    className="flex-1 inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-[#0F4C81] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0c3e6b] disabled:opacity-60 transition-colors"
                  >
                    {isSynthesizingAi ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                        <span>Synthesizing 4-Stage Pack...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {activePack?.generationMethod === 'ai_verified'
                            ? 'Re-Synthesize Deep AI Pack'
                            : 'Deep AI-Enrich Sciences & 48 Questions'}
                        </span>
                      </>
                    )}
                  </button>
                  {isSynthesizingAi && (
                    <button
                      type="button"
                      onClick={() => aiAbortRef.current?.abort()}
                      className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 1. Document Export Mode (Full Study Guide vs Standalone Question Bank) */}
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                1. Document Export Mode
              </span>
              <div className="space-y-1.5">
                {(
                  [
                    {
                      id: 'full_study_guide',
                      label: 'Full Illustrated Study Guide + 48-Question Bank',
                      sub: 'All 11 textbook sections, visuals, flowcharts, questions, separate keys & references',
                    },
                    {
                      id: 'question_bank_with_answers',
                      label: 'Standalone 48-Question Bank + Answer Keys',
                      sub: '30 MCQs + 10 Written + 8 Clinical Cases + separate Marking Rubrics & Rationales',
                    },
                    {
                      id: 'question_bank_self_test',
                      label: 'Self-Test Exam Paper Only (No Answers)',
                      sub: 'Printable / tablet exam paper with 30 MCQs, 10 Written & 8 Clinical Cases only',
                    },
                  ] as const
                ).map((m) => {
                  const active = exportMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setExportMode(m.id);
                        setPdfPreviewPage(1);
                        setExportSuccess(null);
                      }}
                      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-[#0F4C81] bg-sky-50/70 text-[#0F4C81]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block text-xs font-bold">{m.label}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        {m.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Export Content Scope */}
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                2. Source Content Scope
              </span>
              <div
                role="group"
                aria-label="PDF export scope"
                className="grid grid-cols-2 gap-2"
              >
                {(
                  [
                    {
                      id: 'single_topic',
                      label: 'Single Topic',
                      sub: 'Current study guide',
                    },
                    {
                      id: 'chapter',
                      label: 'Book Chapter',
                      sub: 'From indexed textbook',
                    },
                    {
                      id: 'selected_topics',
                      label: 'Selected Topics',
                      sub: 'Multi-topic compendium',
                    },
                    {
                      id: 'revision_guide',
                      label: 'Revision Guide',
                      sub: 'High-yield exam pack',
                    },
                  ] as const
                ).map((opt) => {
                  const active = scope === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setScope(opt.id);
                        if (opt.id === 'revision_guide') {
                          setStyle('compact');
                        } else if (opt.id === 'single_topic' || opt.id === 'chapter') {
                          setStyle('detailed');
                        }
                        setPdfPreviewPage(1);
                        setExportSuccess(null);
                      }}
                      className={`min-h-[52px] rounded-lg border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-[#0F4C81] bg-sky-50/70 text-[#0F4C81]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block text-xs font-bold">{opt.label}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        {opt.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scope-Specific Pickers */}
            {scope === 'single_topic' && savedGuides.length > 0 && onSelectActiveGuide && (
              <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 space-y-1.5">
                <label
                  htmlFor="pdf-single-topic-select"
                  className="block text-xs font-bold text-slate-800"
                >
                  Active Single-Topic Study Guide
                </label>
                <select
                  id="pdf-single-topic-select"
                  value={activeGuide?.id || ''}
                  onChange={(e) => {
                    const chosen = savedGuides.find((g) => g.id === e.target.value);
                    if (chosen) {
                      onSelectActiveGuide(chosen);
                      setCustomTitle('');
                      setPdfPreviewPage(1);
                      setExportSuccess(null);
                    }
                  }}
                  className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900"
                >
                  {!activeGuide && (
                    <option value="">
                      — Select a saved study guide (or generate a new topic) —
                    </option>
                  )}
                  {savedGuides.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.topic} ({g.coverage === 'none' ? 'General Medical Knowledge' : `Book Verified · p.${g.referencedPages.join(',')}`})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scope === 'chapter' && selectedChapterBook && (
              <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 space-y-3">
                <div>
                  <label
                    htmlFor="pdf-chapter-book-select"
                    className="block text-xs font-bold text-slate-800 mb-1"
                  >
                    Source Medical Textbook
                  </label>
                  <select
                    id="pdf-chapter-book-select"
                    value={selectedChapterBook.id}
                    onChange={(e) => {
                      const nextBook = textbooks.find((b) => b.id === e.target.value);
                      setChapterBookId(e.target.value);
                      if (nextBook && nextBook.pages.length > 0) {
                        setChapterPageNumbers([nextBook.pages[0].pageNumber]);
                      }
                      setPdfPreviewPage(1);
                      setExportSuccess(null);
                    }}
                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900"
                  >
                    {textbooks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} ({b.pageCount} pp.)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-800">
                      Pages ({chapterPageNumbers.length} selected)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setChapterPageNumbers(
                          selectedChapterBook.pages
                            .slice(0, 4)
                            .map((p) => p.pageNumber)
                        );
                        setPdfPreviewPage(1);
                      }}
                      className="text-[11px] font-semibold text-[#0284C7] hover:underline"
                    >
                      Select First 4
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                    {selectedChapterBook.pages.map((pg) => {
                      const checked = chapterPageNumbers.includes(pg.pageNumber);
                      return (
                        <label
                          key={pg.pageNumber}
                          className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-800 hover:bg-sky-50/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleChapterPage(pg.pageNumber)}
                            className="h-4 w-4 rounded border-slate-300 text-[#0F4C81]"
                          />
                          <span className="font-mono text-[11px] font-semibold text-[#0F4C81] shrink-0">
                            p. {pg.pageNumber}
                          </span>
                          <span className="truncate">
                            {pg.chapterTitle || `Page ${pg.pageNumber}`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {(scope === 'selected_topics' || scope === 'revision_guide') && (
              <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Saved Topics ({selectedGuideIds.length} of {savedGuides.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGuideIds(savedGuides.map((g) => g.id));
                      setPdfPreviewPage(1);
                    }}
                    className="text-[11px] font-semibold text-[#0284C7] hover:underline"
                  >
                    Select All
                  </button>
                </div>
                {savedGuides.length === 0 ? (
                  <p className="text-xs text-slate-600">
                    No saved topics yet. Generate a study guide first or export a Book Chapter.
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                    {savedGuides.map((guide) => {
                      const checked = selectedGuideIds.includes(guide.id);
                      return (
                        <label
                          key={guide.id}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs text-slate-800 hover:bg-sky-50/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleGuideId(guide.id)}
                            className="h-4 w-4 rounded border-slate-300 text-[#0F4C81]"
                          />
                          <span className="font-semibold truncate">{guide.topic}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3. Page Geometry & Dynamic Landscape Option */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    3. Base A4 Format
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['portrait', 'landscape'] as const).map((orient) => (
                      <button
                        key={orient}
                        type="button"
                        aria-pressed={orientation === orient}
                        onClick={() => {
                          setOrientation(orient);
                          setPdfPreviewPage(1);
                          setExportSuccess(null);
                        }}
                        className={`min-h-[38px] rounded-lg border px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                          orientation === orient
                            ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {orient}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    4. Density
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'detailed', label: 'Textbook' },
                        { id: 'compact', label: 'Revision' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        aria-pressed={style === st.id}
                        onClick={() => {
                          setStyle(st.id);
                          setPdfPreviewPage(1);
                          setExportSuccess(null);
                        }}
                        className={`min-h-[38px] rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          style === st.id
                            ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {orientation === 'portrait' && exportMode === 'full_study_guide' && (
                <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-[#F8FAFC] p-2.5 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoLandscapeWidePages}
                    onChange={(e) => {
                      setAutoLandscapeWidePages(e.target.checked);
                      setPdfPreviewPage(1);
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0F4C81]"
                  />
                  <div>
                    <span className="font-bold text-slate-900">
                      Auto-Landscape Wide Diagrams &amp; Tables
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Keeps textbook text &amp; question bank on A4 Portrait while rotating wide Flowcharts, Mind Maps &amp; Comparison Tables onto A4 Landscape pages.
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* 5. Custom Title */}
            <div>
              <label
                htmlFor="pdf-custom-title-input"
                className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5"
              >
                5. Custom Document Title (Optional)
              </label>
              <input
                id="pdf-custom-title-input"
                type="text"
                value={customTitle}
                onChange={(e) => {
                  setCustomTitle(e.target.value);
                  setExportSuccess(null);
                }}
                placeholder={pdfModel.title}
                className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0284C7] focus:outline-none"
              />
            </div>

            {/* 6. Included Textbook Sections */}
            {exportMode === 'full_study_guide' && (
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  6. Included Textbook &amp; Exam Sections
                </span>
                <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-slate-200 bg-[#F8FAFC] p-3">
                  {[
                    {
                      label: 'Section 1: Illustrated Cover Page & Learning Objectives',
                      checked: includeCoverPage,
                      set: setIncludeCoverPage,
                    },
                    {
                      label: 'Clickable Table of Contents & Page Index',
                      checked: includeTableOfContents,
                      set: setIncludeTableOfContents,
                    },
                    {
                      label: 'Sections 3–4: Illustrated Integrated Sciences, Flowcharts & Mind Maps',
                      checked: includeVisualDiagrams,
                      set: setIncludeVisualDiagrams,
                    },
                    {
                      label: 'Sections 5–6: Clinical Correlations, Differential Tables & Pearls',
                      checked: includeComparisonAndCases,
                      set: setIncludeComparisonAndCases,
                    },
                    {
                      label: 'Sections 7–10: 30 MCQs + 10 Written + 8 Cases + Separate Keys',
                      checked: includeQuestionBank,
                      set: (val: boolean) => {
                        setIncludeQuestionBank(val);
                        setIncludeMcqsWithAnswers(val);
                      },
                    },
                    {
                      label: 'Section 11: Three-Tier Verified Textbook & Evidence References',
                      checked: includeReferences,
                      set: setIncludeReferences,
                    },
                  ].map((item) => (
                    <label
                      key={item.label}
                      className="flex items-center gap-2.5 text-xs font-medium text-slate-800 cursor-pointer py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => {
                          item.set(e.target.checked);
                          setPdfPreviewPage(1);
                          setExportSuccess(null);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-[#0F4C81]"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Standalone Export Action Group */}
            <div className="pt-1 space-y-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => handleDownloadWithMode('full_study_guide')}
                disabled={isExporting || isExportBlocked}
                className="w-full inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#0c3e6b] disabled:opacity-50 transition-colors"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Download Full 11-Section Study Guide PDF</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadWithMode('question_bank_with_answers')}
                  disabled={isExporting || isExportBlocked}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  <ClipboardCheck className="h-3.5 w-3.5 text-[#0F4C81] shrink-0" />
                  <span>Export Q-Bank + Key</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadWithMode('question_bank_self_test')}
                  disabled={isExporting || isExportBlocked}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  <FileText className="h-3.5 w-3.5 text-[#0284C7] shrink-0" />
                  <span>Export Self-Test Only</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT PREVIEW & SELF-TESTING WORKSPACE */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col bg-slate-100/90 lg:overflow-hidden">
            {/* Segmented Preview Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
              <div
                role="tablist"
                aria-label="PDF Studio Preview Mode"
                className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
              >
                {(
                  [
                    {
                      id: 'live_pdf',
                      label: 'Live PDF Pages',
                      icon: FileText,
                    },
                    {
                      id: 'infographic_sheet',
                      label: 'Infographic Sheet',
                      icon: Layers,
                    },
                    {
                      id: 'question_bank',
                      label: '48-Question Bank (30/10/8)',
                      icon: ClipboardCheck,
                    },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = previewTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setPreviewTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                        active
                          ? 'bg-white text-[#0F4C81] shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                {isLoadingAtlas && (
                  <span className="inline-flex items-center gap-1 text-[#0284C7] font-medium">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Embedding medical plates...</span>
                  </span>
                )}
                <span className="font-mono text-[11px] font-semibold text-slate-700">
                  {pdfModel.stats.integratedScienceCount} Sciences · {pdfModel.stats.mcqCount} MCQs ·{' '}
                  {pdfModel.stats.writtenCount} Written · {pdfModel.stats.clinicalCaseCount} Cases
                </span>
              </div>
            </div>

            {/* Preview Content Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {pdfModel.units.length === 0 ? (
                <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center">
                  <FileText
                    className="mx-auto h-10 w-10 text-slate-400 mb-3"
                    aria-hidden="true"
                  />
                  <h3 className="text-base font-bold text-slate-900">
                    {pendingCanonical
                      ? `Generate "${pendingCanonical.canonicalTitle}" Before Exporting`
                      : 'No Study Material Selected'}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    {pendingCanonical
                      ? `To guarantee every section, illustration, 30 MCQs, 10 written questions, and 8 clinical cases strictly match "${pendingCanonical.canonicalTitle}", generate its canonical study guide first.`
                      : 'Choose a saved topic on the left or generate a medical topic to preview and export your illustrated PDF study guide.'}
                  </p>
                  {pendingCanonical && onGenerateTopic && (
                    <button
                      type="button"
                      disabled={isGeneratingTopic}
                      onClick={async () => {
                        setCustomTitle('');
                        await onGenerateTopic(trimmedPendingTopic);
                        setPdfPreviewPage(1);
                      }}
                      className="mt-4 inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-xs font-bold text-white hover:bg-[#0c3e6b] disabled:opacity-60"
                    >
                      {isGeneratingTopic ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Generating &ldquo;{pendingCanonical.canonicalTitle}&rdquo;...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          <span>Generate &ldquo;{pendingCanonical.canonicalTitle}&rdquo; Study Guide</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              ) : previewTab === 'live_pdf' ? (
                /* TAB 1: LIVE ACTUAL GENERATED PDF PAGE CANVAS PREVIEW */
                <div className="space-y-4">
                  {/* Page Navigation Toolbar */}
                  <div className="mx-auto max-w-[780px] flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPdfPreviewPage((p) => Math.max(1, p - 1))}
                        disabled={pdfPreviewPage <= 1}
                        aria-label="Previous PDF page"
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>

                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <span>Page</span>
                        <select
                          aria-label="Select PDF page"
                          value={pdfPreviewPage}
                          onChange={(e) => setPdfPreviewPage(Number(e.target.value))}
                          className="rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-[#0F4C81]"
                        >
                          {Array.from(
                            { length: Math.max(1, pdfTotalPages) },
                            (_, idx) => idx + 1
                          ).map((pNum) => (
                            <option key={pNum} value={pNum}>
                              {pNum}
                            </option>
                          ))}
                        </select>
                        <span className="text-slate-500 font-mono">
                          of {pdfTotalPages}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setPdfPreviewPage((p) => Math.min(pdfTotalPages, p + 1))
                        }
                        disabled={pdfPreviewPage >= pdfTotalPages}
                        aria-label="Next PDF page"
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#0F4C81]">
                        {pdfPageDimensionsLabel}
                      </span>
                    </div>
                  </div>

                  {/* Quick Jump Bar */}
                  {pdfTotalPages > 3 && (
                    <div className="mx-auto max-w-[780px] flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 mr-1">
                        Quick Jump:
                      </span>
                      {[
                        { label: 'Cover (p.1)', page: 1 },
                        { label: 'TOC (p.2)', page: Math.min(2, pdfTotalPages) },
                        {
                          label: 'Integrated Sciences',
                          page: Math.min(4, pdfTotalPages),
                        },
                        {
                          label: 'Mid-Guide / Questions',
                          page: Math.max(1, Math.round(pdfTotalPages * 0.55)),
                        },
                        {
                          label: 'Answer Keys',
                          page: Math.max(1, Math.round(pdfTotalPages * 0.82)),
                        },
                        { label: `References (p.${pdfTotalPages})`, page: pdfTotalPages },
                      ].map((jmp) => (
                        <button
                          key={jmp.label}
                          type="button"
                          onClick={() => setPdfPreviewPage(jmp.page)}
                          className={`rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${
                            pdfPreviewPage === jmp.page
                              ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {jmp.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Rendered PDF Page Canvas */}
                  <div className="flex flex-col items-center justify-center">
                    {canvasError ? (
                      <div className="mx-auto max-w-lg rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                        <p className="font-bold">Live canvas preview notice</p>
                        <p className="mt-1">{canvasError}</p>
                        <p className="mt-1">
                          Switch to the <strong>Infographic Sheet</strong> tab or click{' '}
                          <strong>Download PDF</strong> directly.
                        </p>
                      </div>
                    ) : (
                      <div className="relative inline-block overflow-x-auto max-w-full rounded-sm border border-slate-300 bg-white shadow-lg">
                        {isRenderingCanvas && (
                          <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#0F4C81] shadow-xs">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Rendering vector PDF...</span>
                          </div>
                        )}
                        <canvas
                          ref={canvasRef}
                          className="block bg-white max-w-full h-auto"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : previewTab === 'infographic_sheet' && primaryUnit ? (
                /* TAB 2: TEXTBOOK INFOGRAPHIC SHEET PREVIEW */
                <div className="mx-auto max-w-[780px] space-y-5">
                  {/* Cover & Illustrated Hero Sheet */}
                  <div className="rounded-lg border border-slate-300 bg-white p-6 shadow-sm space-y-5">
                    <div className="border-b-2 border-[#0F4C81] pb-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-[#0284C7]">
                        <span>MedAtlas Medical Textbook Infographic</span>
                        <span className="font-mono text-slate-500">
                          {pdfModel.generatedDateLabel}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-xl sm:text-2xl font-bold text-slate-900">
                        {pdfModel.title}
                      </h3>
                      <p className="mt-1 text-xs sm:text-sm text-slate-600">
                        {pdfModel.subtitle}
                      </p>
                    </div>

                    {/* Cover Medical Illustration + Callout Pins + Learning Objectives */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                      <div className="md:col-span-6 rounded-lg border border-sky-200 bg-[#F8FAFC] p-3">
                        <div className="relative overflow-hidden rounded border border-slate-200 bg-white">
                          {(() => {
                            const coverPreviewSrc = getBrowserPreviewAtlasUrl(
                              primaryUnit.topic,
                              'anatomy',
                              'atlas_plate',
                              primaryUnit.topic,
                              activePack?.integratedDisciplines[0]?.calloutPins
                            );
                            const isVectorSvg = coverPreviewSrc.startsWith('data:image/svg+xml');
                            return (
                              <img
                                src={coverPreviewSrc}
                                alt={`Medical illustration for ${primaryUnit.topic}`}
                                className={
                                  isVectorSvg
                                    ? 'h-48 w-full object-contain p-1'
                                    : 'h-48 w-full object-cover'
                                }
                              />
                            );
                          })()}
                        </div>
                        <p className="mt-2 text-[11px] font-semibold text-[#0F4C81]">
                          Topic-Matched Medical Diagram · Editable Vector Labels in PDF
                        </p>
                      </div>

                      <div className="md:col-span-6 rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F4C81]">
                          Learning Objectives
                        </h4>
                        <ul className="space-y-1.5 text-xs text-slate-700">
                          {(activePack?.learningObjectives || []).map((obj, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="font-mono font-bold text-[#0284C7] shrink-0">
                                {idx + 1}.
                              </span>
                              <span>{obj}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Topic-Adaptive Integrated Medical Sciences */}
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                        <h4 className="text-sm font-bold text-[#0F4C81]">
                          Section 3 · Topic-Relevant Integrated Medical Sciences
                        </h4>
                        <span className="text-[11px] text-slate-500">
                          {activePack?.relevantDisciplinesNote}
                        </span>
                      </div>

                      <div className="space-y-3.5">
                        {(activePack?.integratedDisciplines || []).map((block) => {
                          const meta = DISCIPLINE_META[block.discipline];
                          const previewImg = getBrowserPreviewAtlasUrl(
                            primaryUnit.topic,
                            block.discipline,
                            block.visualKind,
                            `${primaryUnit.topic} — ${block.disciplineLabel}`,
                            block.calloutPins
                          );
                          const isVectorSvg = previewImg.startsWith('data:image/svg+xml');
                          return (
                            <div
                              key={block.discipline}
                              className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white"
                                    style={{ backgroundColor: meta.accentHex }}
                                  >
                                    {meta.shortTag}
                                  </span>
                                  <h5 className="text-sm font-bold text-slate-900">
                                    {block.title}
                                  </h5>
                                </div>
                                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                                  {block.sourceBasis === 'textbook' &&
                                  block.pageNumbers.length > 0
                                    ? `Book p. ${block.pageNumbers.join(', ')}`
                                    : 'Supplementary Medical Synthesis'}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
                                <div className="md:col-span-7 space-y-2">
                                  <p className="text-xs text-slate-700 leading-relaxed">
                                    {block.detailedExplanation}
                                  </p>
                                  <ul className="space-y-1 text-xs text-slate-800">
                                    {block.keyPoints.slice(0, 4).map((pt, idx) => (
                                      <li key={idx} className="flex items-start gap-1.5">
                                        <span className="font-bold text-[#0284C7]">•</span>
                                        <span>{pt}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  <div className="rounded border border-sky-200 bg-sky-50/70 p-2 text-[11px] text-slate-800">
                                    <strong className="text-[#0F4C81]">
                                      Clinical Correlation:{' '}
                                    </strong>
                                    {block.clinicalCorrelationPearl}
                                  </div>
                                </div>

                                <div className="md:col-span-5 space-y-2">
                                  <div className="overflow-hidden rounded border border-slate-200 bg-[#F8FAFC]">
                                    <img
                                      src={previewImg}
                                      alt={block.visualCaption}
                                      className={
                                        isVectorSvg
                                          ? 'h-36 w-full object-contain p-1 bg-white'
                                          : 'h-32 w-full object-cover'
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    {block.calloutPins.slice(0, 4).map((pin, pIdx) => (
                                      <div
                                        key={`${pin.number}-${pIdx}`}
                                        className="flex items-start gap-1.5 text-[11px] text-slate-700"
                                      >
                                        <span className="font-mono font-bold text-[#0F4C81] shrink-0">
                                          [{pin.number || pIdx + 1}]
                                        </span>
                                        <span>
                                          <strong>{pin.label}:</strong> {pin.detail}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Normal vs Pathological Comparison */}
                              {(block.normalComparisonNote ||
                                block.pathologicalComparisonNote) && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                  <div className="rounded border border-emerald-200 bg-emerald-50/50 p-2.5">
                                    <span className="block text-[11px] font-bold text-emerald-900">
                                      Normal Tissue &amp; Physiology
                                    </span>
                                    <p className="mt-1 text-[11px] text-slate-700">
                                      {block.normalComparisonNote}
                                    </p>
                                  </div>
                                  <div className="rounded border border-rose-200 bg-rose-50/50 p-2.5">
                                    <span className="block text-[11px] font-bold text-rose-900">
                                      Pathological Remodeling &amp; Lesions
                                    </span>
                                    <p className="mt-1 text-[11px] text-slate-700">
                                      {block.pathologicalComparisonNote}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* Pharmacology Drug Table */}
                              {block.drugComparisonRows &&
                                block.drugComparisonRows.length > 0 && (
                                  <div className="overflow-x-auto rounded border border-slate-200">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="bg-indigo-900 text-white">
                                        <tr>
                                          <th className="px-2.5 py-1.5">Class &amp; Agents</th>
                                          <th className="px-2.5 py-1.5">Mechanism &amp; Indications</th>
                                          <th className="px-2.5 py-1.5">Adverse Effects</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200 bg-white">
                                        {block.drugComparisonRows.map((row, rIdx) => (
                                          <tr key={rIdx}>
                                            <td className="px-2.5 py-1.5 font-semibold text-slate-900">
                                              {row.drugClass} ({row.prototypeAgents})
                                            </td>
                                            <td className="px-2.5 py-1.5 text-slate-700">
                                              {row.mechanismOfAction} — {row.clinicalIndications}
                                            </td>
                                            <td className="px-2.5 py-1.5 text-slate-700">
                                              {row.adverseEffectsAndContraindications}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Three-Tier Provenance Summary */}
                    <div className="border-t border-slate-200 pt-4 space-y-2.5">
                      <h4 className="text-sm font-bold text-[#0F4C81]">
                        Section 11 · Three-Tier Source Provenance
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div className="rounded border border-slate-200 bg-[#F8FAFC] p-2.5">
                          <span className="font-bold text-[#0F4C81] block">
                            A. Uploaded Textbooks
                          </span>
                          <span className="text-slate-600 text-[11px]">
                            {pdfModel.verifiedBookReferences.length > 0
                              ? pdfModel.verifiedBookReferences
                                  .map((r) => `${r.textbookTitle} (${r.pageLabel})`)
                                  .join(' · ')
                              : '0 matching pages in uploaded books'}
                          </span>
                        </div>
                        <div className="rounded border border-amber-200 bg-amber-50/50 p-2.5">
                          <span className="font-bold text-amber-900 block">
                            B. Supplementary Disclosure
                          </span>
                          <span className="text-slate-700 text-[11px]">
                            {activePack?.sourceGapNotice}
                          </span>
                        </div>
                        <div className="rounded border border-emerald-200 bg-emerald-50/50 p-2.5">
                          <span className="font-bold text-emerald-900 block">
                            C. External Evidence
                          </span>
                          <span className="text-slate-700 text-[11px]">
                            {pdfModel.externalEvidenceReferences.length > 0
                              ? `${pdfModel.externalEvidenceReferences.length} attached PubMed/Guideline citation(s)`
                              : 'Separated cleanly — none fabricated'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* TAB 3: INTERACTIVE 48-QUESTION BANK SELF-TEST PREVIEW */
                <div className="mx-auto max-w-[820px] space-y-4">
                  {/* Question Bank Header & Answer Key Reveal Toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-xs">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                      {(
                        [
                          {
                            id: 'mcqs',
                            label: `30 MCQs (${activePack?.questionBank.mcqs.length || 30})`,
                          },
                          {
                            id: 'written',
                            label: `10 Written (${activePack?.questionBank.writtenQuestions.length || 10})`,
                          },
                          {
                            id: 'cases',
                            label: `8 Clinical Cases (${activePack?.questionBank.clinicalCases.length || 8})`,
                          },
                        ] as const
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setQbSubTab(st.id)}
                          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                            qbSubTab === st.id
                              ? 'bg-white text-[#0F4C81] shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      {qbSubTab === 'mcqs' && mcqAnsweredCount > 0 && (
                        <span className="rounded border border-sky-200 bg-sky-50 px-2.5 py-1 font-mono text-xs font-bold text-[#0F4C81]">
                          Score: {mcqCorrectCount}/{mcqAnsweredCount}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowAnswerKeysInPreview((v) => !v)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                          showAnswerKeysInPreview
                            ? 'border-emerald-700 bg-emerald-700 text-white'
                            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        {showAnswerKeysInPreview ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            <span>Hide Answer Keys</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            <span>Reveal Answer Keys &amp; Rubrics</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* SUB-TAB A: 30 MCQs */}
                  {qbSubTab === 'mcqs' && (
                    <div className="space-y-3">
                      {(activePack?.questionBank.mcqs || []).map((q) => {
                        const chosen = selfTestMcqSelections[q.id];
                        const hasChosen = chosen !== undefined;
                        const reveal = showAnswerKeysInPreview || hasChosen;
                        return (
                          <div
                            key={q.id}
                            className="rounded-lg border border-slate-200 bg-white p-4 space-y-2.5 shadow-2xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-[#0F4C81] px-2 py-0.5 font-mono text-xs font-bold text-white">
                                  Q{q.number}
                                </span>
                                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                  {q.difficulty}
                                </span>
                                <span className="text-[11px] font-semibold text-[#0284C7] capitalize">
                                  {q.discipline.replace('_', ' ')}
                                </span>
                              </div>
                              <span className="font-mono text-[10px] text-slate-500">
                                {q.sourceBasis === 'textbook' &&
                                q.pageNumbers.length > 0
                                  ? `Book p. ${q.pageNumbers.join(', ')}`
                                  : 'Supplementary Exam Synthesis'}
                              </span>
                            </div>

                            <p className="text-xs sm:text-sm font-medium text-slate-900 leading-relaxed">
                              {q.stem}
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {q.options.map((opt, oIdx) => {
                                const letter = String.fromCharCode(65 + oIdx);
                                const isCorrect = oIdx === q.correctIndex;
                                const isSelected = chosen === oIdx;
                                let btnCls =
                                  'border-slate-200 bg-[#F8FAFC] text-slate-800 hover:bg-sky-50/50';
                                if (reveal) {
                                  if (isCorrect) {
                                    btnCls =
                                      'border-emerald-500 bg-emerald-50 text-emerald-950 font-semibold';
                                  } else if (isSelected && !isCorrect) {
                                    btnCls =
                                      'border-red-400 bg-red-50 text-red-900';
                                  }
                                }
                                return (
                                  <button
                                    key={oIdx}
                                    type="button"
                                    onClick={() =>
                                      setSelfTestMcqSelections((prev) => ({
                                        ...prev,
                                        [q.id]: oIdx,
                                      }))
                                    }
                                    className={`flex items-start gap-2 rounded-md border p-2 text-left text-xs transition-colors ${btnCls}`}
                                  >
                                    <span className="font-mono font-bold shrink-0">
                                      {letter}.
                                    </span>
                                    <span>{opt}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {reveal && (
                              <div className="rounded border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-slate-800 space-y-1">
                                <p className="font-bold text-emerald-900">
                                  Correct Answer: {String.fromCharCode(65 + q.correctIndex)}
                                </p>
                                <p>{q.explanation}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* SUB-TAB B: 10 WRITTEN QUESTIONS */}
                  {qbSubTab === 'written' && (
                    <div className="space-y-3">
                      {(activePack?.questionBank.writtenQuestions || []).map((wq) => (
                        <div
                          key={wq.id}
                          className="rounded-lg border border-slate-200 bg-white p-4 space-y-2.5 shadow-2xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-[#0F4C81] px-2 py-0.5 font-mono text-xs font-bold text-white">
                                W{wq.number}
                              </span>
                              <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-[#0F4C81]">
                                {wq.commandVerb}
                              </span>
                              <span className="font-mono text-[11px] font-semibold text-slate-600">
                                [{wq.totalMarks} Marks]
                              </span>
                            </div>
                          </div>

                          <p className="text-xs sm:text-sm font-medium text-slate-900 leading-relaxed">
                            {wq.prompt}
                          </p>

                          {showAnswerKeysInPreview && (
                            <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3 text-xs space-y-2">
                              <div>
                                <span className="font-bold text-emerald-900 block mb-1">
                                  Marking Rubric ({wq.totalMarks} Marks):
                                </span>
                                <ul className="space-y-0.5 text-slate-800">
                                  {wq.markingPoints.map((kp, idx) => (
                                    <li key={idx}>
                                      • {kp.point} <strong className="font-mono">({kp.marks}m)</strong>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="border-t border-emerald-200 pt-2 text-slate-800">
                                <strong className="text-emerald-950">Model Answer: </strong>
                                {wq.modelAnswer}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SUB-TAB C: 8 PROGRESSIVE CLINICAL CASES */}
                  {qbSubTab === 'cases' && (
                    <div className="space-y-3.5">
                      {(activePack?.questionBank.clinicalCases || []).map((cc) => (
                        <div
                          key={cc.id}
                          className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 shadow-2xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-[#0F4C81] px-2 py-0.5 font-mono text-xs font-bold text-white">
                                Case {cc.number}
                              </span>
                              <h5 className="text-sm font-bold text-slate-900">
                                {cc.title}
                              </h5>
                            </div>
                            <span className="font-mono text-[11px] text-slate-600">
                              {cc.difficulty}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-7 space-y-1.5 text-xs text-slate-800 leading-relaxed">
                              <p>
                                <strong>Clinical Presentation:</strong> {cc.patientPresentation}
                              </p>
                            </div>
                            <div className="md:col-span-5 overflow-x-auto rounded border border-slate-200">
                              <table className="w-full text-left text-[11px]">
                                <thead className="bg-slate-800 text-white">
                                  <tr>
                                    <th className="px-2 py-1">Parameter</th>
                                    <th className="px-2 py-1">Value</th>
                                    <th className="px-2 py-1">Ref</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 bg-white">
                                  {cc.vitalsAndLabs.map((vl, idx) => (
                                    <tr key={idx}>
                                      <td className="px-2 py-1 font-medium text-slate-800">
                                        {vl.parameter}
                                      </td>
                                      <td
                                        className={`px-2 py-1 font-mono ${
                                          vl.flag && vl.flag !== 'normal'
                                            ? 'font-bold text-red-700'
                                            : 'text-slate-800'
                                        }`}
                                      >
                                        {vl.value}
                                      </td>
                                      <td className="px-2 py-1 font-mono text-slate-500">
                                        {vl.referenceRange || '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="space-y-2 pt-1">
                            {cc.progressiveQuestions.map((sq) => (
                              <div
                                key={sq.partLabel}
                                className="rounded border border-slate-200 bg-[#F8FAFC] p-2.5 text-xs space-y-1"
                              >
                                <p className="font-semibold text-slate-900">
                                  ({sq.partLabel}) [{sq.focusArea}] {sq.question}
                                </p>
                                {showAnswerKeysInPreview && (
                                  <div className="text-emerald-950 bg-emerald-50/80 border border-emerald-200 rounded p-2 mt-1 space-y-1">
                                    <p>
                                      <strong>Model Answer:</strong> {sq.modelAnswer}
                                    </p>
                                    <p className="text-[11px] text-slate-700">
                                      <strong>Rationale:</strong> {sq.rationale}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {showAnswerKeysInPreview && (
                            <div className="rounded border border-sky-200 bg-sky-50/70 p-2.5 text-xs text-slate-800">
                              <strong className="text-[#0F4C81]">Case Pearl: </strong>
                              {cc.clinicalPearl}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
