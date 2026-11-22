import type {
  AnatomicalDiagramData,
  AnatomicalSystemTemplate,
  BookPageCitation,
  ClinicalCaseScenario,
  ClinicalNote,
  ComparisonTableData,
  ExplanationSection,
  ExternalEvidenceItem,
  FlowchartData,
  InfographicTopicPack,
  MCQItem,
  MedicalTextbook,
  MedicalTopicBlueprint,
  MindMapData,
  PdfDocumentExportMode,
  PdfGeneratorConfig,
  StudyGuide,
} from '../types/medical';
import {
  ensureCompleteInfographicTopicPack,
  validateQuestionBankExactCounts,
} from './infographicQuestionBankEngine';
import { buildMedicalTopicBlueprint } from './medicalBlueprintEngine';
import {
  compileChapterToStudyGuide,
  formatBookCitationsSummary,
  shortenBookTitle,
} from './multiBookEngine';
import { resolveStrictTopicAtlasKey } from './pdfImageAssets';
import { buildPageCitationLabel } from './textbookEngine';
import {
  canonicalizeMedicalTopic,
  detectConflictingTopicHijack,
  doesTitleMatchCanonicalTopic,
  isAssessmentItemAlignedWithTopic,
  type CanonicalTopicDescriptor,
} from './topicCanonicalizer';
import { inferAnatomicalTemplate } from './visualLayout';

export interface StudyPdfValidationIssue {
  code:
    | 'EMPTY_UNITS'
    | 'TITLE_TOPIC_MISMATCH'
    | 'UNIT_TOPIC_HIJACK'
    | 'SECTION_TOPIC_MISMATCH'
    | 'ILLUSTRATION_MISMATCH'
    | 'MCQ_COUNT_MISMATCH'
    | 'WRITTEN_COUNT_MISMATCH'
    | 'CASE_COUNT_MISMATCH'
    | 'QUESTION_TOPIC_MISMATCH'
    | 'MISSING_ANSWER_KEY'
    | 'PROVENANCE_MISMATCH';
  section: string;
  message: string;
}

export interface StudyPdfValidationReport {
  valid: boolean;
  canonicalTopicIds: string[];
  checkedAt: string;
  checks: {
    titleMatchesTopic: boolean;
    sectionsMatchTopic: boolean;
    illustrationsMatchTopic: boolean;
    exactAssessmentCounts: boolean;
    questionsMatchTopic: boolean;
    answerKeysComplete: boolean;
    referencesConsistent: boolean;
  };
  issues: StudyPdfValidationIssue[];
}

export interface StudyPdfUnit {
  unitNumber: number;
  guideId: string;
  blueprintId: string;
  blueprint: MedicalTopicBlueprint;
  canonicalTopicId: string;
  canonicalTopic: CanonicalTopicDescriptor;
  topic: string;
  systemTemplate: AnatomicalSystemTemplate;
  coverAtlasKey: string;
  verifiedPageSet: number[];
  coverageLabel: string;
  coverageNote: string;
  citationSummary: string;
  summary: string;
  quickRevisionBullets: string[];
  sections: ExplanationSection[];
  mindMap?: MindMapData;
  flowcharts: FlowchartData[];
  anatomicalDiagram?: AnatomicalDiagramData;
  comparisonTable?: ComparisonTableData;
  clinicalCases: ClinicalCaseScenario[];
  clinicalNotes: ClinicalNote[];
  mcqs: MCQItem[];
  infographicPack: InfographicTopicPack;
}

export interface StudyPdfTocDraftItem {
  id: string;
  label: string;
  sublabel?: string;
  level: 1 | 2;
}

export interface StudyPdfDocumentModel {
  canonicalTopicIds: string[];
  title: string;
  subtitle: string;
  scopeLabel: string;
  styleLabel: string;
  orientationLabel: string;
  exportMode: PdfDocumentExportMode;
  generatedDateLabel: string;
  config: PdfGeneratorConfig;
  units: StudyPdfUnit[];
  tocItems: StudyPdfTocDraftItem[];
  verifiedBookReferences: Array<{
    textbookId: string;
    textbookTitle: string;
    subject?: string;
    pageLabel: string;
    pageNumbers: number[];
  }>;
  participatingBooks: Array<{
    id: string;
    title: string;
    subject: string;
    pageCount: number;
  }>;
  externalEvidenceReferences: ExternalEvidenceItem[];
  supplementaryDisclosures: Array<{
    topic: string;
    disclosure: string;
  }>;
  stats: {
    topicCount: number;
    stepCount: number;
    integratedScienceCount: number;
    diagramCount: number;
    mcqCount: number;
    writtenCount: number;
    clinicalCaseCount: number;
    citedBookCount: number;
    externalRefCount: number;
  };
  validation: StudyPdfValidationReport;
}

/**
 * Normalizes rich typographic symbols to clean WinAnsi-safe ASCII equivalents
 * so standard PDF vector fonts render 100% cleanly on Android & print without missing glyphs.
 */
