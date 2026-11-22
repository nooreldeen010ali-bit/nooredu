import assert from 'node:assert/strict';
import test from 'node:test';
import type { TextbookPage } from '../types/medical';
import {
  buildOfflineFallbackGuide,
  buildPageCitationLabel,
  calculateQuizStats,
  chunkPagesIntoPassages,
  retrieveRelevantPassages,
  sanitizeStudyGuideResponse,
  validateTopicInput,
} from './textbookEngine';
import {
  buildExternalMedicalLinks,
  computeFlowchartLayout,
  computeMindMapLayout,
  inferAnatomicalTemplate,
} from './visualLayout';

function createLargeMockTextbook(totalPages = 60): TextbookPage[] {
  const pages: TextbookPage[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1) {
      pages.push({
        pageNumber: 1,
        chapterTitle: 'Chapter 1: Acute Coronary Syndromes & STEMI',
        text: 'Acute coronary syndrome arises from atherosclerotic plaque rupture and coronary thrombosis. Obtain 12-lead ECG within 10 minutes and administer chewable aspirin.',
      });
    } else if (i === 17) {
      pages.push({
        pageNumber: 17,
        chapterTitle: 'Chapter 17: Diabetic Ketoacidosis (DKA) & HHS',
        text: 'Diabetic ketoacidosis combines absolute insulin deficiency with counter-regulatory glucagon surge, generating beta-hydroxybutyrate and high anion gap metabolic acidosis.\n\nHold intravenous insulin if serum potassium is below 3.3 mEq/L and replete potassium first to prevent ventricular arrhythmia.',
      });
    } else if (i === 22) {
      pages.push({
        pageNumber: 22,
        chapterTitle: 'Chapter 22: Systemic Lupus Erythematosus (SLE) & Lupus Nephritis',
        text: 'Systemic Lupus Erythematosus is mediated by antinuclear autoantibodies and immune-complex deposition. Anti-dsDNA correlates with lupus nephritis disease activity alongside low C3 and C4 complement.\n\nAll patients with SLE should receive baseline hydroxychloroquine therapy.',
      });
    } else if (i === 47) {
      pages.push({
        pageNumber: 47,
        chapterTitle: 'Chapter 47: Guillain-Barre Syndrome & Myasthenia Gravis',
        text: 'Guillain-Barre syndrome presents with symmetric ascending areflexic paralysis 1 to 3 weeks after Campylobacter jejuni enteritis. Cerebrospinal fluid demonstrates albuminocytologic dissociation with elevated protein and normal white blood cell count. Treat with intravenous immunoglobulin or plasmapheresis.',
      });
    } else {
      pages.push({
        pageNumber: i,
        chapterTitle: `Chapter ${i}: General Internal Medicine Physiology Part ${i}`,
        text: `Standard cellular homeostasis and physiological overview on page ${i}. Review acute clinical symptoms, chronic management guidelines, and routine diagnostic assessment.`,
      });
    }
  }
  return pages;
}

test('chunkPagesIntoPassages indexes all pages well beyond 8 pages without truncation', () => {
  const pages = createLargeMockTextbook(60);
  const passages = chunkPagesIntoPassages(pages);

  assert.ok(passages.length >= 60, 'Expected at least one passage per non-empty page');
  const page47Passages = passages.filter((p) => p.pageNumber === 47);
  assert.ok(page47Passages.length >= 1, 'Expected page 47 to be indexed into passages');
  assert.equal(page47Passages[0].pageNumber, 47);
});

test('retrieveRelevantPassages finds exact late-book pages (e.g. page 22 & page 47) instead of pages 1-8', () => {
  const pages = createLargeMockTextbook(60);

  const sleRetrieval = retrieveRelevantPassages(pages, 'Systemic Lupus Erythematosus');
  assert.equal(sleRetrieval.coverage, 'strong');
  assert.deepEqual(sleRetrieval.retrievedPages, [22]);
  assert.equal(sleRetrieval.totalPagesSearched, 60);
  assert.ok(sleRetrieval.passages[0].text.includes('Anti-dsDNA'));

  const gbsRetrieval = retrieveRelevantPassages(pages, 'Guillain-Barre Syndrome');
  assert.equal(gbsRetrieval.coverage, 'strong');
  assert.deepEqual(gbsRetrieval.retrievedPages, [47]);
  assert.ok(gbsRetrieval.passages[0].text.includes('albuminocytologic dissociation'));
});

