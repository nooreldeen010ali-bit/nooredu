import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_COMPENDIUM_BOOK } from '../data/sampleCompendium';
import { SAMPLE_PHARMACOLOGY_BOOK } from '../data/samplePharmacologyBook';
import { retrieveAcrossTextbooks } from './multiBookEngine';
import {
  buildLectureFromStudyGuide,
  buildLectureRevisionPack,
  buildOfflineTextbookLecture,
  buildSynchronizedLectureAudioTrack,
  createMono16WavBytes,
  encodeBytesToBase64,
  findSceneAtTime,
  generateSrtSubtitles,
  generateVttSubtitles,
  getDisciplineVisualSpec,
  getTotalLectureDuration,
  inferSceneDiscipline,
  INITIAL_SAMPLE_LECTURE,
  reorderLectureScene,
  rescaleLectureDuration,
  sampleAmplitudeAtTime,
  sanitizeLectureProjectResponse,
  verifySceneAudioTrack,
} from './lectureStudioEngine';
import { INITIAL_SAVED_GUIDE } from '../data/sampleCompendium';

test('sanitizeLectureProjectResponse strips hallucinated citations and appends References scene', () => {
  const books = [SAMPLE_COMPENDIUM_BOOK, SAMPLE_PHARMACOLOGY_BOOK];
  const retrieval = retrieveAcrossTextbooks(books, 'Heart failure HFrEF sacubitril', 8);
  assert.ok(retrieval.passages.length > 0);

  // Pick one genuinely retrieved tag and invent a fake tag B1:999
  const genuineTag = retrieval.passages[0].citationTag || 'B1:1';

  const rawModelJson = {
    title: 'Heart Failure Lecture',
    topic: 'Heart Failure (HFrEF)',
    systemTemplate: 'cardiopulmonary',
    scenes: [
      {
        title: 'Normal Cardiac Physiology',
        visualMode: 'physiology',
        narrationEn: 'Cardiac output equals heart rate multiplied by stroke volume.',
        narrationArEg: 'الـ Cardiac Output بيساوي ضربات القلب في حجم الضربة.',
        onScreenLabels: ['CO = HR x SV'],
        transitionType: 'fade',
        durationSec: 15,
        sourceBasis: 'textbook',
        citationTags: ['B1:999'], // Hallucinated page 999 -> must be stripped!
      },
      {
        title: 'HFrEF Neurohormonal Pathophysiology & Therapy',
        visualMode: 'pathophysiology',
        narrationEn: 'Chronic RAAS activation drives remodeling; quadruple therapy improves survival.',
        narrationArEg: 'تنشيط الـ RAAS بيسبب Remodeling والرباعي الدوائي بيحسن البقاء.',
        onScreenLabels: ['RAAS Surge', 'Quadruple GDMT'],
        transitionType: 'zoom_focus',
        durationSec: 20,
        sourceBasis: 'textbook',
        citationTags: [genuineTag, 'B2:888'], // Only genuineTag should survive!
      },
    ],
  };

  const project = sanitizeLectureProjectResponse(rawModelJson, books, 'Heart Failure', retrieval, {
    presenterId: 'attending_maya',
    language: 'en',
    targetDurationSec: 60,
  });

  // 2 teaching scenes + 1 auto-appended references scene = 3 scenes
  assert.equal(project.scenes.length, 3);
  assert.equal(project.scenes[2].visualMode, 'references');

  // Scene 1 had only fake tag B1:999 -> downgraded to general_medical_knowledge with empty citations
  assert.equal(project.scenes[0].sourceBasis, 'general_medical_knowledge');
  assert.equal(project.scenes[0].pageNumbers.length, 0);
  assert.equal(project.scenes[0].bookCitations.length, 0);

  // Scene 2 retained only the verified page citation and stripped 888
  assert.equal(project.scenes[1].sourceBasis, 'textbook');
  assert.ok(project.scenes[1].bookCitations.length >= 1);
  assert.ok(!project.scenes[1].pageNumbers.includes(888));

  // Total rescaled duration matches targetDurationSec (60s)
  assert.equal(getTotalLectureDuration(project.scenes), 60);
});

test('buildOfflineTextbookLecture never invents citations when topic is absent from textbook', () => {
  const books = [SAMPLE_COMPENDIUM_BOOK];
  const project = buildOfflineTextbookLecture(
    books,
    'Rare Martian Zero-Gravity Osteochondrodysplasia',
    {
      presenterId: 'professor_karim',
      language: 'en',
      targetDurationSec: 75,
    }
  );

  assert.equal(project.coverage, 'none');
  assert.equal(project.bookCitations.length, 0);
  for (const scene of project.scenes) {
    assert.equal(scene.pageNumbers.length, 0);
    assert.equal(scene.bookCitations.length, 0);
    assert.equal(scene.sourceBasis, 'general_medical_knowledge');
  }
  assert.equal(project.scenes[project.scenes.length - 1].visualMode, 'references');
});

