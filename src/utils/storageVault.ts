import type { MedicalTextbook, StudyGuide, VaultPayload } from '../types/medical';
import { INITIAL_SAVED_GUIDE, SAMPLE_COMPENDIUM_BOOK } from '../data/sampleCompendium';
import { SAMPLE_PHARMACOLOGY_BOOK } from '../data/samplePharmacologyBook';
import {
  buildFallbackAnatomicalDiagram,
  buildFallbackFlashcards,
  buildFallbackFlowchartsFromSections,
  buildFallbackMindMapFromSections,
  chunkPagesIntoPassages,
} from './textbookEngine';

const DB_NAME = 'medatlas_tutor_db_v1';
const DB_VERSION = 1;
const STORE_TEXTBOOKS = 'textbooks';
const STORE_GUIDES = 'study_guides';
const WORKSPACE_KEY_STORAGE = 'medatlas_cloud_vault_key_v1';
const LAST_SYNC_STORAGE = 'medatlas_last_synced_at_v1';
const SEEDED_FLAG_STORAGE = 'medatlas_seeded_v2';
const SEEDED_MULTIBOOK_STORAGE = 'medatlas_seeded_multibook_v3';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TEXTBOOKS)) {
        db.createObjectStore(STORE_TEXTBOOKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_GUIDES)) {
        db.createObjectStore(STORE_GUIDES, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error);
  });
}

async function putInStore<T>(storeName: string, value: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName: string, id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function normalizeStoredBook(book: MedicalTextbook): MedicalTextbook {
  if (
    book.id === SAMPLE_COMPENDIUM_BOOK.id &&
    (book.pageCount < SAMPLE_COMPENDIUM_BOOK.pageCount ||
      book.pages.length < SAMPLE_COMPENDIUM_BOOK.pages.length)
  ) {
    return SAMPLE_COMPENDIUM_BOOK;
  }
  if (
    book.id === SAMPLE_PHARMACOLOGY_BOOK.id &&
    (book.pageCount < SAMPLE_PHARMACOLOGY_BOOK.pageCount ||
      book.pages.length < SAMPLE_PHARMACOLOGY_BOOK.pages.length)
  ) {
    return SAMPLE_PHARMACOLOGY_BOOK;
  }
  const actualPages = Array.isArray(book.pages) ? book.pages : [];
  const computedPageCount = Math.max(book.pageCount || 0, actualPages.length);
  const passageCount =
    typeof book.passageCount === 'number' && book.passageCount > 0
      ? book.passageCount
      : chunkPagesIntoPassages(actualPages).length;

  return {
    ...book,
    subject:
      book.subject && book.subject.trim()
        ? book.subject.trim()
        : book.id === SAMPLE_PHARMACOLOGY_BOOK.id
          ? SAMPLE_PHARMACOLOGY_BOOK.subject
          : 'Internal Medicine',
    pageCount: computedPageCount,
    passageCount,
    pages: actualPages,
  };
}

export function normalizeStoredGuide(guide: StudyGuide): StudyGuide {
  if (
    guide.id === INITIAL_SAVED_GUIDE.id &&
    (!guide.coverage || !guide.mindMap || !guide.bookCitations)
  ) {
    return {
      ...INITIAL_SAVED_GUIDE,
      answers: guide.answers || {},
      flashcardMastery: guide.flashcardMastery || {},
      externalEvidence: guide.externalEvidence,
    };
  }
  const referencedPages = Array.isArray(guide.referencedPages) ? guide.referencedPages : [];
  const hasPages = referencedPages.length > 0;
  const coverage = guide.coverage || (hasPages ? 'strong' : 'none');

  const normalizedSections = (guide.sections || []).map((s, idx) => ({
    ...s,
    stepNumber: s.stepNumber || idx + 1,
    pageNumbers: Array.isArray(s.pageNumbers) ? s.pageNumbers : [],
    sourceBasis:
      s.sourceBasis ||
      (Array.isArray(s.pageNumbers) && s.pageNumbers.length > 0
        ? 'textbook'
        : 'general_medical_knowledge'),
  }));

  const normalizedNotes = (guide.clinicalNotes || []).map((n) => ({
    ...n,
    pageNumbers: Array.isArray(n.pageNumbers) ? n.pageNumbers : [],
    sourceBasis:
      n.sourceBasis ||
      (Array.isArray(n.pageNumbers) && n.pageNumbers.length > 0
        ? 'textbook'
        : 'general_medical_knowledge'),
  }));

  const normalizedMcqs = (guide.mcqs || []).map((m) => ({
    ...m,
    pageNumbers: Array.isArray(m.pageNumbers) ? m.pageNumbers : [],
    sourceBasis:
      m.sourceBasis ||
      (Array.isArray(m.pageNumbers) && m.pageNumbers.length > 0
        ? 'textbook'
        : 'general_medical_knowledge'),
  }));

  return {
    ...guide,
    coverage,
    coverageNote:
      guide.coverageNote ||
      (hasPages
        ? `Supported by cited textbook pages (${referencedPages.map((p) => `p. ${p}`).join(', ')}).`
        : 'No matching passages were found in the uploaded textbook; content reflects general medical knowledge.'),
    totalPagesSearched: guide.totalPagesSearched || 24,
    referencedPages,
    retrievedPassages: Array.isArray(guide.retrievedPassages) ? guide.retrievedPassages : [],
    sections: normalizedSections,
    clinicalNotes: normalizedNotes,
    mcqs: normalizedMcqs,
    quickRevisionBullets:
      Array.isArray(guide.quickRevisionBullets) && guide.quickRevisionBullets.length > 0
        ? guide.quickRevisionBullets
        : normalizedSections.map((s) => s.keyTakeaway).filter(Boolean),
    mindMap:
      guide.mindMap ||
      (normalizedSections.length > 0
        ? buildFallbackMindMapFromSections(guide.topic, normalizedSections, normalizedNotes)
        : undefined),
    flowcharts:
      Array.isArray(guide.flowcharts) && guide.flowcharts.length > 0
        ? guide.flowcharts
        : normalizedSections.length > 0
          ? buildFallbackFlowchartsFromSections(guide.topic, normalizedSections)
          : [],
    anatomicalDiagram:
      guide.anatomicalDiagram ||
      (normalizedSections.length > 0
        ? buildFallbackAnatomicalDiagram(guide.topic, normalizedSections)
        : undefined),
    flashcards:
      Array.isArray(guide.flashcards) && guide.flashcards.length > 0
        ? guide.flashcards
        : normalizedSections.length > 0
          ? buildFallbackFlashcards(guide.topic, normalizedSections, normalizedNotes)
          : [],
    flashcardMastery: guide.flashcardMastery || {},
  };
}

export function generateRandomWorkspaceKey(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += alphabet[bytes[i] % alphabet.length];
    part2 += alphabet[bytes[i + 4] % alphabet.length];
  }
  return `MED-${part1}-${part2}`;
}

