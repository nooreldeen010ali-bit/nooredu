import type {
  BlueprintProvenanceSummary,
  BlueprintSectionPlan,
  BlueprintTermItem,
  MedicalSubjectDiscipline,
  MedicalTopicBlueprint,
  ProvenanceTier,
  SceneVisualMode,
  StudyGuide,
} from '../types/medical';
import { ensureCompleteInfographicTopicPack } from './infographicQuestionBankEngine';
import { formatBookCitationsSummary } from './multiBookEngine';
import {
  buildFallbackAnatomicalDiagram,
  buildFallbackFlowchartsFromSections,
  buildFallbackMindMapFromSections,
} from './textbookEngine';
import { canonicalizeMedicalTopic, doesTitleMatchCanonicalTopic } from './topicCanonicalizer';

function stripNumericPrefix(heading: string): string {
  return heading.replace(/^(?:Step\s*)?0?\d+[.:)\s-]+/i, '').trim();
}

function inferDisciplineAndVisualMode(
  heading: string,
  phase: string | undefined,
  idx: number
): { discipline: MedicalSubjectDiscipline; visualMode: SceneVisualMode } {
  const combined = `${heading} ${phase || ''}`.toLowerCase();

  if (/(drug|pharmacol|therap|treatment|management|regimen|antibiotic|inhibitor|stabiliz)/i.test(combined)) {
    return {
      discipline: 'pharmacology',
      visualMode: idx >= 4 ? 'clinical_flow' : 'treatment',
    };
  }
  if (/(diagnos|investigat|workup|work-up|imaging|endoscop|biops|lab|differenti)/i.test(combined)) {
    return {
      discipline: 'pathology',
      visualMode: /differenti|compar/i.test(combined) ? 'comparison' : 'investigations',
    };
  }
  if (/(immun|autoantibod|cytokin|complement|t-cell|b-cell|hypersensitiv)/i.test(combined)) {
    return {
      discipline: 'immunology',
      visualMode: 'pathophysiology',
    };
  }
  if (/(pathophysiol|pathogen|mechanis|cascade|lesion|ulcer|ischemi|necros|inflammat)/i.test(combined)) {
    return {
      discipline: 'pathology',
      visualMode: 'pathophysiology',
    };
  }
  if (idx === 0 || /(anatom|baseline|normal|homeostas|physiolog|structure)/i.test(combined)) {
    return {
      discipline: idx === 0 ? 'anatomy' : 'physiology',
      visualMode: idx === 0 ? 'anatomy' : 'physiology',
    };
  }

  const fallbackModes: Array<{ discipline: MedicalSubjectDiscipline; visualMode: SceneVisualMode }> = [
    { discipline: 'anatomy', visualMode: 'anatomy' },
    { discipline: 'physiology', visualMode: 'physiology' },
    { discipline: 'pathology', visualMode: 'pathophysiology' },
    { discipline: 'pathology', visualMode: 'investigations' },
    { discipline: 'pharmacology', visualMode: 'treatment' },
  ];
  return fallbackModes[idx % fallbackModes.length];
}

function buildContinuousNarrationEn(
  topicTitle: string,
  cleanHeading: string,
  content: string,
  keyTakeaway: string,
  idx: number,
  total: number
): string {
  const sentences = content
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 14);

  const core = sentences.slice(0, 2).join(' ') || keyTakeaway;
  const trimmedCore = core.length > 290 ? `${core.slice(0, 287).replace(/\s+\S*$/, '')}.` : core;

  if (idx === 0) {
    return `In this medical lecture on ${topicTitle}, let us begin on the smartboard with ${cleanHeading}. ${trimmedCore}`;
  }
  if (idx === total - 1) {
    return `Building directly on those diagnostic findings, we now focus on ${cleanHeading}. ${trimmedCore} Keep this high-yield takeaway in mind: ${keyTakeaway}`;
  }

  const connectors = [
    `Next, notice how that baseline directly explains ${cleanHeading}.`,
    `As this mechanism progresses clinically, look at ${cleanHeading} on the board.`,
    `To confirm this at the bedside, we move to ${cleanHeading}.`,
    `With the mechanism established, let us examine ${cleanHeading}.`,
  ];
  const lead = connectors[(idx - 1) % connectors.length];
  return `${lead} ${trimmedCore}`;
}

