import type {
  AnatomicalCallout,
  AnatomicalDiagramData,
  AnatomicalSystemTemplate,
  ClinicalCaseScenario,
  ClinicalNote,
  ClinicalNoteCategory,
  ComparisonTableData,
  CoverageLevel,
  ExplanationSection,
  FlashcardItem,
  FlowchartData,
  FlowchartKind,
  FlowchartNodeShape,
  MCQItem,
  MedicalTextbook,
  MindMapBranchCategory,
  MindMapData,
  MindMapNode,
  RetrievedPassage,
  SourceBasis,
  StudyGuide,
  TermDefinition,
  TextbookPage,
  TextbookPassage,
} from '../types/medical';
import { inferAnatomicalTemplate } from './visualLayout';
import {
  canonicalizeMedicalTopic,
  detectConflictingTopicHijack,
  doesTitleMatchCanonicalTopic,
  isAssessmentItemAlignedWithTopic,
} from './topicCanonicalizer';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface RetrievalResult {
  coverage: CoverageLevel;
  coverageReason: string;
  passages: RetrievedPassage[];
  retrievedPages: number[];
  totalPagesSearched: number;
  totalPassagesSearched: number;
  matchedCoreTerms: string[];
  missingCoreTerms: string[];
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'about',
  'what',
  'how',
  'when',
  'where',
  'which',
  'versus',
  'vs',
  'or',
  'in',
  'of',
  'to',
  'on',
  'by',
  'at',
  'an',
  'as',
  'is',
  'are',
  'be',
  'between',
  'due',
  'after',
  'before',
  'during',
]);

/**
 * Generic clinical framing words that appear across nearly all textbook chapters.
 * These help rank passages WITHIN pages that already match the core disease/entity,
 * but they can NEVER satisfy the core-topic relevance gate on their own.
 */
const CLINICAL_MODIFIER_WORDS = new Set([
  'acute',
  'chronic',
  'severe',
  'mild',
  'moderate',
  'primary',
  'secondary',
  'management',
  'treatment',
  'therapy',
  'therapeutic',
  'diagnosis',
  'diagnostic',
  'workup',
  'criteria',
  'symptoms',
  'symptom',
  'signs',
  'sign',
  'clinical',
  'presentation',
  'pathophysiology',
  'pathogenesis',
  'etiology',
  'causes',
  'cause',
  'complications',
  'complication',
  'overview',
  'explain',
  'explanation',
  'medical',
  'medicine',
  'topic',
  'syndrome',
  'syndromes',
  'disease',
  'diseases',
  'disorder',
  'disorders',
  'emergency',
  'emergencies',
  'crisis',
  'crises',
  'protocol',
  'protocols',
  'approach',
  'guideline',
  'guidelines',
  'care',
  'patient',
  'patients',
  'review',
  'notes',
  'features',
  'findings',
  'evaluation',
  'assessment',
  'type',
  'stage',
  'staging',
  'adult',
  'adults',
  'pediatric',
  'drug',
  'induced',
]);

/**
 * Organ-system or broad qualifiers. When a query pairs a broad system qualifier
 * with a specific pathology noun (e.g., "Diabetic Retinopathy", "Open-Angle Glaucoma",
 * "Viral Myocarditis"), matching ONLY the qualifier ("diabetic" or "open") without
 * matching the specific pathology noun ("retinopathy" or "glaucoma") must NOT pass.
 */
const SYSTEM_QUALIFIER_WORDS = new Set([
  'diabetic',
  'diabetes',
  'cardiac',
  'heart',
  'coronary',
  'pulmonary',
  'lung',
  'respiratory',
  'renal',
  'kidney',
  'hepatic',
  'liver',
  'cerebral',
  'brain',
  'neurologic',
  'gastrointestinal',
  'gastric',
  'intestinal',
  'bowel',
  'vascular',
  'arterial',
  'venous',
  'blood',
  'bacterial',
  'viral',
  'fungal',
  'infective',
  'infectious',
  'autoimmune',
  'metabolic',
  'ischemic',
  'hemorrhagic',
  'obstructive',
  'inflammatory',
  'upper',
  'lower',
  'open',
  'closed',
  'narrow',
  'angle',
  'status',
  'systemic',
  'community',
  'acquired',
  'spontaneous',
  'iron',
  'vitamin',
  'deficiency',
  'failure',
  'injury',
  'shock',
  'bleeding',
  'hemorrhage',
]);

/**
 * Tight, clinically equivalent medical acronyms and exact terminology expansions.
 * Never include generic high-frequency words here.
 */
const MEDICAL_CONCEPT_EXPANSIONS: Record<string, string[]> = {
  dka: ['dka', 'diabetic ketoacidosis', 'ketoacidosis'],
  ketoacidosis: ['ketoacidosis', 'dka', 'ketoacids', 'beta hydroxybutyrate'],
  hhs: ['hhs', 'hyperosmolar hyperglycemic'],
  acs: ['acs', 'acute coronary', 'stemi', 'nstemi'],
  mi: ['myocardial infarction', 'stemi', 'nstemi'],
  stemi: ['stemi', 'st segment elevation myocardial infarction', 'acute coronary'],
  nstemi: ['nstemi', 'non st segment elevation', 'acute coronary'],
  chf: ['chf', 'heart failure', 'hfref', 'hfpef', 'adhf'],
  hf: ['heart failure', 'hfref', 'hfpef', 'adhf'],
  hfref: ['hfref', 'reduced ejection fraction', 'heart failure'],
  hfpef: ['hfpef', 'preserved ejection fraction', 'heart failure'],
  adhf: ['adhf', 'decompensated heart failure', 'heart failure'],
  afib: ['afib', 'atrial fibrillation'],
  pe: ['pulmonary embolism', 'thromboembolism'],
  vte: ['venous thromboembolism', 'pulmonary embolism', 'deep vein thrombosis'],
  dvt: ['dvt', 'deep vein thrombosis', 'deep veins'],
  copd: ['copd', 'chronic obstructive pulmonary', 'emphysema', 'aecopd'],
  aecopd: ['aecopd', 'exacerbation of copd', 'copd'],
  cap: ['community acquired pneumonia', 'pneumonia'],
  sbp: ['spontaneous bacterial peritonitis', 'neutrophilic ascites'],
  ibd: ['inflammatory bowel', 'ulcerative colitis', 'crohn'],
  uc: ['ulcerative colitis'],
  crohn: ['crohn', 'crohns'],
  aki: ['aki', 'acute kidney injury', 'prerenal azotemia', 'tubular necrosis'],
  atn: ['atn', 'acute tubular necrosis', 'tubular necrosis'],
  ain: ['ain', 'acute interstitial nephritis', 'interstitial nephritis'],
  ida: ['ida', 'iron deficiency anemia'],
  hit: ['heparin induced thrombocytopenia', 'pf4'],
  ttp: ['thrombotic thrombocytopenic purpura', 'adamts13'],
  sle: ['sle', 'systemic lupus erythematosus', 'lupus'],
  lupus: ['lupus', 'systemic lupus erythematosus', 'sle'],
  gbs: ['guillain barre', 'aidp', 'albuminocytologic'],
  aidp: ['aidp', 'guillain barre'],
  htn: ['hypertension', 'hypertensive'],
  b12: ['b12', 'cobalamin', 'megaloblastic'],
  cobalamin: ['cobalamin', 'b12'],
  pud: ['pud', 'peptic ulcer', 'gastric ulcer', 'duodenal ulcer', 'helicobacter pylori'],
  peptic: ['peptic', 'peptic ulcer', 'gastroduodenal', 'gastric ulcer', 'duodenal ulcer'],
  achalasia: ['achalasia', 'lower esophageal sphincter', 'aperistalsis', 'myenteric plexus'],
  gerd: ['gerd', 'gastroesophageal reflux', 'reflux esophagitis', 'barrett esophagus'],
};

interface ConceptGroup {
  canonical: string;
  variants: string[];
  isSpecificPathology: boolean;
}

