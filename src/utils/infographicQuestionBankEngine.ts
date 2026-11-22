import type {
  AnatomicalSystemTemplate,
  BookPageCitation,
  CaseProgressiveSubQuestion,
  CaseVitalOrLabEntry,
  ComprehensiveQuestionBank,
  DisciplineVisualKind,
  DrugComparisonRow,
  InfographicCalloutPin,
  InfographicTopicPack,
  IntegratedDisciplineBlock,
  IntegratedScienceDisciplineId,
  MedicalTextbook,
  QuestionBankClinicalCase,
  QuestionBankMcq,
  QuestionBankWrittenItem,
  QuestionDifficultyTier,
  SourceBasis,
  StudyGuide,
  WrittenCommandVerb,
} from '../types/medical';
import { formatBookCitationsSummary } from './multiBookEngine';
import { resolveStrictTopicAtlasKey } from './pdfImageAssets';
import {
  canonicalizeMedicalTopic,
  detectConflictingTopicHijack,
  doesTitleMatchCanonicalTopic,
  isAssessmentItemAlignedWithTopic,
  type CanonicalTopicDescriptor,
} from './topicCanonicalizer';
import { inferAnatomicalTemplate } from './visualLayout';

export const DISCIPLINE_META: Record<
  IntegratedScienceDisciplineId,
  {
    label: string;
    shortTag: string;
    defaultVisualKind: DisciplineVisualKind;
    accentHex: string;
    tintHex: string;
    borderHex: string;
  }
> = {
  anatomy: {
    label: 'Structural & Cross-Sectional Anatomy',
    shortTag: 'Anatomy',
    defaultVisualKind: 'atlas_plate',
    accentHex: '#0F4C81',
    tintHex: '#F0F9FF',
    borderHex: '#BAE6FD',
  },
  physiology: {
    label: 'Normal Physiology & Homeostatic Regulation',
    shortTag: 'Physiology',
    defaultVisualKind: 'physiology_curve',
    accentHex: '#0284C7',
    tintHex: '#F0FDFA',
    borderHex: '#99F6E4',
  },
  pathology: {
    label: 'Gross & Microscopic Histopathology',
    shortTag: 'Pathology',
    defaultVisualKind: 'pathology_comparison',
    accentHex: '#BE123C',
    tintHex: '#FFF1F2',
    borderHex: '#FECDD3',
  },
  pathophysiology: {
    label: 'Pathophysiological Cascade & Causal Mechanisms',
    shortTag: 'Pathophysiology',
    defaultVisualKind: 'causal_pathway',
    accentHex: '#B45309',
    tintHex: '#FFFBEB',
    borderHex: '#FDE68A',
  },
  pharmacology: {
    label: 'Clinical Pharmacology & Receptor Therapeutics',
    shortTag: 'Pharmacology',
    defaultVisualKind: 'pharmacology_receptor',
    accentHex: '#4338CA',
    tintHex: '#EEF2FF',
    borderHex: '#C7D2FE',
  },
  immunology: {
    label: 'Cellular & Molecular Immunology',
    shortTag: 'Immunology',
    defaultVisualKind: 'immunology_synapse',
    accentHex: '#0F766E',
    tintHex: '#ECFDF5',
    borderHex: '#A7F3D0',
  },
  clinical_correlations: {
    label: 'Clinical Correlations, Diagnostics & Management',
    shortTag: 'Clinical Medicine',
    defaultVisualKind: 'atlas_plate',
    accentHex: '#1E3A8A',
    tintHex: '#EFF6FF',
    borderHex: '#BFDBFE',
  },
};

export function resolveAtlasImageKeyForBlock(
  topicOrSystemTemplate: AnatomicalSystemTemplate | string,
  discipline?: IntegratedScienceDisciplineId,
  visualKind?: DisciplineVisualKind
): string {
  const raw = String(topicOrSystemTemplate || '').trim();
  const legacyTemplateMap: Record<string, string> = {
    cardiopulmonary: 'Acute Decompensated Heart Failure',
    renal: 'Acute Kidney Injury',
    respiratory: 'Obstructive Airway Disease',
    endocrine: 'Diabetic Ketoacidosis',
    neurology: 'Ischemic Stroke',
    hepatobiliary: 'Portal Hypertension & Cirrhosis',
    hematology: 'Thrombocytopenia & Coagulation',
    immune: 'Systemic Lupus Erythematosus',
    general_physiology: 'Homeostatic Regulation',
  };
  const canonical = canonicalizeMedicalTopic(legacyTemplateMap[raw] || raw);
  return resolveStrictTopicAtlasKey(canonical, discipline, visualKind);
}

/**
 * Selects ONLY medically relevant disciplines for a given topic and textbook context,
 * avoiding forcing irrelevant sciences (such as generic T-cell/MHC immunology on acid-peptic ulcer disease)
 * onto topics where they do not apply.
 */
export function selectRelevantDisciplinesForTopic(
  topic: string,
  corpusHint = ''
): IntegratedScienceDisciplineId[] {
  const topicLower = String(topic || '').toLowerCase();
  const combined = `${topicLower} ${corpusHint.toLowerCase()}`;

  // Immunology is included ONLY when the topic itself involves autoimmune, hypersensitivity,
  // immunodeficiency, transplant, primary host-defense immunology, or immune-mediated IBD/vasculitis/glomerulonephritis.
  const isImmuneRelevant =
    /\b(lupus|sle|autoimmun\w*|immun\w*|antibod\w*|complement|hiv|vasculit\w*|allerg\w*|anaphylax\w*|rheumat\w*|glomerulonephritis|guillain|myasthenia|transplant|sarcoid\w*|ibd|crohn|ulcerative\s+colitis|celiac|psoriasis|sepsis|vaccine)\b/i.test(
      topicLower
    );

  const isPharmFocused =
    /\b(pharmacol|drug|therap|inhibitor|blocker|agonist|antagonist|antibiotic|insulin|diuretic|anticoag|antiplatelet|statin|gdmt|arnis?|acei|arb|sglt2|ppi|proton\s+pump|eradication|management|treatment|dose|toxicity|overdose|regimen)\b/i.test(
      combined
    );

  const isPurePharmacology =
    /\b(pharmacokinetics|pharmacodynamics|receptor kinetics|cytochrome p450|drug metabolism)\b/i.test(
      topicLower
    );

  const isPureAnatomy =
    /\b(brachial plexus|cranial nerve anatomy|mediastinal anatomy|triangles of neck|inguinal canal|coronary artery anatomy|circle of willis anatomy)\b/i.test(
      topicLower
    );

  if (isPurePharmacology) {
    return [
      'physiology',
      'pathophysiology',
      'pharmacology',
      'clinical_correlations',
    ];
  }

  if (isPureAnatomy) {
    return [
      'anatomy',
      'physiology',
      'pathology',
      'clinical_correlations',
    ];
  }

  const list: IntegratedScienceDisciplineId[] = [
    'anatomy',
    'physiology',
    'pathophysiology',
  ];

  if (!/\b(normal physiology|acid-base formula|fluid calculation)\b/i.test(topicLower)) {
    list.push('pathology');
  }

  if (isImmuneRelevant) {
    list.push('immunology');
  }

  if (isPharmFocused || !isPureAnatomy) {
    list.push('pharmacology');
  }

  list.push('clinical_correlations');
  return Array.from(new Set(list));
}

function normalizeStemKey(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/^q?\d+[.):\s-]+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildAllowedPageSet(guide: StudyGuide): Set<number> {
  if (guide.coverage === 'none') return new Set<number>();
  const set = new Set<number>();
  for (const p of guide.referencedPages || []) {
    if (Number.isInteger(p) && p > 0) set.add(p);
  }
  for (const bc of guide.bookCitations || []) {
    for (const p of bc.pageNumbers || []) {
      if (Number.isInteger(p) && p > 0) set.add(p);
    }
  }
  return set;
}

function sanitizeProvenanceForGuide(
  rawBasis: unknown,
  rawPages: unknown,
  guide: StudyGuide
): {
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
} {
  const allowedPages = buildAllowedPageSet(guide);
  if (guide.coverage === 'none' || allowedPages.size === 0) {
    return {
      sourceBasis: 'general_medical_knowledge',
      pageNumbers: [],
      bookCitations: [],
    };
  }

  const candidatePages = Array.isArray(rawPages)
    ? Array.from(
        new Set(
          rawPages
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && allowedPages.has(n))
        )
      ).sort((a, b) => a - b)
    : [];

  if (rawBasis === 'textbook' && candidatePages.length > 0) {
    const matchedBookCitations: BookPageCitation[] = [];
    for (const bc of guide.bookCitations || []) {
      const overlap = bc.pageNumbers.filter((p) => candidatePages.includes(p));
      if (overlap.length > 0) {
        matchedBookCitations.push({
          textbookId: bc.textbookId,
          textbookTitle: bc.textbookTitle,
          pageNumbers: overlap,
        });
      }
    }
    if (matchedBookCitations.length === 0) {
      matchedBookCitations.push({
        textbookId: guide.textbookId,
        textbookTitle: guide.textbookTitle,
        pageNumbers: candidatePages,
      });
    }
    return {
      sourceBasis: 'textbook',
      pageNumbers: candidatePages,
      bookCitations: matchedBookCitations,
    };
  }

  return {
    sourceBasis: 'general_medical_knowledge',
    pageNumbers: [],
    bookCitations: [],
  };
}

export interface QuestionBankValidationResult {
  valid: boolean;
  mcqCount: number;
  writtenCount: number;
  caseCount: number;
  duplicateCount: number;
  errors: string[];
}

export function validateQuestionBankExactCounts(
  bank: ComprehensiveQuestionBank
): QuestionBankValidationResult {
  const errors: string[] = [];
  let duplicateCount = 0;

  if (bank.mcqs.length !== 30) {
    errors.push(`Expected 30 MCQs, got ${bank.mcqs.length}.`);
  }
  if (bank.writtenQuestions.length !== 10) {
    errors.push(`Expected 10 Written Questions, got ${bank.writtenQuestions.length}.`);
  }
  if (bank.clinicalCases.length !== 8) {
    errors.push(`Expected 8 Clinical Cases, got ${bank.clinicalCases.length}.`);
  }

  const seenMcqs = new Set<string>();
  bank.mcqs.forEach((m, i) => {
    const key = normalizeStemKey(m.stem);
    if (!key) {
      errors.push(`MCQ #${i + 1} has an empty stem.`);
    } else if (seenMcqs.has(key)) {
      duplicateCount++;
      errors.push(`Duplicate MCQ stem at #${i + 1}.`);
    } else {
      seenMcqs.add(key);
    }

    if (!Array.isArray(m.options) || m.options.length < 4) {
      errors.push(`MCQ #${i + 1} has fewer than 4 options.`);
    }
    if (m.correctIndex < 0 || m.correctIndex >= (m.options?.length || 0)) {
      errors.push(`MCQ #${i + 1} has invalid correctIndex ${m.correctIndex}.`);
    }
    if (!m.explanation || m.explanation.trim().length < 8) {
      errors.push(`MCQ #${i + 1} is missing an explanation.`);
    }
  });

  const seenWritten = new Set<string>();
  bank.writtenQuestions.forEach((w, i) => {
    const key = normalizeStemKey(w.prompt);
    if (!key) {
      errors.push(`Written question #${i + 1} has an empty prompt.`);
    } else if (seenWritten.has(key)) {
      duplicateCount++;
      errors.push(`Duplicate Written question prompt at #${i + 1}.`);
    } else {
      seenWritten.add(key);
    }
    if (!w.modelAnswer || w.modelAnswer.trim().length < 10) {
      errors.push(`Written question #${i + 1} is missing a model answer.`);
    }
    if (!Array.isArray(w.markingPoints) || w.markingPoints.length < 2) {
      errors.push(`Written question #${i + 1} requires structured marking points.`);
    }
  });

  const seenCases = new Set<string>();
  bank.clinicalCases.forEach((c, i) => {
    const key = normalizeStemKey(`${c.title} ${c.patientPresentation}`);
    if (!key) {
      errors.push(`Clinical case #${i + 1} has empty presentation.`);
    } else if (seenCases.has(key)) {
      duplicateCount++;
      errors.push(`Duplicate Clinical case at #${i + 1}.`);
    } else {
      seenCases.add(key);
    }
    if (!Array.isArray(c.progressiveQuestions) || c.progressiveQuestions.length < 3) {
      errors.push(
        `Clinical case #${i + 1} requires at least 3 progressive sub-questions.`
      );
    }
  });

  return {
    valid: errors.length === 0,
    mcqCount: bank.mcqs.length,
    writtenCount: bank.writtenQuestions.length,
    caseCount: bank.clinicalCases.length,
    duplicateCount,
    errors,
  };
}