test('retrieveRelevantPassages rejects out-of-book topics even when generic modifiers like "Acute" or "Diabetic" appear', () => {
  const pages = createLargeMockTextbook(60);

  // "Acute" appears on page 1 and filler pages, but "Glaucoma" is absent from the textbook
  const glaucoma = retrieveRelevantPassages(pages, 'Acute Open-Angle Glaucoma');
  assert.equal(glaucoma.coverage, 'none');
  assert.deepEqual(glaucoma.retrievedPages, []);
  assert.equal(glaucoma.passages.length, 0);

  // "Diabetic" appears on page 17 (DKA), but "Retinopathy" is absent from the textbook
  const retinopathy = retrieveRelevantPassages(pages, 'Diabetic Retinopathy');
  assert.equal(retinopathy.coverage, 'none');
  assert.deepEqual(retinopathy.retrievedPages, []);
  assert.equal(retinopathy.passages.length, 0);
});

test('sanitizeStudyGuideResponse strips unverified page citations and enforces textbook vs general_medical_knowledge', () => {
  const pages = createLargeMockTextbook(60);
  const retrieval = retrieveRelevantPassages(pages, 'DKA Management');
  assert.deepEqual(retrieval.retrievedPages, [17]);

  const mockBook = {
    id: 'book-test',
    title: 'Test Compendium',
    pageCount: 60,
  };

  const sanitized = sanitizeStudyGuideResponse(
    {
      topic: 'Diabetic Ketoacidosis (DKA)',
      summary: 'DKA requires fluid resuscitation and careful potassium monitoring.',
      sections: [
        {
          heading: '01. Potassium Gate Protocol',
          content: 'Hold insulin if K+ < 3.3 mEq/L.',
          pageNumbers: [17, 3], // Page 3 was NOT retrieved and must be stripped!
          sourceBasis: 'textbook',
          supportingQuote: 'Hold intravenous insulin if serum potassium is below 3.3 mEq/L',
          keyTakeaway: 'Check potassium before starting insulin.',
        },
        {
          heading: '02. Cerebral Edema in Pediatric Patients',
          content: 'Rapid osmolality drops can precipitate cerebral edema in children.',
          pageNumbers: [1], // Hallucinated page 1 not in retrievedPages -> must be stripped & reclassified!
          sourceBasis: 'textbook',
          keyTakeaway: 'Lower osmolality gradually.',
        },
      ],
      clinicalNotes: [
        {
          title: 'Potassium Threshold',
          category: 'Red Flag',
          detail: 'Replete potassium if < 3.3 mEq/L before insulin.',
          pageNumbers: [17],
          sourceBasis: 'textbook',
        },
      ],
      mcqs: [
        {
          question: 'When should IV insulin be held in DKA?',
          options: ['K+ < 3.3 mEq/L', 'K+ 4.2 mEq/L', 'pH 7.25', 'Glucose 350 mg/dL'],
          correctIndex: 0,
          explanation: 'Insulin shifts potassium intracellularly.',
          pageNumbers: [],
          sourceBasis: 'general_medical_knowledge',
        },
      ],
    },
    mockBook,
    'DKA Management',
    retrieval
  );

  // Section 1 keeps verified page [17] and strips unverified page 3
  assert.deepEqual(sanitized.sections[0].pageNumbers, [17]);
  assert.equal(sanitized.sections[0].sourceBasis, 'textbook');
  assert.ok(sanitized.sections[0].supportingQuote?.includes('3.3 mEq/L'));

  // Section 2 cited unverified page [1], so pageNumbers becomes [] and sourceBasis becomes general_medical_knowledge!
  assert.deepEqual(sanitized.sections[1].pageNumbers, []);
  assert.equal(sanitized.sections[1].sourceBasis, 'general_medical_knowledge');

  // Overall referencedPages contains ONLY verified page [17]
  assert.deepEqual(sanitized.referencedPages, [17]);
});

