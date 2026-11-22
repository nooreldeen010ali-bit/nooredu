import assert from 'node:assert/strict';
import test from 'node:test';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  MedicalTextbook,
  PdfGeneratorConfig,
  StudyGuide,
  TextbookPage,
} from '../types/medical';
import { ensureCompleteInfographicTopicPack } from './infographicQuestionBankEngine';
import {
  buildMultiBookOfflineFallbackGuide,
  retrieveAcrossTextbooks,
  sanitizeMultiBookStudyGuideResponse,
} from './multiBookEngine';
import { getBrowserPreviewAtlasUrl } from './pdfImageAssets';
import { generateStudyPdfDocument } from './studyPdfGenerator';
import {
  buildStudyPdfDocumentModel,
  validateStudyPdfCoherence,
} from './studyPdfModel';
import {
  retrieveRelevantPassages,
  sanitizeStudyGuideResponse,
} from './textbookEngine';
import {
  canonicalizeMedicalTopic,
  detectConflictingTopicHijack,
  isAssessmentItemAlignedWithTopic,
} from './topicCanonicalizer';
import { inferAnatomicalTemplate } from './visualLayout';

function buildAchalasiaOnlyBook(): MedicalTextbook {
  const pages: TextbookPage[] = [
    {
      pageNumber: 1,
      chapterTitle: 'Chapter 1: Esophageal Motility Disorders — Achalasia',
      text: `Achalasia is a primary esophageal motility disorder caused by progressive degeneration of inhibitory nitric oxide and VIP myenteric plexus neurons in Auerbach plexus. High-resolution esophageal manometry demonstrates impaired lower esophageal sphincter relaxation and absent peristalsis. Barium esophagram classically shows a bird-beak tapering at the gastroesophageal junction. Upper endoscopy is performed to exclude pseudoachalasia from gastroesophageal junction carcinoma or incidental gastric ulcer before pneumatic dilation or laparoscopic Heller myotomy.`,
    },
    {
      pageNumber: 2,
      chapterTitle: 'Chapter 2: Diffuse Esophageal Spasm & Nutcracker Esophagus',
      text: `Distal esophageal spasm presents with intermittent chest pain and dysphagia to both solids and liquids. Barium swallow reveals a corkscrew esophagus and manometry shows premature simultaneous contractions with normal LES relaxation.`,
    },
  ];
  return {
    id: 'book-achalasia-only',
    title: 'Esophageal Motility Atlas',
    subject: 'Gastroenterology',
    fileName: 'esophageal-motility.pdf',
    fileSizeBytes: 2048,
    uploadedAt: '2026-01-01T00:00:00.000Z',
    pageCount: pages.length,
    pages,
  };
}

function buildMultiChapterGiTextbook(): MedicalTextbook {
  const pages: TextbookPage[] = [
    {
      pageNumber: 1,
      chapterTitle: 'Chapter 1: Achalasia & Esophageal Dysmotility',
      text: `Achalasia results from loss of inhibitory myenteric neurons in the lower esophageal sphincter. Patients present with progressive dysphagia to solids and liquids, regurgitation, and bird-beak appearance on barium esophagram. Treatment includes pneumatic dilation, POEM, or Heller myotomy. Perform endoscopy to exclude malignancy or gastric ulcer.`,
    },
    {
      pageNumber: 2,
      chapterTitle: 'Chapter 2: Cirrhosis, Portal Hypertension & Esophageal Varices',
      text: `Portal hypertension develops when hepatic sinusoidal resistance increases in cirrhosis, elevating the hepatic venous pressure gradient above 10 mmHg and causing gastroesophageal varices and splenomegaly. Manage acute variceal hemorrhage with octreotide, ceftriaxone prophylaxis, and endoscopic variceal band ligation.`,
    },
    {
      pageNumber: 3,
      chapterTitle: 'Chapter 3: Peptic Ulcer Disease (Gastric & Duodenal Ulcers)',
      text: `Peptic ulcer disease is a mucosal defect extending through the muscularis mucosae of the stomach or proximal duodenal bulb (D1), most commonly driven by Helicobacter pylori infection or NSAID-mediated COX-1 prostaglandin E2 inhibition. Duodenal ulcers classically cause epigastric pain that improves with meals and recurs 2 to 3 hours postprandially, whereas gastric ulcers along the lesser curvature often worsen with food and require endoscopic biopsy to exclude gastric adenocarcinoma. Posterior duodenal bulb penetration erodes the gastroduodenal artery causing brisk hematemesis and melena, while anterior wall perforation produces pneumoperitoneum. First-line management combines proton pump inhibitor (omeprazole/pantoprazole) H+/K+-ATPase blockade, H. pylori eradication with bismuth quadruple therapy, NSAID cessation, and urea breath or fecal antigen test of cure at least 4 weeks after therapy.`,
    },
  ];
  return {
    id: 'book-gi-multi',
    title: 'Clinical Gastroenterology Textbook',
    subject: 'Gastroenterology',
    fileName: 'clinical-gi.pdf',
    fileSizeBytes: 4096,
    uploadedAt: '2026-01-01T00:00:00.000Z',
    pageCount: pages.length,
    pages,
  };
}

