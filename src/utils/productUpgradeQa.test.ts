import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SAMPLE_COMPENDIUM_BOOK } from '../data/sampleCompendium';
import { InteractiveTextbookStage } from '../components/InteractiveTextbookStage';
import { LectureStudioView } from '../components/LectureStudioView';
import type { LectureScene, StudyGuide } from '../types/medical';
import {
  buildCompleteLectureStoryboard,
  buildLectureFromStudyGuide,
  buildOfflineTextbookLecture,
  classifyLectureTopicCategory,
  getDisciplineVisualSpec,
  getDoctorProfile,
  PRIMARY_DOCTOR_PRESENTERS,
  selectAdaptiveLectureStages,
} from './lectureStudioEngine';
import { getLectureRenderingEngineDisclosure } from './lectureThreeRenderer';
import { resolveSceneAtlasAsset } from './medicalAtlasAssets';
import {
  buildMedicalTopicBlueprint,
  enrichStudyGuideWithBlueprint,
} from './medicalBlueprintEngine';
import { buildMultiBookOfflineFallbackGuide } from './multiBookEngine';
import { generateStudyPdfDocument } from './studyPdfGenerator';
import { buildStudyPdfDocumentModel } from './studyPdfModel';
import { validateTopicInput } from './textbookEngine';
import {
  checkAndAutoSubmitExpiredExam,
  createExamSession,
  evaluateSubmittedExam,
  navigateExamQuestion,
  recordExamAnswer,
  submitExamSession,
  toggleExamQuestionFlag,
} from './timedExamEngine';

test('1. Unified Medical Topic Blueprint works with ZERO uploaded textbooks and aligns Explanation, Lecture, PDF, and Exams', () => {
  // Zero textbooks uploaded: validateTopicInput must allow any medical topic
  const validation = validateTopicInput('Acute Appendicitis', false);
  assert.equal(validation.valid, true);

  const rawBody = buildMultiBookOfflineFallbackGuide([], 'Peptic Ulcer Disease');
  const zeroBookGuide: StudyGuide = enrichStudyGuideWithBlueprint({
    ...rawBody,
    id: 'guide-zero-book-pud',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    answers: {},
  });

  const bp = zeroBookGuide.blueprint!;
  assert.ok(bp, 'Blueprint must be synthesized');
  assert.equal(bp.canonicalTopicId, 'peptic-ulcer-disease');
  assert.equal(bp.provenance.primaryTier, 'general_medical_knowledge');
  assert.equal(bp.provenance.hasUploadedTextbookCoverage, false);
  assert.equal(bp.provenance.uploadedBookCitations.length, 0);
  assert.equal(zeroBookGuide.referencedPages.length, 0, 'Must never fabricate textbook page numbers');

  // Lecture built from Blueprint shares exact canonicalTopicId, blueprintId, and ordered teaching scenes
  const lecture = buildLectureFromStudyGuide(zeroBookGuide, {
    presenterId: 'female_doctor',
    language: 'ar-eg',
  });
  assert.equal(lecture.canonicalTopicId, bp.canonicalTopicId);
  assert.equal(lecture.blueprintId, bp.blueprintId);
  assert.equal(lecture.presenterId, 'female_doctor');
  assert.equal(lecture.language, 'ar-eg');

  // Teaching scenes (excluding final References slide) match Blueprint section count & order
  const teachingScenes = lecture.scenes.filter((s) => s.visualMode !== 'references');
  assert.equal(teachingScenes.length, bp.orderedSections.length);
  for (let i = 0; i < teachingScenes.length; i++) {
    assert.ok(
      teachingScenes[i].narrationEn.length > 20 && teachingScenes[i].narrationArEg.length > 20,
      'Each scene must carry both Medical English and Egyptian Medical Arabic narration'
    );
    assert.ok(
      teachingScenes[i].onScreenLabels.length <= 4,
      'Smartboard must show concise single-concept labels without clutter'
    );
  }

  // PDF built from the same Guide/Blueprint passes strict validation and generates valid A4 bytes
  const pdfModel = buildStudyPdfDocumentModel({
    config: {
      scope: 'single_topic',
      exportMode: 'full_study_guide',
      orientation: 'portrait',
      autoLandscapeWidePages: true,
      style: 'detailed',
      includeCoverPage: true,
      includeTableOfContents: true,
      includeVisualDiagrams: true,
      includeComparisonAndCases: true,
      includeMcqsWithAnswers: true,
      includeQuestionBank: true,
      includeReferences: true,
    },
    activeGuide: zeroBookGuide,
    allTextbooks: [],
  });

  assert.equal(
    pdfModel.validation.valid,
    true,
    `PDF validation failed: ${JSON.stringify(pdfModel.validation.issues)}`
  );
  assert.equal(pdfModel.units[0].blueprintId, bp.blueprintId);
  assert.equal(pdfModel.participatingBooks.length, 0, 'Zero-book PDF must not list fake participating textbooks');
  assert.equal(pdfModel.stats.mcqCount, 30);
  assert.equal(pdfModel.stats.writtenCount, 10);
  assert.equal(pdfModel.stats.clinicalCaseCount, 8);

  const compiledPdf = generateStudyPdfDocument(pdfModel);
  const pdfBytes = new Uint8Array(compiledPdf.doc.output('arraybuffer'));
  assert.ok(pdfBytes.byteLength > 15_000, 'Generated A4 PDF must contain rich vector pages');
  assert.ok(compiledPdf.pageCount >= 8, `Expected multi-page textbook PDF, got ${compiledPdf.pageCount}`);
});