test('sanitizeStudyGuideResponse and buildOfflineFallbackGuide never invent citations when coverage is none', () => {
  const pages = createLargeMockTextbook(60);
  const retrieval = retrieveRelevantPassages(pages, 'Otosclerosis Hearing Loss');
  assert.equal(retrieval.coverage, 'none');

  const sanitized = sanitizeStudyGuideResponse(
    {
      topic: 'Otosclerosis',
      summary: 'Uploaded textbook does not cover otosclerosis.',
      referencedPages: [1, 2], // Even if raw payload tried to cite [1, 2], sanitizer strips them!
      sections: [
        {
          heading: '01. General Overview of Otosclerosis',
          content: 'Abnormal bone remodeling in the middle ear.',
          pageNumbers: [1],
          sourceBasis: 'textbook',
          keyTakeaway: 'Causes conductive hearing loss.',
        },
      ],
      clinicalNotes: [],
      mcqs: [],
    },
    { id: 'b1', title: 'Mock Book', pageCount: 60 },
    'Otosclerosis',
    retrieval
  );

  assert.equal(sanitized.coverage, 'none');
  assert.deepEqual(sanitized.referencedPages, []);
  assert.deepEqual(sanitized.sections[0].pageNumbers, []);
  assert.equal(sanitized.sections[0].sourceBasis, 'general_medical_knowledge');
  assert.equal(buildPageCitationLabel(sanitized.referencedPages), 'No textbook pages cited');

  const offlineGuide = buildOfflineFallbackGuide(
    { id: 'b1', title: 'Mock Book', pageCount: 60, pages },
    'Otosclerosis'
  );
  assert.equal(offlineGuide.coverage, 'none');
  assert.deepEqual(offlineGuide.referencedPages, []);
  assert.equal(offlineGuide.sections[0].sourceBasis, 'general_medical_knowledge');
});

test('quiz stats and input validation remain accurate (including zero-textbook topics)', () => {
  assert.equal(validateTopicInput('', true).valid, false);
  assert.equal(validateTopicInput('A', false).valid, false);
  assert.equal(validateTopicInput('SLE', false).valid, true);
  assert.equal(validateTopicInput('SLE', true).valid, true);

  const stats = calculateQuizStats(
    [
      {
        id: 'q1',
        question: 'Q1',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 2,
        explanation: 'Exp',
        pageNumbers: [22],
        sourceBasis: 'textbook',
      },
    ],
    { q1: 2 }
  );
  assert.equal(stats.accuracyPercent, 100);
  assert.equal(stats.isComplete, true);
});

test('computeMindMapLayout and computeFlowchartLayout produce valid connected SVG geometries', () => {
  const mmLayout = computeMindMapLayout({
    centralTopic: 'Diabetic Ketoacidosis',
    nodes: [
      {
        id: 'm1',
        label: 'Normal Insulin Physiology',
        category: 'physiology',
        relationLabel: 'baseline',
        summary: 'Inhibits lipolysis and ketogenesis.',
        sourceBasis: 'general_medical_knowledge',
        pageNumbers: [],
      },
      {
        id: 'm2',
        label: 'Insulin Deficiency + Glucagon',
        category: 'pathophysiology',
        relationLabel: 'triggers',
        summary: 'Generates beta-hydroxybutyrate.',
        sourceBasis: 'textbook',
        pageNumbers: [17],
      },
      {
        id: 'm2-sub',
        label: 'Anion Gap Acidosis',
        category: 'clinical',
        relationLabel: 'causes',
        parentId: 'm2',
        summary: 'Kussmaul respirations.',
        sourceBasis: 'textbook',
        pageNumbers: [17],
      },
    ],
  });

  assert.equal(mmLayout.nodes.length, 3);
  assert.equal(mmLayout.edges.length, 3);
  assert.ok(mmLayout.edges.every((e) => e.pathD.startsWith('M ')));

  const flowLayout = computeFlowchartLayout({
    id: 'fl-1',
    title: 'DKA Potassium Gate',
    flowType: 'management',
    sourceBasis: 'textbook',
    pageNumbers: [17],
    nodes: [
      { id: 'n1', label: 'Confirm DKA', nodeType: 'start' },
      { id: 'n2', label: 'Check Serum K+', nodeType: 'decision' },
      { id: 'n3', label: 'Hold Insulin & Replete K+', nodeType: 'alert' },
      { id: 'n4', label: 'Start IV Regular Insulin', nodeType: 'action' },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3', label: 'K+ < 3.3' },
      { from: 'n2', to: 'n4', label: 'K+ >= 3.3' },
    ],
  });

  assert.equal(flowLayout.nodes.length, 4);
  assert.equal(flowLayout.edges.length, 3);
  const n1 = flowLayout.nodes.find((n) => n.node.id === 'n1')!;
  const n3 = flowLayout.nodes.find((n) => n.node.id === 'n3')!;
  assert.ok(n3.y > n1.y, 'Downstream flowchart node should be placed on a lower row');
});

