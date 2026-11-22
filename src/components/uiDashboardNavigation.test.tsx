import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiAssistantView } from './AiAssistantView';
import { EvidenceHubView } from './EvidenceHubView';
import { Header, type ActiveTab } from './Header';
import { HomeDashboardView } from './HomeDashboardView';
import { MobileBottomNav } from './MobileBottomNav';
import { SavedGuidesView } from './SavedGuidesView';
import { TimedExamsView } from './TimedExamsView';
import type { MedicalTextbook, StudyGuide } from '../types/medical';
import { INITIAL_SAMPLE_LECTURE } from '../utils/lectureStudioEngine';
import { enrichStudyGuideWithBlueprint } from '../utils/medicalBlueprintEngine';
import { buildMultiBookOfflineFallbackGuide } from '../utils/multiBookEngine';

const sampleBook: MedicalTextbook = {
  id: 'book-ui-test',
  title: 'Clinical Internal Medicine Compendium',
  subject: 'Internal Medicine',
  fileName: 'clinical-internal-medicine.pdf',
  fileSizeBytes: 102400,
  uploadedAt: '2026-01-15T00:00:00.000Z',
  pageCount: 2,
  pages: [
    {
      pageNumber: 1,
      chapterTitle: 'Chapter 1: Peptic Ulcer Disease',
      text: 'Peptic ulcer disease involves gastroduodenal mucosal defects driven by Helicobacter pylori or NSAIDs.',
    },
    {
      pageNumber: 2,
      chapterTitle: 'Chapter 2: Heart Failure',
      text: 'Heart failure involves impaired ventricular filling or ejection of blood.',
    },
  ],
};

const sampleGuide: StudyGuide = enrichStudyGuideWithBlueprint({
  ...buildMultiBookOfflineFallbackGuide([sampleBook], 'Peptic Ulcer Disease'),
  id: 'guide-ui-test',
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
  answers: {},
});

const noop = () => {};

test('1. Header renders simple minimalist navigation for Home, Tutor, Textbooks, 3D Lectures, Study PDFs, Exams, Research, Guidelines, and Cloud Sync', () => {
  const html = renderToStaticMarkup(
    <Header
      activeTab="home"
      onSelectTab={noop}
      onTriggerUpload={noop}
      savedCount={3}
      textbookCount={2}
    />
  );

  const requiredLabels = [
    'MedAtlas Tutor',
    'Home',
    'Tutor',
    'Textbooks',
    '3D Lectures',
    'Study PDFs',
    'Exams',
    'Research',
    'Guidelines',
    'Cloud Sync',
    'Upload Textbook PDF',
  ];

  for (const label of requiredLabels) {
    assert.ok(html.includes(label), `Header missing navigation label: ${label}`);
  }
  assert.ok(
    html.includes('overflow-x-auto'),
    'Primary navigation strip must contain horizontal scroll safely within its wrapper'
  );
});

test('2. HomeDashboardView renders compact medical topic search bar, zero-book/multi-book scope, and all platform module cards', () => {
  const html = renderToStaticMarkup(
    <HomeDashboardView
      textbooks={[sampleBook]}
      selectedTextbookIds={[sampleBook.id]}
      uploadQueue={[]}
      studyGuides={[sampleGuide]}
      activeGuide={sampleGuide}
      savedLectures={[INITIAL_SAMPLE_LECTURE]}
      topicInput=""
      onChangeTopicInput={noop}
      onSubmitTopic={noop}
      validationError={null}
      apiError={null}
      isGenerating={false}
      onToggleTextbookSelection={noop}
      onSelectAllTextbooks={noop}
      onTriggerUpload={noop}
      onSelectTab={noop}
      onOpenSavedGuide={noop}
      onOpenBookPage={noop}
      onOpenPdfStudio={noop}
    />
  );

  assert.ok(
    html.includes('id="home-medical-topic-search"'),
    'Home page must render prominent medical topic search input'
  );
  assert.ok(
    html.includes('Medical Topic Blueprint Dashboard'),
    'Home page must render compact Medical Topic Blueprint heading'
  );

  for (const modTitle of [
    'Tutor',
    'Textbooks',
    '3D Lectures',
    'Study PDFs',
    'Exams',
    'Research',
    'Guidelines',
  ]) {
    assert.ok(
      html.includes(`Open ${modTitle}`),
      `Home dashboard missing module launch card for ${modTitle}`
    );
  }
});