function createDefaultPdfConfig(
  overrides: Partial<PdfGeneratorConfig> = {}
): PdfGeneratorConfig {
  return {
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
    embeddedAtlasImages: {},
    ...overrides,
  };
}

async function extractAllTextFromPdfBytes(pdfBytes: Uint8Array): Promise<{
  pageCount: number;
  pageTexts: string[];
  fullText: string;
}> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const pageTexts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pageTexts.push(text);
  }
  await loadingTask.destroy();
  return {
    pageCount: doc.numPages,
    pageTexts,
    fullText: pageTexts.join('\n\n'),
  };
}

test('1. Canonical topic identifier maps Peptic Ulcer variants to gastroduodenal domain and never maps ulcer to hepatobiliary', () => {
  const c1 = canonicalizeMedicalTopic('Peptic Ulcer');
  const c2 = canonicalizeMedicalTopic('PUD');
  const c3 = canonicalizeMedicalTopic('Peptic Ulcer Disease');

  assert.equal(c1.canonicalTopicId, 'peptic-ulcer-disease');
  assert.equal(c2.canonicalTopicId, 'peptic-ulcer-disease');
  assert.equal(c3.canonicalTopicId, 'peptic-ulcer-disease');
  assert.equal(c1.canonicalTitle, 'Peptic Ulcer Disease');
  assert.equal(c1.organDomain, 'gastroduodenal');
  assert.equal(c1.allowedRasterAtlasKey, null);

  // Ensure visualLayout never misroutes Peptic Ulcer to Liver/Hepatobiliary
  assert.notEqual(inferAnatomicalTemplate('Peptic Ulcer Disease'), 'hepatobiliary');
  assert.equal(inferAnatomicalTemplate('Hepatic Cirrhosis & Liver Fibrosis'), 'hepatobiliary');

  const achalasia = canonicalizeMedicalTopic('Achalasia');
  assert.equal(achalasia.canonicalTopicId, 'achalasia');
  assert.equal(achalasia.organDomain, 'esophageal');
});

