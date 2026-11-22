export interface TextbookPage {
  pageNumber: number;
  text: string;
  chapterTitle?: string;
}

export interface BookPageCitation {
  textbookId: string;
  textbookTitle: string;
  pageNumbers: number[];
}

export interface TextbookPassage {
  passageId: string;
  pageNumber: number;
  chapterTitle?: string;
  text: string;
  textbookId?: string;
  textbookTitle?: string;
  citationTag?: string;
}

export interface RetrievedPassage extends TextbookPassage {
  score: number;
  matchedTerms: string[];
}

export type SourceBasis = 'textbook' | 'general_medical_knowledge';

export type CoverageLevel = 'strong' | 'partial' | 'none';

export type TeachingDepthMode = 'detailed' | 'quick';

export type LanguageMode = 'en' | 'ar-eg';

export const MEDICAL_SUBJECT_OPTIONS = [
  'Internal Medicine',
  'Cardiology & Critical Care',
  'Pulmonology',
  'Gastroenterology & Hepatology',
  'Nephrology & Electrolytes',
  'Endocrinology & Metabolism',
  'Hematology & Oncology',
  'Infectious Diseases',
  'Neurology',
  'Pharmacology & Therapeutics',
  'Pathology',
  'Rheumatology & Immunology',
  'Surgery',
  'Pediatrics',
  'Obstetrics & Gynecology',
] as const;

export interface BookUploadProgress {
  id: string;
  fileName: string;
  title: string;
  subject?: string;
  currentPage: number;
  totalPages: number;
  percent: number;
  status: 'queued' | 'indexing' | 'ready' | 'error';
  errorMessage?: string;
}

export interface MedicalTextbook {
  id: string;
  title: string;
  subject?: string;
  fileName: string;
  pageCount: number;
  passageCount?: number;
  pages: TextbookPage[];
  uploadedAt: string;
  fileSizeBytes: number;
  isSample?: boolean;
  pdfBase64?: string;
  scanNotice?: string;
}

export type ClinicalNoteCategory =
  | 'Red Flag'
  | 'Clinical Pearl'
  | 'Diagnostic Pitfall'
  | 'Management Protocol';

export type StepPhase =
  | 'Foundations & Terminology'
  | 'Normal Physiology'
  | 'Pathophysiology & Mechanism'
  | 'Clinical Presentation'
  | 'Diagnosis & Investigations'
  | 'Differential Diagnosis'
  | 'Stepwise Management'
  | 'Complications & Exam Pearls';

export interface TermDefinition {
  term: string;
  simpleExplanation: string;
  arabicExplanation?: string;
}

export interface ExplanationSection {
  stepNumber?: number;
  stepPhase?: string;
  heading: string;
  content: string;
  contentArabic?: string;
  quickSummaryPoints?: string[];
  termDefinitions?: TermDefinition[];
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
  sourceBasis: SourceBasis;
  supportingQuote?: string;
  keyTakeaway: string;
  keyTakeawayArabic?: string;
}

export interface ClinicalNote {
  title: string;
  category: ClinicalNoteCategory;
  detail: string;
  detailArabic?: string;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
  sourceBasis: SourceBasis;
  supportingQuote?: string;
}

export interface MCQItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  explanationArabic?: string;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
  sourceBasis: SourceBasis;
}

export type MedicalSubjectDiscipline =
  | 'anatomy'
  | 'physiology'
  | 'pathology'
  | 'pharmacology'
  | 'immunology';

export type VisualAssetProvenanceKind =
  | 'prerendered_3d_model'
  | 'histopathology_schematic'
  | 'vector_pathway_schematic'
  | 'interactive_data_curve';

export type MindMapBranchCategory =
  | 'physiology'
  | 'pathophysiology'
  | 'clinical'
  | 'diagnosis'
  | 'management'
  | 'complications';

export interface MindMapNode {
  id: string;
  label: string;
  category: MindMapBranchCategory;
  disciplineTag?: MedicalSubjectDiscipline;
  relationLabel: string;
  parentId?: string;
  summary: string;
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
}

export interface MindMapData {
  centralTopic: string;
  centralSubtitle?: string;
  nodes: MindMapNode[];
}

export type FlowchartKind = 'pathophysiology' | 'diagnosis' | 'management';

export type FlowchartNodeShape = 'start' | 'process' | 'decision' | 'action' | 'alert';

