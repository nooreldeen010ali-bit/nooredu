import type {
  AnatomicalSystemTemplate,
  BookPageCitation,
  CoverageLevel,
  DoctorCharacterProfile,
  DoctorPersonaId,
  FlowchartData,
  LanguageMode,
  LectureCheckpointQuiz,
  LectureComparisonTable,
  LectureExternalReference,
  LectureGlossaryTerm,
  LecturePauseExplainMoment,
  LecturePedagogicalStage,
  LectureProject,
  LectureRevisionPack,
  LectureScene,
  LectureTopicCategory,
  MedicalSubjectDiscipline,
  MedicalTextbook,
  MindMapData,
  SceneTransitionType,
  SceneVisualMode,
  SourceBasis,
  SourceTextbookSummary,
  StudyGuide,
} from '../types/medical';
import {
  analyzePcmSignal,
  decodeRawPcm16ToMono,
  detectAudioContainerFormat,
  normalizeAndTrimScenePcm,
  parseStrictRiffWav,
  resampleMonoPcm16,
  type PcmSignalAnalysis,
} from './audioValidation';
import {
  formatBookCitationsSummary,
  retrieveAcrossTextbooks,
  shortenBookTitle,
  type MultiBookRetrievalResult,
} from './multiBookEngine';
import { buildMedicalTopicBlueprint } from './medicalBlueprintEngine';
import { buildPageCitationLabel } from './textbookEngine';
import { canonicalizeMedicalTopic } from './topicCanonicalizer';

export const DOCTOR_CHARACTER_PROFILES: DoctorCharacterProfile[] = [
  {
    id: 'female_doctor',
    gender: 'female',
    displayLabel: 'Female Doctor',
    name: 'Dr. Maya Lin, MD',
    roleTitle: 'Senior Medical Faculty',
    specialty: 'Clinical Medicine & Pathophysiology',
    attire: 'white_coat',
    coatColor: '#FFFFFF',
    scrubColor: '#0F4C81',
    accentColor: '#0284C7',
    skinTone: '#F1C6A7',
    hairColor: '#1E293B',
    hairStyle: 'bun',
    hasGlasses: false,
    hasStethoscope: true,
    geminiVoice: 'Kore',
  },
  {
    id: 'male_doctor',
    gender: 'male',
    displayLabel: 'Male Doctor',
    name: 'Dr. Karim Mansour, MD, PhD',
    roleTitle: 'Senior Medical Professor',
    specialty: 'Clinical Medicine & Therapeutics',
    attire: 'white_coat',
    coatColor: '#FFFFFF',
    scrubColor: '#0284C7',
    accentColor: '#0F4C81',
    skinTone: '#DCA884',
    hairColor: '#1E293B',
    hairStyle: 'short_parted',
    hasGlasses: false,
    hasStethoscope: true,
    geminiVoice: 'Charon',
  },
  // Legacy persona IDs mapped cleanly to consistent White-Coat Female / Male Doctors
  {
    id: 'attending_maya',
    gender: 'female',
    displayLabel: 'Female Doctor',
    name: 'Dr. Maya Lin, MD',
    roleTitle: 'Senior Medical Faculty',
    specialty: 'Internal Medicine & Acute Care',
    attire: 'white_coat',
    coatColor: '#FFFFFF',
    scrubColor: '#0F4C81',
    accentColor: '#0284C7',
    skinTone: '#F1C6A7',
    hairColor: '#1E293B',
    hairStyle: 'bun',
    hasGlasses: false,
    hasStethoscope: true,
    geminiVoice: 'Kore',
  },
  {
    id: 'professor_karim',
    gender: 'male',
    displayLabel: 'Male Doctor',
    name: 'Dr. Karim Mansour, MD, PhD',
    roleTitle: 'Senior Medical Professor',
    specialty: 'Academic Medicine & Bilingual Rounds',
    attire: 'white_coat',
    coatColor: '#FFFFFF',
    scrubColor: '#0284C7',
    accentColor: '#0F4C81',
    skinTone: '#DCA884',
    hairColor: '#1E293B',
    hairStyle: 'short_parted',
    hasGlasses: false,
    hasStethoscope: true,
    geminiVoice: 'Charon',
  },
  {
    id: 'fellow_elena',
    gender: 'female',
    displayLabel: 'Female Doctor',
    name: 'Dr. Maya Lin, MD',
    roleTitle: 'Senior Medical Faculty',
    specialty: 'Critical Care & Resuscitation',
    attire: 'white_coat',
    coatColor: '#FFFFFF',
    scrubColor: '#0F4C81',
    accentColor: '#0284C7',
    skinTone: '#F1C6A7',
    hairColor: '#1E293B',
    hairStyle: 'bun',
    hasGlasses: false,
    hasStethoscope: true,
    geminiVoice: 'Kore',
  },
  {
    id: 'pharmacologist_tariq',
    gender: 'male',
    displayLabel: 'Male Doctor',
    name: 'Dr. Karim Mansour, MD, PhD',
    roleTitle: 'Senior Medical Professor',
    specialty: 'Pharmacology & Mechanism of Action',
    attire: 'white_coat',
    coatColor: '#FFFFFF',
    scrubColor: '#0284C7',
    accentColor: '#0F4C81',
    skinTone: '#DCA884',
    hairColor: '#1E293B',
    hairStyle: 'short_parted',
    hasGlasses: false,
    hasStethoscope: true,
    geminiVoice: 'Charon',
  },
];

export const PRIMARY_DOCTOR_PRESENTERS: DoctorCharacterProfile[] = [
  DOCTOR_CHARACTER_PROFILES[0], // Female Doctor (White Coat)
  DOCTOR_CHARACTER_PROFILES[1], // Male Doctor (White Coat)
];

export function normalizePresenterId(id?: string): 'female_doctor' | 'male_doctor' {
  if (id === 'male_doctor' || id === 'professor_karim' || id === 'pharmacologist_tariq') {
    return 'male_doctor';
  }
  return 'female_doctor';
}

export function getDoctorProfile(id?: string): DoctorCharacterProfile {
  return (
    DOCTOR_CHARACTER_PROFILES.find((p) => p.id === id) || DOCTOR_CHARACTER_PROFILES[0]
  );
}

export function inferOrganSystemFromTopic(
  topic: string,
  extraContext = ''
): AnatomicalSystemTemplate {
  const combined = `${topic} ${extraContext}`.toLowerCase();
  if (
    /\b(heart|cardiac|hfref|hfpef|coronary|myocardial|arrhythmia|atrial|ventricular|pericard|valve|aortic|shock|hypertension|vascular|preload|afterload)\b/.test(
      combined
    )
  ) {
    return 'cardiopulmonary';
  }
  if (
    /\b(lung|pulmonary|asthma|copd|pneumonia|alveol|bronch|hypox|respirat|pleural|ards|embolism)\b/.test(
      combined
    )
  ) {
    return 'respiratory';
  }
  if (
    /\b(kidney|renal|nephro|glomerul|aki|ckd|tubul|dialysis|electrolyte|hyponatremia|hyperkalemia|acidosis|creatinine)\b/.test(
      combined
    )
  ) {
    return 'renal';
  }
  if (
    /\b(liver|hepat|cirrhosis|biliary|gallbladder|pancrea|gastro|peptic|gi\b|varice|ascites|jaundice|bilirubin)\b/.test(
      combined
    )
  ) {
    return 'hepatobiliary';
  }
  if (
    /\b(diabet|insulin|dka|thyroid|adrenal|cushing|addison|pituitary|endocrine|glucose|hyperosmolar|ketoacidosis)\b/.test(
      combined
    )
  ) {
    return 'endocrine';
  }
  if (
    /\b(brain|neuro|stroke|seizure|epilep|meningit|cranial|motor|sensory|myasthenia|parkinson|coma)\b/.test(
      combined
    )
  ) {
    return 'neurology';
  }
  if (
    /\b(anemia|hemoglobin|platelet|coagul|thrombo|leukemia|lymphoma|sickle|iron|hemato|transfusion|dic)\b/.test(
      combined
    )
  ) {
    return 'hematology';
  }
  if (
    /\b(sepsis|infect|autoimmune|lupus|rheumat|vasculit|antibiotic|immun|cytokine|anaphylax|fever)\b/.test(
      combined
    )
  ) {
    return 'immune';
  }
  return 'general_physiology';
}

export interface AdaptiveLectureStageSpec {
  stage: LecturePedagogicalStage;
  stageLabel: string;
  visualMode: SceneVisualMode;
  discipline: MedicalSubjectDiscipline;
  slideHeadingTemplate: (topic: string) => string;
  rationale: string;
}

export interface AdaptiveLecturePlan {
  category: LectureTopicCategory;
  categoryLabel: string;
  stages: AdaptiveLectureStageSpec[];
  omittedStages: LecturePedagogicalStage[];
}

const ALL_CANONICAL_STAGES: LecturePedagogicalStage[] = [
  'introduction',
  'definition',
  'classification',
  'etiology',
  'pathophysiology',
  'clinical_features',
  'investigations',
  'management',
  'summary',
];

export function classifyLectureTopicCategory(topic: string): LectureTopicCategory {
  const lower = (topic || '').trim().toLowerCase();

  // Primary clinical diseases/syndromes take precedence even if drug names appear in the title
  const hasDiseaseMarker =
    /\b(disease|syndrome|failure|ulcer|asthma|copd|pneumonia|infarction|stroke|sepsis|ketoacidosis|dka|appendicitis|pancreatitis|cirrhosis|anemia|nephritis|aki|ckd|shock|embolism|tamponade|pneumothorax|meningitis|epilepsy|diabetes|hypertension|thyrotoxicosis|hypothyroidism|lupus)\b/i.test(
      lower
    );

  if (!hasDiseaseMarker) {
    if (
      /\b(inhibitors?|blockers?|diuretics?|antibiotics?|anticoagulants?|statins?|agonists?|antagonists?|pharmacology|therapeutics|pharmacokinetics|ppi\b|proton pump|acei|arb\b|arni|sglt2|metformin|warfarin|heparin|omeprazole|furosemide|digoxin|insulin regimens?|corticosteroids?)\b/i.test(
        lower
      )
    ) {
      return 'pharmacology_therapeutics';
    }

    if (
      /\b(ecg|ekg|electrocardiogram|chest x-ray|cxr|lumbar puncture|arterial blood gas|abg\b|spirometry|urinalysis|echocardiography|endoscopy|auscultation|biopsy)\b/i.test(
        lower
      )
    ) {
      return 'diagnostic_procedure';
    }

    if (
      /\b(anatomy|physiology|cardiac cycle|glomerular filtration|action potential|circle of willis|brachial plexus|cranial nerves?|frank-starling|homeostasis|gas exchange|erythropoiesis|coagulation cascade|nephron|coronary circulation|autonomic nervous|gastric acid secretion)\b/i.test(
        lower
      )
    ) {
      return 'anatomy_physiology';
    }
  }

  return 'clinical_condition';
}

export function formatPedagogicalStageLabel(
  stage: LecturePedagogicalStage,
  category: LectureTopicCategory = 'clinical_condition'
): string {
  switch (stage) {
    case 'introduction':
      return 'Introduction';
    case 'definition':
      return 'Definition';
    case 'classification':
      return category === 'anatomy_physiology'
        ? 'Structural Divisions'
        : category === 'diagnostic_procedure'
          ? 'Core Patterns'
          : 'Classification';
    case 'etiology':
      return 'Etiology & Risk Factors';
    case 'pathophysiology':
      return category === 'anatomy_physiology'
        ? 'Physiological Mechanism'
        : category === 'pharmacology_therapeutics'
          ? 'Mechanism of Action'
          : 'Pathophysiology';
    case 'clinical_features':
      return category === 'anatomy_physiology'
        ? 'Clinical Correlation'
        : category === 'pharmacology_therapeutics'
          ? 'Clinical Indications'
          : category === 'diagnostic_procedure'
            ? 'Red Flags & Pitfalls'
            : 'Clinical Features';
    case 'investigations':
      return category === 'diagnostic_procedure'
        ? 'Stepwise Interpretation'
        : 'Investigations';
    case 'management':
      return category === 'pharmacology_therapeutics'
        ? 'Dosing & Safety'
        : 'Management';
    case 'summary':
    default:
      return 'Summary';
  }
}

/**
 * Selects only the pedagogical stages genuinely relevant to the medical topic:
 * Introduction → Definition → Classification → Etiology → Pathophysiology → Clinical Features → Investigations → Management → Summary
 * Never forces irrelevant sections (e.g., omits Etiology/Management for pure Anatomy/Physiology;
 * omits Etiology/Investigations for Pharmacology; omits Classification for focal surgical emergencies without subtypes).
 */
export function selectAdaptiveLectureStages(topic: string): AdaptiveLecturePlan {
  const category = classifyLectureTopicCategory(topic);
  const lower = (topic || '').trim().toLowerCase();

  if (category === 'anatomy_physiology') {
    const stages: AdaptiveLectureStageSpec[] = [
      {
        stage: 'introduction',
        stageLabel: 'Introduction',
        visualMode: 'anatomy',
        discipline: 'anatomy',
        slideHeadingTemplate: (t) => `Introduction to ${t}`,
        rationale: 'Orient the beginner to where this structure or process sits in the human body.',
      },
      {
        stage: 'definition',
        stageLabel: 'Definition & Core Structure',
        visualMode: 'anatomy',
        discipline: 'anatomy',
        slideHeadingTemplate: (t) => `Definition & Anatomical Layout of ${t}`,
        rationale: 'Define key anatomical landmarks and baseline terms in plain language.',
      },
      {
        stage: 'classification',
        stageLabel: 'Structural Divisions',
        visualMode: 'comparison',
        discipline: 'anatomy',
        slideHeadingTemplate: (t) => `Key Divisions & Components of ${t}`,
        rationale: 'Organize major functional parts or sequential phases clearly.',
      },
      {
        stage: 'pathophysiology',
        stageLabel: 'Physiological Mechanism',
        visualMode: 'physiology',
        discipline: 'physiology',
        slideHeadingTemplate: (t) => `Step-by-Step Mechanism of ${t}`,
        rationale: 'Trace normal physiological flow and homeostatic regulation.',
      },
      {
        stage: 'clinical_features',
        stageLabel: 'Clinical Correlation',
        visualMode: 'clinical_flow',
        discipline: 'physiology',
        slideHeadingTemplate: (t) => `Why ${t} Matters at the Bedside`,
        rationale: 'Connect normal structure/function to practical clinical examination.',
      },
      {
        stage: 'summary',
        stageLabel: 'Summary',
        visualMode: 'references',
        discipline: 'physiology',
        slideHeadingTemplate: (t) => `Summary: ${t}`,
        rationale: 'Synthesize core takeaways without forcing disease etiology or drug regimens.',
      },
    ];
    const used = new Set(stages.map((s) => s.stage));
    return {
      category,
      categoryLabel: 'Anatomy & Normal Physiology',
      stages,
      omittedStages: ALL_CANONICAL_STAGES.filter((s) => !used.has(s)),
    };
  }

  if (category === 'pharmacology_therapeutics') {
    const stages: AdaptiveLectureStageSpec[] = [
      {
        stage: 'introduction',
        stageLabel: 'Introduction',
        visualMode: 'physiology',
        discipline: 'pharmacology',
        slideHeadingTemplate: (t) => `Introduction to ${t}`,
        rationale: 'Introduce the physiological target system before receptor blockade or activation.',
      },
      {
        stage: 'definition',
        stageLabel: 'Definition & Drug Class',
        visualMode: 'treatment',
        discipline: 'pharmacology',
        slideHeadingTemplate: (t) => `What Are ${t}?`,
        rationale: 'Define the drug class and primary pharmacological goal.',
      },
      {
        stage: 'classification',
        stageLabel: 'Classification & Prototypes',
        visualMode: 'comparison',
        discipline: 'pharmacology',
        slideHeadingTemplate: (t) => `Classification & Prototype Agents`,
        rationale: 'Group key agents by selectivity, generation, or clinical route.',
      },
      {
        stage: 'pathophysiology',
        stageLabel: 'Mechanism of Action',
        visualMode: 'treatment',
        discipline: 'pharmacology',
        slideHeadingTemplate: (t) => `Receptor & Cellular Mechanism of ${t}`,
        rationale: 'Explain step-by-step how the drug alters cellular signaling.',
      },
      {
        stage: 'clinical_features',
        stageLabel: 'Clinical Indications',
        visualMode: 'clinical_flow',
        discipline: 'pharmacology',
        slideHeadingTemplate: (t) => `Major Clinical Indications`,
        rationale: 'Link the mechanism directly to therapeutic uses.',
      },
      {
        stage: 'management',
        stageLabel: 'Adverse Effects & Safety',
        visualMode: 'treatment',
        discipline: 'pharmacology',
        slideHeadingTemplate: (t) => `Adverse Effects, Contraindications & Monitoring`,
        rationale: 'Highlight practical prescribing safety and key contraindications.',
      },
      {
        stage: 'summary',
        stageLabel: 'Summary',
        visualMode: 'references',
        discipline: 'pharmacology',
        slideHeadingTemplate: (t) => `Summary: ${t}`,
        rationale: 'Recap mechanism, indications, and safety pearls.',
      },
    ];
    const used = new Set(stages.map((s) => s.stage));
    return {
      category,
      categoryLabel: 'Pharmacology & Therapeutics',
      stages,
      omittedStages: ALL_CANONICAL_STAGES.filter((s) => !used.has(s)),
    };
  }

  if (category === 'diagnostic_procedure') {
    const stages: AdaptiveLectureStageSpec[] = [
      {
        stage: 'introduction',
        stageLabel: 'Introduction',
        visualMode: 'anatomy',
        discipline: 'physiology',
        slideHeadingTemplate: (t) => `Introduction & Clinical Purpose of ${t}`,
        rationale: 'Explain why and when clinicians order or perform this test.',
      },
      {
        stage: 'definition',
        stageLabel: 'Core Principles',
        visualMode: 'physiology',
        discipline: 'physiology',
        slideHeadingTemplate: (t) => `Basic Principles Behind ${t}`,
        rationale: 'Clarify normal reference landmarks in beginner-friendly terms.',
      },
      {
        stage: 'classification',
        stageLabel: 'Key Patterns',
        visualMode: 'comparison',
        discipline: 'pathology',
        slideHeadingTemplate: (t) => `Major Diagnostic Patterns in ${t}`,
        rationale: 'Contrast normal versus classic abnormal patterns.',
      },
      {
        stage: 'investigations',
        stageLabel: 'Stepwise Interpretation',
        visualMode: 'investigations',
        discipline: 'pathology',
        slideHeadingTemplate: (t) => `Step-by-Step Approach to ${t}`,
        rationale: 'Walk calmly through a repeatable bedside sequence.',
      },
      {
        stage: 'clinical_features',
        stageLabel: 'Red Flags & Pitfalls',
        visualMode: 'clinical_flow',
        discipline: 'pathology',
        slideHeadingTemplate: (t) => `Urgent Red Flags & Common Pitfalls`,
        rationale: 'Highlight findings that require immediate clinical escalation.',
      },
      {
        stage: 'summary',
        stageLabel: 'Summary',
        visualMode: 'references',
        discipline: 'physiology',
        slideHeadingTemplate: (t) => `Summary: ${t}`,
        rationale: 'Consolidate the interpretation checklist.',
      },
    ];
    const used = new Set(stages.map((s) => s.stage));
    return {
      category,
      categoryLabel: 'Diagnostic Investigation & Procedure',
      stages,
      omittedStages: ALL_CANONICAL_STAGES.filter((s) => !used.has(s)),
    };
  }

  // Clinical Condition / Disease: omit Classification when focal acute condition has no meaningful clinical subtype split
  const isFocalWithoutPrimarySubtypes =
    /\b(acute appendicitis|cardiac tamponade|tension pneumothorax|epiglottitis|achalasia|pyloric stenosis)\b/i.test(
      lower
    );

  const stages: AdaptiveLectureStageSpec[] = [
    {
      stage: 'introduction',
      stageLabel: 'Introduction',
      visualMode: 'anatomy',
      discipline: 'anatomy',
      slideHeadingTemplate: (t) => `Introduction & Normal Baseline in ${t}`,
      rationale: 'Orient the beginner to normal organ structure before explaining disease.',
    },
    {
      stage: 'definition',
      stageLabel: 'Definition',
      visualMode: 'physiology',
      discipline: 'physiology',
      slideHeadingTemplate: (t) => `Definition: What Is ${t}?`,
      rationale: 'Provide a clear, plain-language clinical definition.',
    },
    ...(isFocalWithoutPrimarySubtypes
      ? []
      : [
          {
            stage: 'classification' as const,
            stageLabel: 'Classification',
            visualMode: 'comparison' as const,
            discipline: 'pathology' as const,
            slideHeadingTemplate: (t: string) => `Major Clinical Types of ${t}`,
            rationale: 'Distinguish clinically meaningful subtypes clearly.',
          },
        ]),
    {
      stage: 'etiology',
      stageLabel: 'Etiology & Risk Factors',
      visualMode: 'pathophysiology',
      discipline: 'pathology',
      slideHeadingTemplate: (t) => `Etiology: Common Causes of ${t}`,
      rationale: 'Identify primary triggers and modifiable risk factors.',
    },
    {
      stage: 'pathophysiology',
      stageLabel: 'Pathophysiology',
      visualMode: 'pathophysiology',
      discipline: 'pathology',
      slideHeadingTemplate: (t) => `Pathophysiology: Step-by-Step Mechanism`,
      rationale: 'Connect cause to tissue injury and functional change logically.',
    },
    {
      stage: 'clinical_features',
      stageLabel: 'Clinical Features',
      visualMode: 'anatomy',
      discipline: 'pathology',
      slideHeadingTemplate: (t) => `Clinical Features: Symptoms & Bedside Signs`,
      rationale: 'Explain why each symptom and physical sign appears.',
    },
    {
      stage: 'investigations',
      stageLabel: 'Investigations',
      visualMode: 'investigations',
      discipline: 'pathology',
      slideHeadingTemplate: (t) => `Investigations & Diagnostic Workup`,
      rationale: 'Prioritize first-line bedside tests and confirmatory imaging/labs.',
    },
    {
      stage: 'management',
      stageLabel: 'Management',
      visualMode: 'treatment',
      discipline: 'pharmacology',
      slideHeadingTemplate: (t) => `Stepwise Management of ${t}`,
      rationale: 'Outline acute stabilization, targeted drugs, and safety rules.',
    },
    {
      stage: 'summary',
      stageLabel: 'Summary',
      visualMode: 'references',
      discipline: 'physiology',
      slideHeadingTemplate: (t) => `Summary: ${t} Key Takeaways`,
      rationale: 'Bring the full clinical picture together calmly.',
    },
  ];

  const used = new Set(stages.map((s) => s.stage));
  return {
    category,
    categoryLabel: 'Clinical Disease & Syndrome',
    stages,
    omittedStages: ALL_CANONICAL_STAGES.filter((s) => !used.has(s)),
  };
}