interface AnalyzedQuery {
  normalizedPhrase: string;
  coreGroups: ConceptGroup[];
  modifierTokens: string[];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildStemVariants(token: string): string[] {
  const variants = new Set<string>([token]);
  const expansions = MEDICAL_CONCEPT_EXPANSIONS[token];
  if (expansions) {
    for (const exp of expansions) {
      variants.add(normalizeForSearch(exp));
    }
  }

  // Conservative medical suffix normalization (minimum 6 chars to prevent over-stemming)
  if (token.length >= 7) {
    if (token.endsWith('emia')) {
      variants.add(`${token.slice(0, -4)}emic`);
    } else if (token.endsWith('emic')) {
      variants.add(`${token.slice(0, -4)}emia`);
    } else if (token.endsWith('itis')) {
      variants.add(`${token.slice(0, -4)}itic`);
    } else if (token.endsWith('osis')) {
      variants.add(`${token.slice(0, -4)}otic`);
    } else if (token.endsWith('otic')) {
      variants.add(`${token.slice(0, -4)}osis`);
    } else if (token.endsWith('ies') && token.length >= 7) {
      variants.add(`${token.slice(0, -3)}y`);
    } else if (token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('is') && !token.endsWith('us')) {
      variants.add(token.slice(0, -1));
    }
  }

  return Array.from(variants).filter(Boolean);
}

export function analyzeMedicalTopicQuery(query: string): AnalyzedQuery {
  const normalizedPhrase = normalizeForSearch(query);
  const rawTokens = normalizedPhrase
    .split(' ')
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));

  const coreTokens: string[] = [];
  const modifierTokens: string[] = [];

  for (const tok of rawTokens) {
    // Keep known medical acronyms (e.g. dka, sle, hit, ttp, copd, aki, sbp, chf, pe) as core
    if (MEDICAL_CONCEPT_EXPANSIONS[tok]) {
      if (!coreTokens.includes(tok)) coreTokens.push(tok);
      continue;
    }
    if (CLINICAL_MODIFIER_WORDS.has(tok)) {
      if (!modifierTokens.includes(tok)) modifierTokens.push(tok);
    } else {
      if (!coreTokens.includes(tok)) coreTokens.push(tok);
    }
  }

  // Fallback if the user typed ONLY modifier words (e.g., "Management Protocol" or "Acute Syndrome")
  const effectiveCoreTokens = coreTokens.length > 0 ? coreTokens : modifierTokens.slice(0, 2);

  const coreGroups: ConceptGroup[] = effectiveCoreTokens.map((tok) => ({
    canonical: tok,
    variants: buildStemVariants(tok),
    isSpecificPathology:
      Boolean(MEDICAL_CONCEPT_EXPANSIONS[tok]) || !SYSTEM_QUALIFIER_WORDS.has(tok),
  }));

  return {
    normalizedPhrase,
    coreGroups,
    modifierTokens,
  };
}

export function tokenizeMedicalQuery(query: string): string[] {
  const analyzed = analyzeMedicalTopicQuery(query);
  const out = new Set<string>();
  for (const group of analyzed.coreGroups) {
    out.add(group.canonical);
    for (const v of group.variants) {
      for (const word of v.split(' ')) {
        if (word.length >= 2 && !STOP_WORDS.has(word)) out.add(word);
      }
    }
  }
  for (const mod of analyzed.modifierTokens) {
    out.add(mod);
  }
  return Array.from(out);
}

function countWholeTermMatches(normalizedHaystack: string, variant: string): number {
  if (!variant || !normalizedHaystack) return 0;
  const pattern = new RegExp(`\\b${escapeRegExp(variant)}\\b`, 'g');
  const matches = normalizedHaystack.match(pattern);
  return matches ? matches.length : 0;
}

const SCANNED_PLACEHOLDER_PREFIX = '(scanned visual content on page';

/**
 * Splits every indexed page of a textbook (pages 1..N with zero page cap)
 * into clean, paragraph-preserving retrieval passages with exact 1-indexed page numbers.
 */