function buildContinuousNarrationArEg(
  topicTitle: string,
  cleanHeading: string,
  contentArabic: string | undefined,
  keyTakeawayArabic: string | undefined,
  keyTakeawayEn: string,
  idx: number,
  total: number
): string {
  const cleanAr = (contentArabic || keyTakeawayArabic || '').replace(/\s+/g, ' ').trim();

  if (cleanAr.length > 18) {
    const trimmedAr = cleanAr.length > 290 ? `${cleanAr.slice(0, 287)}...` : cleanAr;
    if (idx === 0) {
      return `أهلاً بيكم في شرح موضوع ${topicTitle}. هنبدأ أول حاجة على الشاشة بـ ${cleanHeading}. ${trimmedAr}`;
    }
    if (idx === total - 1) {
      return `وبناءً على التشخيص ده، ننتقل دلوقتي لـ ${cleanHeading}. ${trimmedAr}`;
    }
    const arConnectors = [
      `ودلوقتي تعالوا نشوف إزاي ده بيؤدي إلى ${cleanHeading}.`,
      `لما نربط الـ Mechanism ده بالعيادة، هنلاحظ ${cleanHeading}.`,
      `عشان نأكد التشخيص بدقة، بنركز على ${cleanHeading}.`,
      `الخطوة اللي بعدها على البورد هي ${cleanHeading}.`,
    ];
    return `${arConnectors[(idx - 1) % arConnectors.length]} ${trimmedAr}`;
  }

  if (idx === 0) {
    return `أهلاً بيكم في محاضرة ${topicTitle}. هنبدأ على الشاشة بشرح الأساس العلمي في ${cleanHeading}: ${keyTakeawayEn}`;
  }
  return `وبنكمل مع بعض في موضوع ${topicTitle} ونركز على ${cleanHeading}: ${keyTakeawayEn}`;
}

/**
 * Compiles or refreshes a unified `MedicalTopicBlueprint` as the single source of truth
 * for Tutor explanations, 3D Continuous Lectures, Colorful Study PDFs, and Timed Exams.
 */