export function inferPedagogicalStage(
  scene: Pick<LectureScene, 'pedagogicalStage' | 'visualMode' | 'title' | 'sectionKicker'>,
  idx: number,
  totalTeaching: number,
  topic: string
): LecturePedagogicalStage {
  if (scene.visualMode === 'references') return 'summary';
  if (scene.pedagogicalStage && ALL_CANONICAL_STAGES.includes(scene.pedagogicalStage)) {
    return scene.pedagogicalStage;
  }
  const text = `${scene.title || ''} ${scene.sectionKicker || ''}`.toLowerCase();
  if (idx === 0 && /\b(intro|welcome|normal|baseline|overview|anatomy)\b/.test(text)) {
    return 'introduction';
  }
  if (/\b(defin|what is)\b/.test(text)) return 'definition';
  if (/\b(classif|types|subtypes|divisions|vs\.?|versus|profiling|quadrant)\b/.test(text)) {
    return 'classification';
  }
  if (/\b(etiolog|causes|risk factor|triggers)\b/.test(text)) return 'etiology';
  if (/\b(pathophysiolog|mechanism|cascade|histolog|dysregulation)\b/.test(text)) {
    return 'pathophysiology';
  }
  if (/\b(clinical feature|symptom|presentation|bedside sign|indication|red flag)\b/.test(text)) {
    return 'clinical_features';
  }
  if (/\b(investigat|workup|diagnos|lab|imaging|endoscop|biopsy|interpretation)\b/.test(text)) {
    return 'investigations';
  }
  if (/\b(manag|treatment|therap|gdmt|pharmacolog|drug|washout|stabiliz|adverse|safety)\b/.test(text)) {
    return 'management';
  }

  const plan = selectAdaptiveLectureStages(topic);
  const teachingStages = plan.stages.filter((s) => s.stage !== 'summary');
  if (teachingStages.length === 0) return 'introduction';
  const mappedIdx = Math.min(
    teachingStages.length - 1,
    Math.floor((idx / Math.max(1, totalTeaching)) * teachingStages.length)
  );
  return teachingStages[mappedIdx].stage;
}

export interface LectureStoryboardSlideRow {
  sceneId: string;
  sceneNumber: number;
  pedagogicalStage: LecturePedagogicalStage;
  stageLabel: string;
  startSec: number;
  endSec: number;
  slideHeading: string;
  slideBullets: string[];
  visualMode: SceneVisualMode;
  visualDiagramSummary: string;
  visualLabels: string[];
  narrationText: string;
  sourceBadge: string;
}

/**
 * Builds the complete pre-render Narration Script + Matching Visual Storyboard
 * so every spoken explanation segment maps 1-to-1 to its right-side smartboard slide.
 */
export function buildCompleteLectureStoryboard(
  project: LectureProject
): {
  category: LectureTopicCategory;
  categoryLabel: string;
  omittedStages: LecturePedagogicalStage[];
  rows: LectureStoryboardSlideRow[];
} {
  const plan = selectAdaptiveLectureStages(project.topic);
  const timeline = computeSceneTimeline(project.scenes);
  const totalTeaching = Math.max(
    1,
    project.scenes.filter((s) => s.visualMode !== 'references').length
  );

  const rows: LectureStoryboardSlideRow[] = timeline.map((item, idx) => {
    const sc = item.scene;
    const stage = inferPedagogicalStage(sc, idx, totalTeaching, project.topic);
    const stageLabel = formatPedagogicalStageLabel(stage, plan.category);
    const bullets = (
      sc.keyBullets && sc.keyBullets.length > 0 ? sc.keyBullets : sc.onScreenLabels || []
    )
      .map((b) => b.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3);

    const narrationText =
      project.language === 'ar-eg' && sc.narrationArEg?.trim()
        ? sc.narrationArEg.trim()
        : (sc.narrationEn || '').trim();

    const sourceBadge =
      sc.sourceBasis === 'textbook' && sc.bookCitations && sc.bookCitations.length > 0
        ? `Uploaded Textbook: ${formatBookCitationsSummary(sc.bookCitations)}`
        : project.externalReferences && project.externalReferences.length > 0
          ? 'External Evidence + General Medical Knowledge'
          : 'General Medical Knowledge';

    return {
      sceneId: sc.id,
      sceneNumber: sc.sceneNumber,
      pedagogicalStage: stage,
      stageLabel,
      startSec: item.startSec,
      endSec: item.endSec,
      slideHeading: sc.title,
      slideBullets: bullets,
      visualMode: sc.visualMode,
      visualDiagramSummary: sc.visualDescription,
      visualLabels: (sc.onScreenLabels || []).slice(0, 4),
      narrationText,
      sourceBadge,
    };
  });

  return {
    category: plan.category,
    categoryLabel: plan.categoryLabel,
    omittedStages: plan.omittedStages,
    rows,
  };
}

export interface SceneTimelineItem {
  scene: LectureScene;
  index: number;
  startSec: number;
  endSec: number;
}

export function computeSceneTimeline(scenes: LectureScene[]): SceneTimelineItem[] {
  let cursor = 0;
  return scenes.map((scene, index) => {
    const dur = Math.max(4, Math.round((Number(scene.durationSec) || 12) * 10) / 10);
    const startSec = Math.round(cursor * 100) / 100;
    const endSec = Math.round((cursor + dur) * 100) / 100;
    cursor = endSec;
    return { scene: { ...scene, durationSec: dur, sceneNumber: index + 1 }, index, startSec, endSec };
  });
}

export function getTotalLectureDuration(scenes: LectureScene[]): number {
  const timeline = computeSceneTimeline(scenes);
  return timeline.length > 0 ? timeline[timeline.length - 1].endSec : 0;
}

export function findSceneAtTime(
  scenes: LectureScene[],
  timeSec: number
): {
  current: SceneTimelineItem;
  previous: SceneTimelineItem | null;
  localTimeSec: number;
  sceneProgress: number;
} {
  const timeline = computeSceneTimeline(scenes);
  if (timeline.length === 0) {
    throw new Error('Lecture has no scenes');
  }
  const clamped = Math.max(0, Math.min(timeSec, timeline[timeline.length - 1].endSec));
  for (let i = 0; i < timeline.length; i++) {
    const item = timeline[i];
    const isLast = i === timeline.length - 1;
    if (clamped < item.endSec || isLast) {
      const localTimeSec = Math.max(0, clamped - item.startSec);
      const dur = Math.max(0.1, item.endSec - item.startSec);
      return {
        current: item,
        previous: i > 0 ? timeline[i - 1] : null,
        localTimeSec,
        sceneProgress: Math.min(1, localTimeSec / dur),
      };
    }
  }
  const last = timeline[timeline.length - 1];
  return {
    current: last,
    previous: timeline.length > 1 ? timeline[timeline.length - 2] : null,
    localTimeSec: last.endSec - last.startSec,
    sceneProgress: 1,
  };
}

/**
 * Rescales scene durations to match a target lecture duration (e.g., 60s, 90s, 120s, 180s)
 * while maintaining minimum 5s per scene and exact total duration sum.
 */
export function rescaleLectureDuration(
  scenes: LectureScene[],
  targetDurationSec: number
): LectureScene[] {
  if (scenes.length === 0) return [];
  const minSceneFloors = scenes.map((s) =>
    s.audioWavBase64 && s.audioDurationSec && s.audioDurationSec > 0
      ? Math.ceil((s.audioDurationSec + 0.35) * 10) / 10
      : 5
  );
  const minTotalFloor = Math.ceil(minSceneFloors.reduce((a, b) => a + b, 0));
  const safeTarget = Math.max(
    scenes.length * 5,
    minTotalFloor,
    Math.min(600, Math.round(targetDurationSec))
  );
  const rawWeights = scenes.map((s, i) => {
    if (s.visualMode === 'references') return Math.max(minSceneFloors[i], s.durationSec || 7);
    const wordCount = (s.narrationEn || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(minSceneFloors[i], s.durationSec || Math.round(wordCount / 2.3) || 12);
  });
  const weightSum = rawWeights.reduce((acc, w) => acc + w, 0) || 1;
  const scaled = rawWeights.map((w, i) =>
    Math.max(minSceneFloors[i], Math.round((w / weightSum) * safeTarget))
  );

  // Adjust rounding drift on the longest teaching scene without ever dropping below minSceneFloors
  let diff = safeTarget - scaled.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    let bestIdx = 0;
    for (let i = 0; i < scaled.length; i++) {
      if (scenes[i].visualMode !== 'references' && scaled[i] > scaled[bestIdx]) {
        bestIdx = i;
      }
    }
    scaled[bestIdx] = Math.max(minSceneFloors[bestIdx], scaled[bestIdx] + diff);
  }

  return scenes.map((scene, idx) => ({
    ...scene,
    sceneNumber: idx + 1,
    durationSec: scaled[idx],
  }));
}

export function collectAggregateBookCitations(scenes: LectureScene[]): BookPageCitation[] {
  const byBook = new Map<string, { title: string; pages: Set<number> }>();
  for (const scene of scenes) {
    if (scene.visualMode === 'references') continue;
    for (const bc of scene.bookCitations || []) {
      if (!bc.textbookId || !Array.isArray(bc.pageNumbers)) continue;
      const entry = byBook.get(bc.textbookId) || {
        title: bc.textbookTitle || 'Textbook',
        pages: new Set<number>(),
      };
      for (const p of bc.pageNumbers) {
        if (Number.isInteger(p) && p > 0) entry.pages.add(p);
      }
      byBook.set(bc.textbookId, entry);
    }
  }

  return Array.from(byBook.entries())
    .filter(([, val]) => val.pages.size > 0)
    .map(([textbookId, val]) => ({
      textbookId,
      textbookTitle: val.title,
      pageNumbers: Array.from(val.pages).sort((a, b) => a - b),
    }));
}

export function buildReferencesScene(
  topic: string,
  systemTemplate: AnatomicalSystemTemplate,
  teachingScenes: LectureScene[],
  externalReferences: LectureExternalReference[] = [],
  existingId?: string,
  durationSec = 8
): LectureScene {
  const verifiedCitations = collectAggregateBookCitations(teachingScenes);
  const allPages = Array.from(
    new Set(verifiedCitations.flatMap((c) => c.pageNumbers))
  ).sort((a, b) => a - b);
  const hasSupplementary = teachingScenes.some(
    (s) => s.sourceBasis === 'general_medical_knowledge'
  );

  const spokenCitationSummary =
    verifiedCitations.length > 0
      ? verifiedCitations
          .map((bc) => {
            const cleanTitle = bc.textbookTitle.split(':')[0].trim();
            return `${cleanTitle}, ${buildPageCitationLabel(bc.pageNumbers)
              .replace(/^pp\.\s*/i, 'pages ')
              .replace(/^p\.\s*/i, 'page ')
              .replace(/[–—-]/g, ' to ')}`;
          })
          .join(' and ')
      : 'general medical physiology and clinical standards';

  const citationSummary = spokenCitationSummary;

  const labels: string[] = [];
  if (verifiedCitations.length > 0) {
    for (const bc of verifiedCitations.slice(0, 3)) {
      labels.push(`${shortenBookTitle(bc.textbookTitle, 28)} · ${buildPageCitationLabel(bc.pageNumbers)}`);
    }
  } else {
    labels.push('Textbook Match: 0 Verified Pages');
  }
  if (hasSupplementary) {
    labels.push('Supplementary Physiology Explicitly Labeled');
  }
  if (externalReferences.length > 0) {
    labels.push(`External Evidence (${externalReferences.length} Guidelines/Studies)`);
  }

  const keySummaryBullets = teachingScenes.slice(0, 3).map((s) => {
    const rawPoint =
      (s.keyBullets && s.keyBullets[0]) ||
      (s.onScreenLabels && s.onScreenLabels[0]) ||
      s.title;
    const shortPoint = rawPoint.length > 58 ? `${rawPoint.slice(0, 55).trim()}…` : rawPoint;
    return `${s.title.split(':')[0].trim()}: ${shortPoint}`;
  });

  const narrationEn =
    verifiedCitations.length > 0
      ? `To summarize ${topic}, connect normal baseline function to the underlying mechanism, recognize key bedside signs early, and apply targeted management safely. Primary clinical concepts in this lecture were verified in ${citationSummary}.${
          hasSupplementary
            ? ' Foundational physiology context outside those pages was labeled separately.'
            : ''
        }`
      : `To summarize ${topic}, always link normal baseline function to the core mechanism, recognize key clinical features early, and follow stepwise workup and management. Because no uploaded textbook pages matched this topic, all slides were presented from general medical knowledge.`;

  const narrationArEg =
    verifiedCitations.length > 0
      ? `وفي ملخص محاضرتنا عن ${topic}، افتكر دايماً تربط الـ Mechanism بالأعراض الإكلينيكية والفحوصات والعلاج الموجه بأمان. النقاط الإكلينيكية الأساسية متراجعة من ${citationSummary}.${
          hasSupplementary
            ? ' وأي خلفية فسيولوجية إضافية متوضحة بشكل منفصل.'
            : ''
        }`
      : `وفي ملخص محاضرتنا عن ${topic}، افتكر دايماً تربط الـ Mechanism بالأعراض والفحوصات والعلاج خطوة بخطوة. وبما إن الكتاب المرفوع مفيهوش صفحات مباشرة للموضوع ده، وضحنا إن الشرح مبني على General Medical Knowledge.`;

  return {
    id: existingId || `scene-ref-${Date.now()}`,
    sceneNumber: teachingScenes.length + 1,
    pedagogicalStage: 'summary',
    sectionKicker: `${String(teachingScenes.length + 1).padStart(2, '0')} · Summary`,
    title: `Summary: ${topic}`,
    visualMode: 'references',
    systemTemplate,
    narrationEn,
    narrationArEg,
    visualDescription:
      'Summary concept map and mechanism-to-management roadmap with verified source provenance.',
    onScreenLabels: labels.slice(0, 4),
    keyBullets: keySummaryBullets,
    highlightedCallouts: verifiedCitations.map((c) => c.textbookTitle),
    transitionType: 'fade',
    durationSec: Math.max(6, durationSec),
    sourceBasis: verifiedCitations.length > 0 ? 'textbook' : 'general_medical_knowledge',
    pageNumbers: allPages,
    bookCitations: verifiedCitations,
  };
}