export function chunkPagesIntoPassages(
  pages: TextbookPage[],
  targetChunkChars = 720
): TextbookPassage[] {
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const passages: TextbookPassage[] = [];

  for (const page of sortedPages) {
    const rawText = (page.text || '').trim();
    if (!rawText || rawText.toLowerCase().startsWith(SCANNED_PLACEHOLDER_PREFIX)) {
      continue;
    }

    const paragraphs = rawText
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const expandedUnits: string[] = [];
    for (const para of paragraphs) {
      if (para.length <= targetChunkChars * 1.35) {
        expandedUnits.push(para);
      } else {
        // Split extra-long paragraphs along sentence boundaries
        const sentences = para.split(/(?<=[.?!])\s+/);
        let buf = '';
        for (const sent of sentences) {
          if (buf && buf.length + sent.length + 1 > targetChunkChars) {
            expandedUnits.push(buf.trim());
            buf = sent;
          } else {
            buf = buf ? `${buf} ${sent}` : sent;
          }
        }
        if (buf.trim()) expandedUnits.push(buf.trim());
      }
    }

    let currentChunk = '';
    let chunkIdx = 1;

    for (const unit of expandedUnits) {
      if (
        currentChunk &&
        currentChunk.length + unit.length + 2 > targetChunkChars &&
        currentChunk.length >= 200
      ) {
        passages.push({
          passageId: `p${page.pageNumber}-c${chunkIdx}`,
          pageNumber: page.pageNumber,
          chapterTitle: page.chapterTitle,
          text: currentChunk.trim(),
        });
        chunkIdx += 1;
        currentChunk = unit;
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n\n${unit}` : unit;
      }
    }

    if (currentChunk.trim()) {
      passages.push({
        passageId: `p${page.pageNumber}-c${chunkIdx}`,
        pageNumber: page.pageNumber,
        chapterTitle: page.chapterTitle,
        text: currentChunk.trim(),
      });
    }
  }

  return passages;
}

/**
 * Retrieves the highest-scoring, topic-verified textbook passages across ALL pages
 * of the textbook using BM25 + phrase/heading boosts and a strict Core-Concept Gate.
 * Never returns unrelated fallback pages when the textbook lacks relevant text.
 */
export function retrieveRelevantPassages(
  pages: TextbookPage[],
  topic: string,
  maxPassages = 10
): RetrievalResult {
  const totalPagesSearched = pages.length;
  const passages = chunkPagesIntoPassages(pages);
  const totalPassagesSearched = passages.length;

  if (totalPagesSearched === 0 || totalPassagesSearched === 0) {
    return {
      coverage: 'none',
      coverageReason: 'No searchable text passages were found in the selected PDF.',
      passages: [],
      retrievedPages: [],
      totalPagesSearched,
      totalPassagesSearched,
      matchedCoreTerms: [],
      missingCoreTerms: [],
    };
  }

  const analyzed = analyzeMedicalTopicQuery(topic);
  const { normalizedPhrase, coreGroups, modifierTokens } = analyzed;

  if (coreGroups.length === 0) {
    return {
      coverage: 'none',
      coverageReason: 'No specific medical concept terms could be identified in the query.',
      passages: [],
      retrievedPages: [],
      totalPagesSearched,
      totalPassagesSearched,
      matchedCoreTerms: [],
      missingCoreTerms: [],
    };
  }

  const preparedDocs = passages.map((passage) => {
    const normTitle = normalizeForSearch(passage.chapterTitle || '');
    const normBody = normalizeForSearch(passage.text);
    const normFull = `${normTitle} ${normBody}`.trim();
    const wordCount = Math.max(1, normFull.split(' ').length);
    return {
      passage,
      normTitle,
      normBody,
      normFull,
      wordCount,
    };
  });

  // Also build page-level normalized text so a core concept mentioned in the chapter/page
  // context allows adjacent paragraphs on that same page to be scored accurately.
  const pageNormMap = new Map<number, string>();
  for (const pg of pages) {
    pageNormMap.set(
      pg.pageNumber,
      normalizeForSearch(`${pg.chapterTitle || ''} ${pg.text || ''}`)
    );
  }

  const avgDocLen =
    preparedDocs.reduce((acc, d) => acc + d.wordCount, 0) / Math.max(1, preparedDocs.length);

  // Compute IDF for each core concept group across passages
  const groupIdf = coreGroups.map((group) => {
    let df = 0;
    for (const doc of preparedDocs) {
      const hit = group.variants.some((v) => countWholeTermMatches(doc.normFull, v) > 0);
      if (hit) df += 1;
    }
    return Math.log(1 + (preparedDocs.length - df + 0.5) / (df + 0.5));
  });

  const specificGroups = coreGroups.filter((g) => g.isSpecificPathology);
  const k1 = 1.4;
  const b = 0.75;

  const scoredCandidates: Array<{
    passage: TextbookPassage;
    score: number;
    matchedTerms: string[];
    matchedCoreCanonicals: Set<string>;
    matchedSpecificCount: number;
  }> = [];

  for (const doc of preparedDocs) {
    const pageNorm = pageNormMap.get(doc.passage.pageNumber) || doc.normFull;

    let passageDirectCoreHits = 0;
    let pageContextCoreHits = 0;
    let passageSpecificHits = 0;
    let pageSpecificHits = 0;
    const matchedTerms = new Set<string>();
    const matchedCoreCanonicals = new Set<string>();
    let bm25Score = 0;

    coreGroups.forEach((group, idx) => {
      let passageHits = 0;
      let titleHits = 0;
      let pageHits = 0;

      for (const variant of group.variants) {
        const bodyCount = countWholeTermMatches(doc.normBody, variant);
        const tCount = countWholeTermMatches(doc.normTitle, variant);
        const pCount = countWholeTermMatches(pageNorm, variant);
        if (bodyCount + tCount > 0) {
          passageHits += bodyCount + tCount * 2;
          titleHits += tCount;
          matchedTerms.add(variant);
        }
        if (pCount > 0) {
          pageHits += pCount;
        }
      }

      if (passageHits > 0) {
        passageDirectCoreHits += 1;
        matchedCoreCanonicals.add(group.canonical);
        if (group.isSpecificPathology) passageSpecificHits += 1;

        const idf = Math.max(0.65, groupIdf[idx]);
        const normTf =
          (passageHits * (k1 + 1)) /
          (passageHits + k1 * (1 - b + b * (doc.wordCount / avgDocLen)));
        bm25Score += idf * normTf * 5.0;
        if (titleHits > 0) {
          bm25Score += 8.0;
        }
      } else if (pageHits > 0) {
        pageContextCoreHits += 1;
        matchedCoreCanonicals.add(group.canonical);
        if (group.isSpecificPathology) pageSpecificHits += 1;
        bm25Score += Math.max(0.5, groupIdf[idx]) * 1.8;
      }
    });

    // HARD RELEVANCE GATE 1: Must directly match at least one core concept in the passage itself
    if (passageDirectCoreHits === 0) {
      continue;
    }

    // HARD RELEVANCE GATE 2: If query contains specific pathology nouns (e.g., "retinopathy" in
    // "Diabetic Retinopathy" or "glaucoma" in "Open-Angle Glaucoma"), at least one specific
    // pathology noun MUST match on the passage/page — never match solely on "diabetic" or "open"!
    const totalSpecificMatched = passageSpecificHits + pageSpecificHits;
    if (specificGroups.length > 0 && totalSpecificMatched === 0) {
      continue;
    }

    // HARD RELEVANCE GATE 3: For multi-concept queries (2+ core concepts), require majority
    // core concept coverage (>= 60%) unless a multi-word expanded variant matched directly.
    const totalCoreMatched = passageDirectCoreHits + pageContextCoreHits;
    const coreMatchRatio = totalCoreMatched / coreGroups.length;
    const hasMultiWordVariantHit = Array.from(matchedTerms).some((t) => t.includes(' '));

    if (coreGroups.length >= 2 && coreMatchRatio < 0.55 && !hasMultiWordVariantHit) {
      continue;
    }

    // HARD RELEVANCE GATE 4: Reject passages whose chapter heading or body is dominated by a
    // DIFFERENT conflicting disease (e.g., an Achalasia or Variceal Hemorrhage chapter that casually
    // mentions "ulcer" when the requested topic is Peptic Ulcer Disease).
    const canonicalQuery = canonicalizeMedicalTopic(topic);
    const hijackCheck = detectConflictingTopicHijack(
      doc.passage.text,
      doc.passage.chapterTitle,
      canonicalQuery
    );
    if (hijackCheck.hijacked) {
      continue;
    }

    // Exact full-phrase match bonus
    if (normalizedPhrase.length >= 4) {
      if (countWholeTermMatches(doc.normBody, normalizedPhrase) > 0) {
        bm25Score += 18;
      }
      if (countWholeTermMatches(doc.normTitle, normalizedPhrase) > 0) {
        bm25Score += 14;
      }
    }

    // Secondary boost for clinical modifiers ONLY after core gates pass
    for (const mod of modifierTokens) {
      const mHits = countWholeTermMatches(doc.normFull, mod);
      if (mHits > 0) {
        bm25Score += Math.min(3.5, 1.2 * mHits);
        matchedTerms.add(mod);
      }
    }

    scoredCandidates.push({
      passage: doc.passage,
      score: Number(bm25Score.toFixed(2)),
      matchedTerms: Array.from(matchedTerms),
      matchedCoreCanonicals,
      matchedSpecificCount: totalSpecificMatched,
    });
  }

  if (scoredCandidates.length === 0) {
    const missing = coreGroups.map((g) => g.canonical);
    return {
      coverage: 'none',
      coverageReason: `Searched all ${totalPagesSearched} indexed pages (${totalPassagesSearched} passages) and found no textbook passages matching "${topic.trim()}".`,
      passages: [],
      retrievedPages: [],
      totalPagesSearched,
      totalPassagesSearched,
      matchedCoreTerms: [],
      missingCoreTerms: missing,
    };
  }

  scoredCandidates.sort(
    (a, b) => b.score - a.score || a.passage.pageNumber - b.passage.pageNumber
  );

  const topScore = scoredCandidates[0].score;
  // Filter out noisy low-scoring tail matches (< 30% of top passage score)
  const minThreshold = Math.max(4.0, topScore * 0.3);
  const filtered = scoredCandidates
    .filter((c) => c.score >= minThreshold)
    .slice(0, maxPassages);

  const unionMatchedCore = new Set<string>();
  for (const item of filtered) {
    item.matchedCoreCanonicals.forEach((c) => unionMatchedCore.add(c));
  }

  const matchedCoreTerms = coreGroups
    .filter((g) => unionMatchedCore.has(g.canonical))
    .map((g) => g.canonical);
  const missingCoreTerms = coreGroups
    .filter((g) => !unionMatchedCore.has(g.canonical))
    .map((g) => g.canonical);

  const retrievedPages = Array.from(
    new Set(filtered.map((item) => item.passage.pageNumber))
  ).sort((a, b) => a - b);

  const allSpecificCovered =
    specificGroups.length === 0 ||
    specificGroups.every((g) => unionMatchedCore.has(g.canonical));
  const coverage: CoverageLevel =
    missingCoreTerms.length === 0 && allSpecificCovered && topScore >= 8
      ? 'strong'
      : 'partial';

  const pageLabel = buildPageCitationLabel(retrievedPages);
  const coverageReason =
    coverage === 'strong'
      ? `Retrieved ${filtered.length} relevant ${
          filtered.length === 1 ? 'passage' : 'passages'
        } from ${pageLabel} (searched all ${totalPagesSearched} indexed pages).`
      : `Partial textbook match on ${pageLabel} (searched all ${totalPagesSearched} pages; missing direct coverage for: ${
          missingCoreTerms.join(', ') || 'sub-details'
        }).`;

  return {
    coverage,
    coverageReason,
    passages: filtered.map((c) => ({
      ...c.passage,
      score: c.score,
      matchedTerms: c.matchedTerms,
    })),
    retrievedPages,
    totalPagesSearched,
    totalPassagesSearched,
    matchedCoreTerms,
    missingCoreTerms,
  };
}

/**
 * Legacy helper kept for page-level callers: returns ONLY genuinely matching pages
 * (never returns unrelated pages when retrieval finds zero matches).
 */
export function rankTextbookPages(
  pages: TextbookPage[],
  topic: string,
  maxPages = 12
): TextbookPage[] {
  const retrieval = retrieveRelevantPassages(pages, topic, maxPages * 2);
  if (retrieval.retrievedPages.length === 0) return [];
  const allowed = new Set(retrieval.retrievedPages.slice(0, maxPages));
  return pages
    .filter((p) => allowed.has(p.pageNumber))
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

export function buildPageCitationLabel(pageNumbers: number[]): string {
  const unique = Array.from(
    new Set(pageNumbers.filter((n) => Number.isInteger(n) && n > 0))
  ).sort((a, b) => a - b);

  if (unique.length === 0) return 'No textbook pages cited';
  if (unique.length === 1) return `p. ${unique[0]}`;

  const ranges: string[] = [];
  let start = unique[0];
  let prev = unique[0];

  for (let i = 1; i < unique.length; i++) {
    const curr = unique[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}–${prev}`);

  return `pp. ${ranges.join(', ')}`;
}

export interface QuizStats {
  answeredCount: number;
  totalCount: number;
  correctCount: number;
  accuracyPercent: number;
  isComplete: boolean;
}

export function calculateQuizStats(
  mcqs: MCQItem[],
  answers: Record<string, number>
): QuizStats {
  const totalCount = mcqs.length;
  let answeredCount = 0;
  let correctCount = 0;

  for (const item of mcqs) {
    const selected = answers[item.id];
    if (typeof selected === 'number' && selected >= 0 && selected < item.options.length) {
      answeredCount += 1;
      if (selected === item.correctIndex) {
        correctCount += 1;
      }
    }
  }

  const accuracyPercent =
    answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  return {
    answeredCount,
    totalCount,
    correctCount,
    accuracyPercent,
    isComplete: totalCount > 0 && answeredCount === totalCount,
  };
}

const VALID_CATEGORIES = new Set<ClinicalNoteCategory>([
  'Red Flag',
  'Clinical Pearl',
  'Diagnostic Pitfall',
  'Management Protocol',
]);

function filterVerifiedPages(rawPages: unknown, allowedPages: Set<number>): number[] {
  if (!Array.isArray(rawPages) || allowedPages.size === 0) return [];
  return Array.from(
    new Set(
      rawPages
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && allowedPages.has(n))
    )
  ).sort((a, b) => a - b);
}

function cleanSupportingQuote(
  rawQuote: unknown,
  verifiedPages: number[],
  retrievedPassages: RetrievedPassage[]
): string | undefined {
  if (typeof rawQuote !== 'string' || verifiedPages.length === 0) return undefined;
  const trimmed = rawQuote.trim().replace(/^["“”']+|["“”']+$/g, '').trim();
  if (trimmed.length < 12) return undefined;

  // Verify at least significant lexical overlap with the retrieved passages on those pages
  const pagePassages = retrievedPassages.filter((p) => verifiedPages.includes(p.pageNumber));
  if (pagePassages.length === 0) return trimmed.slice(0, 260);

  const combinedNorm = normalizeForSearch(pagePassages.map((p) => p.text).join(' '));
  const quoteWords = normalizeForSearch(trimmed)
    .split(' ')
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  if (quoteWords.length === 0) return undefined;
  const hits = quoteWords.filter((w) => combinedNorm.includes(w)).length;
  if (hits / quoteWords.length < 0.5) {
    return undefined;
  }
  return trimmed.slice(0, 280);
}

/**
 * Deterministic citation & source-basis sanitizer:
 * 1. Never invents fallback page numbers (e.g., [1]).
 * 2. Strips any cited page number that was NOT actually in the retrieved passages.
 * 3. Forces sourceBasis = 'general_medical_knowledge' and pageNumbers = [] whenever
 *    an item lacks verified retrieved page backing or when textbook coverage is 'none'.
 */
const VALID_MINDMAP_CATEGORIES = new Set<MindMapBranchCategory>([
  'physiology',
  'pathophysiology',
  'clinical',
  'diagnosis',
  'management',
  'complications',
]);

const VALID_FLOW_TYPES = new Set<FlowchartKind>([
  'pathophysiology',
  'diagnosis',
  'management',
]);

const VALID_FLOW_SHAPES = new Set<FlowchartNodeShape>([
  'start',
  'process',
  'decision',
  'action',
  'alert',
]);

const VALID_ANATOMY_TEMPLATES = new Set<AnatomicalSystemTemplate>([
  'cardiopulmonary',
  'renal',
  'respiratory',
  'hepatobiliary',
  'endocrine',
  'neurology',
  'hematology',
  'immune',
  'general_physiology',
]);

const DEFAULT_CALLOUT_COORDS: Array<[number, number]> = [
  [50, 26],
  [30, 48],
  [70, 48],
  [48, 72],
  [74, 74],
];

export function buildFallbackMindMapFromSections(
  topic: string,
  sections: ExplanationSection[],
  clinicalNotes: ClinicalNote[]
): MindMapData {
  const categoryCycle: MindMapBranchCategory[] = [
    'physiology',
    'pathophysiology',
    'clinical',
    'diagnosis',
    'management',
    'complications',
  ];
  const relationCycle = [
    'normal baseline',
    'driven by',
    'presents with',
    'confirmed via',
    'treated with',
    'watch for',
  ];

  const nodes: MindMapNode[] = sections.slice(0, 6).map((sec, idx) => ({
    id: `mm-sec-${idx + 1}`,
    label: sec.heading.replace(/^(Step\s*)?0?\d+[.:)\s-]+/i, '').slice(0, 48),
    category: categoryCycle[idx % categoryCycle.length],
    relationLabel: relationCycle[idx % relationCycle.length],
    summary: sec.keyTakeaway || sec.content.slice(0, 140),
    sourceBasis: sec.sourceBasis,
    pageNumbers: sec.sourceBasis === 'textbook' ? sec.pageNumbers : [],
  }));

  clinicalNotes.slice(0, 2).forEach((note, nIdx) => {
    const parentId = nodes[nodes.length - 1]?.id;
    nodes.push({
      id: `mm-note-${nIdx + 1}`,
      label: note.title.slice(0, 44),
      category: note.category === 'Red Flag' ? 'complications' : 'management',
      relationLabel: note.category === 'Red Flag' ? 'red flag' : 'key pearl',
      parentId,
      summary: note.detail.slice(0, 140),
      sourceBasis: note.sourceBasis,
      pageNumbers: note.sourceBasis === 'textbook' ? note.pageNumbers : [],
    });
  });

  return {
    centralTopic: topic,
    centralSubtitle: 'Concept & Revision Map',
    nodes,
  };
}

export function buildFallbackFlowchartsFromSections(
  topic: string,
  sections: ExplanationSection[]
): FlowchartData[] {
  if (sections.length === 0) return [];
  const hasTextbook = sections.some((s) => s.sourceBasis === 'textbook' && s.pageNumbers.length > 0);
  const allPages = Array.from(
    new Set(
      sections.flatMap((s) => (s.sourceBasis === 'textbook' ? s.pageNumbers : []))
    )
  ).sort((a, b) => a - b);

  const nodes = sections.slice(0, 5).map((sec, idx) => ({
    id: `fn-${idx + 1}`,
    label: sec.heading.replace(/^(Step\s*)?0?\d+[.:)\s-]+/i, '').slice(0, 46),
    detail: sec.keyTakeaway,
    nodeType: (idx === 0
      ? 'start'
      : idx === sections.length - 1
        ? 'action'
        : 'process') as FlowchartNodeShape,
  }));

  const edges = nodes.slice(0, -1).map((n, idx) => ({
    from: n.id,
    to: nodes[idx + 1].id,
    label: `Step ${idx + 1} → ${idx + 2}`,
  }));

  return [
    {
      id: 'flow-clinical-progression',
      title: `${topic}: Clinical Progression & Decision Flow`,
      flowType: 'management',
      nodes,
      edges,
      sourceBasis: hasTextbook ? 'textbook' : 'general_medical_knowledge',
      pageNumbers: hasTextbook ? allPages : [],
    },
  ];
}

export function buildFallbackAnatomicalDiagram(
  topic: string,
  sections: ExplanationSection[]
): AnatomicalDiagramData {
  const canonical = canonicalizeMedicalTopic(topic);
  const template = canonical.systemTemplate || inferAnatomicalTemplate(topic);
  const landmarks = canonical.domainProfile.defaultLandmarks;

  const callouts: AnatomicalCallout[] = landmarks.slice(0, 4).map((lm, idx) => {
    const matchedSec = sections[idx % Math.max(1, sections.length)];
    const hasBookBacking =
      matchedSec?.sourceBasis === 'textbook' && matchedSec.pageNumbers.length > 0;
    return {
      id: `anat-${idx + 1}`,
      number: idx + 1,
      structureName: lm.label.slice(0, 52),
      xPercent: lm.xPct,
      yPercent: lm.yPct,
      normalRole: lm.detail,
      pathologicalChange:
        matchedSec?.keyTakeaway ||
        canonical.domainProfile.pathophysiologySummaryTemplate(canonical.canonicalTitle),
      sourceBasis: hasBookBacking ? 'textbook' : 'general_medical_knowledge',
      pageNumbers: hasBookBacking && matchedSec ? matchedSec.pageNumbers : [],
    };
  });

  return {
    title: `${canonical.canonicalTitle} — ${canonical.domainProfile.anatomicalRegionLabel}`,
    systemTemplate: template,
    normalPhysiologySummary: canonical.domainProfile.normalBaselineSummary,
    pathophysiologySummary: canonical.domainProfile.pathophysiologySummaryTemplate(
      canonical.canonicalTitle
    ),
    callouts,
  };
}

export function buildFallbackFlashcards(
  topic: string,
  sections: ExplanationSection[],
  clinicalNotes: ClinicalNote[]
): FlashcardItem[] {
  const cards: FlashcardItem[] = [];
  sections.slice(0, 4).forEach((sec, idx) => {
    const cleanTitle = sec.heading.replace(/^(Step\s*)?0?\d+[.:)\s-]+/i, '');
    cards.push({
      id: `fc-sec-${idx + 1}`,
      front: `What is the high-yield takeaway regarding ${cleanTitle} in ${topic}?`,
      back: sec.keyTakeaway,
      backArabic: sec.keyTakeawayArabic,
      category: cleanTitle.slice(0, 32),
      sourceBasis: sec.sourceBasis,
      pageNumbers: sec.sourceBasis === 'textbook' ? sec.pageNumbers : [],
    });
  });

  clinicalNotes.slice(0, 2).forEach((note, idx) => {
    cards.push({
      id: `fc-note-${idx + 1}`,
      front: `${note.category}: ${note.title}`,
      back: note.detail,
      backArabic: note.detailArabic,
      category: note.category,
      sourceBasis: note.sourceBasis,
      pageNumbers: note.sourceBasis === 'textbook' ? note.pageNumbers : [],
    });
  });

  return cards;
}