export function getOrCreateWorkspaceKey(): string {
  const existing = localStorage.getItem(WORKSPACE_KEY_STORAGE);
  if (existing && existing.length >= 8) {
    return existing;
  }
  const fresh = generateRandomWorkspaceKey();
  localStorage.setItem(WORKSPACE_KEY_STORAGE, fresh);
  return fresh;
}

export function setWorkspaceKey(newKey: string): string {
  const normalized = newKey.trim().toUpperCase();
  localStorage.setItem(WORKSPACE_KEY_STORAGE, normalized);
  return normalized;
}

export function getLastSyncedAt(): string | null {
  return localStorage.getItem(LAST_SYNC_STORAGE);
}

export async function loadOfflineLibrary(): Promise<{
  textbooks: MedicalTextbook[];
  studyGuides: StudyGuide[];
}> {
  const rawBooks = await getAllFromStore<MedicalTextbook>(STORE_TEXTBOOKS);
  const rawGuides = await getAllFromStore<StudyGuide>(STORE_GUIDES);

  let textbooks = rawBooks.map(normalizeStoredBook);
  let studyGuides = rawGuides.map(normalizeStoredGuide);

  const alreadySeeded = localStorage.getItem(SEEDED_FLAG_STORAGE) === '1';
  const alreadySeededMulti = localStorage.getItem(SEEDED_MULTIBOOK_STORAGE) === '1';

  if (!alreadySeeded && textbooks.length === 0) {
    await putInStore(STORE_TEXTBOOKS, SAMPLE_COMPENDIUM_BOOK);
    await putInStore(STORE_TEXTBOOKS, SAMPLE_PHARMACOLOGY_BOOK);
    await putInStore(STORE_GUIDES, INITIAL_SAVED_GUIDE);
    localStorage.setItem(SEEDED_FLAG_STORAGE, '1');
    localStorage.setItem(SEEDED_MULTIBOOK_STORAGE, '1');
    textbooks = [SAMPLE_PHARMACOLOGY_BOOK, SAMPLE_COMPENDIUM_BOOK];
    studyGuides = [INITIAL_SAVED_GUIDE];
  } else {
    if (!alreadySeededMulti && !textbooks.some((b) => b.id === SAMPLE_PHARMACOLOGY_BOOK.id)) {
      await putInStore(STORE_TEXTBOOKS, SAMPLE_PHARMACOLOGY_BOOK);
      textbooks = [SAMPLE_PHARMACOLOGY_BOOK, ...textbooks];
      localStorage.setItem(SEEDED_MULTIBOOK_STORAGE, '1');
    }
    const upgradedSample = textbooks.find((b) => b.id === SAMPLE_COMPENDIUM_BOOK.id);
    if (upgradedSample) {
      await putInStore(STORE_TEXTBOOKS, upgradedSample);
    }
    const upgradedGuide = studyGuides.find((g) => g.id === INITIAL_SAVED_GUIDE.id);
    if (upgradedGuide) {
      await putInStore(STORE_GUIDES, upgradedGuide);
    }
    localStorage.setItem(SEEDED_FLAG_STORAGE, '1');
    localStorage.setItem(SEEDED_MULTIBOOK_STORAGE, '1');
  }

  textbooks.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  studyGuides.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { textbooks, studyGuides };
}