const CURATED_MEDICAL_GLOSSARY: LectureGlossaryTerm[] = [
  {
    term: 'Cardiac Output',
    definition: 'Volume of blood ejected by the left ventricle per minute (CO = HR × Stroke Volume; normal ~4.5–6.0 L/min).',
    clinicalSignificance: 'Determines systemic oxygen delivery and end-organ tissue perfusion.',
  },
  {
    term: 'Preload',
    definition: 'End-diastolic ventricular wall stretch governed by venous return and filling volume.',
    clinicalSignificance: 'Elevated in congested ("Wet") heart failure; reduced via venodilators and loop diuretics.',
  },
  {
    term: 'Afterload',
    definition: 'Ventricular wall stress opposing ejection, primarily determined by systemic vascular resistance (SVR) and aortic pressure.',
    clinicalSignificance: 'Chronically elevated by RAAS and sympathetic vasoconstriction in HFrEF.',
  },
  {
    term: 'Frank-Starling',
    definition: 'Intrinsic myocardial property whereby increased diastolic sarcomere stretch augments contractile force up to physiological limits.',
    clinicalSignificance: 'Flattens in failing myocardium, causing volume overload without proportional stroke volume gain.',
  },
  {
    term: 'HFrEF',
    definition: 'Heart Failure with reduced Ejection Fraction, defined by left ventricular ejection fraction (LVEF) ≤ 40%.',
    clinicalSignificance: 'Indicates systolic pump dysfunction responsive to disease-modifying quadruple GDMT.',
  },
  {
    term: 'RAAS',
    definition: 'Renin-Angiotensin-Aldosterone System activated by renal hypoperfusion and sympathetic tone.',
    clinicalSignificance: 'Drives maladaptive sodium retention, vasoconstriction, and myocardial fibrosis in chronic heart failure.',
  },
  {
    term: 'LVEDP',
    definition: 'Left Ventricular End-Diastolic Pressure reflecting ventricular compliance and diastolic filling load.',
    clinicalSignificance: 'Retrograde transmission above ~18–25 mmHg forces transudate into pulmonary alveoli.',
  },
  {
    term: 'Pulmonary Edema',
    definition: 'Accumulation of extravascular fluid in pulmonary interstitium and alveoli due to elevated capillary hydrostatic pressure.',
    clinicalSignificance: 'Manifests clinically with dyspnea, orthopnea, bibasilar crackles, and hypoxemia.',
  },
  {
    term: 'Loop Diuretics',
    definition: 'Potent natriuretic agents (furosemide, bumetanide, torsemide) inhibiting NKCC2 in the thick ascending limb.',
    clinicalSignificance: 'First-line intravenous decongestive therapy for acute "Wet" volume-overloaded heart failure.',
  },
  {
    term: 'ARNI',
    definition: 'Angiotensin Receptor–Neprilysin Inhibitor (sacubitril/valsartan) augmenting natriuretic peptides while blocking AT1 receptors.',
    clinicalSignificance: 'Reduces cardiovascular mortality and HF hospitalization; requires a strict 36-hour washout after stopping an ACE inhibitor.',
  },
  {
    term: 'SGLT2',
    definition: 'Sodium-Glucose Cotransporter-2 inhibitors (dapagliflozin, empagliflozin) acting on the proximal renal tubule.',
    clinicalSignificance: 'Core pillar of HFrEF and CKD therapy reducing hospitalizations regardless of diabetes status.',
  },
  {
    term: 'Angioedema',
    definition: 'Rapid vascular permeability-mediated submucosal swelling of lips, tongue, or upper airway driven by bradykinin accumulation.',
    clinicalSignificance: 'Life-threatening complication if ACE inhibition and neprilysin inhibition overlap within 36 hours.',
  },
  {
    term: 'Anion Gap',
    definition: 'Measured serum [Na⁺] minus ([Cl⁻] + [HCO₃⁻]), normally 8–12 mEq/L, quantifying unmeasured plasma anions.',
    clinicalSignificance: 'Elevated in diabetic ketoacidosis (β-hydroxybutyrate, acetoacetate), lactic acidosis, and uremia.',
  },
  {
    term: 'Glomerular Filtration',
    definition: 'Ultrafiltration of plasma across glomerular endothelium, basement membrane, and podocytes (normal GFR ~90–120 mL/min/1.73m²).',
    clinicalSignificance: 'Regulated by afferent prostaglandin vasodilation and efferent angiotensin II tone.',
  },
  {
    term: 'Hypoxemia',
    definition: 'Reduced arterial oxygen tension (PaO₂ < 80 mmHg or SpO₂ < 90%) due to V/Q mismatch, shunt, hypoventilation, or diffusion limitation.',
    clinicalSignificance: 'Requires prompt oxygen titration and correction of underlying alveolar or airway pathology.',
  },
];