test('reorderLectureScene moves teaching scenes while keeping References scene last', () => {
  const scenes = INITIAL_SAMPLE_LECTURE.scenes;
  const firstId = scenes[0].id;
  const secondId = scenes[1].id;
  const lastMode = scenes[scenes.length - 1].visualMode;
  assert.equal(lastMode, 'references');

  const reordered = reorderLectureScene(
    scenes,
    0,
    1,
    INITIAL_SAMPLE_LECTURE.topic,
    'cardiopulmonary',
    INITIAL_SAMPLE_LECTURE.externalReferences
  );

  assert.equal(reordered[0].id, secondId);
  assert.equal(reordered[1].id, firstId);
  assert.equal(reordered[reordered.length - 1].visualMode, 'references');
  assert.equal(reordered[0].sceneNumber, 1);
  assert.equal(reordered[1].sceneNumber, 2);
});

test('rescaleLectureDuration and findSceneAtTime produce exact contiguous timeline', () => {
  const scaled = rescaleLectureDuration(INITIAL_SAMPLE_LECTURE.scenes, 120);
  assert.equal(getTotalLectureDuration(scaled), 120);

  const midLookup = findSceneAtTime(scaled, 45);
  assert.ok(midLookup.current.index >= 0);
  assert.ok(midLookup.sceneProgress >= 0 && midLookup.sceneProgress <= 1);
});

test('generateSrtSubtitles and generateVttSubtitles support English and Egyptian Arabic without splitting p./pp. citations', () => {
  const srtEn = generateSrtSubtitles(INITIAL_SAMPLE_LECTURE.scenes, 'en');
  assert.ok(srtEn.includes('00:00:00,000 -->'));
  assert.ok(srtEn.includes('Frank-Starling') || srtEn.includes('cardiac output'));
  assert.ok(!srtEn.includes('\n1–2)'), 'Should not split after pp. inside (pp. 1–2)');

  const vttAr = generateVttSubtitles(INITIAL_SAMPLE_LECTURE.scenes, 'ar-eg');
  assert.ok(vttAr.startsWith('WEBVTT'));
  assert.ok(vttAr.includes('00:00:00.000 -->'));
  assert.ok(vttAr.includes('Cardiac Output'));
  assert.ok(!vttAr.includes('\n.Medicine (pp'), 'Should not split mid-citation in Arabic references');
});

test('buildSynchronizedLectureAudioTrack extracts real lip-sync RMS envelope from 24kHz WAV', () => {
  const sampleRate = 24000;
  // Create a 1-second 440Hz sine wave at ~50% amplitude for Scene 1, and silence for Scene 2
  const activeSamples = new Int16Array(sampleRate);
  for (let i = 0; i < sampleRate; i++) {
    activeSamples[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 14000);
  }
  const activeWavBase64 = encodeBytesToBase64(createMono16WavBytes(activeSamples, sampleRate));

  const miniGuideLecture = buildLectureFromStudyGuide(INITIAL_SAVED_GUIDE, {
    targetDurationSec: 30,
  });
  const twoScenes = miniGuideLecture.scenes.slice(0, 2).map((s, idx) => ({
    ...s,
    durationSec: 5,
    audioWavBase64: idx === 0 ? activeWavBase64 : undefined,
  }));

  const track = buildSynchronizedLectureAudioTrack(twoScenes, sampleRate, 30);
  assert.equal(track.hasRealSpeechAudio, true);
  assert.equal(track.allScenesVerified, false);
  assert.ok(track.wavBytes.byteLength > 44 + sampleRate * 2);

  // At t = 0.6s (inside Scene 1 active sine wave, which starts at 0.12s), mouth amplitude > 0.5
  const ampTalking = sampleAmplitudeAtTime(track.envelope, track.envelopeHz, 0.6);
  assert.ok(ampTalking > 0.5, `Expected talking amplitude > 0.5, got ${ampTalking}`);

  // At t = 5.5s (inside Scene 2 with no speech), mouth amplitude === 0
  const ampSilent = sampleAmplitudeAtTime(track.envelope, track.envelopeHz, 5.5);
  assert.equal(ampSilent, 0);
});

test('verifySceneAudioTrack rejects silent WAV or mismatched language and accepts speech WAV', () => {
  const sampleRate = 24000;
  const silentWav = encodeBytesToBase64(createMono16WavBytes(new Int16Array(sampleRate), sampleRate));
  const audibleSamples = new Int16Array(sampleRate);
  for (let i = 0; i < sampleRate; i++) {
    audibleSamples[i] = Math.round(Math.sin((2 * Math.PI * 330 * i) / sampleRate) * 12000);
  }
  const speechWav = encodeBytesToBase64(createMono16WavBytes(audibleSamples, sampleRate));

  const baseScene = INITIAL_SAMPLE_LECTURE.scenes[0];
  assert.equal(verifySceneAudioTrack({ ...baseScene, audioWavBase64: silentWav, audioLang: 'en' }, 'en').valid, false);
  assert.equal(verifySceneAudioTrack({ ...baseScene, audioWavBase64: speechWav, audioLang: 'ar-eg' }, 'en').valid, false);
  assert.equal(verifySceneAudioTrack({ ...baseScene, audioWavBase64: speechWav, audioLang: 'en' }, 'en').valid, true);
});

