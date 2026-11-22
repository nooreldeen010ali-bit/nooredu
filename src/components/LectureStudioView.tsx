import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Captions,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  Film,
  FileCode2,
  Info,
  Languages,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  UserCheck,
  Volume2,
  XCircle,
} from 'lucide-react';
import type {
  AnatomicalSystemTemplate,
  DoctorPersonaId,
  LanguageMode,
  LectureProject,
  LectureScene,
  LectureSourceMode,
  MedicalSubjectDiscipline,
  MedicalTextbook,
  Mp4AudioValidationReport,
  SceneTransitionType,
  SceneVisualMode,
  StudyGuide,
} from '../types/medical';
import { InteractiveTextbookStage } from './InteractiveTextbookStage';
import { renderLectureFrame } from '../utils/lectureCanvasRenderer';
import { getLectureRenderingEngineDisclosure } from '../utils/lectureThreeRenderer';
import { preloadAllMedicalAtlasImages } from '../utils/medicalAtlasAssets';
import {
  buildCompleteLectureStoryboard,
  buildLectureFromChapter,
  buildLectureFromStudyGuide,
  buildOfflineTextbookLecture,
  buildSynchronizedLectureAudioTrack,
  computeSceneTimeline,
  encodeBytesToBase64,
  findSceneAtTime,
  formatPedagogicalStageLabel,
  generateSrtSubtitles,
  generateVttSubtitles,
  getDoctorProfile,
  getTotalLectureDuration,
  normalizeLectureScenes,
  normalizePresenterId,
  PRIMARY_DOCTOR_PRESENTERS,
  reorderLectureScene,
  rescaleLectureDuration,
  sampleAmplitudeAtTime,
  sanitizeLectureProjectResponse,
  verifySceneAudioTrack,
} from '../utils/lectureStudioEngine';
import {
  flattenClickableCitations,
  formatBookCitationsSummary,
  retrieveAcrossTextbooks,
  shortenBookTitle,
} from '../utils/multiBookEngine';
import { validateTopicInput } from '../utils/textbookEngine';
import { canonicalizeMedicalTopic } from '../utils/topicCanonicalizer';

interface StudioCapabilities {
  ffmpegMp4Available: boolean;
  geminiScriptAvailable: boolean;
  geminiTtsAvailable: boolean;
  paidDiffusionVideoConfigured: boolean;
  engineNote: string;
  renderingLimitations?: string[];
}

interface ValidatedMp4Artifact {
  signature: string;
  blob: Blob;
  filename: string;
  validation: Mp4AudioValidationReport;
  downloadUrl?: string;
}