function extractSceneGlossaryTerms(scene: LectureScene): LectureGlossaryTerm[] {
  if (scene.glossaryTerms && scene.glossaryTerms.length > 0) {
    return scene.glossaryTerms.slice(0, 4);
  }
  const haystack = `${scene.title} ${scene.narrationEn} ${(scene.onScreenLabels || []).join(' ')} ${
    scene.supportingExcerpt || ''
  }`.toLowerCase();

  const matched = CURATED_MEDICAL_GLOSSARY.filter((entry) =>
    haystack.includes(entry.term.toLowerCase())
  );
  if (matched.length >= 2) {
    return matched.slice(0, 4);
  }

  // Deterministic fallback terms derived from onScreenLabels so every scene has clickable medical definitions
  const dynamic: LectureGlossaryTerm[] = [...matched];
  for (const rawLbl of scene.onScreenLabels || []) {
    if (dynamic.length >= 3) break;
    const clean = rawLbl.split(/[·:→(]/)[0].trim();
    if (clean.length < 3 || clean.length > 36) continue;
    if (dynamic.some((d) => d.term.toLowerCase() === clean.toLowerCase())) continue;
    dynamic.push({
      term: clean,
      definition: `Key physiological or clinical concept highlighted in "${scene.title}".`,
      clinicalSignificance:
        scene.sourceBasis === 'textbook' && scene.bookCitations.length > 0
          ? `Grounded in ${formatBookCitationsSummary(scene.bookCitations)}.`
          : 'Guides bedside mechanistic reasoning and clinical decision-making.',
    });
  }
  return dynamic.slice(0, 4);
}

function buildDefaultComparisonTable(
  scene: LectureScene,
  topic: string
): LectureComparisonTable | undefined {
  if (scene.comparisonTable && scene.comparisonTable.rows.length > 0) {
    return scene.comparisonTable;
  }
  if (scene.visualMode !== 'comparison' && scene.visualMode !== 'investigations') {
    return undefined;
  }

  const combined = `${topic} ${scene.title} ${scene.narrationEn}`.toLowerCase();
  if (combined.includes('warm') || combined.includes('wet') || combined.includes('heart failure') || combined.includes('hfref')) {
    return {
      caption: 'Table 1 · Bedside Forrester Hemodynamic Profiles in Acute Heart Failure',
      columns: ['Profile', 'Congestion (PCWP)', 'Perfusion (CI)', 'First-Line Bedside Management'],
      rows: [
        ['Warm & Dry', 'Absent (Normal)', 'Adequate', 'Optimize oral quadruple GDMT'],
        ['Warm & Wet', 'Elevated (Edema / JVD)', 'Adequate', 'IV loop diuretics (furosemide) ± vasodilators; avoid saline'],
        ['Cold & Dry', 'Low / Normal', 'Hypoperfused', 'Cautious fluid challenge vs inotrope if refractory'],
        ['Cold & Wet', 'Elevated (Congested)', 'Cardiogenic Shock', 'Vasopressors / inotropes + tailored decongestion'],
      ],
    };
  }

  if (scene.systemTemplate === 'endocrine' || combined.includes('ketoacidosis') || combined.includes('dka')) {
    return {
      caption: 'Table 1 · Hyperglycemic Crisis Diagnostic Comparison (DKA vs HHS)',
      columns: ['Parameter', 'Diabetic Ketoacidosis (DKA)', 'Hyperosmolar Hyperglycemic State (HHS)'],
      rows: [
        ['Plasma Glucose', '> 250 mg/dL (can be euglycemic on SGLT2i)', '> 600 mg/dL'],
        ['Arterial pH & HCO₃⁻', 'pH < 7.30 · HCO₃⁻ < 18 mEq/L', 'pH > 7.30 · HCO₃⁻ > 18 mEq/L'],
        ['Ketones & Anion Gap', 'Positive β-hydroxybutyrate · High AG', 'Minimal/absent ketones · Hyperosmolar (>320)'],
        ['Core Therapy', 'IV isotonic fluids + K⁺ check + IV insulin', 'Aggressive IV fluid resuscitation + IV insulin'],
      ],
    };
  }

  if (scene.systemTemplate === 'renal') {
    return {
      caption: 'Table 1 · Prerenal Azotemia vs Intrinsic Acute Tubular Necrosis (ATN)',
      columns: ['Diagnostic Index', 'Prerenal AKI', 'Intrinsic ATN'],
      rows: [
        ['BUN / Creatinine Ratio', '> 20 : 1', '10 – 15 : 1'],
        ['Fractional Excretion Na⁺ (FENa)', '< 1% (avid tubular Na⁺ retention)', '> 2% (tubular epithelial injury)'],
        ['Urine Osmolality', '> 500 mOsm/kg', '< 350 mOsm/kg (isosthenuria)'],
        ['Urine Sediment', 'Bland / hyaline casts', 'Muddy brown granular casts'],
      ],
    };
  }

  if (scene.systemTemplate === 'respiratory') {
    return {
      caption: 'Table 1 · Obstructive vs Restrictive Pulmonary Physiology',
      columns: ['Spirometry / Volume', 'Obstructive Pattern (Asthma / COPD)', 'Restrictive Pattern (ILD / Edema)'],
      rows: [
        ['FEV₁ / FVC Ratio', 'Reduced (< 0.70)', 'Normal or Increased (≥ 0.70)'],
        ['Total Lung Capacity (TLC)', 'Normal or Hyperinflated (↑ RV)', 'Decreased (< 80% predicted)'],
        ['Primary Mechanism', 'Airway narrowing & expiratory flow limitation', 'Reduced parenchymal or chest wall compliance'],
      ],
    };
  }

  const points = (scene.onScreenLabels || []).slice(0, 3);
  return {
    caption: `Table 1 · Structured Clinical Assessment — ${scene.title}`,
    columns: ['Clinical Dimension', 'Key Finding / Criterion', 'Bedside Implication'],
    rows: (points.length > 0 ? points : [topic, 'Diagnostic Workup', 'Risk Stratification']).map(
      (pt, i) => [
        `Criterion 0${i + 1}`,
        pt,
        i === 0
          ? 'Establishes primary working diagnosis'
          : i === 1
            ? 'Guides targeted laboratory & imaging confirmation'
            : 'Directs acute stabilization priority',
      ]
    ),
  };
}

export const MEDICAL_DISCIPLINE_META: Record<
  MedicalSubjectDiscipline,
  {
    id: MedicalSubjectDiscipline;
    label: string;
    shortBadge: string;
    accentHex: string;
    pedagogyFocus: string;
  }
> = {
  anatomy: {
    id: 'anatomy',
    label: 'Anatomy',
    shortBadge: 'ANAT',
    accentHex: '#0F4C81',
    pedagogyFocus: '3D Organ Models, Cutaway Cross-Sections & Spatial Relationships',
  },
  physiology: {
    id: 'physiology',
    label: 'Physiology',
    shortBadge: 'PHYS',
    accentHex: '#0284C7',
    pedagogyFocus: 'Dynamic Process Curves, Pressure/Electrical Flux & Feedback Loops',
  },
  pathology: {
    id: 'pathology',
    label: 'Pathology',
    shortBadge: 'PATH',
    accentHex: '#B91C1C',
    pedagogyFocus: 'Normal vs. Abnormal Comparison, H&E Histopathology & Disease Progression',
  },
  pharmacology: {
    id: 'pharmacology',
    label: 'Pharmacology',
    shortBadge: 'PHARM',
    accentHex: '#047857',
    pedagogyFocus: 'Receptor Binding, Intracellular Signaling, ADME PK & Drug Comparisons',
  },
  immunology: {
    id: 'immunology',
    label: 'Immunology',
    shortBadge: 'IMMUNO',
    accentHex: '#7C3AED',
    pedagogyFocus: 'APC–MHC Presentation, Lymphocytes, Antibodies, Cytokines & Complement',
  },
};

export function inferSceneDiscipline(
  scene: Pick<
    LectureScene,
    'visualMode' | 'systemTemplate' | 'title' | 'narrationEn' | 'subjectDiscipline'
  >,
  topic = '',
  preferredDiscipline?: MedicalSubjectDiscipline | 'auto'
): MedicalSubjectDiscipline {
  if (preferredDiscipline && preferredDiscipline !== 'auto') {
    return preferredDiscipline;
  }
  if (scene.subjectDiscipline) {
    return scene.subjectDiscipline;
  }
  const combined = `${topic} ${scene.title} ${scene.narrationEn}`.toLowerCase();

  if (
    scene.systemTemplate === 'immune' ||
    /\b(immun|antigen|mhc|cytokine|interleukin|complement|antibody|igg|igm|t-cell|b-cell|macrophage|dendritic|hypersensitiv|autoimmun|anaphylax|vaccine)\b/i.test(
      combined
    )
  ) {
    return 'immunology';
  }

  if (
    scene.visualMode === 'treatment' ||
    /\b(pharmacol|mechanism of action|receptor|antagonist|agonist|inhibitor|blocker|diuretic|furosemide|sacubitril|valsartan|arni|sglt2|washout|bioavailability|half-life|cytochrome|adverse effect|gdmt|dosing)\b/i.test(
      combined
    )
  ) {
    return 'pharmacology';
  }

  if (
    scene.visualMode === 'pathophysiology' ||
    /\b(patholog|histolog|biopsy|edema|fibrosis|necrosis|infarct|ischemi|hypertroph|remodeling|lesion|inflammation|congest|decompensat|shock|acidosis)\b/i.test(
      combined
    )
  ) {
    return 'pathology';
  }

  if (scene.visualMode === 'anatomy') {
    return 'anatomy';
  }

  if (/\b(anatom|chamber|valve|lobe|cortex|vessel|tract)\b/i.test(combined)) {
    return scene.visualMode === 'physiology' ? 'physiology' : 'anatomy';
  }

  if (
    scene.visualMode === 'physiology' ||
    /\b(physiolog|frank-starling|homeostasis|preload|afterload|stroke volume|cardiac output|filtration|clearance|autoregulat|action potential|membrane potential|feedback)\b/i.test(
      combined
    )
  ) {
    return 'physiology';
  }

  return 'pathology';
}

export interface DisciplineVisualSpec {
  discipline: MedicalSubjectDiscipline;
  headerBadge: string;
  boardSubtitle: string;
  physiology: {
    curveTitle: string;
    formulaLabel: string;
    xAxisLabel: string;
    yAxisLabel: string;
    normalLegend: string;
    shiftedLegend: string;
    normalPoints: Array<{ x: number; y: number }>; // x: 0..100, y: 0..100 (bottom-up value)
    shiftedPoints: Array<{ x: number; y: number }>;
    feedbackSteps: Array<{
      id: string;
      role: 'Stimulus' | 'Sensor' | 'Integrator' | 'Effector' | 'Feedback';
      label: string;
      detail: string;
    }>;
  };
  pathology: {
    normalTitle: string;
    normalBullets: string[];
    abnormalTitle: string;
    abnormalBullets: string[];
    histologyNormalLabel: string;
    histologyAbnormalLabel: string;
    progressionCascade: Array<{ stage: string; detail: string }>;
  };
  pharmacology: {
    pathwayTitle: string;
    mechanismSteps: Array<{ step: string; target: string; effect: string }>;
    adme: {
      absorption: string;
      distribution: string;
      metabolism: string;
      excretion: string;
    };
    safetyWatch: string;
    drugRows: Array<{
      agentClass: string;
      targetReceptor: string;
      clinicalAction: string;
      adverseWatch: string;
    }>;
  };
  immunology: {
    pathwayTitle: string;
    nodes: Array<{
      id: string;
      arm: 'Innate' | 'Synapse' | 'Humoral' | 'Effector' | 'Complement';
      title: string;
      detail: string;
    }>;
    cytokines: Array<{ name: string; source: string; effect: string }>;
    complementNote: string;
  };
}

export function getDisciplineVisualSpec(
  scene: LectureScene,
  topic: string,
  overrideDiscipline?: MedicalSubjectDiscipline
): DisciplineVisualSpec {
  const discipline =
    overrideDiscipline || inferSceneDiscipline(scene, topic);
  const meta = MEDICAL_DISCIPLINE_META[discipline];
  const canonical = canonicalizeMedicalTopic(topic || scene.title);
  const profile = canonical.domainProfile;
  const lower = `${canonical.canonicalTitle} ${scene.title} ${scene.narrationEn}`.toLowerCase();

  const isCardiac =
    canonical.organDomain === 'cardiovascular' ||
    /\b(hfref|hfpef|heart failure|myocardial|coronary|cardiac|ventricular)\b/i.test(lower);
  const isRenal =
    canonical.organDomain === 'renal_electrolytes' ||
    lower.includes('nephron') ||
    lower.includes('gfr');
  const isNeuro =
    canonical.organDomain === 'neurology' || lower.includes('synap') || lower.includes('cerebr');

  // 1. Physiology dynamic curve & homeostatic feedback loop (strictly topic-matched!)
  const physiology = isRenal
    ? {
        curveTitle: 'Glomerular Autoregulation & Filtration Pressure Curve',
        formulaLabel: 'GFR = Kf × [(PGC − PBS) − πGC]',
        xAxisLabel: 'Renal Arterial Perfusion Pressure (mmHg: 60 → 180)',
        yAxisLabel: 'GFR (mL/min/1.73m²)',
        normalLegend: 'Intact Myogenic + Tubuloglomerular Autoregulation',
        shiftedLegend: 'Impaired Efferent Tone / Hypoperfusion',
        normalPoints: [
          { x: 6, y: 22 },
          { x: 24, y: 74 },
          { x: 52, y: 78 },
          { x: 78, y: 79 },
          { x: 95, y: 88 },
        ],
        shiftedPoints: [
          { x: 6, y: 12 },
          { x: 24, y: 36 },
          { x: 52, y: 44 },
          { x: 78, y: 48 },
          { x: 95, y: 54 },
        ],
        feedbackSteps: [
          {
            id: 'fb-1',
            role: 'Stimulus' as const,
            label: '↓ NaCl Delivery at Macula Densa',
            detail: 'Reduced distal tubular Na⁺/Cl⁻ sensed by NKCC2 macula densa cells.',
          },
          {
            id: 'fb-2',
            role: 'Sensor' as const,
            label: 'Juxtaglomerular Apparatus (JGA)',
            detail: 'Paracrine adenosine falls while JG cells secrete renin.',
          },
          {
            id: 'fb-3',
            role: 'Integrator' as const,
            label: 'Angiotensin II Generation',
            detail: 'Renin → Ang I → ACE → Ang II intrarenal signaling.',
          },
          {
            id: 'fb-4',
            role: 'Effector' as const,
            label: 'Afferent Dilatation + Efferent Constriction',
            detail: 'Prostaglandins dilate afferent; Ang II constricts efferent arteriole.',
          },
          {
            id: 'fb-5',
            role: 'Feedback' as const,
            label: 'Restored P_GC & Stabilized GFR',
            detail: 'Negative feedback preserves glomerular hydrostatic filtration.',
          },
        ],
      }
    : isNeuro
      ? {
          curveTitle: 'Neuronal Action Potential & Ion Conductance Dynamics',
          formulaLabel: 'Vm: −70 mV → +35 mV (Na⁺ Influx / K⁺ Efflux)',
          xAxisLabel: 'Time (ms: 0 → 5 ms)',
          yAxisLabel: 'Membrane Potential Vm (mV)',
          normalLegend: 'Normal Fast Voltage-Gated Na⁺ / K⁺ Spike',
          shiftedLegend: 'Depolarization Block / Ischemic Depletion',
          normalPoints: [
            { x: 6, y: 24 },
            { x: 22, y: 32 },
            { x: 36, y: 90 },
            { x: 56, y: 14 },
            { x: 88, y: 24 },
          ],
          shiftedPoints: [
            { x: 6, y: 38 },
            { x: 22, y: 44 },
            { x: 38, y: 56 },
            { x: 62, y: 42 },
            { x: 88, y: 40 },
          ],
          feedbackSteps: [
            {
              id: 'fb-1',
              role: 'Stimulus' as const,
              label: 'Graded EPSP Reaches −55 mV Threshold',
              detail: 'Excitatory postsynaptic currents depolarize the axon hillock.',
            },
            {
              id: 'fb-2',
              role: 'Sensor' as const,
              label: 'Voltage-Gated Na⁺ Channels Open',
              detail: 'Rapid m-gate activation drives regenerative Na⁺ upstroke.',
            },
            {
              id: 'fb-3',
              role: 'Integrator' as const,
              label: 'Na⁺ Inactivation + Delayed K⁺ Efflux',
              detail: 'h-gate closes at peak while Kv channels repolarize membrane.',
            },
            {
              id: 'fb-4',
              role: 'Effector' as const,
              label: 'Presynaptic Ca²⁺ Influx → Exocytosis',
              detail: 'SNARE-mediated vesicle fusion releases neurotransmitter.',
            },
            {
              id: 'fb-5',
              role: 'Feedback' as const,
              label: 'Na⁺/K⁺-ATPase Restores Resting Gradient',
              detail: '3 Na⁺ extruded / 2 K⁺ imported per ATP hydrolyzed.',
            },
          ],
        }
      : isCardiac
        ? {
            curveTitle: 'Frank-Starling Ventricular Function & Hemodynamic Loop',
            formulaLabel: 'CO = HR × SV · Wall Stress ∝ (P × r) / 2h',
            xAxisLabel: 'Preload — LVEDP (mmHg: 4 → 28)',
            yAxisLabel: 'Stroke Volume / Cardiac Output',
            normalLegend: 'Healthy Myocardium (EF ≥ 50%)',
            shiftedLegend: `${canonical.canonicalTitle} Decompensation`,
            normalPoints: [
              { x: 8, y: 18 },
              { x: 26, y: 58 },
              { x: 48, y: 82 },
              { x: 72, y: 90 },
              { x: 92, y: 91 },
            ],
            shiftedPoints: [
              { x: 8, y: 10 },
              { x: 26, y: 26 },
              { x: 48, y: 36 },
              { x: 72, y: 39 },
              { x: 92, y: 35 },
            ],
            feedbackSteps: [
              {
                id: 'fb-1',
                role: 'Stimulus' as const,
                label: '↓ Stroke Volume & Arterial Perfusion',
                detail: 'Reduced ventricular ejection unloads carotid/aortic baroreceptors.',
              },
              {
                id: 'fb-2',
                role: 'Sensor' as const,
                label: 'Carotid Sinus Baroreceptors & Renal JGA',
                detail: 'Detects arterial underfilling and decreased renal perfusion.',
              },
              {
                id: 'fb-3',
                role: 'Integrator' as const,
                label: 'Sympathetic (β₁/α₁) + RAAS + ADH Surge',
                detail: 'Norepinephrine, Angiotensin II, Aldosterone, and Vasopressin rise.',
              },
              {
                id: 'fb-4',
                role: 'Effector' as const,
                label: '↑ SVR Afterload & Na⁺/H₂O Retention',
                detail: 'Supports blood pressure transiently while raising LVEDP.',
              },
              {
                id: 'fb-5',
                role: 'Feedback' as const,
                label: 'Wall Stress & Congestion Loop',
                detail: 'Neurohormonal load worsens remodeling until blocked by therapy.',
              },
            ],
          }
        : {
            curveTitle: `${canonical.canonicalTitle} — Homeostatic vs Pathological Response`,
            formulaLabel: `${profile.anatomicalRegionLabel} · Protective vs Injurious Balance`,
            xAxisLabel: 'Physiological Stress / Insult Intensity (Baseline → Acute)',
            yAxisLabel: 'Organ Protective Reserve & Mucosal/Tissue Integrity',
            normalLegend: `Normal ${profile.anatomicalRegionLabel} Homeostasis`,
            shiftedLegend: `Decompensated Reserve in ${canonical.canonicalTitle}`,
            normalPoints: [
              { x: 8, y: 84 },
              { x: 28, y: 82 },
              { x: 52, y: 78 },
              { x: 76, y: 74 },
              { x: 92, y: 70 },
            ],
            shiftedPoints: [
              { x: 8, y: 72 },
              { x: 28, y: 54 },
              { x: 52, y: 32 },
              { x: 76, y: 20 },
              { x: 92, y: 14 },
            ],
            feedbackSteps: [
              {
                id: 'fb-1',
                role: 'Stimulus' as const,
                label: profile.defaultLandmarks[0]?.label || 'Primary Physiological Trigger',
                detail: profile.defaultLandmarks[0]?.detail || profile.normalBaselineSummary,
              },
              {
                id: 'fb-2',
                role: 'Sensor' as const,
                label: profile.defaultLandmarks[1]?.label || 'Local Tissue / Receptor Sensing',
                detail: profile.defaultLandmarks[1]?.detail || profile.normalBaselineSummary,
              },
              {
                id: 'fb-3',
                role: 'Integrator' as const,
                label: `${canonical.canonicalTitle} Signaling Shift`,
                detail: profile.pathophysiologySummaryTemplate(canonical.canonicalTitle),
              },
              {
                id: 'fb-4',
                role: 'Effector' as const,
                label: profile.defaultLandmarks[2]?.label || 'Target Structural Response',
                detail:
                  profile.defaultLandmarks[2]?.detail ||
                  profile.pathophysiologySummaryTemplate(canonical.canonicalTitle),
              },
              {
                id: 'fb-5',
                role: 'Feedback' as const,
                label: 'Targeted Restoration of Homeostasis',
                detail: profile.diagnosticGoldStandardTemplate(canonical.canonicalTitle),
              },
            ],
          };

  // 2. Pathology: Normal vs Abnormal + Histopathology + Disease Progression (Topic-Locked!)
  const pathology = isCardiac
    ? {
        normalTitle: 'Normal Reference Architecture',
        normalBullets: [
          'Compact chamber geometry with preserved wall thickness and compliant filling (LVEDP ≤ 12 mmHg)',
          'Aligned striated cardiomyocytes with intact sarcomeres and normal interstitial collagen',
          'Thin, dry alveolar-capillary membranes (0.5 µm) enabling rapid O₂ diffusion',
        ],
        abnormalTitle: `Pathological Changes — ${scene.title}`,
        abnormalBullets:
          scene.keyBullets && scene.keyBullets.length >= 2
            ? scene.keyBullets.slice(0, 3)
            : [
                'Eccentric ventricular dilation with reduced ejection fraction and elevated LVEDP',
                'Myocyte hypertrophy, interstitial fibrosis, and engorged capillaries on histology',
                'Intra-alveolar transudate impairing gas exchange (orthopnea & rales)',
              ],
        histologyNormalLabel: 'Normal H&E Schematic: Parallel myofibers & air-filled alveoli',
        histologyAbnormalLabel:
          'Pathological H&E Schematic: Myocyte hypertrophy/fibrosis & alveolar edema fluid',
        progressionCascade: [
          {
            stage: '01. Index Insult',
            detail: 'Ischemic, pressure, or genetic myocardial contractility injury',
          },
          {
            stage: '02. Neurohormonal Drive',
            detail: 'Sustained RAAS, sympathetic norepinephrine, and cytokine activation',
          },
          {
            stage: '03. Tissue Remodeling',
            detail: 'Cellular hypertrophy, interstitial fibrosis, and elevated hydrostatic pressure',
          },
          {
            stage: '04. Clinical Decompensation',
            detail: 'Venous congestion and hypoperfusion requiring targeted GDMT',
          },
        ],
      }
    : {
        normalTitle: `Normal ${profile.anatomicalRegionLabel}`,
        normalBullets: [
          profile.normalBaselineSummary,
          ...profile.defaultLandmarks.slice(0, 2).map((lm) => `${lm.label}: ${lm.detail}`),
        ].slice(0, 3),
        abnormalTitle: `Pathological Changes in ${canonical.canonicalTitle}`,
        abnormalBullets:
          scene.keyBullets && scene.keyBullets.length >= 2
            ? scene.keyBullets.slice(0, 3)
            : [
                profile.pathophysiologySummaryTemplate(canonical.canonicalTitle),
                profile.pathologicalHistologyTemplate(canonical.canonicalTitle),
                profile.diagnosticGoldStandardTemplate(canonical.canonicalTitle),
              ],
        histologyNormalLabel: `Normal H&E Schematic: Intact ${profile.anatomicalRegionLabel} architecture`,
        histologyAbnormalLabel: `Pathological H&E Schematic: ${profile.pathologicalHistologyTemplate(
          canonical.canonicalTitle
        ).slice(0, 92)}`,
        progressionCascade: [
          {
            stage: '01. Baseline Disruption',
            detail: profile.normalBaselineSummary.slice(0, 120),
          },
          {
            stage: '02. Core Pathogenesis',
            detail: profile.pathophysiologySummaryTemplate(canonical.canonicalTitle).slice(0, 130),
          },
          {
            stage: '03. Histopathological Lesion',
            detail: profile.pathologicalHistologyTemplate(canonical.canonicalTitle).slice(0, 130),
          },
          {
            stage: '04. Diagnostic & Clinical Endpoint',
            detail: profile.diagnosticGoldStandardTemplate(canonical.canonicalTitle).slice(0, 130),
          },
        ],
      };

  // 3. Pharmacology: Topic-Locked Receptor Mechanism, ADME & Drug Comparison
  const domainDrugRows = profile.firstLineDrugRowsTemplate(canonical.canonicalTitle);
  const pharmacology = isCardiac
    ? {
        pathwayTitle: `Molecular Mechanism & Clinical Pharmacology — ${canonical.canonicalTitle}`,
        mechanismSteps: [
          {
            step: '01. Drug-Target Binding',
            target: 'ARNI · β₁-Blocker · MRA · SGLT2i · Loop Diuretic',
            effect: 'Selective receptor antagonism (AT₁R, β₁, MRA) + Neprilysin/SGLT2/NKCC2 inhibition',
          },
          {
            step: '02. Intracellular Transduction',
            target: '↑ Natriuretic Peptide → cGMP/PKG · ↓ Maladaptive cAMP/Ca²⁺ Overload',
            effect: 'Vasodilation, natriuresis, suppression of profibrotic aldosterone signaling',
          },
          {
            step: '03. Organ-Level Hemodynamic Shift',
            target: '↓ Preload (LVEDP) + ↓ Afterload (SVR) + Reverse Remodeling',
            effect: 'Improves stroke volume, relieves congestion, and reduces mortality',
          },
        ],
        adme: {
          absorption: 'Oral GDMT pillars (IV bolus loop diuretics in acute decompensation)',
          distribution: 'High plasma protein binding; targeted tubular lumen secretion',
          metabolism: 'Sacubitril prodrug → LBQ657 via esterases; hepatic CYP2D6 for β-blockers',
          excretion: 'Renal filtration & tubular secretion (monitor eGFR & serum K⁺)',
        },
        safetyWatch:
          scene.supportingExcerpt ||
          'Mandatory 36-hour washout when switching from ACEi to ARNI to prevent angioedema; monitor K⁺ and renal function.',
        drugRows: [
          {
            agentClass: 'ARNI (Sacubitril/Valsartan)',
            targetReceptor: 'Neprilysin inhibition + AT₁R blockade',
            clinicalAction: '↑ BNP/cGMP vasodilation & mortality reduction',
            adverseWatch: 'Angioedema (strict 36h ACEi washout), hypotension, ↑ K⁺',
          },
          {
            agentClass: 'Evidence-Based β-Blocker',
            targetReceptor: 'Cardiac β₁-adrenoceptor antagonism',
            clinicalAction: 'Blunts catecholamine cardiotoxicity & arrhythmia',
            adverseWatch: 'Avoid acute initiation in cardiogenic shock',
          },
          {
            agentClass: 'MRA (Spironolactone / Eplerenone)',
            targetReceptor: 'Nuclear aldosterone receptor blockade',
            clinicalAction: 'Inhibits myocardial fibrosis & Na⁺ retention',
            adverseWatch: 'Hyperkalemia (K⁺ > 5.0 mEq/L)',
          },
          {
            agentClass: 'SGLT2i + Loop Diuretic',
            targetReceptor: 'Proximal SGLT2 / Thick ascending NKCC2',
            clinicalAction: 'Osmotic/natriuretic decongestion & cardiorenal protection',
            adverseWatch: 'Volume depletion, hypokalemia (loops)',
          },
        ],
      }
    : {
        pathwayTitle: `Targeted Pharmacology & Therapeutics — ${canonical.canonicalTitle}`,
        mechanismSteps: domainDrugRows.slice(0, 3).map((row, rIdx) => ({
          step: `0${rIdx + 1}. ${row.drugClass}`,
          target: row.prototypeAgents,
          effect: `${row.mechanismOfAction} (${row.clinicalIndications})`,
        })),
        adme: {
          absorption: `Route tailored to severity of ${canonical.canonicalTitle} (oral maintenance vs IV acute stabilization)`,
          distribution: `Targeted delivery across ${profile.anatomicalRegionLabel}`,
          metabolism: 'Hepatic enzymatic biotransformation / prodrug activation where applicable',
          excretion: 'Renal & hepatobiliary clearance — adjust dosing for organ function',
        },
        safetyWatch:
          scene.supportingExcerpt ||
          domainDrugRows[0]?.adverseEffectsAndContraindications ||
          `Monitor therapeutic response and contraindications closely when treating ${canonical.canonicalTitle}.`,
        drugRows: domainDrugRows.slice(0, 4).map((row) => ({
          agentClass: `${row.drugClass} (${row.prototypeAgents})`,
          targetReceptor: row.mechanismOfAction,
          clinicalAction: row.clinicalIndications,
          adverseWatch: row.adverseEffectsAndContraindications,
        })),
      };

  // 4. Immunology: APC, T/B Cells, Antibodies, Cytokines & Complement
  const immunology = {
    pathwayTitle: `Innate-to-Adaptive Immune & Inflammatory Cascade — ${topic}`,
    nodes: [
      {
        id: 'imm-1',
        arm: 'Innate' as const,
        title: '01. DAMP / PAMP Recognition (TLRs)',
        detail:
          'Tissue injury or pathogen motifs activate macrophages and dendritic cells via Toll-like & NOD-like PRRs.',
      },
      {
        id: 'imm-2',
        arm: 'Synapse' as const,
        title: '02. MHC-II Antigen Presentation',
        detail:
          'Dendritic APC presents peptide on MHC-II to CD4⁺ TCR (Signal 1) + CD80/86–CD28 costimulation (Signal 2).',
      },
      {
        id: 'imm-3',
        arm: 'Humoral' as const,
        title: '03. B-Cell Clonal Expansion & IgG',
        detail:
          'TFH CD40L + IL-21 drives germinal center affinity maturation and Y-shaped antibody opsonization/neutralization.',
      },
      {
        id: 'imm-4',
        arm: 'Complement' as const,
        title: '04. Cytokine Amplification & C5b-9 MAC',
        detail:
          'Classical (C1q–IgG/IgM) & alternative C3 convertases generate C3b opsonin, C3a/C5a anaphylatoxins, and C5b-9 pore.',
      },
    ],
    cytokines: [
      {
        name: 'TNF-α & IL-1β',
        source: 'Activated Macrophages',
        effect: 'Endothelial E-selectin expression, fever, acute vascular permeability & negative inotropy',
      },
      {
        name: 'IL-6',
        source: 'Macrophages / Th2 / Endothelium',
        effect: 'Hepatic acute-phase reactants (CRP, fibrinogen, hepcidin)',
      },
      {
        name: 'IFN-γ & IL-12',
        source: 'Th1 / NK / Dendritic Cells',
        effect: 'Macrophage phagolysosomal activation & MHC class I/II upregulation',
      },
    ],
    complementNote:
      'Complement Bridge: C3b mediates opsonophagocytosis; C5a drives neutrophil chemotaxis; C5b-9 forms the cytolytic Membrane Attack Complex.',
  };

  return {
    discipline,
    headerBadge: `${meta.shortBadge} · ${meta.label.toUpperCase()} STUDIO`,
    boardSubtitle: meta.pedagogyFocus,
    physiology,
    pathology,
    pharmacology,
    immunology,
  };
}

function shortenSlideBullet(raw: string, maxChars = 72): string {
  const cleaned = (raw || '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  const clause = cleaned.split(/[;:—–]/)[0].trim();
  if (clause.length >= 16 && clause.length <= maxChars) return clause;
  return `${cleaned.slice(0, maxChars - 1).trim()}…`;
}

export function enrichSceneWithTextbookMetadata(
  scene: LectureScene,
  idx: number,
  topic: string,
  totalTeachingCount = 5
): LectureScene {
  const category = classifyLectureTopicCategory(topic);
  const pedagogicalStage = inferPedagogicalStage(scene, idx, totalTeachingCount, topic);
  const stageLabel = formatPedagogicalStageLabel(pedagogicalStage, category);
  const num = String(idx + 1).padStart(2, '0');
  const sectionKicker = `${num} · ${stageLabel}`;

  if (scene.visualMode === 'references') {
    return {
      ...scene,
      pedagogicalStage: 'summary',
      sectionKicker,
      keyBullets: (scene.keyBullets || scene.onScreenLabels || [])
        .map((b) => shortenSlideBullet(b, 72))
        .filter(Boolean)
        .slice(0, 3),
    };
  }

  const subjectDiscipline =
    scene.subjectDiscipline || inferSceneDiscipline(scene, topic);

  let keyBullets = scene.keyBullets;
  if (!keyBullets || keyBullets.length === 0) {
    const protectedText = (scene.narrationEn || '').replace(
      /\b(pp?|Dr|Prof|vs|Fig|No|eg|ie)\.\s+/gi,
      '$1\u0000 '
    );
    const sentences = protectedText
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.replace(/\u0000/g, '.').trim())
      .filter((s) => s.length > 8);

    const combined: string[] = [];
    for (const lbl of scene.onScreenLabels || []) {
      if (lbl.trim().length >= 4 && combined.length < 3) {
        combined.push(shortenSlideBullet(lbl, 68));
      }
    }
    for (const sent of sentences) {
      if (combined.length >= 3) break;
      const shortSent = shortenSlideBullet(sent, 72);
      if (!combined.some((c) => c.toLowerCase() === shortSent.toLowerCase())) {
        combined.push(shortSent);
      }
    }
    keyBullets = combined.slice(0, 3);
  } else {
    keyBullets = keyBullets
      .map((b) => shortenSlideBullet(b, 72))
      .filter(Boolean)
      .slice(0, 3);
  }

  const glossaryTerms = extractSceneGlossaryTerms(scene);
  const comparisonTable = buildDefaultComparisonTable(scene, topic);

  const clinicalPearl =
    scene.clinicalPearl ||
    (scene.supportingExcerpt
      ? shortenSlideBullet(scene.supportingExcerpt, 92)
      : scene.visualMode === 'physiology' || scene.visualMode === 'anatomy'
        ? `Understanding normal baseline function in ${topic} makes early clinical signs intuitive.`
        : `Always connect the mechanism of ${topic} directly to bedside findings and safe management.`);

  const pauseMoment: LecturePauseExplainMoment = scene.pauseMoment || {
    triggerProgress: 0.55,
    title: `Key Takeaway · ${scene.title}`,
    explanation:
      scene.supportingExcerpt
        ? `Clinical relevance: ${scene.supportingExcerpt}`
        : `Connect ${
            (scene.onScreenLabels && scene.onScreenLabels[0]) || scene.title
          } directly to how the patient presents and responds to treatment.`,
  };

  return {
    ...scene,
    pedagogicalStage,
    subjectDiscipline,
    sectionKicker,
    keyBullets,
    glossaryTerms,
    clinicalPearl,
    comparisonTable,
    pauseMoment,
  };
}

/**
 * Inserts Clinical Case + Single-Question Checkpoint Quizzes at major section transitions:
 * 1) After the Foundations & Pathophysiology section (transitioning into Clinical Profiling/Diagnostics)
 * 2) After the Clinical Profiling & Management section (transitioning into Final Revision & References)
 * Strictly preserves verified textbook citations without fabricating page numbers.
 */
export function attachCheckpointQuizzesToScenes(
  teachingScenes: LectureScene[],
  topic: string
): LectureScene[] {
  if (teachingScenes.length === 0) return [];

  const checkpointIndices = new Set<number>();
  if (teachingScenes.length >= 3) {
    checkpointIndices.add(Math.min(1, teachingScenes.length - 2));
    checkpointIndices.add(teachingScenes.length - 1);
  } else {
    checkpointIndices.add(teachingScenes.length - 1);
  }

  let quizCounter = 0;
  return teachingScenes.map((scene, idx) => {
    if (!checkpointIndices.has(idx)) {
      return { ...scene, checkpointQuiz: undefined };
    }
    quizCounter += 1;

    if (
      scene.checkpointQuiz &&
      scene.checkpointQuiz.options.length >= 2 &&
      scene.checkpointQuiz.question.trim().length > 5
    ) {
      return scene;
    }

    const citationLabel =
      scene.sourceBasis === 'textbook' && scene.bookCitations.length > 0
        ? formatBookCitationsSummary(scene.bookCitations)
        : undefined;

    const lower = `${topic} ${scene.title} ${scene.narrationEn}`.toLowerCase();
    let builtQuiz: LectureCheckpointQuiz;

    if (lower.includes('lvedp') || (lower.includes('hfref') && scene.visualMode === 'pathophysiology')) {
      builtQuiz = {
        id: `cp-${scene.id}`,
        sectionLabel: `Checkpoint ${quizCounter} · Pathophysiology Transition`,
        clinicalCaseVignette:
          'Clinical Case: A 64-year-old man with ischemic cardiomyopathy (LVEF 28%) presents with acute orthopnea, SpO₂ 89% on room air, elevated jugular venous pressure, and bilateral inspiratory crackles.',
        question:
          'In HFrEF (LVEF ≤ 40%), what hemodynamic cascade directly drives acute alveolar pulmonary edema?',
        options: [
          'Elevated left ventricular end-diastolic pressure (LVEDP) transmitting hydrostatic back-pressure into pulmonary capillaries',
          'Decreased systemic vascular resistance (SVR) causing primary pulmonary arterial vasodilation',
          'Suppressed renin-angiotensin-aldosterone system (RAAS) activity lowering left atrial volume',
          'Isolated right ventricular hypertrophy reducing pulmonary venous pressure',
        ],
        correctIndex: 0,
        explanation:
          'Impaired systolic ejection in HFrEF coupled with chronic RAAS/sympathetic vasoconstriction raises LVEDP and pulmonary capillary hydrostatic pressure, forcing transudate into alveoli.',
        citationLabel,
      };
    } else if (lower.includes('36-hour') || lower.includes('arni') || lower.includes('sacubitril')) {
      builtQuiz = {
        id: `cp-${scene.id}`,
        sectionLabel: `Checkpoint ${quizCounter} · Clinical Therapeutics Transition`,
        clinicalCaseVignette:
          'Clinical Case: Following IV furosemide decongestion, the inpatient team plans to transition a stabilized HFrEF patient from oral lisinopril (an ACE inhibitor) to sacubitril/valsartan (ARNI) prior to discharge.',
        question:
          'When transitioning a patient with HFrEF from an ACE inhibitor to sacubitril/valsartan (ARNI), which safety protocol is mandatory?',
        options: [
          'Co-administer both agents for 48 hours to prevent rebound hypertension',
          'Enforce a strict 36-hour washout period after stopping the ACE inhibitor to prevent bradykinin-mediated angioedema',
          'Administer an intravenous normal saline bolus prior to the first ARNI dose',
          'Discontinue beta-blocker therapy permanently before starting ARNI',
        ],
        correctIndex: 1,
        explanation:
          'Both ACE inhibitors and neprilysin inhibitors impair bradykinin degradation; overlapping them within 36 hours risks life-threatening angioedema.',
        citationLabel,
      };
    } else if (lower.includes('warm') && lower.includes('wet')) {
      builtQuiz = {
        id: `cp-${scene.id}`,
        sectionLabel: `Checkpoint ${quizCounter} · Bedside Profiling Transition`,
        clinicalCaseVignette:
          'Clinical Case: A 68-year-old woman with chronic heart failure arrives with 4+ pitting edema, bibasilar rales, BP 134/82 mmHg, and warm, well-perfused extremities.',
        question:
          'Which initial therapy is indicated for an acute decompensated heart failure patient classified as "Warm and Wet"?',
        options: [
          'Rapid 1 L intravenous 0.9% normal saline bolus',
          'Intravenous loop diuretics (e.g., furosemide) for decongestion while avoiding routine saline boluses',
          'Immediate high-dose oral beta-blocker initiation during acute pulmonary edema',
          'Withholding all diuretics until serum creatinine falls below 0.6 mg/dL',
        ],
        correctIndex: 1,
        explanation:
          'Warm & Wet patients have adequate systemic perfusion with pulmonary/systemic congestion; IV loop diuretics relieve volume overload, whereas saline boluses worsen edema.',
        citationLabel,
      };
    } else {
      const primaryPoint =
        (scene.keyBullets && scene.keyBullets[0]) ||
        (scene.onScreenLabels && scene.onScreenLabels[0]) ||
        scene.narrationEn.split(/(?<=[.?!])\s+/)[0] ||
        scene.title;

      const truncatedCorrect =
        primaryPoint.length > 135 ? `${primaryPoint.slice(0, 132).trim()}…` : primaryPoint;

      builtQuiz = {
        id: `cp-${scene.id}`,
        sectionLabel: `Checkpoint ${quizCounter} · Section ${idx + 1} Transition`,
        clinicalCaseVignette: `Clinical Case Checkpoint: Applying ${scene.title} during bedside evaluation of ${topic}.`,
        question: `Before advancing to the next section on ${topic}, which statement accurately summarizes "${scene.title}"?`,
        options: [
          truncatedCorrect,
          `Pathological decompensation in ${topic} occurs without any homeostatic or neurohormonal response`,
          `Routine empiric fluid loading replaces targeted workup regardless of perfusion or volume status`,
          `Diagnostic confirmation should be deferred until late-stage irreversible organ fibrosis develops`,
        ],
        correctIndex: 0,
        explanation: `${truncatedCorrect} ${
          citationLabel
            ? `(Verified in ${citationLabel})`
            : '(Grounded in core physiological and clinical principles from this section.)'
        }`,
        citationLabel,
      };
    }

    return {
      ...scene,
      checkpointQuiz: builtQuiz,
    };
  });
}

/**
 * Generates the complete Final Animated Revision Pack (structured summary, cross-disciplinary mind map,
 * directed mechanism-to-management flowchart, and high-yield exam points) for any lecture project.
 */
export function buildLectureRevisionPack(project: {
  topic: string;
  scenes: LectureScene[];
  bookCitations?: BookPageCitation[];
}): LectureRevisionPack {
  const teaching = project.scenes.filter((s) => s.visualMode !== 'references');
  const structuredSummary = teaching.slice(0, 5).map((s, idx) => {
    const lead =
      (s.keyBullets && s.keyBullets[0]) ||
      s.narrationEn.split(/(?<=[.?!])\s+/)[0] ||
      s.title;
    const cit =
      s.sourceBasis === 'textbook' && s.bookCitations.length > 0
        ? ` [${formatBookCitationsSummary(s.bookCitations)}]`
        : '';
    return `${idx + 1}. ${s.title}: ${lead}${cit}`;
  });

  const examPoints = teaching.slice(0, 4).map((s) => {
    if (s.clinicalPearl) return s.clinicalPearl;
    const label = (s.onScreenLabels && s.onScreenLabels[0]) || s.title;
    return `${s.title} — High-yield focus: ${label}`;
  });

  const mapCategories: Array<
    'physiology' | 'pathophysiology' | 'diagnosis' | 'management' | 'clinical'
  > = ['physiology', 'pathophysiology', 'diagnosis', 'management', 'clinical'];

  const mindMap: MindMapData = {
    centralTopic: project.topic,
    centralSubtitle: `${teaching.length} Cross-Disciplinary Pillars`,
    nodes: teaching.slice(0, 5).map((s, idx) => {
      const disc = inferSceneDiscipline(s, project.topic);
      return {
        id: `rev-mm-${s.id}`,
        label: s.title.length > 34 ? `${s.title.slice(0, 32).trim()}…` : s.title,
        disciplineTag: disc,
        relationLabel:
          disc === 'anatomy'
            ? 'Structure'
            : disc === 'physiology'
              ? 'Mechanism'
              : disc === 'pathology'
                ? 'Pathology'
                : disc === 'immunology'
                  ? 'Immune Link'
                  : 'Pharmacology',
        category: mapCategories[idx % mapCategories.length],
        summary:
          (s.keyBullets && s.keyBullets[0]) ||
          (s.onScreenLabels || []).slice(0, 2).join(' · ') ||
          s.visualDescription,
        sourceBasis: s.sourceBasis,
        pageNumbers: s.pageNumbers,
        bookCitations: s.bookCitations,
      };
    }),
  };

  const flowNodes = teaching.slice(0, 4).map((s, idx, arr) => ({
    id: `rev-fn-${idx + 1}`,
    label: `${idx + 1}. ${s.title.length > 38 ? `${s.title.slice(0, 36).trim()}…` : s.title}`,
    detail: (s.onScreenLabels && s.onScreenLabels[0]) || s.visualMode.replace('_', ' '),
    nodeType:
      idx === 0
        ? ('start' as const)
        : s.visualMode === 'comparison' || s.visualMode === 'investigations'
          ? ('decision' as const)
          : idx === arr.length - 1
            ? ('action' as const)
            : ('process' as const),
  }));

  const flowEdges = flowNodes.slice(0, -1).map((node, idx) => ({
    from: node.id,
    to: flowNodes[idx + 1].id,
    label: idx === 0 ? 'Dysregulation' : idx === 1 ? 'Bedside Workup' : 'Targeted Therapy',
  }));

  const aggCitations = project.bookCitations || collectAggregateBookCitations(project.scenes);
  const flowchart: FlowchartData = {
    id: `rev-flow-${project.topic.slice(0, 16)}`,
    title: `${project.topic} — Mechanism-to-Management Synthesis`,
    flowType: 'management',
    nodes: flowNodes,
    edges: flowEdges,
    sourceBasis: aggCitations.length > 0 ? 'textbook' : 'general_medical_knowledge',
    pageNumbers: Array.from(new Set(aggCitations.flatMap((c) => c.pageNumbers))),
    bookCitations: aggCitations,
  };

  return {
    structuredSummary,
    examPoints,
    mindMap,
    flowchart,
  };
}

/**
 * Ensures scene numbering is sequential, textbook metadata & section-transition Checkpoint Quizzes
 * are populated, and the final scene is always an up-to-date References & Revision scene.
 * Preserves all verified narration scripts and synthesized WAV audio tracks untouched.
 */
export function normalizeLectureScenes(
  topic: string,
  systemTemplate: AnatomicalSystemTemplate,
  scenes: LectureScene[],
  externalReferences: LectureExternalReference[] = []
): LectureScene[] {
  const existingRef = scenes.find((s) => s.visualMode === 'references');
  const teaching = scenes.filter((s) => s.visualMode !== 'references');

  const baseTeaching: LectureScene[] =
    teaching.length > 0
      ? teaching.map((s, idx) => ({
          ...s,
          sceneNumber: idx + 1,
          onScreenLabels: (s.onScreenLabels || []).map((l) => l.trim()).filter(Boolean).slice(0, 5),
          durationSec: Math.max(4, Math.round((Number(s.durationSec) || 12) * 100) / 100),
        }))
      : [
          {
            id: 'scene-fallback-1',
            sceneNumber: 1,
            title: `${topic}: Core Overview`,
            visualMode: 'physiology',
            systemTemplate,
            narrationEn: `Let us review the core physiological and clinical principles of ${topic}.`,
            narrationArEg: `تعالوا نراجع مع بعض الأساسيات الفسيولوجية والإكلينيكية لموضوع ${topic}.`,
            visualDescription: `Animated overview of ${topic}.`,
            onScreenLabels: [topic, 'Core Mechanism'],
            highlightedCallouts: [],
            transitionType: 'fade',
            durationSec: 12,
            sourceBasis: 'general_medical_knowledge',
            pageNumbers: [],
            bookCitations: [],
          },
        ];

  const enrichedTeaching = attachCheckpointQuizzesToScenes(
    baseTeaching.map((s, idx) =>
      enrichSceneWithTextbookMetadata(s, idx, topic, baseTeaching.length)
    ),
    topic
  );

  const refScene = enrichSceneWithTextbookMetadata(
    buildReferencesScene(
      topic,
      systemTemplate,
      enrichedTeaching,
      externalReferences,
      existingRef?.id,
      existingRef?.durationSec || 8
    ),
    enrichedTeaching.length,
    topic,
    enrichedTeaching.length
  );

  // Preserve verified audio on the references scene when its narration for that language is unchanged
  if (existingRef && existingRef.audioWavBase64) {
    const sameNarration =
      existingRef.audioLang === 'ar-eg'
        ? existingRef.narrationArEg === refScene.narrationArEg
        : existingRef.narrationEn === refScene.narrationEn;
    if (sameNarration) {
      refScene.audioWavBase64 = existingRef.audioWavBase64;
      refScene.audioLang = existingRef.audioLang;
      refScene.audioDurationSec = existingRef.audioDurationSec;
      refScene.audioMeanDb = existingRef.audioMeanDb;
      refScene.audioPeakDb = existingRef.audioPeakDb;
      refScene.audioSampleRate = existingRef.audioSampleRate;
      refScene.audioModelUsed = existingRef.audioModelUsed;
    }
  }
  if (existingRef?.audioError) {
    refScene.audioError = existingRef.audioError;
  }

  return [...enrichedTeaching, { ...refScene, sceneNumber: enrichedTeaching.length + 1 }];
}

export function reorderLectureScene(
  scenes: LectureScene[],
  fromIndex: number,
  toIndex: number,
  topic: string,
  systemTemplate: AnatomicalSystemTemplate,
  externalReferences: LectureExternalReference[] = []
): LectureScene[] {
  const teaching = scenes.filter((s) => s.visualMode !== 'references');
  const existingRef = scenes.find((s) => s.visualMode === 'references');
  if (
    fromIndex < 0 ||
    fromIndex >= teaching.length ||
    toIndex < 0 ||
    toIndex >= teaching.length ||
    fromIndex === toIndex
  ) {
    return scenes;
  }
  const copy = [...teaching];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return normalizeLectureScenes(
    topic,
    systemTemplate,
    existingRef ? [...copy, existingRef] : copy,
    externalReferences
  );
}

function formatTimestampSrt(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hrs = Math.floor(totalMs / 3_600_000);
  const mins = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
    secs
  ).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatTimestampVtt(seconds: number): string {
  return formatTimestampSrt(seconds).replace(',', '.');
}

export interface SubtitleCue {
  index: number;
  sceneId: string;
  startSec: number;
  endSec: number;
  text: string;
}

export function splitNarrationIntoCues(
  scenes: LectureScene[],
  language: LanguageMode
): SubtitleCue[] {
  const timeline = computeSceneTimeline(scenes);
  const cues: SubtitleCue[] = [];
  let cueCounter = 1;

  for (const item of timeline) {
    const rawText =
      language === 'ar-eg' && item.scene.narrationArEg?.trim()
        ? item.scene.narrationArEg.trim()
        : (item.scene.narrationEn || '').trim();

    if (!rawText) continue;

    // Split on sentence boundaries while protecting medical/citation abbreviations (p., pp., Dr., Prof., vs., Fig.)
    const protectedText = rawText.replace(
      /\b(pp?|Dr|Prof|vs|Fig|No|eg|ie)\.\s+/gi,
      '$1\u0000 '
    );
    const rawSentences = protectedText
      .split(/(?<=[.?!،؛])\s+/)
      .map((s) => s.replace(/\u0000/g, '.').trim())
      .filter(Boolean);

    const chunks: string[] = [];
    for (const sentence of rawSentences) {
      if (sentence.length <= 84) {
        chunks.push(sentence);
      } else {
        const words = sentence.split(/\s+/);
        let current = '';
        for (const w of words) {
          if ((current + ' ' + w).trim().length > 78 && current.length > 0) {
            chunks.push(current.trim());
            current = w;
          } else {
            current = current ? `${current} ${w}` : w;
          }
        }
        if (current.trim()) chunks.push(current.trim());
      }
    }

    const validChunks = chunks.length > 0 ? chunks : [rawText];
    const totalChars = validChunks.reduce((sum, c) => sum + Math.max(4, c.length), 0) || 1;
    const sceneDuration = Math.max(1, item.endSec - item.startSec);

    let cursor = item.startSec;
    validChunks.forEach((chunk, idx) => {
      const isLast = idx === validChunks.length - 1;
      const share = (Math.max(4, chunk.length) / totalChars) * sceneDuration;
      const end = isLast ? item.endSec : Math.min(item.endSec, cursor + share);
      cues.push({
        index: cueCounter++,
        sceneId: item.scene.id,
        startSec: Math.round(cursor * 1000) / 1000,
        endSec: Math.round(Math.max(cursor + 0.25, end) * 1000) / 1000,
        text: chunk,
      });
      cursor = end;
    });
  }

  return cues;
}

export function getActiveSubtitleCue(
  cues: SubtitleCue[],
  timeSec: number
): SubtitleCue | null {
  for (const cue of cues) {
    if (timeSec >= cue.startSec && timeSec <= cue.endSec + 0.05) {
      return cue;
    }
  }
  return null;
}

export function generateSrtSubtitles(
  scenes: LectureScene[],
  language: LanguageMode
): string {
  const cues = splitNarrationIntoCues(scenes, language);
  return cues
    .map(
      (cue) =>
        `${cue.index}\n${formatTimestampSrt(cue.startSec)} --> ${formatTimestampSrt(
          cue.endSec
        )}\n${cue.text}\n`
    )
    .join('\n');
}

export function generateVttSubtitles(
  scenes: LectureScene[],
  language: LanguageMode
): string {
  const cues = splitNarrationIntoCues(scenes, language);
  const body = cues
    .map(
      (cue) =>
        `${cue.index}\n${formatTimestampVtt(cue.startSec)} --> ${formatTimestampVtt(
          cue.endSec
        )}\n${cue.text}\n`
    )
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

function resolveSceneCitationsFromTags(
  rawTags: unknown,
  rawPageNumbers: unknown,
  rawSourceBasis: unknown,
  retrieval: MultiBookRetrievalResult
): {
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations: BookPageCitation[];
} {
  if (retrieval.coverage === 'none' || retrieval.allowedTagSet.size === 0) {
    return {
      sourceBasis: 'general_medical_knowledge',
      pageNumbers: [],
      bookCitations: [],
    };
  }

  const bookMap = new Map(retrieval.bookMappings.map((m) => [m.bookKey, m]));
  const verifiedByBook = new Map<string, Set<number>>();

  if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      const normalized = String(t || '').trim().toUpperCase();
      if (!retrieval.allowedTagSet.has(normalized)) continue;
      const [bookKey, pageStr] = normalized.split(':');
      const pageNum = Number(pageStr);
      const mapping = bookMap.get(bookKey);
      if (mapping && Number.isInteger(pageNum) && pageNum > 0) {
        const set = verifiedByBook.get(mapping.textbookId) || new Set<number>();
        set.add(pageNum);
        verifiedByBook.set(mapping.textbookId, set);
      }
    }
  }

  // Fallback check if single book and model returned integer pageNumbers present in retrieved passages
  if (verifiedByBook.size === 0 && Array.isArray(rawPageNumbers)) {
    for (const p of rawPageNumbers) {
      const pg = Number(p);
      if (!Number.isInteger(pg) || pg <= 0) continue;
      for (const passage of retrieval.passages) {
        if (passage.pageNumber === pg && passage.textbookId) {
          const set = verifiedByBook.get(passage.textbookId) || new Set<number>();
          set.add(pg);
          verifiedByBook.set(passage.textbookId, set);
        }
      }
    }
  }

  const bookCitations: BookPageCitation[] = [];
  const flatPages = new Set<number>();
  for (const mapping of retrieval.bookMappings) {
    const pages = verifiedByBook.get(mapping.textbookId);
    if (pages && pages.size > 0) {
      const sorted = Array.from(pages).sort((a, b) => a - b);
      sorted.forEach((p) => flatPages.add(p));
      bookCitations.push({
        textbookId: mapping.textbookId,
        textbookTitle: mapping.textbookTitle,
        pageNumbers: sorted,
      });
    }
  }

  if (bookCitations.length === 0 || rawSourceBasis === 'general_medical_knowledge') {
    return {
      sourceBasis: 'general_medical_knowledge',
      pageNumbers: [],
      bookCitations: [],
    };
  }

  return {
    sourceBasis: 'textbook',
    pageNumbers: Array.from(flatPages).sort((a, b) => a - b),
    bookCitations,
  };
}