export interface FlowchartNode {
  id: string;
  label: string;
  detail?: string;
  nodeType: FlowchartNodeShape;
}

export interface FlowchartEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowchartData {
  id: string;
  title: string;
  flowType: FlowchartKind;
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
}

export type AnatomicalSystemTemplate =
  | 'cardiopulmonary'
  | 'renal'
  | 'respiratory'
  | 'hepatobiliary'
  | 'endocrine'
  | 'neurology'
  | 'hematology'
  | 'immune'
  | 'general_physiology';

export interface AnatomicalCallout {
  id: string;
  number: number;
  structureName: string;
  xPercent: number;
  yPercent: number;
  normalRole: string;
  pathologicalChange: string;
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
}

export interface AnatomicalDiagramData {
  title: string;
  systemTemplate: AnatomicalSystemTemplate;
  normalPhysiologySummary: string;
  pathophysiologySummary: string;
  callouts: AnatomicalCallout[];
}

export interface ComparisonTableRow {
  feature: string;
  cells: string[];
}

export interface ComparisonTableData {
  title: string;
  columns: string[];
  rows: ComparisonTableRow[];
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
}

export interface ClinicalCaseScenario {
  id: string;
  title: string;
  patientPresentation: string;
  vitalsAndLabs: string;
  promptQuestion: string;
  idealWorkupAndDiagnosis: string;
  managementPlan: string;
  clinicalPearl: string;
  arabicTakeaway?: string;
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  backArabic?: string;
  category: string;
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
}

export type EvidenceCategoryType =
  | 'Clinical Practice Guideline'
  | 'Systematic Review / Meta-Analysis'
  | 'Randomized Controlled Trial'
  | 'Government Health Agency'
  | 'Clinical Trial (Phase 3/4)'
  | 'Peer-Reviewed Study';

export interface ExternalEvidenceItem {
  id: string;
  title: string;
  sourceOrgOrJournal: string;
  publishedDate: string;
  url: string;
  evidenceType: EvidenceCategoryType;
  database: 'PubMed' | 'NIH MedlinePlus' | 'ClinicalTrials.gov';
  summarySnippet: string;
  authors?: string;
  pmid?: string;
  nctId?: string;
  doi?: string;
}

export interface ExternalEvidenceResponse {
  query: string;
  fetchedAt: string;
  ncbiApiKeyConfigured: boolean;
  items: ExternalEvidenceItem[];
  externalPortals: {
    upToDateUrl: string;
    pubMedGuidelinesUrl: string;
    medlinePlusUrl: string;
    niceGuidelinesUrl: string;
    whoGuidelinesUrl: string;
  };
}

export interface SourceTextbookSummary {
  id: string;
  title: string;
  subject?: string;
  pageCount: number;
}

export type IntegratedScienceDisciplineId =
  | 'anatomy'
  | 'physiology'
  | 'pathology'
  | 'pathophysiology'
  | 'pharmacology'
  | 'immunology'
  | 'clinical_correlations';

export interface InfographicCalloutPin {
  number: number;
  label: string;
  detail: string;
  xPct: number;
  yPct: number;
}

export interface DrugComparisonRow {
  drugClass: string;
  prototypeAgents: string;
  mechanismOfAction: string;
  clinicalIndications: string;
  adverseEffectsAndContraindications: string;
}

export type DisciplineVisualKind =
  | 'atlas_plate'
  | 'pathology_comparison'
  | 'pharmacology_receptor'
  | 'immunology_synapse'
  | 'physiology_curve'
  | 'causal_pathway';

export interface IntegratedDisciplineBlock {
  id: string;
  discipline: IntegratedScienceDisciplineId;
  disciplineLabel: string;
  title: string;
  relevanceSummary: string;
  detailedExplanation: string;
  keyPoints: string[];
  highlightedTerms: Array<{
    term: string;
    definition: string;
  }>;
  clinicalCorrelationPearl: string;
  visualKind: DisciplineVisualKind;
  visualTitle: string;
  visualCaption: string;
  calloutPins: InfographicCalloutPin[];
  normalComparisonNote?: string;
  pathologicalComparisonNote?: string;
  curveAxisX?: string;
  curveAxisY?: string;
  drugComparisonRows?: DrugComparisonRow[];
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
  supportingQuote?: string;
}

export type QuestionDifficultyTier =
  | 'Foundational'
  | 'Mechanism'
  | 'Clinical Application'
  | 'Critical Thinking';