function buildDefaultCalloutPins(
  guide: StudyGuide,
  discipline: IntegratedScienceDisciplineId,
  canonical: CanonicalTopicDescriptor
): InfographicCalloutPin[] {
  const existingCallouts = (guide.anatomicalDiagram?.callouts || []).filter(
    (c) =>
      !detectConflictingTopicHijack(
        `${c.structureName} ${c.normalRole} ${c.pathologicalChange}`,
        c.structureName,
        canonical
      ).hijacked
  );

  if (
    existingCallouts.length >= 3 &&
    (discipline === 'anatomy' ||
      discipline === 'physiology' ||
      discipline === 'clinical_correlations')
  ) {
    return existingCallouts.slice(0, 4).map((c, idx) => ({
      number: idx + 1,
      label: c.structureName,
      detail:
        discipline === 'physiology'
          ? c.normalRole
          : `${c.normalRole} -> ${c.pathologicalChange}`,
      xPct: c.xPercent,
      yPct: c.yPercent,
    }));
  }

  if (
    discipline === 'anatomy' ||
    discipline === 'physiology' ||
    discipline === 'clinical_correlations'
  ) {
    return canonical.domainProfile.defaultLandmarks.slice(0, 4);
  }

  if (discipline === 'pharmacology') {
    const drugRows = canonical.domainProfile.firstLineDrugRowsTemplate(
      canonical.canonicalTitle
    );
    if (drugRows.length >= 2) {
      return drugRows.slice(0, 4).map((dr, idx) => ({
        number: idx + 1,
        label: dr.drugClass.slice(0, 44),
        detail: `${dr.prototypeAgents}: ${dr.mechanismOfAction}`,
        xPct: 24 + idx * 18,
        yPct: 28 + (idx % 2) * 32,
      }));
    }
  }

  if (discipline === 'immunology') {
    return [
      {
        number: 1,
        label: `Innate / Antigen Recognition in ${canonical.canonicalTitle}`,
        detail: 'Pathogen or autoantigen recognition initiating localized immune signaling.',
        xPct: 22,
        yPct: 38,
      },
      {
        number: 2,
        label: 'Effector Lymphocyte Polarization',
        detail: 'T-cell and costimulatory cytokine signaling shaping tissue inflammation.',
        xPct: 38,
        yPct: 68,
      },
      {
        number: 3,
        label: 'Humoral / Antibody-Mediated Pathway',
        detail: 'Specific antibody or immune-complex interactions within target tissue.',
        xPct: 64,
        yPct: 46,
      },
      {
        number: 4,
        label: 'Cytokine & Tissue Remodeling Response',
        detail: `Downstream inflammatory mediator effects characteristic of ${canonical.canonicalTitle}.`,
        xPct: 82,
        yPct: 64,
      },
    ];
  }

  if (discipline === 'pathology') {
    return [
      {
        number: 1,
        label: `Normal ${canonical.domainProfile.anatomicalRegionLabel.split(',')[0]}`,
        detail: canonical.domainProfile.normalHistologyNote,
        xPct: 26,
        yPct: 44,
      },
      {
        number: 2,
        label: 'Mucosal / Parenchymal Injury Zone',
        detail: canonical.domainProfile.pathophysiologySummaryTemplate(canonical.canonicalTitle),
        xPct: 52,
        yPct: 50,
      },
      {
        number: 3,
        label: `Characteristic ${canonical.canonicalTitle} Lesion`,
        detail: canonical.domainProfile.pathologicalHistologyTemplate(canonical.canonicalTitle),
        xPct: 76,
        yPct: 44,
      },
      {
        number: 4,
        label: 'Vascular / Structural Complication Locus',
        detail: canonical.domainProfile.diagnosticGoldStandardTemplate(canonical.canonicalTitle),
        xPct: 74,
        yPct: 74,
      },
    ];
  }

  return canonical.domainProfile.defaultLandmarks.slice(0, 4);
}

function buildCompiledIntegratedDisciplines(
  guide: StudyGuide,
  canonical: CanonicalTopicDescriptor
): IntegratedDisciplineBlock[] {
  const topicTitle = canonical.canonicalTitle;
  const corpusHint = [
    guide.summary,
    ...guide.sections.map((s) => `${s.heading} ${s.content}`),
  ].join(' ');

  const relevantIds = selectRelevantDisciplinesForTopic(topicTitle, corpusHint);
  const hasVerifiedBook =
    guide.coverage !== 'none' && guide.referencedPages.length > 0;

  return relevantIds.map((discId, idx) => {
    const meta = DISCIPLINE_META[discId];

    const matchedSection =
      guide.sections.find((s) => {
        const h = `${s.stepPhase || ''} ${s.heading}`.toLowerCase();
        if (discId === 'anatomy' || discId === 'physiology') {
          return /physiolog|basic|foundation|anatom|mucosal|baseline/i.test(h);
        }
        if (discId === 'pathophysiology' || discId === 'pathology') {
          return /pathophysiolog|mechanism|patholog|cascade/i.test(h);
        }
        if (discId === 'pharmacology') {
          return /management|therap|pharmacol|treatment|eradication/i.test(h);
        }
        if (discId === 'clinical_correlations') {
          return /clinical|presentation|diagnos|investigation|differential/i.test(h);
        }
        return false;
      }) || guide.sections[idx % Math.max(1, guide.sections.length)];

    const secPages =
      matchedSection &&
      matchedSection.sourceBasis === 'textbook' &&
      matchedSection.pageNumbers.length > 0
        ? matchedSection.pageNumbers
        : [];

    const prov = sanitizeProvenanceForGuide(
      secPages.length > 0 && (discId !== 'immunology' || hasVerifiedBook)
        ? 'textbook'
        : 'general_medical_knowledge',
      secPages,
      guide
    );

    const terms =
      matchedSection?.termDefinitions && matchedSection.termDefinitions.length > 0
        ? matchedSection.termDefinitions.map((t) => ({
            term: t.term,
            definition: t.simpleExplanation,
          }))
        : canonical.domainProfile.defaultLandmarks.slice(0, 2).map((lm) => ({
            term: lm.label,
            definition: lm.detail,
          }));

    const domainFallbackExplanation =
      discId === 'anatomy'
        ? `Anatomical locus: ${canonical.domainProfile.anatomicalRegionLabel}. ${canonical.domainProfile.normalBaselineSummary}`
        : discId === 'physiology'
          ? canonical.domainProfile.normalBaselineSummary
          : discId === 'pathology'
            ? `${canonical.domainProfile.normalHistologyNote} ${canonical.domainProfile.pathologicalHistologyTemplate(topicTitle)}`
            : discId === 'pathophysiology'
              ? canonical.domainProfile.pathophysiologySummaryTemplate(topicTitle)
              : discId === 'pharmacology'
                ? canonical.domainProfile
                    .firstLineDrugRowsTemplate(topicTitle)
                    .map(
                      (r) =>
                        `${r.drugClass} (${r.prototypeAgents}): ${r.mechanismOfAction} ${r.clinicalIndications}`
                    )
                    .join(' ')
                : `${canonical.domainProfile.diagnosticGoldStandardTemplate(topicTitle)} ${canonical.domainProfile.differentialSummaryTemplate(topicTitle)}`;

    const keyPoints =
      matchedSection?.quickSummaryPoints && matchedSection.quickSummaryPoints.length > 0
        ? matchedSection.quickSummaryPoints
        : [
            matchedSection?.keyTakeaway || domainFallbackExplanation,
            canonical.domainProfile.diagnosticGoldStandardTemplate(topicTitle),
          ];

    let drugRows: DrugComparisonRow[] | undefined;
    if (discId === 'pharmacology') {
      drugRows = canonical.domainProfile.firstLineDrugRowsTemplate(topicTitle);
    }

    return {
      id: `disc-${discId}`,
      discipline: discId,
      disciplineLabel: meta.label,
      title: `${meta.shortTag}: ${topicTitle} (${canonical.domainProfile.anatomicalRegionLabel.split(',')[0]})`,
      relevanceSummary: `Explains how ${meta.shortTag.toLowerCase()} anchors clinical mastery of ${topicTitle}.`,
      detailedExplanation: matchedSection?.content || domainFallbackExplanation,
      keyPoints,
      highlightedTerms: terms,
      clinicalCorrelationPearl:
        matchedSection?.keyTakeaway ||
        guide.clinicalNotes[idx % Math.max(1, guide.clinicalNotes.length)]?.detail ||
        canonical.domainProfile.diagnosticGoldStandardTemplate(topicTitle),
      visualKind: meta.defaultVisualKind,
      visualTitle: `${meta.shortTag} Schematic — ${topicTitle}`,
      visualCaption:
        discId === 'pathology'
          ? `Side-by-side tissue comparison contrasting normal architecture with ${topicTitle} pathology.`
          : discId === 'physiology'
            ? `Homeostatic regulatory curve illustrating mucosal/organ defense vs. injury in ${topicTitle}.`
            : `Topic-specific ${meta.shortTag.toLowerCase()} schematic for ${topicTitle} (${canonical.domainProfile.anatomicalRegionLabel}).`,
      calloutPins: buildDefaultCalloutPins(guide, discId, canonical),
      normalComparisonNote:
        discId === 'pathology'
          ? canonical.domainProfile.normalHistologyNote
          : canonical.domainProfile.normalBaselineSummary,
      pathologicalComparisonNote:
        discId === 'pathology'
          ? canonical.domainProfile.pathologicalHistologyTemplate(topicTitle)
          : canonical.domainProfile.pathophysiologySummaryTemplate(topicTitle),
      curveAxisX: canonical.domainProfile.curveAxisX,
      curveAxisY: canonical.domainProfile.curveAxisY,
      drugComparisonRows: drugRows,
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
      supportingQuote:
        prov.sourceBasis === 'textbook' ? matchedSection?.supportingQuote : undefined,
    };
  });
}