interface LectureStudioViewProps {
  textbooks: MedicalTextbook[];
  selectedTextbookIds: string[];
  onToggleTextbookSelection: (id: string) => void;
  savedGuides: StudyGuide[];
  savedLectures: LectureProject[];
  activeLecture: LectureProject;
  onSelectLecture: (lectureId: string) => void;
  onSaveLecture: (project: LectureProject) => Promise<void>;
  onDeleteLecture: (lectureId: string) => Promise<void>;
  onOpenPage: (pageNumber: number, textbookId?: string) => void;
  onOpenTimedExam?: (topic: string) => void;
  isOnline: boolean;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function slugifyFilename(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56) || 'medatlas-lecture'
  );
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Keep Blob URL alive for 2 minutes so mobile/Android browsers finish writing large files
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function triggerAndroidSafeUrlDownload(downloadUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function computeProjectExportSignature(project: LectureProject): string {
  const scenePart = project.scenes
    .map(
      (s) =>
        `${s.id}:${s.title}:${s.visualMode}:${s.subjectDiscipline || ''}:${s.systemTemplate}:${
          s.transitionType
        }:${s.durationSec}:${s.onScreenLabels.join('|')}:${s.narrationEn.length}:${
          s.narrationArEg.length
        }:${s.audioLang || ''}:${s.audioWavBase64 ? s.audioWavBase64.length : 0}:${
          s.audioWavBase64 ? s.audioWavBase64.slice(-32) : ''
        }`
    )
    .join('~');
  return `${project.id}::${project.presenterId}::${project.language}::${
    project.preferredDiscipline || 'auto'
  }::${scenePart}`;
}

export const LectureStudioView: React.FC<LectureStudioViewProps> = ({
  textbooks,
  selectedTextbookIds,
  onToggleTextbookSelection,
  savedGuides,
  savedLectures,
  activeLecture,
  onSelectLecture,
  onSaveLecture,
  onDeleteLecture,
  onOpenPage,
  onOpenTimedExam,
  isOnline,
}) => {
  // Pre-generation & active presenter/language choices
  const [builderPresenterId, setBuilderPresenterId] = useState<DoctorPersonaId>(() =>
    normalizePresenterId(activeLecture.presenterId)
  );
  const [builderLanguage, setBuilderLanguage] = useState<LanguageMode>(
    activeLecture.language || 'en'
  );

  // Generator form state
  const [isBuilderOpen, setIsBuilderOpen] = useState<boolean>(false);
  const [sourceMode, setSourceMode] = useState<LectureSourceMode>('topic');
  const [topicQuery, setTopicQuery] = useState<string>('');
  const [selectedChapterBookId, setSelectedChapterBookId] = useState<string>(
    () => textbooks[0]?.id || ''
  );
  const [selectedChapterPage, setSelectedChapterPage] = useState<number>(1);
  const [selectedStudyGuideId, setSelectedStudyGuideId] = useState<string>(
    () => savedGuides[0]?.id || ''
  );
  const [targetDurationChoice, setTargetDurationChoice] = useState<number>(
    activeLecture.targetDurationSec || 90
  );
  const [preferredDisciplineChoice, setPreferredDisciplineChoice] = useState<
    MedicalSubjectDiscipline | 'auto'
  >(activeLecture.preferredDiscipline || 'auto');
  const [formError, setFormError] = useState<string | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);

  // Capabilities & status
  const [capabilities, setCapabilities] = useState<StudioCapabilities | null>(null);
  const [showCapabilityDetails, setShowCapabilityDetails] = useState<boolean>(false);
  const [showPreRenderStoryboard, setShowPreRenderStoryboard] = useState<boolean>(true);
  const [studioStatusMsg, setStudioStatusMsg] = useState<string | null>(null);
  const [studioErrorMsg, setStudioErrorMsg] = useState<string | null>(null);

  // Playback & Audio state (strictly continuous — zero mid-lecture quiz interruptions!)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);
  const masterAudioUrlRef = useRef<string | null>(null);
  const scenePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const scenePreviewUrlRef = useRef<string | null>(null);

  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);
  const [previewingSceneId, setPreviewingSceneId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [currentMouthOpenness, setCurrentMouthOpenness] = useState<number>(0);
  const [currentIsSpeaking, setCurrentIsSpeaking] = useState<boolean>(false);
  const [showSubtitles, setShowSubtitles] = useState<boolean>(true);
  const [useBrowserSpeechPreview, setUseBrowserSpeechPreview] = useState<boolean>(false);
  const [stageViewMode, setStageViewMode] = useState<'textbook' | 'video'>('video');
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    () => activeLecture.scenes[0]?.id || ''
  );

  // Separate Post-Lecture Quiz state (strictly after/below the lecture player)
  const [postQuizAnswers, setPostQuizAnswers] = useState<Record<string, number>>({});
  const [postQuizSubmitted, setPostQuizSubmitted] = useState<boolean>(false);

  // TTS & Validated MP4 Export states
  const [isSynthesizingAllTts, setIsSynthesizingAllTts] = useState<boolean>(false);
  const [synthesizingSceneId, setSynthesizingSceneId] = useState<string | null>(null);
  const [ttsProgressText, setTtsProgressText] = useState<string>('');
  const [isExportingMp4, setIsExportingMp4] = useState<boolean>(false);
  const [exportProgressPct, setExportProgressPct] = useState<number>(0);
  const [exportStageText, setExportStageText] = useState<string>('');
  const [validatedMp4, setValidatedMp4] = useState<ValidatedMp4Artifact | null>(null);
  const [mp4BlockReason, setMp4BlockReason] = useState<string | null>(null);

  // Refs for continuous 60fps requestAnimationFrame loop
  const playTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const lectureRef = useRef<LectureProject>(activeLecture);
  const showSubtitlesRef = useRef<boolean>(true);
  const browserSpeakingRef = useRef<boolean>(false);
  const lastUiSyncMsRef = useRef<number>(0);
  const lastSpokenSceneIdRef = useRef<string | null>(null);

  lectureRef.current = activeLecture;
  showSubtitlesRef.current = showSubtitles;

  useEffect(() => {
    void preloadAllMedicalAtlasImages();
  }, []);

  useEffect(() => {
    if (!selectedChapterBookId && textbooks[0]) {
      setSelectedChapterBookId(textbooks[0].id);
    }
  }, [textbooks, selectedChapterBookId]);

  useEffect(() => {
    if (!selectedStudyGuideId && savedGuides[0]) {
      setSelectedStudyGuideId(savedGuides[0].id);
    }
  }, [savedGuides, selectedStudyGuideId]);

  // Reset playhead and post-lecture quiz state when switching to a different lecture project ID
  useEffect(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    playTimeRef.current = 0;
    setCurrentTimeSec(0);
    setCurrentMouthOpenness(0);
    setCurrentIsSpeaking(false);
    setPostQuizAnswers({});
    setPostQuizSubmitted(false);
    lastSpokenSceneIdRef.current = null;
    setSelectedSceneId(activeLecture.scenes[0]?.id || '');
    setBuilderPresenterId(normalizePresenterId(activeLecture.presenterId));
    setBuilderLanguage(activeLecture.language || 'en');
    setTargetDurationChoice(
      Math.round(getTotalLectureDuration(activeLecture.scenes)) || 90
    );
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [activeLecture.id]);

  // Load server video/TTS capabilities on mount
  useEffect(() => {
    let cancelled = false;
    async function loadCapabilities() {
      try {
        const res = await fetch('/api/lecture/capabilities');
        if (!res.ok) return;
        const data = (await res.json()) as StudioCapabilities;
        if (!cancelled) setCapabilities(data);
      } catch {
        // Offline mode
      }
    }
    loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  const sceneVerificationMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof verifySceneAudioTrack>>();
    for (const sc of activeLecture.scenes) {
      map.set(sc.id, verifySceneAudioTrack(sc, activeLecture.language));
    }
    return map;
  }, [activeLecture.scenes, activeLecture.language]);

  const audioBundle = useMemo(() => {
    return buildSynchronizedLectureAudioTrack(
      activeLecture.scenes,
      24000,
      30,
      activeLecture.language
    );
  }, [activeLecture.scenes, activeLecture.language]);

  const audioBundleRef = useRef(audioBundle);
  audioBundleRef.current = audioBundle;

  const displayScenes = audioBundle.alignedScenes;

  const projectExportSignature = useMemo(
    () => computeProjectExportSignature(activeLecture),
    [activeLecture]
  );

  const currentValidatedMp4 =
    validatedMp4 && validatedMp4.signature === projectExportSignature ? validatedMp4 : null;

  useEffect(() => {
    if (masterAudioUrlRef.current) {
      URL.revokeObjectURL(masterAudioUrlRef.current);
      masterAudioUrlRef.current = null;
    }
    if (audioBundle.hasRealSpeechAudio && audioBundle.wavBytes.byteLength > 44) {
      const wavCopy = new Uint8Array(audioBundle.wavBytes.byteLength);
      wavCopy.set(audioBundle.wavBytes);
      const blob = new Blob([wavCopy.buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      masterAudioUrlRef.current = url;
      setMasterAudioUrl(url);
      if (masterAudioRef.current) {
        masterAudioRef.current.src = url;
        masterAudioRef.current.load();
      }
    } else {
      setMasterAudioUrl(null);
      if (masterAudioRef.current) {
        masterAudioRef.current.removeAttribute('src');
      }
    }
    return () => {
      if (masterAudioUrlRef.current) {
        URL.revokeObjectURL(masterAudioUrlRef.current);
        masterAudioUrlRef.current = null;
      }
    };
  }, [audioBundle]);

  useEffect(() => {
    return () => {
      if (scenePreviewUrlRef.current) {
        URL.revokeObjectURL(scenePreviewUrlRef.current);
        scenePreviewUrlRef.current = null;
      }
    };
  }, []);

  const totalDurationSec = useMemo(
    () => Math.max(1, getTotalLectureDuration(displayScenes)),
    [displayScenes]
  );

  const timeline = useMemo(
    () => computeSceneTimeline(displayScenes),
    [displayScenes]
  );

  const activeLookup = useMemo(
    () => findSceneAtTime(displayScenes, currentTimeSec),
    [displayScenes, currentTimeSec]
  );

  // Separate Post-Lecture Quiz items (extracted from scenes or matching Blueprint, NEVER blocking video!)
  const postLectureQuizzes = useMemo(() => {
    const items: Array<{
      id: string;
      sectionLabel: string;
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }> = [];

    displayScenes.forEach((sc) => {
      if (sc.checkpointQuiz) {
        items.push({
          id: sc.checkpointQuiz.id,
          sectionLabel: sc.checkpointQuiz.sectionLabel || sc.title,
          question: sc.checkpointQuiz.question,
          options: sc.checkpointQuiz.options,
          correctIndex: sc.checkpointQuiz.correctIndex,
          explanation: sc.checkpointQuiz.explanation,
        });
      }
    });

    if (items.length === 0) {
      const canonical = canonicalizeMedicalTopic(activeLecture.topic);
      const matchedGuide = savedGuides.find(
        (g) =>
          canonicalizeMedicalTopic(g.topic).canonicalTopicId === canonical.canonicalTopicId
      );
      if (matchedGuide?.mcqs?.length) {
        matchedGuide.mcqs.slice(0, 4).forEach((q, idx) => {
          items.push({
            id: q.id || `post-q-${idx + 1}`,
            sectionLabel: `Concept ${idx + 1}`,
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation,
          });
        });
      }
    }

    return items;
  }, [displayScenes, activeLecture.topic, savedGuides]);

  const useBrowserSpeechRef = useRef<boolean>(useBrowserSpeechPreview);
  useBrowserSpeechRef.current = useBrowserSpeechPreview;

  // Optional Browser SpeechSynthesis live preview when neural WAV hasn't been generated yet
  const triggerBrowserSpeechForCurrentScene = useCallback((timeSec: number) => {
    if (
      !useBrowserSpeechRef.current ||
      audioBundleRef.current.hasRealSpeechAudio ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window)
    ) {
      browserSpeakingRef.current = false;
      return;
    }
    const lookup = findSceneAtTime(lectureRef.current.scenes, timeSec);
    const sc = lookup.current.scene;
    if (lastSpokenSceneIdRef.current === sc.id && window.speechSynthesis.speaking) {
      return;
    }
    window.speechSynthesis.cancel();
    lastSpokenSceneIdRef.current = sc.id;
    const text =
      lectureRef.current.language === 'ar-eg' && sc.narrationArEg
        ? sc.narrationArEg
        : sc.narrationEn;
    if (!text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lectureRef.current.language === 'ar-eg' ? 'ar-EG' : 'en-US';
    utter.rate = 1.0;
    utter.onstart = () => {
      browserSpeakingRef.current = true;
    };
    utter.onend = () => {
      browserSpeakingRef.current = false;
    };
    utter.onerror = () => {
      browserSpeakingRef.current = false;
    };
    window.speechSynthesis.speak(utter);
  }, []);

  // Continuous, uninterrupted 60fps video + smartboard playback loop from 00:00 to end
  useEffect(() => {
    let rafId = 0;
    let prevFrameMs = performance.now();

    const pauseAllAudioImmediately = () => {
      const audioEl = masterAudioRef.current;
      if (audioEl && !audioEl.paused) audioEl.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        browserSpeakingRef.current = false;
      }
    };

    const tick = (nowMs: number) => {
      const dt = Math.min(0.1, Math.max(0, (nowMs - prevFrameMs) / 1000));
      prevFrameMs = nowMs;

      const project = lectureRef.current;
      const bundle = audioBundleRef.current;
      const activeScenes = bundle.alignedScenes;
      const totalDur = Math.max(1, getTotalLectureDuration(activeScenes));

      if (isPlayingRef.current) {
        const prevTime = playTimeRef.current;
        const audioEl = masterAudioRef.current;
        let nextTime = prevTime;
        if (bundle.hasRealSpeechAudio && audioEl && !audioEl.paused) {
          nextTime = Math.min(totalDur, audioEl.currentTime);
        } else {
          nextTime = Math.min(totalDur, prevTime + dt);
          if (useBrowserSpeechRef.current && !bundle.hasRealSpeechAudio) {
            triggerBrowserSpeechForCurrentScene(nextTime);
          }
        }

        playTimeRef.current = nextTime;

        if (playTimeRef.current >= totalDur) {
          playTimeRef.current = totalDur;
          isPlayingRef.current = false;
          setIsPlaying(false);
          setCurrentTimeSec(totalDur);
          setCurrentMouthOpenness(0);
          setCurrentIsSpeaking(false);
          lastSpokenSceneIdRef.current = null;
          pauseAllAudioImmediately();
        }
      }

      let mouthOpenness = 0;
      let isSpeakingNow = false;
      if (isPlayingRef.current && bundle.hasRealSpeechAudio) {
        mouthOpenness = sampleAmplitudeAtTime(
          bundle.envelope,
          bundle.envelopeHz,
          playTimeRef.current
        );
        isSpeakingNow = mouthOpenness > 0.04;
      } else if (isPlayingRef.current && browserSpeakingRef.current) {
        mouthOpenness =
          0.18 + Math.abs(Math.sin(nowMs * 0.014)) * 0.45 * Math.abs(Math.cos(nowMs * 0.005));
        isSpeakingNow = true;
      }

      if (isPlayingRef.current && nowMs - lastUiSyncMsRef.current > 110) {
        lastUiSyncMsRef.current = nowMs;
        setCurrentTimeSec(Math.round(playTimeRef.current * 10) / 10);
        setCurrentMouthOpenness(mouthOpenness);
        setCurrentIsSpeaking(isSpeakingNow);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderLectureFrame(ctx, canvas.width, canvas.height, {
            scenes: activeScenes,
            timeSec: playTimeRef.current,
            presenterId: project.presenterId,
            language: project.language,
            lectureTitle: project.topic || project.title,
            showSubtitles: showSubtitlesRef.current,
            mouthOpenness,
            isSpeaking: isSpeakingNow,
            preferredDiscipline: project.preferredDiscipline,
            externalReferences: project.externalReferences,
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [triggerBrowserSpeechForCurrentScene]);

  const startPlaybackFromRefTime = async () => {
    isPlayingRef.current = true;
    setIsPlaying(true);

    if (audioBundle.hasRealSpeechAudio && masterAudioRef.current) {
      masterAudioRef.current.currentTime = playTimeRef.current;
      try {
        await masterAudioRef.current.play();
      } catch {
        // Autoplay restriction fallback: timeline still advances cleanly
      }
    } else if (useBrowserSpeechPreview) {
      lastSpokenSceneIdRef.current = null;
      triggerBrowserSpeechForCurrentScene(playTimeRef.current);
    }
  };

  const handleTogglePlay = async () => {
    setStudioErrorMsg(null);

    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setCurrentMouthOpenness(0);
      setCurrentIsSpeaking(false);
      if (masterAudioRef.current && !masterAudioRef.current.paused) {
        masterAudioRef.current.pause();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        browserSpeakingRef.current = false;
      }
      return;
    }

    if (playTimeRef.current >= totalDurationSec - 0.15) {
      playTimeRef.current = 0;
      setCurrentTimeSec(0);
    }

    await startPlaybackFromRefTime();
  };

  const handleSeekTo = (nextSec: number) => {
    const requested = Math.max(0, Math.min(totalDurationSec, nextSec));
    playTimeRef.current = requested;
    setCurrentTimeSec(Math.round(requested * 10) / 10);
    const lookup = findSceneAtTime(displayScenes, requested);
    setSelectedSceneId(lookup.current.scene.id);
    if (masterAudioRef.current && audioBundle.hasRealSpeechAudio) {
      masterAudioRef.current.currentTime = requested;
    }
    if (isPlayingRef.current && useBrowserSpeechPreview && !audioBundle.hasRealSpeechAudio) {
      lastSpokenSceneIdRef.current = null;
      triggerBrowserSpeechForCurrentScene(requested);
    }
  };

  const handleReplayCurrentScene = async () => {
    const start = activeLookup.current.startSec + 0.02;
    playTimeRef.current = start;
    setCurrentTimeSec(Math.round(start * 10) / 10);
    lastSpokenSceneIdRef.current = null;
    await startPlaybackFromRefTime();
  };

  const handlePreviewGeneratedNarration = async () => {
    setStudioErrorMsg(null);
    if (!audioBundle.hasRealSpeechAudio || !masterAudioRef.current) {
      setStudioErrorMsg(
        'Synthesize neural voice first so there is a verified WAV audio track to preview.'
      );
      return;
    }
    if (scenePreviewAudioRef.current && !scenePreviewAudioRef.current.paused) {
      scenePreviewAudioRef.current.pause();
      setPreviewingSceneId(null);
    }

    if (isPlayingRef.current && !masterAudioRef.current.paused) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      masterAudioRef.current.pause();
      return;
    }

    if (playTimeRef.current >= totalDurationSec - 0.2) {
      playTimeRef.current = 0;
      setCurrentTimeSec(0);
    }
    masterAudioRef.current.currentTime = playTimeRef.current;
    isPlayingRef.current = true;
    setIsPlaying(true);
    try {
      await masterAudioRef.current.play();
    } catch (err) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setStudioErrorMsg(
        err instanceof Error
          ? `Audio preview playback blocked: ${err.message}`
          : 'Unable to start audio playback in browser.'
      );
    }
  };

  const handlePreviewSingleSceneAudio = async (scene: LectureScene) => {
    setStudioErrorMsg(null);
    const check = verifySceneAudioTrack(scene, activeLecture.language);
    if (!check.valid || !scene.audioWavBase64) {
      setStudioErrorMsg(check.reason || 'Scene narration is not verified yet.');
      return;
    }

    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      masterAudioRef.current?.pause();
    }

    if (
      previewingSceneId === scene.id &&
      scenePreviewAudioRef.current &&
      !scenePreviewAudioRef.current.paused
    ) {
      scenePreviewAudioRef.current.pause();
      setPreviewingSceneId(null);
      return;
    }

    if (scenePreviewUrlRef.current) {
      URL.revokeObjectURL(scenePreviewUrlRef.current);
      scenePreviewUrlRef.current = null;
    }

    const binary = atob(scene.audioWavBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const url = URL.createObjectURL(new Blob([bytes.buffer], { type: 'audio/wav' }));
    scenePreviewUrlRef.current = url;

    if (scenePreviewAudioRef.current) {
      scenePreviewAudioRef.current.src = url;
      scenePreviewAudioRef.current.onended = () => setPreviewingSceneId(null);
      setPreviewingSceneId(scene.id);
      try {
        await scenePreviewAudioRef.current.play();
      } catch (err) {
        setPreviewingSceneId(null);
        setStudioErrorMsg(
          err instanceof Error ? err.message : 'Unable to preview scene audio.'
        );
      }
    }
  };

  const handleJumpScene = (delta: -1 | 1) => {
    const nextIdx = Math.max(
      0,
      Math.min(timeline.length - 1, activeLookup.current.index + delta)
    );
    handleSeekTo(timeline[nextIdx].startSec + 0.05);
  };

  const updateProject = async (mutator: (prev: LectureProject) => LectureProject) => {
    const updated = mutator(activeLecture);
    await onSaveLecture({
      ...updated,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleChangePresenter = async (presenterId: DoctorPersonaId) => {
    setBuilderPresenterId(presenterId);
    setValidatedMp4(null);
    await updateProject((prev) => ({
      ...prev,
      presenterId,
      scenes: prev.scenes.map((s) => ({
        ...s,
        audioWavBase64: undefined,
        audioMeanDb: undefined,
        audioPeakDb: undefined,
        audioSampleRate: undefined,
        audioModelUsed: undefined,
        audioError: undefined,
      })),
    }));
  };

  const handleChangeLanguage = async (language: LanguageMode) => {
    setBuilderLanguage(language);
    setValidatedMp4(null);
    await updateProject((prev) => ({
      ...prev,
      language,
      scenes: prev.scenes.map((s) =>
        s.audioLang && s.audioLang !== language
          ? {
              ...s,
              audioWavBase64: undefined,
              audioLang: undefined,
              audioMeanDb: undefined,
              audioPeakDb: undefined,
              audioSampleRate: undefined,
              audioModelUsed: undefined,
              audioError: undefined,
            }
          : s
      ),
    }));
  };

  const handleRescaleDuration = async (nextTargetSec: number) => {
    setTargetDurationChoice(nextTargetSec);
    await updateProject((prev) => ({
      ...prev,
      targetDurationSec: nextTargetSec,
      scenes: rescaleLectureDuration(prev.scenes, nextTargetSec),
    }));
    handleSeekTo(0);
    setStudioStatusMsg(`Rescaled continuous lecture duration to ${nextTargetSec} seconds.`);
  };

  // Respect user's exact textbook selection (including 0 selected textbooks for general medical topics!)
  const selectedBooks = useMemo(
    () => textbooks.filter((b) => selectedTextbookIds.includes(b.id)),
    [textbooks, selectedTextbookIds]
  );

  const activeChapterBook = useMemo(
    () => textbooks.find((b) => b.id === selectedChapterBookId) || textbooks[0] || null,
    [textbooks, selectedChapterBookId]
  );

  // Generate New Continuous Lecture Project from Any Topic / Blueprint / Chapter
  const handleGenerateLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setStudioErrorMsg(null);
    setStudioStatusMsg(null);

    if (sourceMode === 'study_guide') {
      const targetGuide = savedGuides.find((g) => g.id === selectedStudyGuideId);
      if (!targetGuide) {
        setFormError('Select a saved Medical Topic Blueprint first.');
        return;
      }
      const built: LectureProject = {
        ...buildLectureFromStudyGuide(targetGuide, {
          presenterId: builderPresenterId,
          language: builderLanguage,
          targetDurationSec: targetDurationChoice,
        }),
        preferredDiscipline: preferredDisciplineChoice,
      };
      await onSaveLecture(built);
      onSelectLecture(built.id);
      setIsBuilderOpen(false);
      setStudioStatusMsg(
        `Created continuous ${built.scenes.length}-scene lecture from "${targetGuide.topic}" Blueprint.`
      );
      return;
    }

    if (sourceMode === 'chapter') {
      if (!activeChapterBook) {
        setFormError('Upload or select a medical textbook first.');
        return;
      }
      const built: LectureProject = {
        ...buildLectureFromChapter(activeChapterBook, selectedChapterPage, {
          presenterId: builderPresenterId,
          language: builderLanguage,
          targetDurationSec: targetDurationChoice,
        }),
        preferredDiscipline: preferredDisciplineChoice,
      };
      await onSaveLecture(built);
      onSelectLecture(built.id);
      setIsBuilderOpen(false);
      setStudioStatusMsg(
        `Created continuous lecture from "${shortenBookTitle(activeChapterBook.title, 32)}" (Page ${selectedChapterPage}).`
      );
      return;
    }

    // Topic mode: supports ANY medical topic, with or without uploaded textbooks!
    const validation = validateTopicInput(topicQuery, false);
    if (!validation.valid) {
      setFormError(validation.error || 'Enter a specific medical topic.');
      return;
    }

    setIsGeneratingScript(true);
    try {
      const trimmedTopic = topicQuery.trim();
      const canonical = canonicalizeMedicalTopic(trimmedTopic);
      const matchingBlueprintGuide = savedGuides.find(
        (g) => canonicalizeMedicalTopic(g.topic).canonicalTopicId === canonical.canonicalTopicId
      );

      let createdProject: LectureProject;

      if (matchingBlueprintGuide && (!isOnline || matchingBlueprintGuide.blueprint)) {
        // Synchronize directly with the existing Medical Topic Blueprint single source of truth!
        createdProject = {
          ...buildLectureFromStudyGuide(matchingBlueprintGuide, {
            presenterId: builderPresenterId,
            language: builderLanguage,
            targetDurationSec: targetDurationChoice,
          }),
          preferredDiscipline: preferredDisciplineChoice,
        };
      } else {
        const retrieval = retrieveAcrossTextbooks(selectedBooks, trimmedTopic, 10);

        if (!isOnline) {
          createdProject = buildOfflineTextbookLecture(selectedBooks, trimmedTopic, {
            presenterId: builderPresenterId,
            language: builderLanguage,
            targetDurationSec: targetDurationChoice,
            preferredDiscipline: preferredDisciplineChoice,
          });
        } else {
          const res = await fetch('/api/lecture/generate-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: trimmedTopic,
              targetDurationSec: targetDurationChoice,
              preferredDiscipline: preferredDisciplineChoice,
              books: retrieval.bookMappings.map((m) => ({
                bookKey: m.bookKey,
                id: m.textbookId,
                title: m.textbookTitle,
                subject: m.subject,
                pageCount: m.pageCount,
              })),
              passages: retrieval.passages,
            }),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(
              data.error || 'Failed to generate lecture script from server.'
            );
          }

          createdProject = sanitizeLectureProjectResponse(
            data.lecture || {},
            selectedBooks,
            trimmedTopic,
            retrieval,
            {
              presenterId: builderPresenterId,
              language: builderLanguage,
              targetDurationSec: targetDurationChoice,
              preferredDiscipline: preferredDisciplineChoice,
            }
          );
        }
      }

      await onSaveLecture(createdProject);
      onSelectLecture(createdProject.id);
      setTopicQuery('');
      setIsBuilderOpen(false);
      setStudioStatusMsg(
        `Generated continuous ${createdProject.scenes.length}-scene lecture for "${createdProject.topic}" (${
          builderLanguage === 'ar-eg' ? 'Egyptian Medical Arabic' : 'Medical English'
        } · ${getDoctorProfile(builderPresenterId).displayLabel || 'Doctor Presenter'}).`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to generate medical lecture script.';
      setStudioErrorMsg(msg);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // Synthesize & strictly verify Gemini Neural TTS WAV for one scene
  const synthesizeSceneWav = async (
    scene: LectureScene,
    voiceName: string,
    lang: LanguageMode
  ): Promise<{
    audioWavBase64: string;
    durationSec: number;
    meanVolumeDb: number;
    peakVolumeDb: number;
    sampleRate: number;
    modelUsed: string;
    quotaNotes: string[];
  }> => {
    const narrationText =
      lang === 'ar-eg' && scene.narrationArEg?.trim()
        ? scene.narrationArEg.trim()
        : scene.narrationEn.trim();

    if (!narrationText || narrationText.length < 2) {
      throw new Error(`Scene ${scene.sceneNumber} narration script is empty.`);
    }

    const res = await fetch('/api/lecture/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: narrationText,
        voiceName,
        language: lang,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.audioWavBase64) {
      throw new Error(
        data.error || `Neural TTS synthesis failed for Scene ${scene.sceneNumber}.`
      );
    }

    const candidateScene: LectureScene = {
      ...scene,
      audioWavBase64: String(data.audioWavBase64),
      audioLang: lang,
    };
    const clientCheck = verifySceneAudioTrack(candidateScene, lang);
    if (!clientCheck.valid) {
      throw new Error(
        clientCheck.reason ||
          `Returned TTS audio for Scene ${scene.sceneNumber} failed client-side PCM signal verification.`
      );
    }

    return {
      audioWavBase64: String(data.audioWavBase64),
      durationSec: clientCheck.analysis.durationSec,
      meanVolumeDb: clientCheck.analysis.meanDb,
      peakVolumeDb: clientCheck.analysis.peakDb,
      sampleRate: clientCheck.analysis.sampleRate,
      modelUsed: String(data.modelUsed || 'gemini-tts'),
      quotaNotes: Array.isArray(data.quotaNotes) ? data.quotaNotes.map(String) : [],
    };
  };

  const handleSynthesizeSingleScene = async (scene: LectureScene) => {
    if (!isOnline) {
      setStudioErrorMsg(
        'Offline mode: Gemini Neural TTS requires an internet connection.'
      );
      return;
    }
    setStudioErrorMsg(null);
    setMp4BlockReason(null);
    setSynthesizingSceneId(scene.id);
    try {
      const profile = getDoctorProfile(activeLecture.presenterId);
      const tts = await synthesizeSceneWav(
        scene,
        profile.geminiVoice,
        activeLecture.language
      );
      setValidatedMp4(null);
      await updateProject((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.id === scene.id
            ? {
                ...s,
                audioWavBase64: tts.audioWavBase64,
                audioLang: prev.language,
                audioDurationSec: tts.durationSec,
                audioMeanDb: tts.meanVolumeDb,
                audioPeakDb: tts.peakVolumeDb,
                audioSampleRate: tts.sampleRate,
                audioModelUsed: tts.modelUsed,
                audioError: undefined,
                durationSec: Math.max(4, Math.round((tts.durationSec + 0.3) * 100) / 100),
              }
            : s
        ),
      }));
      setStudioStatusMsg(
        `Verified Scene ${scene.sceneNumber} neural narration (${tts.durationSec.toFixed(
          1
        )}s, mean ${tts.meanVolumeDb} dBFS, peak ${tts.peakVolumeDb} dBFS).`
      );
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : 'Failed to synthesize scene narration.';
      await updateProject((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.id === scene.id
            ? {
                ...s,
                audioWavBase64: undefined,
                audioError: errMsg,
              }
            : s
        ),
      }));
      setStudioErrorMsg(`Scene ${scene.sceneNumber} TTS failed: ${errMsg}`);
    } finally {
      setSynthesizingSceneId(null);
    }
  };

  const synthesizeAllScenesAudioInternal = async (
    project: LectureProject
  ): Promise<{
    updatedProject: LectureProject;
    verifiedCount: number;
    failures: Array<{ sceneNumber: number; error: string }>;
  }> => {
    const profile = getDoctorProfile(project.presenterId);
    const updatedScenes: LectureScene[] = [...project.scenes];
    const failures: Array<{ sceneNumber: number; error: string }> = [];

    for (let i = 0; i < updatedScenes.length; i++) {
      const sc = updatedScenes[i];
      const existingCheck = verifySceneAudioTrack(sc, project.language);
      if (existingCheck.valid) {
        continue;
      }

      setTtsProgressText(
        `Synthesizing & verifying neural voice (${profile.geminiVoice}) — Scene ${i + 1} of ${
          updatedScenes.length
        }...`
      );

      try {
        const tts = await synthesizeSceneWav(sc, profile.geminiVoice, project.language);
        updatedScenes[i] = {
          ...sc,
          audioWavBase64: tts.audioWavBase64,
          audioLang: project.language,
          audioDurationSec: tts.durationSec,
          audioMeanDb: tts.meanVolumeDb,
          audioPeakDb: tts.peakVolumeDb,
          audioSampleRate: tts.sampleRate,
          audioModelUsed: tts.modelUsed,
          audioError: undefined,
          durationSec: Math.max(4, Math.round((tts.durationSec + 0.3) * 100) / 100),
        };
      } catch (sceneErr) {
        const reason =
          sceneErr instanceof Error ? sceneErr.message : 'Neural TTS failed.';
        updatedScenes[i] = {
          ...sc,
          audioWavBase64: undefined,
          audioError: reason,
        };
        failures.push({ sceneNumber: sc.sceneNumber, error: reason });
      }

      const progressiveProject: LectureProject = {
        ...project,
        scenes: [...updatedScenes],
        updatedAt: new Date().toISOString(),
      };
      await onSaveLecture(progressiveProject);
    }

    const finalProject: LectureProject = {
      ...project,
      scenes: updatedScenes,
      updatedAt: new Date().toISOString(),
    };
    const verifiedCount = updatedScenes.filter(
      (s) => verifySceneAudioTrack(s, project.language).valid
    ).length;

    return {
      updatedProject: finalProject,
      verifiedCount,
      failures,
    };
  };

  const handleSynthesizeAllVoice = async () => {
    if (!isOnline) {
      setStudioErrorMsg(
        'Offline mode: Gemini Neural TTS requires an internet connection.'
      );
      return;
    }
    setStudioErrorMsg(null);
    setStudioStatusMsg(null);
    setMp4BlockReason(null);
    setValidatedMp4(null);
    setIsSynthesizingAllTts(true);
    try {
      const { updatedProject, verifiedCount, failures } =
        await synthesizeAllScenesAudioInternal(activeLecture);
      const totalScenes = updatedProject.scenes.length;

      if (failures.length > 0 || verifiedCount < totalScenes) {
        const detail = failures
          .map((f) => `Scene ${f.sceneNumber}: ${f.error}`)
          .join(' | ');
        setStudioErrorMsg(
          `Voice generation incomplete (${verifiedCount}/${totalScenes} scenes verified). ${detail}`
        );
        return;
      }

      const synced = buildSynchronizedLectureAudioTrack(
        updatedProject.scenes,
        24000,
        30,
        updatedProject.language
      );
      setStudioStatusMsg(
        `Verified ${verifiedCount}/${totalScenes} continuous voice scenes (${synced.totalDurationSec.toFixed(
          1
        )}s normalized 24 kHz WAV · mean ${synced.signalAnalysis.meanDb} dBFS · peak ${
          synced.signalAnalysis.peakDb
        } dBFS).`
      );
    } catch (err) {
      setStudioErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to synthesize neural voice for all scenes.'
      );
    } finally {
      setIsSynthesizingAllTts(false);
      setTtsProgressText('');
    }
  };

  // Render, mux via FFmpeg, and strictly validate the final MP4's AAC stream & dB volume
  const handleRenderAndValidateMp4 = async () => {
    if (isExportingMp4 || isSynthesizingAllTts) return;
    setStudioErrorMsg(null);
    setStudioStatusMsg(null);
    setMp4BlockReason(null);

    if (!isOnline || capabilities?.ffmpegMp4Available === false) {
      const msg =
        'Server FFmpeg MP4 encoder is unreachable while offline. Reconnect to synthesize neural audio and validate MP4 export.';
      setStudioErrorMsg(msg);
      setMp4BlockReason(msg);
      return;
    }

    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      masterAudioRef.current?.pause();
    }
    if (scenePreviewAudioRef.current && !scenePreviewAudioRef.current.paused) {
      scenePreviewAudioRef.current.pause();
      setPreviewingSceneId(null);
    }

    setIsExportingMp4(true);
    setExportProgressPct(2);

    try {
      let workingProject = activeLecture;
      const missingOrInvalidScenes = workingProject.scenes.some(
        (s) => !verifySceneAudioTrack(s, workingProject.language).valid
      );

      if (missingOrInvalidScenes) {
        setExportStageText(
          'Step 1/4: Synthesizing & verifying neural voiceover for all scenes...'
        );
        const batchResult = await synthesizeAllScenesAudioInternal(workingProject);
        workingProject = batchResult.updatedProject;

        if (
          batchResult.failures.length > 0 ||
          batchResult.verifiedCount < workingProject.scenes.length
        ) {
          const failureText = batchResult.failures
            .map((f) => `Scene ${f.sceneNumber}: ${f.error}`)
            .join(' | ');
          const blockMsg = `MP4 export blocked: only ${batchResult.verifiedCount}/${workingProject.scenes.length} scenes have valid narration audio. ${failureText}`;
          setMp4BlockReason(blockMsg);
          throw new Error(blockMsg);
        }
      }

      setExportProgressPct(16);
      setExportStageText(
        'Step 2/4: Normalizing & concatenating continuous scene audio tracks...'
      );

      const syncedAudio = buildSynchronizedLectureAudioTrack(
        workingProject.scenes,
        24000,
        30,
        workingProject.language
      );

      if (
        !syncedAudio.allScenesVerified ||
        syncedAudio.verifiedSceneCount < workingProject.scenes.length ||
        !syncedAudio.signalAnalysis.isNonSilentSpeech
      ) {
        const blockMsg =
          syncedAudio.signalAnalysis.failureReason ||
          `MP4 export blocked: concatenated narration track failed signal verification (${syncedAudio.verifiedSceneCount}/${workingProject.scenes.length} scenes verified).`;
        setMp4BlockReason(blockMsg);
        throw new Error(blockMsg);
      }

      const exportScenes = syncedAudio.alignedScenes;
      const exportTotalSec = Math.max(4, syncedAudio.totalDurationSec);
      const fps = 8;
      const totalFrames = Math.max(8, Math.ceil(exportTotalSec * fps));
      const audioWavBase64 = encodeBytesToBase64(syncedAudio.wavBytes);

      const initRes = await fetch('/api/lecture/export/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fps,
          totalDurationSec: exportTotalSec,
          sceneCount: exportScenes.length,
          verifiedSceneCount: syncedAudio.verifiedSceneCount,
          audioWavBase64,
        }),
      });
      const initData = await initRes.json().catch(() => ({}));
      if (!initRes.ok || !initData.sessionId) {
        const blockMsg =
          initData.error || 'Server rejected MP4 initialization due to audio validation.';
        setMp4BlockReason(blockMsg);
        throw new Error(blockMsg);
      }

      const sessionId = String(initData.sessionId);

      setExportProgressPct(22);
      setExportStageText(
        'Step 3/4: Rendering left-side doctor presenter, right-side whiteboard slides & lip-sync frames...'
      );
      await preloadAllMedicalAtlasImages();

      const offscreen = document.createElement('canvas');
      offscreen.width = 960;
      offscreen.height = 540;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) {
        throw new Error('2D Canvas context unavailable for MP4 rendering.');
      }

      const batchSize = 20;
      for (let start = 0; start < totalFrames; start += batchSize) {
        const end = Math.min(totalFrames, start + batchSize);
        const batchFrames: string[] = [];

        for (let f = start; f < end; f++) {
          const tSec = f / fps;
          const amp = sampleAmplitudeAtTime(
            syncedAudio.envelope,
            syncedAudio.envelopeHz,
            tSec
          );

          renderLectureFrame(offCtx, offscreen.width, offscreen.height, {
            scenes: exportScenes,
            timeSec: tSec,
            presenterId: workingProject.presenterId,
            language: workingProject.language,
            lectureTitle: workingProject.topic || workingProject.title,
            showSubtitles: true,
            mouthOpenness: amp,
            isSpeaking: amp > 0.04,
            preferredDiscipline: workingProject.preferredDiscipline,
            externalReferences: workingProject.externalReferences,
          });

          batchFrames.push(offscreen.toDataURL('image/jpeg', 0.82));

          if ((f - start) % 10 === 9) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        const chunkRes = await fetch('/api/lecture/export/frames', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            startIndex: start,
            frames: batchFrames,
          }),
        });
        if (!chunkRes.ok) {
          const errJson = await chunkRes.json().catch(() => ({}));
          throw new Error(errJson.error || 'Failed while uploading rendered frames.');
        }

        const pct = 24 + Math.round((end / totalFrames) * 58);
        setExportProgressPct(pct);
        await new Promise((r) => setTimeout(r, 0));
      }

      setExportProgressPct(86);
      setExportStageText(
        'Step 4/4: Muxing 24 kHz AAC audio via FFmpeg & validating final MP4 signal...'
      );

      const finalRes = await fetch('/api/lecture/export/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!finalRes.ok) {
        const errJson = await finalRes.json().catch(() => ({}));
        const blockMsg =
          errJson.error ||
          'Exported MP4 failed server audio stream & volume verification. Download blocked.';
        setMp4BlockReason(blockMsg);
        throw new Error(blockMsg);
      }

      const validationHeader = finalRes.headers.get('X-MedAtlas-Audio-Validation');
      let parsedValidation: Mp4AudioValidationReport | null = null;
      if (validationHeader) {
        try {
          parsedValidation = JSON.parse(validationHeader) as Mp4AudioValidationReport;
        } catch {
          parsedValidation = null;
        }
      }

      if (
        !parsedValidation ||
        !parsedValidation.hasAudioStream ||
        !parsedValidation.isAudibleAndValid ||
        parsedValidation.meanVolumeDb <= -48 ||
        parsedValidation.maxVolumeDb <= -30
      ) {
        const blockMsg =
          parsedValidation?.failureReason ||
          'Final MP4 did not return a verified non-silent AAC audio validation report. Download blocked.';
        setMp4BlockReason(blockMsg);
        throw new Error(blockMsg);
      }

      const mp4Blob = await finalRes.blob();
      if (mp4Blob.size < 4096) {
        const blockMsg = 'Exported MP4 file is unexpectedly small or empty. Download blocked.';
        setMp4BlockReason(blockMsg);
        throw new Error(blockMsg);
      }

      const builtSignature = computeProjectExportSignature(workingProject);
      const filename = `${slugifyFilename(workingProject.topic)}-${
        workingProject.language
      }.mp4`;
      const downloadToken = finalRes.headers.get('X-MedAtlas-Download-Token');
      const serverDownloadUrl = downloadToken
        ? `/api/lecture/export/download/${encodeURIComponent(
            downloadToken
          )}?filename=${encodeURIComponent(filename)}`
        : undefined;

      setValidatedMp4({
        signature: builtSignature,
        blob: mp4Blob,
        filename,
        validation: parsedValidation,
        downloadUrl: serverDownloadUrl,
      });
      setMp4BlockReason(null);
      setExportProgressPct(100);
      setStudioStatusMsg(
        `MP4 verified & ready to download on Android and desktop: ${filename} (${(
          mp4Blob.size /
          (1024 * 1024)
        ).toFixed(2)} MB · ${parsedValidation.audioCodec.toUpperCase()} ${
          parsedValidation.sampleRate
        } Hz · duration ${parsedValidation.videoDurationSec.toFixed(1)}s).`
      );
    } catch (err) {
      setValidatedMp4(null);
      setStudioErrorMsg(
        err instanceof Error ? err.message : 'Failed to render and validate MP4 video.'
      );
    } finally {
      setIsExportingMp4(false);
      setExportStageText('');
      setTtsProgressText('');
    }
  };

  const handleDownloadValidatedMp4 = () => {
    if (!currentValidatedMp4 || !currentValidatedMp4.validation.isAudibleAndValid) {
      setStudioErrorMsg(
        mp4BlockReason ||
          'MP4 download is locked until all scenes are synthesized and the rendered MP4 passes audio signal validation.'
      );
      return;
    }
    if (currentValidatedMp4.downloadUrl && isOnline) {
      triggerAndroidSafeUrlDownload(
        currentValidatedMp4.downloadUrl,
        currentValidatedMp4.filename
      );
      return;
    }
    triggerBlobDownload(currentValidatedMp4.blob, currentValidatedMp4.filename);
  };

  const handleDownloadSubtitles = (format: 'srt' | 'vtt') => {
    const content =
      format === 'srt'
        ? generateSrtSubtitles(displayScenes, activeLecture.language)
        : generateVttSubtitles(displayScenes, activeLecture.language);
    const mime = format === 'srt' ? 'application/x-subrip' : 'text/vtt';
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    triggerBlobDownload(
      blob,
      `${slugifyFilename(activeLecture.topic)}-${activeLecture.language}.${format}`
    );
  };

  const handleDownloadStoryboardBundle = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      title: activeLecture.title,
      topic: activeLecture.topic,
      canonicalTopicId: activeLecture.canonicalTopicId,
      language: activeLecture.language,
      presenter: getDoctorProfile(activeLecture.presenterId),
      totalDurationSec,
      coverage: activeLecture.coverage,
      coverageNote: activeLecture.coverageNote,
      verifiedBookCitations: activeLecture.bookCitations,
      externalReferences: activeLecture.externalReferences,
      timeline: timeline.map((t) => ({
        sceneNumber: t.scene.sceneNumber,
        startSec: t.startSec,
        endSec: t.endSec,
        title: t.scene.title,
        visualMode: t.scene.visualMode,
        systemTemplate: t.scene.systemTemplate,
        transitionType: t.scene.transitionType,
        narrationEn: t.scene.narrationEn,
        narrationArEg: t.scene.narrationArEg,
        visualDescription: t.scene.visualDescription,
        onScreenLabels: t.scene.onScreenLabels,
        sourceBasis: t.scene.sourceBasis,
        bookCitations: t.scene.bookCitations,
      })),
      subtitlesSrt: generateSrtSubtitles(activeLecture.scenes, activeLecture.language),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    triggerBlobDownload(
      blob,
      `${slugifyFilename(activeLecture.topic)}-storyboard-package.json`
    );
  };

  const handleUpdateSceneField = async (
    sceneId: string,
    patch: Partial<LectureScene>
  ) => {
    await updateProject((prev) => {
      const nextScenes = prev.scenes.map((s) => {
        if (s.id !== sceneId) return s;
        const narrationChanged =
          (patch.narrationEn !== undefined && patch.narrationEn !== s.narrationEn) ||
          (patch.narrationArEg !== undefined && patch.narrationArEg !== s.narrationArEg);
        return {
          ...s,
          ...patch,
          ...(narrationChanged
            ? {
                audioWavBase64: undefined,
                audioMeanDb: undefined,
                audioPeakDb: undefined,
                audioSampleRate: undefined,
                audioModelUsed: undefined,
                audioError: undefined,
              }
            : {}),
        };
      });
      const defaultSystem = prev.scenes[0]?.systemTemplate || 'cardiopulmonary';
      return {
        ...prev,
        scenes: normalizeLectureScenes(
          prev.topic,
          defaultSystem,
          nextScenes,
          prev.externalReferences
        ),
      };
    });
  };

  const handleMoveScene = async (index: number, direction: -1 | 1) => {
    const defaultSystem = activeLecture.scenes[0]?.systemTemplate || 'cardiopulmonary';
    await updateProject((prev) => ({
      ...prev,
      scenes: reorderLectureScene(
        prev.scenes,
        index,
        index + direction,
        prev.topic,
        defaultSystem,
        prev.externalReferences
      ),
    }));
  };

  const handleAddTeachingScene = async () => {
    const defaultSystem = activeLecture.scenes[0]?.systemTemplate || 'cardiopulmonary';
    const teachingCount = activeLecture.scenes.filter(
      (s) => s.visualMode !== 'references'
    ).length;
    const newScene: LectureScene = {
      id: `scene-custom-${Date.now()}`,
      sceneNumber: teachingCount + 1,
      title: `${activeLecture.topic}: Clinical Takeaway`,
      visualMode: 'clinical_flow',
      systemTemplate: defaultSystem,
      narrationEn: `Continuing directly, let us connect this mechanism to bedside clinical decision-making in ${activeLecture.topic}.`,
      narrationArEg: `ومكملين مع بعض، تعالوا نربط الميكانيزم ده بالقرار الإكلينيكي على سرير العيان في حالات ${activeLecture.topic}.`,
      visualDescription: 'Focused clinical decision pathway card.',
      onScreenLabels: [activeLecture.topic, 'Bedside Assessment', 'Clinical Takeaway'],
      highlightedCallouts: ['Clinical Takeaway'],
      transitionType: 'slide',
      durationSec: 14,
      sourceBasis: 'general_medical_knowledge',
      pageNumbers: [],
      bookCitations: [],
    };

    await updateProject((prev) => {
      const teaching = prev.scenes.filter((s) => s.visualMode !== 'references');
      const refScene = prev.scenes.find((s) => s.visualMode === 'references');
      const combined = refScene
        ? [...teaching, newScene, refScene]
        : [...teaching, newScene];
      return {
        ...prev,
        scenes: normalizeLectureScenes(
          prev.topic,
          defaultSystem,
          combined,
          prev.externalReferences
        ),
      };
    });
    setSelectedSceneId(newScene.id);
  };

  const handleDeleteTeachingScene = async (sceneId: string) => {
    const teaching = activeLecture.scenes.filter((s) => s.visualMode !== 'references');
    if (teaching.length <= 1) {
      setStudioErrorMsg('A lecture must retain at least one teaching scene.');
      return;
    }
    const defaultSystem = activeLecture.scenes[0]?.systemTemplate || 'cardiopulmonary';
    await updateProject((prev) => ({
      ...prev,
      scenes: normalizeLectureScenes(
        prev.topic,
        defaultSystem,
        prev.scenes.filter((s) => s.id !== sceneId),
        prev.externalReferences
      ),
    }));
  };

  const activePresenter = getDoctorProfile(activeLecture.presenterId);
  const normalizedActivePresenterId = normalizePresenterId(activeLecture.presenterId);
  const neuralReadyCount = audioBundle.verifiedSceneCount;
  const failedSceneCount = activeLecture.scenes.filter((s) => Boolean(s.audioError)).length;

  const clickableProjectCitations = flattenClickableCitations(
    activeLecture.bookCitations,
    [],
    activeLecture.sourceTextbooks[0]?.id,
    activeLecture.sourceTextbooks[0]?.title
  );

  const postQuizCorrectCount = postLectureQuizzes.filter(
    (q) => postQuizAnswers[q.id] === q.correctIndex
  ).length;

  const preRenderStoryboard = useMemo(
    () => buildCompleteLectureStoryboard(activeLecture),
    [activeLecture]
  );

  const engineDisclosure = useMemo(() => getLectureRenderingEngineDisclosure(), []);

  const categoryHumanLabel = preRenderStoryboard.categoryLabel;

  return (
    <div className="space-y-5">
      <audio ref={masterAudioRef} preload="auto" className="hidden" />
      <audio ref={scenePreviewAudioRef} preload="auto" className="hidden" />

      {/* Compact Studio Header + Pre-Playback Presenter & Language Selectors */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#0284C7]">
              <Film className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>CONTINUOUS MEDICAL LECTURE STUDIO</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-mono text-slate-600 tabular-nums">
                {activeLecture.scenes.length} Scenes · {formatClock(totalDurationSec)} Continuous
              </span>
            </div>
            <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#0F4C81] truncate">
              {activeLecture.title}
            </h1>
            <p className="text-xs text-slate-600 max-w-3xl">{activeLecture.coverageNote}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {savedLectures.length > 1 && (
              <select
                id="saved-lecture-picker"
                aria-label="Switch Saved Lecture Project"
                value={activeLecture.id}
                onChange={(e) => onSelectLecture(e.target.value)}
                className="min-h-[44px] max-w-[220px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0284C7] focus:outline-none"
              >
                {savedLectures.map((lec) => (
                  <option key={lec.id} value={lec.id}>
                    {lec.topic}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setIsBuilderOpen((prev) => !prev)}
              aria-expanded={isBuilderOpen}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0F4C81] px-4 py-2 text-xs sm:text-sm font-bold text-white hover:bg-[#0c3d68] transition-colors"
            >
              <Sparkles className="h-4 w-4 text-sky-200 shrink-0" aria-hidden="true" />
              <span>{isBuilderOpen ? 'Close Topic Builder' : 'New Topic Lecture'}</span>
            </button>
          </div>
        </div>

        {/* Always-Visible Presenter (Male/Female Doctor) & Language Selector Bar BEFORE Playing or Generating */}
        <div
          aria-label="Doctor Presenter and Language Options"
          className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-[#F8FAFC] p-3"
        >
          <div className="space-y-1.5">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
              1. Doctor Presenter (Consistent White Coat &amp; Voice)
            </span>
            <div className="grid grid-cols-2 gap-2">
              {PRIMARY_DOCTOR_PRESENTERS.map((doc) => {
                const isSelected = normalizedActivePresenterId === doc.id;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    data-testid={`presenter-option-${doc.id}`}
                    onClick={() => handleChangePresenter(doc.id)}
                    aria-pressed={isSelected}
                    className={`min-h-[46px] rounded-xl border px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{doc.displayLabel}</span>
                    </div>
                    <div
                      className={`text-[11px] truncate ${
                        isSelected ? 'text-sky-200' : 'text-slate-500'
                      }`}
                    >
                      {doc.name} · Voice: {doc.geminiVoice}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
              2. Lecture Narration Language
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    id: 'en' as LanguageMode,
                    title: 'Medical English',
                    sub: 'Clear, calm academic English',
                  },
                  {
                    id: 'ar-eg' as LanguageMode,
                    title: 'Egyptian Medical Arabic',
                    sub: 'عامية مصرية طبية + English terms',
                  },
                ] as const
              ).map((langOpt) => {
                const isSelected = activeLecture.language === langOpt.id;
                return (
                  <button
                    key={langOpt.id}
                    type="button"
                    data-testid={`language-option-${langOpt.id}`}
                    onClick={() => handleChangeLanguage(langOpt.id)}
                    aria-pressed={isSelected}
                    className={`min-h-[46px] rounded-xl border px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? 'border-[#0284C7] bg-[#0284C7] text-white'
                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{langOpt.title}</span>
                    </div>
                    <div
                      className={`text-[11px] truncate ${
                        isSelected ? 'text-sky-100' : 'text-slate-500'
                      }`}
                    >
                      {langOpt.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Collapsible New Lecture Generator Form (Supports ANY Medical Topic!) */}
        {isBuilderOpen && (
          <form
            onSubmit={handleGenerateLecture}
            aria-label="Create new continuous medical lecture"
            className="border-t border-slate-200 pt-4 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { id: 'topic', label: 'Any Medical Topic (Blueprint)' },
                  { id: 'study_guide', label: 'From Saved Topic Blueprint' },
                  { id: 'chapter', label: 'From Textbook Page' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setSourceMode(mode.id);
                    setFormError(null);
                  }}
                  className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-xs font-semibold text-left transition-colors ${
                    sourceMode === mode.id
                      ? 'border-[#0284C7] bg-sky-50/70 text-[#0F4C81]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {sourceMode === 'topic' && (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="lecture-topic-input"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Enter Any Medical Topic (Even Outside Uploaded Textbooks)
                  </label>
                  <input
                    id="lecture-topic-input"
                    type="text"
                    value={topicQuery}
                    onChange={(e) => {
                      setTopicQuery(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    placeholder="e.g., Peptic Ulcer Disease, Acute Appendicitis, Asthma, Heart Failure..."
                    className="w-full min-h-[46px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                  />
                </div>

                {textbooks.length > 0 && (
                  <div>
                    <span className="block text-xs font-semibold text-slate-600 mb-1.5">
                      Optional Uploaded Textbooks ({selectedBooks.length} selected — leave 0 for general medical knowledge)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {textbooks.map((book) => {
                        const active = selectedBooks.some((b) => b.id === book.id);
                        return (
                          <button
                            key={book.id}
                            type="button"
                            onClick={() => onToggleTextbookSelection(book.id)}
                            aria-pressed={active}
                            className={`min-h-[38px] rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${
                              active
                                ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {shortenBookTitle(book.title, 34)} ({book.pageCount}p)
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {sourceMode === 'study_guide' && (
              <div>
                <label
                  htmlFor="saved-guide-lecture-select"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Select Saved Medical Topic Blueprint
                </label>
                <select
                  id="saved-guide-lecture-select"
                  value={selectedStudyGuideId}
                  onChange={(e) => setSelectedStudyGuideId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {savedGuides.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.topic}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sourceMode === 'chapter' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="chapter-book-select"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Select Medical Textbook
                  </label>
                  <select
                    id="chapter-book-select"
                    value={activeChapterBook?.id || ''}
                    onChange={(e) => {
                      setSelectedChapterBookId(e.target.value);
                      setSelectedChapterPage(1);
                    }}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {textbooks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} ({b.pageCount} pages)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="chapter-page-select"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Select Chapter / Page
                  </label>
                  <select
                    id="chapter-page-select"
                    value={selectedChapterPage}
                    onChange={(e) => setSelectedChapterPage(Number(e.target.value))}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {(activeChapterBook?.pages || []).map((pg) => (
                      <option key={pg.pageNumber} value={pg.pageNumber}>
                        Page {pg.pageNumber}
                        {pg.chapterTitle ? ` — ${pg.chapterTitle}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {formError && (
              <p role="alert" className="text-xs font-semibold text-red-700">
                {formError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-700">
                <label htmlFor="builder-presenter-select" className="font-semibold">
                  Presenter:
                </label>
                <select
                  id="builder-presenter-select"
                  value={builderPresenterId}
                  onChange={(e) => setBuilderPresenterId(e.target.value as DoctorPersonaId)}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value="female_doctor">Female Doctor (Dr. Maya Lin · Kore)</option>
                  <option value="male_doctor">Male Doctor (Dr. Karim Mansour · Charon)</option>
                </select>

                <label htmlFor="builder-lang-select" className="font-semibold">
                  Language:
                </label>
                <select
                  id="builder-lang-select"
                  value={builderLanguage}
                  onChange={(e) => setBuilderLanguage(e.target.value as LanguageMode)}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value="en">Medical English</option>
                  <option value="ar-eg">Egyptian Medical Arabic</option>
                </select>

                <label htmlFor="builder-duration-select" className="font-semibold">
                  Duration:
                </label>
                <select
                  id="builder-duration-select"
                  value={targetDurationChoice}
                  onChange={(e) => setTargetDurationChoice(Number(e.target.value))}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value={60}>60 sec</option>
                  <option value={90}>90 sec</option>
                  <option value={120}>120 sec</option>
                  <option value={180}>180 sec</option>
                </select>

                <label htmlFor="builder-discipline-select" className="font-semibold">
                  Focus:
                </label>
                <select
                  id="builder-discipline-select"
                  value={preferredDisciplineChoice}
                  onChange={(e) =>
                    setPreferredDisciplineChoice(
                      e.target.value as MedicalSubjectDiscipline | 'auto'
                    )
                  }
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value="auto">Integrated Sciences</option>
                  <option value="anatomy">Anatomy</option>
                  <option value="physiology">Physiology</option>
                  <option value="pathology">Pathology</option>
                  <option value="pharmacology">Pharmacology</option>
                  <option value="immunology">Immunology</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isGeneratingScript}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0284C7] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0369A1] disabled:opacity-60 transition-colors"
              >
                {isGeneratingScript ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Building Continuous Lecture...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>Generate Continuous Lecture</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </section>

      {studioErrorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm text-red-900 flex items-start gap-2.5"
        >
          <AlertTriangle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{studioErrorMsg}</span>
        </div>
      )}

      {studioStatusMsg && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs sm:text-sm text-emerald-950 flex items-start gap-2.5"
        >
          <CheckCircle2
            className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <span>{studioStatusMsg}</span>
        </div>
      )}

      {/* MAIN CONTINUOUS LECTURE VIDEO + INTERACTIVE SMARTBOARD STAGE */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div
            role="group"
            aria-label="Lecture display mode"
            className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1"
          >
            <button
              type="button"
              onClick={() => setStageViewMode('video')}
              aria-pressed={stageViewMode === 'video'}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                stageViewMode === 'video'
                  ? 'bg-white text-[#0F4C81] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              16:9 Lecture Video
            </button>
            <button
              type="button"
              onClick={() => setStageViewMode('textbook')}
              aria-pressed={stageViewMode === 'textbook'}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                stageViewMode === 'textbook'
                  ? 'bg-white text-[#0F4C81] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Interactive Smartboard Explorer
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCapabilityDetails((v) => !v)}
            aria-expanded={showCapabilityDetails}
            className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#0F4C81]"
          >
            <Info className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
            <span>Rendering Engine &amp; Limitations</span>
          </button>
        </div>

        {showCapabilityDetails && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 leading-relaxed space-y-1.5">
            <div>
              <strong>Rendering Architecture Disclosure:</strong>{' '}
              {capabilities?.engineNote || engineDisclosure.summary}
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
              {(capabilities?.renderingLimitations &&
              capabilities.renderingLimitations.length > 0
                ? capabilities.renderingLimitations
                : engineDisclosure.limitations
              ).map((lim, idx) => (
                <li key={idx}>{lim}</li>
              ))}
            </ul>
          </div>
        )}

        <InteractiveTextbookStage
          lectureTitle={activeLecture.topic}
          scenes={displayScenes}
          activeScene={activeLookup.current.scene}
          activeSceneIndex={activeLookup.current.index}
          sceneProgress={activeLookup.sceneProgress}
          currentTimeSec={currentTimeSec}
          totalDurationSec={totalDurationSec}
          presenterId={activeLecture.presenterId}
          language={activeLecture.language}
          showSubtitles={showSubtitles}
          isPlaying={isPlaying}
          mouthOpenness={currentMouthOpenness}
          isSpeaking={currentIsSpeaking}
          preferredDiscipline={activeLecture.preferredDiscipline}
          externalReferences={activeLecture.externalReferences}
          aggregateCitations={activeLecture.bookCitations}
          onReplayScene={handleReplayCurrentScene}
          onJumpToSceneIndex={(idx) => {
            const target = timeline[Math.max(0, Math.min(timeline.length - 1, idx))];
            if (target) handleSeekTo(target.startSec + 0.05);
          }}
          onSeekToTime={handleSeekTo}
          onOpenPage={onOpenPage}
          stageViewMode={stageViewMode}
          videoCanvasSlot={
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              data-testid="lecture-studio-canvas"
              data-playback-state={isPlaying ? 'playing' : 'paused'}
              data-scene-index={activeLookup.current.index}
              data-presenter-id={activeLecture.presenterId}
              data-language={activeLecture.language}
              aria-label={`Continuous 3D medical lecture player: ${activeLecture.title}`}
              className="block w-full aspect-video h-auto"
            />
          }
        />

        {/* Continuous Scrubber Timeline */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono text-slate-600 tabular-nums">
            <span>
              Scene {activeLookup.current.scene.sceneNumber}/{activeLecture.scenes.length} ·{' '}
              {formatClock(currentTimeSec)}
            </span>
            <span>Continuous Total {formatClock(totalDurationSec)}</span>
          </div>
          <label htmlFor="lecture-timeline-scrubber" className="sr-only">
            Lecture timeline position in seconds
          </label>
          <input
            id="lecture-timeline-scrubber"
            type="range"
            min={0}
            max={totalDurationSec}
            step={0.1}
            value={Math.min(currentTimeSec, totalDurationSec)}
            onChange={(e) => handleSeekTo(Number(e.target.value))}
            className="w-full h-2 accent-[#0F4C81] cursor-pointer"
          />

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5">
            {timeline.map((item) => {
              const isCurrent = item.index === activeLookup.current.index;
              return (
                <button
                  key={item.scene.id}
                  type="button"
                  onClick={() => handleSeekTo(item.startSec + 0.05)}
                  className={`min-h-[34px] shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    isCurrent
                      ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.scene.visualMode === 'references'
                    ? `${item.scene.sceneNumber}. Summary & Sources`
                    : `${item.scene.sceneNumber}. ${item.scene.title.slice(0, 22)}${
                        item.scene.title.length > 22 ? '…' : ''
                      }`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Transport & Subtitle Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleJumpScene(-1)}
              aria-label="Previous Scene"
              disabled={activeLookup.current.index === 0}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <SkipBack className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pause Lecture' : 'Play Continuous Lecture'}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0F4C81] px-5 py-2 text-sm font-bold text-white hover:bg-[#0c3d68] transition-colors"
            >
              {isPlaying ? (
                <>
                  <Pause className="h-4 w-4" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>Play Continuous Video</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleJumpScene(1)}
              aria-label="Next Scene"
              disabled={activeLookup.current.index >= timeline.length - 1}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSubtitles((v) => !v)}
              aria-pressed={showSubtitles}
              aria-label="Toggle Synchronized Subtitles"
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                showSubtitles
                  ? 'border-[#0284C7] bg-sky-50/70 text-[#0F4C81]'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <Captions className="h-4 w-4" aria-hidden="true" />
              <span>{showSubtitles ? 'Subtitles On' : 'Subtitles Off'}</span>
            </button>

            <select
              aria-label="Target Video Duration"
              value={Math.round(totalDurationSec)}
              onChange={(e) => handleRescaleDuration(Number(e.target.value))}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
            >
              {![60, 90, 120, 180].includes(Math.round(totalDurationSec)) && (
                <option value={Math.round(totalDurationSec)}>
                  {Math.round(totalDurationSec)}s (Current)
                </option>
              )}
              <option value={60}>60s Duration</option>
              <option value={90}>90s Duration</option>
              <option value={120}>120s Duration</option>
              <option value={180}>180s Duration</option>
            </select>
          </div>
        </div>

        {/* Neural TTS Audio Synthesis & Preview Bar */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-700">
              <span className="font-bold text-slate-900">
                Continuous Voice Track ({activePresenter.geminiVoice} ·{' '}
                {activeLecture.language === 'ar-eg'
                  ? 'Egyptian Medical Arabic'
                  : 'Medical English'}
                ):
              </span>{' '}
              {audioBundle.allScenesVerified ? (
                <span className="font-semibold text-emerald-800">
                  All {neuralReadyCount}/{activeLecture.scenes.length} scenes verified (24 kHz WAV · Mean {audioBundle.signalAnalysis.meanDb} dBFS)
                </span>
              ) : (
                <span className={failedSceneCount > 0 ? 'font-semibold text-red-800' : ''}>
                  {neuralReadyCount}/{activeLecture.scenes.length} scenes verified
                  {failedSceneCount > 0 ? ` (${failedSceneCount} failed — retry below)` : ''}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!audioBundle.hasRealSpeechAudio && (
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useBrowserSpeechPreview}
                    onChange={(e) => setUseBrowserSpeechPreview(e.target.checked)}
                    className="rounded border-slate-300 text-[#0F4C81]"
                  />
                  <span>Browser Speech Preview</span>
                </label>
              )}

              {audioBundle.hasRealSpeechAudio && (
                <button
                  type="button"
                  onClick={handlePreviewGeneratedNarration}
                  disabled={isSynthesizingAllTts || isExportingMp4}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-55 transition-colors"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Pause Audio</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Listen to Narration</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleSynthesizeAllVoice}
                disabled={isSynthesizingAllTts || isExportingMp4 || !isOnline}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0284C7] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#0369A1] disabled:opacity-55 transition-colors"
              >
                {isSynthesizingAllTts ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Synthesizing WAV...</span>
                  </>
                ) : failedSceneCount > 0 && neuralReadyCount < activeLecture.scenes.length ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Retry Missing Scenes</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {audioBundle.allScenesVerified
                        ? 'Re-verify Voice (WAV)'
                        : 'Synthesize Neural Voice (WAV)'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {ttsProgressText && (
            <p className="text-xs font-medium text-[#0F4C81]">{ttsProgressText}</p>
          )}

          {masterAudioUrl && audioBundle.hasRealSpeechAudio && (
            <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-600">
                <span>
                  CONTINUOUS WAV AUDIO ({audioBundle.verifiedSceneCount}/{activeLecture.scenes.length} SCENES · {audioBundle.totalDurationSec.toFixed(1)}s)
                </span>
                <span className="text-emerald-800 font-semibold">
                  Mean {audioBundle.signalAnalysis.meanDb} dBFS · Peak {audioBundle.signalAnalysis.peakDb} dBFS
                </span>
              </div>
              <audio
                controls
                preload="auto"
                src={masterAudioUrl}
                aria-label="Listen to continuous lecture narration audio"
                className="w-full h-9"
              />
            </div>
          )}
        </div>

        {/* MP4 Video & Subtitle Export Bar */}
        <div className="border-t border-slate-200 pt-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Export Continuous MP4 Video &amp; Subtitles
            </span>
            <span className="text-[11px] font-medium text-slate-600">
              24 kHz AAC + H.264 MP4 verified via FFmpeg volumedetect
            </span>
          </div>

          {isExportingMp4 && (
            <div className="space-y-1.5 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-[#0F4C81]">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>{exportStageText || 'Rendering & validating MP4 video...'}</span>
                </span>
                <span className="font-mono tabular-nums">{exportProgressPct}%</span>
              </div>
              <progress
                aria-label="MP4 video export progress"
                value={exportProgressPct}
                max={100}
                className="block h-2 w-full overflow-hidden rounded-full bg-slate-200 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#0F4C81] [&::-moz-progress-bar]:bg-[#0F4C81]"
              />
            </div>
          )}

          {currentValidatedMp4 && currentValidatedMp4.validation.isAudibleAndValid ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>
                  MP4 Verified: {currentValidatedMp4.validation.audioCodec.toUpperCase()}{' '}
                  {currentValidatedMp4.validation.sampleRate} Hz ·{' '}
                  {currentValidatedMp4.validation.videoDurationSec.toFixed(1)}s · Mean{' '}
                  {currentValidatedMp4.validation.meanVolumeDb.toFixed(1)} dB
                </span>
              </div>
              <span className="font-mono text-[11px] text-emerald-800">
                {(currentValidatedMp4.blob.size / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>
          ) : mp4BlockReason ? (
            <p className="text-xs font-semibold text-red-800">{mp4BlockReason}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRenderAndValidateMp4}
              disabled={isExportingMp4 || isSynthesizingAllTts || !isOnline}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0284C7] px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#0369A1] disabled:opacity-60 transition-colors"
            >
              {isExportingMp4 ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Film className="h-4 w-4 text-sky-100" aria-hidden="true" />
              )}
              <span>
                {currentValidatedMp4 ? 'Re-render & Validate MP4' : 'Render & Validate MP4'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadValidatedMp4}
              disabled={
                !currentValidatedMp4 ||
                !currentValidatedMp4.validation.isAudibleAndValid ||
                isExportingMp4 ||
                isSynthesizingAllTts
              }
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0F4C81] px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-[#0c3d68] disabled:cursor-not-allowed disabled:opacity-45 transition-colors"
            >
              <Download className="h-4 w-4 text-sky-200" aria-hidden="true" />
              <span>Download MP4 Video</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadSubtitles('srt')}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Captions className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
              <span>.SRT</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadSubtitles('vtt')}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Captions className="h-4 w-4 text-[#0F4C81]" aria-hidden="true" />
              <span>.VTT</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadStoryboardBundle}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <FileCode2 className="h-4 w-4 text-slate-600" aria-hidden="true" />
              <span>Storyboard (.json)</span>
            </button>
          </div>
        </div>
      </div>

      {/* PRE-RENDER COMPLETE NARRATION SCRIPT & MATCHING VISUAL STORYBOARD */}
      <section
        data-testid="pre-render-storyboard-section"
        aria-label="Complete Narration Script and Matching Visual Storyboard"
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#0284C7]">
              Pre-Render Verification · Adaptive Topic Sequence ({categoryHumanLabel})
            </div>
            <h2 className="font-serif text-base sm:text-lg font-bold text-[#0F4C81]">
              Complete Narration Script &amp; Matching Right-Smartboard Storyboard
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Stages included:{' '}
              <span className="font-semibold text-slate-800">
                {preRenderStoryboard.rows.map((r) => r.stageLabel).join(' → ')}
              </span>
              {preRenderStoryboard.omittedStages.length > 0 && (
                <span>
                  {' '}
                  · Irrelevant stages omitted:{' '}
                  {preRenderStoryboard.omittedStages
                    .map((s) => formatPedagogicalStageLabel(s))
                    .join(', ')}
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowPreRenderStoryboard((v) => !v)}
            aria-expanded={showPreRenderStoryboard}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-[#0F4C81] hover:bg-slate-100"
          >
            {showPreRenderStoryboard ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Hide Storyboard</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Review Script &amp; Slides ({preRenderStoryboard.rows.length})</span>
              </>
            )}
          </button>
        </div>

        {showPreRenderStoryboard && (
          <div className="grid grid-cols-1 gap-3">
            {preRenderStoryboard.rows.map((row) => (
              <div
                key={row.sceneId}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5"
              >
                {/* Left: Doctor Presenter Spoken Narration */}
                <div className="md:col-span-6 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F4C81]">
                      0{row.sceneNumber} · {row.stageLabel} (Doctor on Left)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSeekTo(row.startSec + 0.05)}
                      className="text-[11px] font-mono font-semibold text-[#0284C7] hover:underline"
                    >
                      {formatClock(row.startSec)}–{formatClock(row.endSec)}
                    </button>
                  </div>
                  <p
                    dir={activeLecture.language === 'ar-eg' ? 'rtl' : 'ltr'}
                    className="text-xs sm:text-sm text-slate-800 leading-relaxed bg-white rounded-lg border border-slate-200/80 p-2.5"
                  >
                    {row.narrationText}
                  </p>
                </div>

                {/* Right: Matching Electronic Smartboard Slide */}
                <div className="md:col-span-6 rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0284C7]">
                      Right Smartboard Slide
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">
                      {row.visualDiagramSummary}
                    </span>
                  </div>
                  <div className="font-serif text-sm font-bold text-[#0F4C81]">
                    {row.slideHeading}
                  </div>
                  <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                    {row.slideBullets.map((b, bIdx) => (
                      <li key={bIdx}>{b}</li>
                    ))}
                  </ul>
                  {row.visualLabels.length > 0 && (
                    <div className="pt-1 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700">Synchronized Labels:</span>{' '}
                      {row.visualLabels
                        .map((lbl, lIdx) => `${lIdx + 1}. ${lbl}`)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SEPARATE POST-LECTURE QUIZ SECTION (Strictly Outside & After Video Timeline!) */}
      {postLectureQuizzes.length > 0 && (
        <section
          data-testid="post-lecture-quiz-section"
          aria-label="Post-Lecture Knowledge Check"
          className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#0284C7]">
                Post-Lecture Self-Assessment (Never Interrupts Video)
              </div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#0F4C81]">
                After-Lecture Review Questions: {activeLecture.topic}
              </h2>
            </div>

            {onOpenTimedExam && (
              <button
                type="button"
                onClick={() => onOpenTimedExam(activeLecture.topic)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[#0F4C81] bg-white px-3.5 py-2 text-xs font-bold text-[#0F4C81] hover:bg-sky-50 transition-colors"
              >
                <ClipboardCheck className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
                <span>Start Full Timed Exam</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {postLectureQuizzes.map((q, qIdx) => {
              const chosen = postQuizAnswers[q.id];
              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5 space-y-2.5"
                >
                  <div className="text-[11px] font-mono font-bold text-[#0284C7]">
                    QUESTION {qIdx + 1} · {q.sectionLabel.toUpperCase()}
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                    {q.question}
                  </p>
                  <div className="space-y-1.5">
                    {q.options.map((opt, oIdx) => {
                      const isSelected = chosen === oIdx;
                      const isCorrect = oIdx === q.correctIndex;
                      let cls =
                        'border-slate-200 bg-white text-slate-800 hover:border-[#0284C7]';
                      if (postQuizSubmitted) {
                        if (isCorrect) {
                          cls =
                            'border-emerald-500 bg-emerald-50 text-emerald-950 font-semibold';
                        } else if (isSelected) {
                          cls = 'border-red-400 bg-red-50 text-red-950';
                        }
                      } else if (isSelected) {
                        cls = 'border-[#0F4C81] bg-sky-50 text-[#0F4C81] font-semibold';
                      }

                      return (
                        <button
                          key={oIdx}
                          type="button"
                          disabled={postQuizSubmitted}
                          onClick={() =>
                            setPostQuizAnswers((prev) => ({ ...prev, [q.id]: oIdx }))
                          }
                          className={`w-full min-h-[40px] rounded-lg border px-3 py-2 text-left text-xs leading-snug flex items-start gap-2 transition-colors ${cls}`}
                        >
                          <span className="font-mono font-bold shrink-0">
                            {String.fromCharCode(65 + oIdx)}.
                          </span>
                          <span className="flex-1">{opt}</span>
                          {postQuizSubmitted && isCorrect && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          )}
                          {postQuizSubmitted && isSelected && !isCorrect && (
                            <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {postQuizSubmitted && (
                    <p className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700 leading-relaxed">
                      <strong className="text-[#0F4C81]">Explanation: </strong>
                      {q.explanation}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {postQuizSubmitted ? (
              <div className="text-sm font-bold text-[#0F4C81] tabular-nums">
                Score: {postQuizCorrectCount} / {postLectureQuizzes.length} (
                {Math.round(
                  (postQuizCorrectCount / Math.max(1, postLectureQuizzes.length)) * 100
                )}
                %)
              </div>
            ) : (
              <span className="text-xs text-slate-600">
                Answers and explanations are revealed after submitting.
              </span>
            )}

            <div className="flex items-center gap-2">
              {postQuizSubmitted ? (
                <button
                  type="button"
                  onClick={() => {
                    setPostQuizAnswers({});
                    setPostQuizSubmitted(false);
                  }}
                  className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  Reset Post-Lecture Quiz
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPostQuizSubmitted(true)}
                  disabled={Object.keys(postQuizAnswers).length === 0}
                  className="min-h-[42px] rounded-xl bg-[#0F4C81] px-4 py-2 text-xs font-bold text-white hover:bg-[#0c3d68] disabled:opacity-45"
                >
                  Check Answers
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* BOTTOM TWO-COLUMN PRODUCTION DECK: Provenance + Editable Scene Script */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Evidence Provenance
              </h2>
              {savedLectures.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteLecture(activeLecture.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              )}
            </div>

            {clickableProjectCitations.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-emerald-900">
                  Uploaded Textbook Citations:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {clickableProjectCitations.map((cit) => (
                    <button
                      key={cit.key}
                      type="button"
                      onClick={() => onOpenPage(cit.pageNumber, cit.textbookId)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-1 text-xs font-semibold text-emerald-950 hover:bg-emerald-100/70 transition-colors"
                    >
                      <BookOpen className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                      <span>
                        {cit.shortTitle} · p.{cit.pageNumber}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>General Medical Knowledge Mode:</strong> Zero uploaded textbook pages matched "{activeLecture.topic}". All scenes are explicitly labeled without fabricated page citations.
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-8">
          <section
            aria-label="Editable lecture scenes and script"
            className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#0F4C81]">
                Continuous Scene Script &amp; Smartboard Editor ({activeLecture.scenes.length})
              </h2>
              <button
                type="button"
                onClick={handleAddTeachingScene}
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-[#0F4C81] hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add Scene</span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
              {timeline.map((item, idx) => {
                const rawScene =
                  activeLecture.scenes.find((s) => s.id === item.scene.id) || item.scene;
                const sc = rawScene;
                const sceneAudioCheck = sceneVerificationMap.get(sc.id);
                const isSceneAudioValid = Boolean(sceneAudioCheck?.valid);
                const isRefScene = sc.visualMode === 'references';
                const isExpanded = selectedSceneId === sc.id;
                const teachingCount = activeLecture.scenes.filter(
                  (s) => s.visualMode !== 'references'
                ).length;

                return (
                  <div
                    key={sc.id}
                    className={`rounded-xl border transition-colors ${
                      sc.audioError
                        ? 'border-red-300 bg-red-50/20'
                        : isExpanded
                          ? 'border-[#0284C7] bg-sky-50/25'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 p-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSceneId(isExpanded ? '' : sc.id);
                          handleSeekTo(item.startSec + 0.05);
                        }}
                        aria-expanded={isExpanded}
                        className="flex-1 text-left min-h-[40px]"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-500 tabular-nums">
                          <span className="font-bold text-[#0F4C81]">
                            SCENE 0{sc.sceneNumber}
                          </span>
                          <span>·</span>
                          <span>
                            {formatClock(item.startSec)}–{formatClock(item.endSec)}
                          </span>
                          <span>·</span>
                          {isSceneAudioValid && sceneAudioCheck ? (
                            <span className="font-sans font-semibold text-emerald-800">
                              WAV Verified ({sceneAudioCheck.analysis.durationSec.toFixed(1)}s)
                            </span>
                          ) : sc.audioError ? (
                            <span className="font-sans font-semibold text-red-700">
                              Voice Failed
                            </span>
                          ) : (
                            <span className="font-sans text-slate-500">Voice Pending</span>
                          )}
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5">
                          {sc.title}
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {isSceneAudioValid && (
                          <button
                            type="button"
                            onClick={() => handlePreviewSingleSceneAudio(sc)}
                            className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100"
                          >
                            {previewingSceneId === sc.id ? (
                              <Pause className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <Play className="h-3 w-3" aria-hidden="true" />
                            )}
                            <span>{previewingSceneId === sc.id ? 'Stop' : 'Listen'}</span>
                          </button>
                        )}

                        {!isRefScene && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleMoveScene(idx, -1)}
                              disabled={idx === 0}
                              aria-label={`Move Scene ${sc.sceneNumber} Up`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-35"
                            >
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveScene(idx, 1)}
                              disabled={idx >= teachingCount - 1}
                              aria-label={`Move Scene ${sc.sceneNumber} Down`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-35"
                            >
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedSceneId(isExpanded ? '' : sc.id)}
                          aria-label={
                            isExpanded
                              ? `Collapse Scene ${sc.sceneNumber} Editor`
                              : `Expand Scene ${sc.sceneNumber} Editor`
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>

                    {sc.audioError && (
                      <div
                        role="alert"
                        className="mx-3 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>
                          <strong>Scene {sc.sceneNumber} Voice Error:</strong> {sc.audioError}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSynthesizeSingleScene(sc)}
                          disabled={
                            synthesizingSceneId === sc.id ||
                            isSynthesizingAllTts ||
                            !isOnline
                          }
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Retry</span>
                        </button>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="border-t border-slate-200 p-3.5 space-y-3 bg-white rounded-b-xl">
                        <div>
                          <label
                            htmlFor={`scene-title-${sc.id}`}
                            className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                          >
                            Smartboard Concept Heading
                          </label>
                          <input
                            id={`scene-title-${sc.id}`}
                            type="text"
                            value={sc.title}
                            disabled={isRefScene}
                            onChange={(e) =>
                              handleUpdateSceneField(sc.id, { title: e.target.value })
                            }
                            className="w-full min-h-[40px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900 disabled:bg-slate-50"
                          />
                        </div>

                        {!isRefScene && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <select
                              aria-label="Visual Focus"
                              value={sc.visualMode}
                              onChange={(e) =>
                                handleUpdateSceneField(sc.id, {
                                  visualMode: e.target.value as SceneVisualMode,
                                })
                              }
                              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800"
                            >
                              <option value="anatomy">Anatomy</option>
                              <option value="physiology">Physiology</option>
                              <option value="pathophysiology">Pathophysiology</option>
                              <option value="comparison">Comparison Table</option>
                              <option value="investigations">Investigations</option>
                              <option value="treatment">Pharmacology</option>
                              <option value="clinical_flow">Clinical Algorithm</option>
                            </select>

                            <select
                              aria-label="Subject Discipline"
                              value={sc.subjectDiscipline || 'anatomy'}
                              onChange={(e) =>
                                handleUpdateSceneField(sc.id, {
                                  subjectDiscipline: e.target
                                    .value as MedicalSubjectDiscipline,
                                })
                              }
                              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800"
                            >
                              <option value="anatomy">Anatomy</option>
                              <option value="physiology">Physiology</option>
                              <option value="pathology">Pathology</option>
                              <option value="pharmacology">Pharmacology</option>
                              <option value="immunology">Immunology</option>
                            </select>

                            <div className="grid grid-cols-2 gap-1.5">
                              <select
                                aria-label="Transition"
                                value={sc.transitionType}
                                onChange={(e) =>
                                  handleUpdateSceneField(sc.id, {
                                    transitionType: e.target
                                      .value as SceneTransitionType,
                                  })
                                }
                                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800"
                              >
                                <option value="fade">Fade</option>
                                <option value="slide">Slide</option>
                                <option value="zoom_focus">Zoom</option>
                                <option value="wipe">Wipe</option>
                              </select>
                              <input
                                aria-label="Scene Duration Seconds"
                                type="number"
                                min={4}
                                max={90}
                                value={sc.durationSec}
                                onChange={(e) =>
                                  handleUpdateSceneField(sc.id, {
                                    durationSec: Math.max(
                                      4,
                                      Math.min(90, Number(e.target.value) || 10)
                                    ),
                                  })
                                }
                                className="min-h-[38px] rounded-lg border border-slate-300 px-2 py-1 text-xs font-mono text-slate-800"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <label
                            htmlFor={`scene-narration-en-${sc.id}`}
                            className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                          >
                            Medical English Narration
                          </label>
                          <textarea
                            id={`scene-narration-en-${sc.id}`}
                            rows={2}
                            value={sc.narrationEn}
                            onChange={(e) =>
                              handleUpdateSceneField(sc.id, {
                                narrationEn: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs leading-relaxed text-slate-900"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`scene-narration-ar-${sc.id}`}
                            className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                          >
                            Egyptian Medical Arabic Narration (Keeps English Terms)
                          </label>
                          <textarea
                            id={`scene-narration-ar-${sc.id}`}
                            dir="rtl"
                            rows={2}
                            value={sc.narrationArEg}
                            onChange={(e) =>
                              handleUpdateSceneField(sc.id, {
                                narrationArEg: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs leading-relaxed text-slate-900"
                          />
                        </div>

                        {!isRefScene && (
                          <div>
                            <label
                              htmlFor={`scene-labels-${sc.id}`}
                              className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                            >
                              Smartboard Key Labels (max 4, comma-separated)
                            </label>
                            <input
                              id={`scene-labels-${sc.id}`}
                              type="text"
                              value={sc.onScreenLabels.join(', ')}
                              onChange={(e) =>
                                handleUpdateSceneField(sc.id, {
                                  onScreenLabels: e.target.value
                                    .split(',')
                                    .map((v) => v.trim())
                                    .filter(Boolean)
                                    .slice(0, 4),
                                })
                              }
                              className="w-full min-h-[38px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                          <div className="text-[11px] text-slate-600">
                            {sc.bookCitations && sc.bookCitations.length > 0 ? (
                              <span className="font-semibold text-emerald-800">
                                Uploaded Book: {formatBookCitationsSummary(sc.bookCitations)}
                              </span>
                            ) : (
                              <span>Source: General Medical Knowledge</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSynthesizeSingleScene(sc)}
                              disabled={
                                synthesizingSceneId === sc.id ||
                                isSynthesizingAllTts ||
                                !isOnline
                              }
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-[#0F4C81] hover:bg-sky-100 disabled:opacity-50"
                            >
                              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>
                                {isSceneAudioValid ? 'Re-synthesize Voice' : 'Synthesize Voice'}
                              </span>
                            </button>

                            {!isRefScene && (
                              <button
                                type="button"
                                onClick={() => handleDeleteTeachingScene(sc.id)}
                                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Remove</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
