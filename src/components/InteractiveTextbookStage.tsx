import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  Eye,
  FileText,
  Layers,
  RotateCcw,
  SplitSquareHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  BookPageCitation,
  LanguageMode,
  LectureExternalReference,
  LectureGlossaryTerm,
  LectureScene,
  MedicalSubjectDiscipline,
} from '../types/medical';
import {
  drawDoctorAvatarPortrait,
  drawStandingProfessorStudio,
} from '../utils/lectureCanvasRenderer';
import { renderThreeStudioSnapshot } from '../utils/lectureThreeRenderer';
import {
  buildLectureRevisionPack,
  computeSceneTimeline,
  getDisciplineVisualSpec,
  getDoctorProfile,
  inferSceneDiscipline,
  MEDICAL_DISCIPLINE_META,
  splitNarrationIntoCues,
} from '../utils/lectureStudioEngine';
import {
  getPathologyHistologySplitUrl,
  getStudioHallBackdropUrl,
  resolveSceneAtlasAsset,
} from '../utils/medicalAtlasAssets';
import { flattenClickableCitations } from '../utils/multiBookEngine';

export interface InteractiveTextbookStageProps {
  lectureTitle: string;
  scenes: LectureScene[];
  activeScene: LectureScene;
  activeSceneIndex: number;
  sceneProgress: number;
  currentTimeSec: number;
  totalDurationSec: number;
  presenterId: string;
  language: LanguageMode;
  showSubtitles: boolean;
  isPlaying: boolean;
  mouthOpenness: number;
  isSpeaking: boolean;
  preferredDiscipline?: MedicalSubjectDiscipline | 'auto';
  externalReferences: LectureExternalReference[];
  aggregateCitations: BookPageCitation[];
  onReplayScene: () => void;
  onJumpToSceneIndex: (idx: number) => void;
  onSeekToTime?: (sec: number) => void;
  onOpenPage: (pageNumber: number, textbookId?: string) => void;
  stageViewMode?: 'textbook' | 'video';
  videoCanvasSlot?: React.ReactNode;
}

function formatCueClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const DISCIPLINE_OPTIONS: Array<{
  id: 'auto' | MedicalSubjectDiscipline;
  label: string;
}> = [
  { id: 'auto', label: 'Scene Default' },
  { id: 'anatomy', label: 'Anatomy' },
  { id: 'physiology', label: 'Physiology' },
  { id: 'pathology', label: 'Pathology' },
  { id: 'pharmacology', label: 'Pharmacology' },
  { id: 'immunology', label: 'Immunology' },
];

function getZoomOriginClass(xPct: number, yPct: number): string {
  const horiz = xPct < 36 ? 'left' : xPct > 64 ? 'right' : 'center';
  const vert = yPct < 36 ? 'top' : yPct > 64 ? 'bottom' : 'center';
  if (vert === 'top') {
    if (horiz === 'left') return 'origin-top-left';
    if (horiz === 'right') return 'origin-top-right';
    return 'origin-top';
  }
  if (vert === 'bottom') {
    if (horiz === 'left') return 'origin-bottom-left';
    if (horiz === 'right') return 'origin-bottom-right';
    return 'origin-bottom';
  }
  if (horiz === 'left') return 'origin-left';
  if (horiz === 'right') return 'origin-right';
  return 'origin-center';
}