export function sanitizePdfVectorText(raw: string | undefined | null): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, ' - ')
    .replace(/\u2026/g, '...')
    .replace(/\u2192|\u2794|\u279C/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2194/g, '<->')
    .replace(/\u2191/g, 'up ')
    .replace(/\u2193/g, 'down ')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u00B1/g, '+/-')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00B7|\u2022/g, '-')
    .replace(/\u207A/g, '+')
    .replace(/\u207B/g, '-')
    .replace(/\u00B2|\u2082/g, '2')
    .replace(/\u00B3|\u2083/g, '3')
    .replace(/\u2081/g, '1')
    .replace(/\u2084/g, '4')
    .replace(/\u03B1/g, 'alpha')
    .replace(/\u03B2/g, 'beta')
    .replace(/\u03B3/g, 'gamma')
    .replace(/\u03B4/g, 'delta')
    .replace(/\u03BA/g, 'kappa')
    .replace(/\u03BC/g, 'u')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export interface BuildStudyPdfInput {
  config: PdfGeneratorConfig;
  activeGuide?: StudyGuide | null;
  selectedGuides?: StudyGuide[];
  chapterBook?: MedicalTextbook | null;
  chapterPageNumbers?: number[];
  allTextbooks?: MedicalTextbook[];
}

export function resolveGuidesForPdfScope(input: BuildStudyPdfInput): StudyGuide[] {
  const {
    config,
    activeGuide,
    selectedGuides = [],
    chapterBook,
    chapterPageNumbers = [],
  } = input;

  if (config.scope === 'chapter') {
    if (!chapterBook) return activeGuide ? [activeGuide] : [];
    const pages =
      chapterPageNumbers.length > 0
        ? Array.from(new Set(chapterPageNumbers)).sort((a, b) => a - b)
        : [1];
    return pages.map((pg) => compileChapterToStudyGuide(chapterBook, pg));
  }

  if (config.scope === 'selected_topics' || config.scope === 'revision_guide') {
    if (selectedGuides.length > 0) return selectedGuides;
    if (activeGuide) return [activeGuide];
    return [];
  }

  // single_topic: NEVER fall back to an arbitrary unrelated saved guide if activeGuide is null
  if (activeGuide) return [activeGuide];
  return [];
}

const GENERIC_STOCK_ATLAS_KEYS = new Set([
  'pathology_histology',
  'immunology_synapse',
  'pharmacology_receptor',
]);

function isAtlasKeyAllowedForTopic(
  atlasKey: string,
  canonical: CanonicalTopicDescriptor
): { ok: boolean; reason?: string } {
  if (!atlasKey) {
    return { ok: false, reason: 'Illustration atlasKey is empty.' };
  }
  if (GENERIC_STOCK_ATLAS_KEYS.has(atlasKey)) {
    return {
      ok: false,
      reason: `Generic stock plate "${atlasKey}" is forbidden for topic "${canonical.canonicalTitle}".`,
    };
  }
  if (atlasKey.startsWith('vector:')) {
    const parts = atlasKey.split(':');
    const domainPart = parts[1] || '';
    if (domainPart && domainPart !== canonical.organDomain) {
      return {
        ok: false,
        reason: `Vector schematic domain "${domainPart}" does not match canonical organ domain "${canonical.organDomain}" for "${canonical.canonicalTitle}".`,
      };
    }
    return { ok: true };
  }

  if (!canonical.allowedRasterAtlasKey) {
    return {
      ok: false,
      reason: `Unrelated 3D organ raster "${atlasKey}" cannot be used for "${canonical.canonicalTitle}" (${canonical.organDomain}); a dedicated topic-specific diagram is required.`,
    };
  }

  if (
    atlasKey === canonical.allowedRasterAtlasKey ||
    (canonical.allowedRasterAtlasKey === 'cardiopulmonary_anatomy' &&
      atlasKey === 'cardiopulmonary_patho')
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: `Organ raster "${atlasKey}" does not match allowed organ key "${canonical.allowedRasterAtlasKey}" for "${canonical.canonicalTitle}".`,
  };
}

/**
 * Automated Pre-Export Coherence Gate:
 * Blocks PDF generation whenever the Cover Title, Lesson Content, Illustrations,
 * 30 MCQs, 10 Written Questions, 8 Clinical Cases, Answer Keys, or References
 * drift from or contradict the selected canonical medical topic.
 */