test('inferAnatomicalTemplate and buildExternalMedicalLinks map domains and authorized URLs accurately', () => {
  assert.equal(inferAnatomicalTemplate('Acute Decompensated Heart Failure'), 'cardiopulmonary');
  assert.equal(inferAnatomicalTemplate('Diabetic Ketoacidosis'), 'endocrine');
  assert.equal(inferAnatomicalTemplate('Lupus Nephritis'), 'renal');
  assert.equal(inferAnatomicalTemplate('Status Epilepticus'), 'neurology');

  const links = buildExternalMedicalLinks('Systemic Lupus Erythematosus');
  assert.ok(links.upToDateUrl.startsWith('https://www.uptodate.com/contents/search?search='));
  assert.ok(links.pubMedGuidelinesUrl.startsWith('https://pubmed.ncbi.nlm.nih.gov/?term='));
});

test('sanitizeStudyGuideResponse grounds visuals, clinical cases, flashcards, terminology, and Egyptian Arabic fields', () => {
  const pages = createLargeMockTextbook(60);
  const retrieval = retrieveRelevantPassages(pages, 'Systemic Lupus Erythematosus');
  assert.deepEqual(retrieval.retrievedPages, [22]);

  const sanitized = sanitizeStudyGuideResponse(
    {
      topic: 'Systemic Lupus Erythematosus',
      summary: 'SLE overview.',
      summaryArabic: 'مرض الذئبة الحمراء Systemic Lupus Erythematosus مرض مناعي ذاتي.',
      sections: [
        {
          heading: '01. Autoantibody Pathophysiology',
          content: 'Anti-dsDNA correlates with lupus nephritis.',
          contentArabic: 'أجسام Anti-dsDNA ترتبط بنشاط التهاب الكلى الذئبي Lupus Nephritis.',
          termDefinitions: [
            {
              term: 'Anti-dsDNA',
              simpleExplanation: 'Autoantibody against double-stranded DNA specific for SLE.',
            },
          ],
          pageNumbers: [22],
          sourceBasis: 'textbook',
          keyTakeaway: 'Baseline hydroxychloroquine for all SLE patients.',
        },
      ],
      mindMap: {
        centralTopic: 'SLE',
        nodes: [
          {
            id: 'a',
            label: 'Anti-dsDNA & Low C3/C4',
            category: 'diagnosis',
            relationLabel: 'markers',
            summary: 'Correlates with nephritis.',
            sourceBasis: 'textbook',
            pageNumbers: [22, 9], // 9 must be stripped!
          },
          {
            id: 'b',
            label: 'Normal B-Cell Tolerance',
            category: 'physiology',
            relationLabel: 'baseline',
            summary: 'Self-reactive clones deleted.',
            sourceBasis: 'textbook',
            pageNumbers: [5], // Hallucinated page 5 -> reclassified to general_medical_knowledge!
          },
          {
            id: 'c',
            label: 'Hydroxychloroquine',
            category: 'management',
            relationLabel: 'baseline drug',
            summary: 'All SLE patients.',
            sourceBasis: 'textbook',
            pageNumbers: [22],
          },
        ],
      },
      clinicalCases: [
        {
          title: 'Young Woman with Malar Rash',
          patientPresentation: 'Joint pain and malar rash.',
          vitalsAndLabs: 'ANA 1:320, low C3/C4',
          promptQuestion: 'Next step?',
          idealWorkupAndDiagnosis: 'Lupus nephritis evaluation.',
          managementPlan: 'Start hydroxychloroquine.',
          clinicalPearl: 'Anti-dsDNA tracks flare activity.',
          sourceBasis: 'textbook',
          pageNumbers: [22, 99],
        },
      ],
      clinicalNotes: [],
      mcqs: [],
    },
    { id: 'b1', title: 'Test Book', pageCount: 60 },
    'Systemic Lupus Erythematosus',
    retrieval
  );

  assert.ok(sanitized.summaryArabic?.includes('Systemic Lupus Erythematosus'));
  assert.equal(sanitized.sections[0].termDefinitions?.[0].term, 'Anti-dsDNA');
  assert.deepEqual(sanitized.mindMap?.nodes[0].pageNumbers, [22]);
  assert.equal(sanitized.mindMap?.nodes[1].sourceBasis, 'general_medical_knowledge');
  assert.deepEqual(sanitized.mindMap?.nodes[1].pageNumbers, []);
  assert.deepEqual(sanitized.clinicalCases?.[0].pageNumbers, [22]);
  assert.ok((sanitized.flashcards?.length || 0) >= 1, 'Expected fallback flashcards when omitted');
});