/**
 * Deterministic citation & source-basis sanitizer:
 * 1. Never invents fallback page numbers (e.g., [1]).
 * 2. Strips any cited page number that was NOT actually in the retrieved passages.
 * 3. Forces sourceBasis = 'general_medical_knowledge' and pageNumbers = [] whenever
 *    an item lacks verified retrieved page backing or when textbook coverage is 'none'.
 */
export function sanitizeStudyGuideResponse(
  raw: Record<string, unknown>,
  textbook: Pick<MedicalTextbook, 'id' | 'title' | 'pageCount'>,
  requestedTopic: string,
  retrieval: RetrievalResult,
  options?: { allowScannedPdfPages?: boolean }
): Omit<StudyGuide, 'id' | 'createdAt' | 'updatedAt' | 'answers'> {
  const allowScanned = Boolean(options?.allowScannedPdfPages);
  const maxPage = Math.max(1, textbook.pageCount);

  const allowedPages = new Set<number>();
  if (allowScanned) {
    for (let i = 1; i <= maxPage; i++) allowedPages.add(i);
  } else {
    for (const pg of retrieval.retrievedPages) {
      if (pg >= 1 && pg <= maxPage) allowedPages.add(pg);
    }
  }

  const rawCoverage = String(raw.coverage || '');
  let coverage: CoverageLevel = retrieval.coverage;
  if (allowScanned) {
    if (rawCoverage === 'strong' || rawCoverage === 'partial' || rawCoverage === 'none') {
      coverage = rawCoverage;
    }
  } else if (retrieval.coverage === 'none') {
    coverage = 'none';
  } else if (rawCoverage === 'none') {
    coverage = 'none';
    allowedPages.clear();
  } else if (rawCoverage === 'partial' && retrieval.coverage === 'strong') {
    coverage = 'partial';
  }

  const canonical = canonicalizeMedicalTopic(requestedTopic);
  const candidateRawTopic =
    typeof raw.topic === 'string' && raw.topic.trim().length > 0
      ? raw.topic.trim().slice(0, 180)
      : '';
  const topicMatch = candidateRawTopic
    ? doesTitleMatchCanonicalTopic(candidateRawTopic, canonical)
    : { matches: false };

  // SINGLE CANONICAL TOPIC LOCK: Never let an uploaded unrelated PDF (e.g. Achalasia) overwrite
  // the user's selected medical topic (e.g. Peptic Ulcer Disease).
  const topic = topicMatch.matches ? candidateRawTopic : canonical.canonicalTitle;

  // If allowScanned was used on an unrelated scanned PDF whose returned summary/topic hijacks
  // into a conflicting disease, revoke scanned page attribution immediately!
  if (
    allowScanned &&
    ((candidateRawTopic && !topicMatch.matches) ||
      detectConflictingTopicHijack(String(raw.summary || ''), candidateRawTopic, canonical).hijacked)
  ) {
    coverage = 'none';
    allowedPages.clear();
  }

  const resolveItemGrounding = (
    rawBasis: unknown,
    rawPageNums: unknown,
    rawQuote?: unknown
  ): {
    sourceBasis: SourceBasis;
    pageNumbers: number[];
    supportingQuote?: string;
  } => {
    if (coverage === 'none') {
      return {
        sourceBasis: 'general_medical_knowledge',
        pageNumbers: [],
      };
    }

    const explicitlyGeneral = rawBasis === 'general_medical_knowledge';
    if (explicitlyGeneral) {
      return {
        sourceBasis: 'general_medical_knowledge',
        pageNumbers: [],
      };
    }

    const verifiedPages = filterVerifiedPages(rawPageNums, allowedPages);
    if (verifiedPages.length === 0) {
      // Cannot claim textbook support without a verified retrieved page!
      return {
        sourceBasis: 'general_medical_knowledge',
        pageNumbers: [],
      };
    }

    const supportingQuote = cleanSupportingQuote(
      rawQuote,
      verifiedPages,
      retrieval.passages
    );

    return {
      sourceBasis: 'textbook',
      pageNumbers: verifiedPages,
      supportingQuote,
    };
  };

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const sections: ExplanationSection[] = rawSections
    .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
    .map((sec, idx) => {
      const grounding = resolveItemGrounding(
        sec.sourceBasis,
        sec.pageNumbers,
        sec.supportingQuote
      );

      const rawTerms = Array.isArray(sec.termDefinitions) ? sec.termDefinitions : [];
      const termDefinitions: TermDefinition[] = rawTerms
        .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
        .map((t) => ({
          term: String(t.term || '').trim(),
          simpleExplanation: String(t.simpleExplanation || '').trim(),
          arabicExplanation:
            typeof t.arabicExplanation === 'string' && t.arabicExplanation.trim()
              ? t.arabicExplanation.trim()
              : undefined,
        }))
        .filter((t) => t.term.length > 0 && t.simpleExplanation.length > 0)
        .slice(0, 5);

      const quickSummaryPoints = Array.isArray(sec.quickSummaryPoints)
        ? sec.quickSummaryPoints
            .map((pt) => String(pt || '').trim())
            .filter(Boolean)
            .slice(0, 4)
        : undefined;

      return {
        stepNumber: idx + 1,
        stepPhase:
          typeof sec.stepPhase === 'string' && sec.stepPhase.trim()
            ? sec.stepPhase.trim()
            : undefined,
        heading:
          typeof sec.heading === 'string' && sec.heading.trim()
            ? sec.heading.trim()
            : `0${idx + 1}. Learning Step ${idx + 1}`,
        content:
          typeof sec.content === 'string' && sec.content.trim()
            ? sec.content.trim()
            : 'No additional details returned.',
        contentArabic:
          typeof sec.contentArabic === 'string' && sec.contentArabic.trim()
            ? sec.contentArabic.trim()
            : undefined,
        quickSummaryPoints,
        termDefinitions: termDefinitions.length > 0 ? termDefinitions : undefined,
        pageNumbers: grounding.pageNumbers,
        sourceBasis: grounding.sourceBasis,
        supportingQuote: grounding.supportingQuote,
        keyTakeaway:
          typeof sec.keyTakeaway === 'string' && sec.keyTakeaway.trim()
            ? sec.keyTakeaway.trim()
            : 'Verify clinical decisions against primary reference material.',
        keyTakeawayArabic:
          typeof sec.keyTakeawayArabic === 'string' && sec.keyTakeawayArabic.trim()
            ? sec.keyTakeawayArabic.trim()
            : undefined,
      };
    });

  const rawNotes = Array.isArray(raw.clinicalNotes) ? raw.clinicalNotes : [];
  const clinicalNotes: ClinicalNote[] = rawNotes
    .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
    .map((note, idx) => {
      const cat = String(note.category ?? '') as ClinicalNoteCategory;
      const grounding = resolveItemGrounding(
        note.sourceBasis,
        note.pageNumbers,
        note.supportingQuote
      );
      return {
        title:
          typeof note.title === 'string' && note.title.trim()
            ? note.title.trim()
            : `Clinical Note ${idx + 1}`,
        category: VALID_CATEGORIES.has(cat) ? cat : 'Clinical Pearl',
        detail:
          typeof note.detail === 'string' && note.detail.trim()
            ? note.detail.trim()
            : 'Correlate findings with clinical presentation.',
        detailArabic:
          typeof note.detailArabic === 'string' && note.detailArabic.trim()
            ? note.detailArabic.trim()
            : undefined,
        pageNumbers: grounding.pageNumbers,
        sourceBasis: grounding.sourceBasis,
        supportingQuote: grounding.supportingQuote,
      };
    });

  const rawMcqs = Array.isArray(raw.mcqs) ? raw.mcqs : [];
  const mcqs: MCQItem[] = rawMcqs
    .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
    .map((mcq, idx) => {
      const opts = Array.isArray(mcq.options)
        ? mcq.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 5)
        : [];
      while (opts.length < 4) {
        opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
      }
      const rawCorrect = Number(mcq.correctIndex);
      const correctIndex =
        Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < opts.length
          ? rawCorrect
          : 0;

      const grounding = resolveItemGrounding(mcq.sourceBasis, mcq.pageNumbers);

      return {
        id: `mcq-${idx + 1}`,
        question:
          typeof mcq.question === 'string' && mcq.question.trim()
            ? mcq.question.trim()
            : `Question ${idx + 1} regarding ${topic}`,
        options: opts,
        correctIndex,
        explanation:
          typeof mcq.explanation === 'string' && mcq.explanation.trim()
            ? mcq.explanation.trim()
            : 'Review clinical reasoning for the correct option.',
        explanationArabic:
          typeof mcq.explanationArabic === 'string' && mcq.explanationArabic.trim()
            ? mcq.explanationArabic.trim()
            : undefined,
        pageNumbers: grounding.pageNumbers,
        sourceBasis: grounding.sourceBasis,
      };
    })
    .filter((m) => isAssessmentItemAlignedWithTopic(`${m.question} ${m.explanation}`, undefined, canonical).aligned);

  // Filter out any section or clinical note hijacked by a conflicting disease
  const cleanSections = sections
    .filter((s) => !detectConflictingTopicHijack(`${s.content} ${s.keyTakeaway}`, s.heading, canonical).hijacked)
    .map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
  sections.splice(0, sections.length, ...cleanSections);

  const cleanNotes = clinicalNotes.filter(
    (n) => !detectConflictingTopicHijack(n.detail, n.title, canonical).hijacked
  );
  clinicalNotes.splice(0, clinicalNotes.length, ...cleanNotes);

  // Guarantee structured topic-aligned fallback sections if LLM output was empty or hijacked by an unrelated scanned PDF
  if (sections.length === 0) {
    sections.push(
      {
        stepNumber: 1,
        stepPhase: 'Anatomical & Physiological Baseline',
        heading: `01. Baseline Physiology & Mucosal/Organ Defense in ${topic}`,
        content: canonical.domainProfile.normalBaselineSummary,
        quickSummaryPoints: [canonical.domainProfile.normalBaselineSummary],
        pageNumbers: [],
        sourceBasis: 'general_medical_knowledge',
        keyTakeaway: canonical.domainProfile.normalBaselineSummary,
      },
      {
        stepNumber: 2,
        stepPhase: 'Pathophysiology & Mechanism',
        heading: `02. Pathophysiological Cascade of ${topic}`,
        content: canonical.domainProfile.pathophysiologySummaryTemplate(topic),
        quickSummaryPoints: [canonical.domainProfile.pathophysiologySummaryTemplate(topic)],
        pageNumbers: [],
        sourceBasis: 'general_medical_knowledge',
        keyTakeaway: canonical.domainProfile.pathophysiologySummaryTemplate(topic),
      },
      {
        stepNumber: 3,
        stepPhase: 'Diagnostics & Differential Diagnosis',
        heading: `03. Diagnostic Work-Up & Differential Diagnosis of ${topic}`,
        content: `${canonical.domainProfile.diagnosticGoldStandardTemplate(topic)} ${canonical.domainProfile.differentialSummaryTemplate(topic)}`,
        quickSummaryPoints: [
          canonical.domainProfile.diagnosticGoldStandardTemplate(topic),
          canonical.domainProfile.differentialSummaryTemplate(topic),
        ],
        pageNumbers: [],
        sourceBasis: 'general_medical_knowledge',
        keyTakeaway: canonical.domainProfile.diagnosticGoldStandardTemplate(topic),
      },
      {
        stepNumber: 4,
        stepPhase: 'Pharmacology & Clinical Management',
        heading: `04. Evidence-Based Management & Pharmacotherapy of ${topic}`,
        content: canonical.domainProfile
          .firstLineDrugRowsTemplate(topic)
          .map((d) => `${d.drugClass} (${d.prototypeAgents}): ${d.mechanismOfAction} ${d.clinicalIndications}`)
          .join(' '),
        quickSummaryPoints: canonical.domainProfile
          .firstLineDrugRowsTemplate(topic)
          .map((d) => `${d.drugClass}: ${d.prototypeAgents} — ${d.clinicalIndications}`)
          .slice(0, 4),
        pageNumbers: [],
        sourceBasis: 'general_medical_knowledge',
        keyTakeaway:
          canonical.domainProfile.firstLineDrugRowsTemplate(topic)[0]?.clinicalIndications ||
          `Pair physiological stabilization with targeted therapy for ${topic}.`,
      }
    );
  }

  // Sanitize Mind Map
  let mindMap: MindMapData | undefined;
  if (raw.mindMap && typeof raw.mindMap === 'object') {
    const mmRaw = raw.mindMap as Record<string, unknown>;
    const rawMmNodes = Array.isArray(mmRaw.nodes) ? mmRaw.nodes : [];
    const sanitizedNodes: MindMapNode[] = rawMmNodes
      .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
      .map((n, idx) => {
        const cat = String(n.category || '') as MindMapBranchCategory;
        const grounding = resolveItemGrounding(n.sourceBasis, n.pageNumbers);
        return {
          id: String(n.id || `mm-${idx + 1}`).trim(),
          label: String(n.label || `Concept ${idx + 1}`).trim().slice(0, 54),
          category: VALID_MINDMAP_CATEGORIES.has(cat) ? cat : 'clinical',
          relationLabel: String(n.relationLabel || 'relates to').trim().slice(0, 28),
          parentId:
            typeof n.parentId === 'string' && n.parentId.trim()
              ? n.parentId.trim()
              : undefined,
          summary: String(n.summary || '').trim().slice(0, 240),
          sourceBasis: grounding.sourceBasis,
          pageNumbers: grounding.pageNumbers,
        };
      })
      .filter((n) => n.label.length > 0);

    if (sanitizedNodes.length >= 3) {
      mindMap = {
        centralTopic:
          typeof mmRaw.centralTopic === 'string' && mmRaw.centralTopic.trim()
            ? mmRaw.centralTopic.trim().slice(0, 60)
            : topic,
        centralSubtitle:
          typeof mmRaw.centralSubtitle === 'string' && mmRaw.centralSubtitle.trim()
            ? mmRaw.centralSubtitle.trim().slice(0, 60)
            : 'Interactive Concept & Revision Map',
        nodes: sanitizedNodes,
      };
    }
  }
  if (!mindMap && sections.length > 0) {
    mindMap = buildFallbackMindMapFromSections(topic, sections, clinicalNotes);
  }

  // Sanitize Flowcharts
  const rawFlows = Array.isArray(raw.flowcharts) ? raw.flowcharts : [];
  let flowcharts: FlowchartData[] = rawFlows
    .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
    .map((f, fIdx) => {
      const ft = String(f.flowType || '') as FlowchartKind;
      const grounding = resolveItemGrounding(f.sourceBasis, f.pageNumbers);
      const fNodesRaw = Array.isArray(f.nodes) ? f.nodes : [];
      const fNodes = fNodesRaw
        .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
        .map((n, nIdx) => {
          const shape = String(n.nodeType || '') as FlowchartNodeShape;
          return {
            id: String(n.id || `n${nIdx + 1}`).trim(),
            label: String(n.label || `Step ${nIdx + 1}`).trim().slice(0, 60),
            detail:
              typeof n.detail === 'string' && n.detail.trim()
                ? n.detail.trim().slice(0, 200)
                : undefined,
            nodeType: VALID_FLOW_SHAPES.has(shape) ? shape : 'process',
          };
        })
        .filter((n) => n.label.length > 0);

      const fEdgesRaw = Array.isArray(f.edges) ? f.edges : [];
      const fEdges = fEdgesRaw
        .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
        .map((e) => ({
          from: String(e.from || '').trim(),
          to: String(e.to || '').trim(),
          label:
            typeof e.label === 'string' && e.label.trim()
              ? e.label.trim().slice(0, 32)
              : undefined,
        }))
        .filter((e) => e.from && e.to);

      return {
        id: `flow-${fIdx + 1}`,
        title:
          typeof f.title === 'string' && f.title.trim()
            ? f.title.trim().slice(0, 90)
            : `${topic} Clinical Pathway`,
        flowType: VALID_FLOW_TYPES.has(ft) ? ft : 'pathophysiology',
        nodes: fNodes,
        edges: fEdges,
        sourceBasis: grounding.sourceBasis,
        pageNumbers: grounding.pageNumbers,
      };
    })
    .filter((f) => f.nodes.length >= 2);

  if (flowcharts.length === 0 && sections.length > 0) {
    flowcharts = buildFallbackFlowchartsFromSections(topic, sections);
  }

  // Sanitize Anatomical Diagram
  let anatomicalDiagram: AnatomicalDiagramData | undefined;
  if (raw.anatomicalDiagram && typeof raw.anatomicalDiagram === 'object') {
    const adRaw = raw.anatomicalDiagram as Record<string, unknown>;
    const rawTpl = String(adRaw.systemTemplate || '') as AnatomicalSystemTemplate;
    const systemTemplate = VALID_ANATOMY_TEMPLATES.has(rawTpl)
      ? rawTpl
      : inferAnatomicalTemplate(topic);
    const rawCallouts = Array.isArray(adRaw.callouts) ? adRaw.callouts : [];
    const callouts: AnatomicalCallout[] = rawCallouts
      .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
      .map((c, cIdx) => {
        const grounding = resolveItemGrounding(c.sourceBasis, c.pageNumbers);
        const [defX, defY] = DEFAULT_CALLOUT_COORDS[cIdx % DEFAULT_CALLOUT_COORDS.length];
        const rawX = Number(c.xPercent);
        const rawY = Number(c.yPercent);
        return {
          id: `anat-pin-${cIdx + 1}`,
          number: cIdx + 1,
          structureName: String(c.structureName || `Structure ${cIdx + 1}`).trim().slice(0, 52),
          xPercent:
            Number.isFinite(rawX) && rawX >= 12 && rawX <= 88 ? Math.round(rawX) : defX,
          yPercent:
            Number.isFinite(rawY) && rawY >= 14 && rawY <= 86 ? Math.round(rawY) : defY,
          normalRole: String(c.normalRole || 'Normal physiological baseline.').trim().slice(0, 220),
          pathologicalChange: String(
            c.pathologicalChange || 'Altered in disease state.'
          )
            .trim()
            .slice(0, 220),
          sourceBasis: grounding.sourceBasis,
          pageNumbers: grounding.pageNumbers,
        };
      })
      .slice(0, 6);

    if (callouts.length >= 2) {
      anatomicalDiagram = {
        title:
          typeof adRaw.title === 'string' && adRaw.title.trim()
            ? adRaw.title.trim().slice(0, 90)
            : `${topic} — Labeled Anatomical & Physiological Diagram`,
        systemTemplate,
        normalPhysiologySummary:
          typeof adRaw.normalPhysiologySummary === 'string' &&
          adRaw.normalPhysiologySummary.trim()
            ? adRaw.normalPhysiologySummary.trim()
            : 'Normal physiological regulation maintains organ homeostasis.',
        pathophysiologySummary:
          typeof adRaw.pathophysiologySummary === 'string' &&
          adRaw.pathophysiologySummary.trim()
            ? adRaw.pathophysiologySummary.trim()
            : 'Pathological disruption produces characteristic clinical manifestations.',
        callouts,
      };
    }
  }
  if (!anatomicalDiagram && sections.length > 0) {
    anatomicalDiagram = buildFallbackAnatomicalDiagram(topic, sections);
  }

  // Sanitize Comparison Table
  let comparisonTable: ComparisonTableData | undefined;
  if (raw.comparisonTable && typeof raw.comparisonTable === 'object') {
    const ctRaw = raw.comparisonTable as Record<string, unknown>;
    const grounding = resolveItemGrounding(ctRaw.sourceBasis, ctRaw.pageNumbers);
    const columns = Array.isArray(ctRaw.columns)
      ? ctRaw.columns.map((c) => String(c || '').trim()).filter(Boolean).slice(0, 4)
      : [];
    const rawRows = Array.isArray(ctRaw.rows) ? ctRaw.rows : [];
    const rows = rawRows
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
      .map((r) => {
        const cells = Array.isArray(r.cells)
          ? r.cells.map((cell) => String(cell || '').trim())
          : [];
        while (cells.length < columns.length) cells.push('—');
        return {
          feature: String(r.feature || '').trim(),
          cells: cells.slice(0, columns.length),
        };
      })
      .filter((r) => r.feature.length > 0);

    if (columns.length >= 2 && rows.length >= 2) {
      comparisonTable = {
        title:
          typeof ctRaw.title === 'string' && ctRaw.title.trim()
            ? ctRaw.title.trim()
            : `Differential & Clinical Comparison: ${topic}`,
        columns,
        rows,
        sourceBasis: grounding.sourceBasis,
        pageNumbers: grounding.pageNumbers,
      };
    }
  }

  // Sanitize Clinical Case Scenarios
  const rawCases = Array.isArray(raw.clinicalCases) ? raw.clinicalCases : [];
  const clinicalCases: ClinicalCaseScenario[] = rawCases
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
    .map((c, idx) => {
      const grounding = resolveItemGrounding(c.sourceBasis, c.pageNumbers);
      return {
        id: `case-${idx + 1}`,
        title: String(c.title || `Clinical Vignette ${idx + 1}`).trim(),
        patientPresentation: String(c.patientPresentation || '').trim(),
        vitalsAndLabs: String(c.vitalsAndLabs || '').trim(),
        promptQuestion:
          String(c.promptQuestion || 'What is the most likely diagnosis and immediate next step?').trim(),
        idealWorkupAndDiagnosis: String(c.idealWorkupAndDiagnosis || '').trim(),
        managementPlan: String(c.managementPlan || '').trim(),
        clinicalPearl: String(c.clinicalPearl || '').trim(),
        arabicTakeaway:
          typeof c.arabicTakeaway === 'string' && c.arabicTakeaway.trim()
            ? c.arabicTakeaway.trim()
            : undefined,
        sourceBasis: grounding.sourceBasis,
        pageNumbers: grounding.pageNumbers,
      };
    })
    .filter(
      (c) =>
        c.patientPresentation.length > 0 &&
        c.idealWorkupAndDiagnosis.length > 0 &&
        !detectConflictingTopicHijack(
          `${c.patientPresentation} ${c.idealWorkupAndDiagnosis} ${c.managementPlan}`,
          c.title,
          canonical
        ).hijacked
    );

  // Sanitize Flashcards
  const rawCards = Array.isArray(raw.flashcards) ? raw.flashcards : [];
  let flashcards: FlashcardItem[] = rawCards
    .filter((fc): fc is Record<string, unknown> => Boolean(fc && typeof fc === 'object'))
    .map((fc, idx) => {
      const grounding = resolveItemGrounding(fc.sourceBasis, fc.pageNumbers);
      return {
        id: `fc-${idx + 1}`,
        front: String(fc.front || '').trim(),
        back: String(fc.back || '').trim(),
        backArabic:
          typeof fc.backArabic === 'string' && fc.backArabic.trim()
            ? fc.backArabic.trim()
            : undefined,
        category: String(fc.category || 'High-Yield Recall').trim(),
        sourceBasis: grounding.sourceBasis,
        pageNumbers: grounding.pageNumbers,
      };
    })
    .filter((fc) => fc.front.length > 0 && fc.back.length > 0);

  if (flashcards.length === 0 && sections.length > 0) {
    flashcards = buildFallbackFlashcards(topic, sections, clinicalNotes);
  }

  const quickRevisionBullets = Array.isArray(raw.quickRevisionBullets)
    ? raw.quickRevisionBullets
        .map((b) => String(b || '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : sections.map((s) => s.keyTakeaway).filter(Boolean).slice(0, 6);

  const verifiedReferencedPages = new Set<number>();
  for (const s of sections) {
    if (s.sourceBasis === 'textbook') s.pageNumbers.forEach((p) => verifiedReferencedPages.add(p));
  }
  for (const n of clinicalNotes) {
    if (n.sourceBasis === 'textbook') n.pageNumbers.forEach((p) => verifiedReferencedPages.add(p));
  }
  for (const m of mcqs) {
    if (m.sourceBasis === 'textbook') m.pageNumbers.forEach((p) => verifiedReferencedPages.add(p));
  }

  // If no individual items kept textbook citations, coverage effectively drops to 'none'
  const hasAnyTextbookItem = verifiedReferencedPages.size > 0;
  if (!hasAnyTextbookItem) {
    coverage = 'none';
  }

  const referencedPages = hasAnyTextbookItem
    ? Array.from(verifiedReferencedPages).sort((a, b) => a - b)
    : [];

  const defaultSummary =
    coverage === 'none'
      ? `The uploaded textbook "${textbook.title}" (${textbook.pageCount} pages searched) does not contain relevant passages covering "${topic}". Zero textbook citations are claimed; any notes below reflect general medical knowledge.`
      : `Evidence-grounded review of ${topic} based on retrieved passages (${buildPageCitationLabel(
          referencedPages
        )}) from ${textbook.title}.`;

  const rawSummaryStr =
    typeof raw.summary === 'string' && raw.summary.trim().length > 0 ? raw.summary.trim() : '';
  const summaryHijacked = rawSummaryStr
    ? detectConflictingTopicHijack(rawSummaryStr, topic, canonical).hijacked
    : false;
  const summary =
    rawSummaryStr && !summaryHijacked ? rawSummaryStr : defaultSummary;

  const summaryArabic =
    typeof raw.summaryArabic === 'string' && raw.summaryArabic.trim().length > 0
      ? raw.summaryArabic.trim()
      : undefined;

  const coverageNote =
    typeof raw.coverageNote === 'string' && raw.coverageNote.trim().length > 0
      ? raw.coverageNote.trim()
      : coverage === 'none'
        ? `Searched all ${retrieval.totalPagesSearched} indexed pages of "${textbook.title}" and found insufficient relevant information on "${topic}". No textbook page numbers are cited. Supplemental content below is labeled as General Medical Knowledge.`
        : coverage === 'partial'
          ? `Partially covered in "${textbook.title}" (${buildPageCitationLabel(
              referencedPages
            )}). Statements directly backed by retrieved passages cite exact page numbers; broader clinical context is labeled as General Medical Knowledge.`
          : `Directly supported by ${retrieval.passages.length} retrieved ${
              retrieval.passages.length === 1 ? 'passage' : 'passages'
            } on ${buildPageCitationLabel(referencedPages)} of "${textbook.title}".`;

  return {
    canonicalTopicId: canonical.topicId,
    textbookId: textbook.id,
    textbookTitle: textbook.title,
    topic,
    summary,
    summaryArabic,
    quickRevisionBullets,
    coverage,
    coverageNote,
    totalPagesSearched: retrieval.totalPagesSearched || textbook.pageCount,
    referencedPages,
    retrievedPassages: coverage === 'none' ? [] : retrieval.passages,
    sections,
    clinicalNotes,
    mcqs,
    mindMap,
    flowcharts,
    anatomicalDiagram,
    comparisonTable,
    clinicalCases,
    flashcards,
  };
}

export function buildOfflineFallbackGuide(
  textbook: Pick<MedicalTextbook, 'id' | 'title' | 'pageCount' | 'pages'>,
  topic: string
): Omit<StudyGuide, 'id' | 'createdAt' | 'updatedAt' | 'answers'> {
  const cleanTopic = topic.trim();
  const retrieval = retrieveRelevantPassages(textbook.pages, cleanTopic, 6);

  if (retrieval.coverage === 'none' || retrieval.passages.length === 0) {
    const emptySections: ExplanationSection[] = [
      {
        stepNumber: 1,
        stepPhase: 'Textbook Coverage Check',
        heading: '01. Topic Not Found in Uploaded Textbook',
        content: `A full-book lexical and medical-concept search across all ${textbook.pageCount} pages of "${textbook.title}" did not return any passages supporting "${cleanTopic}". To prevent inaccurate study material, MedAtlas Tutor never fabricates page citations when the selected PDF lacks relevant text.\n\nYou can inspect the Textbook Library to view the chapters included in this PDF, upload another PDF covering "${cleanTopic}", or go online to request a clearly separated Supplementary Medical Knowledge lesson and live PubMed evidence search.`,
        contentArabic: `تم البحث في جميع صفحات الكتاب المرفوع (${textbook.pageCount} صفحة) ولم يتم العثور على فقرات تغطي موضوع "${cleanTopic}". حفاظاً على الدقة العلمية، لا يقوم التطبيق باختلاق أرقام صفحات غير موجودة. يمكنك رفع كتاب آخر أو الاتصال بالإنترنت للحصول على شرح طبي عام وأحدث الأبحاث من PubMed.`,
        pageNumbers: [],
        sourceBasis: 'general_medical_knowledge',
        keyTakeaway: `Zero passages in "${textbook.title}" matched "${cleanTopic}"; no textbook pages are cited.`,
      },
    ];
    return {
      canonicalTopicId: canonicalizeMedicalTopic(cleanTopic).topicId,
      textbookId: textbook.id,
      textbookTitle: textbook.title,
      topic: canonicalizeMedicalTopic(cleanTopic).canonicalTitle,
      summary: `Insufficient textbook information: We searched all ${textbook.pageCount} indexed pages of "${textbook.title}" offline and found no passages covering "${cleanTopic}". No textbook citations were generated.`,
      summaryArabic: `لا توجد معلومات كافية في الكتاب المرفوع: تم البحث في ${textbook.pageCount} صفحة ولم يتم العثور على فقرات تغطي "${cleanTopic}". لم يتم الاستشهاد بأي صفحات من الكتاب.`,
      quickRevisionBullets: [
        `Searched all ${textbook.pageCount} indexed pages of "${textbook.title}" offline with zero matches for "${cleanTopic}".`,
        'Reconnect to the internet to generate supplementary medical teaching and query PubMed / NIH MedlinePlus.',
      ],
      coverage: 'none',
      coverageNote: `Searched all ${textbook.pageCount} indexed pages (${retrieval.totalPassagesSearched} passages) of "${textbook.title}" and found zero matching passages for "${cleanTopic}". Upload a textbook covering this topic or reconnect to the internet for a clearly labeled General Medical Knowledge overview.`,
      totalPagesSearched: textbook.pageCount,
      referencedPages: [],
      retrievedPassages: [],
      sections: emptySections,
      clinicalNotes: [],
      mcqs: [],
      generatedOffline: true,
    };
  }

  // Group retrieved passages by page for clean offline reading
  const passagesByPage = new Map<number, RetrievedPassage[]>();
  for (const p of retrieval.passages) {
    const existing = passagesByPage.get(p.pageNumber) || [];
    existing.push(p);
    passagesByPage.set(p.pageNumber, existing);
  }

  const sections: ExplanationSection[] = Array.from(passagesByPage.entries())
    .slice(0, 4)
    .map(([pageNumber, pagePassages], idx) => {
      const headingTitle =
        pagePassages[0].chapterTitle || `Retrieved Textbook Excerpt (Page ${pageNumber})`;
      const combinedText = pagePassages.map((p) => p.text).join('\n\n');
      const firstSentence =
        pagePassages[0].text.split(/(?<=[.?!])\s+/)[0]?.slice(0, 200) ||
        `Review page ${pageNumber} for primary textbook discussion.`;

      return {
        stepNumber: idx + 1,
        stepPhase: `Retrieved Page ${pageNumber}`,
        heading: `0${idx + 1}. ${headingTitle}`,
        content: combinedText,
        quickSummaryPoints: [firstSentence],
        pageNumbers: [pageNumber],
        sourceBasis: 'textbook',
        supportingQuote: firstSentence,
        keyTakeaway: firstSentence,
      };
    });

  const primaryPassage = retrieval.passages[0];
  const clinicalNotes: ClinicalNote[] = retrieval.passages.slice(0, 2).map((p, idx) => ({
    title: p.chapterTitle
      ? `${p.chapterTitle} (p. ${p.pageNumber})`
      : `Retrieved Clinical Excerpt ${idx + 1} (p. ${p.pageNumber})`,
    category: idx === 0 ? 'Management Protocol' : 'Clinical Pearl',
    detail: p.text.slice(0, 340) + (p.text.length > 340 ? '...' : ''),
    pageNumbers: [p.pageNumber],
    sourceBasis: 'textbook',
    supportingQuote: p.text.slice(0, 160),
  }));

  const otherPage = Math.max(
    1,
    primaryPassage.pageNumber < textbook.pageCount
      ? primaryPassage.pageNumber + 1
      : Math.max(1, primaryPassage.pageNumber - 1)
  );

  const mcqs: MCQItem[] = [
    {
      id: 'mcq-offline-1',
      question: `While studying offline, which exact page in "${textbook.title}" contains the highest-scoring retrieved passage for "${cleanTopic}"?`,
      options: [
        `Page ${primaryPassage.pageNumber}${
          primaryPassage.chapterTitle ? ` (${primaryPassage.chapterTitle})` : ''
        }`,
        `Page ${otherPage} (Unmatched adjacent section)`,
        'Unindexed external appendix',
        'Topic is absent from this textbook',
      ],
      correctIndex: 0,
      explanation: `Offline passage retrieval matched "${cleanTopic}" directly to Page ${primaryPassage.pageNumber} of "${textbook.title}" (matched terms: ${primaryPassage.matchedTerms.join(
        ', '
      )}).`,
      pageNumbers: [primaryPassage.pageNumber],
      sourceBasis: 'textbook',
    },
  ];

  return {
    canonicalTopicId: canonicalizeMedicalTopic(cleanTopic).topicId,
    textbookId: textbook.id,
    textbookTitle: textbook.title,
    topic: canonicalizeMedicalTopic(cleanTopic).canonicalTitle,
    summary: `Offline verbatim extract for "${cleanTopic}" retrieved from ${buildPageCitationLabel(
      retrieval.retrievedPages
    )} across all ${textbook.pageCount} indexed pages of "${textbook.title}". Connect to the internet to synthesize full step-by-step interactive diagrams, cases, and MCQs.`,
    quickRevisionBullets: sections.map((s) => s.keyTakeaway),
    coverage: retrieval.coverage,
    coverageNote: retrieval.coverageReason,
    totalPagesSearched: textbook.pageCount,
    referencedPages: retrieval.retrievedPages,
    retrievedPassages: retrieval.passages,
    sections,
    clinicalNotes,
    mcqs,
    mindMap: buildFallbackMindMapFromSections(cleanTopic, sections, clinicalNotes),
    flowcharts: buildFallbackFlowchartsFromSections(cleanTopic, sections),
    anatomicalDiagram: buildFallbackAnatomicalDiagram(cleanTopic, sections),
    flashcards: buildFallbackFlashcards(cleanTopic, sections, clinicalNotes),
    generatedOffline: true,
  };
}

export function validateTopicInput(topic: string, _hasTextbook = true): ValidationResult {
  void _hasTextbook;
  const trimmed = topic.trim();
  if (!trimmed) {
    return {
      valid: false,
      error:
        'Enter any medical topic (for example: Peptic Ulcer Disease, Heart Failure, Diabetic Ketoacidosis, or Acute Appendicitis).',
    };
  }
  if (trimmed.length < 2) {
    return {
      valid: false,
      error: 'Topic must be at least 2 characters long.',
    };
  }
  if (trimmed.length > 180) {
    return {
      valid: false,
      error: 'Topic must be 180 characters or fewer.',
    };
  }
  return { valid: true };
}

export function validateWorkspaceKey(rawKey: string): ValidationResult {
  const cleaned = rawKey.trim().toUpperCase();
  if (!cleaned) {
    return {
      valid: false,
      error: 'Enter a Cloud Vault Key (for example, MED-8K4P-2X9N).',
    };
  }
  if (cleaned.length < 8 || cleaned.length > 64) {
    return {
      valid: false,
      error: 'Cloud Vault Key must be between 8 and 64 characters.',
    };
  }
  if (!/^[A-Z0-9-]+$/.test(cleaned)) {
    return {
      valid: false,
      error: 'Cloud Vault Key may only contain letters, numbers, and hyphens.',
    };
  }
  return { valid: true };
}