export function validateStudyPdfCoherence(
  model: StudyPdfDocumentModel
): StudyPdfValidationReport {
  const issues: StudyPdfValidationIssue[] = [];
  let titleMatchesTopic = true;
  let sectionsMatchTopic = true;
  let illustrationsMatchTopic = true;
  let exactAssessmentCounts = true;
  let questionsMatchTopic = true;
  let answerKeysComplete = true;
  let referencesConsistent = true;

  if (model.units.length === 0) {
    issues.push({
      code: 'EMPTY_UNITS',
      section: 'Document Scope',
      message: 'No study topic is loaded for PDF generation. Generate or select a medical topic first.',
    });
    return {
      valid: false,
      canonicalTopicIds: [],
      checkedAt: new Date().toISOString(),
      checks: {
        titleMatchesTopic: false,
        sectionsMatchTopic: false,
        illustrationsMatchTopic: false,
        exactAssessmentCounts: false,
        questionsMatchTopic: false,
        answerKeysComplete: false,
        referencesConsistent: false,
      },
      issues,
    };
  }

  // 1. Validate Cover Title vs Unit Canonical Topic(s)
  if (model.units.length === 1) {
    const primary = model.units[0];
    const titleCheck = doesTitleMatchCanonicalTopic(model.title, primary.canonicalTopic);
    if (!titleCheck.matches) {
      titleMatchesTopic = false;
      issues.push({
        code: 'TITLE_TOPIC_MISMATCH',
        section: 'Cover Page Title',
        message:
          titleCheck.reason ||
          `Cover title "${model.title}" does not match content topic "${primary.canonicalTopic.canonicalTitle}" (${primary.canonicalTopicId}).`,
      });
    }
  } else {
    // In multi-unit compendiums, ensure cover title does not claim a single disease that is absent from units
    const coverCanonical = canonicalizeMedicalTopic(model.title);
    const anyUnitMatchesCover = model.units.some(
      (u) => u.canonicalTopicId === coverCanonical.topicId
    );
    const isGenericCompendiumTitle =
      /\b(compendium|multi-topic|selected|chapter|study guide)\b/i.test(model.title) &&
      !model.units.every(
        (u) => detectConflictingTopicHijack(model.title, model.title, u.canonicalTopic).hijacked
      );
    if (!anyUnitMatchesCover && !isGenericCompendiumTitle) {
      titleMatchesTopic = false;
      issues.push({
        code: 'TITLE_TOPIC_MISMATCH',
        section: 'Cover Page Title',
        message: `Compendium cover title "${model.title}" conflicts with included unit topics (${model.units
          .map((u) => u.topic)
          .join(', ')}).`,
      });
    }
  }

  const includeQuestionBank =
    model.exportMode !== 'full_study_guide'
      ? true
      : model.config.includeQuestionBank ?? model.config.includeMcqsWithAnswers;

  for (const unit of model.units) {
    const canonical = unit.canonicalTopic;
    const unitLabel = `Unit ${unit.unitNumber} (${canonical.canonicalTitle})`;

    // Canonical ID consistency between Unit and Infographic Pack
    if (
      unit.infographicPack.canonicalTopicId &&
      unit.infographicPack.canonicalTopicId !== unit.canonicalTopicId
    ) {
      sectionsMatchTopic = false;
      issues.push({
        code: 'UNIT_TOPIC_HIJACK',
        section: unitLabel,
        message: `Infographic pack canonicalTopicId "${unit.infographicPack.canonicalTopicId}" does not match unit canonicalTopicId "${unit.canonicalTopicId}".`,
      });
    }

    // Summary & Sections check
    const summaryHijack = detectConflictingTopicHijack(unit.summary, unit.topic, canonical);
    if (summaryHijack.hijacked) {
      sectionsMatchTopic = false;
      issues.push({
        code: 'SECTION_TOPIC_MISMATCH',
        section: `${unitLabel} — Executive Summary`,
        message: `Executive summary discusses conflicting topic "${summaryHijack.conflictingLabel}" instead of "${canonical.canonicalTitle}".`,
      });
    }

    if (model.exportMode === 'full_study_guide' && unit.sections.length === 0) {
      sectionsMatchTopic = false;
      issues.push({
        code: 'SECTION_TOPIC_MISMATCH',
        section: `${unitLabel} — Sections`,
        message: `Study unit "${canonical.canonicalTitle}" has zero lesson sections.`,
      });
    }

    unit.sections.forEach((sec, idx) => {
      const hj = detectConflictingTopicHijack(
        `${sec.content} ${sec.keyTakeaway}`,
        sec.heading,
        canonical
      );
      if (hj.hijacked) {
        sectionsMatchTopic = false;
        issues.push({
          code: 'SECTION_TOPIC_MISMATCH',
          section: `${unitLabel} — Step ${idx + 1}`,
          message: `Section "${sec.heading}" discusses conflicting topic "${hj.conflictingLabel}" instead of "${canonical.canonicalTitle}".`,
        });
      }
    });

    unit.infographicPack.integratedDisciplines.forEach((disc) => {
      const hj = detectConflictingTopicHijack(
        `${disc.detailedExplanation} ${disc.keyPoints.join(' ')}`,
        disc.title,
        canonical
      );
      if (hj.hijacked) {
        sectionsMatchTopic = false;
        issues.push({
          code: 'SECTION_TOPIC_MISMATCH',
          section: `${unitLabel} — ${disc.disciplineLabel}`,
          message: `Discipline block "${disc.title}" discusses conflicting topic "${hj.conflictingLabel}" instead of "${canonical.canonicalTitle}".`,
        });
      }

      // Validate discipline illustration key
      if (disc.visualKind !== 'physiology_curve') {
        const blockAtlasKey = resolveStrictTopicAtlasKey(
          canonical,
          disc.discipline,
          disc.visualKind
        );
        const illusOk = isAtlasKeyAllowedForTopic(blockAtlasKey, canonical);
        if (!illusOk.ok) {
          illustrationsMatchTopic = false;
          issues.push({
            code: 'ILLUSTRATION_MISMATCH',
            section: `${unitLabel} — ${disc.disciplineLabel} Visual`,
            message: illusOk.reason || 'Unrelated discipline illustration.',
          });
        }
      }
    });

    // Cover & Anatomical Diagram Illustration check
    const coverCheck = isAtlasKeyAllowedForTopic(unit.coverAtlasKey, canonical);
    if (!coverCheck.ok) {
      illustrationsMatchTopic = false;
      issues.push({
        code: 'ILLUSTRATION_MISMATCH',
        section: `${unitLabel} — Cover Illustration`,
        message: coverCheck.reason || 'Cover illustration does not match canonical topic.',
      });
    }

    if (unit.anatomicalDiagram) {
      // Catch mismatched hepatobiliary/cardiopulmonary template or callouts on gastroduodenal/esophageal topics
      if (
        (canonical.organDomain === 'gastroduodenal' ||
          canonical.organDomain === 'esophageal' ||
          canonical.organDomain === 'intestinal_colorectal' ||
          canonical.organDomain === 'pancreatic') &&
        (unit.anatomicalDiagram.systemTemplate === 'hepatobiliary' ||
          unit.anatomicalDiagram.systemTemplate === 'cardiopulmonary')
      ) {
        illustrationsMatchTopic = false;
        issues.push({
          code: 'ILLUSTRATION_MISMATCH',
          section: `${unitLabel} — Anatomical Diagram`,
          message: `Anatomical diagram uses unrelated organ template "${unit.anatomicalDiagram.systemTemplate}" for "${canonical.canonicalTitle}" (${canonical.organDomain}).`,
        });
      }

      const diagText = `${unit.anatomicalDiagram.title} ${unit.anatomicalDiagram.callouts
        .map((c) => `${c.structureName} ${c.pathologicalChange}`)
        .join(' ')}`;
      const diagHijack = detectConflictingTopicHijack(
        diagText,
        unit.anatomicalDiagram.title,
        canonical
      );
      if (diagHijack.hijacked) {
        illustrationsMatchTopic = false;
        issues.push({
          code: 'ILLUSTRATION_MISMATCH',
          section: `${unitLabel} — Anatomical Diagram`,
          message: `Anatomical diagram references conflicting topic "${diagHijack.conflictingLabel}" instead of "${canonical.canonicalTitle}".`,
        });
      }
    }

    // Question Bank Validation: Exact 30 MCQs, 10 Written, 8 Clinical Cases + Topic Alignment + Answer Keys
    if (includeQuestionBank) {
      const qb = unit.infographicPack.questionBank;
      const countCheck = validateQuestionBankExactCounts(qb);

      if (qb.mcqs.length !== 30) {
        exactAssessmentCounts = false;
        issues.push({
          code: 'MCQ_COUNT_MISMATCH',
          section: `${unitLabel} — MCQs`,
          message: `Expected exactly 30 MCQs for "${canonical.canonicalTitle}", found ${qb.mcqs.length}.`,
        });
      }
      if (qb.writtenQuestions.length !== 10) {
        exactAssessmentCounts = false;
        issues.push({
          code: 'WRITTEN_COUNT_MISMATCH',
          section: `${unitLabel} — Written Questions`,
          message: `Expected exactly 10 Written Questions for "${canonical.canonicalTitle}", found ${qb.writtenQuestions.length}.`,
        });
      }
      if (qb.clinicalCases.length !== 8) {
        exactAssessmentCounts = false;
        issues.push({
          code: 'CASE_COUNT_MISMATCH',
          section: `${unitLabel} — Clinical Cases`,
          message: `Expected exactly 8 Clinical Cases for "${canonical.canonicalTitle}", found ${qb.clinicalCases.length}.`,
        });
      }

      if (!countCheck.valid) {
        for (const err of countCheck.errors) {
          if (/missing|marking|progressive|invalid|fewer/i.test(err)) {
            answerKeysComplete = false;
            issues.push({
              code: 'MISSING_ANSWER_KEY',
              section: `${unitLabel} — Answer Keys`,
              message: err,
            });
          } else if (!/Expected \d+/i.test(err)) {
            exactAssessmentCounts = false;
            issues.push({
              code: 'MCQ_COUNT_MISMATCH',
              section: `${unitLabel} — Question Bank`,
              message: err,
            });
          }
        }
      }

      qb.mcqs.forEach((m) => {
        const align = isAssessmentItemAlignedWithTopic(
          `${m.stem} ${m.options.join(' ')} ${m.explanation}`,
          undefined,
          canonical
        );
        if (!align.aligned) {
          questionsMatchTopic = false;
          issues.push({
            code: 'QUESTION_TOPIC_MISMATCH',
            section: `${unitLabel} — MCQ Q${m.number}`,
            message: `MCQ Q${m.number} fails topic validation: ${align.reason}`,
          });
        }
      });

      qb.writtenQuestions.forEach((w) => {
        const align = isAssessmentItemAlignedWithTopic(
          `${w.prompt} ${w.modelAnswer}`,
          undefined,
          canonical
        );
        if (!align.aligned) {
          questionsMatchTopic = false;
          issues.push({
            code: 'QUESTION_TOPIC_MISMATCH',
            section: `${unitLabel} — Written W${w.number}`,
            message: `Written question W${w.number} fails topic validation: ${align.reason}`,
          });
        }
      });

      qb.clinicalCases.forEach((cs) => {
        const fullCase = `${cs.patientPresentation} ${cs.progressiveQuestions
          .map((pq) => `${pq.question} ${pq.modelAnswer} ${pq.rationale}`)
          .join(' ')}`;
        const align = isAssessmentItemAlignedWithTopic(fullCase, cs.title, canonical);
        if (!align.aligned) {
          questionsMatchTopic = false;
          issues.push({
            code: 'QUESTION_TOPIC_MISMATCH',
            section: `${unitLabel} — Case ${cs.number}`,
            message: `Clinical Case ${cs.number} ("${cs.title}") fails topic validation: ${align.reason}`,
          });
        }
      });
    }

    // Provenance check: if unit has 0 verified pages, no section or question may claim textbook page numbers
    const allowedPages = new Set(unit.verifiedPageSet);
    const verifyItemPages = (
      sourceBasis: string,
      pageNumbers: number[],
      itemLabel: string
    ) => {
      if (sourceBasis === 'textbook') {
        if (allowedPages.size === 0 || pageNumbers.some((p) => !allowedPages.has(p))) {
          referencesConsistent = false;
          issues.push({
            code: 'PROVENANCE_MISMATCH',
            section: `${unitLabel} — References`,
            message: `${itemLabel} cites unverified textbook pages [${pageNumbers.join(', ')}] outside verified set [${Array.from(allowedPages).join(', ')}].`,
          });
        }
      }
    };

    unit.sections.forEach((s, idx) =>
      verifyItemPages(s.sourceBasis, s.pageNumbers, `Section ${idx + 1}`)
    );
    if (includeQuestionBank) {
      unit.infographicPack.questionBank.mcqs.forEach((m) =>
        verifyItemPages(m.sourceBasis, m.pageNumbers, `MCQ Q${m.number}`)
      );
    }
  }

  return {
    valid: issues.length === 0,
    canonicalTopicIds: model.units.map((u) => u.canonicalTopicId),
    checkedAt: new Date().toISOString(),
    checks: {
      titleMatchesTopic,
      sectionsMatchTopic,
      illustrationsMatchTopic,
      exactAssessmentCounts,
      questionsMatchTopic,
      answerKeysComplete,
      referencesConsistent,
    },
    issues,
  };
}