test('multiBookEngine retrieves across multiple textbooks and strictly sanitizes cross-book citationTags', async () => {
  const { SAMPLE_COMPENDIUM_BOOK, INITIAL_SAVED_GUIDE } = await import(
    '../data/sampleCompendium'
  );
  const { SAMPLE_PHARMACOLOGY_BOOK } = await import('../data/samplePharmacologyBook');
  const {
    retrieveAcrossTextbooks,
    sanitizeMultiBookStudyGuideResponse,
    compileChapterToStudyGuide,
  } = await import('./multiBookEngine');

  const multiRetrieval = retrieveAcrossTextbooks(
    [SAMPLE_COMPENDIUM_BOOK, SAMPLE_PHARMACOLOGY_BOOK],
    'Heart Failure HFrEF GDMT Pharmacology',
    10
  );

  assert.equal(multiRetrieval.coverage, 'strong');
  assert.equal(
    multiRetrieval.totalPagesSearched,
    SAMPLE_COMPENDIUM_BOOK.pageCount + SAMPLE_PHARMACOLOGY_BOOK.pageCount
  );
  assert.ok(
    multiRetrieval.bookCitations.length >= 2,
    'Expected retrieved passages from both Internal Medicine and Clinical Pharmacology books'
  );

  const sanitized = sanitizeMultiBookStudyGuideResponse(
    {
      topic: 'Heart Failure HFrEF Cross-Book Synthesis',
      summary: 'Combines pathophysiology from Book 1 and GDMT pharmacology from Book 2.',
      sections: [
        {
          stepNumber: 1,
          stepPhase: 'Pathophysiology & Pharmacology',
          heading: 'Cross-Book GDMT Integration',
          content: 'ARNI and SGLT2 inhibitors reduce hospitalization.',
          sourceBasis: 'textbook',
          pageNumbers: [2, 1, 99], // 99 is unverified!
          citationTags: ['B1:2', 'B2:1', 'B2:99'], // B2:99 is unverified and must be stripped!
          keyTakeaway: 'Quadruple therapy improves survival.',
        },
        {
          stepNumber: 2,
          stepPhase: 'Baseline Physiology',
          heading: 'Cellular Calcium Cycling',
          content: 'SERCA2a reuptake during diastole.',
          sourceBasis: 'textbook',
          pageNumbers: [14],
          citationTags: ['B1:14'], // Page 14 was NOT retrieved for Heart Failure -> must reclassify to general_medical_knowledge!
          keyTakeaway: 'Diastolic relaxation requires ATP.',
        },
      ],
      clinicalNotes: [],
      mcqs: [],
    },
    [SAMPLE_COMPENDIUM_BOOK, SAMPLE_PHARMACOLOGY_BOOK],
    'Heart Failure HFrEF GDMT Pharmacology',
    multiRetrieval
  );

  assert.equal(sanitized.sections[0].sourceBasis, 'textbook');
  assert.equal(sanitized.sections[0].bookCitations?.length, 2);
  assert.deepEqual(sanitized.sections[0].bookCitations?.[0].pageNumbers, [2]);
  assert.deepEqual(sanitized.sections[0].bookCitations?.[1].pageNumbers, [1]);

  // Hallucinated tag B1:14 is stripped and reclassified to general_medical_knowledge
  assert.equal(sanitized.sections[1].sourceBasis, 'general_medical_knowledge');
  assert.deepEqual(sanitized.sections[1].pageNumbers, []);
  assert.deepEqual(sanitized.sections[1].bookCitations, []);

  // Chapter compiler produces a complete textbook-grounded StudyGuide (Chapter 4 = DKA)
  const chapterGuide = compileChapterToStudyGuide(SAMPLE_PHARMACOLOGY_BOOK, 4);
  assert.ok(chapterGuide.topic.includes('DKA'));
  assert.deepEqual(chapterGuide.referencedPages, [4]);
  assert.equal(chapterGuide.bookCitations?.[0].textbookId, SAMPLE_PHARMACOLOGY_BOOK.id);
  assert.ok(INITIAL_SAVED_GUIDE.bookCitations && INITIAL_SAVED_GUIDE.bookCitations.length >= 2);
});