export type WrittenCommandVerb =
  | 'Explain'
  | 'Discuss'
  | 'Compare'
  | 'Enumerate'
  | 'Describe'
  | 'Clinical Work-up';

export interface QuestionBankMcq {
  id: string;
  number: number;
  difficulty: QuestionDifficultyTier;
  discipline: string;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
}

export interface QuestionBankWrittenItem {
  id: string;
  number: number;
  commandVerb: WrittenCommandVerb;
  difficulty: QuestionDifficultyTier;
  discipline: string;
  prompt: string;
  totalMarks: number;
  markingPoints: Array<{
    point: string;
    marks: number;
  }>;
  modelAnswer: string;
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
}

export type CaseProgressiveFocus =
  | 'Diagnosis'
  | 'Differential Diagnosis'
  | 'Investigations'
  | 'Interpretation'
  | 'Management'
  | 'Complications';

export interface CaseVitalOrLabEntry {
  parameter: string;
  value: string;
  referenceRange?: string;
  flag?: 'normal' | 'high' | 'low' | 'critical';
}

export interface CaseProgressiveSubQuestion {
  partLabel: string;
  focusArea: CaseProgressiveFocus;
  question: string;
  modelAnswer: string;
  rationale: string;
}

export interface QuestionBankClinicalCase {
  id: string;
  number: number;
  title: string;
  difficulty: QuestionDifficultyTier;
  patientPresentation: string;
  vitalsAndLabs: CaseVitalOrLabEntry[];
  progressiveQuestions: CaseProgressiveSubQuestion[];
  clinicalPearl: string;
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations?: BookPageCitation[];
}

export interface ComprehensiveQuestionBank {
  mcqs: QuestionBankMcq[]; // Exact 30 MCQs
  writtenQuestions: QuestionBankWrittenItem[]; // Exact 10 Written Questions
  clinicalCases: QuestionBankClinicalCase[]; // Exact 8 Clinical Cases
}

export interface InfographicTopicPack {
  canonicalTopicId?: string;
  canonicalTopicTitle?: string;
  generatedAt: string;
  generationMethod: 'ai_verified' | 'compiled_verified';
  learningObjectives: string[];
  sourceGapNotice: string;
  relevantDisciplinesNote: string;
  integratedDisciplines: IntegratedDisciplineBlock[];
  questionBank: ComprehensiveQuestionBank;
}

export interface StudyGuide {
  id: string;
  canonicalTopicId?: string;
  textbookId: string;
  textbookTitle: string;
  sourceTextbooks?: SourceTextbookSummary[];
  bookCitations?: BookPageCitation[];
  topic: string;
  summary: string;
  summaryArabic?: string;
  quickRevisionBullets?: string[];
  coverage: CoverageLevel;
  coverageNote: string;
  totalPagesSearched: number;
  referencedPages: number[];
  retrievedPassages: RetrievedPassage[];
  sections: ExplanationSection[];
  clinicalNotes: ClinicalNote[];
  mcqs: MCQItem[];
  mindMap?: MindMapData;
  flowcharts?: FlowchartData[];
  anatomicalDiagram?: AnatomicalDiagramData;
  comparisonTable?: ComparisonTableData;
  clinicalCases?: ClinicalCaseScenario[];
  flashcards?: FlashcardItem[];
  externalEvidence?: ExternalEvidenceItem[];
  infographicPack?: InfographicTopicPack;
  blueprint?: MedicalTopicBlueprint;
  createdAt: string;
  updatedAt: string;
  answers: Record<string, number>;
  flashcardMastery?: Record<string, 'mastered' | 'review'>;
  generatedOffline?: boolean;
}

export type PdfExportScope = 'single_topic' | 'chapter' | 'selected_topics' | 'revision_guide';

export type PdfPageOrientation = 'portrait' | 'landscape';

export type PdfStudyStyle = 'detailed' | 'compact';

export type PdfDocumentExportMode =
  | 'full_study_guide'
  | 'question_bank_with_answers'
  | 'question_bank_self_test';

export interface PdfGeneratorConfig {
  scope: PdfExportScope;
  orientation: PdfPageOrientation;
  style: PdfStudyStyle;
  exportMode?: PdfDocumentExportMode;
  autoLandscapeWidePages?: boolean;
  customTitle?: string;
  includeCoverPage: boolean;
  includeTableOfContents: boolean;
  includeVisualDiagrams: boolean;
  includeComparisonAndCases: boolean;
  includeMcqsWithAnswers: boolean;
  includeQuestionBank?: boolean;
  includeReferences: boolean;
  embeddedAtlasImages?: Record<string, string>;
}