test('2. Visual Honesty & Topic-Synchronized Smartboard Assets (Zero fake 3D claims on 2D plates, zero cardiac/DKA drift on PUD)', () => {
  // Check Male & Female Doctor white-coat presenters
  assert.equal(PRIMARY_DOCTOR_PRESENTERS.length, 2);
  const femaleDoc = getDoctorProfile('female_doctor');
  const maleDoc = getDoctorProfile('male_doctor');
  assert.equal(femaleDoc.attire, 'white_coat');
  assert.equal(maleDoc.attire, 'white_coat');
  assert.equal(femaleDoc.gender, 'female');
  assert.equal(maleDoc.gender, 'male');

  // Check resolveSceneAtlasAsset never claims static 2D JPEGs are "Pre-Rendered 3D" and matches Peptic Ulcer Disease
  const pudAsset = resolveSceneAtlasAsset('hepatobiliary', 'anatomy', 'anatomy', 'Peptic Ulcer Disease');
  assert.ok(
    !pudAsset.provenanceLabel.toLowerCase().includes('pre-rendered 3d'),
    `2D atlas plate must not claim 3D: ${pudAsset.provenanceLabel}`
  );
  assert.ok(
    pudAsset.plateTitle.includes('Peptic Ulcer Disease'),
    `Smartboard asset title must match Peptic Ulcer Disease, got: ${pudAsset.plateTitle}`
  );
  assert.ok(
    !pudAsset.caption.includes('Ketoacidosis'),
    'Smartboard asset caption must not leak DKA text onto Peptic Ulcer Disease'
  );

  // Check getDisciplineVisualSpec for Peptic Ulcer Disease has gastroduodenal labels, NOT Frank-Starling/HFrEF
  const dummyPudScene: LectureScene = {
    id: 'pud-sc-1',
    sceneNumber: 1,
    title: 'Mucosal Defense vs Acid-Pepsin Injury',
    visualMode: 'physiology',
    subjectDiscipline: 'physiology',
    systemTemplate: 'hepatobiliary',
    narrationEn: 'Gastric mucosal bicarbonate and prostaglandins protect the duodenum.',
    narrationArEg: 'المخاط والـ Bicarbonate بيحموا جدار المعدة والاثنى عشر.',
    visualDescription: 'Gastroduodenal mucosal barrier',
    onScreenLabels: ['Mucosal Barrier', 'H. pylori & NSAIDs'],
    highlightedCallouts: ['Duodenal Bulb'],
    transitionType: 'fade',
    durationSec: 15,
    sourceBasis: 'general_medical_knowledge',
    pageNumbers: [],
    bookCitations: [],
  };
  const pudVisualSpec = getDisciplineVisualSpec(dummyPudScene, 'Peptic Ulcer Disease');
  assert.ok(
    !pudVisualSpec.physiology.curveTitle.includes('Frank-Starling'),
    `Non-cardiac topic must not show Frank-Starling curve: ${pudVisualSpec.physiology.curveTitle}`
  );
  assert.ok(
    !pudVisualSpec.pharmacology.drugRows.some((r) => r.agentClass.includes('ARNI')),
    'Peptic Ulcer pharmacology table must not show cardiac ARNI rows'
  );
});