test('studyPdfModel and studyPdfGenerator produce multi-page vector PDFs with selectable text, diagrams, TOC, and separated references', async () => {
  const { SAMPLE_COMPENDIUM_BOOK, INITIAL_SAVED_GUIDE } = await import(
    '../data/sampleCompendium'
  );
  const { SAMPLE_PHARMACOLOGY_BOOK } = await import('../data/samplePharmacologyBook');
  const { buildStudyPdfDocumentModel } = await import('./studyPdfModel');
  const { generateStudyPdfDocument } = await import('./studyPdfGenerator');

  const guideWithEvidence = {
    ...INITIAL_SAVED_GUIDE,
    externalEvidence: [
      {
        id: 'pmid-12345',
        title: '2024 AHA/ACC/HFSA Guideline for the Management of Heart Failure',
        sourceOrgOrJournal: 'Circulation',
        publishedDate: '2024 May',
        evidenceType: 'Clinical Practice Guideline' as const,
        url: 'https://pubmed.ncbi.nlm.nih.gov/12345/',
        summarySnippet: 'Quadruple therapy recommended for HFrEF.',
        database: 'PubMed' as const,
        pmid: '12345',
      },
    ],
  };

  // 1. Detailed A4 Portrait Single-Topic PDF
  const portraitModel = buildStudyPdfDocumentModel({
    config: {
      scope: 'single_topic',
      orientation: 'portrait',
      style: 'detailed',
      includeCoverPage: true,
      includeTableOfContents: true,
      includeVisualDiagrams: true,
      includeComparisonAndCases: true,
      includeMcqsWithAnswers: true,
      includeReferences: true,
    },
    activeGuide: guideWithEvidence,
    selectedGuides: [guideWithEvidence],
    allTextbooks: [SAMPLE_COMPENDIUM_BOOK, SAMPLE_PHARMACOLOGY_BOOK],
  });

  assert.equal(portraitModel.verifiedBookReferences.length, 2);
  assert.equal(portraitModel.externalEvidenceReferences.length, 1);

  const { doc, pageCount, filename } = generateStudyPdfDocument(portraitModel);
  assert.ok(pageCount >= 4, `Expected multi-page textbook PDF, got ${pageCount} pages`);
  assert.ok(filename.endsWith('.pdf'));

  const rawPdfText = doc.output();
  assert.ok(rawPdfText.startsWith('%PDF-'), 'Expected valid PDF header');
  assert.ok(
    rawPdfText.includes('Table of Contents'),
    'Expected selectable Table of Contents text in vector PDF'
  );
  assert.ok(
    rawPdfText.includes('Principles of Internal Medicine'),
    'Expected verified Book 1 citation in vector PDF'
  );
  assert.ok(
    rawPdfText.includes('Clinical Pharmacology'),
    'Expected verified Book 2 citation in vector PDF'
  );
  assert.ok(
    rawPdfText.includes('External Medical Evidence'),
    'Expected separate External Medical Evidence section in vector PDF'
  );
  assert.ok(
    rawPdfText.includes(`Page 1 of ${pageCount}`),
    'Expected Page X of Y numbering in vector PDF'
  );

  // 2. Compact A4 Landscape Chapter Export PDF
  const landscapeChapterModel = buildStudyPdfDocumentModel({
    config: {
      scope: 'chapter',
      orientation: 'landscape',
      style: 'compact',
      includeCoverPage: true,
      includeTableOfContents: true,
      includeVisualDiagrams: true,
      includeComparisonAndCases: true,
      includeMcqsWithAnswers: true,
      includeReferences: true,
    },
    activeGuide: null,
    chapterBook: SAMPLE_PHARMACOLOGY_BOOK,
    chapterPageNumbers: [1, 4],
    allTextbooks: [SAMPLE_COMPENDIUM_BOOK, SAMPLE_PHARMACOLOGY_BOOK],
  });

  const landscapeResult = generateStudyPdfDocument(landscapeChapterModel);
  assert.ok(landscapeResult.pageCount >= 3);
  assert.ok(landscapeResult.doc.output().includes('DKA'));
});