export function buildStudyPdfDocumentModel(
  input: BuildStudyPdfInput
): StudyPdfDocumentModel {
  const { config, allTextbooks = [], chapterBook } = input;
  const exportMode: PdfDocumentExportMode = config.exportMode || 'full_study_guide';
  const effectiveStyle =
    config.scope === 'revision_guide' ? 'compact' : config.style;
  const includeQuestionBank =
    exportMode !== 'full_study_guide'
      ? true
      : config.includeQuestionBank ?? config.includeMcqsWithAnswers;

  const autoLandscapeWidePages =
    config.autoLandscapeWidePages ??
    (config.orientation === 'portrait' && exportMode === 'full_study_guide');

  const effectiveConfig: PdfGeneratorConfig = {
    ...config,
    style: effectiveStyle,
    exportMode,
    includeQuestionBank,
    autoLandscapeWidePages,
  };

  const guides = resolveGuidesForPdfScope(input);
  const bookLookup = new Map<string, MedicalTextbook>();
  for (const b of allTextbooks) bookLookup.set(b.id, b);
  if (chapterBook) bookLookup.set(chapterBook.id, chapterBook);

  const units: StudyPdfUnit[] = guides.map((g, idx) => {
    const canonical = canonicalizeMedicalTopic(g.topic);
    const canonicalTitle = doesTitleMatchCanonicalTopic(g.topic, canonical).matches
      ? g.topic
      : canonical.canonicalTitle;

    const fallbackCitations: BookPageCitation[] =
      g.bookCitations && g.bookCitations.length > 0
        ? g.bookCitations
        : g.referencedPages.length > 0 && g.coverage !== 'none'
          ? [
              {
                textbookId: g.textbookId,
                textbookTitle: g.textbookTitle,
                pageNumbers: g.referencedPages,
              },
            ]
          : [];

    const verifiedPageSet =
      g.coverage === 'none'
        ? []
        : Array.from(
            new Set([
              ...(g.referencedPages || []),
              ...fallbackCitations.flatMap((c) => c.pageNumbers || []),
            ])
          )
            .filter((n) => Number.isInteger(n) && n > 0)
            .sort((a, b) => a - b);

    const isZeroBookGuide =
      g.textbookId === 'general-medical-knowledge' &&
      (!g.sourceTextbooks || g.sourceTextbooks.length === 0);
    const extCount = (g.externalEvidence || []).length;

    const citationSummary =
      g.coverage === 'none' || fallbackCitations.length === 0
        ? extCount > 0
          ? `${extCount} External Scientific References · 0 Textbook Pages Cited`
          : 'No textbook pages cited (General Medical Knowledge)'
        : formatBookCitationsSummary(
            fallbackCitations,
            g.referencedPages,
            g.textbookTitle
          );

    const coverageLabel =
      g.coverage === 'strong'
        ? 'Verified Textbook Grounding'
        : g.coverage === 'partial'
          ? 'Partial Textbook + Supplementary Medical Science'
          : isZeroBookGuide
            ? extCount > 0
              ? 'External Scientific Evidence + General Medical Knowledge'
              : 'General Medical Knowledge (No Textbook Selected)'
            : 'Supplementary Medical Knowledge (0 Book Pages Matched)';

    const quickBullets =
      g.quickRevisionBullets && g.quickRevisionBullets.length > 0
        ? g.quickRevisionBullets
        : g.sections.map((s) => s.keyTakeaway).filter(Boolean);

    // Ensure systemTemplate never misclassifies gastroduodenal/esophageal/intestinal/pancreatic as hepatobiliary or cardiopulmonary
    const rawSystemTemplate =
      g.anatomicalDiagram?.systemTemplate || inferAnatomicalTemplate(canonicalTitle);
    const systemTemplate: AnatomicalSystemTemplate =
      (canonical.organDomain === 'gastroduodenal' ||
        canonical.organDomain === 'esophageal' ||
        canonical.organDomain === 'intestinal_colorectal' ||
        canonical.organDomain === 'pancreatic') &&
      (rawSystemTemplate === 'hepatobiliary' || rawSystemTemplate === 'cardiopulmonary')
        ? canonical.systemTemplate
        : rawSystemTemplate;

    const normalizedDiagram: AnatomicalDiagramData | undefined =
      effectiveConfig.includeVisualDiagrams && g.anatomicalDiagram
        ? {
            ...g.anatomicalDiagram,
            systemTemplate,
          }
        : undefined;

    const guideWithCanonical: StudyGuide = {
      ...g,
      canonicalTopicId: canonical.topicId,
      topic: canonicalTitle,
      anatomicalDiagram: normalizedDiagram || g.anatomicalDiagram,
    };

    const blueprint =
      guideWithCanonical.blueprint &&
      guideWithCanonical.blueprint.canonicalTopicId === canonical.topicId
        ? guideWithCanonical.blueprint
        : buildMedicalTopicBlueprint(guideWithCanonical);

    const baseInfographicPack = ensureCompleteInfographicTopicPack({
      ...guideWithCanonical,
      infographicPack: guideWithCanonical.infographicPack
        ? {
            ...guideWithCanonical.infographicPack,
            learningObjectives:
              blueprint.learningObjectives.length > 0
                ? blueprint.learningObjectives
                : guideWithCanonical.infographicPack.learningObjectives,
          }
        : undefined,
    });

    const infographicPack: InfographicTopicPack = {
      ...baseInfographicPack,
      learningObjectives:
        blueprint.learningObjectives.length > 0
          ? blueprint.learningObjectives
          : baseInfographicPack.learningObjectives,
      sourceGapNotice:
        blueprint.provenance.disclosureText || baseInfographicPack.sourceGapNotice,
    };

    return {
      unitNumber: idx + 1,
      guideId: g.id,
      blueprintId: blueprint.blueprintId,
      blueprint,
      canonicalTopicId: canonical.topicId,
      canonicalTopic: canonical,
      topic: canonicalTitle,
      systemTemplate,
      coverAtlasKey: resolveStrictTopicAtlasKey(canonical, 'anatomy', 'atlas_plate'),
      verifiedPageSet,
      coverageLabel,
      coverageNote: g.coverageNote,
      citationSummary,
      summary: g.summary,
      quickRevisionBullets: quickBullets,
      sections: g.sections,
      mindMap: effectiveConfig.includeVisualDiagrams
        ? blueprint.mindMap || g.mindMap
        : undefined,
      flowcharts: effectiveConfig.includeVisualDiagrams
        ? blueprint.flowcharts.length > 0
          ? blueprint.flowcharts
          : g.flowcharts || []
        : [],
      anatomicalDiagram: normalizedDiagram,
      comparisonTable: effectiveConfig.includeComparisonAndCases
        ? blueprint.comparisonTable || g.comparisonTable
        : undefined,
      clinicalCases: effectiveConfig.includeComparisonAndCases
        ? g.clinicalCases || []
        : [],
      clinicalNotes:
        blueprint.clinicalPearls.length > 0
          ? blueprint.clinicalPearls
          : g.clinicalNotes || [],
      mcqs: includeQuestionBank ? g.mcqs || [] : [],
      infographicPack,
    };
  });

  // Aggregate verified textbook citations strictly from textbook-backed guides
  const bookRefMap = new Map<
    string,
    { textbookId: string; textbookTitle: string; subject?: string; pages: Set<number> }
  >();
  const participatingBookMap = new Map<
    string,
    { id: string; title: string; subject: string; pageCount: number }
  >();

  for (const g of guides) {
    for (const sb of g.sourceTextbooks || []) {
      if (!sb.id || sb.id === 'general-medical-knowledge') continue;
      const known = bookLookup.get(sb.id);
      participatingBookMap.set(sb.id, {
        id: sb.id,
        title: sb.title,
        subject: sb.subject || known?.subject || 'Internal Medicine',
        pageCount: sb.pageCount || known?.pageCount || 1,
      });
    }
    if (
      (!g.sourceTextbooks || g.sourceTextbooks.length === 0) &&
      g.textbookId &&
      g.textbookId !== 'general-medical-knowledge'
    ) {
      const known = bookLookup.get(g.textbookId);
      participatingBookMap.set(g.textbookId, {
        id: g.textbookId,
        title: known?.title || g.textbookTitle,
        subject: known?.subject || 'Internal Medicine',
        pageCount: known?.pageCount || g.totalPagesSearched || 1,
      });
    }

    if (g.coverage !== 'none') {
      const cites =
        g.bookCitations && g.bookCitations.length > 0
          ? g.bookCitations
          : g.referencedPages.length > 0
            ? [
                {
                  textbookId: g.textbookId,
                  textbookTitle: g.textbookTitle,
                  pageNumbers: g.referencedPages,
                },
              ]
            : [];

      for (const c of cites) {
        if (!c.pageNumbers || c.pageNumbers.length === 0) continue;
        const known = bookLookup.get(c.textbookId);
        const existing = bookRefMap.get(c.textbookId) || {
          textbookId: c.textbookId,
          textbookTitle: c.textbookTitle,
          subject: known?.subject,
          pages: new Set<number>(),
        };
        c.pageNumbers.forEach((p) => {
          if (Number.isInteger(p) && p > 0) existing.pages.add(p);
        });
        bookRefMap.set(c.textbookId, existing);
      }
    }
  }

  const verifiedBookReferences = Array.from(bookRefMap.values())
    .map((entry) => {
      const pageNumbers = Array.from(entry.pages).sort((a, b) => a - b);
      return {
        textbookId: entry.textbookId,
        textbookTitle: entry.textbookTitle,
        subject: entry.subject,
        pageNumbers,
        pageLabel: buildPageCitationLabel(pageNumbers),
      };
    })
    .filter((entry) => entry.pageNumbers.length > 0);

  const extEvidenceMap = new Map<string, ExternalEvidenceItem>();
  for (const g of guides) {
    for (const ev of g.externalEvidence || []) {
      const key = ev.pmid || ev.nctId || ev.url || ev.id;
      if (key && !extEvidenceMap.has(key)) {
        extEvidenceMap.set(key, ev);
      }
    }
  }
  const externalEvidenceReferences = Array.from(extEvidenceMap.values());

  const supplementaryDisclosures = units.map((u) => ({
    topic: u.topic,
    disclosure: u.infographicPack.sourceGapNotice,
  }));

  // Build Table of Contents items matching the 11-Section Textbook Infographic Architecture
  const tocItems: StudyPdfTocDraftItem[] = [];
  for (const unit of units) {
    const uPrefix = units.length > 1 ? `Unit ${unit.unitNumber}: ` : '';

    if (exportMode === 'full_study_guide') {
      tocItems.push({
        id: `unit-${unit.unitNumber}-overview`,
        label: `${uPrefix}1. Executive Overview & Learning Objectives — ${unit.topic}`,
        sublabel: unit.citationSummary,
        level: 1,
      });

      tocItems.push({
        id: `unit-${unit.unitNumber}-steps`,
        label: `${uPrefix}2. Step-by-Step Textbook Explanation (${unit.sections.length} Steps)`,
        level: 2,
      });

      tocItems.push({
        id: `unit-${unit.unitNumber}-sciences`,
        label: `${uPrefix}3. Illustrated Integrated Medical Sciences (${unit.infographicPack.integratedDisciplines.length} Disciplines)`,
        level: 2,
      });

      if (
        effectiveConfig.includeVisualDiagrams &&
        (unit.mindMap || unit.flowcharts.length > 0 || unit.anatomicalDiagram)
      ) {
        tocItems.push({
          id: `unit-${unit.unitNumber}-visuals`,
          label: `${uPrefix}4. Mechanism Flowcharts & Visual Mind Map`,
          level: 2,
        });
      }

      if (effectiveConfig.includeComparisonAndCases && unit.comparisonTable) {
        tocItems.push({
          id: `unit-${unit.unitNumber}-tables`,
          label: `${uPrefix}5. Clinical Correlations & Differential Comparison Tables`,
          level: 2,
        });
      }

      tocItems.push({
        id: `unit-${unit.unitNumber}-pearls`,
        label: `${uPrefix}6. High-Yield Summary, Red Flags & Clinical Pearls`,
        level: 2,
      });
    }

    if (includeQuestionBank) {
      tocItems.push({
        id: `unit-${unit.unitNumber}-qb-mcqs`,
        label: `${uPrefix}7. Self-Assessment: 30 Multiple-Choice Questions (Question-Only)`,
        level: exportMode === 'full_study_guide' ? 2 : 1,
      });
      tocItems.push({
        id: `unit-${unit.unitNumber}-qb-written`,
        label: `${uPrefix}8. Structured Written Examination: 10 Questions (Question-Only)`,
        level: 2,
      });
      tocItems.push({
        id: `unit-${unit.unitNumber}-qb-cases`,
        label: `${uPrefix}9. Clinical Case Scenarios: 8 Progressive Cases (Question-Only)`,
        level: 2,
      });

      if (exportMode !== 'question_bank_self_test' && effectiveConfig.includeMcqsWithAnswers) {
        tocItems.push({
          id: `unit-${unit.unitNumber}-qb-answers`,
          label: `${uPrefix}10. Separate Answer Keys, Marking Rubrics & Model Explanations`,
          level: exportMode === 'full_study_guide' ? 2 : 1,
        });
      }
    }
  }

  if (effectiveConfig.includeReferences) {
    tocItems.push({
      id: 'references-appendix',
      label: '11. Verified References & Three-Tier Source Provenance Index',
      level: 1,
    });
  }

  const scopeLabels: Record<PdfGeneratorConfig['scope'], string> = {
    single_topic:
      exportMode === 'question_bank_with_answers'
        ? 'Standalone 48-Item Medical Question Bank + Answer Key'
        : exportMode === 'question_bank_self_test'
          ? 'Standalone 48-Item Self-Test Examination Paper'
          : 'Medical Textbook Infographic Study Guide',
    chapter: chapterBook
      ? `Textbook Chapter Infographic Guide · ${shortenBookTitle(chapterBook.title, 44)}`
      : 'Textbook Chapter Infographic Guide',
    selected_topics: `Multi-Topic Medical Textbook Compendium (${units.length} Topics)`,
    revision_guide: `High-Yield Exam Revision Compendium (${units.length} ${
      units.length === 1 ? 'Topic' : 'Topics'
    })`,
  };

  const chapterJoinedTopics = units
    .map((u) => u.topic)
    .slice(0, 2)
    .join(' & ');

  const baseTopicTitle =
    units.length === 1
      ? units[0].topic
      : config.scope === 'chapter'
        ? `${chapterJoinedTopics}${units.length > 2 ? ` (+${units.length - 2} More)` : ''} — Chapter Study Guide`
        : config.scope === 'revision_guide'
          ? `High-Yield Medical Revision Compendium (${units.length} Topics)`
          : `MedAtlas Multi-Topic Study Guide (${units.length} Topics)`;

  const defaultTitle =
    config.customTitle && config.customTitle.trim().length > 0
      ? config.customTitle.trim()
      : exportMode === 'question_bank_with_answers'
        ? `${baseTopicTitle} — Question Bank & Answer Key (48 Items)`
        : exportMode === 'question_bank_self_test'
          ? `${baseTopicTitle} — Self-Test Question Paper (48 Items)`
          : baseTopicTitle;

  const stepCount = units.reduce((acc, u) => acc + u.sections.length, 0);
  const integratedScienceCount = units.reduce(
    (acc, u) => acc + u.infographicPack.integratedDisciplines.length,
    0
  );
  const diagramCount = units.reduce(
    (acc, u) =>
      acc +
      (u.mindMap ? 1 : 0) +
      u.flowcharts.length +
      (u.anatomicalDiagram ? 1 : 0) +
      u.infographicPack.integratedDisciplines.length,
    0
  );
  const mcqCount = includeQuestionBank
    ? units.reduce((acc, u) => acc + u.infographicPack.questionBank.mcqs.length, 0)
    : 0;
  const writtenCount = includeQuestionBank
    ? units.reduce(
        (acc, u) => acc + u.infographicPack.questionBank.writtenQuestions.length,
        0
      )
    : 0;
  const clinicalCaseCount = includeQuestionBank
    ? units.reduce(
        (acc, u) => acc + u.infographicPack.questionBank.clinicalCases.length,
        0
      )
    : 0;

  const draftModel: StudyPdfDocumentModel = {
    canonicalTopicIds: units.map((u) => u.canonicalTopicId),
    title: defaultTitle,
    subtitle:
      verifiedBookReferences.length > 0
        ? `Grounded in ${verifiedBookReferences
            .map((r) => `${shortenBookTitle(r.textbookTitle, 36)} (${r.pageLabel})`)
            .join(' · ')}`
        : 'Illustrated Medical Textbook Infographic & 48-Question Assessment Edition',
    scopeLabel: scopeLabels[config.scope],
    styleLabel:
      exportMode === 'question_bank_with_answers'
        ? 'Standalone Question Bank + Answer Key'
        : exportMode === 'question_bank_self_test'
          ? 'Self-Test Examination Mode (Questions Only)'
          : effectiveStyle === 'compact'
            ? 'Compact High-Yield Revision Infographic'
            : 'Illustrated Medical Textbook Infographic',
    orientationLabel:
      config.orientation === 'landscape'
        ? 'A4 Landscape (297 × 210 mm)'
        : autoLandscapeWidePages
          ? 'A4 Portrait + Auto-Landscape Wide Diagrams/Tables'
          : 'A4 Portrait (210 × 297 mm)',
    exportMode,
    generatedDateLabel: new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    config: effectiveConfig,
    units,
    tocItems,
    verifiedBookReferences,
    participatingBooks: Array.from(participatingBookMap.values()),
    externalEvidenceReferences,
    supplementaryDisclosures,
    stats: {
      topicCount: units.length,
      stepCount,
      integratedScienceCount,
      diagramCount,
      mcqCount,
      writtenCount,
      clinicalCaseCount,
      citedBookCount: verifiedBookReferences.length,
      externalRefCount: externalEvidenceReferences.length,
    },
    validation: {
      valid: true,
      canonicalTopicIds: units.map((u) => u.canonicalTopicId),
      checkedAt: new Date().toISOString(),
      checks: {
        titleMatchesTopic: true,
        sectionsMatchTopic: true,
        illustrationsMatchTopic: true,
        exactAssessmentCounts: true,
        questionsMatchTopic: true,
        answerKeysComplete: true,
        referencesConsistent: true,
      },
      issues: [],
    },
  };

  draftModel.validation = validateStudyPdfCoherence(draftModel);
  return draftModel;
}