export function buildMedicalTopicBlueprint(guide: StudyGuide): MedicalTopicBlueprint {
  const canonical = canonicalizeMedicalTopic(guide.topic);
  const canonicalTitle = doesTitleMatchCanonicalTopic(guide.topic, canonical).matches
    ? guide.topic.trim()
    : canonical.canonicalTitle;

  const anatomicalDiagram =
    guide.anatomicalDiagram || buildFallbackAnatomicalDiagram(canonicalTitle, guide.sections);
  const flowcharts =
    guide.flowcharts && guide.flowcharts.length > 0
      ? guide.flowcharts
      : buildFallbackFlowchartsFromSections(canonicalTitle, guide.sections);
  const mindMap =
    guide.mindMap ||
    buildFallbackMindMapFromSections(canonicalTitle, guide.sections, guide.clinicalNotes);

  const normalizedGuide: StudyGuide = {
    ...guide,
    canonicalTopicId: canonical.topicId,
    topic: canonicalTitle,
    anatomicalDiagram,
    flowcharts,
    mindMap,
  };

  const infographicPack = ensureCompleteInfographicTopicPack(
    normalizedGuide,
    guide.infographicPack
  );

  // Extract unified terminology glossary across sections + domain landmarks
  const glossaryMap = new Map<string, BlueprintTermItem>();
  for (const sec of guide.sections) {
    for (const td of sec.termDefinitions || []) {
      const key = td.term.trim().toLowerCase();
      if (key && !glossaryMap.has(key)) {
        glossaryMap.set(key, {
          term: td.term.trim(),
          definitionEn: td.simpleExplanation.trim(),
          definitionArEg: td.arabicExplanation?.trim(),
        });
      }
    }
  }
  for (const callout of anatomicalDiagram.callouts) {
    const key = callout.structureName.trim().toLowerCase();
    if (key && !glossaryMap.has(key) && glossaryMap.size < 10) {
      glossaryMap.set(key, {
        term: callout.structureName.trim(),
        definitionEn: `${callout.normalRole} Pathological change: ${callout.pathologicalChange}`,
      });
    }
  }

  const externalEvidence = guide.externalEvidence || [];
  const hasExternalEvidence = externalEvidence.length > 0;
  const verifiedBookCitations =
    guide.coverage !== 'none' && guide.bookCitations && guide.bookCitations.length > 0
      ? guide.bookCitations
      : guide.coverage !== 'none' && guide.referencedPages.length > 0
        ? [
            {
              textbookId: guide.textbookId,
              textbookTitle: guide.textbookTitle,
              pageNumbers: guide.referencedPages,
            },
          ]
        : [];
  const hasUploadedTextbookCoverage = verifiedBookCitations.length > 0;

  const totalSections = Math.max(1, guide.sections.length);
  const orderedSections: BlueprintSectionPlan[] = guide.sections.map((sec, idx) => {
    const cleanHeading = stripNumericPrefix(sec.heading) || `Core Concept ${idx + 1}`;
    const { discipline, visualMode } = inferDisciplineAndVisualMode(
      cleanHeading,
      sec.stepPhase,
      idx
    );

    const isBookVerified =
      guide.coverage !== 'none' &&
      sec.sourceBasis === 'textbook' &&
      sec.pageNumbers.length > 0;

    const provenanceTier: ProvenanceTier = isBookVerified
      ? 'uploaded_textbook'
      : hasExternalEvidence
        ? 'external_evidence'
        : 'general_medical_knowledge';

    const matchedCallout =
      anatomicalDiagram.callouts[idx % Math.max(1, anatomicalDiagram.callouts.length)];
    const highlightedStructure =
      matchedCallout?.structureName ||
      sec.termDefinitions?.[0]?.term ||
      cleanHeading.slice(0, 38);

    const rawBullets =
      sec.quickSummaryPoints && sec.quickSummaryPoints.length > 0
        ? sec.quickSummaryPoints
        : [sec.keyTakeaway];

    const smartboardLabels = [
      highlightedStructure,
      ...rawBullets.map((b) => (b.length > 52 ? `${b.slice(0, 49)}...` : b)),
    ]
      .filter(Boolean)
      .slice(0, 4);

    return {
      orderIndex: idx + 1,
      sectionId: `bp-sec-${idx + 1}`,
      phaseLabel: sec.stepPhase || `Section ${idx + 1}`,
      heading: `${String(idx + 1).padStart(2, '0')}. ${cleanHeading}`,
      learningObjective:
        infographicPack.learningObjectives[idx] ||
        `Master ${cleanHeading.toLowerCase()} in ${canonicalTitle}.`,
      explanationEn: sec.content,
      explanationArEg: sec.contentArabic,
      keyTakeawayEn: sec.keyTakeaway,
      keyTakeawayArEg: sec.keyTakeawayArabic,
      smartboardConceptTitle: cleanHeading,
      smartboardLabels,
      highlightedStructure,
      visualMode,
      subjectDiscipline: discipline,
      narrationEn: buildContinuousNarrationEn(
        canonicalTitle,
        cleanHeading,
        sec.content,
        sec.keyTakeaway,
        idx,
        totalSections
      ),
      narrationArEg: buildContinuousNarrationArEg(
        canonicalTitle,
        cleanHeading,
        sec.contentArabic,
        sec.keyTakeawayArabic,
        sec.keyTakeaway,
        idx,
        totalSections
      ),
      provenanceTier,
      bookCitations: isBookVerified ? sec.bookCitations || [] : [],
      pageNumbers: isBookVerified ? sec.pageNumbers : [],
      supportingQuote: isBookVerified ? sec.supportingQuote : undefined,
    };
  });

  const hasUnverifiedGeneralKnowledge = orderedSections.some(
    (s) => s.provenanceTier === 'general_medical_knowledge'
  );

  const primaryTier: ProvenanceTier = hasUploadedTextbookCoverage
    ? 'uploaded_textbook'
    : hasExternalEvidence
      ? 'external_evidence'
      : 'general_medical_knowledge';

  let disclosureText = '';
  if (hasUploadedTextbookCoverage) {
    const citeSummary = formatBookCitationsSummary(
      verifiedBookCitations,
      guide.referencedPages,
      guide.textbookTitle
    );
    disclosureText = hasUnverifiedGeneralKnowledge
      ? `Grounded in uploaded textbooks (${citeSummary})${
          hasExternalEvidence ? ` + ${externalEvidence.length} external scientific sources` : ''
        }; foundational sections without direct book passages are labeled General Medical Knowledge.`
      : `Directly verified in uploaded textbooks (${citeSummary})${
          hasExternalEvidence ? ` + ${externalEvidence.length} external scientific sources` : ''
        }.`;
  } else if (hasExternalEvidence) {
    disclosureText = `Not present in uploaded textbooks (0 book pages cited). Grounded in ${externalEvidence.length} external scientific evidence source(s) (PubMed / NIH MedlinePlus / ClinicalTrials.gov) and General Medical Knowledge.`;
  } else {
    disclosureText = `Not present in uploaded textbooks (0 book pages cited). Generated from General Medical Knowledge — verify acute dosing and clinical decisions against primary clinical guidelines.`;
  }

  const provenance: BlueprintProvenanceSummary = {
    primaryTier,
    hasUploadedTextbookCoverage,
    hasExternalEvidence,
    hasUnverifiedGeneralKnowledge,
    uploadedBookCitations: verifiedBookCitations,
    externalEvidenceCount: externalEvidence.length,
    disclosureText,
  };

  return {
    blueprintId: `blueprint-${canonical.topicId}`,
    canonicalTopicId: canonical.topicId,
    canonicalTitle,
    organDomain: canonical.organDomain,
    systemTemplate: anatomicalDiagram.systemTemplate,
    generatedAt: guide.updatedAt || new Date().toISOString(),
    learningObjectives:
      infographicPack.learningObjectives.length > 0
        ? infographicPack.learningObjectives
        : orderedSections.map((s) => s.learningObjective),
    terminologyGlossary: Array.from(glossaryMap.values()),
    orderedSections,
    anatomicalDiagram,
    flowcharts,
    mindMap,
    comparisonTable: guide.comparisonTable,
    clinicalPearls: guide.clinicalNotes,
    questionBank: infographicPack.questionBank,
    externalEvidence,
    provenance,
  };
}

