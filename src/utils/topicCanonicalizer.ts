import type {
  AnatomicalSystemTemplate,
  CaseVitalOrLabEntry,
  DrugComparisonRow,
  InfographicCalloutPin,
} from '../types/medical';

export type FineOrganDomain =
  | 'gastroduodenal'
  | 'esophageal'
  | 'hepatobiliary'
  | 'pancreatic'
  | 'intestinal_colorectal'
  | 'cardiovascular'
  | 'respiratory'
  | 'renal_electrolytes'
  | 'endocrine_metabolic'
  | 'neurology'
  | 'hematology_oncology'
  | 'rheumatology_immunology'
  | 'infectious_disease'
  | 'musculoskeletal_integument'
  | 'reproductive_obstetric'
  | 'multisystem_general';

export type StrictTopicAtlasKey =
  | 'cardiopulmonary_anatomy'
  | 'cardiopulmonary_patho'
  | 'renal'
  | 'respiratory'
  | 'endocrine'
  | 'neurology'
  | 'hepatobiliary'
  | 'hematology';

export interface ConflictingDiseaseSignature {
  entityId: string;
  label: string;
  signatureTerms: string[];
}

export interface DomainClinicalProfile {
  organDomain: FineOrganDomain;
  anatomicalRegionLabel: string;
  defaultLandmarks: InfographicCalloutPin[];
  normalBaselineSummary: string;
  pathophysiologySummaryTemplate: (topic: string) => string;
  normalHistologyNote: string;
  pathologicalHistologyTemplate: (topic: string) => string;
  curveAxisX: string;
  curveAxisY: string;
  defaultVitalsAndLabs: CaseVitalOrLabEntry[];
  decompensatedVitalsAndLabs: CaseVitalOrLabEntry[];
  firstLineDrugRowsTemplate: (topic: string) => DrugComparisonRow[];
  diagnosticGoldStandardTemplate: (topic: string) => string;
  differentialSummaryTemplate: (topic: string) => string;
}

export interface CanonicalTopicDescriptor {
  topicId: string;
  canonicalTopicId: string;
  canonicalTitle: string;
  rawInput: string;
  organDomain: FineOrganDomain;
  systemTemplate: AnatomicalSystemTemplate;
  /**
   * Non-null ONLY when a bundled 3D raster plate genuinely depicts the exact organ
   * system of this topic. Null for gastroduodenal, esophageal, intestinal, thyroid,
   * musculoskeletal, etc., forcing a dedicated topic-specific vector medical diagram
   * rather than reusing an unrelated organ image (such as Liver, Pancreas, or Heart).
   */
  allowedRasterAtlasKey: StrictTopicAtlasKey | null;
  anchorTerms: string[];
  conflictingEntities: ConflictingDiseaseSignature[];
  domainProfile: DomainClinicalProfile;
}

interface CuratedDiseaseEntry {
  topicId: string;
  canonicalTitle: string;
  matchRegex: RegExp;
  organDomain: FineOrganDomain;
  allowedRasterAtlasKey: StrictTopicAtlasKey | null;
  anchorTerms: string[];
  signatureTerms: string[];
  customLandmarks?: InfographicCalloutPin[];
  customDrugRows?: DrugComparisonRow[];
  customVitals?: CaseVitalOrLabEntry[];
  customNormalSummary?: string;
  customPathoSummary?: string;
  customDiagnosticStandard?: string;
  customDifferentials?: string;
}

const STOP_TOPIC_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'over',
  'under',
  'in',
  'of',
  'to',
  'on',
  'vs',
  'versus',
  'study',
  'guide',
  'chapter',
  'page',
  'overview',
  'management',
  'diagnosis',
  'pathophysiology',
  'clinical',
  'acute',
  'chronic',
  'syndrome',
  'disease',
  'disorder',
  'disorders',
]);