test('2. Retrieval & sanitization block Achalasia hijack even when gastric ulcer is mentioned in Achalasia text or scanned PDF fallback', () => {
  const achalasiaBook = buildAchalasiaOnlyBook();
  const giBook = buildMultiChapterGiTextbook();

  // A: Searching Peptic Ulcer in an Achalasia-only book (even with "gastric ulcer" differential phrase) returns 0 matches
  const zeroMatch = retrieveRelevantPassages(achalasiaBook.pages, 'Peptic Ulcer');
  assert.equal(zeroMatch.coverage, 'none');
  assert.deepEqual(zeroMatch.retrievedPages, []);
  assert.equal(zeroMatch.passages.length, 0);

  // B: Searching Peptic Ulcer across multi-chapter GI book retrieves ONLY Page 3 (Peptic Ulcer), never Page 1 (Achalasia) or Page 2 (Varices)
  const multiMatch = retrieveAcrossTextbooks([giBook], 'Peptic Ulcer');
  assert.equal(multiMatch.coverage, 'strong');
  assert.deepEqual(multiMatch.passages.map((p) => p.pageNumber), [3]);

  // C: Simulated LLM hijack when allowScannedPdfPages=true returns Achalasia content for "Peptic Ulcer"
  const hijackedRawLlmPayload = {
    topic: 'Achalasia',
    coverage: 'strong',
    referencedPages: [1],
    summary:
      'Achalasia is a primary esophageal motility disorder with loss of myenteric neurons, impaired LES relaxation, bird-beak barium swallow, and Heller myotomy.',
    sections: [
      {
        stepNumber: 1,
        stepPhase: 'Pathophysiology',
        heading: 'Myenteric Plexus Degeneration in Achalasia',
        content:
          'Achalasia causes failure of lower esophageal sphincter relaxation and aperistalsis on high-resolution manometry, treated with Heller myotomy.',
        contentArabic: 'الأكالازيا بتعمل ضيق في المريء.',
        quickSummaryPoints: ['Bird-beak sign on barium swallow', 'Heller myotomy'],
        sourceBasis: 'textbook',
        pageNumbers: [1],
        keyTakeaway: 'Manometry confirms achalasia.',
      },
    ],
    mcqs: [
      {
        question:
          'A 44-year-old woman has dysphagia to solids and liquids with a bird-beak appearance on barium swallow. What confirms achalasia?',
        options: [
          'High-resolution esophageal manometry',
          'Urea breath test',
          'Serum gastrin',
          'Colonoscopy',
        ],
        correctIndex: 0,
        explanation: 'Manometry is the gold standard for achalasia.',
        sourceBasis: 'textbook',
        pageNumbers: [1],
      },
    ],
  };

  const sanitized = sanitizeStudyGuideResponse(
    hijackedRawLlmPayload,
    achalasiaBook,
    'Peptic Ulcer',
    zeroMatch,
    { allowScannedPdfPages: true }
  );

  assert.equal(sanitized.canonicalTopicId, 'peptic-ulcer-disease');
  assert.equal(sanitized.topic, 'Peptic Ulcer Disease');
  assert.equal(sanitized.coverage, 'none');
  assert.deepEqual(sanitized.referencedPages, []);
  for (const sec of sanitized.sections) {
    assert.equal(
      detectConflictingTopicHijack(
        sec.content,
        sec.heading,
        canonicalizeMedicalTopic('Peptic Ulcer')
      ).hijacked,
      false,
      `Section "${sec.heading}" must not contain hijacked Achalasia text`
    );
  }
  assert.equal(sanitized.mcqs.length, 0, 'Hijacked Achalasia MCQs must be stripped');
});