test('3. TimedExamsView, SavedGuidesView (Study PDFs), EvidenceHubView (Research & Guidelines), AiAssistantView, and MobileBottomNav render cleanly', () => {
  const examsHtml = renderToStaticMarkup(
    <TimedExamsView
      activeGuide={sampleGuide}
      savedGuides={[sampleGuide]}
      lectures={[INITIAL_SAMPLE_LECTURE]}
      onSelectActiveGuide={noop}
      onOpenPdfStudio={noop}
      onOpenLectureStudio={noop}
    />
  );
  assert.ok(
    examsHtml.includes('Medical Exams &amp; Practice Assessments'),
    'TimedExamsView must display assessment header'
  );
  assert.ok(examsHtml.includes('Exam Mode (Timed)'), 'TimedExamsView must include Timed Exam mode');
  assert.ok(examsHtml.includes('Practice (Untimed)'), 'TimedExamsView must include Practice mode');

  const pdfsHtml = renderToStaticMarkup(
    <SavedGuidesView
      guides={[sampleGuide]}
      onOpenGuide={noop}
      onExportGuidePdf={noop}
      onOpenMultiGuidePdfStudio={noop}
      onDeleteGuide={noop}
      onGoToTutor={noop}
    />
  );
  assert.ok(pdfsHtml.includes('Study PDFs &amp; Saved Guides'));
  assert.ok(pdfsHtml.includes('Single-Topic Study PDF'));
  assert.ok(pdfsHtml.includes('48-Item Exam Paper PDF'));

  const researchHtml = renderToStaticMarkup(
    <EvidenceHubView
      mode="research"
      activeTopic="Peptic Ulcer Disease"
      studyGuides={[sampleGuide]}
      isOnline={true}
    />
  );
  assert.ok(researchHtml.includes('Medical Research &amp; Clinical Trials'));

  const guidelinesHtml = renderToStaticMarkup(
    <EvidenceHubView
      mode="guidelines"
      activeTopic="Peptic Ulcer Disease"
      studyGuides={[sampleGuide]}
      isOnline={true}
    />
  );
  assert.ok(guidelinesHtml.includes('Clinical Practice Guidelines'));
  assert.ok(guidelinesHtml.includes('NICE Clinical Guidance'));
  assert.ok(guidelinesHtml.includes('WHO Publications'));
  assert.ok(guidelinesHtml.includes('Open on UpToDate.com'));

  const assistantHtml = renderToStaticMarkup(
    <AiAssistantView
      textbooks={[sampleBook]}
      selectedTextbookIds={[sampleBook.id]}
      studyGuides={[sampleGuide]}
      activeGuide={sampleGuide}
      topicInput=""
      validationError={null}
      apiError={null}
      isGenerating={false}
      isOnline={true}
      isEnrichingArabic={false}
      onChangeTopicInput={noop}
      onSubmitTopic={noop}
      onRequestArabicEnrichment={noop}
      onSelectGuide={noop}
      onOpenPage={noop}
      onSelectTab={noop}
      onOpenPdfStudio={noop}
    />
  );
  assert.ok(assistantHtml.includes('Medical Study Assistant'));
  assert.ok(assistantHtml.includes('Egyptian Arabic'));

  const tabsToVerify: ActiveTab[] = [
    'home',
    'tutor',
    'library',
    'lecture',
    'pdfs',
    'exams',
    'research',
    'guidelines',
    'assistant',
    'sync',
  ];
  for (const tab of tabsToVerify) {
    const mobileHtml = renderToStaticMarkup(
      <MobileBottomNav activeTab={tab} onSelectTab={noop} />
    );
    assert.ok(mobileHtml.includes('Modules'));
  }
});

test('4. .env.example introduces zero new secrets or uncommented custom environment variables', () => {
  const envPath = path.resolve(process.cwd(), '.env.example');
  const content = fs.readFileSync(envPath, 'utf8');
  const uncommentedKeys = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split('=')[0].trim());

  assert.deepEqual(
    uncommentedKeys,
    ['GEMINI_API_KEY', 'APP_URL'],
    `.env.example must only require GEMINI_API_KEY and APP_URL, found: ${uncommentedKeys.join(', ')}`
  );
});