test('INITIAL_SAMPLE_LECTURE and buildLectureRevisionPack include textbook tables, glossary terms, Clinical Case Checkpoint Quizzes, and cross-disciplinary mind map tags', () => {
  const scenes = INITIAL_SAMPLE_LECTURE.scenes;
  assert.equal(scenes.length, 5);
  assert.ok((scenes[0].glossaryTerms?.length || 0) >= 2, 'Scene 1 should expose clickable glossary terms');
  assert.ok(scenes[2].comparisonTable && scenes[2].comparisonTable.rows.length === 4, 'Scene 3 should include 4-row Forrester comparison table');

  const quizScenes = scenes.filter((s) => Boolean(s.checkpointQuiz));
  assert.equal(quizScenes.length, 2, 'Should attach 2 section-transition Checkpoint Quizzes');
  assert.equal(quizScenes[0].sceneNumber, 2);
  assert.equal(quizScenes[1].sceneNumber, 4);
  assert.ok(quizScenes[0].checkpointQuiz!.options.length === 4);
  assert.ok(
    Boolean(quizScenes[0].checkpointQuiz!.clinicalCaseVignette?.includes('Clinical Case')),
    'Checkpoint quiz should include a realistic clinical case vignette'
  );
  assert.ok(quizScenes[1].checkpointQuiz!.citationLabel?.includes('p.'), 'Checkpoint should include verified textbook page citation');

  const revision = buildLectureRevisionPack(INITIAL_SAMPLE_LECTURE);
  assert.equal(revision.structuredSummary.length, 4);
  assert.equal(revision.examPoints.length, 4);
  assert.equal(revision.mindMap.nodes.length, 4);
  assert.ok(
    revision.mindMap.nodes.every((n) => Boolean(n.disciplineTag)),
    'Every revision mind map node should carry a cross-disciplinary tag'
  );
  assert.equal(revision.flowchart.nodes.length, 4);
  assert.equal(revision.flowchart.edges.length, 3);
});

test('inferSceneDiscipline and getDisciplineVisualSpec cover Anatomy, Physiology, Pathology, Pharmacology, and Immunology', () => {
  const sampleScenes = INITIAL_SAMPLE_LECTURE.scenes;
  assert.equal(inferSceneDiscipline(sampleScenes[0], 'Heart Failure'), 'physiology');
  assert.equal(inferSceneDiscipline(sampleScenes[1], 'Heart Failure'), 'pathology');
  assert.equal(inferSceneDiscipline(sampleScenes[3], 'Heart Failure'), 'pharmacology');
  assert.equal(
    inferSceneDiscipline(
      {
        visualMode: 'anatomy',
        systemTemplate: 'cardiopulmonary',
        title: 'Four-Chamber Cardiac Valve Anatomy',
        narrationEn: 'Inspect the mitral valve leaflets and left ventricular wall.',
      },
      'Cardiac Anatomy'
    ),
    'anatomy'
  );
  assert.equal(
    inferSceneDiscipline(
      {
        visualMode: 'pathophysiology',
        systemTemplate: 'immune',
        title: 'MHC-II Antigen Presentation & Cytokine Storm',
        narrationEn: 'Dendritic cells activate CD4 T-cells and complement C5b-9.',
      },
      'Adaptive Immunity'
    ),
    'immunology'
  );

  // Verify structured visual specs for all 5 disciplines
  const physSpec = getDisciplineVisualSpec(sampleScenes[0], 'Heart Failure', 'physiology');
  assert.equal(physSpec.physiology.normalPoints.length, 5);
  assert.equal(physSpec.physiology.feedbackSteps.length, 5);

  const pathSpec = getDisciplineVisualSpec(sampleScenes[1], 'Heart Failure', 'pathology');
  assert.equal(pathSpec.pathology.progressionCascade.length, 4);
  assert.ok(pathSpec.pathology.histologyAbnormalLabel.includes('H&E'));

  const pharmSpec = getDisciplineVisualSpec(sampleScenes[3], 'Heart Failure', 'pharmacology');
  assert.equal(pharmSpec.pharmacology.mechanismSteps.length, 3);
  assert.equal(pharmSpec.pharmacology.drugRows.length, 4);

  const immSpec = getDisciplineVisualSpec(sampleScenes[1], 'Heart Failure', 'immunology');
  assert.equal(immSpec.immunology.nodes.length, 4);
  assert.equal(immSpec.immunology.cytokines.length, 3);
});