export type CloudSyncState = 'synced' | 'syncing' | 'offline' | 'error';

export interface VaultPayload {
  textbooks: Omit<MedicalTextbook, 'pdfBase64'>[];
  studyGuides: StudyGuide[];
  updatedAt: string;
}

export type DoctorGender = 'male' | 'female';

export type DoctorPersonaId =
  | 'male_doctor'
  | 'female_doctor'
  | 'attending_maya'
  | 'professor_karim'
  | 'fellow_elena'
  | 'pharmacologist_tariq';

export type DoctorAttireStyle = 'white_coat' | 'surgical_scrubs' | 'academic_blazer';

export type GeminiPrebuiltVoice = 'Kore' | 'Charon' | 'Zephyr' | 'Fenrir' | 'Puck';

export interface DoctorCharacterProfile {
  id: DoctorPersonaId;
  gender: DoctorGender;
  displayLabel: string;
  name: string;
  roleTitle: string;
  specialty: string;
  attire: DoctorAttireStyle;
  coatColor: string;
  scrubColor: string;
  accentColor: string;
  skinTone: string;
  hairColor: string;
  hairStyle: 'bun' | 'short_parted' | 'shoulder_wave' | 'cropped_beard';
  hasGlasses: boolean;
  hasStethoscope: boolean;
  geminiVoice: GeminiPrebuiltVoice;
}

export type SceneVisualMode =
  | 'anatomy'
  | 'physiology'
  | 'pathophysiology'
  | 'investigations'
  | 'treatment'
  | 'comparison'
  | 'clinical_flow'
  | 'references';

export type LecturePedagogicalStage =
  | 'introduction'
  | 'definition'
  | 'classification'
  | 'etiology'
  | 'pathophysiology'
  | 'clinical_features'
  | 'investigations'
  | 'management'
  | 'summary';

export type LectureTopicCategory =
  | 'clinical_condition'
  | 'anatomy_physiology'
  | 'pharmacology_therapeutics'
  | 'diagnostic_procedure';

export type SceneTransitionType = 'fade' | 'slide' | 'zoom_focus' | 'wipe';

export interface LectureGlossaryTerm {
  term: string;
  definition: string;
  clinicalSignificance?: string;
}

export interface LectureComparisonTable {
  caption: string;
  columns: string[];
  rows: string[][];
}

export interface LectureAnatomicalPin {
  id: string;
  label: string;
  detail: string;
  xPct: number; // Callout label badge position (0..100)
  yPct: number;
  targetXPct: number; // Anatomical target point on cross-section (0..100)
  targetYPct: number;
  tone?: 'normal' | 'pathology' | 'intervention';
}

export interface LecturePauseExplainMoment {
  triggerProgress: number; // 0.35 .. 0.75 inside scene
  title: string;
  explanation: string;
}

export interface LectureCheckpointQuiz {
  id: string;
  sectionLabel: string;
  clinicalCaseVignette?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  citationLabel?: string;
}

export interface LectureRevisionPack {
  structuredSummary: string[];
  examPoints: string[];
  mindMap: MindMapData;
  flowchart: FlowchartData;
}

export interface LectureScene {
  id: string;
  sceneNumber: number;
  pedagogicalStage?: LecturePedagogicalStage;
  sectionKicker?: string;
  title: string;
  visualMode: SceneVisualMode;
  subjectDiscipline?: MedicalSubjectDiscipline;
  systemTemplate: AnatomicalSystemTemplate;
  narrationEn: string;
  narrationArEg: string;
  visualDescription: string;
  onScreenLabels: string[];
  highlightedCallouts: string[];
  keyBullets?: string[];
  glossaryTerms?: LectureGlossaryTerm[];
  clinicalPearl?: string;
  comparisonTable?: LectureComparisonTable;
  anatomicalPins?: LectureAnatomicalPin[];
  pauseMoment?: LecturePauseExplainMoment;
  checkpointQuiz?: LectureCheckpointQuiz;
  transitionType: SceneTransitionType;
  durationSec: number;
  sourceBasis: SourceBasis;
  pageNumbers: number[];
  bookCitations: BookPageCitation[];
  supportingExcerpt?: string;
  audioWavBase64?: string;
  audioLang?: LanguageMode;
  audioDurationSec?: number;
  audioMeanDb?: number;
  audioPeakDb?: number;
  audioSampleRate?: number;
  audioModelUsed?: string;
  audioError?: string;
}