test('Infographic PDF & 48-Question Bank engine enforces topic-adaptive sciences, exact 30/10/8 counts, citation honesty, embedded JPEG illustrations, mixed Portrait/Landscape A4 pages, and standalone exam modes', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { SAMPLE_COMPENDIUM_BOOK, INITIAL_SAVED_GUIDE } = await import(
    '../data/sampleCompendium'
  );
  const { SAMPLE_PHARMACOLOGY_BOOK } = await import('../data/samplePharmacologyBook');
  const {
    selectRelevantDisciplinesForTopic,
    ensureCompleteInfographicTopicPack,
    validateQuestionBankExactCounts,
  } = await import('./infographicQuestionBankEngine');
  const { buildStudyPdfDocumentModel } = await import('./studyPdfModel');
  const { generateStudyPdfDocument } = await import('./studyPdfGenerator');

  // 1. Topic-adaptive discipline selection
  const sleDisciplines = selectRelevantDisciplinesForTopic(
    'Systemic Lupus Erythematosus Autoimmune Lupus Nephritis',
    'Immune complex deposition, complement C3/C4 consumption, glomerulonephritis, immunosuppressants'
  );
  assert.ok(
    sleDisciplines.includes('immunology'),
    'Autoimmune SLE topic must include immunology'
  );

  const nerveAnatomyDisciplines = selectRelevantDisciplinesForTopic(
    'Brachial Plexus Trunks, Cords & Median Nerve Course',
    'Anatomical roots C5-T1, axillary relation, carpal tunnel anatomy'
  );
  assert.ok(nerveAnatomyDisciplines.includes('anatomy'));
  assert.ok(
    !nerveAnatomyDisciplines.includes('immunology'),
    'Pure peripheral nerve anatomy topic should not pad irrelevant immunology blocks'
  );

  // 2. Exact 30 / 10 / 8 counts + strict provenance sanitization against fabricated pages
  const packWithFabricatedAttempt = ensureCompleteInfographicTopicPack(
    INITIAL_SAVED_GUIDE,
    {
      generationMethod: 'ai_verified',
      questionBank: {
        mcqs: [
          {
            id: 'custom-1',
            number: 1,
            stem: 'In acute decompensated heart failure, which receptor mechanism mediates sacubitril action?',
            options: [
              'Neprilysin inhibition preventing natriuretic peptide degradation',
              'Direct beta-1 adrenergic agonism',
              'Mineralocorticoid receptor activation',
              'Loop diuretic Na-K-2Cl stimulation',
            ],
            correctIndex: 0,
            explanation:
              'Sacubitril inhibits neprilysin, increasing endogenous BNP/ANP levels and vasodilation.',
            difficulty: 'Mechanism',
            discipline: 'pharmacology',
            sourceBasis: 'textbook',
            pageNumbers: [999], // fabricated page number not in INITIAL_SAVED_GUIDE.referencedPages!
          },
        ],
        writtenQuestions: [],
        clinicalCases: [],
      },
    }
  );

  const countValidation = validateQuestionBankExactCounts(
    packWithFabricatedAttempt.questionBank
  );
  assert.equal(
    countValidation.valid,
    true,
    `Expected valid 30/10/8 bank, got errors: ${countValidation.errors.join('; ')}`
  );
  assert.equal(packWithFabricatedAttempt.questionBank.mcqs.length, 30);
  assert.equal(packWithFabricatedAttempt.questionBank.writtenQuestions.length, 10);
  assert.equal(packWithFabricatedAttempt.questionBank.clinicalCases.length, 8);

  // Verify fabricated page 999 was stripped and downgraded to general_medical_knowledge
  const firstMcq = packWithFabricatedAttempt.questionBank.mcqs[0];
  assert.ok(!firstMcq.pageNumbers.includes(999), 'Fabricated page 999 must be stripped');
  assert.equal(firstMcq.sourceBasis, 'general_medical_knowledge');

  // Out-of-book topic (0 textbook pages) must never claim textbook citations
  const zeroCoverageGuide = {
    ...INITIAL_SAVED_GUIDE,
    id: 'guide-zero-pages',
    topic: 'Rare Tropical Viral Hemorrhagic Fever',
    coverage: 'none' as const,
    referencedPages: [],
    bookCitations: [],
    retrievedPassages: [],
  };
  const zeroCoveragePack = ensureCompleteInfographicTopicPack(zeroCoverageGuide);
  assert.equal(zeroCoveragePack.questionBank.mcqs.length, 30);
  assert.ok(
    zeroCoveragePack.questionBank.mcqs.every(
      (q) => q.pageNumbers.length === 0 && q.sourceBasis === 'general_medical_knowledge'
    ),
    'Out-of-book guide must have 0 textbook page numbers on every MCQ'
  );

  // 3. Load real JPEG medical plates from disk and verify embedded images + mixed Portrait/Landscape geometry
  const imagesDir = path.resolve(process.cwd(), 'src/assets/images');
  const files = await fs.readdir(imagesDir);
  const heartFile = files.find((f) => f.startsWith('atlas_heart_anatomy'));
  const pathoFile = files.find((f) => f.startsWith('pathology_histology_split'));
  const pharmFile = files.find((f) => f.startsWith('pharmacology_receptor_plate'));
  assert.ok(heartFile && pathoFile && pharmFile, 'Expected generated medical JPEG assets');

  const toDataUrl = async (fname: string) => {
    const buf = await fs.readFile(path.join(imagesDir, fname));
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  };

  const embeddedAtlasImages: Record<string, string> = {
    cardiopulmonary_anatomy: await toDataUrl(heartFile!),
    cardiopulmonary_patho: await toDataUrl(heartFile!),
    pathology_histology: await toDataUrl(pathoFile!),
    pharmacology_receptor: await toDataUrl(pharmFile!),
  };

  const fullInfographicModel = buildStudyPdfDocumentModel({
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
      embeddedAtlasImages,
    },
    activeGuide: INITIAL_SAVED_GUIDE,
    selectedGuides: [INITIAL_SAVED_GUIDE],
    allTextbooks: [SAMPLE_COMPENDIUM_BOOK, SAMPLE_PHARMACOLOGY_BOOK],
  });

  const fullPdf = generateStudyPdfDocument(fullInfographicModel);
  assert.ok(
    fullPdf.pageCount >= 12,
    `Expected rich 11-section illustrated study guide (>=12 pages), got ${fullPdf.pageCount}`
  );

  // Verify mixed Portrait (210x297) and Landscape (297x210) A4 pages exist in the same document
  let portraitPageCount = 0;
  let landscapePageCount = 0;
  for (let p = 1; p <= fullPdf.pageCount; p++) {
    const w = fullPdf.doc.internal.pageSize.getWidth();
    fullPdf.doc.setPage(p);
    const pw = fullPdf.doc.internal.pageSize.getWidth();
    const ph = fullPdf.doc.internal.pageSize.getHeight();
    void w;
    if (pw > ph) landscapePageCount++;
    else portraitPageCount++;
  }
  assert.ok(portraitPageCount >= 8, 'Expected Portrait A4 pages for text and exam bank');
  assert.ok(
    landscapePageCount >= 1,
    'Expected Landscape A4 pages for wide flowcharts/mind maps/comparison tables'
  );

  const rawFullOutput = fullPdf.doc.output();
  assert.ok(
    rawFullOutput.includes('/Subtype /Image'),
    'Expected real embedded JPEG medical illustrations (/Subtype /Image) inside PDF'
  );
  assert.ok(rawFullOutput.includes('Q30.'), 'Expected 30th MCQ in PDF');
  assert.ok(rawFullOutput.includes('W10.'), 'Expected 10th Written Question in PDF');
  assert.ok(rawFullOutput.includes('Case 8:'), 'Expected 8th Clinical Case in PDF');
  assert.ok(
    rawFullOutput.includes('Separate Answer Keys') ||
      rawFullOutput.includes('Section 10'),
    'Expected Separate Answer Keys section in PDF'
  );

  // 4. Standalone Self-Test Question Paper mode omits Section 10 Answer Keys
  const selfTestModel = buildStudyPdfDocumentModel({
    config: {
      scope: 'single_topic',
      exportMode: 'question_bank_self_test',
      orientation: 'portrait',
      style: 'detailed',
      includeCoverPage: true,
      includeTableOfContents: true,
      includeVisualDiagrams: false,
      includeComparisonAndCases: false,
      includeMcqsWithAnswers: true,
      includeQuestionBank: true,
      includeReferences: true,
    },
    activeGuide: INITIAL_SAVED_GUIDE,
    selectedGuides: [INITIAL_SAVED_GUIDE],
    allTextbooks: [SAMPLE_COMPENDIUM_BOOK, SAMPLE_PHARMACOLOGY_BOOK],
  });

  const selfTestPdf = generateStudyPdfDocument(selfTestModel);
  const rawSelfTestOutput = selfTestPdf.doc.output();
  assert.ok(rawSelfTestOutput.includes('Q30.'));
  assert.ok(rawSelfTestOutput.includes('W10.'));
  assert.ok(rawSelfTestOutput.includes('Case 8:'));
  assert.ok(
    !rawSelfTestOutput.includes('Part A: 30 Multiple-Choice Answer Key'),
    'Self-test exam paper mode must omit the MCQ Answer Key grid'
  );
});


