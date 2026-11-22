import type {
  BookPageCitation,
  ClinicalNote,
  CoverageLevel,
  ExplanationSection,
  MCQItem,
  MedicalTextbook,
  RetrievedPassage,
  SourceBasis,
  SourceTextbookSummary,
  StudyGuide,
} from '../types/medical';
import {
  buildFallbackAnatomicalDiagram,
  buildFallbackFlashcards,
  buildFallbackFlowchartsFromSections,
  buildFallbackMindMapFromSections,
  buildPageCitationLabel,
  retrieveRelevantPassages,
  sanitizeStudyGuideResponse,
  type RetrievalResult,
} from './textbookEngine';
import { canonicalizeMedicalTopic } from './topicCanonicalizer';

export interface BookTagMapping {
  bookKey: string; // e.g. "B1", "B2"
  textbookId: string;
  textbookTitle: string;
  subject?: string;
  pageCount: number;
}

export interface MultiBookRetrievalResult extends RetrievalResult {
  bookMappings: BookTagMapping[];
  bookCitations: BookPageCitation[];
  allowedTagSet: Set<string>; // e.g. "B1:2", "B2:1"
}

export function shortenBookTitle(title: string, maxChars = 34): string {
  const clean = String(title || 'Textbook')
    .replace(/\s*\(\d+\s*Chapters?\)/i, '')
    .replace(/:\s*Clinical Compendium/i, '')
    .trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trim()}…`;
}

export function formatBookCitationsSummary(
  bookCitations?: BookPageCitation[],
  fallbackPages?: number[],
  fallbackBookTitle?: string
): string {
  const validMulti = (bookCitations || []).filter(
    (bc) => Array.isArray(bc.pageNumbers) && bc.pageNumbers.length > 0
  );
  if (validMulti.length > 0) {
    return validMulti
      .map(
        (bc) =>
          `${shortenBookTitle(bc.textbookTitle, 38)} (${buildPageCitationLabel(bc.pageNumbers)})`
      )
      .join(' · ');
  }
  const pages = (fallbackPages || []).filter((n) => Number.isInteger(n) && n > 0);
  if (pages.length > 0) {
    return fallbackBookTitle
      ? `${shortenBookTitle(fallbackBookTitle, 38)} (${buildPageCitationLabel(pages)})`
      : `Textbook ${buildPageCitationLabel(pages)}`;
  }
  return 'No textbook pages cited';
}

export interface ClickableCitationItem {
  key: string;
  textbookId?: string;
  textbookTitle: string;
  shortTitle: string;
  pageNumber: number;
}

export function flattenClickableCitations(
  bookCitations?: BookPageCitation[],
  fallbackPages?: number[],
  fallbackBookId?: string,
  fallbackBookTitle?: string
): ClickableCitationItem[] {
  const items: ClickableCitationItem[] = [];
  const seen = new Set<string>();

  const validMulti = (bookCitations || []).filter(
    (bc) => Array.isArray(bc.pageNumbers) && bc.pageNumbers.length > 0
  );

  if (validMulti.length > 0) {
    for (const bc of validMulti) {
      const sorted = Array.from(new Set(bc.pageNumbers)).sort((a, b) => a - b);
      for (const pg of sorted) {
        if (!Number.isInteger(pg) || pg < 1) continue;
        const k = `${bc.textbookId}:${pg}`;
        if (seen.has(k)) continue;
        seen.add(k);
        items.push({
          key: k,
          textbookId: bc.textbookId,
          textbookTitle: bc.textbookTitle,
          shortTitle: shortenBookTitle(bc.textbookTitle, 28),
          pageNumber: pg,
        });
      }
    }
    return items;
  }

  const sortedFallback = Array.from(new Set(fallbackPages || [])).sort((a, b) => a - b);
  const title = fallbackBookTitle || 'Textbook';
  for (const pg of sortedFallback) {
    if (!Number.isInteger(pg) || pg < 1) continue;
    const k = `${fallbackBookId || 'book'}:${pg}`;
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({
      key: k,
      textbookId: fallbackBookId,
      textbookTitle: title,
      shortTitle: shortenBookTitle(title, 28),
      pageNumber: pg,
    });
  }
  return items;
}

/**
 * Searches across 1 or multiple selected textbooks independently, preserving exact
 * verified book IDs, book titles, and 1-indexed page numbers.
 */
export function retrieveAcrossTextbooks(
  selectedBooks: Array<
    Pick<MedicalTextbook, 'id' | 'title' | 'subject' | 'pageCount' | 'pages'>
  >,
  topic: string,
  maxTotalPassages = 12
): MultiBookRetrievalResult {
  if (selectedBooks.length === 0) {
    return {
      coverage: 'none',
      coverageReason: 'No medical textbooks selected.',
      passages: [],
      retrievedPages: [],
      totalPagesSearched: 0,
      totalPassagesSearched: 0,
      matchedCoreTerms: [],
      missingCoreTerms: [],
      bookMappings: [],
      bookCitations: [],
      allowedTagSet: new Set<string>(),
    };
  }

  const bookMappings: BookTagMapping[] = selectedBooks.map((b, idx) => ({
    bookKey: `B${idx + 1}`,
    textbookId: b.id,
    textbookTitle: b.title,
    subject: b.subject,
    pageCount: Math.max(1, b.pageCount || b.pages.length || 1),
  }));

  let totalPagesSearched = 0;
  let totalPassagesSearched = 0;
  const matchedCoreSet = new Set<string>();
  const allCoreCandidates = new Set<string>();

  const perBookPassages: RetrievedPassage[][] = [];
  const bookCitations: BookPageCitation[] = [];
  let anyStrong = false;
  let anyPartial = false;

  selectedBooks.forEach((book, idx) => {
    const mapping = bookMappings[idx];
    const res = retrieveRelevantPassages(book.pages, topic, 8);
    totalPagesSearched += res.totalPagesSearched;
    totalPassagesSearched += res.totalPassagesSearched;

    res.matchedCoreTerms.forEach((t) => {
      matchedCoreSet.add(t);
      allCoreCandidates.add(t);
    });
    res.missingCoreTerms.forEach((t) => allCoreCandidates.add(t));

    if (res.coverage === 'strong') anyStrong = true;
    if (res.coverage === 'partial') anyPartial = true;

    const tagged = res.passages.map((p) => ({
      ...p,
      passageId: `${mapping.bookKey}-${p.passageId}`,
      textbookId: book.id,
      textbookTitle: book.title,
      citationTag: `${mapping.bookKey}:${p.pageNumber}`,
    }));

    if (tagged.length > 0) {
      perBookPassages.push(tagged);
      bookCitations.push({
        textbookId: book.id,
        textbookTitle: book.title,
        pageNumbers: res.retrievedPages,
      });
    }
  });

  // Interleave top passages across matching books so multi-book grounding is balanced,
  // then sort by relevance score.
  const combined: RetrievedPassage[] = [];
  const maxDepth = Math.max(0, ...perBookPassages.map((arr) => arr.length));
  for (let d = 0; d < maxDepth && combined.length < maxTotalPassages; d++) {
    for (const arr of perBookPassages) {
      if (d < arr.length && combined.length < maxTotalPassages) {
        combined.push(arr[d]);
      }
    }
  }

  combined.sort((a, b) => b.score - a.score);

  const allowedTagSet = new Set<string>();
  for (const p of combined) {
    if (p.citationTag) allowedTagSet.add(p.citationTag);
  }

  // Recompute exact bookCitations strictly from the retained top passages
  const retainedCitationsMap = new Map<string, Set<number>>();
  for (const p of combined) {
    if (!p.textbookId) continue;
    const set = retainedCitationsMap.get(p.textbookId) || new Set<number>();
    set.add(p.pageNumber);
    retainedCitationsMap.set(p.textbookId, set);
  }

  const finalBookCitations: BookPageCitation[] = [];
  for (const mapping of bookMappings) {
    const pgSet = retainedCitationsMap.get(mapping.textbookId);
    if (pgSet && pgSet.size > 0) {
      finalBookCitations.push({
        textbookId: mapping.textbookId,
        textbookTitle: mapping.textbookTitle,
        pageNumbers: Array.from(pgSet).sort((a, b) => a - b),
      });
    }
  }

  const matchedCoreTerms = Array.from(matchedCoreSet);
  const missingCoreTerms = Array.from(allCoreCandidates).filter((t) => !matchedCoreSet.has(t));

  let coverage: CoverageLevel = 'none';
  if (combined.length > 0) {
    coverage = anyStrong || (missingCoreTerms.length === 0 && anyPartial) ? 'strong' : 'partial';
  }

  // Primary book page numbers kept for legacy single-book callers
  const primaryPages =
    finalBookCitations.length === 1
      ? finalBookCitations[0].pageNumbers
      : Array.from(new Set(combined.map((p) => p.pageNumber))).sort((a, b) => a - b);

  const booksSearchedLabel =
    selectedBooks.length === 1
      ? `"${selectedBooks[0].title}" (${totalPagesSearched} pages)`
      : `${selectedBooks.length} selected textbooks (${totalPagesSearched} total pages)`;

  const coverageReason =
    coverage === 'none'
      ? `Searched ${booksSearchedLabel} (${totalPassagesSearched} passages) and found zero textbook passages matching "${topic.trim()}".`
      : coverage === 'strong'
        ? `Retrieved ${combined.length} verified passages across ${finalBookCitations.length} ${
            finalBookCitations.length === 1 ? 'textbook' : 'textbooks'
          }: ${formatBookCitationsSummary(finalBookCitations)} (searched ${booksSearchedLabel}).`
        : `Partial textbook coverage in ${formatBookCitationsSummary(
            finalBookCitations
          )} across ${booksSearchedLabel}.`;

  return {
    coverage,
    coverageReason,
    passages: combined,
    retrievedPages: primaryPages,
    totalPagesSearched,
    totalPassagesSearched,
    matchedCoreTerms,
    missingCoreTerms,
    bookMappings,
    bookCitations: finalBookCitations,
    allowedTagSet,
  };
}

function parseVerifiedCitationTags(
  rawTags: unknown,
  rawPageNumbers: unknown,
  multiRetrieval: MultiBookRetrievalResult,
  allowScannedSingleBook: boolean
): BookPageCitation[] {
  const byBook = new Map<string, Set<number>>();
  const keyToMapping = new Map<string, BookTagMapping>();
  for (const m of multiRetrieval.bookMappings) {
    keyToMapping.set(m.bookKey.toUpperCase(), m);
  }

  // 1. Parse explicit citationTags like ["B1:2", "B2:1"] or ["B1:p.2"]
  if (Array.isArray(rawTags)) {
    for (const rawTag of rawTags) {
      const str = String(rawTag || '').trim().toUpperCase();
      const match = str.match(/^(B\d+)\s*:\s*(?:P\.?\s*)?(\d+)$/i);
      if (!match) continue;
      const bKey = match[1].toUpperCase();
      const pageNum = Number(match[2]);
      const mapping = keyToMapping.get(bKey);
      if (!mapping || !Number.isInteger(pageNum) || pageNum < 1 || pageNum > mapping.pageCount) {
        continue;
      }
      const canonicalTag = `${bKey}:${pageNum}`;
      if (allowScannedSingleBook || multiRetrieval.allowedTagSet.has(canonicalTag)) {
        const set = byBook.get(mapping.textbookId) || new Set<number>();
        set.add(pageNum);
        byBook.set(mapping.textbookId, set);
      }
    }
  }

  // 2. Fallback / supplement: if rawPageNumbers were returned, match them ONLY to books where
  //    that exact page was retrieved (and only unambiguously when 1 book matched that page or 1 book selected)
  if (byBook.size === 0 && Array.isArray(rawPageNumbers)) {
    for (const rawPg of rawPageNumbers) {
      const pg = Number(rawPg);
      if (!Number.isInteger(pg) || pg < 1) continue;

      if (allowScannedSingleBook && multiRetrieval.bookMappings.length === 1) {
        const only = multiRetrieval.bookMappings[0];
        if (pg <= only.pageCount) {
          const set = byBook.get(only.textbookId) || new Set<number>();
          set.add(pg);
          byBook.set(only.textbookId, set);
        }
        continue;
      }

      const matchingMappings = multiRetrieval.bookMappings.filter((m) =>
        multiRetrieval.allowedTagSet.has(`${m.bookKey}:${pg}`)
      );
      if (matchingMappings.length === 1) {
        const m = matchingMappings[0];
        const set = byBook.get(m.textbookId) || new Set<number>();
        set.add(pg);
        byBook.set(m.textbookId, set);
      } else if (matchingMappings.length > 1) {
        // Both books happened to have retrieved passages on that same page integer; cite the highest-scoring one
        const bestPassage = multiRetrieval.passages.find((p) => p.pageNumber === pg && p.textbookId);
        if (bestPassage?.textbookId) {
          const set = byBook.get(bestPassage.textbookId) || new Set<number>();
          set.add(pg);
          byBook.set(bestPassage.textbookId, set);
        }
      }
    }
  }

  const out: BookPageCitation[] = [];
  for (const m of multiRetrieval.bookMappings) {
    const set = byBook.get(m.textbookId);
    if (set && set.size > 0) {
      out.push({
        textbookId: m.textbookId,
        textbookTitle: m.textbookTitle,
        pageNumbers: Array.from(set).sort((a, b) => a - b),
      });
    }
  }
  return out;
}

/**
 * Multi-book sanitizer: builds upon sanitizeStudyGuideResponse and strictly enforces
 * verified (Book Title, Page Number) citations across 1 or multiple selected textbooks.
 */
export function sanitizeMultiBookStudyGuideResponse(
  raw: Record<string, unknown>,
  selectedBooks: Array<Pick<MedicalTextbook, 'id' | 'title' | 'subject' | 'pageCount'>>,
  requestedTopic: string,
  multiRetrieval: MultiBookRetrievalResult,
  options?: { allowScannedPdfPages?: boolean }
): Omit<StudyGuide, 'id' | 'createdAt' | 'updatedAt' | 'answers'> {
  const primaryBook = selectedBooks[0] || {
    id: 'general-medical-knowledge',
    title: 'General Medical Knowledge & External Evidence',
    pageCount: 1,
  };

  const allowScanned = Boolean(options?.allowScannedPdfPages && selectedBooks.length === 1);

  const combinedTitle =
    selectedBooks.length === 0
      ? 'General Medical Knowledge & External Evidence'
      : selectedBooks.length === 1
        ? primaryBook.title
        : selectedBooks.map((b) => shortenBookTitle(b.title, 42)).join(' + ');

  const maxAnyPage =
    selectedBooks.length > 0 ? Math.max(1, ...selectedBooks.map((b) => b.pageCount)) : 1;

  // Pre-populate pageNumbers on raw items from citationTags if the model supplied citationTags
  // so base sanitizeStudyGuideResponse also preserves quotes and item structure cleanly
  const enrichRawItemPages = (item: unknown): unknown => {
    if (!item || typeof item !== 'object') return item;
    const obj = item as Record<string, unknown>;
    const verified = parseVerifiedCitationTags(
      obj.citationTags,
      obj.pageNumbers,
      multiRetrieval,
      allowScanned
    );
    const flatPages = Array.from(new Set(verified.flatMap((v) => v.pageNumbers))).sort(
      (a, b) => a - b
    );
    return {
      ...obj,
      pageNumbers: flatPages,
      _verifiedBookCitations: verified,
    };
  };

  const preparedRaw: Record<string, unknown> = {
    ...raw,
    sections: Array.isArray(raw.sections) ? raw.sections.map(enrichRawItemPages) : raw.sections,
    clinicalNotes: Array.isArray(raw.clinicalNotes)
      ? raw.clinicalNotes.map(enrichRawItemPages)
      : raw.clinicalNotes,
    mcqs: Array.isArray(raw.mcqs) ? raw.mcqs.map(enrichRawItemPages) : raw.mcqs,
    clinicalCases: Array.isArray(raw.clinicalCases)
      ? raw.clinicalCases.map(enrichRawItemPages)
      : raw.clinicalCases,
    flashcards: Array.isArray(raw.flashcards)
      ? raw.flashcards.map(enrichRawItemPages)
      : raw.flashcards,
    flowcharts: Array.isArray(raw.flowcharts)
      ? raw.flowcharts.map(enrichRawItemPages)
      : raw.flowcharts,
    comparisonTable:
      raw.comparisonTable && typeof raw.comparisonTable === 'object'
        ? enrichRawItemPages(raw.comparisonTable)
        : raw.comparisonTable,
    mindMap:
      raw.mindMap && typeof raw.mindMap === 'object'
        ? {
            ...(raw.mindMap as Record<string, unknown>),
            nodes: Array.isArray((raw.mindMap as Record<string, unknown>).nodes)
              ? ((raw.mindMap as Record<string, unknown>).nodes as unknown[]).map(
                  enrichRawItemPages
                )
              : [],
          }
        : raw.mindMap,
    anatomicalDiagram:
      raw.anatomicalDiagram && typeof raw.anatomicalDiagram === 'object'
        ? {
            ...(raw.anatomicalDiagram as Record<string, unknown>),
            callouts: Array.isArray((raw.anatomicalDiagram as Record<string, unknown>).callouts)
              ? ((raw.anatomicalDiagram as Record<string, unknown>).callouts as unknown[]).map(
                  enrichRawItemPages
                )
              : [],
          }
        : raw.anatomicalDiagram,
  };

  const base = sanitizeStudyGuideResponse(
    preparedRaw,
    {
      id: primaryBook.id,
      title: combinedTitle,
      pageCount: maxAnyPage,
    },
    requestedTopic,
    multiRetrieval,
    { allowScannedPdfPages: allowScanned }
  );

  const attachVerified = <
    T extends { sourceBasis: SourceBasis; pageNumbers: number[]; bookCitations?: BookPageCitation[] },
  >(
    sanitizedItems: T[],
    rawArr: unknown
  ): T[] => {
    const arr = Array.isArray(rawArr) ? rawArr : [];
    return sanitizedItems.map((item, idx) => {
      if (item.sourceBasis !== 'textbook' || item.pageNumbers.length === 0) {
        return { ...item, pageNumbers: [], bookCitations: [] };
      }
      const rawObj =
        arr[idx] && typeof arr[idx] === 'object'
          ? (arr[idx] as Record<string, unknown>)
          : {};
      const verified = parseVerifiedCitationTags(
        rawObj.citationTags,
        item.pageNumbers,
        multiRetrieval,
        allowScanned
      );
      if (verified.length === 0) {
        return {
          ...item,
          sourceBasis: 'general_medical_knowledge' as SourceBasis,
          pageNumbers: [],
          bookCitations: [],
        };
      }
      return {
        ...item,
        pageNumbers: Array.from(new Set(verified.flatMap((v) => v.pageNumbers))).sort(
          (a, b) => a - b
        ),
        bookCitations: verified,
      };
    });
  };

  const sections = attachVerified(base.sections, preparedRaw.sections);
  const clinicalNotes = attachVerified(base.clinicalNotes, preparedRaw.clinicalNotes);
  const mcqs = attachVerified(base.mcqs, preparedRaw.mcqs);
  const clinicalCases = base.clinicalCases
    ? attachVerified(base.clinicalCases, preparedRaw.clinicalCases)
    : undefined;
  const flashcards = base.flashcards
    ? attachVerified(base.flashcards, preparedRaw.flashcards)
    : undefined;
  const flowcharts = base.flowcharts
    ? attachVerified(base.flowcharts, preparedRaw.flowcharts)
    : undefined;

  const mindMap = base.mindMap
    ? {
        ...base.mindMap,
        nodes: attachVerified(
          base.mindMap.nodes,
          preparedRaw.mindMap && typeof preparedRaw.mindMap === 'object'
            ? (preparedRaw.mindMap as Record<string, unknown>).nodes
            : []
        ),
      }
    : undefined;

  const anatomicalDiagram = base.anatomicalDiagram
    ? {
        ...base.anatomicalDiagram,
        callouts: attachVerified(
          base.anatomicalDiagram.callouts,
          preparedRaw.anatomicalDiagram && typeof preparedRaw.anatomicalDiagram === 'object'
            ? (preparedRaw.anatomicalDiagram as Record<string, unknown>).callouts
            : []
        ),
      }
    : undefined;

  let comparisonTable = base.comparisonTable;
  if (comparisonTable && comparisonTable.sourceBasis === 'textbook') {
    const ctRaw =
      preparedRaw.comparisonTable && typeof preparedRaw.comparisonTable === 'object'
        ? (preparedRaw.comparisonTable as Record<string, unknown>)
        : {};
    const verified = parseVerifiedCitationTags(
      ctRaw.citationTags,
      comparisonTable.pageNumbers,
      multiRetrieval,
      allowScanned
    );
    comparisonTable =
      verified.length > 0
        ? { ...comparisonTable, bookCitations: verified }
        : { ...comparisonTable, sourceBasis: 'general_medical_knowledge', pageNumbers: [], bookCitations: [] };
  }

  // Aggregate guide-level verified bookCitations across all items
  const guideBookMap = new Map<string, { title: string; pages: Set<number> }>();
  const collectCitations = (cites?: BookPageCitation[]) => {
    for (const c of cites || []) {
      const entry = guideBookMap.get(c.textbookId) || {
        title: c.textbookTitle,
        pages: new Set<number>(),
      };
      c.pageNumbers.forEach((p) => entry.pages.add(p));
      guideBookMap.set(c.textbookId, entry);
    }
  };

  sections.forEach((s) => collectCitations(s.bookCitations));
  clinicalNotes.forEach((n) => collectCitations(n.bookCitations));
  mcqs.forEach((m) => collectCitations(m.bookCitations));

  const aggregatedBookCitations: BookPageCitation[] = [];
  for (const m of multiRetrieval.bookMappings) {
    const found = guideBookMap.get(m.textbookId);
    if (found && found.pages.size > 0) {
      aggregatedBookCitations.push({
        textbookId: m.textbookId,
        textbookTitle: found.title,
        pageNumbers: Array.from(found.pages).sort((a, b) => a - b),
      });
    }
  }

  const finalCoverage: CoverageLevel =
    aggregatedBookCitations.length === 0 ? 'none' : base.coverage;

  const sourceTextbooks: SourceTextbookSummary[] = selectedBooks.map((b) => ({
    id: b.id,
    title: b.title,
    subject: b.subject,
    pageCount: b.pageCount,
  }));

  const coverageNote =
    finalCoverage === 'none'
      ? selectedBooks.length === 0
        ? `No uploaded textbooks were selected for "${base.topic}". Zero textbook page citations are claimed; content reflects General Medical Knowledge and accessible External Scientific Evidence.`
        : `Searched all ${multiRetrieval.totalPagesSearched} indexed pages across ${
            selectedBooks.length === 1
              ? `"${primaryBook.title}"`
              : `${selectedBooks.length} selected textbooks`
          } and found insufficient relevant information on "${base.topic}". Zero textbook citations are claimed; content below reflects General Medical Knowledge and accessible External Scientific Evidence.`
      : typeof raw.coverageNote === 'string' && raw.coverageNote.trim().length > 0
        ? raw.coverageNote.trim()
        : `Verified across ${formatBookCitationsSummary(aggregatedBookCitations)} (${multiRetrieval.totalPagesSearched} total pages searched).`;

  return {
    ...base,
    textbookId: aggregatedBookCitations[0]?.textbookId || primaryBook.id,
    textbookTitle: combinedTitle,
    sourceTextbooks,
    bookCitations: finalCoverage === 'none' ? [] : aggregatedBookCitations,
    coverage: finalCoverage,
    coverageNote,
    referencedPages:
      finalCoverage === 'none'
        ? []
        : Array.from(
            new Set(aggregatedBookCitations.flatMap((bc) => bc.pageNumbers))
          ).sort((a, b) => a - b),
    retrievedPassages: finalCoverage === 'none' ? [] : multiRetrieval.passages,
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

export function buildMultiBookOfflineFallbackGuide(
  selectedBooks: Array<
    Pick<MedicalTextbook, 'id' | 'title' | 'subject' | 'pageCount' | 'pages'>
  >,
  topic: string
): Omit<StudyGuide, 'id' | 'createdAt' | 'updatedAt' | 'answers'> {
  const cleanTopic = topic.trim();
  const primaryBook = selectedBooks[0] || {
    id: 'general-medical-knowledge',
    title: 'General Medical Knowledge & External Evidence',
    subject: 'Medical Sciences',
    pageCount: 0,
    pages: [],
  };
  const multiRetrieval = retrieveAcrossTextbooks(selectedBooks, cleanTopic, 8);
  const combinedTitle =
    selectedBooks.length === 0
      ? 'General Medical Knowledge & External Evidence'
      : selectedBooks.length === 1
        ? primaryBook.title
        : selectedBooks.map((b) => shortenBookTitle(b.title, 42)).join(' + ');

  const sourceTextbooks: SourceTextbookSummary[] = selectedBooks.map((b) => ({
    id: b.id,
    title: b.title,
    subject: b.subject,
    pageCount: b.pageCount,
  }));

  const canonical = canonicalizeMedicalTopic(cleanTopic);
  if (multiRetrieval.coverage === 'none' || multiRetrieval.passages.length === 0) {
    const fallbackSections: ExplanationSection[] = [
      {
        stepNumber: 1,
        stepPhase: 'Anatomy & Normal Physiology',
        heading: `01. Anatomical & Physiological Baseline in ${canonical.canonicalTitle}`,
        content: canonical.domainProfile.normalBaselineSummary,
        quickSummaryPoints: [canonical.domainProfile.normalBaselineSummary],
        pageNumbers: [],
        bookCitations: [],
        sourceBasis: 'general_medical_knowledge',
        keyTakeaway: canonical.domainProfile.normalBaselineSummary,
      },
      {
        stepNumber: 2,
        stepPhase: 'Pathophysiology & Mechanism',
        heading: `02. Pathophysiological Cascade of ${canonical.canonicalTitle}`,
        content: canonical.domainProfile.pathophysiologySummaryTemplate(canonical.canonicalTitle),
        quickSummaryPoints: [
          canonical.domainProfile.pathophysiologySummaryTemplate(canonical.canonicalTitle),
        ],
        pageNumbers: [],
        bookCitations: [],
        sourceBasis: 'general_medical_knowledge',
        keyTakeaway: canonical.domainProfile.pathophysiologySummaryTemplate(canonical.canonicalTitle),
      },
      {
        stepNumber: 3,
        stepPhase: 'Diagnosis & Differential',
        heading: `03. Diagnostic Evaluation & Differential Diagnosis of ${canonical.canonicalTitle}`,
        content: `${canonical.domainProfile.diagnosticGoldStandardTemplate(canonical.canonicalTitle)} ${canonical.domainProfile.differentialSummaryTemplate(canonical.canonicalTitle)}`,
        quickSummaryPoints: [
          canonical.domainProfile.diagnosticGoldStandardTemplate(canonical.canonicalTitle),
          canonical.domainProfile.differentialSummaryTemplate(canonical.canonicalTitle),
        ],
        pageNumbers: [],
        bookCitations: [],
        sourceBasis: 'general_medical_knowledge',
        keyTakeaway: canonical.domainProfile.diagnosticGoldStandardTemplate(canonical.canonicalTitle),
      },
      {
        stepNumber: 4,
        stepPhase: 'Pharmacology & Management',
        heading: `04. Stepwise Management & Pharmacotherapy of ${canonical.canonicalTitle}`,
        content: canonical.domainProfile
          .firstLineDrugRowsTemplate(canonical.canonicalTitle)
          .map(
            (d) =>
              `${d.drugClass} (${d.prototypeAgents}): ${d.mechanismOfAction} ${d.clinicalIndications}`
          )
          .join(' '),
        quickSummaryPoints: canonical.domainProfile
          .firstLineDrugRowsTemplate(canonical.canonicalTitle)
          .map((d) => `${d.drugClass}: ${d.prototypeAgents} — ${d.clinicalIndications}`)
          .slice(0, 3),
        pageNumbers: [],
        bookCitations: [],
        sourceBasis: 'general_medical_knowledge',
        keyTakeaway:
          canonical.domainProfile.firstLineDrugRowsTemplate(canonical.canonicalTitle)[0]
            ?.clinicalIndications ||
          `Stabilize acute physiology and initiate targeted therapy for ${canonical.canonicalTitle}.`,
      },
    ];

    const fallbackNotes: ClinicalNote[] = [
      {
        title: `Provenance Notice — ${canonical.canonicalTitle}`,
        category: 'Clinical Pearl',
        detail:
          selectedBooks.length === 0
            ? `No uploaded textbooks were selected. This blueprint for "${canonical.canonicalTitle}" uses General Medical Knowledge with zero fabricated book citations.`
            : `Searched all ${multiRetrieval.totalPagesSearched} pages across ${selectedBooks.length} selected textbook(s) with zero matches for "${canonical.canonicalTitle}". Zero textbook page citations are claimed.`,
        pageNumbers: [],
        bookCitations: [],
        sourceBasis: 'general_medical_knowledge',
      },
    ];

    return {
      canonicalTopicId: canonical.topicId,
      textbookId: primaryBook.id,
      textbookTitle: combinedTitle,
      sourceTextbooks,
      bookCitations: [],
      topic: canonical.canonicalTitle,
      summary:
        selectedBooks.length === 0
          ? `General Medical Knowledge blueprint for "${canonical.canonicalTitle}" (no uploaded textbooks selected; zero textbook citations claimed).`
          : `Searched all ${multiRetrieval.totalPagesSearched} indexed pages across ${selectedBooks.length} selected textbook(s) and found zero passages covering "${canonical.canonicalTitle}". Content below reflects General Medical Knowledge with zero fabricated citations.`,
      quickRevisionBullets: fallbackSections.map((s) => s.keyTakeaway),
      coverage: 'none',
      coverageNote: multiRetrieval.coverageReason,
      totalPagesSearched: multiRetrieval.totalPagesSearched,
      referencedPages: [],
      retrievedPassages: [],
      sections: fallbackSections,
      clinicalNotes: fallbackNotes,
      mcqs: [],
      mindMap: buildFallbackMindMapFromSections(
        canonical.canonicalTitle,
        fallbackSections,
        fallbackNotes
      ),
      flowcharts: buildFallbackFlowchartsFromSections(canonical.canonicalTitle, fallbackSections),
      anatomicalDiagram: buildFallbackAnatomicalDiagram(canonical.canonicalTitle, fallbackSections),
      flashcards: buildFallbackFlashcards(
        canonical.canonicalTitle,
        fallbackSections,
        fallbackNotes
      ),
      generatedOffline: true,
    };
  }

  const sections: ExplanationSection[] = multiRetrieval.passages.slice(0, 5).map((p, idx) => {
    const bookTitle = p.textbookTitle || primaryBook.title;
    const bookId = p.textbookId || primaryBook.id;
    const firstSentence =
      p.text.split(/(?<=[.?!])\s+/)[0]?.slice(0, 200) ||
      `Review ${shortenBookTitle(bookTitle)}, page ${p.pageNumber}.`;
    const cite: BookPageCitation = {
      textbookId: bookId,
      textbookTitle: bookTitle,
      pageNumbers: [p.pageNumber],
    };

    return {
      stepNumber: idx + 1,
      stepPhase: `${shortenBookTitle(bookTitle, 32)} · Page ${p.pageNumber}`,
      heading: `0${idx + 1}. ${p.chapterTitle || `Retrieved Excerpt (p. ${p.pageNumber})`}`,
      content: p.text,
      quickSummaryPoints: [firstSentence],
      pageNumbers: [p.pageNumber],
      bookCitations: [cite],
      sourceBasis: 'textbook',
      supportingQuote: firstSentence,
      keyTakeaway: firstSentence,
    };
  });

  const clinicalNotes: ClinicalNote[] = multiRetrieval.passages.slice(0, 3).map((p, idx) => ({
    title: `${shortenBookTitle(p.textbookTitle || primaryBook.title, 28)} (p. ${p.pageNumber})`,
    category: idx === 0 ? 'Management Protocol' : 'Clinical Pearl',
    detail: p.text.slice(0, 320) + (p.text.length > 320 ? '…' : ''),
    pageNumbers: [p.pageNumber],
    bookCitations: [
      {
        textbookId: p.textbookId || primaryBook.id,
        textbookTitle: p.textbookTitle || primaryBook.title,
        pageNumbers: [p.pageNumber],
      },
    ],
    sourceBasis: 'textbook',
    supportingQuote: p.text.slice(0, 160),
  }));

  const topP = multiRetrieval.passages[0];
  const topBookTitle = topP.textbookTitle || primaryBook.title;
  const mcqs: MCQItem[] = [
    {
      id: 'mcq-offline-multi-1',
      question: `Which verified textbook and page contains the primary retrieved passage for "${cleanTopic}"?`,
      options: [
        `${shortenBookTitle(topBookTitle, 40)} — Page ${topP.pageNumber}`,
        `${shortenBookTitle(topBookTitle, 40)} — Unmatched Page ${topP.pageNumber + 5}`,
        'External unindexed appendix',
        'Topic is absent from all selected textbooks',
      ],
      correctIndex: 0,
      explanation: `Retrieved directly from "${topBookTitle}", Page ${topP.pageNumber} (matched terms: ${topP.matchedTerms.join(', ')}).`,
      pageNumbers: [topP.pageNumber],
      bookCitations: [
        {
          textbookId: topP.textbookId || primaryBook.id,
          textbookTitle: topBookTitle,
          pageNumbers: [topP.pageNumber],
        },
      ],
      sourceBasis: 'textbook',
    },
  ];

  return {
    canonicalTopicId: canonical.topicId,
    textbookId: topP.textbookId || primaryBook.id,
    textbookTitle: combinedTitle,
    sourceTextbooks,
    bookCitations: multiRetrieval.bookCitations,
    topic: canonical.canonicalTitle,
    summary: `Offline multi-book synthesis for "${cleanTopic}" grounded in ${formatBookCitationsSummary(
      multiRetrieval.bookCitations
    )} (${multiRetrieval.totalPagesSearched} total pages searched).`,
    quickRevisionBullets: sections.map((s) => s.keyTakeaway),
    coverage: multiRetrieval.coverage,
    coverageNote: multiRetrieval.coverageReason,
    totalPagesSearched: multiRetrieval.totalPagesSearched,
    referencedPages: Array.from(
      new Set(multiRetrieval.bookCitations.flatMap((bc) => bc.pageNumbers))
    ).sort((a, b) => a - b),
    retrievedPassages: multiRetrieval.passages,
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

/**
 * Deterministically compiles an indexed textbook page/chapter into a structured StudyGuide
 * for direct Chapter PDF Study-Guide generation without inventing any unverified content.
 */
export function compileChapterToStudyGuide(
  book: MedicalTextbook,
  pageNumber: number
): StudyGuide {
  const clamped = Math.min(Math.max(1, pageNumber), Math.max(1, book.pageCount));
  const page = book.pages.find((p) => p.pageNumber === clamped) || {
    pageNumber: clamped,
    chapterTitle: `Page ${clamped}`,
    text: '',
  };

  const rawText = (page.text || '').trim();
  const isScannedPlaceholder =
    !rawText || rawText.toLowerCase().startsWith('(scanned visual content on page');

  const rawHeading = page.chapterTitle || `${book.title} — Page ${clamped}`;
  const cleanTopic = rawHeading.replace(/^Chapter\s+\d+\s*(\(Page\s*\d+\))?:\s*/i, '').trim() || rawHeading;

  const paragraphs = isScannedPlaceholder
    ? []
    : rawText
        .split(/\n\s*\n+/)
        .map((para) => para.trim())
        .filter((para) => para.length > 0 && para !== page.chapterTitle);

  const citation: BookPageCitation = {
    textbookId: book.id,
    textbookTitle: book.title,
    pageNumbers: [clamped],
  };

  const canonicalChapter = canonicalizeMedicalTopic(cleanTopic);
  if (paragraphs.length === 0) {
    return {
      id: `chapter-guide-${book.id}-p${clamped}`,
      canonicalTopicId: canonicalChapter.topicId,
      textbookId: book.id,
      textbookTitle: book.title,
      sourceTextbooks: [
        { id: book.id, title: book.title, subject: book.subject, pageCount: book.pageCount },
      ],
      bookCitations: [],
      topic: canonicalChapter.canonicalTitle,
      summary: `Page ${clamped} of "${book.title}" contains scanned/image-only content without embedded text passages.`,
      quickRevisionBullets: ['No machine-readable text found on this page.'],
      coverage: 'none',
      coverageNote: `Page ${clamped} of "${book.title}" has no embedded text layer.`,
      totalPagesSearched: book.pageCount,
      referencedPages: [],
      retrievedPassages: [],
      sections: [
        {
          stepNumber: 1,
          stepPhase: 'Chapter Inspection',
          heading: `01. ${rawHeading}`,
          content:
            'This page does not contain machine-readable text in the uploaded PDF. Upload a digital text PDF or study a text-indexed chapter.',
          pageNumbers: [],
          bookCitations: [],
          sourceBasis: 'general_medical_knowledge',
          keyTakeaway: 'No embedded text available on this scanned page.',
        },
      ],
      clinicalNotes: [],
      mcqs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      answers: {},
    };
  }

  const phaseLabels = [
    'Core Concepts & Mechanism',
    'Clinical Presentation & Criteria',
    'Diagnostic Workup & Therapeutics',
    'Complications & High-Yield Protocol',
  ];

  const sections: ExplanationSection[] = paragraphs.map((para, idx) => {
    const colonMatch = para.match(/^([A-Z][A-Za-z0-9\s/&(),+-]{3,68}):\s+([\s\S]+)$/);
    const subTitle = colonMatch
      ? colonMatch[1].trim()
      : `${phaseLabels[idx % phaseLabels.length]}`;
    const firstSentence =
      para.split(/(?<=[.?!])\s+/)[0]?.slice(0, 220) || para.slice(0, 180);

    return {
      stepNumber: idx + 1,
      stepPhase: `Verified Chapter Section · Page ${clamped}`,
      heading: `0${idx + 1}. ${subTitle}`,
      content: para,
      quickSummaryPoints: [firstSentence],
      pageNumbers: [clamped],
      bookCitations: [citation],
      sourceBasis: 'textbook',
      supportingQuote: firstSentence,
      keyTakeaway: firstSentence,
    };
  });

  const clinicalNotes: ClinicalNote[] = sections.slice(0, 3).map((sec, idx) => ({
    title: sec.heading.replace(/^0?\d+\.\s*/, ''),
    category: idx === 0 ? 'Clinical Pearl' : idx === 1 ? 'Management Protocol' : 'Red Flag',
    detail: sec.keyTakeaway,
    pageNumbers: [clamped],
    bookCitations: [citation],
    sourceBasis: 'textbook',
    supportingQuote: sec.supportingQuote,
  }));

  const keyFact = sections[sections.length - 1]?.keyTakeaway || sections[0].keyTakeaway;
  const mcqs: MCQItem[] = [
    {
      id: `chap-mcq-${book.id}-${clamped}-1`,
      question: `According to "${book.title}" (Page ${clamped}, ${cleanTopic}), which statement is directly supported by the chapter text?`,
      options: [
        keyFact.slice(0, 165),
        'Routine high-dose systemic corticosteroids are universally first-line regardless of etiology',
        'Diagnostic evaluation should be deferred until 72 hours after empiric surgical intervention',
        'No laboratory or hemodynamic monitoring is required during acute therapy',
      ],
      correctIndex: 0,
      explanation: `Directly verified in "${book.title}", Page ${clamped}: "${keyFact}"`,
      pageNumbers: [clamped],
      bookCitations: [citation],
      sourceBasis: 'textbook',
    },
  ];

  const now = new Date().toISOString();
  return {
    id: `chapter-guide-${book.id}-p${clamped}`,
    canonicalTopicId: canonicalChapter.topicId,
    textbookId: book.id,
    textbookTitle: book.title,
    sourceTextbooks: [
      { id: book.id, title: book.title, subject: book.subject, pageCount: book.pageCount },
    ],
    bookCitations: [citation],
    topic: canonicalChapter.canonicalTitle,
    summary: sections.map((s) => s.keyTakeaway).slice(0, 2).join(' '),
    quickRevisionBullets: sections.map((s) => `${s.keyTakeaway} (${shortenBookTitle(book.title, 28)}, p. ${clamped})`),
    coverage: 'strong',
    coverageNote: `Compiled directly from "${book.title}" (${book.subject || 'Medical Reference'}), Page ${clamped}.`,
    totalPagesSearched: book.pageCount,
    referencedPages: [clamped],
    retrievedPassages: [
      {
        passageId: `${book.id}-p${clamped}`,
        pageNumber: clamped,
        chapterTitle: page.chapterTitle,
        text: rawText,
        textbookId: book.id,
        textbookTitle: book.title,
        citationTag: `B1:${clamped}`,
        score: 30,
        matchedTerms: [cleanTopic.toLowerCase()],
      },
    ],
    sections,
    clinicalNotes,
    mcqs,
    mindMap: buildFallbackMindMapFromSections(cleanTopic, sections, clinicalNotes),
    flowcharts: buildFallbackFlowchartsFromSections(cleanTopic, sections),
    anatomicalDiagram: buildFallbackAnatomicalDiagram(cleanTopic, sections),
    flashcards: buildFallbackFlashcards(cleanTopic, sections, clinicalNotes),
    createdAt: now,
    updatedAt: now,
    answers: {},
  };
}