test('3. End-to-End Peptic Ulcer Disease Study PDF generation, SVG preview, 30/10/8 assessment bank, and extracted PDF text verification', async () => {
  const giBook = buildMultiChapterGiTextbook();
  const multiRetrieval = retrieveAcrossTextbooks([giBook], 'Peptic Ulcer');

  const rawValidPudResponse = {
    topic: 'Peptic Ulcer',
    coverage: 'strong',
    coverageNote: 'Grounded in Chapter 3 (Page 3) of Clinical Gastroenterology Textbook.',
    summary:
      'Peptic Ulcer Disease involves mucosal ulceration penetrating through the muscularis mucosae of the stomach or duodenal bulb (D1), primarily caused by Helicobacter pylori urease-mediated injury or NSAID COX-1 prostaglandin E2 depletion.',
    summaryArabic:
      'قرحة المعدة والاثنى عشر (Peptic Ulcer Disease) بتحصل بسبب H. pylori أو المسكنات NSAIDs.',
    quickRevisionBullets: [
      'Duodenal bulb (D1) ulcers improve transiently with meals; gastric lesser-curvature ulcers worsen postprandially and require biopsy.',
      'Posterior duodenal ulcers erode the gastroduodenal artery causing hematemesis and melena; anterior ulcers perforate causing free intraperitoneal air.',
      'Confirm H. pylori eradication via urea breath test or fecal antigen at least 4 weeks post-antibiotics and 2 weeks off PPIs.',
    ],
    referencedPages: [3],
    sections: [
      {
        stepNumber: 1,
        stepPhase: 'Basic Physiology',
        heading: 'Gastroduodenal Mucosal Defense & Acid Secretion',
        content:
          'Surface foveolar cells secrete a mucus-bicarbonate gel stabilized by COX-1 derived prostaglandin E2, protecting gastric antral and duodenal bulb (D1) epithelium from parietal cell H+/K+-ATPase hydrochloric acid and pepsin.',
        contentArabic: 'طبقة المخاط والبيكربونات بتحمي جدار المعدة من الحمض.',
        quickSummaryPoints: ['PGE2 stimulates mucus-HCO3- barrier', 'Parietal cells express H+/K+-ATPase'],
        sourceBasis: 'textbook',
        pageNumbers: [3],
        citationTags: ['B1:3'],
        supportingQuote: 'mucosal defect extending through the muscularis mucosae of the stomach or proximal duodenal bulb',
        keyTakeaway: 'Intact mucus-bicarbonate and PGE2 perfusion prevent peptic autodigestion.',
      },
      {
        stepNumber: 2,
        stepPhase: 'Pathophysiology',
        heading: 'H. pylori & NSAID Ulcerogenesis',
        content:
          'Helicobacter pylori colonizes antral mucosa via urease, depleting somatostatin D-cells and driving hypergastrinemia and duodenal acid load, while NSAIDs inhibit COX-1 prostaglandin synthesis.',
        contentArabic: 'جرثومة المعدة بتزود الحمض والمسكنات بتقلل البروستاجلاندين.',
        quickSummaryPoints: ['Antral H. pylori -> somatostatin loss -> gastrin surge', 'NSAID COX-1 blockade -> mucosal ischemia'],
        sourceBasis: 'textbook',
        pageNumbers: [3],
        citationTags: ['B1:3'],
        keyTakeaway: 'H. pylori and NSAIDs account for the vast majority of peptic ulcers.',
      },
      {
        stepNumber: 3,
        stepPhase: 'Clinical Presentation & Complications',
        heading: 'Duodenal vs Gastric Ulcer Syndromes, Bleeding & Perforation',
        content:
          'Epigastric gnawing pain, melena, hematemesis from posterior gastroduodenal artery erosion, or sudden peritonitis with subdiaphragmatic free air from anterior D1 perforation.',
        contentArabic: 'قرحة الجدار الخلفي بتنزف من gastroduodenal artery والأمامي بتعمل ثقب.',
        quickSummaryPoints: ['Posterior D1 -> Gastroduodenal artery hemorrhage', 'Anterior D1 -> Pneumoperitoneum'],
        sourceBasis: 'textbook',
        pageNumbers: [3],
        citationTags: ['B1:3'],
        keyTakeaway: 'Assess hemodynamic stability and upright chest radiograph immediately in acute abdomen.',
      },
      {
        stepNumber: 4,
        stepPhase: 'Management & Pharmacology',
        heading: 'Proton Pump Inhibitors, Endoscopic Hemostasis & Eradication',
        content:
          'Discontinue NSAIDs, initiate proton pump inhibitor therapy (omeprazole/pantoprazole), eradicate H. pylori with 14-day bismuth quadruple therapy, and biopsy all gastric ulcers to exclude adenocarcinoma.',
        contentArabic: 'علاج جرثومة المعدة الرباعي مع مثبطات مضخة البروتون.',
        quickSummaryPoints: ['14-day Bismuth quadruple therapy', 'Test of cure >=4 weeks post-therapy'],
        sourceBasis: 'textbook',
        pageNumbers: [3],
        citationTags: ['B1:3'],
        keyTakeaway: 'Always confirm H. pylori cure and repeat endoscopy for gastric ulcers.',
      },
    ],
  };

  const guideBody = sanitizeMultiBookStudyGuideResponse(
    rawValidPudResponse,
    [giBook],
    'Peptic Ulcer',
    multiRetrieval
  );

  const pudGuide: StudyGuide = {
    ...guideBody,
    id: 'guide-pud-test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    answers: {},
  };

  // Verify Canonical Topic ID & Infographic Pack
  assert.equal(pudGuide.canonicalTopicId, 'peptic-ulcer-disease');
  assert.ok(pudGuide.topic.includes('Peptic Ulcer'));
  assert.deepEqual(pudGuide.referencedPages, [3]);

  const pack = ensureCompleteInfographicTopicPack(pudGuide);
  assert.equal(pack.canonicalTopicId, 'peptic-ulcer-disease');
  assert.equal(pack.canonicalTopicTitle, 'Peptic Ulcer Disease');

  // Verify exact 30 MCQs, 10 Written Questions, and 8 Clinical Cases
  assert.equal(pack.questionBank.mcqs.length, 30, 'Must generate exact 30 MCQs');
  assert.equal(
    pack.questionBank.writtenQuestions.length,
    10,
    'Must generate exact 10 Written Questions'
  );
  assert.equal(
    pack.questionBank.clinicalCases.length,
    8,
    'Must generate exact 8 Clinical Cases'
  );

  const canonical = canonicalizeMedicalTopic('Peptic Ulcer Disease');
  for (const q of pack.questionBank.mcqs) {
    assert.equal(q.options.length, 4);
    assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3);
    assert.ok(q.explanation.length >= 15);
    assert.ok(
      isAssessmentItemAlignedWithTopic(
        `${q.options.join(' ')} ${q.explanation}`,
        q.stem,
        canonical
      ),
      `MCQ Q${q.number} failed canonical topic alignment: ${q.stem}`
    );
  }
  for (const wq of pack.questionBank.writtenQuestions) {
    assert.ok(wq.markingPoints.length >= 2);
    assert.ok(wq.modelAnswer.length >= 20);
    assert.ok(
      isAssessmentItemAlignedWithTopic(wq.modelAnswer, wq.prompt, canonical),
      `Written W${wq.number} failed canonical topic alignment`
    );
  }
  for (const cc of pack.questionBank.clinicalCases) {
    assert.ok(cc.progressiveQuestions.length >= 3);
    assert.ok(
      isAssessmentItemAlignedWithTopic(
        `${cc.patientPresentation} ${cc.clinicalPearl}`,
        cc.title,
        canonical
      ),
      `Clinical Case ${cc.number} failed canonical topic alignment`
    );
  }

  // Verify Studio Browser SVG Preview is strictly gastroduodenal (never Heart/Liver JPEG)
  const previewUrl = getBrowserPreviewAtlasUrl(
    pudGuide.topic,
    'anatomy',
    'atlas_plate',
    pudGuide.topic,
    pack.integratedDisciplines[0]?.calloutPins
  );
  assert.ok(previewUrl.startsWith('data:image/svg+xml;utf8,'), 'Expected gastroduodenal vector SVG preview');
  const decodedSvg = decodeURIComponent(previewUrl.replace('data:image/svg+xml;utf8,', ''));
  assert.ok(decodedSvg.includes('Gastric Fundus'), 'SVG preview must label Gastric Fundus');
  assert.ok(decodedSvg.includes('Gastroduodenal a.'), 'SVG preview must label Gastroduodenal artery');
  assert.ok(!decodedSvg.includes('Achalasia'), 'SVG preview must not mention Achalasia');

  // Build full StudyPdfDocumentModel & verify coherence gate passes
  const model = buildStudyPdfDocumentModel({
    config: createDefaultPdfConfig(),
    activeGuide: { ...pudGuide, infographicPack: pack },
    selectedGuides: [{ ...pudGuide, infographicPack: pack }],
    chapterBook: giBook,
    chapterPageNumbers: [3],
    allTextbooks: [giBook],
  });

  assert.equal(model.validation.valid, true, `Validation failed: ${JSON.stringify(model.validation.issues)}`);
  assert.equal(model.units[0]?.coverAtlasKey, 'vector:gastroduodenal:anatomy');
  assert.deepEqual(model.validation.canonicalTopicIds, ['peptic-ulcer-disease']);

  // Generate real PDF binary and inspect extracted text across all pages via pdfjs-dist
  const { doc, pageCount, filename } = generateStudyPdfDocument(model);
  assert.ok(pageCount >= 12, `Expected multi-page textbook PDF, got ${pageCount} pages`);
  assert.ok(filename.includes('peptic-ulcer'), `Unexpected filename: ${filename}`);

  const pdfBytes = new Uint8Array(doc.output('arraybuffer'));
  const extracted = await extractAllTextFromPdfBytes(pdfBytes);
  assert.equal(extracted.pageCount, pageCount);

  // Cover page (Page 1) must have Peptic Ulcer Disease and gastroduodenal schematic labels
  assert.ok(extracted.pageTexts[0].includes('Peptic Ulcer Disease'), 'Cover page must display Peptic Ulcer Disease');
  assert.ok(
    extracted.pageTexts[0].includes('Gastric Fundus') ||
      extracted.pageTexts[0].includes('Duodenal Bulb') ||
      extracted.pageTexts[0].includes('Antral'),
    'Cover page vector illustration must contain gastroduodenal anatomical labels'
  );

  // Full document text must contain all sections, Q1..Q30, W1..W10, Case 1..Case 8, Answer Keys, and References
  assert.ok(extracted.fullText.includes('Helicobacter pylori'));
  assert.ok(extracted.fullText.includes('Proton Pump Inhibitors'));
  assert.ok(extracted.fullText.includes('Q1'));
  assert.ok(extracted.fullText.includes('Q30'));
  assert.ok(extracted.fullText.includes('W1'));
  assert.ok(extracted.fullText.includes('W10'));
  assert.ok(extracted.fullText.includes('Case 1'));
  assert.ok(extracted.fullText.includes('Case 8'));
  assert.ok(extracted.fullText.includes('Section 10'));
  assert.ok(extracted.fullText.includes('Clinical Gastroenterology Textbook'));

  // Strictly assert ZERO cross-topic or generic boilerplate contamination anywhere in the PDF
  const forbiddenSubstrings = [
    'Achalasia',
    'bird-beak',
    'Heller myotomy',
    'Liver & Portal Triad',
    'acute dyspnea',
    'SpO2 93%',
  ];
  for (const forbidden of forbiddenSubstrings) {
    assert.equal(
      extracted.fullText.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `Generated Peptic Ulcer PDF must NOT contain "${forbidden}"`
    );
  }
});