function buildDeterministicTopUpMcqs(
  guide: StudyGuide,
  existingMcqs: QuestionBankMcq[],
  targetTotal = 30,
  canonical: CanonicalTopicDescriptor = canonicalizeMedicalTopic(guide.topic)
): QuestionBankMcq[] {
  const result: QuestionBankMcq[] = [...existingMcqs];
  const seenStems = new Set<string>(result.map((m) => normalizeStemKey(m.stem)));

  const pushCandidate = (candidate: Omit<QuestionBankMcq, 'id' | 'number'>) => {
    if (result.length >= targetTotal) return;
    const key = normalizeStemKey(candidate.stem);
    if (!key || seenStems.has(key)) return;
    const alignCheck = isAssessmentItemAlignedWithTopic(
      `${candidate.stem} ${candidate.options.join(' ')} ${candidate.explanation}`,
      undefined,
      canonical
    );
    if (!alignCheck.aligned) return;
    seenStems.add(key);
    const num = result.length + 1;
    result.push({
      ...candidate,
      id: `qb-mcq-${num}`,
      number: num,
    });
  };

  // 1. Seed from existing guide.mcqs first (only if aligned with canonical topic)
  for (const m of guide.mcqs || []) {
    if (Array.isArray(m.options) && m.options.length >= 4) {
      const prov = sanitizeProvenanceForGuide(m.sourceBasis, m.pageNumbers, guide);
      pushCandidate({
        difficulty: 'Clinical Application',
        discipline: 'Clinical Medicine',
        stem: m.question,
        options: m.options.slice(0, 5),
        correctIndex: Math.min(m.options.length - 1, Math.max(0, m.correctIndex)),
        explanation: m.explanation,
        sourceBasis: prov.sourceBasis,
        pageNumbers: prov.pageNumbers,
        bookCitations: prov.bookCitations,
      });
    }
  }

  // 1B. Domain-specific pharmacology & landmark questions anchored to canonical topic
  canonical.domainProfile
    .firstLineDrugRowsTemplate(canonical.canonicalTitle)
    .forEach((drug, dIdx) => {
      const pos = dIdx % 4;
      const opts = [
        'Irreversible blockade of skeletal muscle nicotinic acetylcholine receptors at the motor endplate',
        'Selective inhibition of distal convoluted tubule thiazide-sensitive Na+/Cl- cotransporters',
        'Direct activation of central medullary opioid mu-receptors without organ-specific effect',
      ];
      opts.splice(pos, 0, `${drug.mechanismOfAction} (${drug.prototypeAgents})`);
      pushCandidate({
        difficulty: 'Clinical Application',
        discipline: 'Pharmacology',
        stem: `When prescribing "${drug.drugClass}" (${drug.prototypeAgents}) in the management of ${canonical.canonicalTitle}, which mechanism of action accounts for its therapeutic efficacy?`,
        options: opts,
        correctIndex: pos,
        explanation: `${drug.drugClass} (${drug.prototypeAgents}): ${drug.mechanismOfAction} Clinical indication: ${drug.clinicalIndications} Safety: ${drug.adverseEffectsAndContraindications}`,
        sourceBasis: 'general_medical_knowledge',
        pageNumbers: [],
        bookCitations: [],
      });

      const advPos = (dIdx + 2) % 4;
      const advOpts = [
        'No clinical monitoring, pregnancy precautions, or drug-interaction checks are ever required',
        'Universally causes acute bilateral optic neuritis within 1 hour of a single oral dose',
        'Requires routine prophylactic splenectomy prior to initiating outpatient therapy',
      ];
      advOpts.splice(advPos, 0, drug.adverseEffectsAndContraindications);
      pushCandidate({
        difficulty: 'Critical Thinking',
        discipline: 'Pharmacology & Safety',
        stem: `A patient being treated for ${canonical.canonicalTitle} with ${drug.prototypeAgents} (${drug.drugClass}) requires counseling and monitoring for which clinically important adverse effect, precaution, or contraindication?`,
        options: advOpts,
        correctIndex: advPos,
        explanation: `Key safety pearl for ${drug.drugClass} in ${canonical.canonicalTitle}: ${drug.adverseEffectsAndContraindications}`,
        sourceBasis: 'general_medical_knowledge',
        pageNumbers: [],
        bookCitations: [],
      });
    });

  canonical.domainProfile.defaultLandmarks.forEach((lm, lIdx) => {
    const pos = (lIdx + 1) % 4;
    const opts = [
      'Serves exclusively as an auditory ossicle conducting tympanic vibrations',
      'Synthesizes pulmonary surfactant dipalmitoylphosphatidylcholine in type II pneumocytes',
      'Forms the blood-retinal pigment epithelial barrier in the posterior globe',
    ];
    opts.splice(pos, 0, lm.detail);
    pushCandidate({
      difficulty: 'Mechanism',
      discipline: 'Anatomy & Physiology',
      stem: `In the anatomical and pathophysiological study of ${canonical.canonicalTitle}, what is the clinical significance of "${lm.label}"?`,
      options: opts,
      correctIndex: pos,
      explanation: `In ${canonical.canonicalTitle}, ${lm.label}: ${lm.detail}`,
      sourceBasis: 'general_medical_knowledge',
      pageNumbers: [],
      bookCitations: [],
    });
  });

  // Gather knowledge atoms from the guide to generate non-duplicate, medically meaningful questions
  const allTerms = guide.sections.flatMap((s) =>
    (s.termDefinitions || []).map((td) => ({
      term: td.term,
      def: td.simpleExplanation,
      sec: s,
    }))
  );

  // 2. Term & Mechanism comprehension MCQs
  allTerms.forEach((item, idx) => {
    const otherDefs = allTerms
      .filter((_, j) => j !== idx)
      .map((x) => x.def)
      .slice(0, 3);
    while (otherDefs.length < 3) {
      otherDefs.push(
        otherDefs.length === 0
          ? `An incidental benign laboratory finding unrelated to ${guide.topic} progression`
          : otherDefs.length === 1
            ? `Complete irreversible cessation of basal cellular ATP synthesis in healthy resting tissue`
            : `Isolated congenital absence of peripheral baroreceptor reflex arcs`
      );
    }
    const correctPos = idx % 4;
    const opts = [...otherDefs];
    opts.splice(correctPos, 0, item.def);
    const prov = sanitizeProvenanceForGuide(
      item.sec.sourceBasis,
      item.sec.pageNumbers,
      guide
    );
    pushCandidate({
      difficulty: 'Foundational',
      discipline: 'Pathophysiology & Terminology',
      stem: `In the context of ${guide.topic}, which statement most accurately defines the medical concept "${item.term}"?`,
      options: opts.slice(0, 4),
      correctIndex: correctPos,
      explanation: `"${item.term}" specifically refers to: ${item.def}. Understanding this mechanism distinguishes true ${guide.topic} pathophysiology from unrelated distractors.`,
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
    });
  });

  // 3. Section-by-section Key Takeaway & Step Reasoning MCQs
  guide.sections.forEach((sec, sIdx) => {
    const prov = sanitizeProvenanceForGuide(sec.sourceBasis, sec.pageNumbers, guide);
    const takeaway = sec.keyTakeaway || sec.quickSummaryPoints?.[0] || sec.content.slice(0, 140);
    const correctPos = (sIdx + 1) % 4;
    const distractors = [
      `Delay all diagnostic assessment for ${guide.topic} until chronic fibrotic remodeling is complete`,
      `Rely exclusively on nonspecific constitutional symptoms without objective clinical or laboratory confirmation`,
      `Discontinue monitoring immediately after a single borderline vital-sign measurement`,
    ];
    const opts = [...distractors];
    opts.splice(correctPos, 0, takeaway);

    pushCandidate({
      difficulty: sIdx < 2 ? 'Mechanism' : 'Clinical Application',
      discipline: sec.stepPhase || 'Clinical Medicine',
      stem: `When evaluating "${sec.heading.replace(/^0?\d+[.)\s-]+/, '')}" in a patient being assessed for ${guide.topic}, which principle represents the primary evidence-grounded takeaway?`,
      options: opts,
      correctIndex: correctPos,
      explanation: `Core principle for ${sec.heading}: ${takeaway}`,
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
    });

    // Also generate bullet-based mechanism questions from quickSummaryPoints
    (sec.quickSummaryPoints || []).forEach((pt, pIdx) => {
      const pos = (sIdx + pIdx) % 4;
      const d = [
        `Suppresses normal physiological compensation without addressing the underlying etiology of ${guide.topic}`,
        `Represents an unrelated physiological reflex confined strictly to healthy neonatal development`,
        `Contraindicates all targeted diagnostic workup in symptomatic patients`,
      ];
      const o = [...d];
      o.splice(pos, 0, pt);
      pushCandidate({
        difficulty: pIdx % 2 === 0 ? 'Mechanism' : 'Critical Thinking',
        discipline: sec.stepPhase || 'Integrated Sciences',
        stem: `Regarding ${sec.heading.replace(/^0?\d+[.)\s-]+/, '')} in ${guide.topic} (focus ${pIdx + 1}), which clinical or physiological statement is accurate?`,
        options: o,
        correctIndex: pos,
        explanation: `Verified clinical point: ${pt}. (${sec.keyTakeaway})`,
        sourceBasis: prov.sourceBasis,
        pageNumbers: prov.pageNumbers,
        bookCitations: prov.bookCitations,
      });
    });
  });

  // 4. Clinical Notes (Red Flags, Pearls, Diagnostic Pitfalls, Protocols)
  (guide.clinicalNotes || []).forEach((note, nIdx) => {
    const prov = sanitizeProvenanceForGuide(note.sourceBasis, note.pageNumbers, guide);
    const pos = (nIdx + 2) % 4;
    const d = [
      'Discharge the patient immediately without follow-up or reassessment of clinical stability',
      'Attribute acute deterioration solely to benign test variability without repeating focused evaluation',
      'Administer empiric high-dose therapy contraindicated in acute hemodynamic instability',
    ];
    const opts = [...d];
    opts.splice(pos, 0, note.detail);
    pushCandidate({
      difficulty: note.category === 'Red Flag' ? 'Critical Thinking' : 'Clinical Application',
      discipline: note.category,
      stem: `A clinician reviewing "${note.title}" (${note.category}) during management of ${guide.topic} should prioritize which action or clinical recognition?`,
      options: opts,
      correctIndex: pos,
      explanation: `${note.category} — ${note.title}: ${note.detail}`,
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
    });
  });

  // 5. Anatomical / Physiological Callout Pin Questions
  (guide.anatomicalDiagram?.callouts || []).forEach((callout, cIdx) => {
    const prov = sanitizeProvenanceForGuide(
      callout.sourceBasis,
      callout.pageNumbers,
      guide
    );
    const pos = cIdx % 4;
    const correctText = `${callout.pathologicalChange} (contrasting with normal role: ${callout.normalRole})`;
    const d = [
      `Complete resistance to any hemodynamic, metabolic, or inflammatory stress in ${guide.topic}`,
      `Spontaneous regeneration of embryonic stem-cell architecture within minutes of acute insult`,
      `Selective absence of blood supply or receptor expression under physiological conditions`,
    ];
    const opts = [...d];
    opts.splice(pos, 0, correctText);
    pushCandidate({
      difficulty: 'Mechanism',
      discipline: 'Anatomy & Pathophysiology',
      stem: `In ${guide.topic}, how is "${callout.structureName}" characteristically altered compared with its normal physiological baseline?`,
      options: opts,
      correctIndex: pos,
      explanation: `Normally, ${callout.structureName} functions in: ${callout.normalRole}. In ${guide.topic}, pathological remodeling manifests as: ${callout.pathologicalChange}.`,
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
    });
  });

  // 6. Comparison Table Differential / Pharmacology Questions
  if (guide.comparisonTable && guide.comparisonTable.columns.length >= 2) {
    const tbl = guide.comparisonTable;
    const prov = sanitizeProvenanceForGuide(tbl.sourceBasis, tbl.pageNumbers, guide);
    tbl.rows.forEach((row, rIdx) => {
      tbl.columns.forEach((colName, cIdx) => {
        const targetCell = row.cells[cIdx];
        if (!targetCell) return;
        const otherCells = tbl.columns
          .filter((_, j) => j !== cIdx)
          .map((_, j) => row.cells[j])
          .filter(Boolean);
        while (otherCells.length < 3) {
          otherCells.push(
            `No clinically measurable change in ${row.feature.toLowerCase()} across any stage of disease`
          );
        }
        const pos = (rIdx + cIdx) % 4;
        const opts = otherCells.slice(0, 3);
        opts.splice(pos, 0, targetCell);
        pushCandidate({
          difficulty: 'Clinical Application',
          discipline: 'Differential Diagnosis & Therapeutics',
          stem: `When comparing clinical subtypes or interventions in "${tbl.title}", which "${row.feature}" profile characterizes "${colName}"?`,
          options: opts,
          correctIndex: pos,
          explanation: `In ${tbl.title}, "${colName}" is distinguished by ${row.feature}: ${targetCell}.`,
          sourceBasis: prov.sourceBasis,
          pageNumbers: prov.pageNumbers,
          bookCitations: prov.bookCitations,
        });
      });
    });
  }

  // 7. MindMap & Flowchart Causal Reasoning Questions
  (guide.mindMap?.nodes || []).forEach((node, mIdx) => {
    const prov = sanitizeProvenanceForGuide(node.sourceBasis, node.pageNumbers, guide);
    const pos = mIdx % 4;
    const opts = [
      'Unrelated incidental finding that excludes the primary diagnosis',
      'Physiologically inert bystander pathway with zero clinical relevance',
      'Late post-recovery artifact seen only decades after complete resolution',
    ];
    opts.splice(pos, 0, node.summary);
    pushCandidate({
      difficulty: mIdx % 2 === 0 ? 'Foundational' : 'Mechanism',
      discipline: node.category.charAt(0).toUpperCase() + node.category.slice(1),
      stem: `Within the conceptual framework of ${guide.topic}, which statement best explains the role of "${node.label}" (${node.relationLabel})?`,
      options: opts,
      correctIndex: pos,
      explanation: `"${node.label}" (${node.category}) connects to ${guide.topic} via "${node.relationLabel}": ${node.summary}`,
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
    });
  });

  // 8. Guaranteed distinct clinical-reasoning facets if still under 30
  const clinicalFacets: Array<{
    diff: QuestionDifficultyTier;
    disc: string;
    stem: string;
    correct: string;
    distractors: string[];
    exp: string;
  }> = [
    {
      diff: 'Foundational',
      disc: 'Physiology',
      stem: `Why is understanding normal baseline physiology essential before interpreting pathophysiological findings in ${guide.topic}?`,
      correct: `Compensatory homeostatic mechanisms define which clinical signs appear early versus during decompensation in ${guide.topic}`,
      distractors: [
        'Normal physiology is identical to end-stage organ failure in all measurable biomarkers',
        'Pathophysiological cascades occur without altering any baseline cellular or hemodynamic parameter',
        'Laboratory reference intervals are unrelated to underlying physiological homeostasis',
      ],
      exp: `Baseline physiological reserve explains early compensation versus overt clinical decompensation in ${guide.topic}.`,
    },
    {
      diff: 'Mechanism',
      disc: 'Pathophysiology',
      stem: `Which causal sequence best characterizes progression from initial insult to clinical manifestation in ${guide.topic}?`,
      correct: 'Primary trigger -> compensatory homeostatic activation -> maladaptive stress / end-organ dysfunction -> cardinal clinical signs',
      distractors: [
        'Spontaneous symptom resolution -> primary trigger -> absence of cellular signaling',
        'Isolated genetic polymorphism -> immediate tissue necrosis without physiological signaling',
        'Random biomarker fluctuation -> zero end-organ involvement -> chronic asymptomatic state',
      ],
      exp: `Decompensation in ${guide.topic} follows exhaustion or maladaptation of initial homeostatic responses.`,
    },
    {
      diff: 'Clinical Application',
      disc: 'Diagnostics',
      stem: `When ordering diagnostic investigations for suspected ${guide.topic}, what is the most appropriate clinical strategy?`,
      correct: 'Integrate bedside history and focused physical examination with high-yield confirmatory laboratory/imaging studies while ruling out life-threatening mimics',
      distractors: [
        'Order invasive tissue biopsy first in every hemodynamically unstable patient before checking vital signs',
        'Defer all objective diagnostic testing until empirical long-term therapy has been completed for 6 months',
        'Rely on a single nonspecific inflammatory marker in isolation to confirm the definitive diagnosis',
      ],
      exp: `Pre-test probability from bedside assessment combined with targeted confirmatory studies ensures timely, accurate diagnosis of ${guide.topic}.`,
    },
    {
      diff: 'Clinical Application',
      disc: 'Differential Diagnosis',
      stem: `What is the primary clinical purpose of constructing a structured differential diagnosis when evaluating features suggestive of ${guide.topic}?`,
      correct: 'To systematically exclude acute high-morbidity conditions sharing overlapping presentations before finalizing targeted therapy',
      distractors: [
        'To delay acute stabilization in unstable patients until rare genetic syndromes are sequenced',
        'To administer simultaneous therapies for five mutually exclusive diagnoses indefinitely',
        'To replace serial bedside reassessment with a one-time admission label',
      ],
      exp: 'Structured differential reasoning prevents premature closure and missed life-threatening mimics.',
    },
    {
      diff: 'Clinical Application',
      disc: 'Pharmacology',
      stem: `Before initiating pharmacotherapy for ${guide.topic}, which safety verification is essential?`,
      correct: 'Verify hemodynamic stability, renal/hepatic clearance, baseline electrolytes, and patient-specific contraindications',
      distractors: [
        'Administer maximum maintenance doses simultaneously without checking blood pressure or lab values',
        'Ignore concurrent medications because drug-drug interactions do not occur in acute care',
        'Withhold all monitoring once the initial prescription is written',
      ],
      exp: 'Safe therapeutic prescribing requires matching mechanism of action to patient-specific organ clearance, electrolytes, and hemodynamic thresholds.',
    },
    {
      diff: 'Critical Thinking',
      disc: 'Acute Stabilization',
      stem: `A patient with ${guide.topic} develops acute clinical deterioration. Which immediate priority takes precedence?`,
      correct: 'Reassess airway, breathing, circulation, and perfusion while identifying reversible acute precipitants or treatment complications',
      distractors: [
        'Postpone bedside evaluation until routine outpatient clinic follow-up next month',
        'Continue the current regimen unchanged without repeating vital signs or targeted labs',
        'Order purely cosmetic or non-urgent screening studies before stabilizing vital organ perfusion',
      ],
      exp: 'Acute decompensation mandates immediate ABC/hemodynamic reassessment and search for reversible precipitants.',
    },
    {
      diff: 'Critical Thinking',
      disc: 'Monitoring & Prognosis',
      stem: `Which longitudinal monitoring approach best reduces preventable readmission and complications in ${guide.topic}?`,
      correct: 'Track objective clinical response, serial target biomarkers, medication adherence/tolerability, and early warning red-flag symptoms',
      distractors: [
        'Discontinue all maintenance therapy immediately upon initial symptomatic improvement',
        'Avoid patient education regarding red-flag symptoms to prevent health anxiety',
        'Schedule laboratory monitoring only after irreversible end-organ damage has occurred',
      ],
      exp: 'Structured follow-up of clinical status, biomarkers, and medication safety prevents relapse and late complications.',
    },
    {
      diff: 'Foundational',
      disc: 'Evidence-Based Medicine',
      stem: `How should clinicians integrate textbook pathophysiology with current clinical practice guidelines when managing ${guide.topic}?`,
      correct: 'Use foundational pathophysiology to understand mechanisms and bedside signs while applying validated guideline thresholds for diagnostic and therapeutic decisions',
      distractors: [
        'Disregard validated clinical trials whenever mechanistic hypotheses alone suggest an untested intervention',
        'Apply population guidelines blindly without considering individual comorbidities or contraindications',
        'Treat every patient identically regardless of disease severity or hemodynamic profile',
      ],
      exp: 'Optimal clinical care unites mechanistic understanding with validated evidence-based protocols tailored to the patient.',
    },
  ];

  clinicalFacets.forEach((f, idx) => {
    const pos = idx % 4;
    const opts = [...f.distractors];
    opts.splice(pos, 0, f.correct);
    pushCandidate({
      difficulty: f.diff,
      discipline: f.disc,
      stem: f.stem,
      options: opts,
      correctIndex: pos,
      explanation: f.exp,
      sourceBasis: 'general_medical_knowledge',
      pageNumbers: [],
      bookCitations: [],
    });
  });

  // Final safety pad if an unusually sparse custom guide still needs a few items to hit 30
  let padCounter = 1;
  while (result.length < targetTotal) {
    const bullet =
      guide.quickRevisionBullets?.[padCounter % Math.max(1, (guide.quickRevisionBullets || []).length)] ||
      guide.summary;
    const pos = padCounter % 4;
    const opts = [
      `Contradicts established physiological mechanisms in ${guide.topic} (Scenario ${padCounter})`,
      `Applies only to unrelated surgical trauma rather than ${guide.topic}`,
      `Represents an obsolete practice superseded by modern physiological monitoring`,
    ];
    opts.splice(pos, 0, bullet);
    pushCandidate({
      difficulty: padCounter % 2 === 0 ? 'Clinical Application' : 'Critical Thinking',
      discipline: 'Integrated Clinical Review',
      stem: `Clinical Review Item ${result.length + 1} (${guide.topic}): Which statement accurately reflects high-yield clinical synthesis for this topic?`,
      options: opts,
      correctIndex: pos,
      explanation: `High-yield synthesis: ${bullet}`,
      sourceBasis: 'general_medical_knowledge',
      pageNumbers: [],
      bookCitations: [],
    });
    padCounter++;
    if (padCounter > 60) break;
  }

  return result.slice(0, targetTotal).map((m, idx) => ({
    ...m,
    id: `qb-mcq-${idx + 1}`,
    number: idx + 1,
  }));
}