export async function saveTextbookOffline(book: MedicalTextbook): Promise<void> {
  await putInStore(STORE_TEXTBOOKS, normalizeStoredBook(book));
}

export async function removeTextbookOffline(id: string): Promise<void> {
  await deleteFromStore(STORE_TEXTBOOKS, id);
}

export async function saveStudyGuideOffline(guide: StudyGuide): Promise<void> {
  await putInStore(STORE_GUIDES, normalizeStoredGuide(guide));
}

export async function removeStudyGuideOffline(id: string): Promise<void> {
  await deleteFromStore(STORE_GUIDES, id);
}

const MAX_CLOUD_BOOK_TEXT_BYTES = 18 * 1024 * 1024;

export async function pushLibraryToCloud(
  workspaceKey: string,
  textbooks: MedicalTextbook[],
  studyGuides: StudyGuide[]
): Promise<{ updatedAt: string }> {
  // Strip raw PDF binary base64; keep full indexed page text unless an individual textbook
  // exceeds 18 MB of raw text (in which case full pages stay in local IndexedDB).
  const sanitizedBooks: Omit<MedicalTextbook, 'pdfBase64'>[] = textbooks.map(
    ({ pdfBase64: _unused, ...rest }) => {
      const normalized = normalizeStoredBook(rest);
      const approxChars = normalized.pages.reduce((sum, p) => sum + (p.text?.length || 0), 0);
      if (approxChars > MAX_CLOUD_BOOK_TEXT_BYTES) {
        return {
          ...normalized,
          pages: [],
        };
      }
      return normalized;
    }
  );

  const payload: VaultPayload = {
    textbooks: sanitizedBooks,
    studyGuides: studyGuides.map(normalizeStoredGuide),
    updatedAt: new Date().toISOString(),
  };

  const response = await fetch('/api/vault/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceKey, payload }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || 'Failed to sync library to cloud vault.');
  }

  const data = (await response.json()) as { updatedAt: string };
  localStorage.setItem(LAST_SYNC_STORAGE, data.updatedAt);
  return data;
}

export async function pullLibraryFromCloud(workspaceKey: string): Promise<{
  found: boolean;
  textbooks: MedicalTextbook[];
  studyGuides: StudyGuide[];
  updatedAt?: string;
}> {
  const response = await fetch('/api/vault/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceKey }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || 'Failed to pull library from cloud vault.');
  }

  const data = (await response.json()) as {
    found: boolean;
    updatedAt?: string;
    payload?: VaultPayload | null;
  };

  if (!data.found || !data.payload) {
    return { found: false, textbooks: [], studyGuides: [] };
  }

  const local = await loadOfflineLibrary();
  const bookMap = new Map<string, MedicalTextbook>();
  for (const b of local.textbooks) bookMap.set(b.id, b);

  for (const rawCloudBook of data.payload.textbooks || []) {
    const cloudBook = normalizeStoredBook(rawCloudBook as MedicalTextbook);
    const existing = bookMap.get(cloudBook.id);
    // Always preserve whichever record has the fuller set of indexed pages
    const bestPages =
      existing && existing.pages.length >= cloudBook.pages.length
        ? existing.pages
        : cloudBook.pages;
    bookMap.set(
      cloudBook.id,
      normalizeStoredBook({
        ...cloudBook,
        pages: bestPages,
        pageCount: Math.max(cloudBook.pageCount, bestPages.length),
        pdfBase64: existing?.pdfBase64,
      })
    );
  }

  const guideMap = new Map<string, StudyGuide>();
  for (const g of local.studyGuides) guideMap.set(g.id, g);
  for (const rawCloudGuide of data.payload.studyGuides || []) {
    const cloudGuide = normalizeStoredGuide(rawCloudGuide);
    const existing = guideMap.get(cloudGuide.id);
    if (!existing || cloudGuide.updatedAt >= existing.updatedAt) {
      guideMap.set(cloudGuide.id, cloudGuide);
    }
  }

  const mergedBooks = Array.from(bookMap.values()).sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt)
  );
  const mergedGuides = Array.from(guideMap.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );

  for (const b of mergedBooks) await saveTextbookOffline(b);
  for (const g of mergedGuides) await saveStudyGuideOffline(g);

  if (data.updatedAt) {
    localStorage.setItem(LAST_SYNC_STORAGE, data.updatedAt);
  }

  return {
    found: true,
    textbooks: mergedBooks,
    studyGuides: mergedGuides,
    updatedAt: data.updatedAt,
  };
}