export const InteractiveTextbookStage: React.FC<InteractiveTextbookStageProps> = ({
  lectureTitle,
  scenes,
  activeScene,
  activeSceneIndex,
  sceneProgress,
  currentTimeSec,
  presenterId,
  language,
  showSubtitles,
  mouthOpenness,
  isSpeaking,
  preferredDiscipline = 'auto',
  externalReferences,
  onReplayScene,
  onJumpToSceneIndex,
  onSeekToTime,
  onOpenPage,
  stageViewMode = 'textbook',
  videoCanvasSlot,
}) => {
  const desktopProfessorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mobileAvatarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const organ3dCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasWebGl3d, setHasWebGl3d] = useState<boolean>(false);

  const [selectedGlossaryTerm, setSelectedGlossaryTerm] =
    useState<LectureGlossaryTerm | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [isCloseUpZoom, setIsCloseUpZoom] = useState<boolean>(false);
  const [showFullSceneText, setShowFullSceneText] = useState<boolean>(false);
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState<boolean>(false);
  const [disciplineLens, setDisciplineLens] = useState<'auto' | MedicalSubjectDiscipline>(
    'auto'
  );
  const [showShiftedCurve, setShowShiftedCurve] = useState<boolean>(true);
  const [selectedFeedbackIdx, setSelectedFeedbackIdx] = useState<number | null>(null);
  const [pathologyViewTab, setPathologyViewTab] = useState<'split_he' | 'gross_compare'>(
    'split_he'
  );
  const [manualMechanismStep, setManualMechanismStep] = useState<number | null>(null);
  const [selectedMindMapNodeId, setSelectedMindMapNodeId] = useState<string | null>(null);

  const profile = useMemo(() => getDoctorProfile(presenterId), [presenterId]);

  const effectiveDiscipline: MedicalSubjectDiscipline = useMemo(() => {
    if (disciplineLens !== 'auto') return disciplineLens;
    return inferSceneDiscipline(activeScene, lectureTitle, preferredDiscipline);
  }, [disciplineLens, activeScene, lectureTitle, preferredDiscipline]);

  const discMeta = MEDICAL_DISCIPLINE_META[effectiveDiscipline];

  const disciplineSpec = useMemo(
    () => getDisciplineVisualSpec(activeScene, lectureTitle, effectiveDiscipline),
    [activeScene, lectureTitle, effectiveDiscipline]
  );

  const atlasPlate = useMemo(
    () =>
      resolveSceneAtlasAsset(
        activeScene.systemTemplate,
        activeScene.visualMode,
        effectiveDiscipline,
        lectureTitle
      ),
    [activeScene.systemTemplate, activeScene.visualMode, effectiveDiscipline, lectureTitle]
  );

  const revisionPack = useMemo(
    () =>
      buildLectureRevisionPack({
        topic: lectureTitle,
        scenes,
      }),
    [lectureTitle, scenes]
  );

  useEffect(() => {
    setSelectedGlossaryTerm(null);
    setSelectedPinId(null);
    setIsCloseUpZoom(false);
    setShowFullSceneText(false);
    setDisciplineLens('auto');
    setSelectedFeedbackIdx(null);
    setManualMechanismStep(null);
  }, [activeScene.id]);

  const pins = useMemo(
    () =>
      disciplineLens === 'auto' &&
      activeScene.anatomicalPins &&
      activeScene.anatomicalPins.length > 0
        ? activeScene.anatomicalPins
        : atlasPlate.pins,
    [disciplineLens, activeScene.anatomicalPins, atlasPlate.pins]
  );

  const autoActivePinIndex =
    pins.length > 0
      ? Math.min(pins.length - 1, Math.floor(sceneProgress * pins.length))
      : 0;

  const focusedPin = useMemo(() => {
    if (selectedPinId) {
      const explicit = pins.find((p) => p.id === selectedPinId);
      if (explicit) return explicit;
    }
    return pins[autoActivePinIndex] || null;
  }, [pins, selectedPinId, autoActivePinIndex]);

  const activeGestureSummary = useMemo(() => {
    if (activeScene.visualMode === 'references' && disciplineLens === 'auto') {
      const mmNode =
        revisionPack.mindMap.nodes.find((n) => n.id === selectedMindMapNodeId) ||
        revisionPack.mindMap.nodes[0];
      return {
        label: mmNode ? `Mind Map: ${mmNode.label}` : 'Integrated Topic Summary',
        ratioY: 0.42,
      };
    }
    if (activeScene.visualMode === 'comparison' && disciplineLens === 'auto') {
      const rows = activeScene.comparisonTable?.rows || [];
      const rIdx =
        rows.length > 0
          ? Math.min(rows.length - 1, Math.floor(sceneProgress * rows.length))
          : 0;
      return {
        label: rows[rIdx]?.[0] || activeScene.comparisonTable?.caption || activeScene.title,
        ratioY: 0.32 + (rIdx / Math.max(1, rows.length)) * 0.45,
      };
    }
    if (effectiveDiscipline === 'physiology') {
      const fbSteps = disciplineSpec.physiology.feedbackSteps;
      const stepIdx =
        selectedFeedbackIdx !== null
          ? selectedFeedbackIdx
          : Math.min(fbSteps.length - 1, Math.floor(sceneProgress * fbSteps.length));
      return {
        label:
          sceneProgress < 0.45 && selectedFeedbackIdx === null
            ? disciplineSpec.physiology.curveTitle
            : `${fbSteps[stepIdx]?.role}: ${fbSteps[stepIdx]?.label}`,
        ratioY: sceneProgress < 0.45 && selectedFeedbackIdx === null ? 0.34 : 0.68,
      };
    }
    if (effectiveDiscipline === 'pathology') {
      const stages = disciplineSpec.pathology.progressionCascade;
      const stIdx =
        manualMechanismStep !== null
          ? manualMechanismStep % stages.length
          : Math.min(stages.length - 1, Math.floor(sceneProgress * stages.length));
      return {
        label:
          sceneProgress < 0.4 && manualMechanismStep === null
            ? disciplineSpec.pathology.abnormalTitle
            : stages[stIdx]?.stage || activeScene.title,
        ratioY: sceneProgress < 0.4 && manualMechanismStep === null ? 0.38 : 0.72,
      };
    }
    if (effectiveDiscipline === 'pharmacology') {
      const stepIdx =
        manualMechanismStep !== null
          ? manualMechanismStep % disciplineSpec.pharmacology.mechanismSteps.length
          : Math.min(2, Math.floor(sceneProgress * 3));
      return {
        label:
          focusedPin?.label ||
          disciplineSpec.pharmacology.mechanismSteps[stepIdx]?.step ||
          'Receptor Binding',
        ratioY: 0.34 + stepIdx * 0.18,
      };
    }
    if (effectiveDiscipline === 'immunology') {
      const nodeIdx =
        manualMechanismStep !== null
          ? manualMechanismStep % disciplineSpec.immunology.nodes.length
          : Math.min(
              disciplineSpec.immunology.nodes.length - 1,
              Math.floor(sceneProgress * disciplineSpec.immunology.nodes.length)
            );
      return {
        label:
          disciplineSpec.immunology.nodes[nodeIdx]?.title ||
          focusedPin?.label ||
          'Immunological Synapse',
        ratioY: 0.36 + nodeIdx * 0.14,
      };
    }
    return {
      label: focusedPin?.label || activeScene.title,
      ratioY: focusedPin
        ? Math.max(0.2, Math.min(0.82, focusedPin.targetYPct / 100))
        : 0.45,
    };
  }, [
    activeScene,
    disciplineLens,
    effectiveDiscipline,
    disciplineSpec,
    focusedPin,
    manualMechanismStep,
    revisionPack.mindMap.nodes,
    sceneProgress,
    selectedFeedbackIdx,
    selectedMindMapNodeId,
  ]);

  // Draw live 3D Doctor Presenter + 3D Organ Model when stageViewMode === 'textbook'
  useEffect(() => {
    if (stageViewMode !== 'textbook') return;

    const threeSnap = renderThreeStudioSnapshot({
      doctor: profile,
      topic: lectureTitle,
      systemTemplate: activeScene.systemTemplate,
      visualMode: activeScene.visualMode,
      discipline: effectiveDiscipline,
      timeSec: currentTimeSec,
      sceneProgress,
      mouthOpen01: mouthOpenness,
      isSpeaking,
    });

    if (threeSnap.isWebGlActive !== hasWebGl3d) {
      setHasWebGl3d(threeSnap.isWebGlActive);
    }

    const deskCanvas = desktopProfessorCanvasRef.current;
    if (deskCanvas) {
      const ctx = deskCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, deskCanvas.width, deskCanvas.height);
        drawStandingProfessorStudio(
          ctx,
          { x: 0, y: 0, w: deskCanvas.width, h: deskCanvas.height },
          profile,
          currentTimeSec,
          mouthOpenness,
          isSpeaking,
          activeGestureSummary.ratioY,
          activeGestureSummary.label,
          threeSnap.presenterCanvas,
          threeSnap.isWebGlActive
        );
      }
    }

    const mobCanvas = mobileAvatarCanvasRef.current;
    if (mobCanvas) {
      const ctx = mobCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, mobCanvas.width, mobCanvas.height);
        drawDoctorAvatarPortrait(
          ctx,
          { x: 0, y: 0, w: mobCanvas.width, h: mobCanvas.height },
          profile,
          currentTimeSec,
          mouthOpenness,
          isSpeaking,
          activeGestureSummary.ratioY,
          threeSnap.presenterCanvas
        );
      }
    }

    const organCanvas = organ3dCanvasRef.current;
    if (organCanvas && threeSnap.organCanvas && threeSnap.isWebGlActive) {
      const oCtx = organCanvas.getContext('2d');
      if (oCtx) {
        oCtx.clearRect(0, 0, organCanvas.width, organCanvas.height);
        oCtx.drawImage(
          threeSnap.organCanvas,
          0,
          0,
          organCanvas.width,
          organCanvas.height
        );
      }
    }
  }, [
    stageViewMode,
    profile,
    lectureTitle,
    activeScene.systemTemplate,
    activeScene.visualMode,
    effectiveDiscipline,
    currentTimeSec,
    sceneProgress,
    mouthOpenness,
    isSpeaking,
    activeGestureSummary.ratioY,
    activeGestureSummary.label,
    hasWebGl3d,
  ]);

  const allCues = useMemo(
    () => splitNarrationIntoCues(scenes, language),
    [scenes, language]
  );
  const sceneCues = useMemo(
    () => allCues.filter((c) => c.sceneId === activeScene.id),
    [allCues, activeScene.id]
  );

  const activeCueIndex = useMemo(() => {
    const found = sceneCues.findIndex(
      (c) => currentTimeSec >= c.startSec && currentTimeSec <= c.endSec + 0.08
    );
    return found >= 0 ? found : -1;
  }, [sceneCues, currentTimeSec]);

  const glossaryTerms = activeScene.glossaryTerms || [];

  const sceneCitations = useMemo(
    () => flattenClickableCitations(activeScene.bookCitations, []),
    [activeScene.bookCitations]
  );

  const sceneTimeline = useMemo(() => computeSceneTimeline(scenes), [scenes]);

  const renderCueWithClickableTerms = (text: string) => {
    if (!glossaryTerms.length || language === 'ar-eg') {
      return text;
    }
    const escaped = glossaryTerms
      .map((g) => g.term.trim())
      .filter((t) => t.length >= 3)
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (escaped.length === 0) return text;
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, idx) => {
      const matched = glossaryTerms.find(
        (g) => g.term.toLowerCase() === part.toLowerCase()
      );
      if (!matched) {
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      }
      const isSelected = selectedGlossaryTerm?.term === matched.term;
      return (
        <button
          key={`${matched.term}-${idx}`}
          type="button"
          onClick={() =>
            setSelectedGlossaryTerm((prev) =>
              prev?.term === matched.term ? null : matched
            )
          }
          className={`inline font-semibold underline decoration-dotted decoration-2 underline-offset-4 transition-colors rounded px-0.5 ${
            isSelected
              ? 'bg-sky-100 text-[#0F4C81] decoration-[#0F4C81]'
              : 'text-[#0F4C81] decoration-[#0284C7] hover:bg-sky-50'
          }`}
          title={`Click to view explanation of ${matched.term}`}
        >
          {part}
        </button>
      );
    });
  };

  const provenanceDescription = useMemo(() => {
    if (activeScene.visualMode === 'references' && disciplineLens === 'auto') {
      return '2D Vector Mind Map & Clinical Flowchart';
    }
    if (activeScene.visualMode === 'comparison' && disciplineLens === 'auto') {
      return '2D Clinical Comparison Matrix';
    }
    if (effectiveDiscipline === 'physiology') {
      return hasWebGl3d
        ? '2D Dynamic Curve + Procedural 3D Organ Model'
        : '2D Dynamic Curve + 2D Organ Diagram';
    }
    if (effectiveDiscipline === 'pathology') {
      return pathologyViewTab === 'split_he'
        ? '2D H&E Histopathology Schematic (Illustrative)'
        : hasWebGl3d
          ? 'Procedural 3D Organ Model + 2D Progression Cascade'
          : '2D Organ Comparison + 2D Progression Cascade';
    }
    return hasWebGl3d
      ? `Procedural 3D WebGL Model + ${atlasPlate.provenanceLabel}`
      : atlasPlate.provenanceLabel;
  }, [
    activeScene.visualMode,
    disciplineLens,
    effectiveDiscipline,
    pathologyViewTab,
    atlasPlate.provenanceLabel,
    hasWebGl3d,
  ]);

  const isShowingReferencesBoard =
    activeScene.visualMode === 'references' && disciplineLens === 'auto';
  const isShowingComparisonBoard =
    activeScene.visualMode === 'comparison' && disciplineLens === 'auto';

  return (
    <div
      data-testid="interactive-textbook-stage"
      className="relative rounded-xl border border-slate-200 bg-[#EEF3F8] overflow-hidden"
    >
      {/* Keep 16:9 continuous video canvas mounted */}
      {videoCanvasSlot && (
        <div className={stageViewMode === 'video' ? 'block bg-[#EEF3F8]' : 'hidden'}>
          {videoCanvasSlot}
        </div>
      )}

      {stageViewMode === 'textbook' && (
        <div className="p-2.5 sm:p-4 space-y-3 bg-[#EEF3F8]">
          {/* MOBILE / TABLET COMPACT DOCTOR PRESENTER HEADER (<1024px) */}
          <div className="lg:hidden rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <canvas
                  ref={mobileAvatarCanvasRef}
                  width={124}
                  height={94}
                  aria-label={`Medical presenter ${profile.name}`}
                  className="h-14 w-[76px] shrink-0 rounded-lg border border-slate-200 bg-[#F1F5F9]"
                />
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-[#0F4C81] truncate">
                    {profile.displayLabel || profile.name} ({profile.name})
                  </div>
                  <div className="text-[11px] text-slate-600 truncate">
                    White Coat · Voice: {profile.geminiVoice}
                  </div>
                  <div className="text-[11px] font-medium text-[#0284C7] truncate mt-0.5">
                    → {activeGestureSummary.label}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onReplayScene}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                  <span>Replay</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowTranscriptDrawer((v) => !v)}
                  aria-pressed={showTranscriptDrawer}
                  className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    showTranscriptDrawer
                      ? 'border-[#0284C7] bg-sky-50 text-[#0F4C81]'
                      : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                  <span>Transcript</span>
                </button>
              </div>
            </div>
          </div>

          {/* STUDIO COMPOSITE: Left Consistent Doctor Presenter (3 cols) + Right Electronic Smartboard (9 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
            {/* LEFT DOCTOR PRESENTER STAGE (Desktop lg+) */}
            <aside
              data-testid="professor-studio-stage"
              aria-label="Medical Presenter Stage"
              className="hidden lg:flex lg:col-span-3 lg:sticky lg:top-4 flex-col rounded-xl border border-slate-200 bg-gradient-to-b from-[#F8FAFC] to-[#E2E8F0] overflow-hidden"
            >
              <div className="relative aspect-[296/530] w-full bg-gradient-to-b from-[#F1F5F9] to-[#DCE4EE] overflow-hidden">
                <img
                  src={getStudioHallBackdropUrl()}
                  alt="Medical lecture studio backdrop"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover opacity-15 pointer-events-none select-none"
                />
                <canvas
                  ref={desktopProfessorCanvasRef}
                  width={296}
                  height={530}
                  aria-label={`Standing medical presenter ${profile.name} pointing toward ${activeGestureSummary.label}`}
                  className="relative z-10 block h-full w-full"
                />
              </div>

              <div className="border-t border-slate-200 bg-white p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#0284C7]">
                  <span className="truncate" title={activeGestureSummary.label}>
                    → {activeGestureSummary.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={onReplayScene}
                    className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                    <span>Replay Scene</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTranscriptDrawer((v) => !v)}
                    aria-pressed={showTranscriptDrawer}
                    className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                      showTranscriptDrawer
                        ? 'border-[#0284C7] bg-sky-50 text-[#0F4C81]'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                    <span>Transcript</span>
                  </button>
                </div>
              </div>
            </aside>

            {/* RIGHT INTERACTIVE ELECTRONIC TEACHING SMARTBOARD */}
            <div
              data-testid="digital-teaching-screen"
              className="lg:col-span-9 rounded-xl border border-slate-300 bg-white text-slate-900 overflow-hidden shadow-sm flex flex-col"
            >
              {/* Smartboard Top Header: Single Main Concept + Provenance */}
              <div className="border-b border-slate-200 bg-[#F8FAFC] px-3.5 py-3 sm:px-5 space-y-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-medium">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-bold text-[#0284C7] tabular-nums">
                        Scene {activeScene.sceneNumber} of {scenes.length}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono font-bold text-[#0F4C81]">
                        [{discMeta.shortBadge}] {discMeta.label}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{activeScene.sectionKicker || discMeta.pedagogyFocus}</span>
                    </div>

                    <span className="text-[11px] font-mono text-slate-500">
                      {provenanceDescription}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-serif text-lg sm:text-2xl font-bold text-[#0F4C81] leading-snug">
                      {activeScene.title}
                    </h2>

                    {activeScene.sourceBasis === 'textbook' && sceneCitations.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-900">
                        <span className="font-semibold">Uploaded Book:</span>
                        {sceneCitations.map((cit, idx) => (
                          <React.Fragment key={cit.key}>
                            {idx > 0 && <span aria-hidden="true">·</span>}
                            <button
                              type="button"
                              onClick={() => onOpenPage(cit.pageNumber, cit.textbookId)}
                              className="inline-flex min-h-[28px] items-center gap-1 font-mono font-semibold text-emerald-800 underline decoration-emerald-600/60 underline-offset-4 hover:text-emerald-950"
                            >
                              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>
                                {cit.shortTitle} p.{cit.pageNumber}
                              </span>
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    ) : externalReferences.length > 0 ? (
                      <span className="text-xs font-medium text-sky-800">
                        External Evidence + General Medical Knowledge
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-600">
                        General Medical Knowledge (Outside Uploaded Books)
                      </span>
                    )}
                  </div>
                </div>

                {/* Subject Lens Switcher */}
                <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                  <div
                    role="group"
                    aria-label="Subject-specific medical visualization lens"
                    className="flex flex-wrap items-center gap-1"
                  >
                    <Layers
                      className="h-3.5 w-3.5 text-slate-500 mr-1 hidden sm:inline"
                      aria-hidden="true"
                    />
                    {DISCIPLINE_OPTIONS.map((opt) => {
                      const isSelected = disciplineLens === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          data-testid={`discipline-lens-${opt.id}`}
                          onClick={() => {
                            setDisciplineLens(opt.id);
                            setSelectedPinId(null);
                            setManualMechanismStep(null);
                          }}
                          aria-pressed={isSelected}
                          className={`min-h-[36px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                            isSelected
                              ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowFullSceneText((v) => !v)}
                    aria-pressed={showFullSceneText}
                    className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      showFullSceneText
                        ? 'border-[#0F4C81] bg-sky-50 text-[#0F4C81]'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{showFullSceneText ? 'Progressive Sync' : 'Show All Labels'}</span>
                  </button>
                </div>
              </div>

              {/* SMARTBOARD BODY: Left Focused Key Concepts (4 cols) | Right Primary Medical Visual (8 cols) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 flex-1">
                {/* LEFT COLUMN (4 cols): Concise Key Labels + Active Cue + Terminology */}
                <div className="lg:col-span-4 p-3.5 sm:p-4 space-y-3.5 bg-white">
                  {!isShowingReferencesBoard ? (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F4C81]">
                        Highlighted Concept Labels
                      </h3>
                      <ol className="space-y-2">
                        {(activeScene.onScreenLabels && activeScene.onScreenLabels.length > 0
                          ? activeScene.onScreenLabels
                          : activeScene.keyBullets || []
                        )
                          .slice(0, 4)
                          .map((label, idx, arr) => {
                            const activeIdx = Math.min(
                              arr.length - 1,
                              Math.floor(sceneProgress * arr.length)
                            );
                            const isHighlighted = idx === activeIdx;
                            const isRevealed =
                              showFullSceneText ||
                              sceneProgress >= (idx / Math.max(1, arr.length)) * 0.85 ||
                              idx === 0;
                            return (
                              <li
                                key={idx}
                                className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs sm:text-sm font-semibold leading-snug transition-colors ${
                                  isHighlighted
                                    ? 'border-[#0284C7] bg-sky-50 text-[#0F4C81]'
                                    : isRevealed
                                      ? 'border-slate-200 bg-white text-slate-900'
                                      : 'border-slate-100 bg-slate-50/70 text-slate-400'
                                }`}
                              >
                                <span className="font-mono font-bold text-[#0284C7] tabular-nums shrink-0">
                                  0{idx + 1}
                                </span>
                                <span>{label.replace(/^\d+\.\s*/, '')}</span>
                              </li>
                            );
                          })}
                      </ol>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F4C81]">
                        Lesson Sequence Summary
                      </h3>
                      <ol className="space-y-1.5">
                        {revisionPack.structuredSummary.map((line, idx) => (
                          <li
                            key={idx}
                            className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs font-medium leading-snug text-slate-800"
                          >
                            {line}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Active Spoken Sentence Only (avoids long paragraphs on the smartboard!) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-700">
                        Active Narration Focus
                      </h3>
                      <span className="text-[11px] text-slate-500">
                        {language === 'ar-eg' ? 'مصري + Medical' : 'Medical English'}
                      </span>
                    </div>
                    <div
                      dir={language === 'ar-eg' ? 'rtl' : 'ltr'}
                      className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 text-xs sm:text-sm font-medium leading-relaxed text-slate-900"
                    >
                      {sceneCues.length > 0
                        ? renderCueWithClickableTerms(
                            (sceneCues[Math.max(0, activeCueIndex)] || sceneCues[0]).text
                          )
                        : activeScene.narrationEn}
                    </div>
                  </div>

                  {/* Clickable Medical Terminology Chips */}
                  {glossaryTerms.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-700">
                        Key Medical Terms:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {glossaryTerms.map((item) => {
                          const isSelected = selectedGlossaryTerm?.term === item.term;
                          return (
                            <button
                              key={item.term}
                              type="button"
                              onClick={() =>
                                setSelectedGlossaryTerm((prev) =>
                                  prev?.term === item.term ? null : item
                                )
                              }
                              aria-expanded={isSelected}
                              className={`min-h-[34px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                                isSelected
                                  ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                                  : 'border-slate-200 bg-white text-[#0F4C81] hover:bg-sky-50'
                              }`}
                            >
                              {item.term}
                            </button>
                          );
                        })}
                      </div>

                      {selectedGlossaryTerm && (
                        <div
                          role="region"
                          aria-label={`Definition of ${selectedGlossaryTerm.term}`}
                          className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#0F4C81] text-sm">
                              {selectedGlossaryTerm.term}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedGlossaryTerm(null)}
                              className="text-slate-500 hover:text-slate-800 font-semibold"
                            >
                              Close
                            </button>
                          </div>
                          <p className="text-slate-800 leading-relaxed">
                            {selectedGlossaryTerm.definition}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeScene.clinicalPearl && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 space-y-1">
                      <div className="text-xs font-bold text-[#0369A1]">
                        Clinical Pearl
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed">
                        {activeScene.clinicalPearl}
                      </p>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN (8 cols): Primary Synchronized Medical Diagram / 3D Model */}
                <div className="lg:col-span-8 p-3.5 sm:p-4 bg-[#F8FAFC]/70 space-y-3.5">
                  {/* Real-Time 3D Medical Organ / Mechanism Viewport when WebGL is supported */}
                  {hasWebGl3d && !isShowingReferencesBoard && !isShowingComparisonBoard && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#0F4C81]">
                          Synchronized 3D Medical Animation ({lectureTitle})
                        </span>
                        <span className="text-[11px] font-mono font-semibold text-[#0284C7]">
                          Real-Time 3D WebGL Model
                        </span>
                      </div>
                      <canvas
                        ref={organ3dCanvasRef}
                        width={640}
                        height={240}
                        aria-label={`3D animated medical model for ${lectureTitle}`}
                        className="w-full h-auto max-h-[220px] rounded-lg bg-slate-50 border border-slate-100 block"
                      />
                    </div>
                  )}

                  {isShowingReferencesBoard ? (
                    <div data-testid="lecture-revision-section" className="space-y-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-xs sm:text-sm font-bold text-[#0F4C81]">
                            Integrated Concept Mind Map
                          </h3>
                          <span className="text-[11px] font-mono text-slate-500">
                            2D Vector Diagram
                          </span>
                        </div>

                        <div className="w-full overflow-x-auto">
                          <svg
                            viewBox="0 0 660 280"
                            className="w-full h-auto min-w-[300px]"
                            role="img"
                            aria-label={`Concept mind map for ${lectureTitle}`}
                          >
                            {revisionPack.mindMap.nodes.slice(0, 4).map((node, idx) => {
                              const coords = [
                                { x: 132, y: 64 },
                                { x: 528, y: 64 },
                                { x: 132, y: 218 },
                                { x: 528, y: 218 },
                              ][idx % 4];
                              const isSelected = selectedMindMapNodeId === node.id;
                              const nDisc = node.disciplineTag || 'physiology';
                              const nMeta = MEDICAL_DISCIPLINE_META[nDisc];
                              return (
                                <g
                                  key={node.id}
                                  onClick={() =>
                                    setSelectedMindMapNodeId((prev) =>
                                      prev === node.id ? null : node.id
                                    )
                                  }
                                  className="cursor-pointer"
                                >
                                  <line
                                    x1={330}
                                    y1={140}
                                    x2={coords.x}
                                    y2={coords.y}
                                    stroke={nMeta.accentHex}
                                    strokeWidth={isSelected ? 3 : 2}
                                  />
                                  <rect
                                    x={coords.x - 118}
                                    y={coords.y - 30}
                                    width={236}
                                    height={60}
                                    rx={10}
                                    fill={isSelected ? '#F0F9FF' : '#FFFFFF'}
                                    stroke={nMeta.accentHex}
                                    strokeWidth={isSelected ? 2.4 : 1.5}
                                  />
                                  <text
                                    x={coords.x}
                                    y={coords.y - 9}
                                    textAnchor="middle"
                                    fill={nMeta.accentHex}
                                    fontSize="10"
                                    fontWeight="700"
                                  >
                                    [{nMeta.shortBadge}] {node.relationLabel || nMeta.label}
                                  </text>
                                  <text
                                    x={coords.x}
                                    y={coords.y + 11}
                                    textAnchor="middle"
                                    fill="#0F172A"
                                    fontSize="12"
                                    fontWeight="700"
                                  >
                                    {node.label.length > 28
                                      ? `${node.label.slice(0, 26)}…`
                                      : node.label}
                                  </text>
                                </g>
                              );
                            })}

                            <rect
                              x={225}
                              y={112}
                              width={210}
                              height={56}
                              rx={12}
                              fill="#0F4C81"
                            />
                            <text
                              x={330}
                              y={136}
                              textAnchor="middle"
                              fill="#BAE6FD"
                              fontSize="9.5"
                              fontWeight="700"
                            >
                              CANONICAL TOPIC
                            </text>
                            <text
                              x={330}
                              y={153}
                              textAnchor="middle"
                              fill="#FFFFFF"
                              fontSize="12"
                              fontWeight="700"
                            >
                              {lectureTitle.length > 26
                                ? `${lectureTitle.slice(0, 24)}…`
                                : lectureTitle}
                            </text>
                          </svg>
                        </div>

                        {selectedMindMapNodeId && (
                          <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-2.5 text-xs text-slate-800">
                            {
                              revisionPack.mindMap.nodes.find(
                                (n) => n.id === selectedMindMapNodeId
                              )?.summary
                            }
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                        <h3 className="text-xs sm:text-sm font-bold text-[#0F4C81]">
                          {revisionPack.flowchart.title}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {revisionPack.flowchart.nodes.map((fn, idx) => (
                            <button
                              key={fn.id}
                              type="button"
                              onClick={() => onJumpToSceneIndex(idx)}
                              className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-2.5 text-left hover:border-[#0284C7] transition-colors"
                            >
                              <div className="text-xs font-bold text-[#0F4C81]">
                                {fn.label}
                              </div>
                              {fn.detail && (
                                <div className="text-[11px] text-slate-600 mt-0.5">
                                  {fn.detail}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2 text-xs">
                        <h3 className="font-bold text-emerald-950">
                          Key Takeaways &amp; Source Provenance
                        </h3>
                        <ul className="space-y-1 text-slate-800">
                          {revisionPack.examPoints.map((pt, idx) => (
                            <li key={idx}>• {pt}</li>
                          ))}
                        </ul>
                        {externalReferences.length > 0 && (
                          <div className="pt-2 border-t border-emerald-200/70 space-y-1">
                            <div className="font-semibold text-emerald-950">
                              External Scientific Evidence:
                            </div>
                            {externalReferences.slice(0, 3).map((ref, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                {ref.url ? (
                                  <a
                                    href={ref.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-medium text-[#0F4C81] underline"
                                  >
                                    <span>
                                      {ref.title} ({ref.source})
                                    </span>
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : (
                                  <span>
                                    {ref.title} ({ref.source})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : isShowingComparisonBoard && activeScene.comparisonTable ? (
                    <div className="space-y-3">
                      <h3 className="text-sm sm:text-base font-bold text-[#0F4C81]">
                        {activeScene.comparisonTable.caption}
                      </h3>
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full border-collapse text-left text-xs tabular-nums">
                          <thead>
                            <tr className="bg-[#0F4C81] text-white">
                              {activeScene.comparisonTable.columns.map((hdr, idx) => (
                                <th key={idx} className="px-3 py-2.5 font-bold">
                                  {hdr}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {activeScene.comparisonTable.rows.map((row, rIdx) => {
                              const activeRowIdx = Math.min(
                                activeScene.comparisonTable!.rows.length - 1,
                                Math.floor(
                                  sceneProgress * activeScene.comparisonTable!.rows.length
                                )
                              );
                              const isHighlighted = rIdx === activeRowIdx;
                              return (
                                <tr
                                  key={rIdx}
                                  className={
                                    isHighlighted
                                      ? 'bg-sky-50/90'
                                      : rIdx % 2 === 0
                                        ? 'bg-white'
                                        : 'bg-slate-50/50'
                                  }
                                >
                                  {row.map((cell, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className={`px-3 py-2.5 align-top leading-relaxed ${
                                        cIdx === 0
                                          ? 'font-bold text-[#0F4C81]'
                                          : 'text-slate-800'
                                      }`}
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : effectiveDiscipline === 'physiology' ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-mono font-bold text-[#0284C7]">
                            {disciplineSpec.physiology.formulaLabel}
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-[#0F4C81]">
                            {disciplineSpec.physiology.curveTitle}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowShiftedCurve((v) => !v)}
                          aria-pressed={showShiftedCurve}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          <SplitSquareHorizontal
                            className="h-3.5 w-3.5 text-[#0284C7]"
                            aria-hidden="true"
                          />
                          <span>
                            {showShiftedCurve
                              ? 'Hide Pathological Shift'
                              : 'Compare Pathological Shift'}
                          </span>
                        </button>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <svg
                          viewBox="0 0 460 220"
                          className="w-full h-auto"
                          role="img"
                          aria-label={disciplineSpec.physiology.curveTitle}
                        >
                          {[45, 85, 125, 165].map((gy) => (
                            <line
                              key={gy}
                              x1={44}
                              y1={gy}
                              x2={440}
                              y2={gy}
                              stroke="#E2E8F0"
                              strokeWidth={1}
                            />
                          ))}
                          <line
                            x1={44}
                            y1={24}
                            x2={44}
                            y2={182}
                            stroke="#334155"
                            strokeWidth={1.8}
                          />
                          <line
                            x1={44}
                            y1={182}
                            x2={440}
                            y2={182}
                            stroke="#334155"
                            strokeWidth={1.8}
                          />

                          {showShiftedCurve && (
                            <polyline
                              fill="none"
                              stroke="#DC2626"
                              strokeWidth={2.5}
                              strokeDasharray="6 4"
                              points={disciplineSpec.physiology.shiftedPoints
                                .map(
                                  (p) =>
                                    `${44 + (p.x / 100) * 392},${
                                      182 - (p.y / 100) * 150
                                    }`
                                )
                                .join(' ')}
                            />
                          )}

                          <polyline
                            fill="none"
                            stroke="#0284C7"
                            strokeWidth={3.2}
                            points={disciplineSpec.physiology.normalPoints
                              .map(
                                (p) =>
                                  `${44 + (p.x / 100) * 392},${
                                    182 - (p.y / 100) * 150
                                  }`
                              )
                              .join(' ')}
                          />

                          {(() => {
                            const pts = disciplineSpec.physiology.normalPoints;
                            const idx = Math.min(
                              pts.length - 1,
                              Math.floor(sceneProgress * pts.length)
                            );
                            const pt = pts[idx] || { x: 50, y: 75 };
                            const cx = 44 + (pt.x / 100) * 392;
                            const cy = 182 - (pt.y / 100) * 150;
                            return (
                              <circle
                                cx={cx}
                                cy={cy}
                                r={7}
                                fill="#0F4C81"
                                stroke="#FFFFFF"
                                strokeWidth={2}
                              />
                            );
                          })()}

                          <text x={50} y={16} fill="#0284C7" fontSize="11" fontWeight="700">
                            ● {disciplineSpec.physiology.normalLegend}
                          </text>
                          {showShiftedCurve && (
                            <text
                              x={50}
                              y={212}
                              fill="#DC2626"
                              fontSize="10.5"
                              fontWeight="600"
                            >
                              --- {disciplineSpec.physiology.shiftedLegend}
                            </text>
                          )}
                          <text
                            x={438}
                            y={197}
                            textAnchor="end"
                            fill="#475569"
                            fontSize="10"
                            fontWeight="600"
                          >
                            {disciplineSpec.physiology.xAxisLabel}
                          </text>
                        </svg>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                        <div className="text-xs font-bold text-[#0F4C81]">
                          Homeostatic Feedback Loop
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
                          {disciplineSpec.physiology.feedbackSteps.map((st, idx) => {
                            const autoIdx = Math.min(
                              disciplineSpec.physiology.feedbackSteps.length - 1,
                              Math.floor(
                                sceneProgress *
                                  disciplineSpec.physiology.feedbackSteps.length
                              )
                            );
                            const isSel =
                              selectedFeedbackIdx !== null
                                ? selectedFeedbackIdx === idx
                                : idx === autoIdx;
                            return (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() => setSelectedFeedbackIdx(idx)}
                                className={`min-h-[54px] rounded-lg border p-2 text-left transition-colors ${
                                  isSel
                                    ? 'border-[#0284C7] bg-[#0F4C81] text-white'
                                    : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-sky-50'
                                }`}
                              >
                                <div
                                  className={`text-[10px] font-mono font-bold ${
                                    isSel ? 'text-sky-300' : 'text-[#0284C7]'
                                  }`}
                                >
                                  0{idx + 1} · {st.role.toUpperCase()}
                                </div>
                                <div className="text-[11px] font-semibold leading-snug mt-0.5">
                                  {st.label}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : effectiveDiscipline === 'pathology' ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-mono font-bold text-red-700">
                            PATHOLOGY &amp; HISTOPATHOLOGY COMPARISON
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-[#0F4C81]">
                            {disciplineSpec.pathology.normalTitle} vs.{' '}
                            {disciplineSpec.pathology.abnormalTitle}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setPathologyViewTab((prev) =>
                                prev === 'split_he' ? 'gross_compare' : 'split_he'
                              )
                            }
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                          >
                            <SplitSquareHorizontal
                              className="h-3.5 w-3.5 text-red-700"
                              aria-hidden="true"
                            />
                            <span>
                              {pathologyViewTab === 'split_he'
                                ? 'Switch to Organ Comparison'
                                : 'Switch to 2D H&E Schematic'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setManualMechanismStep((prev) =>
                                prev === null ? 0 : (prev + 1) % 4
                              )
                            }
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-900 hover:bg-red-100"
                          >
                            <span>Step Lesion</span>
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {pathologyViewTab === 'split_he' ? (
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <div className="relative aspect-[16/9] w-full bg-slate-100 overflow-hidden">
                            <img
                              src={
                                atlasPlate.histologyComparisonUrl ||
                                getPathologyHistologySplitUrl()
                              }
                              alt={`2D illustrative H&E histopathology schematic for ${lectureTitle}: ${disciplineSpec.pathology.histologyNormalLabel} vs ${disciplineSpec.pathology.histologyAbnormalLabel}`}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute top-2 left-2 rounded-md bg-emerald-950/85 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                              NORMAL: {disciplineSpec.pathology.histologyNormalLabel}
                            </div>
                            <div className="absolute bottom-2 right-2 rounded-md bg-red-950/90 px-2.5 py-1 text-xs font-semibold text-red-100">
                              LESION: {disciplineSpec.pathology.histologyAbnormalLabel}
                            </div>
                          </div>
                          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600">
                            2D illustrative H&amp;E histopathology schematic highlighting cellular remodeling.
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="rounded-xl border border-emerald-200 bg-white p-3 space-y-2">
                            <div className="text-xs font-bold text-emerald-900">
                              {disciplineSpec.pathology.normalTitle}
                            </div>
                            <ul className="space-y-1 text-xs text-slate-700">
                              {disciplineSpec.pathology.normalBullets.map((b, i) => (
                                <li key={i}>• {b}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="rounded-xl border border-red-200 bg-red-50/30 p-3 space-y-2">
                            <div className="text-xs font-bold text-red-900">
                              {disciplineSpec.pathology.abnormalTitle}
                            </div>
                            <ul className="space-y-1 text-xs text-slate-800">
                              {disciplineSpec.pathology.abnormalBullets.map((b, i) => (
                                <li key={i}>• {b}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {disciplineSpec.pathology.progressionCascade.map((st, idx) => {
                          const activeIdx =
                            manualMechanismStep !== null
                              ? manualMechanismStep % 4
                              : Math.min(3, Math.floor(sceneProgress * 4));
                          const isCurrent = idx === activeIdx;
                          return (
                            <button
                              key={st.stage}
                              type="button"
                              onClick={() => setManualMechanismStep(idx)}
                              className={`rounded-lg border p-2.5 text-left transition-colors ${
                                isCurrent
                                  ? 'border-red-600 bg-red-900 text-white'
                                  : 'border-slate-200 bg-white text-slate-800 hover:bg-red-50/50'
                              }`}
                            >
                              <div
                                className={`text-[10px] font-mono font-bold ${
                                  isCurrent ? 'text-red-200' : 'text-red-700'
                                }`}
                              >
                                {st.stage}
                              </div>
                              <div className="text-xs leading-snug mt-1">{st.detail}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : effectiveDiscipline === 'pharmacology' ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] font-mono font-bold text-emerald-700">
                          PHARMACOLOGY &amp; MECHANISM OF ACTION
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-[#0F4C81]">
                          {disciplineSpec.pharmacology.pathwayTitle}
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {disciplineSpec.pharmacology.mechanismSteps.map((ms, idx) => (
                          <button
                            key={ms.step}
                            type="button"
                            onClick={() => setManualMechanismStep(idx)}
                            className="rounded-xl border border-emerald-200 bg-white p-3 text-left hover:bg-emerald-50/40"
                          >
                            <div className="text-[11px] font-mono font-bold text-emerald-800">
                              {ms.step}
                            </div>
                            <div className="text-xs font-bold text-[#0F4C81] mt-0.5">
                              {ms.target}
                            </div>
                            <div className="text-xs text-slate-700 mt-1 leading-snug">
                              {ms.effect}
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full border-collapse text-left text-xs tabular-nums">
                          <thead>
                            <tr className="bg-emerald-900 text-white">
                              <th className="px-2.5 py-2 font-bold">Agent Class</th>
                              <th className="px-2.5 py-2 font-bold">Target</th>
                              <th className="px-2.5 py-2 font-bold">Clinical Effect</th>
                              <th className="px-2.5 py-2 font-bold">Safety Watch</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {disciplineSpec.pharmacology.drugRows.map((dr, idx) => (
                              <tr
                                key={idx}
                                className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}
                              >
                                <td className="px-2.5 py-2 font-bold text-emerald-950">
                                  {dr.agentClass}
                                </td>
                                <td className="px-2.5 py-2 text-slate-800">
                                  {dr.targetReceptor}
                                </td>
                                <td className="px-2.5 py-2 text-slate-800">
                                  {dr.clinicalAction}
                                </td>
                                <td className="px-2.5 py-2 text-red-800 font-medium">
                                  {dr.adverseWatch}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : effectiveDiscipline === 'immunology' ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] font-mono font-bold text-violet-700">
                          IMMUNOLOGY &amp; INFLAMMATORY PATHWAYS
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-[#0F4C81]">
                          {disciplineSpec.immunology.pathwayTitle}
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {disciplineSpec.immunology.nodes.map((nd, idx) => {
                          const activeIdx =
                            manualMechanismStep !== null
                              ? manualMechanismStep % 4
                              : Math.min(3, Math.floor(sceneProgress * 4));
                          const isCurrent = idx === activeIdx;
                          return (
                            <button
                              key={nd.id}
                              type="button"
                              onClick={() => setManualMechanismStep(idx)}
                              className={`rounded-lg border p-3 text-left transition-colors ${
                                isCurrent
                                  ? 'border-violet-700 bg-violet-900 text-white'
                                  : 'border-slate-200 bg-white text-slate-800 hover:bg-violet-50/50'
                              }`}
                            >
                              <div
                                className={`text-[10px] font-mono font-bold ${
                                  isCurrent ? 'text-violet-200' : 'text-violet-700'
                                }`}
                              >
                                {nd.arm.toUpperCase()}
                              </div>
                              <div className="text-xs font-bold mt-0.5">{nd.title}</div>
                              <div className="text-xs leading-snug mt-1 opacity-90">
                                {nd.detail}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* ANATOMY & REGIONAL DIAGRAM EXPLORER WITH CLEAN NUMBERED CALLOUTS */
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-mono font-bold text-[#0284C7]">
                            {atlasPlate.plateCode}
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-[#0F4C81]">
                            {atlasPlate.plateTitle}
                          </h3>
                        </div>

                        {atlasPlate.hasRealisticPlate && (
                          <button
                            type="button"
                            onClick={() => setIsCloseUpZoom((z) => !z)}
                            aria-pressed={isCloseUpZoom}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                          >
                            {isCloseUpZoom ? (
                              <>
                                <ZoomOut
                                  className="h-3.5 w-3.5 text-[#0F4C81]"
                                  aria-hidden="true"
                                />
                                <span>1× Full View</span>
                              </>
                            ) : (
                              <>
                                <ZoomIn
                                  className="h-3.5 w-3.5 text-[#0284C7]"
                                  aria-hidden="true"
                                />
                                <span>1.6× Regional Zoom</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {atlasPlate.hasRealisticPlate && atlasPlate.imageUrl && (
                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <div className="relative aspect-[16/10] w-full overflow-hidden bg-white">
                            <div
                              className={`relative h-full w-full transition-transform duration-500 ease-out ${
                                isCloseUpZoom ? 'scale-[1.6]' : 'scale-100'
                              } ${getZoomOriginClass(
                                focusedPin
                                  ? focusedPin.targetXPct
                                  : atlasPlate.closeUpFocus.xPct,
                                focusedPin
                                  ? focusedPin.targetYPct
                                  : atlasPlate.closeUpFocus.yPct
                              )}`}
                            >
                              <img
                                src={atlasPlate.imageUrl}
                                alt={atlasPlate.plateTitle}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-contain select-none"
                              />
                              <svg
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                className="pointer-events-none absolute inset-0 h-full w-full"
                              >
                                {pins.slice(0, 4).map((pin, idx) => {
                                  const isPinActive = focusedPin?.id === pin.id;
                                  return (
                                    <g key={`pin-marker-${pin.id}`}>
                                      <circle
                                        cx={pin.targetXPct}
                                        cy={pin.targetYPct}
                                        r={isPinActive ? '2.8' : '2.1'}
                                        fill={isPinActive ? '#0284C7' : '#0F4C81'}
                                        stroke="#FFFFFF"
                                        strokeWidth="0.6"
                                      />
                                      <text
                                        x={pin.targetXPct}
                                        y={pin.targetYPct + 0.9}
                                        textAnchor="middle"
                                        fill="#FFFFFF"
                                        fontSize="2.4"
                                        fontWeight="700"
                                      >
                                        {idx + 1}
                                      </text>
                                    </g>
                                  );
                                })}
                              </svg>
                            </div>
                          </div>

                          {/* Clean Non-Overlapping Numbered Medical Labels */}
                          <div className="border-t border-slate-200 p-3 bg-[#F8FAFC] space-y-2.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {pins.slice(0, 4).map((pin, idx) => {
                                const isSel = focusedPin?.id === pin.id;
                                return (
                                  <button
                                    key={pin.id}
                                    type="button"
                                    onClick={() => setSelectedPinId(pin.id)}
                                    className={`min-h-[42px] rounded-lg border px-3 py-2 text-left text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 ${
                                      isSel
                                        ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                                        : 'border-slate-200 bg-white text-slate-900 hover:bg-sky-50'
                                    }`}
                                  >
                                    <span
                                      className={`font-mono font-bold ${
                                        isSel ? 'text-sky-300' : 'text-[#0284C7]'
                                      }`}
                                    >
                                      0{idx + 1}
                                    </span>
                                    <span className="truncate">{pin.label}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {focusedPin && (
                              <div className="rounded-lg border border-sky-200 bg-white p-2.5 text-xs sm:text-sm">
                                <span className="font-bold text-[#0F4C81]">
                                  {focusedPin.label}:{' '}
                                </span>
                                <span className="text-slate-700">
                                  {focusedPin.detail}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* SYNCHRONIZED TRANSCRIPT DRAWER */}
              {showTranscriptDrawer && (
                <div
                  data-testid="synchronized-transcript-drawer"
                  className="border-t border-slate-200 bg-slate-50 p-3.5 sm:p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-[#0F4C81] uppercase tracking-wider">
                      Continuous Lecture Transcript (Click Any Line to Seek)
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowTranscriptDrawer(false)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {allCues.map((cue) => {
                      const isCurrent =
                        currentTimeSec >= cue.startSec &&
                        currentTimeSec <= cue.endSec + 0.08;
                      const scNum =
                        scenes.find((s) => s.id === cue.sceneId)?.sceneNumber || 1;
                      return (
                        <button
                          key={cue.index}
                          type="button"
                          onClick={() => {
                            if (onSeekToTime) {
                              onSeekToTime(cue.startSec + 0.04);
                            } else {
                              const idx = sceneTimeline.findIndex(
                                (t) => t.scene.id === cue.sceneId
                              );
                              if (idx >= 0) onJumpToSceneIndex(idx);
                            }
                          }}
                          className={`w-full flex items-start gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                            isCurrent
                              ? 'border-[#0284C7] bg-sky-100/80 text-slate-950 font-semibold'
                              : 'border-slate-200/80 bg-white text-slate-700 hover:bg-sky-50/50'
                          }`}
                        >
                          <span className="font-mono text-[11px] font-bold text-[#0F4C81] tabular-nums shrink-0 mt-0.5">
                            S{scNum} · {formatCueClock(cue.startSec)}
                          </span>
                          <span
                            dir={language === 'ar-eg' ? 'rtl' : 'ltr'}
                            className="flex-1"
                          >
                            {cue.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* LIVE SUBTITLE CAPTION BAR */}
              {showSubtitles && sceneCues.length > 0 && (
                <div
                  data-testid="stage-live-subtitle-bar"
                  dir={language === 'ar-eg' ? 'rtl' : 'ltr'}
                  className="border-t border-slate-800 bg-slate-900 px-4 py-2 text-center text-xs sm:text-sm font-medium text-slate-100"
                >
                  {(sceneCues[Math.max(0, activeCueIndex)] || sceneCues[0])?.text}
                </div>
              )}

              {/* SMARTBOARD FOOTER: CONTINUOUS SCENE STEPPER */}
              <div className="border-t border-slate-200 bg-[#F8FAFC] px-3.5 py-2.5 sm:px-5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {scenes.map((sc, idx) => {
                    const isCurrent = idx === activeSceneIndex;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        data-testid={`scene-step-${idx}`}
                        onClick={() => onJumpToSceneIndex(idx)}
                        className={`min-h-[36px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          isCurrent
                            ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-sky-50 hover:border-[#0284C7]'
                        }`}
                      >
                        S{sc.sceneNumber}
                        {sc.visualMode === 'references' || idx === scenes.length - 1
                          ? ' · Summary'
                          : ''}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="screen-prev-scene"
                    disabled={activeSceneIndex <= 0}
                    onClick={() =>
                      onJumpToSceneIndex(Math.max(0, activeSceneIndex - 1))
                    }
                    className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Prev Scene
                  </button>
                  <button
                    type="button"
                    data-testid="screen-next-scene"
                    disabled={activeSceneIndex >= scenes.length - 1}
                    onClick={() =>
                      onJumpToSceneIndex(
                        Math.min(scenes.length - 1, activeSceneIndex + 1)
                      )
                    }
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-[#0F4C81] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0c3d69] disabled:opacity-40"
                  >
                    <span>Next Scene</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