function buildDeterministicWrittenQuestions(
  guide: StudyGuide,
  existingWritten: QuestionBankWrittenItem[],
  targetTotal = 10,
  canonical: CanonicalTopicDescriptor = canonicalizeMedicalTopic(guide.topic)
): QuestionBankWrittenItem[] {
  const result: QuestionBankWrittenItem[] = [...existingWritten];
  const seenPrompts = new Set<string>(result.map((w) => normalizeStemKey(w.prompt)));

  const templates: Array<{
    verb: WrittenCommandVerb;
    diff: QuestionDifficultyTier;
    disc: string;
    prompt: string;
    secIdx?: number;
    marks: number;
    points: Array<{ point: string; marks: number }>;
    answer: string;
  }> = [
    {
      verb: 'Explain',
      diff: 'Foundational',
      disc: 'Physiology & Pathophysiology',
      secIdx: 0,
      prompt: `Explain the normal baseline physiological regulation relevant to ${guide.topic} and describe how its disruption initiates disease pathophysiology.`,
      marks: 10,
      points: [
        { point: 'Defines baseline anatomical/cellular components and normal homeostatic control', marks: 3 },
        { point: 'Identifies primary initiating insult or trigger', marks: 3 },
        { point: 'Links failed or maladaptive compensation to early clinical manifestations', marks: 4 },
      ],
      answer:
        guide.sections[0]?.content ||
        `${guide.summary} Normal physiological homeostasis maintains target-organ perfusion and metabolic balance; disruption initiates compensatory neurohormonal/inflammatory pathways that eventually decompensate.`,
    },
    {
      verb: 'Describe',
      diff: 'Mechanism',
      disc: 'Pathophysiology',
      secIdx: 1,
      prompt: `Describe the step-by-step pathophysiological cascade of ${guide.topic}, highlighting causal arrows from cellular/organ injury to bedside physical signs.`,
      marks: 10,
      points: [
        { point: 'Outlines sequential upstream-to-downstream mechanistic steps accurately', marks: 4 },
        { point: 'Explains key cellular, receptor, or hemodynamic mediators', marks: 3 },
        { point: 'Correlates each pathophysiological derangement with specific bedside signs', marks: 3 },
      ],
      answer:
        guide.sections[1]?.content ||
        guide.anatomicalDiagram?.pathophysiologySummary ||
        guide.summary,
    },
    {
      verb: 'Enumerate',
      diff: 'Clinical Application',
      disc: 'Clinical Presentation',
      secIdx: 2,
      prompt: `Enumerate the cardinal symptoms, focused physical examination findings, and acute red-flag warning signs in a patient presenting with ${guide.topic}.`,
      marks: 10,
      points: [
        { point: 'Lists major presenting symptoms and pertinent clinical history', marks: 3 },
        { point: 'Identifies objective bedside examination signs', marks: 4 },
        { point: 'Highlights urgent red-flag features requiring immediate escalation', marks: 3 },
      ],
      answer:
        guide.sections[2]?.content ||
        (guide.clinicalNotes || []).map((n) => `${n.category} (${n.title}): ${n.detail}`).join(' ') ||
        guide.summary,
    },
    {
      verb: 'Clinical Work-up',
      diff: 'Clinical Application',
      disc: 'Diagnostics & Investigations',
      secIdx: 3,
      prompt: `Outline a prioritized diagnostic work-up for suspected ${guide.topic}, specifying first-line laboratory/imaging investigations and their expected findings.`,
      marks: 10,
      points: [
        { point: 'Prioritizes initial bedside & rapid point-of-care tests', marks: 3 },
        { point: 'Specifies confirmatory laboratory biomarkers and imaging modalities', marks: 4 },
        { point: 'Interprets diagnostic cutoffs and severity stratification markers', marks: 3 },
      ],
      answer:
        guide.sections[3]?.content ||
        canonical.domainProfile.diagnosticGoldStandardTemplate(canonical.canonicalTitle),
    },
    {
      verb: 'Compare',
      diff: 'Clinical Application',
      disc: 'Differential Diagnosis',
      prompt: guide.comparisonTable
        ? `Compare and contrast ${guide.comparisonTable.columns.join(' versus ')} (${guide.comparisonTable.title}) across mechanism, clinical presentation, diagnostic findings, and first-line management.`
        : `Compare ${canonical.canonicalTitle} with its key clinical differentials in terms of underlying mechanism, distinguishing bedside/diagnostic features, and initial management.`,
      marks: 10,
      points: [
        { point: 'Contrasts underlying pathophysiological mechanisms clearly', marks: 3 },
        { point: 'Distinguishes key clinical and diagnostic features', marks: 4 },
        { point: 'Contrasts first-line therapeutic priorities and contraindications', marks: 3 },
      ],
      answer: guide.comparisonTable
        ? guide.comparisonTable.rows
            .map(
              (r) =>
                `${r.feature}: ${guide.comparisonTable!.columns
                  .map((col, idx) => `${col} = ${r.cells[idx] || '-'}`)
                  .join('; ')}`
            )
            .join('. ')
        : canonical.domainProfile.differentialSummaryTemplate(canonical.canonicalTitle),
    },
    {
      verb: 'Discuss',
      diff: 'Clinical Application',
      disc: 'Pharmacology & Therapeutics',
      secIdx: 4,
      prompt: `Discuss the pharmacological and non-pharmacological management of ${canonical.canonicalTitle}, including drug classes, mechanisms of action, contraindications, and monitoring parameters.`,
      marks: 10,
      points: [
        { point: 'Details acute stabilization and supportive measures', marks: 3 },
        { point: 'Explains mechanisms of action and indications of first-line drug classes', marks: 4 },
        { point: 'Identifies major adverse effects, contraindications, and monitoring', marks: 3 },
      ],
      answer:
        guide.sections[4]?.content ||
        canonical.domainProfile
          .firstLineDrugRowsTemplate(canonical.canonicalTitle)
          .map(
            (d) =>
              `${d.drugClass} (${d.prototypeAgents}): ${d.mechanismOfAction} Indications: ${d.clinicalIndications} Safety: ${d.adverseEffectsAndContraindications}`
          )
          .join(' '),
    },
    {
      verb: 'Explain',
      diff: 'Mechanism',
      disc: 'Structural-Functional Correlation',
      prompt: `Explain how anatomical or histological changes in ${guide.anatomicalDiagram?.title || guide.topic} impair organ function and produce measurable clinical abnormalities.`,
      marks: 10,
      points: [
        { point: 'Describes key anatomical/microstructural landmarks involved', marks: 3 },
        { point: 'Explains pathological remodeling vs. normal baseline structure', marks: 4 },
        { point: 'Connects structural alteration to functional impairment', marks: 3 },
      ],
      answer: guide.anatomicalDiagram
        ? `Normal baseline: ${guide.anatomicalDiagram.normalPhysiologySummary} Pathophysiology: ${guide.anatomicalDiagram.pathophysiologySummary}`
        : guide.summary,
    },
    {
      verb: 'Describe',
      diff: 'Critical Thinking',
      disc: 'Complications & Risk Mitigation',
      prompt: `Describe the major acute and chronic complications of untreated or inadequately managed ${guide.topic}, and explain preventive clinical strategies.`,
      marks: 10,
      points: [
        { point: 'Identifies life-threatening acute complications and mechanisms', marks: 4 },
        { point: 'Describes long-term organ sequelae and prognostic factors', marks: 3 },
        { point: 'Outlines preventive monitoring and safety thresholds', marks: 3 },
      ],
      answer:
        (guide.clinicalNotes || [])
          .map((n) => `${n.title}: ${n.detail}`)
          .join(' ') ||
        `Preventing acute decompensation and chronic end-organ remodeling in ${guide.topic} requires timely diagnosis, guideline-directed therapy, and close serial monitoring.`,
    },
    {
      verb: 'Clinical Work-up',
      diff: 'Critical Thinking',
      disc: 'Acute Bedside Decision-Making',
      prompt: `Construct an emergency first-hour clinical algorithm for an acutely decompensating patient with ${guide.topic}, specifying critical decision nodes and safety gates.`,
      marks: 10,
      points: [
        { point: 'Establishes immediate ABC and hemodynamic stabilization priorities', marks: 3 },
        { point: 'Defines critical diagnostic/laboratory safety gates before high-risk interventions', marks: 4 },
        { point: 'Specifies escalation criteria for ICU or specialist intervention', marks: 3 },
      ],
      answer:
        guide.flowcharts?.[1]?.nodes.map((n) => n.label).join(' -> ') ||
        guide.sections[guide.sections.length - 1]?.keyTakeaway ||
        guide.summary,
    },
    {
      verb: 'Discuss',
      diff: 'Critical Thinking',
      disc: 'Longitudinal Care & Patient Counseling',
      prompt: `Discuss discharge readiness criteria, secondary prevention, medication safety counseling, and follow-up monitoring for a patient recovering from ${guide.topic}.`,
      marks: 10,
      points: [
        { point: 'Defines objective clinical and laboratory stability criteria prior to discharge', marks: 3 },
        { point: 'Outlines secondary prevention and maintenance regimen optimization', marks: 4 },
        { point: 'Specifies patient red-flag counseling and follow-up timeline', marks: 3 },
      ],
      answer:
        (guide.quickRevisionBullets || []).join(' ') ||
        `Safe transition of care in ${guide.topic} requires hemodynamic/metabolic stability, reconciled maintenance therapy, red-flag education, and scheduled biomarker reassessment.`,
    },
  ];

  for (const tpl of templates) {
    if (result.length >= targetTotal) break;
    const key = normalizeStemKey(tpl.prompt);
    if (seenPrompts.has(key)) continue;
    seenPrompts.add(key);

    const refSec =
      typeof tpl.secIdx === 'number' ? guide.sections[tpl.secIdx] : undefined;
    const prov = sanitizeProvenanceForGuide(
      refSec?.sourceBasis,
      refSec?.pageNumbers,
      guide
    );

    const num = result.length + 1;
    result.push({
      id: `qb-written-${num}`,
      number: num,
      commandVerb: tpl.verb,
      difficulty: tpl.diff,
      discipline: tpl.disc,
      prompt: tpl.prompt,
      totalMarks: tpl.marks,
      markingPoints: tpl.points,
      modelAnswer: tpl.answer,
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
    });
  }

  return result.slice(0, targetTotal).map((w, idx) => ({
    ...w,
    id: `qb-written-${idx + 1}`,
    number: idx + 1,
  }));
}