test('3. Continuous Lecture Playback Stage has zero mid-lecture quiz interruptions and moves assessment after the video', () => {
  const guideWithBook: StudyGuide = enrichStudyGuideWithBlueprint({
    ...buildMultiBookOfflineFallbackGuide([SAMPLE_COMPENDIUM_BOOK], 'Heart Failure'),
    id: 'guide-hf-test',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    answers: {},
  });
  const lecture = buildLectureFromStudyGuide(guideWithBook, {
    presenterId: 'male_doctor',
    language: 'en',
  });

  const stageHtml = renderToStaticMarkup(
    React.createElement(InteractiveTextbookStage, {
      lectureTitle: lecture.title,
      scenes: lecture.scenes,
      activeScene: lecture.scenes[1],
      activeSceneIndex: 1,
      sceneProgress: 0.5,
      currentTimeSec: 15,
      totalDurationSec: 75,
      presenterId: lecture.presenterId,
      language: 'en',
      showSubtitles: true,
      isPlaying: true,
      mouthOpenness: 0.3,
      isSpeaking: true,
      externalReferences: lecture.externalReferences,
      aggregateCitations: lecture.bookCitations,
      onReplayScene: () => {},
      onJumpToSceneIndex: () => {},
      onOpenPage: () => {},
    })
  );

  assert.ok(
    !stageHtml.includes('Mandatory Checkpoint'),
    'Interactive stage must never render mid-lecture mandatory quiz overlays'
  );

  const studioHtml = renderToStaticMarkup(
    React.createElement(LectureStudioView, {
      textbooks: [SAMPLE_COMPENDIUM_BOOK],
      selectedTextbookIds: [SAMPLE_COMPENDIUM_BOOK.id],
      onToggleTextbookSelection: () => {},
      savedGuides: [guideWithBook],
      savedLectures: [lecture],
      activeLecture: lecture,
      onSelectLecture: () => {},
      onSaveLecture: async () => {},
      onDeleteLecture: async () => {},
      onOpenPage: () => {},
      isOnline: true,
    })
  );

  assert.ok(studioHtml.includes('Female Doctor'), 'Must expose Female Doctor presenter choice');
  assert.ok(studioHtml.includes('Male Doctor'), 'Must expose Male Doctor presenter choice');
  assert.ok(studioHtml.includes('Egyptian Medical Arabic'), 'Must expose Egyptian Medical Arabic choice');
  assert.ok(studioHtml.includes('Medical English'), 'Must expose Medical English choice');
  assert.ok(
    studioHtml.includes('Post-Lecture Self-Assessment'),
    'Quizzes must appear in a separate section after the lecture player'
  );
});