export interface Mp4AudioValidationReport {
  hasAudioStream: boolean;
  audioCodec: string;
  sampleRate: number;
  channels: number;
  videoDurationSec: number;
  audioDurationSec: number;
  meanVolumeDb: number;
  maxVolumeDb: number;
  fileSizeBytes: number;
  isAudibleAndValid: boolean;
  failureReason?: string;
}

export type LectureSourceMode = 'topic' | 'chapter' | 'study_guide';

export interface LectureExternalReference {
  title: string;
  source: string;
  year?: string;
  url?: string;
}

export interface LectureProject {
  id: string;
  canonicalTopicId?: string;
  blueprintId?: string;
  title: string;
  topic: string;
  sourceMode: LectureSourceMode;
  preferredDiscipline?: MedicalSubjectDiscipline | 'auto';
  language: LanguageMode;
  presenterId: DoctorPersonaId;
  targetDurationSec: number;
  coverage: CoverageLevel;
  coverageNote: string;
  sourceTextbooks: SourceTextbookSummary[];
  bookCitations: BookPageCitation[];
  externalReferences: LectureExternalReference[];
  scenes: LectureScene[];
  generatedOffline?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Unified Medical Topic Blueprint (Single Source of Truth)
// ============================================================================

export type ProvenanceTier =
  | 'uploaded_textbook'
  | 'external_evidence'
  | 'general_medical_knowledge';

export interface BlueprintTermItem {
  term: string;
  definitionEn: string;
  definitionArEg?: string;
}

export interface BlueprintSectionPlan {
  orderIndex: number;
  sectionId: string;
  phaseLabel: string;
  heading: string;
  learningObjective: string;
  explanationEn: string;
  explanationArEg?: string;
  keyTakeawayEn: string;
  keyTakeawayArEg?: string;
  smartboardConceptTitle: string;
  smartboardLabels: string[];
  highlightedStructure: string;
  visualMode: SceneVisualMode;
  subjectDiscipline: MedicalSubjectDiscipline;
  narrationEn: string;
  narrationArEg: string;
  provenanceTier: ProvenanceTier;
  bookCitations: BookPageCitation[];
  pageNumbers: number[];
  supportingQuote?: string;
}

export interface BlueprintProvenanceSummary {
  primaryTier: ProvenanceTier;
  hasUploadedTextbookCoverage: boolean;
  hasExternalEvidence: boolean;
  hasUnverifiedGeneralKnowledge: boolean;
  uploadedBookCitations: BookPageCitation[];
  externalEvidenceCount: number;
  disclosureText: string;
}

export interface MedicalTopicBlueprint {
  blueprintId: string;
  canonicalTopicId: string;
  canonicalTitle: string;
  organDomain: string;
  systemTemplate: AnatomicalSystemTemplate;
  generatedAt: string;
  learningObjectives: string[];
  terminologyGlossary: BlueprintTermItem[];
  orderedSections: BlueprintSectionPlan[];
  anatomicalDiagram: AnatomicalDiagramData;
  flowcharts: FlowchartData[];
  mindMap: MindMapData;
  comparisonTable?: ComparisonTableData;
  clinicalPearls: ClinicalNote[];
  questionBank: ComprehensiveQuestionBank;
  externalEvidence: ExternalEvidenceItem[];
  provenance: BlueprintProvenanceSummary;
}

// ============================================================================
// Separate Timed Exams & Practice Assessment Module
// ============================================================================

export type ExamAssessmentMode = 'exam' | 'practice';

export type ExamSessionStatus = 'configuring' | 'in_progress' | 'submitted';

export type ExamQuestionItem = QuestionBankMcq;

export interface ExamSessionState {
  id: string;
  topic: string;
  canonicalTopicId: string;
  sourceGuideId: string;
  sourceLectureId?: string;
  mode: ExamAssessmentMode;
  status: ExamSessionStatus;
  questionCount: number;
  durationSeconds: number;
  startedAtMs: number;
  expiresAtMs: number | null;
  submittedAtMs: number | null;
  autoSubmittedOnTimeout: boolean;
  currentIndex: number;
  questions: ExamQuestionItem[];
  answers: Record<string, number>;
  flaggedQuestionIds: string[];
}