function buildDeterministicClinicalCases(
  guide: StudyGuide,
  existingCases: QuestionBankClinicalCase[],
  targetTotal = 8,
  canonical: CanonicalTopicDescriptor = canonicalizeMedicalTopic(guide.topic)
): QuestionBankClinicalCase[] {
  const result: QuestionBankClinicalCase[] = [...existingCases];
  const seenCases = new Set<string>(
    result.map((c) => normalizeStemKey(`${c.title} ${c.patientPresentation}`))
  );

  // 1. Convert any existing guide.clinicalCases into rich progressive 4-part cases first
  for (const cs of guide.clinicalCases || []) {
    if (result.length >= targetTotal) break;
    const key = normalizeStemKey(`${cs.title} ${cs.patientPresentation}`);
    if (!key || seenCases.has(key)) continue;
    seenCases.add(key);

    const prov = sanitizeProvenanceForGuide(cs.sourceBasis, cs.pageNumbers, guide);
    const parsedVitals: CaseVitalOrLabEntry[] = cs.vitalsAndLabs
      .split(/[;|,]+/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((entry) => {
        const colonIdx = entry.indexOf(':');
        if (colonIdx > 0) {
          return {
            parameter: entry.slice(0, colonIdx).trim(),
            value: entry.slice(colonIdx + 1).trim(),
            flag: 'high' as const,
          };
        }
        return {
          parameter: 'Clinical Finding',
          value: entry,
          flag: 'high' as const,
        };
      });

    const num = result.length + 1;
    result.push({
      id: `qb-case-${num}`,
      number: num,
      title: cs.title,
      difficulty: 'Clinical Application',
      patientPresentation: cs.patientPresentation,
      vitalsAndLabs:
        parsedVitals.length > 0
          ? parsedVitals
          : [{ parameter: 'Bedside Assessment', value: cs.vitalsAndLabs, flag: 'high' }],
      progressiveQuestions: [
        {
          partLabel: 'Part A',
          focusArea: 'Diagnosis',
          question: cs.promptQuestion || `What is the most likely primary diagnosis and immediate clinical impression?`,
          modelAnswer: cs.idealWorkupAndDiagnosis,
          rationale: `Clinical presentation and bedside data point directly toward ${guide.topic}.`,
        },
        {
          partLabel: 'Part B',
          focusArea: 'Investigations',
          question: 'Which targeted laboratory or imaging investigations should be prioritized to confirm severity and identify precipitants?',
          modelAnswer: cs.idealWorkupAndDiagnosis,
          rationale: 'Confirmatory work-up stratifies end-organ involvement and excludes acute mimics.',
        },
        {
          partLabel: 'Part C',
          focusArea: 'Management',
          question: 'Outline the immediate stepwise therapeutic plan and key safety monitoring parameters.',
          modelAnswer: cs.managementPlan,
          rationale: cs.clinicalPearl,
        },
        {
          partLabel: 'Part D',
          focusArea: 'Complications',
          question: 'What critical pitfall or treatment-related complication must be actively prevented during the first 24 hours?',
          modelAnswer: cs.clinicalPearl,
          rationale: 'Anticipating iatrogenic or disease-related decompensation improves survival.',
        },
      ],
      clinicalPearl: cs.clinicalPearl,
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
    });
  }

  const topicTitle = canonical.canonicalTitle;
  const primaryDrugs = canonical.domainProfile.firstLineDrugRowsTemplate(topicTitle);
  const primaryDrugLabel = primaryDrugs[0]
    ? `${primaryDrugs[0].drugClass} (${primaryDrugs[0].prototypeAgents})`
    : `guideline-directed therapy for ${topicTitle}`;

  // 2. Diverse organ-aligned clinical scenarios (zero cardiopulmonary dyspnea/SpO2 boilerplate on non-cardiopulmonary topics!)
  const archetypes: Array<{
    title: string;
    diff: QuestionDifficultyTier;
    presentation: string;
    vitals: CaseVitalOrLabEntry[];
    parts: CaseProgressiveSubQuestion[];
    pearl: string;
  }> = [
    {
      title: `Classic Acute Presentation of ${topicTitle}`,
      diff: 'Clinical Application',
      presentation: `A 58-year-old patient presents for urgent evaluation with progressive cardinal manifestations of ${topicTitle} involving the ${canonical.domainProfile.anatomicalRegionLabel.toLowerCase()}. Focused history reveals classic precipitating risk factors and suboptimal prior therapy.`,
      vitals: canonical.domainProfile.defaultVitalsAndLabs,
      parts: [
        {
          partLabel: 'Part A',
          focusArea: 'Diagnosis',
          question: `Based on the clinical presentation and objective laboratory/vital trends, what is the leading diagnosis and core pathophysiological mechanism?`,
          modelAnswer: `${topicTitle}. ${canonical.domainProfile.pathophysiologySummaryTemplate(topicTitle)}`,
          rationale: `Clinical signs and domain-specific biomarkers directly reflect active ${topicTitle} pathophysiology.`,
        },
        {
          partLabel: 'Part B',
          focusArea: 'Differential Diagnosis',
          question: `List the key differential diagnoses that must be distinguished from ${topicTitle} and how to confirm the diagnosis.`,
          modelAnswer: `${canonical.domainProfile.differentialSummaryTemplate(topicTitle)} Confirmatory work-up: ${canonical.domainProfile.diagnosticGoldStandardTemplate(topicTitle)}`,
          rationale: 'Targeted confirmatory diagnostics separate true disease from overlapping anatomical mimics.',
        },
        {
          partLabel: 'Part C',
          focusArea: 'Management',
          question: `Formulate the first-line stabilization and targeted pharmacological plan for ${topicTitle}.`,
          modelAnswer: `Initiate ${primaryDrugLabel}: ${primaryDrugs[0]?.clinicalIndications || guide.summary}`,
          rationale: 'Early physiological stabilization paired with mechanism-specific therapy halts progression.',
        },
      ],
      pearl:
        guide.clinicalNotes[0]?.detail ||
        canonical.domainProfile.diagnosticGoldStandardTemplate(topicTitle),
    },
    {
      title: `Severe Acute Complication & Hemodynamic Instability in ${topicTitle}`,
      diff: 'Critical Thinking',
      presentation: `A 67-year-old patient with untreated ${topicTitle} arrives pale, tachycardic, and hypotensive after 48 hours of acute clinical worsening and missed follow-up.`,
      vitals: canonical.domainProfile.decompensatedVitalsAndLabs,
      parts: [
        {
          partLabel: 'Part A',
          focusArea: 'Interpretation',
          question: `Interpret the hemodynamic and laboratory severity markers in this decompensated presentation of ${topicTitle}.`,
          modelAnswer: `Hypotension and critical severity markers signify life-threatening complication/decompensation of ${topicTitle} requiring immediate resuscitation and urgent definitive intervention.`,
          rationale: 'Hemodynamic instability takes immediate priority before elective testing.',
        },
        {
          partLabel: 'Part B',
          focusArea: 'Investigations',
          question: `Which urgent diagnostic and imaging/endoscopic evaluations are indicated once resuscitation is underway?`,
          modelAnswer: canonical.domainProfile.diagnosticGoldStandardTemplate(topicTitle),
          rationale: 'Identifies the exact anatomical source of decompensation and guides definitive therapy.',
        },
        {
          partLabel: 'Part C',
          focusArea: 'Management',
          question: `Outline emergency stabilization and targeted therapy for complicated ${topicTitle}.`,
          modelAnswer: `Establish two large-bore IV lines, restore intravascular perfusion, discontinue offending triggers, and administer ${primaryDrugLabel} alongside specialist intervention.`,
          rationale: 'Resuscitation + etiology-directed therapy prevents shock-related mortality.',
        },
      ],
      pearl: `In complicated ${topicTitle}, always stabilize ABCs and intravascular perfusion before procedural or imaging transfer.`,
    },
    {
      title: `Diagnostic Mimic & Differential Reasoning Around ${guide.topic}`,
      diff: 'Clinical Application',
      presentation: `A 44-year-old patient presents with subacute symptoms overlapping with ${guide.topic}, but initial empirical treatment at an urgent care clinic produced zero improvement.`,
      vitals: [
        { parameter: 'Temperature', value: '37.9 C', referenceRange: '36.5-37.3 C', flag: 'high' },
        { parameter: 'Blood Pressure', value: '132/82 mmHg', referenceRange: '90-120/60-80 mmHg', flag: 'normal' },
        { parameter: 'Inflammatory / Organ Panel', value: 'Discordant with uncomplicated baseline', flag: 'high' },
      ],
      parts: [
        {
          partLabel: 'Part A',
          focusArea: 'Differential Diagnosis',
          question: `Why does failure to respond to initial empirical therapy mandate reconsidering the diagnosis of ${guide.topic}?`,
          modelAnswer: 'Non-response suggests either an alternative mimicking pathology, an unrecognized complication, or inadequate targeting of the true mechanism.',
          rationale: 'Avoiding anchoring bias is critical when clinical trajectory diverges from expected recovery.',
        },
        {
          partLabel: 'Part B',
          focusArea: 'Investigations',
          question: 'Which discriminatory diagnostic tests definitively separate true disease from its closest mimics?',
          modelAnswer: guide.sections[3]?.content || `Perform gold-standard confirmatory biomarker and imaging studies specific to ${guide.topic}.`,
          rationale: 'High-specificity tests resolve diagnostic ambiguity.',
        },
        {
          partLabel: 'Part C',
          focusArea: 'Management',
          question: 'Once confirmed, how should therapy be tailored?',
          modelAnswer: `Transition from empiric symptomatic care to mechanism-specific guideline therapy for ${guide.topic}.`,
          rationale: 'Targeted therapy addresses root pathophysiology rather than masking symptoms.',
        },
      ],
      pearl: guide.clinicalNotes[1]?.detail || 'Re-evaluate the primary diagnosis whenever a patient fails to improve on expected therapy.',
    },
    {
      title: `Pharmacotherapeutic Safety Gate & Adverse-Effect Prevention in ${guide.topic}`,
      diff: 'Critical Thinking',
      presentation: `A 63-year-old patient newly diagnosed with ${guide.topic} is being started on first-line pharmacotherapy. Pre-treatment laboratory results reveal borderline electrolyte and renal clearance abnormalities.`,
      vitals: [
        { parameter: 'Blood Pressure', value: '116/72 mmHg', referenceRange: '90-120/60-80 mmHg', flag: 'normal' },
        { parameter: 'eGFR', value: '34 mL/min/1.73m2', referenceRange: '> 60 mL/min/1.73m2', flag: 'low' },
        { parameter: 'Serum Potassium', value: '5.3 mEq/L', referenceRange: '3.5-5.0 mEq/L', flag: 'high' },
      ],
      parts: [
        {
          partLabel: 'Part A',
          focusArea: 'Interpretation',
          question: 'Which pre-treatment laboratory abnormalities represent critical pharmacological safety gates in this patient?',
          modelAnswer: 'Reduced eGFR (34 mL/min) and mild hyperkalemia (5.3 mEq/L) alter drug clearance and electrolyte safety margins.',
          rationale: 'Renally cleared or potassium-altering drugs require dose adjustment or electrolyte correction first.',
        },
        {
          partLabel: 'Part B',
          focusArea: 'Management',
          question: `How should the therapeutic regimen for ${guide.topic} be initiated and titrated safely?`,
          modelAnswer: 'Correct reversible electrolyte derangements, select renal-safe dosing, avoid nephrotoxic co-medications (e.g., NSAIDs), and titrate cautiously.',
          rationale: 'Stepwise titration with lab verification prevents life-threatening arrhythmia or acute renal decline.',
        },
        {
          partLabel: 'Part C',
          focusArea: 'Complications',
          question: 'When should repeat metabolic and clinical reassessment be scheduled after treatment initiation?',
          modelAnswer: 'Recheck electrolytes and renal function within 48-72 hours (inpatient) or 1-2 weeks (outpatient) after initiation or dose escalation.',
          rationale: 'Early biochemical surveillance catches iatrogenic toxicity before clinical symptoms emerge.',
        },
      ],
      pearl: 'Always verify renal clearance and serum electrolytes before initiating or up-titrating disease-modifying pharmacotherapy.',
    },
    {
      title: `Multi-Morbid Patient With ${guide.topic} and Renal-Metabolic Comorbidity`,
      diff: 'Clinical Application',
      presentation: `A 71-year-old patient with longstanding type 2 diabetes mellitus, chronic kidney disease stage 3, and hypertension presents with worsening clinical features of ${guide.topic}.`,
      vitals: [
        { parameter: 'Blood Pressure', value: '148/88 mmHg', referenceRange: '< 130/80 mmHg', flag: 'high' },
        { parameter: 'HbA1c', value: '8.4%', referenceRange: '< 5.7%', flag: 'high' },
        { parameter: 'Volume / Organ Status', value: 'Evidence of systemic cardiometabolic strain', flag: 'high' },
      ],
      parts: [
        {
          partLabel: 'Part A',
          focusArea: 'Diagnosis',
          question: `How do chronic cardiometabolic comorbidities accelerate the pathophysiology of ${guide.topic}?`,
          modelAnswer: 'Endothelial dysfunction, chronic low-grade inflammation, and reduced renal/vascular reserve lower the threshold for clinical decompensation.',
          rationale: 'Systemic comorbidities compound target-organ vulnerability.',
        },
        {
          partLabel: 'Part B',
          focusArea: 'Management',
          question: 'Which therapeutic choices offer dual organ-protective benefits across both the primary condition and comorbidities?',
          modelAnswer: `Prioritize evidence-based classes addressing ${guide.topic} while preserving renal and cardiovascular outcomes.`,
          rationale: 'Integrated multi-organ therapeutics reduce polypharmacy and hospitalization.',
        },
        {
          partLabel: 'Part C',
          focusArea: 'Complications',
          question: 'What interdisciplinary follow-up targets optimize long-term prognosis?',
          modelAnswer: 'Coordinate blood pressure control, glycemic optimization, medication reconciliation, and disease-specific biomarker tracking.',
          rationale: 'Longitudinal comorbidity control halves recurrent decompensation rates.',
        },
      ],
      pearl: 'Treat the whole physiological network—comorbid diabetes, hypertension, and CKD directly shape disease trajectory.',
    },
    {
      title: `Early Subclinical Detection & Biomarker Interpretation in ${guide.topic}`,
      diff: 'Clinical Application',
      presentation: `A 36-year-old patient with strong clinical risk factors is evaluated for mild, intermittent early symptoms before overt organ failure has developed.`,
      vitals: [
        { parameter: 'Heart Rate', value: '84 bpm', referenceRange: '60-100 bpm', flag: 'normal' },
        { parameter: 'Blood Pressure', value: '124/78 mmHg', referenceRange: '90-120/60-80 mmHg', flag: 'normal' },
        { parameter: 'Targeted Screening Marker', value: 'Early abnormal elevation', flag: 'high' },
      ],
      parts: [
        {
          partLabel: 'Part A',
          focusArea: 'Interpretation',
          question: 'Why areresting vital signs still normal despite early biomarker abnormality?',
          modelAnswer: `Intact physiological compensation masks resting vital-sign instability during early-stage ${guide.topic}.`,
          rationale: guide.sections[0]?.keyTakeaway || 'Homeostatic feedback preserves resting output until reserve is depleted.',
        },
        {
          partLabel: 'Part B',
          focusArea: 'Investigations',
          question: 'What confirmatory evaluation establishes definitive diagnosis at this early stage?',
          modelAnswer: guide.sections[3]?.keyTakeaway || `Targeted functional or structural evaluation tailored to ${guide.topic}.`,
          rationale: 'Confirming disease during the compensated window enables disease-modifying intervention.',
        },
        {
          partLabel: 'Part C',
          focusArea: 'Management',
          question: 'How does early intervention alter natural history compared with late rescue therapy?',
          modelAnswer: 'Halts maladaptive remodeling, preserves parenchymal function, and prevents acute emergency hospitalizations.',
          rationale: 'Preventing structural remodeling is far more effective than attempting late reversal.',
        },
      ],
      pearl: 'Normal resting vital signs never exclude early compensated disease in high-risk patients.',
    },
    {
      title: `Refractory Progression & Complication Management in ${guide.topic}`,
      diff: 'Critical Thinking',
      presentation: `A 52-year-old hospitalized patient being treated for ${guide.topic} develops new secondary organ symptoms on hospital day 3 despite initial stabilization.`,
      vitals: [
        { parameter: 'Heart Rate', value: '112 bpm', referenceRange: '60-100 bpm', flag: 'high' },
        { parameter: 'Oxygenation / Perfusion', value: 'Declining from admission trend', flag: 'high' },
        { parameter: 'Serial Biomarker Trend', value: 'Secondary rise on day 3', flag: 'critical' },
      ],
      parts: [
        {
          partLabel: 'Part A',
          focusArea: 'Complications',
          question: `What secondary disease complication or treatment-related adverse event must be suspected first?`,
          modelAnswer: `Evaluate for recognized acute complications of ${guide.topic}, nosocomial infection/thrombosis, or drug-induced organ toxicity.`,
          rationale: 'Biphasic deterioration in hospitalized patients signals either a complication or iatrogenic insult.',
        },
        {
          partLabel: 'Part B',
          focusArea: 'Investigations',
          question: 'Which immediate bedside and laboratory checks differentiate disease progression from iatrogenic complication?',
          modelAnswer: 'Focused physical re-examination, repeat metabolic/hematologic panel, drug chart review, and targeted bedside imaging.',
          rationale: 'Serial trend comparison pinpoints the exact inflection cause.',
        },
        {
          partLabel: 'Part C',
          focusArea: 'Management',
          question: 'Outline the escalated management strategy.',
          modelAnswer: 'Withdraw any offending iatrogenic agent, initiate complication-specific therapy, and escalate monitoring.',
          rationale: 'Prompt course correction prevents cascading multi-organ failure.',
        },
      ],
      pearl: 'Any secondary clinical dip during inpatient recovery demands a fresh bedside exam and medication audit.',
    },
    {
      title: `Transition of Care, Relapse Prevention & Patient Education in ${guide.topic}`,
      diff: 'Clinical Application',
      presentation: `A 60-year-old patient hospitalized for acute ${guide.topic} is now clinically euvolemic/stable on oral maintenance therapy and being prepared for hospital discharge.`,
      vitals: [
        { parameter: 'Blood Pressure', value: '118/74 mmHg', referenceRange: '90-120/60-80 mmHg', flag: 'normal' },
        { parameter: 'Heart Rate', value: '72 bpm', referenceRange: '60-100 bpm', flag: 'normal' },
        { parameter: 'Pre-Discharge Labs', value: 'Stabilized at safe baseline', flag: 'normal' },
      ],
      parts: [
        {
          partLabel: 'Part A',
          focusArea: 'Interpretation',
          question: 'Which objective clinical criteria confirm that this patient is safe for transition to outpatient care?',
          modelAnswer: 'Sustained hemodynamic stability, resolution of acute symptoms, stable renal/electrolyte trends on oral regimen, and addressed precipitant.',
          rationale: 'Premature discharge before oral-regimen stability drives 30-day readmissions.',
        },
        {
          partLabel: 'Part B',
          focusArea: 'Management',
          question: 'Which long-term evidence-based therapies and lifestyle measures should be reconciled on the discharge summary?',
          modelAnswer: guide.sections[guide.sections.length - 1]?.keyTakeaway || `Complete reconciled maintenance regimen for ${guide.topic} with clear titration targets.`,
          rationale: 'Structured discharge reconciliation ensures continuity of disease-modifying therapy.',
        },
        {
          partLabel: 'Part C',
          focusArea: 'Complications',
          question: 'Which specific red-flag symptoms should prompt the patient to seek urgent medical reassessment?',
          modelAnswer: (guide.clinicalNotes || []).find((n) => n.category === 'Red Flag')?.detail || 'Recurrent cardinal symptoms, syncope/dizziness, rapid clinical worsening, or medication intolerance.',
          rationale: 'Actionable patient education enables early intervention before severe relapse.',
        },
      ],
      pearl: 'A structured discharge checklist and 7-day follow-up bridge acute stabilization to durable long-term recovery.',
    },
  ];

  for (const arch of archetypes) {
    if (result.length >= targetTotal) break;
    const key = normalizeStemKey(`${arch.title} ${arch.presentation}`);
    if (seenCases.has(key)) continue;
    seenCases.add(key);

    const num = result.length + 1;
    result.push({
      id: `qb-case-${num}`,
      number: num,
      title: arch.title,
      difficulty: arch.diff,
      patientPresentation: arch.presentation,
      vitalsAndLabs: arch.vitals,
      progressiveQuestions: arch.parts,
      clinicalPearl: arch.pearl,
      sourceBasis: 'general_medical_knowledge',
      pageNumbers: [],
      bookCitations: [],
    });
  }

  return result.slice(0, targetTotal).map((c, idx) => ({
    ...c,
    id: `qb-case-${idx + 1}`,
    number: idx + 1,
  }));
}

export function buildSourceGapDisclosure(guide: StudyGuide): string {
  const citationSummary = formatBookCitationsSummary(
    guide.bookCitations,
    guide.referencedPages,
    guide.textbookTitle
  );
  if (guide.coverage === 'none' || guide.referencedPages.length === 0) {
    return `Source Coverage Gap Disclosure: Zero pages across the selected textbook library (${guide.totalPagesSearched || 1} indexed pages searched) contained direct coverage of "${guide.topic}". No textbook page numbers are fabricated; all integrated science explanations, diagrams, and the 48-question bank are explicitly labeled Supplementary Medical Knowledge.`;
  }
  if (guide.coverage === 'partial') {
    return `Partial Textbook Coverage Disclosure: Core clinical passages are verified in ${citationSummary}. Where the uploaded textbook is concise on foundational physiology, microscopic histopathology, or extended 48-item assessment scenarios, sections are transparently labeled Supplementary Medical Knowledge without attributing unverified page numbers.`;
  }
  return `Verified Textbook Grounding: Primary terminology, mechanisms, and clinical protocols are anchored in ${citationSummary}. Supplementary basic-science bridges and extended self-assessment items beyond direct book excerpts are explicitly labeled Supplementary Medical Knowledge.`;
}

/**
 * Ensures any StudyGuide has a 100% complete, citation-sanitized, deduplicated
 * InfographicTopicPack with topic-relevant integrated medical sciences and
 * EXACTLY 30 MCQs, 10 Written Questions, and 8 Progressive Clinical Cases.
 */
export function ensureCompleteInfographicTopicPack(
  guide: StudyGuide,
  rawCandidate?: Partial<InfographicTopicPack> | null
): InfographicTopicPack {
  const canonical = canonicalizeMedicalTopic(guide.topic);
  const rawCand = rawCandidate || guide.infographicPack;

  // Reject stale or mismatched candidate packs if their canonicalTopicId or canonicalTopicTitle belongs to a different topic!
  const candidateMismatched = Boolean(
    rawCand &&
      ((rawCand.canonicalTopicId && rawCand.canonicalTopicId !== canonical.topicId) ||
        (rawCand.canonicalTopicTitle &&
          !doesTitleMatchCanonicalTopic(rawCand.canonicalTopicTitle, canonical).matches))
  );
  const candidate = candidateMismatched ? undefined : rawCand;

  const cleanObjectives = (candidate?.learningObjectives || []).filter(
    (obj) => !detectConflictingTopicHijack(obj, undefined, canonical).hijacked
  );
  const learningObjectives =
    cleanObjectives.length >= 3
      ? cleanObjectives.slice(0, 6)
      : [
          `Master the normal baseline physiology and anatomical landmarks of the ${canonical.domainProfile.anatomicalRegionLabel.toLowerCase()} in ${canonical.canonicalTitle}.`,
          `Trace the step-by-step pathophysiological mechanisms and histological alterations characteristic of ${canonical.canonicalTitle}.`,
          `Synthesize clinical presentation, confirmatory diagnostic work-up, differential diagnosis, and targeted pharmacotherapy for ${canonical.canonicalTitle}.`,
          `Apply clinical reasoning across 30 single-best-answer MCQs, 10 structured written questions, and 8 progressive clinical cases on ${canonical.canonicalTitle}.`,
        ];

  const sourceGapNotice =
    candidate?.sourceGapNotice &&
    candidate.sourceGapNotice.trim().length > 15 &&
    !detectConflictingTopicHijack(candidate.sourceGapNotice, undefined, canonical).hijacked
      ? candidate.sourceGapNotice.trim()
      : buildSourceGapDisclosure(guide);

  // Integrated disciplines: sanitize & topic-verify candidate blocks if present, else compile topic-relevant blocks
  let integratedDisciplines: IntegratedDisciplineBlock[] = [];
  const alignedCandidateBlocks = (candidate?.integratedDisciplines || []).filter(
    (b) =>
      b &&
      !detectConflictingTopicHijack(
        `${b.title || ''} ${b.detailedExplanation || ''} ${(b.keyPoints || []).join(' ')}`,
        b.title,
        canonical
      ).hijacked
  );

  if (alignedCandidateBlocks.length >= 3) {
    integratedDisciplines = alignedCandidateBlocks.map((b, idx) => {
      const discId: IntegratedScienceDisciplineId =
        b.discipline && b.discipline in DISCIPLINE_META
          ? b.discipline
          : 'clinical_correlations';
      const meta = DISCIPLINE_META[discId];
      const prov = sanitizeProvenanceForGuide(b.sourceBasis, b.pageNumbers, guide);
      const validPins = (b.calloutPins || []).filter(
        (p) =>
          p?.label &&
          !detectConflictingTopicHijack(`${p.label} ${p.detail || ''}`, p.label, canonical)
            .hijacked
      );
      return {
        id: b.id || `disc-${discId}-${idx + 1}`,
        discipline: discId,
        disciplineLabel: b.disciplineLabel || meta.label,
        title: b.title || `${meta.shortTag} — ${canonical.canonicalTitle}`,
        relevanceSummary:
          b.relevanceSummary ||
          `Core ${meta.shortTag.toLowerCase()} integration for ${canonical.canonicalTitle}.`,
        detailedExplanation: b.detailedExplanation || guide.summary,
        keyPoints:
          Array.isArray(b.keyPoints) && b.keyPoints.length > 0
            ? b.keyPoints.slice(0, 5)
            : [guide.sections[0]?.keyTakeaway || guide.summary],
        highlightedTerms: Array.isArray(b.highlightedTerms)
          ? b.highlightedTerms.slice(0, 5)
          : [],
        clinicalCorrelationPearl:
          b.clinicalCorrelationPearl ||
          guide.clinicalNotes[0]?.detail ||
          canonical.domainProfile.diagnosticGoldStandardTemplate(canonical.canonicalTitle),
        visualKind: b.visualKind || meta.defaultVisualKind,
        visualTitle: b.visualTitle || `${meta.shortTag} Schematic — ${canonical.canonicalTitle}`,
        visualCaption:
          b.visualCaption ||
          `Topic-specific ${meta.shortTag.toLowerCase()} illustration with editable medical labels for ${canonical.canonicalTitle}.`,
        calloutPins:
          validPins.length >= 2
            ? validPins.slice(0, 5).map((p, pIdx) => ({
                number: pIdx + 1,
                label: p.label || `Structure ${pIdx + 1}`,
                detail: p.detail || '',
                xPct: Math.min(86, Math.max(14, Number(p.xPct) || 25 + pIdx * 18)),
                yPct: Math.min(86, Math.max(14, Number(p.yPct) || 30 + pIdx * 15)),
              }))
            : buildDefaultCalloutPins(guide, discId, canonical),
        normalComparisonNote:
          b.normalComparisonNote || canonical.domainProfile.normalHistologyNote,
        pathologicalComparisonNote:
          b.pathologicalComparisonNote ||
          canonical.domainProfile.pathologicalHistologyTemplate(canonical.canonicalTitle),
        curveAxisX: b.curveAxisX || canonical.domainProfile.curveAxisX,
        curveAxisY: b.curveAxisY || canonical.domainProfile.curveAxisY,
        drugComparisonRows:
          Array.isArray(b.drugComparisonRows) && b.drugComparisonRows.length > 0
            ? b.drugComparisonRows.slice(0, 6)
            : discId === 'pharmacology'
              ? canonical.domainProfile.firstLineDrugRowsTemplate(canonical.canonicalTitle)
              : undefined,
        sourceBasis: prov.sourceBasis,
        pageNumbers: prov.pageNumbers,
        bookCitations: prov.bookCitations,
        supportingQuote: prov.sourceBasis === 'textbook' ? b.supportingQuote : undefined,
      };
    });
  } else {
    integratedDisciplines = buildCompiledIntegratedDisciplines(guide, canonical);
  }

  const relevantDisciplinesNote =
    candidate?.relevantDisciplinesNote &&
    !detectConflictingTopicHijack(candidate.relevantDisciplinesNote, undefined, canonical).hijacked
      ? candidate.relevantDisciplinesNote
      : `Adapted to "${canonical.canonicalTitle}": includes ${integratedDisciplines
          .map((d) => DISCIPLINE_META[d.discipline]?.shortTag || d.disciplineLabel)
          .join(', ')} based on scientific relevance.`;

  // Sanitize, topic-align & deduplicate candidate MCQs, then guarantee exact 30
  const sanitizedCandidateMcqs: QuestionBankMcq[] = [];
  const seenMcqStems = new Set<string>();
  for (const rawM of candidate?.questionBank?.mcqs || []) {
    if (!rawM?.stem || !Array.isArray(rawM.options) || rawM.options.length < 4) continue;
    const key = normalizeStemKey(rawM.stem);
    if (!key || seenMcqStems.has(key)) continue;
    const cleanOptions = rawM.options
      .map((o) => String(o || '').replace(/^[A-Ea-e][.)]\s+/, '').trim())
      .filter(Boolean)
      .slice(0, 5);
    if (cleanOptions.length < 4) continue;

    const explanationText =
      rawM.explanation?.trim() ||
      `Correct option (${String.fromCharCode(65 + (Number(rawM.correctIndex) || 0))}) directly aligns with established ${canonical.canonicalTitle} mechanisms.`;

    if (
      !isAssessmentItemAlignedWithTopic(
        `${rawM.stem} ${cleanOptions.join(' ')} ${explanationText}`,
        undefined,
        canonical
      ).aligned
    ) {
      continue;
    }

    seenMcqStems.add(key);
    const prov = sanitizeProvenanceForGuide(rawM.sourceBasis, rawM.pageNumbers, guide);
    sanitizedCandidateMcqs.push({
      id: `qb-mcq-${sanitizedCandidateMcqs.length + 1}`,
      number: sanitizedCandidateMcqs.length + 1,
      difficulty: rawM.difficulty || 'Clinical Application',
      discipline: rawM.discipline || 'Clinical Medicine',
      stem: rawM.stem.trim(),
      options: cleanOptions,
      correctIndex: Math.min(
        cleanOptions.length - 1,
        Math.max(0, Number(rawM.correctIndex) || 0)
      ),
      explanation: explanationText,
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
    });
  }

  const finalMcqs = buildDeterministicTopUpMcqs(
    guide,
    sanitizedCandidateMcqs,
    30,
    canonical
  );

  // Sanitize, topic-align & deduplicate candidate Written Questions, then guarantee exact 10
  const sanitizedWritten: QuestionBankWrittenItem[] = [];
  const seenWrittenPrompts = new Set<string>();
  const validVerbs: WrittenCommandVerb[] = [
    'Explain',
    'Discuss',
    'Compare',
    'Enumerate',
    'Describe',
    'Clinical Work-up',
  ];
  for (const rawW of candidate?.questionBank?.writtenQuestions || []) {
    if (!rawW?.prompt || !rawW?.modelAnswer) continue;
    const key = normalizeStemKey(rawW.prompt);
    if (!key || seenWrittenPrompts.has(key)) continue;
    if (
      !isAssessmentItemAlignedWithTopic(
        `${rawW.prompt} ${rawW.modelAnswer}`,
        undefined,
        canonical
      ).aligned
    ) {
      continue;
    }
    seenWrittenPrompts.add(key);

    const prov = sanitizeProvenanceForGuide(rawW.sourceBasis, rawW.pageNumbers, guide);
    const verb: WrittenCommandVerb = validVerbs.includes(rawW.commandVerb)
      ? rawW.commandVerb
      : 'Explain';
    const pts =
      Array.isArray(rawW.markingPoints) && rawW.markingPoints.length >= 2
        ? rawW.markingPoints.slice(0, 5).map((p) => ({
            point: String(p.point || '').trim(),
            marks: Math.max(1, Number(p.marks) || 2),
          }))
        : [
            { point: 'Core pathophysiological explanation', marks: 4 },
            { point: 'Accurate clinical & diagnostic correlation', marks: 3 },
            { point: 'Evidence-based management / safety point', marks: 3 },
          ];
    const totalMarks = pts.reduce((acc, p) => acc + p.marks, 0);

    sanitizedWritten.push({
      id: `qb-written-${sanitizedWritten.length + 1}`,
      number: sanitizedWritten.length + 1,
      commandVerb: verb,
      difficulty: rawW.difficulty || 'Clinical Application',
      discipline: rawW.discipline || 'Clinical Medicine',
      prompt: rawW.prompt.trim(),
      totalMarks,
      markingPoints: pts,
      modelAnswer: rawW.modelAnswer.trim(),
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
    });
  }

  const finalWritten = buildDeterministicWrittenQuestions(
    guide,
    sanitizedWritten,
    10,
    canonical
  );

  // Sanitize, topic-align & deduplicate candidate Clinical Cases, then guarantee exact 8
  const sanitizedCases: QuestionBankClinicalCase[] = [];
  const seenCaseKeys = new Set<string>();
  for (const rawC of candidate?.questionBank?.clinicalCases || []) {
    if (!rawC?.patientPresentation || !Array.isArray(rawC.progressiveQuestions)) continue;
    if (rawC.progressiveQuestions.length < 3) continue;
    const key = normalizeStemKey(`${rawC.title || ''} ${rawC.patientPresentation}`);
    if (!key || seenCaseKeys.has(key)) continue;

    const fullCaseText = `${rawC.patientPresentation} ${rawC.progressiveQuestions
      .map((pq) => `${pq.question || ''} ${pq.modelAnswer || ''}`)
      .join(' ')}`;
    if (!isAssessmentItemAlignedWithTopic(fullCaseText, rawC.title, canonical).aligned) {
      continue;
    }
    seenCaseKeys.add(key);

    const prov = sanitizeProvenanceForGuide(rawC.sourceBasis, rawC.pageNumbers, guide);
    sanitizedCases.push({
      id: `qb-case-${sanitizedCases.length + 1}`,
      number: sanitizedCases.length + 1,
      title:
        rawC.title?.trim() ||
        `Clinical Case ${sanitizedCases.length + 1}: ${canonical.canonicalTitle}`,
      difficulty: rawC.difficulty || 'Clinical Application',
      patientPresentation: rawC.patientPresentation.trim(),
      vitalsAndLabs: Array.isArray(rawC.vitalsAndLabs)
        ? rawC.vitalsAndLabs.slice(0, 6)
        : canonical.domainProfile.defaultVitalsAndLabs,
      progressiveQuestions: rawC.progressiveQuestions.slice(0, 5).map((pq, pIdx) => ({
        partLabel: pq.partLabel || `Part ${String.fromCharCode(65 + pIdx)}`,
        focusArea: pq.focusArea || 'Management',
        question: String(pq.question || '').trim(),
        modelAnswer: String(pq.modelAnswer || '').trim(),
        rationale: String(pq.rationale || pq.modelAnswer || '').trim(),
      })),
      clinicalPearl:
        rawC.clinicalPearl?.trim() ||
        `Always integrate bedside findings with confirmatory diagnostics in ${canonical.canonicalTitle}.`,
      sourceBasis: prov.sourceBasis,
      pageNumbers: prov.pageNumbers,
      bookCitations: prov.bookCitations,
    });
  }

  const finalCases = buildDeterministicClinicalCases(
    guide,
    sanitizedCases,
    8,
    canonical
  );

  return {
    canonicalTopicId: canonical.topicId,
    canonicalTopicTitle: canonical.canonicalTitle,
    generatedAt: candidate?.generatedAt || new Date().toISOString(),
    generationMethod:
      candidate?.generationMethod === 'ai_verified' ? 'ai_verified' : 'compiled_verified',
    learningObjectives,
    sourceGapNotice,
    relevantDisciplinesNote,
    integratedDisciplines,
    questionBank: {
      mcqs: finalMcqs,
      writtenQuestions: finalWritten,
      clinicalCases: finalCases,
    },
  };
}