const VALID_VISUAL_MODES: SceneVisualMode[] = [
  'anatomy',
  'physiology',
  'pathophysiology',
  'investigations',
  'treatment',
  'comparison',
  'clinical_flow',
  'references',
];

const VALID_TRANSITIONS: SceneTransitionType[] = ['fade', 'slide', 'zoom_focus', 'wipe'];

const VALID_TEMPLATES: AnatomicalSystemTemplate[] = [
  'cardiopulmonary',
  'renal',
  'respiratory',
  'hepatobiliary',
  'endocrine',
  'neurology',
  'hematology',
  'immune',
  'general_physiology',
];

const VALID_DISCIPLINES: MedicalSubjectDiscipline[] = [
  'anatomy',
  'physiology',
  'pathology',
  'pharmacology',
  'immunology',
];

/**
 * Sanitizes raw LLM JSON output for a lecture script, strictly stripping any unverified
 * textbook citations and appending a verified References scene.
 */
export function sanitizeLectureProjectResponse(
  raw: Record<string, unknown>,
  selectedBooks: MedicalTextbook[],
  topic: string,
  retrieval: MultiBookRetrievalResult,
  options: {
    presenterId: DoctorPersonaId;
    language: LanguageMode;
    targetDurationSec: number;
    preferredDiscipline?: MedicalSubjectDiscipline | 'auto';
    externalReferences?: LectureExternalReference[];
  }
): LectureProject {
  const cleanTopic = String(raw.topic || topic).trim() || topic.trim();
  const inferredSystem = VALID_TEMPLATES.includes(
    raw.systemTemplate as AnatomicalSystemTemplate
  )
    ? (raw.systemTemplate as AnatomicalSystemTemplate)
    : inferOrganSystemFromTopic(
        cleanTopic,
        retrieval.passages.map((p) => p.text).join(' ')
      );

  const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  const sanitizedTeaching: LectureScene[] = [];

  rawScenes.forEach((item: unknown, idx: number) => {
    if (!item || typeof item !== 'object') return;
    const s = item as Record<string, unknown>;
    const modeRaw = String(s.visualMode || 'physiology') as SceneVisualMode;
    if (modeRaw === 'references') return; // Rebuilt deterministically at the end

    const visualMode: SceneVisualMode = VALID_VISUAL_MODES.includes(modeRaw)
      ? modeRaw
      : idx === 0
        ? 'anatomy'
        : idx === 1
          ? 'physiology'
          : idx === 2
            ? 'pathophysiology'
            : 'clinical_flow';

    const transitionType: SceneTransitionType = VALID_TRANSITIONS.includes(
      s.transitionType as SceneTransitionType
    )
      ? (s.transitionType as SceneTransitionType)
      : idx === 0
        ? 'fade'
        : 'slide';

    const sceneSystem: AnatomicalSystemTemplate = VALID_TEMPLATES.includes(
      s.systemTemplate as AnatomicalSystemTemplate
    )
      ? (s.systemTemplate as AnatomicalSystemTemplate)
      : inferredSystem;

    const rawDiscipline = String(s.subjectDiscipline || '').trim().toLowerCase() as MedicalSubjectDiscipline;
    const subjectDiscipline: MedicalSubjectDiscipline | undefined = VALID_DISCIPLINES.includes(
      rawDiscipline
    )
      ? rawDiscipline
      : options.preferredDiscipline && options.preferredDiscipline !== 'auto'
        ? options.preferredDiscipline
        : undefined;

    const resolvedCitations = resolveSceneCitationsFromTags(
      s.citationTags,
      s.pageNumbers,
      s.sourceBasis,
      retrieval
    );

    const narrationEn =
      String(s.narrationEn || '').trim() ||
      `Here we examine ${String(s.title || cleanTopic)} and its clinical significance.`;
    const narrationArEg =
      String(s.narrationArEg || '').trim() ||
      `هنا بنشرح ${String(s.title || cleanTopic)} وأهميته الإكلينيكية بطريقة مبسطة.`;

    const labels = Array.isArray(s.onScreenLabels)
      ? s.onScreenLabels
          .map((l) => String(l || '').trim())
          .filter(Boolean)
          .slice(0, 5)
      : [cleanTopic];

    const matchingPassage =
      resolvedCitations.bookCitations.length > 0
        ? retrieval.passages.find(
            (p) =>
              p.textbookId === resolvedCitations.bookCitations[0].textbookId &&
              p.pageNumber === resolvedCitations.bookCitations[0].pageNumbers[0]
          )
        : undefined;

    const rawStage = String(s.pedagogicalStage || '')
      .trim()
      .toLowerCase() as LecturePedagogicalStage;
    const pedagogicalStage: LecturePedagogicalStage | undefined = ALL_CANONICAL_STAGES.includes(
      rawStage
    )
      ? rawStage
      : undefined;

    const rawBullets = Array.isArray(s.keyBullets)
      ? s.keyBullets
          .map((b) => String(b || '').trim())
          .filter(Boolean)
          .slice(0, 3)
      : undefined;

    sanitizedTeaching.push({
      id: `scene-${Date.now()}-${idx + 1}`,
      sceneNumber: idx + 1,
      pedagogicalStage,
      title: String(s.title || `Scene ${idx + 1}: ${cleanTopic}`).trim(),
      visualMode,
      subjectDiscipline,
      systemTemplate: sceneSystem,
      narrationEn,
      narrationArEg,
      visualDescription:
        String(s.visualDescription || '').trim() ||
        `Synchronized ${visualMode} smartboard diagram illustrating ${cleanTopic}.`,
      onScreenLabels: labels.length > 0 ? labels.slice(0, 4) : [cleanTopic],
      keyBullets: rawBullets,
      highlightedCallouts: Array.isArray(s.highlightedCallouts)
        ? s.highlightedCallouts.map((c) => String(c || '').trim()).filter(Boolean).slice(0, 4)
        : labels.slice(0, 3),
      transitionType,
      durationSec: Math.max(5, Number(s.durationSec) || 14),
      sourceBasis: resolvedCitations.sourceBasis,
      pageNumbers: resolvedCitations.pageNumbers,
      bookCitations: resolvedCitations.bookCitations,
      supportingExcerpt:
        resolvedCitations.sourceBasis === 'textbook' && matchingPassage
          ? matchingPassage.text.slice(0, 180)
          : undefined,
    });
  });

  if (sanitizedTeaching.length === 0) {
    return buildOfflineTextbookLecture(selectedBooks, cleanTopic, options);
  }

  const withReferences = normalizeLectureScenes(
    cleanTopic,
    inferredSystem,
    sanitizedTeaching,
    options.externalReferences || []
  );
  const rescaled = rescaleLectureDuration(withReferences, options.targetDurationSec);
  const aggregateCitations = collectAggregateBookCitations(rescaled);

  const effectiveCoverage: CoverageLevel =
    aggregateCitations.length === 0
      ? 'none'
      : rescaled.some(
            (s) =>
              s.visualMode !== 'references' &&
              s.sourceBasis === 'general_medical_knowledge'
          )
        ? 'partial'
        : retrieval.coverage;

  const coverageNote =
    aggregateCitations.length === 0
      ? `No matching passages for "${cleanTopic}" were found across the ${selectedBooks.length} selected textbook(s). All scenes are explicitly labeled as General Medical Knowledge without fabricated citations.`
      : effectiveCoverage === 'partial'
        ? `Primary clinical scenes are grounded in ${formatBookCitationsSummary(aggregateCitations)}; foundational anatomy/physiology scenes not printed verbatim in the textbook are labeled separately.`
        : `Every teaching scene is directly supported by verified passages in ${formatBookCitationsSummary(aggregateCitations)}.`;

  const now = new Date().toISOString();
  return {
    id: `lecture-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: String(raw.title || `${cleanTopic} — Virtual Professor Lecture`).trim(),
    topic: cleanTopic,
    sourceMode: 'topic',
    language: options.language,
    presenterId: options.presenterId,
    preferredDiscipline: options.preferredDiscipline || 'auto',
    targetDurationSec: options.targetDurationSec,
    coverage: effectiveCoverage,
    coverageNote,
    sourceTextbooks: selectedBooks.map((b) => ({
      id: b.id,
      title: b.title,
      subject: b.subject,
      pageCount: b.pageCount,
    })),
    bookCitations: aggregateCitations,
    externalReferences: options.externalReferences || [],
    scenes: rescaled,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Deterministic textbook-grounded lecture builder (works offline or when converting a chapter/topic locally).
 */
export function buildOfflineTextbookLecture(
  selectedBooks: MedicalTextbook[],
  topic: string,
  options: {
    presenterId: DoctorPersonaId;
    language: LanguageMode;
    targetDurationSec: number;
    preferredDiscipline?: MedicalSubjectDiscipline | 'auto';
    externalReferences?: LectureExternalReference[];
  }
): LectureProject {
  const cleanTopic = topic.trim() || 'Clinical Physiology & Management';
  const retrieval = retrieveAcrossTextbooks(selectedBooks, cleanTopic, 8);
  const systemTemplate = inferOrganSystemFromTopic(
    cleanTopic,
    retrieval.passages.map((p) => p.text).join(' ')
  );
  const forcedDiscipline =
    options.preferredDiscipline && options.preferredDiscipline !== 'auto'
      ? options.preferredDiscipline
      : undefined;

  const teachingScenes: LectureScene[] = [];

  const canonical = canonicalizeMedicalTopic(cleanTopic);
  const adaptivePlan = selectAdaptiveLectureStages(cleanTopic);
  const nonSummaryStages = adaptivePlan.stages.filter((s) => s.stage !== 'summary');
  const selectedStages =
    options.targetDurationSec <= 65
      ? nonSummaryStages.filter((_, i) => i === 0 || i === 1 || i === Math.floor(nonSummaryStages.length / 2) || i === nonSummaryStages.length - 1).slice(0, 4)
      : options.targetDurationSec <= 105
        ? nonSummaryStages.slice(0, 6)
        : nonSummaryStages;

  const landmarks = canonical.domainProfile.defaultLandmarks.map((l) => l.label);
  const drugPreview = canonical.domainProfile
    .firstLineDrugRowsTemplate(canonical.canonicalTitle)
    .slice(0, 2);

  selectedStages.forEach((stSpec, idx) => {
    const matchedPassage =
      retrieval.coverage !== 'none' && idx > 0
        ? retrieval.passages[(idx - 1) % Math.max(1, retrieval.passages.length)]
        : undefined;

    const hasBookSupport = Boolean(matchedPassage && retrieval.coverage !== 'none');
    const bookTitle = matchedPassage?.textbookTitle || selectedBooks[0]?.title || 'Textbook';
    const bookId = matchedPassage?.textbookId || selectedBooks[0]?.id || 'book-1';
    const citation: BookPageCitation[] =
      hasBookSupport && matchedPassage
        ? [
            {
              textbookId: bookId,
              textbookTitle: bookTitle,
              pageNumbers: [matchedPassage.pageNumber],
            },
          ]
        : [];

    const excerptSentence = matchedPassage
      ? matchedPassage.text
          .split(/(?<=[.?!])\s+/)
          .slice(0, 2)
          .join(' ')
          .slice(0, 240)
      : '';

    let narrationEn = '';
    let narrationArEg = '';
    let keyBullets: string[] = [];
    let labels: string[] = [];

    if (stSpec.stage === 'introduction') {
      narrationEn = `Welcome. Let us start from the beginning and understand ${canonical.canonicalTitle} calmly step by step. On the smartboard, look first at the normal structure of ${canonical.domainProfile.anatomicalRegionLabel}, where healthy balance keeps tissue function steady.`;
      narrationArEg = `أهلاً بيكم. تعالوا نبدأ مع بعض خطوة بخطوة ونفهم ${canonical.canonicalTitle} بهدوء وبساطة. بصوا الأول على البوردة على التركيب الطبيعي لمنطقة ${canonical.domainProfile.anatomicalRegionLabel} وازاي الجسم بيحافظ على التوازن الطبيعي.`;
      keyBullets = [
        `Region: ${canonical.domainProfile.anatomicalRegionLabel}`,
        `Normal baseline protects healthy tissue function`,
        `Key landmark: ${landmarks[0] || canonical.canonicalTitle}`,
      ];
      labels = [
        landmarks[0] || canonical.domainProfile.anatomicalRegionLabel,
        landmarks[1] || 'Normal Baseline',
        'Healthy Homeostasis',
      ];
    } else if (stSpec.stage === 'definition') {
      narrationEn = `Building on that normal baseline, how do we define ${canonical.canonicalTitle}? Simply put, it refers to ${
        hasBookSupport
          ? excerptSentence
          : `a focused clinical process affecting ${canonical.domainProfile.anatomicalRegionLabel} with characteristic structural or functional change.`
      }`;
      narrationArEg = `وبناءً على الطبيعي ده، إيه هو تعريف ${canonical.canonicalTitle}؟ ببساطة هو حالة بتأثر على ${canonical.domainProfile.anatomicalRegionLabel} وبتعمل تغير محدد في الوظيفة أو الأنسجة${
        hasBookSupport ? ` زي ما هو موضح في صفحة ${matchedPassage?.pageNumber}.` : '.'
      }`;
      keyBullets = [
        `Clear core definition of ${canonical.canonicalTitle}`,
        `Primary site: ${landmarks[0] || canonical.domainProfile.anatomicalRegionLabel}`,
        hasBookSupport
          ? `Verified in ${shortenBookTitle(bookTitle, 24)} (p. ${matchedPassage?.pageNumber})`
          : 'Distinguished from normal baseline physiology',
      ];
      labels = [
        canonical.canonicalTitle,
        landmarks[0] || 'Primary Target Site',
        'Core Clinical Definition',
      ];
    } else if (stSpec.stage === 'classification') {
      narrationEn = `Next, clinicians organize ${canonical.canonicalTitle} into clear categories so beginners can tell major patterns apart immediately. Compare the rows on the board to see how location, severity, or mechanism separates each subtype.`;
      narrationArEg = `بعد التعريف، بنقسم ${canonical.canonicalTitle} لأنواع واضحة عشان تقدر تفرق بينهم بسهولة. قارن على البوردة بين كل نوع من حيث المكان أو الدرجة أو الـ Mechanism.`;
      keyBullets = [
        `Grouped by anatomical site, timing, or severity`,
        `Separates mild reversible forms from severe disease`,
        `Directly guides targeted testing and treatment`,
      ];
      labels = [
        'Primary Subtypes',
        landmarks[0] || 'Site Comparison',
        landmarks[1] || 'Severity Grading',
      ];
    } else if (stSpec.stage === 'etiology') {
      narrationEn = `What triggers ${canonical.canonicalTitle} in the first place? Looking at the smartboard, primary causes disrupt normal protective balance in ${canonical.domainProfile.anatomicalRegionLabel}, setting the stage for tissue stress.`;
      narrationArEg = `طيب إيه الأسباب أو الـ Etiology اللي بتعمل ${canonical.canonicalTitle}؟ زي ما واضح قدامنا على البوردة، الأسباب الرئيسية بتكسر خط الدفاع الطبيعي في ${canonical.domainProfile.anatomicalRegionLabel}.`;
      keyBullets = [
        `Primary triggers disrupt local protective defenses`,
        `Modifiable vs. inherited or acquired risk factors`,
        `Identifying the cause prevents recurrence`,
      ];
      labels = [
        'Primary Triggers',
        'Risk Factors',
        landmarks[0] || 'Defense Breakdown',
      ];
    } else if (stSpec.stage === 'pathophysiology') {
      const mechSummary = canonical.domainProfile.pathophysiologySummaryTemplate(
        canonical.canonicalTitle
      );
      narrationEn = `Now follow the step-by-step mechanism on the board: ${
        hasBookSupport ? excerptSentence : mechSummary
      } Understanding this chain reaction makes every bedside sign logical rather than memorized.`;
      narrationArEg = `دلوقتي نمشي مع الـ Mechanism خطوة بخطوة على البوردة: ${mechSummary} لما نفهم التسلسل ده، كل عرض إكلينيكي بيبقى منطقي وسهل من غير حفظ صم.`;
      keyBullets = [
        shortenSlideBullet(mechSummary, 68),
        `Target structure: ${landmarks[1] || landmarks[0] || canonical.canonicalTitle}`,
        `Upstream change directly drives clinical signs`,
      ];
      labels = [
        landmarks[0] || 'Initiating Step',
        landmarks[1] || 'Cellular Cascade',
        landmarks[2] || 'Functional Shift',
      ];
    } else if (stSpec.stage === 'clinical_features') {
      narrationEn = `Because of that mechanism, how does the patient present at the bedside? Notice the key symptoms and physical signs highlighted on the smartboard, and always check early for urgent red-flag features.`;
      narrationArEg = `نتيجة للـ Mechanism ده، المريض بيشتكي من إيه على السرير؟ لاحظ الأعراض والعلامات الأساسية المتوضحة على البوردة، ودايماً راجع علامات الخطورة أو الـ Red Flags بدري.`;
      keyBullets = [
        `Classic presenting symptoms linked to mechanism`,
        `Focused physical examination findings`,
        `Early recognition of urgent red-flag signs`,
      ];
      labels = [
        'Presenting Symptoms',
        'Focused Exam Signs',
        'Urgent Red Flags',
      ];
    } else if (stSpec.stage === 'investigations') {
      const workupSummary = canonical.domainProfile.diagnosticGoldStandardTemplate(
        canonical.canonicalTitle
      );
      narrationEn = `To confirm ${canonical.canonicalTitle} objectively, we move from bedside clues to focused investigations: ${workupSummary}`;
      narrationArEg = `وعشان نأكد تشخيص ${canonical.canonicalTitle} بدقة، بنرتب الفحوصات خطوة بخطوة على البوردة: ${workupSummary}`;
      keyBullets = [
        shortenSlideBullet(workupSummary, 68),
        `Start with rapid, non-invasive bedside tests`,
        `Confirm severity and rule out close mimics`,
      ];
      labels = [
        'First-Line Screening',
        'Confirmatory Test',
        'Severity & Labs',
      ];
    } else {
      // management
      const leadDrug = drugPreview[0]
        ? `${drugPreview[0].drugClass} (${drugPreview[0].prototypeAgents})`
        : 'Guideline-Directed Therapy';
      narrationEn = `Finally, once confirmed, management of ${canonical.canonicalTitle} follows a calm, prioritized sequence: stabilize acute physiology first, then initiate targeted therapy such as ${leadDrug} while monitoring safety closely.`;
      narrationArEg = `وأخيراً في الـ Management بتاع ${canonical.canonicalTitle}، بنمشي بترتيب واضح: استقرار حالة المريض الأول، وبعدها العلاج الموجه زي ${leadDrug} مع متابعة الأمان والأعراض الجانبية.`;
      keyBullets = [
        `1. Immediate hemodynamic & supportive stabilization`,
        `2. Targeted therapy: ${shortenSlideBullet(leadDrug, 52)}`,
        `3. Safety monitoring & secondary prevention`,
      ];
      labels = [
        'Acute Stabilization',
        shortenSlideBullet(leadDrug, 34),
        'Safety Monitoring',
      ];
    }

    teachingScenes.push({
      id: `scene-local-${idx + 1}`,
      sceneNumber: idx + 1,
      pedagogicalStage: stSpec.stage,
      sectionKicker: `${String(idx + 1).padStart(2, '0')} · ${stSpec.stageLabel}`,
      title: stSpec.slideHeadingTemplate(canonical.canonicalTitle),
      visualMode: stSpec.visualMode,
      subjectDiscipline: forcedDiscipline || stSpec.discipline,
      systemTemplate,
      narrationEn,
      narrationArEg,
      visualDescription: `${stSpec.stageLabel} smartboard diagram for ${canonical.canonicalTitle}.`,
      onScreenLabels: labels.slice(0, 4),
      keyBullets: keyBullets.slice(0, 3),
      highlightedCallouts: labels.slice(0, 2),
      transitionType: idx === 0 ? 'fade' : 'slide',
      durationSec: 15,
      sourceBasis: hasBookSupport ? 'textbook' : 'general_medical_knowledge',
      pageNumbers: hasBookSupport && matchedPassage ? [matchedPassage.pageNumber] : [],
      bookCitations: citation,
      supportingExcerpt: hasBookSupport ? excerptSentence : undefined,
    });
  });

  const normalized = normalizeLectureScenes(
    cleanTopic,
    systemTemplate,
    teachingScenes,
    options.externalReferences || []
  );
  const rescaled = rescaleLectureDuration(normalized, options.targetDurationSec);
  const aggregateCitations = collectAggregateBookCitations(rescaled);

  const now = new Date().toISOString();
  return {
    id: `lecture-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `${cleanTopic} — Virtual Professor Lecture`,
    topic: cleanTopic,
    sourceMode: 'topic',
    language: options.language,
    presenterId: options.presenterId,
    preferredDiscipline: options.preferredDiscipline || 'auto',
    targetDurationSec: options.targetDurationSec,
    coverage: aggregateCitations.length > 0 ? 'partial' : 'none',
    coverageNote:
      aggregateCitations.length > 0
        ? `Built directly from verified passages in ${formatBookCitationsSummary(aggregateCitations)} with separate labeling for baseline physiology.`
        : `No matching passages for "${cleanTopic}" were found in the selected textbook(s). Scenes are explicitly labeled as General Medical Knowledge.`,
    sourceTextbooks: selectedBooks.map((b) => ({
      id: b.id,
      title: b.title,
      subject: b.subject,
      pageCount: b.pageCount,
    })),
    bookCitations: aggregateCitations,
    externalReferences: options.externalReferences || [],
    scenes: rescaled,
    generatedOffline: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Converts an existing StudyGuide directly into an editable animated LectureProject
 * preserving all verified bookCitations, Arabic explanations, and external evidence!
 */
/**
 * Converts an existing StudyGuide / MedicalTopicBlueprint directly into a continuous
 * 3D LectureProject sharing identical topic lock, section order, terminology,
 * smartboard single-concept boards, and three-tier source provenance.
 */
export function buildLectureFromStudyGuide(
  guide: StudyGuide,
  options: {
    presenterId?: DoctorPersonaId;
    language?: LanguageMode;
    targetDurationSec?: number;
  } = {}
): LectureProject {
  const presenterId = options.presenterId || 'female_doctor';
  const language = options.language || 'en';
  const targetDurationSec = options.targetDurationSec || 90;

  const blueprint = guide.blueprint || buildMedicalTopicBlueprint(guide);
  const systemTemplate = blueprint.systemTemplate;

  const externalRefs: LectureExternalReference[] = blueprint.externalEvidence
    .slice(0, 4)
    .map((ev) => ({
      title: ev.title,
      source: ev.sourceOrgOrJournal,
      year: ev.publishedDate,
      url: ev.url,
    }));

  const transitions: SceneTransitionType[] = ['fade', 'zoom_focus', 'slide', 'wipe'];

  const teachingScenes: LectureScene[] = blueprint.orderedSections
    .slice(0, 6)
    .map((bpSec, idx) => {
      const fallbackCitations: BookPageCitation[] =
        bpSec.bookCitations && bpSec.bookCitations.length > 0
          ? bpSec.bookCitations
          : bpSec.provenanceTier === 'uploaded_textbook' && bpSec.pageNumbers.length > 0
            ? [
                {
                  textbookId: guide.textbookId,
                  textbookTitle: guide.textbookTitle,
                  pageNumbers: bpSec.pageNumbers,
                },
              ]
            : [];

      const anatomicalPins = blueprint.anatomicalDiagram.callouts.slice(0, 4).map((c, cIdx) => ({
        id: `pin-${idx + 1}-${cIdx + 1}`,
        label: c.structureName,
        detail: c.pathologicalChange || c.normalRole,
        xPct: cIdx % 2 === 0 ? 16 : 84,
        yPct: cIdx < 2 ? 26 : 74,
        targetXPct: c.xPercent,
        targetYPct: c.yPercent,
        tone: (cIdx === idx % 4 ? 'pathology' : 'normal') as 'normal' | 'pathology',
      }));

      return {
        id: `scene-guide-${guide.id}-${idx + 1}`,
        sceneNumber: idx + 1,
        sectionKicker: `Section ${String(idx + 1).padStart(2, '0')} · ${bpSec.phaseLabel}`,
        title: bpSec.smartboardConceptTitle,
        visualMode: bpSec.visualMode,
        subjectDiscipline: bpSec.subjectDiscipline,
        systemTemplate,
        narrationEn: bpSec.narrationEn,
        narrationArEg: bpSec.narrationArEg,
        visualDescription: `${blueprint.canonicalTitle} — ${bpSec.smartboardConceptTitle} (Focused Structure: ${bpSec.highlightedStructure}).`,
        onScreenLabels: bpSec.smartboardLabels,
        highlightedCallouts: [
          bpSec.highlightedStructure,
          ...blueprint.anatomicalDiagram.callouts.slice(0, 2).map((c) => c.structureName),
        ].slice(0, 3),
        keyBullets: [bpSec.keyTakeawayEn, ...bpSec.smartboardLabels.slice(1, 3)],
        anatomicalPins,
        transitionType: transitions[idx % transitions.length],
        durationSec: 15,
        sourceBasis: fallbackCitations.length > 0 ? 'textbook' : 'general_medical_knowledge',
        pageNumbers: fallbackCitations.flatMap((c) => c.pageNumbers),
        bookCitations: fallbackCitations,
        supportingExcerpt: bpSec.supportingQuote,
      };
    });

  const normalized = normalizeLectureScenes(
    blueprint.canonicalTitle,
    systemTemplate,
    teachingScenes,
    externalRefs
  );
  const rescaled = rescaleLectureDuration(normalized, targetDurationSec);
  const aggregateCitations = collectAggregateBookCitations(rescaled);

  const sourceBooks: SourceTextbookSummary[] =
    guide.sourceTextbooks && guide.sourceTextbooks.length > 0
      ? guide.sourceTextbooks
      : guide.coverage !== 'none'
        ? [
            {
              id: guide.textbookId,
              title: guide.textbookTitle,
              pageCount: guide.totalPagesSearched || 12,
            },
          ]
        : [];

  const now = new Date().toISOString();
  return {
    id: `lecture-from-${guide.id}-${Date.now()}`,
    canonicalTopicId: blueprint.canonicalTopicId,
    blueprintId: blueprint.blueprintId,
    title: `${blueprint.canonicalTitle} — 3D Medical Lecture`,
    topic: blueprint.canonicalTitle,
    sourceMode: 'study_guide',
    language,
    presenterId,
    targetDurationSec,
    coverage: guide.coverage,
    coverageNote: blueprint.provenance.disclosureText,
    sourceTextbooks: sourceBooks,
    bookCitations: aggregateCitations,
    externalReferences: externalRefs,
    scenes: rescaled,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Builds a chapter-specific animated lecture from a selected textbook page/chapter.
 */
export function buildLectureFromChapter(
  book: MedicalTextbook,
  pageNumber: number,
  options: {
    presenterId?: DoctorPersonaId;
    language?: LanguageMode;
    targetDurationSec?: number;
  } = {}
): LectureProject {
  const clamped = Math.max(1, Math.min(book.pageCount || 1, pageNumber));
  const page = book.pages.find((p) => p.pageNumber === clamped) || book.pages[0];
  const rawHeading = page?.chapterTitle || `${book.title} — Page ${clamped}`;
  const cleanTopic =
    rawHeading.replace(/^Chapter\s+\d+\s*(\(Page\s*\d+\))?:\s*/i, '').trim() || rawHeading;

  const rawText = (page?.text || '').trim();
  const isScanned =
    !rawText || rawText.toLowerCase().startsWith('(scanned visual content on page');
  const systemTemplate = inferOrganSystemFromTopic(cleanTopic, rawText);

  const presenterId = options.presenterId || 'professor_karim';
  const language = options.language || 'en';
  const targetDurationSec = options.targetDurationSec || 75;

  if (isScanned) {
    return buildOfflineTextbookLecture([book], cleanTopic, {
      presenterId,
      language,
      targetDurationSec,
    });
  }

  const paragraphs = rawText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== page?.chapterTitle)
    .slice(0, 5);

  const citation: BookPageCitation = {
    textbookId: book.id,
    textbookTitle: book.title,
    pageNumbers: [clamped],
  };

  const modes: SceneVisualMode[] = [
    'anatomy',
    'physiology',
    'pathophysiology',
    'clinical_flow',
    'clinical_flow',
  ];
  const transitions: SceneTransitionType[] = ['fade', 'zoom_focus', 'slide', 'wipe', 'slide'];

  const teachingScenes: LectureScene[] = paragraphs.map((para, idx) => {
    const colonMatch = para.match(/^([A-Z][A-Za-z0-9\s/&(),+-]{3,60}):\s+([\s\S]+)$/);
    const subTitle = colonMatch ? colonMatch[1].trim() : `${cleanTopic} — Part ${idx + 1}`;
    const bodyText = colonMatch ? colonMatch[2].trim() : para;
    const conciseNarration = bodyText
      .split(/(?<=[.?!])\s+/)
      .slice(0, 2)
      .join(' ')
      .slice(0, 320);

    return {
      id: `scene-chap-${book.id}-p${clamped}-${idx + 1}`,
      sceneNumber: idx + 1,
      title: subTitle,
      visualMode: modes[idx % modes.length],
      systemTemplate,
      narrationEn: conciseNarration,
      narrationArEg: `من فصل ${cleanTopic} في كتاب ${shortenBookTitle(book.title, 26)} (صفحة ${clamped}) بخصوص ${subTitle}: ${conciseNarration}`,
      visualDescription: `Animated ${modes[idx % modes.length]} visual grounded in ${shortenBookTitle(book.title, 26)}, p. ${clamped}.`,
      onScreenLabels: [
        subTitle.slice(0, 36),
        `${shortenBookTitle(book.title, 22)} · p. ${clamped}`,
        cleanTopic.slice(0, 34),
      ],
      highlightedCallouts: [subTitle.slice(0, 32)],
      transitionType: transitions[idx % transitions.length],
      durationSec: 14,
      sourceBasis: 'textbook',
      pageNumbers: [clamped],
      bookCitations: [citation],
      supportingExcerpt: conciseNarration,
    };
  });

  const normalized = normalizeLectureScenes(cleanTopic, systemTemplate, teachingScenes, []);
  const rescaled = rescaleLectureDuration(normalized, targetDurationSec);

  const now = new Date().toISOString();
  return {
    id: `lecture-chap-${book.id}-p${clamped}-${Date.now()}`,
    title: `${cleanTopic} — Chapter Lecture`,
    topic: cleanTopic,
    sourceMode: 'chapter',
    language,
    presenterId,
    targetDurationSec,
    coverage: 'strong',
    coverageNote: `Directly compiled from "${book.title}", Page ${clamped}.`,
    sourceTextbooks: [
      { id: book.id, title: book.title, subject: book.subject, pageCount: book.pageCount },
    ],
    bookCitations: [citation],
    externalReferences: [],
    scenes: rescaled,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// WAV PCM Audio Utilities (24kHz, 16-bit, Mono RIFF WAV for Gemini 3.8 TTS)
// ============================================================================

export function decodeBase64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function encodeBytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export interface ParsedWavPcm {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcmSamples: Int16Array; // mono 16-bit samples
  durationSec: number;
}

export function parseWavBytes(
  wavBytes: Uint8Array,
  declaredMimeType = 'audio/wav'
): ParsedWavPcm {
  if (!wavBytes || wavBytes.byteLength < 4) {
    return {
      sampleRate: 24000,
      channels: 1,
      bitsPerSample: 16,
      pcmSamples: new Int16Array(0),
      durationSec: 0,
    };
  }

  const detected = detectAudioContainerFormat(wavBytes, declaredMimeType);

  // Never treat compressed encoded audio (MP3, OGG, AAC, WebM, FLAC) or unknown blobs as raw PCM!
  if (
    detected.kind === 'encoded_compressed' ||
    detected.kind === 'empty' ||
    detected.kind === 'unknown'
  ) {
    return {
      sampleRate: detected.sampleRateHint || 24000,
      channels: 1,
      bitsPerSample: 16,
      pcmSamples: new Int16Array(0),
      durationSec: 0,
    };
  }

  if (detected.kind === 'raw_pcm_s16le' || detected.kind === 'raw_pcm_s16be') {
    const mono = decodeRawPcm16ToMono(
      wavBytes,
      detected.channelsHint,
      detected.kind === 'raw_pcm_s16be'
    );
    const rate = detected.sampleRateHint || 24000;
    return {
      sampleRate: rate,
      channels: 1,
      bitsPerSample: 16,
      pcmSamples: mono,
      durationSec: mono.length / rate,
    };
  }

  const strict = parseStrictRiffWav(wavBytes);
  if (!strict.ok) {
    return {
      sampleRate: strict.sampleRate || 24000,
      channels: 1,
      bitsPerSample: 16,
      pcmSamples: new Int16Array(0),
      durationSec: 0,
    };
  }

  return {
    sampleRate: strict.sampleRate,
    channels: 1,
    bitsPerSample: 16,
    pcmSamples: strict.pcmSamples,
    durationSec: strict.durationSec,
  };
}

export function createMono16WavBytes(
  pcmSamples: Int16Array,
  sampleRate = 24000
): Uint8Array {
  const dataByteLength = pcmSamples.length * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      bytes[offset + i] = s.charCodeAt(i);
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM = 1
  view.setUint16(22, 1, true); // Mono = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, dataByteLength, true);

  for (let i = 0; i < pcmSamples.length; i++) {
    view.setInt16(44 + i * 2, pcmSamples[i], true);
  }

  return bytes;
}

export interface SceneAudioVerificationResult {
  valid: boolean;
  analysis: PcmSignalAnalysis;
  reason?: string;
}

/**
 * Verifies that a scene contains a real, decodable, non-silent WAV audio track
 * matching the active narration language.
 */
export function verifySceneAudioTrack(
  scene: LectureScene,
  activeLanguage?: LanguageMode
): SceneAudioVerificationResult {
  if (!scene.audioWavBase64 || scene.audioWavBase64.length < 64) {
    return {
      valid: false,
      analysis: analyzePcmSignal(new Int16Array(0), 24000),
      reason: 'Scene narration has not been synthesized yet.',
    };
  }
  if (activeLanguage && scene.audioLang && scene.audioLang !== activeLanguage) {
    return {
      valid: false,
      analysis: analyzePcmSignal(new Int16Array(0), 24000),
      reason: `Scene audio was generated in ${scene.audioLang}, but active lecture language is ${activeLanguage}.`,
    };
  }

  const raw = decodeBase64ToBytes(scene.audioWavBase64);
  const parsed = parseWavBytes(raw, 'audio/wav');
  if (parsed.pcmSamples.length === 0) {
    return {
      valid: false,
      analysis: analyzePcmSignal(new Int16Array(0), 24000),
      reason: 'Scene audio buffer could not be decoded as valid RIFF WAV PCM.',
    };
  }

  const analysis = analyzePcmSignal(parsed.pcmSamples, parsed.sampleRate);
  if (!analysis.isNonSilentSpeech) {
    return {
      valid: false,
      analysis,
      reason:
        analysis.failureReason ||
        'Scene audio buffer is silent or below audible speech threshold.',
    };
  }

  return { valid: true, analysis };
}

/**
 * Normalizes and concatenates verified scene WAV audio tracks in exact scene order,
 * preserving complete spoken narration without dead multi-second gaps or sample truncation,
 * and computes a 30Hz RMS lip-sync envelope + master signal dBFS telemetry.
 */
export function buildSynchronizedLectureAudioTrack(
  scenes: LectureScene[],
  targetSampleRate = 24000,
  envelopeHz = 30,
  activeLanguage?: LanguageMode
): {
  alignedScenes: LectureScene[];
  wavBytes: Uint8Array;
  hasRealSpeechAudio: boolean;
  verifiedSceneCount: number;
  allScenesVerified: boolean;
  verifiedSceneIds: string[];
  signalAnalysis: PcmSignalAnalysis;
  envelope: Float32Array;
  envelopeHz: number;
  totalDurationSec: number;
} {
  const verifiedSceneIds: string[] = [];

  const normalizedClips: Array<Int16Array | null> = scenes.map((scene) => {
    if (!scene.audioWavBase64) return null;
    if (activeLanguage && scene.audioLang && scene.audioLang !== activeLanguage) {
      return null;
    }
    const raw = decodeBase64ToBytes(scene.audioWavBase64);
    const parsed = parseWavBytes(raw, 'audio/wav');
    if (parsed.pcmSamples.length === 0) return null;

    const rawCheck = analyzePcmSignal(parsed.pcmSamples, parsed.sampleRate);
    if (!rawCheck.isNonSilentSpeech) {
      return null;
    }

    const resampled = resampleMonoPcm16(
      parsed.pcmSamples,
      parsed.sampleRate,
      targetSampleRate
    );
    const normalized = normalizeAndTrimScenePcm(resampled, targetSampleRate, -3.0);
    const postCheck = analyzePcmSignal(normalized, targetSampleRate);
    if (!postCheck.isNonSilentSpeech) {
      return null;
    }

    verifiedSceneIds.push(scene.id);
    return normalized;
  });

  const verifiedSceneCount = verifiedSceneIds.length;
  const hasRealSpeechAudio = verifiedSceneCount > 0;
  const allScenesVerified = scenes.length > 0 && verifiedSceneCount === scenes.length;

  // Lead-in (0.12s) + complete untruncated normalized speech + natural breath (0.18s) = +0.30s per scene.
  // When all scenes are verified, align every scene's duration tightly to its spoken clip so there are
  // ZERO multi-second dead gaps and ZERO truncated syllables!
  const leadInSec = 0.12;
  const tailPauseSec = 0.18;

  const alignedScenes = scenes.map((scene, idx) => {
    const clip = normalizedClips[idx];
    if (!clip) {
      return { ...scene, sceneNumber: idx + 1 };
    }
    const exactClipSec = clip.length / targetSampleRate;
    const tightSceneSec =
      Math.round((leadInSec + exactClipSec + tailPauseSec) * 100) / 100;
    return {
      ...scene,
      sceneNumber: idx + 1,
      audioDurationSec: Math.round(exactClipSec * 100) / 100,
      // Tight gapless alignment when full lecture audio is ready; otherwise ensure at least tightSceneSec so clip never truncates
      durationSec: allScenesVerified
        ? Math.max(4, tightSceneSec)
        : Math.max(scene.durationSec, tightSceneSec),
    };
  });

  // Compute exact sample-accurate timeline when allScenesVerified so clip placement never drifts or clips
  let cursorSamples = 0;
  const sceneSampleWindows = alignedScenes.map((sc, idx) => {
    const clip = normalizedClips[idx];
    const minSamplesForClip = clip
      ? Math.round(leadInSec * targetSampleRate) +
        clip.length +
        Math.round(tailPauseSec * targetSampleRate)
      : 0;
    const targetSceneSamples = Math.max(
      minSamplesForClip,
      Math.round(Math.max(4, sc.durationSec) * targetSampleRate)
    );
    const startSample = cursorSamples;
    const endSample = cursorSamples + targetSceneSamples;
    cursorSamples = endSample;
    return { startSample, endSample, sceneSamples: targetSceneSamples };
  });

  const totalSamples = Math.max(1, cursorSamples);
  const totalDurationSec = Math.round((totalSamples / targetSampleRate) * 100) / 100;
  const masterPcm = new Int16Array(totalSamples);

  // Sync alignedScenes.durationSec to exact sample windows
  const sampleExactAlignedScenes = alignedScenes.map((sc, idx) => ({
    ...sc,
    durationSec:
      Math.round((sceneSampleWindows[idx].sceneSamples / targetSampleRate) * 100) / 100,
  }));

  const leadInSamples = Math.round(leadInSec * targetSampleRate);
  normalizedClips.forEach((clip, idx) => {
    if (!clip) return;
    const writeStart = sceneSampleWindows[idx].startSample + leadInSamples;
    // Guaranteed writeStart + clip.length <= totalSamples (zero truncation!)
    masterPcm.set(clip, writeStart);
  });

  // Compute normalized RMS amplitude envelope at envelopeHz (e.g. 30 samples/sec)
  const envLength = Math.max(1, Math.ceil(totalDurationSec * envelopeHz));
  const samplesPerWindow = Math.max(1, Math.floor(targetSampleRate / envelopeHz));
  const envelope = new Float32Array(envLength);

  for (let w = 0; w < envLength; w++) {
    const start = w * samplesPerWindow;
    const end = Math.min(masterPcm.length, start + samplesPerWindow);
    if (end <= start) continue;
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      const norm = masterPcm[i] / 32768;
      sumSq += norm * norm;
    }
    const rms = Math.sqrt(sumSq / (end - start));
    const gated = rms < 0.012 ? 0 : Math.min(1, (rms - 0.012) / 0.18);
    envelope[w] = Math.round(gated * 1000) / 1000;
  }

  const signalAnalysis = hasRealSpeechAudio
    ? analyzePcmSignal(masterPcm, targetSampleRate)
    : analyzePcmSignal(new Int16Array(0), targetSampleRate);

  return {
    alignedScenes: sampleExactAlignedScenes,
    wavBytes: createMono16WavBytes(masterPcm, targetSampleRate),
    hasRealSpeechAudio,
    verifiedSceneCount,
    allScenesVerified,
    verifiedSceneIds,
    signalAnalysis,
    envelope,
    envelopeHz,
    totalDurationSec,
  };
}

export function sampleAmplitudeAtTime(
  envelope: Float32Array | null | undefined,
  envelopeHz: number,
  timeSec: number
): number {
  if (!envelope || envelope.length === 0 || timeSec < 0) return 0;
  const exactIdx = timeSec * envelopeHz;
  const idx0 = Math.floor(exactIdx);
  if (idx0 >= envelope.length) return 0;
  const idx1 = Math.min(envelope.length - 1, idx0 + 1);
  const frac = exactIdx - idx0;
  return envelope[idx0] * (1 - frac) + envelope[idx1] * frac;
}

// ============================================================================
// Pre-Built Multi-Book Sample Animated Lecture (Ready to Play Out of the Box)
// ============================================================================

export const INITIAL_SAMPLE_LECTURE: LectureProject = (() => {
  const compendiumCitation: BookPageCitation = {
    textbookId: 'sample-internal-med-compendium',
    textbookTitle: 'Principles of Internal Medicine: Clinical Compendium (12 Chapters)',
    pageNumbers: [1, 2],
  };
  const pharmCitation: BookPageCitation = {
    textbookId: 'sample-clinical-pharmacology-atlas',
    textbookTitle: 'Clinical Pharmacology & Therapeutics: High-Yield Reference',
    pageNumbers: [1],
  };

  const baseScenes: LectureScene[] = [
    {
      id: 'sample-lec-scene-1',
      sceneNumber: 1,
      title: 'Normal Cardiac Output & Frank-Starling Physiology',
      visualMode: 'physiology',
      systemTemplate: 'cardiopulmonary',
      narrationEn:
        'Welcome to MedAtlas Lecture Studio. Before analyzing acute heart failure, recall normal ventricular physiology: cardiac output equals heart rate times stroke volume, governed by preload, myocardial contractility, and systemic afterload.',
      narrationArEg:
        'أهلاً بيكم في استوديو المحاضرات الطبية. قبل ما نشرح Heart Failure، نفتكر الـ Normal Physiology: الـ Cardiac Output بيساوي Heart Rate في Stroke Volume، وبيتحكم فيه الـ Preload والـ Contractility والـ Afterload.',
      visualDescription:
        'Animated four-chamber cardiopulmonary circuit showing oxygenated pulmonary venous return and normal left ventricular ejection.',
      onScreenLabels: [
        'CO = HR × Stroke Volume',
        'Frank-Starling Preload Curve',
        'Normal LVEF ≥ 50%',
      ],
      highlightedCallouts: ['Left Ventricle', 'Aortic Outflow'],
      transitionType: 'fade',
      durationSec: 16,
      sourceBasis: 'general_medical_knowledge',
      pageNumbers: [],
      bookCitations: [],
    },
    {
      id: 'sample-lec-scene-2',
      sceneNumber: 2,
      title: 'Neurohormonal Activation & Pulmonary Congestion',
      visualMode: 'pathophysiology',
      systemTemplate: 'cardiopulmonary',
      narrationEn:
        'In HFrEF, left ventricular ejection fraction falls to 40 percent or lower. Chronic RAAS and sympathetic activation raise systemic vascular resistance and left ventricular end-diastolic pressure, driving alveolar pulmonary edema.',
      narrationArEg:
        'في حالات الـ HFrEF، الـ Ejection Fraction بيقل لـ 40% أو أقل. تنشيط الـ RAAS والـ Sympathetic System بيرفع الـ Afterload وضغط البطين الأيسر، فبيحصل Pulmonary Edema ونهجان مع المجهود والنوم.',
      visualDescription:
        'Pathophysiology animation highlighting elevated LVEDP retrograde pressure into pulmonary capillaries with alveolar fluid transudation.',
      onScreenLabels: [
        'HFrEF: LVEF ≤ 40%',
        'RAAS & Sympathetic Surge',
        'Elevated LVEDP → Pulmonary Edema',
        'Compendium · p. 1',
      ],
      highlightedCallouts: ['Pulmonary Alveoli', 'Elevated LVEDP'],
      transitionType: 'zoom_focus',
      durationSec: 18,
      sourceBasis: 'textbook',
      pageNumbers: [1],
      bookCitations: [
        {
          textbookId: compendiumCitation.textbookId,
          textbookTitle: compendiumCitation.textbookTitle,
          pageNumbers: [1],
        },
      ],
      supportingExcerpt:
        'Heart failure with reduced ejection fraction (HFrEF, LVEF <= 40%) is driven by chronic neurohormonal activation of the renin-angiotensin-aldosterone system (RAAS) and sympathetic nervous system.',
    },
    {
      id: 'sample-lec-scene-3',
      sceneNumber: 3,
      title: 'Bedside Hemodynamic Profiling & Acute Decongestive Therapy',
      visualMode: 'comparison',
      systemTemplate: 'cardiopulmonary',
      narrationEn:
        'Classify acute decompensated patients by congestion—wet versus dry—and perfusion—warm versus cold. Warm and wet patients require intravenous loop diuretics like furosemide, while routine normal saline boluses are contraindicated in volume overload.',
      narrationArEg:
        'بنقسم مريض الـ Acute Decompensation حسب الاحتقان Wet ولا Dry، والتروية Warm ولا Cold. مريض الـ Warm and Wet علاجه الأساسي IV Loop Diuretics زي Furosemide، وممنوع تماماً نديله محاليل Normal Saline روتينية.',
      visualDescription:
        'Textbook 2×2 Forrester hemodynamic comparison table contrasting Warm-Dry, Warm-Wet, Cold-Dry, and Cold-Wet bedside profiles.',
      onScreenLabels: [
        '2×2 Profile: Wet/Dry × Warm/Cold',
        'IV Loop Diuretics (Furosemide)',
        'Avoid Routine Saline in Wet HF',
        'Compendium · p. 2',
      ],
      highlightedCallouts: ['Warm & Wet Profile', 'IV Furosemide'],
      clinicalPearl:
        'Never administer routine IV 0.9% normal saline boluses to a congested ("Wet") heart failure patient — isotonic sodium loading worsens alveolar edema.',
      transitionType: 'slide',
      durationSec: 18,
      sourceBasis: 'textbook',
      pageNumbers: [2],
      bookCitations: [
        {
          textbookId: compendiumCitation.textbookId,
          textbookTitle: compendiumCitation.textbookTitle,
          pageNumbers: [2],
        },
      ],
      supportingExcerpt:
        'Bedside profiling classifies patients into four hemodynamic quadrants (Warm-Dry, Warm-Wet, Cold-Dry, Cold-Wet). Intravenous loop diuretics (furosemide, bumetanide) are first-line for acute congestion.',
    },
    {
      id: 'sample-lec-scene-4',
      sceneNumber: 4,
      title: 'Disease-Modifying Quadruple GDMT & 36-Hour ARNI Washout',
      visualMode: 'treatment',
      systemTemplate: 'cardiopulmonary',
      narrationEn:
        'Long-term survival in HFrEF relies on four pillars: ARNI such as sacubitril-valsartan, evidence-based beta-blockers, mineralocorticoid receptor antagonists, and SGLT2 inhibitors. Always enforce a strict 36-hour washout when switching from an ACE inhibitor to ARNI to prevent angioedema.',
      narrationArEg:
        'العلاج المزمن اللي بيقلل الوفيات في HFrEF بيشمل 4 أدوية أساسية: ARNI، وBeta-Blockers، وMRA زي Spironolactone، وSGLT2 Inhibitors. ولازم نسيب 36 ساعة Washout بعد وقف ACE Inhibitor قبل بدء ARNI لمنع الـ Angioedema.',
      visualDescription:
        'Directed four-pillar pharmacology algorithm with a highlighted 36-hour bradykinin washout safety gate between ACEi and ARNI.',
      onScreenLabels: [
        '4 Pillars: ARNI + BB + MRA + SGLT2i',
        'Mandatory 36-Hour ACEi → ARNI Washout',
        'Prevents Bradykinin Angioedema',
        'Pharmacology · p. 1',
      ],
      highlightedCallouts: ['ARNI + SGLT2i', '36h Washout Rule'],
      clinicalPearl:
        'High-Yield Safety Rule: Overlapping an ACE inhibitor with sacubitril/valsartan within 36 hours causes dual bradykinin accumulation and life-threatening angioedema.',
      transitionType: 'wipe',
      durationSec: 20,
      sourceBasis: 'textbook',
      pageNumbers: [1, 2],
      bookCitations: [
        {
          textbookId: compendiumCitation.textbookId,
          textbookTitle: compendiumCitation.textbookTitle,
          pageNumbers: [2],
        },
        pharmCitation,
      ],
      supportingExcerpt:
        'A mandatory 36-hour washout period is strictly required when switching from an ACE inhibitor to sacubitril/valsartan to prevent life-threatening bradykinin-mediated angioedema.',
    },
  ];

  const normalized = normalizeLectureScenes(
    'Acute Decompensated Heart Failure & HFrEF Quadruple Therapy',
    'cardiopulmonary',
    baseScenes,
    [
      {
        title: 'AHA/ACC/HFSA Guideline for the Management of Heart Failure',
        source: 'Circulation / JACC',
        year: '2022',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=AHA+ACC+HFSA+Heart+Failure+Guideline',
      },
    ]
  );

  return {
    id: 'sample-lecture-hfref-v1',
    title: 'Acute Decompensated Heart Failure & HFrEF Quadruple Therapy',
    topic: 'Acute Decompensated Heart Failure & HFrEF Quadruple Therapy',
    sourceMode: 'topic',
    language: 'en',
    presenterId: 'attending_maya',
    targetDurationSec: getTotalLectureDuration(normalized),
    coverage: 'partial',
    coverageNote:
      'Primary pathophysiology, hemodynamic profiling, and pharmacology scenes are verified in Principles of Internal Medicine (pp. 1–2) and Clinical Pharmacology Reference (p. 1); Scene 1 baseline physiology is separately labeled.',
    sourceTextbooks: [
      {
        id: compendiumCitation.textbookId,
        title: compendiumCitation.textbookTitle,
        subject: 'Cardiology & Critical Care',
        pageCount: 12,
      },
      {
        id: pharmCitation.textbookId,
        title: pharmCitation.textbookTitle,
        subject: 'Pharmacology & Therapeutics',
        pageCount: 8,
      },
    ],
    bookCitations: [compendiumCitation, pharmCitation],
    externalReferences: [
      {
        title: 'AHA/ACC/HFSA Guideline for the Management of Heart Failure',
        source: 'Circulation / JACC',
        year: '2022',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=AHA+ACC+HFSA+Heart+Failure+Guideline',
      },
    ],
    scenes: normalized,
    createdAt: '2025-02-20T09:00:00.000Z',
    updatedAt: '2025-02-20T09:00:00.000Z',
  };
})();