function normalizeLooseText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCaseMedical(raw: string): string {
  const acronyms = new Set([
    'pud',
    'gerd',
    'ibd',
    'ibs',
    'gi',
    'ugib',
    'lgib',
    'dka',
    'hhs',
    'aki',
    'ckd',
    'copd',
    'ards',
    'pe',
    'dvt',
    'stemi',
    'nstemi',
    'acs',
    'adhf',
    'hfref',
    'hfpef',
    'chf',
    'sle',
    'ra',
    'hit',
    'ttp',
    'dic',
    'gbs',
    'cns',
    'hiv',
    'tb',
    'uti',
    'sbp',
    'nsaid',
    'nsaids',
    'ppi',
    'ppis',
    'les',
    'ecg',
    'ekg',
  ]);
  const minor = new Set(['of', 'in', 'and', 'with', 'to', 'by', 'on', 'the', 'for']);
  const cleaned = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Medical Topic';
  return cleaned
    .split(' ')
    .map((word, idx) => {
      const stripped = word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (acronyms.has(stripped)) {
        return word.toUpperCase();
      }
      if (idx > 0 && minor.has(stripped)) {
        return word.toLowerCase();
      }
      if (/^[A-Z0-9-]+$/.test(word) && word.length <= 5) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

const CURATED_DISEASE_REGISTRY: CuratedDiseaseEntry[] = [
  {
    topicId: 'peptic-ulcer-disease',
    canonicalTitle: 'Peptic Ulcer Disease',
    matchRegex:
      /\b(peptic\s+ulcer\w*|gastric\s+ulcer\w*|duodenal\s+ulcer\w*|gastroduodenal\s+ulcer\w*|\bpud\b|helicobacter\s+pylori\s+ulcer\w*|nsaid[- ]induced\s+ulcer\w*)\b/i,
    organDomain: 'gastroduodenal',
    allowedRasterAtlasKey: null,
    anchorTerms: [
      'peptic ulcer',
      'gastric ulcer',
      'duodenal ulcer',
      'gastroduodenal',
      'helicobacter pylori',
      'h pylori',
      'nsaid',
      'prostaglandin',
      'parietal cell',
      'proton pump',
      'omeprazole',
      'pantoprazole',
      'duodenal bulb',
      'gastric antrum',
      'lesser curvature',
      'mucosal barrier',
      'bicarbonate',
      'epigastric',
      'melena',
      'hematemesis',
      'gastroduodenal artery',
      'urea breath',
      'stool antigen',
      'endoscopy',
    ],
    signatureTerms: [
      'peptic ulcer',
      'duodenal ulcer',
      'gastric ulcer',
      'helicobacter pylori',
      'gastroduodenal artery',
      'urea breath test',
      'bismuth quadruple',
    ],
    customNormalSummary:
      'Gastric surface foveolar cells secrete an unstirred mucus-bicarbonate (HCO3-) gel stabilized by COX-1-derived prostaglandin E2 (PGE2) and mucosal blood flow, protecting gastroduodenal epithelium from parietal-cell HCl (H+/K+-ATPase) and chief-cell pepsinogen.',
    customPathoSummary:
      'Helicobacter pylori (urease, CagA/VacA cytotoxins, antral somatostatin D-cell depletion -> hypergastrinemia) or NSAID COX-1 inhibition depletes protective PGE2/mucus-HCO3-, producing a mucosal defect penetrating through the muscularis mucosae into the submucosa or deeper.',
    customDiagnosticStandard:
      'Upper GI endoscopy (EGD) with gastric biopsy (mandatory for gastric ulcers to exclude adenocarcinoma and for alarm symptoms: bleeding, weight loss, anemia, age >=60); noninvasive H. pylori stool antigen or 13C-urea breath test (hold PPIs for 2 weeks prior).',
    customDifferentials:
      'Duodenal Ulcer (pain improves with meals, wakes patient 2-3h later; 90% D1 bulb) vs Gastric Ulcer (pain worsens with meals, weight loss; lesser curvature antrum) vs Gastritis / Functional Dyspepsia / Acute Pancreatitis / Biliary Colic / Inferior MI.',
    customLandmarks: [
      {
        number: 1,
        label: 'Mucus-HCO3- & PGE2 Cytoprotective Barrier',
        detail:
          'Surface foveolar mucus gel + epithelial HCO3- secretion + rich submucosal microcirculation maintained by COX-1 prostaglandins; disrupted by NSAIDs.',
        xPct: 24,
        yPct: 26,
      },
      {
        number: 2,
        label: 'Oxyntic Parietal Cell (H+/K+-ATPase)',
        detail:
          'Stimulated by acetylcholine (M3), gastrin (CCK-B), and histamine (H2) to pump H+ into gastric lumen; irreversibly inhibited by PPIs.',
        xPct: 28,
        yPct: 58,
      },
      {
        number: 3,
        label: 'Gastric Antrum & Lesser Curvature Ulcer Site',
        detail:
          'Common site of H. pylori antral colonization (D-cell loss -> gastrin surge) and NSAID gastric ulcers; requires endoscopic biopsy to rule out malignancy.',
        xPct: 56,
        yPct: 62,
      },
      {
        number: 4,
        label: 'Duodenal Bulb (D1) & Gastroduodenal Artery',
        detail:
          'Anterior D1 ulcers risk free intraperitoneal perforation (pneumoperitoneum); posterior D1 ulcers erode the gastroduodenal artery causing massive upper GI hemorrhage.',
        xPct: 76,
        yPct: 38,
      },
    ],
    customDrugRows: [
      {
        drugClass: 'Proton Pump Inhibitors (PPIs)',
        prototypeAgents: 'Omeprazole, Pantoprazole, Esomeprazole',
        mechanismOfAction:
          'Irreversibly inhibit parietal-cell luminal H+/K+-ATPase proton pumps, suppressing basal and meal-stimulated gastric acid secretion (>90%).',
        clinicalIndications:
          'First-line healing of gastric/duodenal ulcers, high-dose IV bolus/infusion in bleeding PUD, core component of H. pylori eradication & NSAID gastroprotection.',
        adverseEffectsAndContraindications:
          'C. difficile colitis risk, hypomagnesemia, vitamin B12/calcium malabsorption with chronic use; hold 2 weeks before H. pylori breath/stool testing.',
      },
      {
        drugClass: 'Bismuth Quadruple H. pylori Regimen',
        prototypeAgents: 'PPI + Bismuth subsalicylate + Tetracycline + Metronidazole (14 days)',
        mechanismOfAction:
          'Direct bactericidal bismuth mucosal coating + 30S ribosomal inhibition (tetracycline) + nitroimidazole DNA strand breakage (metronidazole) + acid suppression.',
        clinicalIndications:
          'First-line empiric H. pylori eradication in Peptic Ulcer Disease (especially where clarithromycin resistance >=15% or penicillin allergy).',
        adverseEffectsAndContraindications:
          'Darkening of tongue/stool (harmless bismuth sulfide; do not confuse with melena), metallic taste, disulfiram-like reaction with alcohol (metronidazole); avoid tetracycline in pregnancy/children.',
      },
      {
        drugClass: 'H2-Receptor Antagonists',
        prototypeAgents: 'Famotidine',
        mechanismOfAction:
          'Reversibly block basolateral histamine H2 receptors on parietal cells, reducing intracellular cAMP-mediated nocturnal acid output.',
        clinicalIndications:
          'Mild uncomplicated acid-peptic symptoms or nocturnal acid breakthrough when PPIs are not tolerated.',
        adverseEffectsAndContraindications:
          'Tachyphylaxis with continuous use; less potent than PPIs for acute ulcer hemostasis; renal dose adjustment required.',
      },
      {
        drugClass: 'Mucosal Cytoprotective Agents',
        prototypeAgents: 'Sucralfate, Misoprostol (PGE1 analog)',
        mechanismOfAction:
          'Sucralfate polymerizes in acid to coat ulcer craters; Misoprostol restores PGE1-mediated mucus/HCO3- secretion and inhibits parietal cAMP.',
        clinicalIndications:
          'Sucralfate for mucosal ulcer barrier support; Misoprostol for prevention of NSAID-induced peptic ulcers in high-risk patients.',
        adverseEffectsAndContraindications:
          'Misoprostol is strictly CONTRAINDICATED in pregnancy (uterotonic abortifacient) and causes secretory diarrhea; Sucralfate impairs absorption of fluoroquinolones/levothyroxine.',
      },
    ],
    customVitals: [
      {
        parameter: 'Blood Pressure',
        value: '96/62 mmHg (orthostatic drop)',
        referenceRange: '90-120/60-80 mmHg',
        flag: 'low',
      },
      {
        parameter: 'Heart Rate',
        value: '112 bpm',
        referenceRange: '60-100 bpm',
        flag: 'high',
      },
      {
        parameter: 'Hemoglobin',
        value: '8.4 g/dL',
        referenceRange: '13.5-17.5 g/dL',
        flag: 'low',
      },
      {
        parameter: 'BUN / Creatinine Ratio',
        value: '38 : 1.0 mg/dL (elevated >20:1)',
        referenceRange: '10-20 : 1',
        flag: 'high',
      },
    ],
  },
  {
    topicId: 'achalasia',
    canonicalTitle: 'Achalasia',
    matchRegex: /\b(achalasia|esophageal\s+achalasia|primary\s+achalasia)\b/i,
    organDomain: 'esophageal',
    allowedRasterAtlasKey: null,
    anchorTerms: [
      'achalasia',
      'lower esophageal sphincter',
      'les',
      'myenteric plexus',
      'auerbach',
      'aperistalsis',
      'bird beak',
      'bird-beak',
      'dysphagia',
      'solids and liquids',
      'manometry',
      'pneumatic dilation',
      'heller myotomy',
      'poem',
      'chagas',
    ],
    signatureTerms: [
      'achalasia',
      'bird beak',
      'bird-beak',
      'auerbach',
      'myenteric plexus',
      'aperistalsis',
      'pneumatic dilation',
      'heller myotomy',
      'incomplete les relaxation',
    ],
  },
  {
    topicId: 'gastroesophageal-reflux-disease',
    canonicalTitle: 'Gastroesophageal Reflux Disease (GERD)',
    matchRegex: /\b(gastroesophageal\s+reflux\w*|\bgerd\b|barrett\s*s?\s+esophag\w*)\b/i,
    organDomain: 'esophageal',
    allowedRasterAtlasKey: null,
    anchorTerms: [
      'gerd',
      'gastroesophageal reflux',
      'lower esophageal sphincter',
      'transient les relaxation',
      'heartburn',
      'regurgitation',
      'esophagitis',
      'barrett',
      'intestinal metaplasia',
      'proton pump inhibitor',
    ],
    signatureTerms: [
      'gastroesophageal reflux',
      'barrett esophagus',
      'transient les relaxation',
      'reflux esophagitis',
    ],
  },
  {
    topicId: 'variceal-hemorrhage-portal-hypertension',
    canonicalTitle: 'Portal Hypertension & Esophageal Variceal Hemorrhage',
    matchRegex:
      /\b(variceal\s+hemorrhage|variceal\s+bleed\w*|esophageal\s+varices|portal\s+hypertension|cirrhosis|decompensated\s+cirrhosis|spontaneous\s+bacterial\s+peritonitis|\bsbp\b)\b/i,
    organDomain: 'hepatobiliary',
    allowedRasterAtlasKey: 'hepatobiliary',
    anchorTerms: [
      'cirrhosis',
      'portal hypertension',
      'variceal',
      'varices',
      'octreotide',
      'terlipressin',
      'ceftriaxone',
      'band ligation',
      'tips',
      'ascites',
      'saag',
      'hepatic',
    ],
    signatureTerms: [
      'variceal hemorrhage',
      'esophageal varices',
      'octreotide',
      'endoscopic variceal band ligation',
      'transjugular intrahepatic portosystemic shunt',
      'spontaneous bacterial peritonitis',
    ],
  },
  {
    topicId: 'acute-pancreatitis',
    canonicalTitle: 'Acute Pancreatitis',
    matchRegex: /\b(acute\s+pancreatitis|chronic\s+pancreatitis|pancreatitis)\b/i,
    organDomain: 'pancreatic',
    allowedRasterAtlasKey: null,
    anchorTerms: [
      'pancreatitis',
      'lipase',
      'amylase',
      'autodigestion',
      'trypsinogen',
      'gallstone',
      'epigastric pain radiating to back',
      'lactated ringer',
      'necrotizing pancreatitis',
    ],
    signatureTerms: [
      'acute pancreatitis',
      'serum lipase',
      'acinar autodigestion',
      'trypsinogen activation',
      'ranson',
      'bisap',
    ],
  },
  {
    topicId: 'inflammatory-bowel-disease',
    canonicalTitle: 'Inflammatory Bowel Disease (Crohn Disease & Ulcerative Colitis)',
    matchRegex:
      /\b(inflammatory\s+bowel\s+disease|\bibd\b|crohn\s*s?\s+disease|ulcerative\s+colitis)\b/i,
    organDomain: 'intestinal_colorectal',
    allowedRasterAtlasKey: null,
    anchorTerms: [
      'crohn',
      'ulcerative colitis',
      'inflammatory bowel',
      'transmural',
      'skip lesions',
      'noncaseating granuloma',
      'crypt abscess',
      'mesalamine',
      'infliximab',
      'calprotectin',
    ],
    signatureTerms: [
      'crohn disease',
      'ulcerative colitis',
      'skip lesions',
      'crypt abscesses',
      'noncaseating granulomas',
      'mesalamine',
    ],
  },
  {
    topicId: 'acute-decompensated-heart-failure',
    canonicalTitle: 'Acute Decompensated Heart Failure',
    matchRegex:
      /\b(heart\s+failure|\badhf\b|\bhfref\b|\bhfpef\b|\bchf\b|cardiogenic\s+pulmonary\s+edema)\b/i,
    organDomain: 'cardiovascular',
    allowedRasterAtlasKey: 'cardiopulmonary_anatomy',
    anchorTerms: [
      'heart failure',
      'ventricular',
      'preload',
      'afterload',
      'frank starling',
      'pcwp',
      'bnp',
      'furosemide',
      'sacubitril',
      'sglt2',
      'orthopnea',
    ],
    signatureTerms: [
      'heart failure',
      'hfref',
      'hfpef',
      'sacubitril',
      'frank-starling',
      'pulmonary capillary wedge pressure',
    ],
  },
  {
    topicId: 'acute-coronary-syndrome',
    canonicalTitle: 'Acute Coronary Syndrome',
    matchRegex:
      /\b(acute\s+coronary\s+syndrome|\bacs\b|\bstemi\b|\bnstemi\b|myocardial\s+infarction)\b/i,
    organDomain: 'cardiovascular',
    allowedRasterAtlasKey: 'cardiopulmonary_anatomy',
    anchorTerms: [
      'coronary',
      'troponin',
      'stemi',
      'nstemi',
      'myocardial infarction',
      'pci',
      'reperfusion',
      'antiplatelet',
      'aspirin',
      'p2y12',
    ],
    signatureTerms: [
      'st-elevation myocardial infarction',
      'nstemi',
      'percutaneous coronary intervention',
      'coronary plaque rupture',
    ],
  },
  {
    topicId: 'asthma-copd-airway-disease',
    canonicalTitle: 'Obstructive Airway Disease',
    matchRegex: /\b(asthma|\bcopd\b|chronic\s+obstructive\s+pulmonary\s+disease)\b/i,
    organDomain: 'respiratory',
    allowedRasterAtlasKey: 'respiratory',
    anchorTerms: [
      'asthma',
      'copd',
      'bronchoconstriction',
      'fev1',
      'fvc',
      'albuterol',
      'ipratropium',
      'corticosteroid',
      'airflow',
      'hypercapnia',
    ],
    signatureTerms: [
      'bronchial asthma',
      'chronic obstructive pulmonary',
      'fev1/fvc',
      'inhaled corticosteroid',
    ],
  },
  {
    topicId: 'diabetic-ketoacidosis',
    canonicalTitle: 'Diabetic Ketoacidosis (DKA)',
    matchRegex: /\b(diabetic\s+ketoacidosis|\bdka\b|hyperosmolar\s+hyperglycemic|\bhhs\b)\b/i,
    organDomain: 'endocrine_metabolic',
    allowedRasterAtlasKey: 'endocrine',
    anchorTerms: [
      'diabetic ketoacidosis',
      'dka',
      'insulin',
      'glucagon',
      'ketone',
      'beta hydroxybutyrate',
      'anion gap',
      'potassium',
      'kussmaul',
      'crystalloid',
    ],
    signatureTerms: [
      'diabetic ketoacidosis',
      'beta-hydroxybutyrate',
      'kussmaul',
      'iv regular insulin',
    ],
  },
  {
    topicId: 'acute-kidney-injury',
    canonicalTitle: 'Acute Kidney Injury (AKI)',
    matchRegex: /\b(acute\s+kidney\s+injury|\baki\b|acute\s+tubular\s+necrosis|\batn\b)\b/i,
    organDomain: 'renal_electrolytes',
    allowedRasterAtlasKey: 'renal',
    anchorTerms: [
      'acute kidney injury',
      'aki',
      'creatinine',
      'fena',
      'prerenal',
      'acute tubular necrosis',
      'muddy brown casts',
      'glomerular filtration',
      'oliguria',
    ],
    signatureTerms: [
      'acute kidney injury',
      'fractional excretion of sodium',
      'muddy brown granular casts',
      'acute tubular necrosis',
    ],
  },
  {
    topicId: 'systemic-lupus-erythematosus',
    canonicalTitle: 'Systemic Lupus Erythematosus (SLE)',
    matchRegex: /\b(systemic\s+lupus\s+erythematosus|\bsle\b|lupus\s+nephritis)\b/i,
    organDomain: 'rheumatology_immunology',
    allowedRasterAtlasKey: null,
    anchorTerms: [
      'lupus',
      'sle',
      'ana',
      'anti-dsdna',
      'anti-smith',
      'complement',
      'immune complex',
      'hydroxychloroquine',
      'lupus nephritis',
    ],
    signatureTerms: [
      'systemic lupus erythematosus',
      'anti-dsdna',
      'anti-smith',
      'hydroxychloroquine',
      'lupus nephritis',
    ],
  },
];

function inferFineOrganDomain(rawTopic: string): {
  organDomain: FineOrganDomain;
  systemTemplate: AnatomicalSystemTemplate;
  allowedRasterAtlasKey: StrictTopicAtlasKey | null;
} {
  const lower = normalizeLooseText(rawTopic);

  if (
    /\b(peptic|gastric|stomach|duoden\w*|pylor\w*|gastritis|zollinger|oxyntic|parietal|hematemesis|melena)\b/.test(
      lower
    )
  ) {
    return {
      organDomain: 'gastroduodenal',
      systemTemplate: 'general_physiology',
      allowedRasterAtlasKey: null,
    };
  }

  if (
    /\b(esophag\w*|achalasia|gerd|barrett|dysphagia|odynophagia|mallory|boerhaave|zenker)\b/.test(
      lower
    )
  ) {
    return {
      organDomain: 'esophageal',
      systemTemplate: 'general_physiology',
      allowedRasterAtlasKey: null,
    };
  }

  if (/\b(pancrea\w*|lipase|amylase|insulinoma|whipple)\b/.test(lower)) {
    const isIsletEndocrine = /\b(diabet\w*|dka|ketoacidosis|insulin|islet|glucagon)\b/.test(lower);
    return {
      organDomain: isIsletEndocrine ? 'endocrine_metabolic' : 'pancreatic',
      systemTemplate: isIsletEndocrine ? 'endocrine' : 'general_physiology',
      allowedRasterAtlasKey: isIsletEndocrine ? 'endocrine' : null,
    };
  }

  if (
    /\b(liver|hepat\w*|cirrhosis|ascites|varic\w*|portal\s+hypertension|biliary|gallbladder|cholecyst\w*|cholangit\w*|jaundice|bilirubin)\b/.test(
      lower
    )
  ) {
    return {
      organDomain: 'hepatobiliary',
      systemTemplate: 'hepatobiliary',
      allowedRasterAtlasKey: 'hepatobiliary',
    };
  }

  if (
    /\b(crohn|colitis|ibd|celiac|bowel|intestin\w*|colon\w*|rectal|appendic\w*|diverticul\w*|ileus|volvulus|diarrhea|malabsorption)\b/.test(
      lower
    )
  ) {
    return {
      organDomain: 'intestinal_colorectal',
      systemTemplate: 'general_physiology',
      allowedRasterAtlasKey: null,
    };
  }

  if (
    /\b(heart|cardiac|coronary|myocardi\w*|pericardi\w*|endocardi\w*|stemi|nstemi|acs|hfref|hfpef|adhf|chf|atrial|ventricular|arrhythmia|valve|aortic|hypertension)\b/.test(
      lower
    )
  ) {
    return {
      organDomain: 'cardiovascular',
      systemTemplate: 'cardiopulmonary',
      allowedRasterAtlasKey: 'cardiopulmonary_anatomy',
    };
  }

  if (
    /\b(lung|pulmonary|respirator\w*|asthma|copd|pneumonia|alveol\w*|pleural|ards|embolism|bronch\w*|hypoxemia)\b/.test(
      lower
    )
  ) {
    return {
      organDomain: 'respiratory',
      systemTemplate: 'respiratory',
      allowedRasterAtlasKey: 'respiratory',
    };
  }

  if (
    /\b(kidney|renal|nephron|nephrit\w*|nephrotic|glomerul\w*|aki|ckd|tubular|hyponatremia|hypernatremia|hyperkalemia|hypokalemia|acidosis|alkalosis)\b/.test(
      lower
    )
  ) {
    return {
      organDomain: 'renal_electrolytes',
      systemTemplate: 'renal',
      allowedRasterAtlasKey: 'renal',
    };
  }

  if (
    /\b(diabet\w*|dka|ketoacidosis|hhs|thyroid\w*|graves|hashimoto|adrenal|cushing|addison|pituitary|pheochromocytoma|hypercalcemia|parathyroid)\b/.test(
      lower
    )
  ) {
    const isPancreaticDiabetes = /\b(diabet\w*|dka|ketoacidosis|hhs|insulin|glucagon)\b/.test(lower);
    return {
      organDomain: 'endocrine_metabolic',
      systemTemplate: 'endocrine',
      allowedRasterAtlasKey: isPancreaticDiabetes ? 'endocrine' : null,
    };
  }

  if (
    /\b(brain|cerebr\w*|stroke|seizure|epilep\w*|meningit\w*|encephalit\w*|guillain|neuropath\w*|myasthenia|parkinson|multiple\s+sclerosis)\b/.test(
      lower
    )
  ) {
    const isCnsBrain = /\b(brain|cerebr\w*|stroke|seizure|epilep\w*|meningit\w*|encephalit\w*|parkinson)\b/.test(
      lower
    );
    return {
      organDomain: 'neurology',
      systemTemplate: 'neurology',
      allowedRasterAtlasKey: isCnsBrain ? 'neurology' : null,
    };
  }

  if (
    /\b(anemia|iron|cobalamin|b12|folate|platelet|thrombocytopen\w*|hit|ttp|dic|coagul\w*|hemophilia|leukemia|lymphoma|myeloma|hemolysis|sickle)\b/.test(
      lower
    )
  ) {
    return {
      organDomain: 'hematology_oncology',
      systemTemplate: 'hematology',
      allowedRasterAtlasKey: 'hematology',
    };
  }

  if (
    /\b(lupus|sle|rheumatoid|vasculit\w*|autoimmun\w*|scleroderma|sjogren|ankylosing|gout|anaphylaxis)\b/.test(
      lower
    )
  ) {
    return {
      organDomain: 'rheumatology_immunology',
      systemTemplate: 'immune',
      allowedRasterAtlasKey: null,
    };
  }

  if (/\b(sepsis|septic|bacteremia|hiv|tuberculosis|malaria|infect\w*|antibiotic)\b/.test(lower)) {
    return {
      organDomain: 'infectious_disease',
      systemTemplate: 'immune',
      allowedRasterAtlasKey: null,
    };
  }

  if (/\b(fracture|osteo\w*|muscle|rhabdomyolysis|compartment|dermat\w*|psoriasis|cellulitis)\b/.test(lower)) {
    return {
      organDomain: 'musculoskeletal_integument',
      systemTemplate: 'general_physiology',
      allowedRasterAtlasKey: null,
    };
  }

  if (/\b(pregnan\w*|preeclampsia|eclampsia|ectopic|placenta|ovarian|uterine|postpartum)\b/.test(lower)) {
    return {
      organDomain: 'reproductive_obstetric',
      systemTemplate: 'general_physiology',
      allowedRasterAtlasKey: null,
    };
  }

  return {
    organDomain: 'multisystem_general',
    systemTemplate: 'general_physiology',
    allowedRasterAtlasKey: null,
  };
}

function buildDomainClinicalProfile(
  organDomain: FineOrganDomain,
  curated?: CuratedDiseaseEntry
): DomainClinicalProfile {
  if (organDomain === 'gastroduodenal') {
    return {
      organDomain,
      anatomicalRegionLabel: 'Esophagogastroduodenal Mucosa, Gastric Antrum & Duodenal Bulb (D1)',
      defaultLandmarks:
        curated?.customLandmarks || [
          {
            number: 1,
            label: 'Mucus-HCO3- & Prostaglandin E2 Cytoprotective Layer',
            detail:
              'Unstirred surface mucus gel + epithelial bicarbonate buffer + mucosal microcirculation protecting against luminal acid and pepsin.',
            xPct: 24,
            yPct: 26,
          },
          {
            number: 2,
            label: 'Gastric Oxyntic Parietal Cell (H+/K+-ATPase)',
            detail:
              'Secretes concentrated HCl into gastric lumen under gastrin, histamine (H2), and vagal ACh (M3) stimulation.',
            xPct: 28,
            yPct: 58,
          },
          {
            number: 3,
            label: 'Gastric Antrum & Lesser Curvature Mucosa',
            detail:
              'Primary locus of gastrin G-cells, somatostatin D-cells, H. pylori colonization, and gastric mucosal ulceration.',
            xPct: 56,
            yPct: 62,
          },
          {
            number: 4,
            label: 'Duodenal Bulb (D1) & Gastroduodenal Artery',
            detail:
              'Receives acidic chyme neutralized by Brunner glands; posterior D1 erosion risks gastroduodenal artery hemorrhage, anterior risks free perforation.',
            xPct: 76,
            yPct: 38,
          },
        ],
      normalBaselineSummary:
        curated?.customNormalSummary ||
        'Gastroduodenal homeostasis balances aggressive luminal HCl/pepsin secretion against COX-1 prostaglandin E2-driven mucus-bicarbonate buffering, tight epithelial junctions, and brisk mucosal blood flow.',
      pathophysiologySummaryTemplate: (topic) =>
        curated?.customPathoSummary ||
        `In ${topic}, breakdown of gastroduodenal mucosal defense (via H. pylori inflammation or NSAID COX-1 inhibition) allows acid-peptic penetration through the muscularis mucosae into submucosal vessels or muscularis propria.`,
      normalHistologyNote:
        'Intact tall columnar foveolar epithelium with continuous PAS-positive apical mucin cap, organized oxyntic/pyloric glands, and uninflamed lamina propria.',
      pathologicalHistologyTemplate: (topic) =>
        `Characteristic ${topic} lesion: sharply demarcated mucosal-submucosal ulcer crater lined by superficial fibrinopurulent exudate, necrotic zone, granulation tissue, and fibrotic base (plus chronic active gastritis if H. pylori-positive).`,
      curveAxisX: 'Intragastric Acid-Peptic Load / Mucosal Barrier Injury',
      curveAxisY: 'Mucosal Integrity & Cytoprotective HCO3- Output',
      defaultVitalsAndLabs:
        curated?.customVitals || [
          {
            parameter: 'Blood Pressure',
            value: '102/64 mmHg',
            referenceRange: '90-120/60-80 mmHg',
            flag: 'low',
          },
          {
            parameter: 'Heart Rate',
            value: '106 bpm',
            referenceRange: '60-100 bpm',
            flag: 'high',
          },
          {
            parameter: 'Hemoglobin / MCV',
            value: '9.2 g/dL (MCV 74 fL)',
            referenceRange: '13.5-17.5 g/dL',
            flag: 'low',
          },
          {
            parameter: 'H. pylori Stool Antigen / BUN:Cr',
            value: 'Positive  |  BUN:Cr 32:1',
            referenceRange: 'Negative  |  10-20:1',
            flag: 'high',
          },
        ],
      decompensatedVitalsAndLabs: [
        {
          parameter: 'Blood Pressure',
          value: '84/50 mmHg (hemorrhagic/perforative shock)',
          referenceRange: '90-120/60-80 mmHg',
          flag: 'critical',
        },
        {
          parameter: 'Heart Rate',
          value: '126 bpm',
          referenceRange: '60-100 bpm',
          flag: 'high',
        },
        {
          parameter: 'Hemoglobin (Serial)',
          value: '6.8 g/dL (hematemesis / melena)',
          referenceRange: '13.5-17.5 g/dL',
          flag: 'critical',
        },
        {
          parameter: 'Upright Chest / Abdo Radiograph',
          value: 'Assess for subdiaphragmatic free air if peritonitic',
          referenceRange: 'No pneumoperitoneum',
          flag: 'critical',
        },
      ],
      firstLineDrugRowsTemplate: (topic) =>
        curated?.customDrugRows || [
          {
            drugClass: 'Proton Pump Inhibitors (PPIs)',
            prototypeAgents: 'Omeprazole, Pantoprazole, Esomeprazole',
            mechanismOfAction:
              'Irreversible covalent inhibition of gastric parietal-cell H+/K+-ATPase proton pumps.',
            clinicalIndications: `First-line mucosal healing, GI bleeding stabilization, and H. pylori eradication in ${topic}.`,
            adverseEffectsAndContraindications:
              'Hold 2 weeks prior to H. pylori urea breath/stool testing; monitor Mg2+, B12, and C. difficile risk with long-term therapy.',
          },
          {
            drugClass: 'H. pylori Eradication Regimens',
            prototypeAgents: 'Bismuth Quadruple (PPI + Bismuth + Tetracycline + Metronidazole)',
            mechanismOfAction:
              'Eradicates spiral urease-producing H. pylori organisms to restore mucosal D-cell somatostatin regulation and prevent ulcer relapse.',
            clinicalIndications: `All H. pylori-positive ${topic} cases (confirm eradication >=4 weeks post-therapy).`,
            adverseEffectsAndContraindications:
              'Harmless dark stool from bismuth, metallic taste, disulfiram-like alcohol reaction (metronidazole); avoid tetracycline in pregnancy.',
          },
        ],
      diagnosticGoldStandardTemplate: (topic) =>
        curated?.customDiagnosticStandard ||
        `Upper GI endoscopy (EGD) with targeted mucosal biopsy (mandatory for gastric ulcers and alarm symptoms in ${topic}) plus H. pylori stool antigen or 13C-urea breath testing.`,
      differentialSummaryTemplate: (topic) =>
        curated?.customDifferentials ||
        `Differentiate ${topic} (duodenal vs gastric ulcer pain-meal timing) from acute pancreatitis, biliary colic/cholecystitis, gastric adenocarcinoma, functional dyspepsia, and inferior wall myocardial ischemia.`,
    };
  }

  if (organDomain === 'esophageal') {
    return {
      organDomain,
      anatomicalRegionLabel: 'Tubular Esophageal Body, Myenteric Plexus & Lower Esophageal Sphincter (LES)',
      defaultLandmarks: [
        {
          number: 1,
          label: 'Proximal & Mid-Esophageal Muscularis Propria',
          detail: 'Coordinates primary and secondary peristaltic waves moving boluses caudally.',
          xPct: 48,
          yPct: 24,
        },
        {
          number: 2,
          label: 'Auerbach (Myenteric) Inhibitory Ganglion Plexus',
          detail: 'Nitric oxide / VIP neurons mediating physiological LES relaxation during swallowing.',
          xPct: 58,
          yPct: 48,
        },
        {
          number: 3,
          label: 'Lower Esophageal Sphincter (LES) High-Pressure Zone',
          detail: 'Maintains resting gastroesophageal barrier tone and relaxes upon deglutition.',
          xPct: 52,
          yPct: 68,
        },
        {
          number: 4,
          label: 'Crural Diaphragm & Gastroesophageal Junction',
          detail: 'Anatomical antireflux pinchcock separating thoracic esophagus from gastric cardia.',
          xPct: 54,
          yPct: 82,
        },
      ],
      normalBaselineSummary:
        'Coordinated esophageal peristalsis coupled with nitric-oxide-mediated lower esophageal sphincter (LES) relaxation propels swallowed solids and liquids into the stomach while preventing acid reflux.',
      pathophysiologySummaryTemplate: (topic) =>
        `In ${topic}, impaired esophageal neuromuscular coordination or LES barrier dysfunction disrupts bolus transit or mucosal acid clearance.`,
      normalHistologyNote:
        'Non-keratinized stratified squamous esophageal epithelium with intact submucosal glands and ganglion-rich Auerbach myenteric plexus.',
      pathologicalHistologyTemplate: (topic) =>
        `Histopathological alterations specific to ${topic} involving the esophageal squamous mucosa, lamina propria, or myenteric ganglion neurons.`,
      curveAxisX: 'Deglutition Time / Bolus Volume',
      curveAxisY: 'Integrated LES Relaxation & Peristaltic Pressure (mmHg)',
      defaultVitalsAndLabs: [
        { parameter: 'Blood Pressure', value: '118/74 mmHg', referenceRange: '90-120/60-80 mmHg', flag: 'normal' },
        { parameter: 'BMI / Weight Trend', value: '6 kg unintentional weight loss', referenceRange: 'Stable weight', flag: 'low' },
        { parameter: 'High-Resolution Manometry', value: 'Abnormal esophageal motility / IRP', referenceRange: 'Normal IRP <15 mmHg', flag: 'high' },
      ],
      decompensatedVitalsAndLabs: [
        { parameter: 'Oxygen Saturation', value: '91% (nocturnal aspiration risk)', referenceRange: '95-100%', flag: 'low' },
        { parameter: 'Barium Esophagram / EGD', value: 'Marked esophageal stasis / mucosal review', referenceRange: 'Prompt clearance', flag: 'critical' },
        { parameter: 'Serum Albumin', value: '3.0 g/dL', referenceRange: '3.5-5.0 g/dL', flag: 'low' },
      ],
      firstLineDrugRowsTemplate: (topic) => [
        {
          drugClass: 'Targeted Esophageal Pharmacotherapy / Intervention',
          prototypeAgents: 'Proton Pump Inhibitors, Smooth-Muscle Relaxants, or Endoscopic Myotomy/Dilation',
          mechanismOfAction: 'Modulates LES tone or suppresses gastroesophageal acid exposure depending on etiology.',
          clinicalIndications: `Evidence-based symptom and mucosal management in ${topic}.`,
          adverseEffectsAndContraindications: 'Always perform upper endoscopy first to exclude pseudoachalasia / esophageal carcinoma.',
        },
      ],
      diagnosticGoldStandardTemplate: (topic) =>
        `Upper GI endoscopy (EGD) to exclude mechanical obstruction/malignancy followed by high-resolution esophageal manometry or ambulatory pH-impedance monitoring for ${topic}.`,
      differentialSummaryTemplate: (topic) =>
        `Differentiate ${topic} from esophageal adenocarcinoma (pseudoachalasia), peptic stricture, eosinophilic esophagitis, diffuse esophageal spasm, and systemic sclerosis.`,
    };
  }

  // Generic organ-domain profiles for all other anatomical systems (zero mismatched lung/heart boilerplate on non-cardiopulmonary organs!)
  const domainLabels: Record<FineOrganDomain, string> = {
    gastroduodenal: 'Gastroduodenal Mucosa & Pyloroduodenal Axis',
    esophageal: 'Esophageal Body & Lower Esophageal Sphincter',
    hepatobiliary: 'Hepatic Lobule, Portal Triad & Biliary Tree',
    pancreatic: 'Exocrine Acinar Pancreas, Duct of Wirsung & Ampulla',
    intestinal_colorectal: 'Small Intestinal Villi, Ileocecal Region & Colonic Mucosa',
    cardiovascular: 'Four-Chamber Myocardium, Coronary Tree & Systemic Vasculature',
    respiratory: 'Tracheobronchial Tree & Alveolar-Capillary Membrane',
    renal_electrolytes: 'Glomerular Filtration Barrier & Nephron Tubular Segments',
    endocrine_metabolic: 'Endocrine Glandular Axis, Hormone Receptors & Metabolic Targets',
    neurology: 'Cerebrovascular / Central & Peripheral Neural Pathways',
    hematology_oncology: 'Hematopoietic Marrow, Erythrocytes, Platelets & Coagulation Cascade',
    rheumatology_immunology: 'Innate/Adaptive Immune Effectors, Autoantibodies & Target Synovium/Organs',
    infectious_disease: 'Host-Pathogen Interface, Innate Cytokines & Antimicrobial Targets',
    musculoskeletal_integument: 'Musculoskeletal Compartments, Osseous Matrix & Cutaneous Barrier',
    reproductive_obstetric: 'Uteroplacental Circulation & Reproductive Endocrine Axis',
    multisystem_general: 'Target Organ Parenchyma, Microvasculature & Homeostatic Feedback Loop',
  };

  const region = domainLabels[organDomain];
  return {
    organDomain,
    anatomicalRegionLabel: region,
    defaultLandmarks:
      curated?.customLandmarks || [
        {
          number: 1,
          label: `Primary Anatomical Site (${region.split(',')[0]})`,
          detail: 'Baseline structural compartment maintaining physiological organ function.',
          xPct: 26,
          yPct: 30,
        },
        {
          number: 2,
          label: 'Regulatory Receptor / Neurovascular Supply',
          detail: 'Controls local perfusion, cellular signaling, and homeostatic reserve.',
          xPct: 52,
          yPct: 46,
        },
        {
          number: 3,
          label: 'Primary Pathological Lesion / Target Cell',
          detail: 'Focal cellular or structural site altered during active disease progression.',
          xPct: 74,
          yPct: 40,
        },
        {
          number: 4,
          label: 'Downstream Functional Outflow / Sequelae',
          detail: 'Translates tissue injury into characteristic bedside signs and biomarker shifts.',
          xPct: 62,
          yPct: 72,
        },
      ],
    normalBaselineSummary:
      curated?.customNormalSummary ||
      `Within the ${region.toLowerCase()}, tightly regulated perfusion, cellular transport, and feedback signaling preserve baseline physiological function.`,
    pathophysiologySummaryTemplate: (topic) =>
      curated?.customPathoSummary ||
      `In ${topic}, targeted injury within the ${region.toLowerCase()} overwhelms compensatory mechanisms and drives clinical manifestations.`,
    normalHistologyNote: `Preserved baseline tissue architecture across the ${region.toLowerCase()} with intact cellular polarity and microvasculature.`,
    pathologicalHistologyTemplate: (topic) =>
      `Characteristic structural and cellular pathology of ${topic} affecting the ${region.toLowerCase()}.`,
    curveAxisX: 'Disease Progression / Physiological Load',
    curveAxisY: 'Organ Reserve & Homeostatic Compensation',
    defaultVitalsAndLabs:
      curated?.customVitals || [
        { parameter: 'Blood Pressure', value: '114/72 mmHg', referenceRange: '90-120/60-80 mmHg', flag: 'normal' },
        { parameter: 'Heart Rate', value: '104 bpm', referenceRange: '60-100 bpm', flag: 'high' },
        { parameter: 'Primary Organ Biomarker', value: 'Diagnostic abnormality outside reference range', referenceRange: 'Within baseline limits', flag: 'high' },
      ],
    decompensatedVitalsAndLabs: [
      { parameter: 'Blood Pressure', value: '86/52 mmHg', referenceRange: '90-120/60-80 mmHg', flag: 'critical' },
      { parameter: 'Heart Rate', value: '124 bpm', referenceRange: '60-100 bpm', flag: 'high' },
      { parameter: 'Serum Lactate / Severity Marker', value: '3.9 mmol/L (critical organ strain)', referenceRange: '< 2.0 mmol/L', flag: 'critical' },
    ],
    firstLineDrugRowsTemplate: (topic) =>
      curated?.customDrugRows || [
        {
          drugClass: 'First-Line Targeted Pharmacotherapy',
          prototypeAgents: `Guideline-directed primary agent class for ${topic}`,
          mechanismOfAction: `Directly interrupts the primary pathophysiological pathway of ${topic} within the ${region.toLowerCase()}.`,
          clinicalIndications: `Confirmed ${topic} meeting clinical and diagnostic criteria.`,
          adverseEffectsAndContraindications:
            'Verify baseline renal/hepatic function, electrolytes, allergies, and hemodynamic contraindications before dosing.',
        },
        {
          drugClass: 'Supportive & Complication-Preventive Therapy',
          prototypeAgents: `Adjunctive physiological stabilizer for ${topic}`,
          mechanismOfAction: 'Supports organ perfusion, symptom relief, and prevention of secondary complications.',
          clinicalIndications: `Acute symptomatic presentation or high-risk ${topic}.`,
          adverseEffectsAndContraindications:
            'Monitor serial clinical response and avoid offending or nephrotoxic co-medications.',
        },
      ],
    diagnosticGoldStandardTemplate: (topic) =>
      curated?.customDiagnosticStandard ||
      `Focused clinical evaluation integrated with confirmatory biomarkers and targeted organ imaging/endoscopy specific to ${topic}.`,
    differentialSummaryTemplate: (topic) =>
      curated?.customDifferentials ||
      `Systematically distinguish ${topic} from mimicking conditions affecting the ${region.toLowerCase()} using clinical tempo and confirmatory diagnostics.`,
  };
}

/**
 * Single Canonical Topic Resolver used across Topic Input, Retrieval, Lesson Sanitization,
 * Illustrations, 30 MCQs, 10 Written Questions, 8 Clinical Cases, Studio Preview, and PDF Export.
 */
export function canonicalizeMedicalTopic(rawInput: string): CanonicalTopicDescriptor {
  const cleanedRaw = String(rawInput || '')
    .replace(/\s+/g, ' ')
    .trim();
  const matchedCurated = CURATED_DISEASE_REGISTRY.find((entry) =>
    entry.matchRegex.test(cleanedRaw)
  );

  // Build list of OTHER distinct diseases as conflicting entities so adjacent chapters
  // (e.g., Achalasia vs Peptic Ulcer vs Variceal Hemorrhage) can never hijack content!
  const buildConflicts = (selfTopicId: string): ConflictingDiseaseSignature[] =>
    CURATED_DISEASE_REGISTRY.filter((e) => e.topicId !== selfTopicId).map((e) => ({
      entityId: e.topicId,
      label: e.canonicalTitle,
      signatureTerms: e.signatureTerms,
    }));

  if (matchedCurated) {
    const inferred = inferFineOrganDomain(matchedCurated.canonicalTitle);
    const domainProfile = buildDomainClinicalProfile(
      matchedCurated.organDomain,
      matchedCurated
    );
    return {
      topicId: matchedCurated.topicId,
      canonicalTopicId: matchedCurated.topicId,
      canonicalTitle: matchedCurated.canonicalTitle,
      rawInput: cleanedRaw || matchedCurated.canonicalTitle,
      organDomain: matchedCurated.organDomain,
      systemTemplate: inferred.systemTemplate,
      allowedRasterAtlasKey: matchedCurated.allowedRasterAtlasKey,
      anchorTerms: matchedCurated.anchorTerms,
      conflictingEntities: buildConflicts(matchedCurated.topicId),
      domainProfile,
    };
  }

  const normalized = normalizeLooseText(cleanedRaw);
  const meaningfulTokens = normalized
    .split(' ')
    .filter((tok) => tok.length >= 2 && !STOP_TOPIC_WORDS.has(tok));

  const slugTokens = meaningfulTokens.length > 0 ? meaningfulTokens : normalized.split(' ').filter(Boolean);
  const topicId =
    slugTokens
      .join('-')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'medical-topic';

  const canonicalTitle = toTitleCaseMedical(cleanedRaw);
  const inferred = inferFineOrganDomain(cleanedRaw);
  const domainProfile = buildDomainClinicalProfile(inferred.organDomain);

  const anchorTerms = Array.from(
    new Set([
      normalized,
      ...meaningfulTokens.filter((t) => t.length >= 3),
    ])
  ).filter(Boolean);

  return {
    topicId,
    canonicalTopicId: topicId,
    canonicalTitle,
    rawInput: cleanedRaw,
    organDomain: inferred.organDomain,
    systemTemplate: inferred.systemTemplate,
    allowedRasterAtlasKey: inferred.allowedRasterAtlasKey,
    anchorTerms,
    conflictingEntities: buildConflicts(topicId),
    domainProfile,
  };
}

function countTermHits(haystackLower: string, term: string): number {
  const cleanTerm = normalizeLooseText(term);
  if (!cleanTerm || !haystackLower) return 0;
  const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = haystackLower.match(new RegExp(`\\b${escaped}\\b`, 'g'));
  return matches ? matches.length : 0;
}

/**
 * Detects whether a textbook passage or generated item is actually centered on a
 * DIFFERENT conflicting medical disease (e.g., an Achalasia chapter that casually mentions "ulcer"
 * when the canonical topic is Peptic Ulcer Disease).
 */
export function detectConflictingTopicHijack(
  text: string,
  headingOrTitle: string | undefined,
  canonical: CanonicalTopicDescriptor
): { hijacked: boolean; conflictingLabel?: string } {
  const normHeading = normalizeLooseText(headingOrTitle || '');
  const normBody = normalizeLooseText(text || '');
  const normCombined = `${normHeading} ${normBody}`.trim();
  if (!normCombined) return { hijacked: false };

  // Count how strongly the text anchors to the canonical topic itself
  let canonicalHits = 0;
  for (const term of canonical.anchorTerms) {
    if (term.length < 4 && term !== 'pud' && term !== 'dka' && term !== 'aki' && term !== 'sle') {
      continue;
    }
    canonicalHits += countTermHits(normBody, term) + countTermHits(normHeading, term) * 2;
  }

  for (const conflict of canonical.conflictingEntities) {
    // 1. Direct heading hijack: heading explicitly names a conflicting disease while NOT naming the canonical topic
    const conflictTitleNorm = normalizeLooseText(
      conflict.label.replace(/\([^)]*\)/g, '')
    );
    const canonicalTitleNorm = normalizeLooseText(
      canonical.canonicalTitle.replace(/\([^)]*\)/g, '')
    );
    const headingNamesConflict =
      (conflictTitleNorm.length >= 5 && countTermHits(normHeading, conflictTitleNorm) > 0) ||
      conflict.signatureTerms.some((sig) => countTermHits(normHeading, sig) > 0);
    const headingNamesCanonical =
      (canonicalTitleNorm.length >= 4 && countTermHits(normHeading, canonicalTitleNorm) > 0) ||
      canonical.anchorTerms.slice(0, 4).some((a) => a.length >= 5 && countTermHits(normHeading, a) > 0);

    if (headingNamesConflict && !headingNamesCanonical) {
      return { hijacked: true, conflictingLabel: conflict.label };
    }

    // 2. Body signature dominance: multiple pathognomonic terms of a conflicting entity dominate over canonical topic
    let conflictSigHits = 0;
    let distinctSigMatched = 0;
    for (const sig of conflict.signatureTerms) {
      const h = countTermHits(normCombined, sig);
      if (h > 0) {
        conflictSigHits += h;
        distinctSigMatched += 1;
      }
    }

    if (
      distinctSigMatched >= 2 &&
      conflictSigHits >= 2 &&
      conflictSigHits > canonicalHits
    ) {
      return { hijacked: true, conflictingLabel: conflict.label };
    }
  }

  return { hijacked: false };
}

/**
 * Checks whether a candidate title (e.g., Cover Page title, customTitle, or LLM raw.topic)
 * faithfully represents the canonical topic without drifting to a different disease.
 */
export function doesTitleMatchCanonicalTopic(
  candidateTitle: string,
  canonical: CanonicalTopicDescriptor
): { matches: boolean; reason?: string } {
  const cleanCandidate = String(candidateTitle || '').trim();
  if (!cleanCandidate) {
    return { matches: false, reason: 'Document title is empty.' };
  }

  const candidateCanonical = canonicalizeMedicalTopic(cleanCandidate);
  if (candidateCanonical.topicId === canonical.topicId) {
    return { matches: true };
  }

  // Block immediately if candidate title resolves to a known conflicting disease
  const hijack = detectConflictingTopicHijack(cleanCandidate, cleanCandidate, canonical);
  if (hijack.hijacked) {
    return {
      matches: false,
      reason: `Title "${cleanCandidate}" refers to conflicting topic "${hijack.conflictingLabel}" instead of canonical topic "${canonical.canonicalTitle}".`,
    };
  }

  const normCand = normalizeLooseText(cleanCandidate);
  const coreCanonicalWords = normalizeLooseText(canonical.canonicalTitle)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP_TOPIC_WORDS.has(w));

  const matchedCore = coreCanonicalWords.filter((w) => countTermHits(normCand, w) > 0);
  const anchorHit = canonical.anchorTerms.some(
    (a) => a.length >= 4 && countTermHits(normCand, a) > 0
  );

  if (
    (coreCanonicalWords.length > 0 &&
      matchedCore.length >= Math.ceil(coreCanonicalWords.length * 0.5)) ||
    anchorHit
  ) {
    return { matches: true };
  }

  return {
    matches: false,
    reason: `Title "${cleanCandidate}" does not match selected canonical topic "${canonical.canonicalTitle}" (${canonical.topicId}).`,
  };
}