export interface InfographicGenerationProgress {
  stage: 1 | 2 | 3 | 4;
  totalStages: 4;
  percent: number;
  label: string;
}

/**
 * Multi-stage server-backed AI synthesis for Textbook Infographic Integrated Sciences
 * + 30 Single-Best-Answer MCQs + 10 Written Questions + 8 Progressive Clinical Cases.
 * Enforces a single canonicalTopicId throughout all 4 API stages and validates exact 30/10/8 counts.
 */
export async function generateAiInfographicPackWithProgress(
  guide: StudyGuide,
  _allTextbooks: MedicalTextbook[],
  onProgress?: (progress: InfographicGenerationProgress) => void,
  signal?: AbortSignal
): Promise<InfographicTopicPack> {
  const canonical = canonicalizeMedicalTopic(guide.topic);
  const systemTemplate =
    guide.anatomicalDiagram?.systemTemplate ||
    canonical.systemTemplate ||
    inferAnatomicalTemplate(canonical.canonicalTitle);
  const corpusHint = [
    guide.summary,
    ...guide.sections.map((s) => `${s.heading} ${s.content}`),
  ].join(' ');
  const relevantDisciplines = selectRelevantDisciplinesForTopic(
    canonical.canonicalTitle,
    corpusHint
  );

  const alignedPassages = (guide.retrievedPassages || []).filter(
    (p) => !detectConflictingTopicHijack(p.text, p.chapterTitle, canonical).hijacked
  );

  const sharedContext = {
    canonicalTopicId: canonical.topicId,
    topic: canonical.canonicalTitle,
    textbookTitle: guide.textbookTitle,
    coverage: alignedPassages.length > 0 ? guide.coverage : 'none',
    coverageNote: guide.coverageNote,
    referencedPages: alignedPassages.length > 0 ? guide.referencedPages : [],
    summary: guide.summary,
    systemTemplate,
    relevantDisciplines,
    passages: alignedPassages.slice(0, 8).map((p) => ({
      pageNumber: p.pageNumber,
      chapterTitle: p.chapterTitle,
      textbookTitle: p.textbookTitle || guide.textbookTitle,
      text: p.text.slice(0, 1400),
    })),
    sectionsSummary: guide.sections
      .filter((s) => !detectConflictingTopicHijack(s.content, s.heading, canonical).hijacked)
      .map((s) => ({
        heading: s.heading,
        keyTakeaway: s.keyTakeaway,
        pageNumbers: s.pageNumbers,
        sourceBasis: s.sourceBasis,
      })),
  };

  // Stage 1: Topic-Adaptive Integrated Medical Sciences + Learning Objectives
  onProgress?.({
    stage: 1,
    totalStages: 4,
    percent: 15,
    label: 'Stage 1/4: Synthesizing topic-relevant medical sciences & textbook provenance...',
  });

  const sciRes = await fetch('/api/pdf-studio/synthesize-sciences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sharedContext),
    signal,
  });
  const sciData = await sciRes.json().catch(() => ({}));
  if (!sciRes.ok) {
    throw new Error(
      sciData.error || 'Stage 1 failed: Unable to synthesize integrated medical sciences.'
    );
  }

  // Stage 2: 30 MCQs (Batch A: Q1-15 Foundational & Mechanism)
  onProgress?.({
    stage: 2,
    totalStages: 4,
    percent: 42,
    label: 'Stage 2/4: Authoring MCQs 1–15 (Foundational & Pathophysiological Mechanisms)...',
  });

  const mcqResA = await fetch('/api/pdf-studio/generate-mcqs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...sharedContext,
      batchNumber: 1,
      count: 15,
      focusDescription:
        'Foundational concepts, Relevant Anatomy, Normal Physiology, Pathology, and Pathophysiology mechanisms',
      avoidStems: [],
    }),
    signal,
  });
  const mcqDataA = await mcqResA.json().catch(() => ({}));
  if (!mcqResA.ok) {
    throw new Error(mcqDataA.error || 'Stage 2A failed: Unable to generate MCQs 1–15.');
  }
  const batchAMcqs: QuestionBankMcq[] = Array.isArray(mcqDataA.mcqs) ? mcqDataA.mcqs : [];

  // Stage 3: 30 MCQs (Batch B: Q16-30 Clinical Application, Pharmacology & Critical Thinking)
  onProgress?.({
    stage: 3,
    totalStages: 4,
    percent: 68,
    label: 'Stage 3/4: Authoring MCQs 16–30 (Clinical Vignettes, Pharmacology & Critical Thinking)...',
  });

  const mcqResB = await fetch('/api/pdf-studio/generate-mcqs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...sharedContext,
      batchNumber: 2,
      count: 15,
      focusDescription:
        'Clinical Application vignettes, Differential Diagnosis, Investigations, Pharmacology, and Critical Thinking management',
      avoidStems: batchAMcqs.map((m) => m.stem).slice(0, 15),
    }),
    signal,
  });
  const mcqDataB = await mcqResB.json().catch(() => ({}));
  if (!mcqResB.ok) {
    throw new Error(mcqDataB.error || 'Stage 3 failed: Unable to generate MCQs 16–30.');
  }
  const batchBMcqs: QuestionBankMcq[] = Array.isArray(mcqDataB.mcqs) ? mcqDataB.mcqs : [];

  // Stage 4: 10 Written Questions + 8 Progressive Clinical Cases
  onProgress?.({
    stage: 4,
    totalStages: 4,
    percent: 88,
    label: 'Stage 4/4: Authoring 10 written exam questions & 8 progressive clinical cases...',
  });

  const wcRes = await fetch('/api/pdf-studio/generate-written-and-cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sharedContext),
    signal,
  });
  const wcData = await wcRes.json().catch(() => ({}));
  if (!wcRes.ok) {
    throw new Error(
      wcData.error || 'Stage 4 failed: Unable to generate written questions and clinical cases.'
    );
  }

  const finalPack = ensureCompleteInfographicTopicPack(guide, {
    canonicalTopicId: canonical.topicId,
    canonicalTopicTitle: canonical.canonicalTitle,
    generatedAt: new Date().toISOString(),
    generationMethod: 'ai_verified',
    learningObjectives: sciData.learningObjectives,
    sourceGapNotice: sciData.sourceGapNotice,
    relevantDisciplinesNote: sciData.relevantDisciplinesNote,
    integratedDisciplines: sciData.integratedDisciplines,
    questionBank: {
      mcqs: [...batchAMcqs, ...batchBMcqs],
      writtenQuestions: Array.isArray(wcData.writtenQuestions)
        ? wcData.writtenQuestions
        : [],
      clinicalCases: Array.isArray(wcData.clinicalCases) ? wcData.clinicalCases : [],
    },
  });

  const check = validateQuestionBankExactCounts(finalPack.questionBank);
  if (!check.valid) {
    throw new Error(`Question bank validation error: ${check.errors.join(' ')}`);
  }

  onProgress?.({
    stage: 4,
    totalStages: 4,
    percent: 100,
    label: 'Completed: Verified 30 MCQs, 10 Written Questions & 8 Clinical Cases.',
  });

  return finalPack;
}