test('4. Zero-coverage fallback guide for Peptic Ulcer on Achalasia-only textbook produces valid, pure Peptic Ulcer PDF with 0 book citations', async () => {
  const achalasiaBook = buildAchalasiaOnlyBook();
  const fallbackBody = buildMultiBookOfflineFallbackGuide([achalasiaBook], 'Peptic Ulcer');
  const fallbackGuide: StudyGuide = {
    ...fallbackBody,
    id: 'guide-pud-zero-cov',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    answers: {},
  };

  assert.equal(fallbackGuide.coverage, 'none');
  assert.deepEqual(fallbackGuide.referencedPages, []);

  const model = buildStudyPdfDocumentModel({
    config: createDefaultPdfConfig(),
    activeGuide: fallbackGuide,
    selectedGuides: [fallbackGuide],
    chapterBook: achalasiaBook,
    chapterPageNumbers: [1],
    allTextbooks: [achalasiaBook],
  });

  assert.equal(model.validation.valid, true, `Validation failed: ${JSON.stringify(model.validation.issues)}`);
  assert.equal(model.verifiedBookReferences.length, 0);

  const { doc } = generateStudyPdfDocument(model);
  const extracted = await extractAllTextFromPdfBytes(new Uint8Array(doc.output('arraybuffer')));
  assert.ok(extracted.fullText.includes('Peptic Ulcer Disease'));
  assert.equal(extracted.fullText.toLowerCase().includes('achalasia'), false);
});