test('4. Timed Exams Engine enforces question count, free navigation, pre-submission confidentiality, manual submit, and timer-expiry auto-submit', () => {
  const rawBody = buildMultiBookOfflineFallbackGuide([], 'Peptic Ulcer Disease');
  const guide: StudyGuide = enrichStudyGuideWithBlueprint({
    ...rawBody,
    id: 'guide-exam-pud',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    answers: {},
  });

  const startMs = 1_700_000_000_000;
  let session = createExamSession({
    guide,
    mode: 'exam',
    questionCount: 10,
    durationMinutes: 15,
    nowMs: startMs,
  });

  assert.equal(session.questions.length, 10);
  assert.equal(session.durationSeconds, 900);
  assert.equal(session.status, 'in_progress');

  // Strictly null score before submission!
  assert.equal(evaluateSubmittedExam(session), null);

  // Navigate freely, flag Q3, answer Q1 correctly & Q2 incorrectly
  session = navigateExamQuestion(session, 2);
  assert.equal(session.currentIndex, 2);
  session = toggleExamQuestionFlag(session, session.questions[2].id);
  assert.equal(session.flaggedQuestionIds.length, 1);

  const q1 = session.questions[0];
  const q2 = session.questions[1];
  session = recordExamAnswer(session, q1.id, q1.correctIndex);
  session = recordExamAnswer(session, q2.id, (q2.correctIndex + 1) % 4);

  // Before expiry (e.g. +5 min), auto-submit does NOT trigger
  const midCheck = checkAndAutoSubmitExpiredExam(session, startMs + 5 * 60 * 1000);
  assert.equal(midCheck.status, 'in_progress');
  assert.equal(evaluateSubmittedExam(midCheck), null);

  // At timer expiry (+15 min), exam auto-submits!
  const expiredSession = checkAndAutoSubmitExpiredExam(session, startMs + 15 * 60 * 1000);
  assert.equal(expiredSession.status, 'submitted');
  assert.equal(expiredSession.autoSubmittedOnTimeout, true);

  const score = evaluateSubmittedExam(expiredSession);
  assert.ok(score, 'Score summary must be available after submission');
  assert.equal(score!.totalQuestions, 10);
  assert.equal(score!.answeredCount, 2);
  assert.equal(score!.correctCount, 1);
  assert.equal(score!.incorrectCount, 1);
  assert.equal(score!.unansweredCount, 8);
  assert.equal(score!.percentage, 10);
  assert.equal(score!.autoSubmittedOnTimeout, true);

  // Manual submission in Practice Mode
  let practice = createExamSession({
    guide,
    mode: 'practice',
    questionCount: 5,
    durationMinutes: 10,
    nowMs: startMs,
  });
  assert.equal(practice.expiresAtMs, null);
  for (const q of practice.questions) {
    practice = recordExamAnswer(practice, q.id, q.correctIndex);
  }
  practice = submitExamSession(practice, { nowMs: startMs + 120_000 });
  const practiceScore = evaluateSubmittedExam(practice)!;
  assert.equal(practiceScore.correctCount, 5);
  assert.equal(practiceScore.percentage, 100);
  assert.equal(practiceScore.autoSubmittedOnTimeout, false);
});

test('5. Blueprint provenance accurately separates Uploaded Textbook, External Evidence, and General Medical Knowledge', () => {
  const bookGuide: StudyGuide = enrichStudyGuideWithBlueprint({
    ...buildMultiBookOfflineFallbackGuide([SAMPLE_COMPENDIUM_BOOK], 'Heart Failure'),
    id: 'guide-hf-prov',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    answers: {},
    externalEvidence: [
      {
        id: 'pmid-12345',
        title: 'ESC Guidelines for Acute and Chronic Heart Failure',
        sourceOrgOrJournal: 'Eur Heart J',
        publishedDate: '2023',
        url: 'https://pubmed.ncbi.nlm.nih.gov/12345/',
        evidenceType: 'Clinical Practice Guideline',
        database: 'PubMed',
        summarySnippet: 'Comprehensive heart failure management guidelines.',
        authors: 'McDonagh TA et al.',
        pmid: '12345',
      },
    ],
  });

  const bp = buildMedicalTopicBlueprint(bookGuide);
  assert.equal(bp.provenance.primaryTier, 'uploaded_textbook');
  assert.equal(bp.provenance.hasUploadedTextbookCoverage, true);
  assert.equal(bp.provenance.externalEvidenceCount, 1);
});