/**
 * Validates whether a text item (section, MCQ, written question, clinical case)
 * is genuinely about the canonical topic and free of unrelated boilerplate or conflicting diseases.
 */
export function isAssessmentItemAlignedWithTopic(
  itemText: string,
  itemHeading: string | undefined,
  canonical: CanonicalTopicDescriptor
): { aligned: boolean; reason?: string } {
  const hijack = detectConflictingTopicHijack(itemText, itemHeading, canonical);
  if (hijack.hijacked) {
    return {
      aligned: false,
      reason: `Contains content primarily about unrelated topic "${hijack.conflictingLabel}" instead of "${canonical.canonicalTitle}".`,
    };
  }

  // Block cardiopulmonary boilerplate ("acute dyspnea", "SpO2 93%") when topic is NOT cardiopulmonary
  const norm = normalizeLooseText(`${itemHeading || ''} ${itemText}`);
  if (
    canonical.organDomain !== 'cardiovascular' &&
    canonical.organDomain !== 'respiratory' &&
    /\b(sharing acute dyspnea|spo2 room air 93)\b/.test(norm)
  ) {
    return {
      aligned: false,
      reason: `Contains generic cardiopulmonary dyspnea/hypoxemia boilerplate unrelated to "${canonical.canonicalTitle}".`,
    };
  }

  // Must mention at least one canonical topic word or domain/anchor concept
  const titleWords = normalizeLooseText(canonical.canonicalTitle)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP_TOPIC_WORDS.has(w));
  const hasTopicWord = titleWords.some((w) => countTermHits(norm, w) > 0);
  const hasAnchorWord = canonical.anchorTerms.some(
    (a) => a.length >= 3 && countTermHits(norm, a) > 0
  );

  if (!hasTopicWord && !hasAnchorWord) {
    return {
      aligned: false,
      reason: `Item does not reference "${canonical.canonicalTitle}" or any of its domain concepts.`,
    };
  }

  return { aligned: true };
}