test('5. Automated validation gate strictly blocks PDF export on title mismatch, section hijack, wrong illustration, or off-topic/incomplete questions', () => {
  const achalasiaBook = buildAchalasiaOnlyBook();
  const achalasiaBody = buildMultiBookOfflineFallbackGuide([achalasiaBook], 'Achalasia');
  const achalasiaGuide: StudyGuide = {
    ...achalasiaBody,
    id: 'guide-achalasia',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    answers: {},
  };

  // A: Cover title says "Peptic Ulcer Disease" while content unit is "Achalasia" -> MUST BLOCK
  const mismatchedCoverModel = buildStudyPdfDocumentModel({
    config: createDefaultPdfConfig({ customTitle: 'Peptic Ulcer Disease' }),
    activeGuide: achalasiaGuide,
    selectedGuides: [achalasiaGuide],
    chapterBook: achalasiaBook,
    chapterPageNumbers: [1],
    allTextbooks: [achalasiaBook],
  });
  assert.equal(mismatchedCoverModel.validation.valid, false);
  assert.ok(
    mismatchedCoverModel.validation.issues.some((i) => i.code === 'TITLE_TOPIC_MISMATCH'),
    'Expected TITLE_TOPIC_MISMATCH issue'
  );
  assert.throws(
    () => generateStudyPdfDocument(mismatchedCoverModel),
    /PDF Export Blocked/i,
    'generateStudyPdfDocument must throw when Cover Title mismatches Unit Topic'
  );

  // B: Single-topic scope with activeGuide=null must NOT silently load selectedGuides[0] (Achalasia)
  const nullActiveModel = buildStudyPdfDocumentModel({
    config: createDefaultPdfConfig({ scope: 'single_topic' }),
    activeGuide: null,
    selectedGuides: [achalasiaGuide],
    chapterBook: achalasiaBook,
    chapterPageNumbers: [1],
    allTextbooks: [achalasiaBook],
  });
  assert.equal(nullActiveModel.units.length, 0);
  assert.equal(nullActiveModel.validation.valid, false);
  assert.throws(() => generateStudyPdfDocument(nullActiveModel), /PDF Export Blocked/i);

  // Build clean Peptic Ulcer model as baseline for targeted corruption checks
  const giBook = buildMultiChapterGiTextbook();
  const pudGuide: StudyGuide = {
    ...buildMultiBookOfflineFallbackGuide([giBook], 'Peptic Ulcer Disease'),
    id: 'guide-pud-clean',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    answers: {},
  };
  const cleanModel = buildStudyPdfDocumentModel({
    config: createDefaultPdfConfig(),
    activeGuide: pudGuide,
    selectedGuides: [pudGuide],
    chapterBook: giBook,
    chapterPageNumbers: [3],
    allTextbooks: [giBook],
  });
  assert.equal(cleanModel.validation.valid, true);

  // C: Corrupt cover illustration to 'hepatobiliary' (Liver JPEG) on Peptic Ulcer -> MUST BLOCK
  const wrongCoverImgModel = {
    ...cleanModel,
    units: cleanModel.units.map((u, idx) =>
      idx === 0 ? { ...u, coverAtlasKey: 'hepatobiliary' } : u
    ),
  };
  wrongCoverImgModel.validation = validateStudyPdfCoherence(wrongCoverImgModel);
  assert.equal(wrongCoverImgModel.validation.valid, false);
  assert.ok(
    wrongCoverImgModel.validation.issues.some((i) => i.code === 'ILLUSTRATION_MISMATCH')
  );
  assert.throws(() => generateStudyPdfDocument(wrongCoverImgModel), /PDF Export Blocked/i);

  // D: Corrupt 1 MCQ inside Peptic Ulcer to test Achalasia -> MUST BLOCK
  const hijackedMcqModel = {
    ...cleanModel,
    units: cleanModel.units.map((u, idx) =>
      idx === 0
        ? {
            ...u,
            infographicPack: {
              ...u.infographicPack,
              questionBank: {
                ...u.infographicPack.questionBank,
                mcqs: u.infographicPack.questionBank.mcqs.map((m, mIdx) =>
                  mIdx === 14
                    ? {
                        ...m,
                        stem: 'A patient with Achalasia has bird-beak tapering on barium esophagram and absent peristalsis on manometry. Which surgery is indicated?',
                        options: [
                          'Laparoscopic Heller myotomy',
                          'Appendectomy',
                          'Cholecystectomy',
                          'Splenectomy',
                        ],
                        correctIndex: 0,
                        explanation:
                          'Heller myotomy relieves lower esophageal sphincter pressure in achalasia.',
                      }
                    : m
                ),
              },
            },
          }
        : u
    ),
  };
  hijackedMcqModel.validation = validateStudyPdfCoherence(hijackedMcqModel);
  assert.equal(hijackedMcqModel.validation.valid, false);
  assert.ok(
    hijackedMcqModel.validation.issues.some((i) => i.code === 'QUESTION_TOPIC_MISMATCH')
  );
  assert.throws(() => generateStudyPdfDocument(hijackedMcqModel), /PDF Export Blocked/i);

  // E: Corrupt MCQ count from 30 to 29 -> MUST BLOCK
  const wrongCountModel = {
    ...cleanModel,
    units: cleanModel.units.map((u, idx) =>
      idx === 0
        ? {
            ...u,
            infographicPack: {
              ...u.infographicPack,
              questionBank: {
                ...u.infographicPack.questionBank,
                mcqs: u.infographicPack.questionBank.mcqs.slice(0, 29),
              },
            },
          }
        : u
    ),
  };
  wrongCountModel.validation = validateStudyPdfCoherence(wrongCountModel);
  assert.equal(wrongCountModel.validation.valid, false);
  assert.ok(
    wrongCountModel.validation.issues.some((i) => i.code === 'MCQ_COUNT_MISMATCH')
  );
  assert.throws(() => generateStudyPdfDocument(wrongCountModel), /PDF Export Blocked/i);
});