/**
 * Attaches a freshly compiled `MedicalTopicBlueprint` and synchronized `InfographicTopicPack`
 * onto a `StudyGuide` so every downstream view (Tutor, 3D Lecture, Study PDF, Timed Exams)
 * shares identical topic lock, section order, terminology, visuals, and provenance.
 */
export function enrichStudyGuideWithBlueprint(guide: StudyGuide): StudyGuide {
  const blueprint = buildMedicalTopicBlueprint(guide);
  const infographicPack = ensureCompleteInfographicTopicPack(
    {
      ...guide,
      canonicalTopicId: blueprint.canonicalTopicId,
      topic: blueprint.canonicalTitle,
      anatomicalDiagram: blueprint.anatomicalDiagram,
      flowcharts: blueprint.flowcharts,
      mindMap: blueprint.mindMap,
    },
    guide.infographicPack
  );

  return {
    ...guide,
    canonicalTopicId: blueprint.canonicalTopicId,
    topic: blueprint.canonicalTitle,
    anatomicalDiagram: blueprint.anatomicalDiagram,
    flowcharts: blueprint.flowcharts,
    mindMap: blueprint.mindMap,
    infographicPack: {
      ...infographicPack,
      learningObjectives: blueprint.learningObjectives,
    },
    blueprint,
  };
}