test('6. Topic-adaptive lecture stages follow Introduction -> Summary and omit irrelevant sections per topic category', () => {
  // Clinical condition with subtype split (Gastric vs Duodenal)
  assert.equal(classifyLectureTopicCategory('Peptic Ulcer Disease'), 'clinical_condition');
  const pudStages = selectAdaptiveLectureStages('Peptic Ulcer Disease').stages.map(
    (s) => s.stage
  );
  assert.deepEqual(pudStages, [
    'introduction',
    'definition',
    'classification',
    'etiology',
    'pathophysiology',
    'clinical_features',
    'investigations',
    'management',
    'summary',
  ]);

  // Acute focal surgical condition omits artificial classification split
  const appendicitisStages = selectAdaptiveLectureStages('Acute Appendicitis').stages.map(
    (s) => s.stage
  );
  assert.equal(appendicitisStages.includes('classification'), false);
  assert.equal(appendicitisStages[0], 'introduction');
  assert.equal(appendicitisStages[appendicitisStages.length - 1], 'summary');

  // Pure Anatomy & Physiology topic omits disease etiology, diagnostic workup, and drug management
  assert.equal(
    classifyLectureTopicCategory('Cardiac Cycle Physiology'),
    'anatomy_physiology'
  );
  const physStages = selectAdaptiveLectureStages('Cardiac Cycle Physiology').stages.map(
    (s) => s.stage
  );
  assert.equal(physStages.includes('etiology'), false);
  assert.equal(physStages.includes('investigations'), false);
  assert.equal(physStages.includes('management'), false);
  assert.equal(physStages[0], 'introduction');
  assert.equal(physStages[physStages.length - 1], 'summary');

  // Pharmacology topic omits disease etiology and diagnostic workup
  assert.equal(
    classifyLectureTopicCategory('Proton Pump Inhibitors Pharmacology'),
    'pharmacology_therapeutics'
  );
  const pharmStages = selectAdaptiveLectureStages(
    'Proton Pump Inhibitors Pharmacology'
  ).stages.map((s) => s.stage);
  assert.equal(pharmStages.includes('etiology'), false);
  assert.equal(pharmStages.includes('investigations'), false);
  assert.equal(pharmStages.includes('management'), true);
});

test('7. Pre-render narration script & matching visual storyboard enforce single-concept slides, short bullets, and zero quiz interruptions', () => {
  const project = buildOfflineTextbookLecture([], 'Peptic Ulcer Disease', {
    presenterId: 'female_doctor',
    language: 'en',
    targetDurationSec: 120,
  });

  const sb = buildCompleteLectureStoryboard(project);
  assert.equal(sb.rows.length, project.scenes.length);
  assert.equal(sb.rows[0].pedagogicalStage, 'introduction');
  assert.equal(sb.rows[sb.rows.length - 1].pedagogicalStage, 'summary');

  for (const row of sb.rows) {
    assert.ok(row.slideHeading.length > 3 && row.slideHeading.length <= 75);
    assert.ok(row.slideBullets.length >= 1 && row.slideBullets.length <= 3);
    assert.ok(row.visualLabels.length <= 4);
    assert.ok(row.narrationText.length > 25);
    // Zero mid-lecture quiz prompts interrupting continuous narration
    assert.equal(/\b(quiz|checkpoint|pause the video)\b/i.test(row.narrationText), false);
    for (const bullet of row.slideBullets) {
      assert.ok(bullet.length <= 75, `Bullet must remain concise: "${bullet}"`);
    }
  }
});

test('8. Rendering engine disclosure honestly states stylized procedural Three.js 3D and 2D smartboard diagrams without false photorealistic claims', () => {
  const disclosure = getLectureRenderingEngineDisclosure();
  assert.match(disclosure.summary, /procedural Three\.js/i);
  assert.match(disclosure.summary, /LEFT/);
  assert.match(disclosure.summary, /RIGHT/);
  assert.ok(
    disclosure.limitations.some((l) => /NOT photorealistic/i.test(l)),
    'Must explicitly disclose non-photorealistic procedural rendering limitation'
  );
});

