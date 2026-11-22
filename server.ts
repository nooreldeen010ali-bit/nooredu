import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import express from 'express';
import { GoogleGenAI, Modality, ThinkingLevel, Type } from '@google/genai';
import type { Mp4AudioValidationReport } from './src/types/medical';
import {
  analyzePcmSignal,
  decodeRawPcm16ToMono,
  detectAudioContainerFormat,
  normalizeAndTrimScenePcm,
  parseStrictRiffWav,
  prepareTextForMedicalTts,
  resampleMonoPcm16,
} from './src/utils/audioValidation';
import {
  classifyLectureTopicCategory,
  createMono16WavBytes,
  selectAdaptiveLectureStages,
} from './src/utils/lectureStudioEngine';
import { canonicalizeMedicalTopic } from './src/utils/topicCanonicalizer';
import { buildExternalMedicalLinks, inferAnatomicalTemplate } from './src/utils/visualLayout';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.NGINX_PORT
  ? Number(process.env.DEFAULT_APP_PORT || 3000)
  : Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, '.data');
const VAULT_FILE = path.join(DATA_DIR, 'encrypted-cloud-vaults.json');
const SERVER_PEPPER = process.env.VAULT_PEPPER || 'medatlas-cloud-vault-v1-salt';

interface EncryptedRecord {
  iv: string;
  authTag: string;
  ciphertext: string;
  updatedAt: string;
}

type VaultStore = Record<string, EncryptedRecord>;

async function readVaultStore(): Promise<VaultStore> {
  try {
    const raw = await fs.readFile(VAULT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as VaultStore) : {};
  } catch {
    return {};
  }
}

async function writeVaultStore(store: VaultStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(VAULT_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function getVaultId(workspaceKey: string): string {
  return crypto
    .createHash('sha256')
    .update(`vault-id:${workspaceKey.trim().toUpperCase()}:${SERVER_PEPPER}`)
    .digest('hex');
}

function deriveEncryptionKey(workspaceKey: string): Buffer {
  return crypto.scryptSync(
    workspaceKey.trim().toUpperCase(),
    `aes-salt:${SERVER_PEPPER}`,
    32
  );
}

function encryptVaultPayload(workspaceKey: string, payload: unknown): EncryptedRecord {
  const key = deriveEncryptionKey(workspaceKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    updatedAt: new Date().toISOString(),
  };
}

function decryptVaultPayload(workspaceKey: string, record: EncryptedRecord): unknown {
  const key = deriveEncryptionKey(workspaceKey);
  const iv = Buffer.from(record.iv, 'base64');
  const authTag = Buffer.from(record.authTag, 'base64');
  const ciphertext = Buffer.from(record.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 2,
  baseDelayMs = 500
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(9_000),
    });
    if (response.ok) {
      return response;
    }
    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < maxRetries
    ) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay =
        !Number.isNaN(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `HTTP ${response.status} (${response.statusText}) from ${url}: ${errorBody.slice(0, 200)}`
    );
  }
  throw new Error(`Exhausted retries for ${url}`);
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

interface ServerExternalEvidenceItem {
  id: string;
  title: string;
  sourceOrgOrJournal: string;
  publishedDate: string;
  url: string;
  evidenceType:
    | 'Clinical Practice Guideline'
    | 'Systematic Review / Meta-Analysis'
    | 'Randomized Controlled Trial'
    | 'Government Health Agency'
    | 'Clinical Trial (Phase 3/4)'
    | 'Peer-Reviewed Study';
  database: 'PubMed' | 'NIH MedlinePlus' | 'ClinicalTrials.gov';
  summarySnippet: string;
  authors?: string;
  pmid?: string;
  nctId?: string;
  doi?: string;
}

async function searchPubMedEvidence(topic: string): Promise<ServerExternalEvidenceItem[]> {
  const ncbiKey = (process.env.NCBI_API_KEY || '').trim();
  const politeEmail = encodeURIComponent(
    (process.env.USER_EMAIL || 'medatlas@example.com').trim()
  );
  const keyParam = ncbiKey ? `&api_key=${encodeURIComponent(ncbiKey)}` : '';
  const baseParams = `db=pubmed&retmode=json&tool=AIStudioBuild&email=${politeEmail}${keyParam}`;

  const guidelineTerm = `${topic} AND (Practice Guideline[pt] OR Guideline[pt] OR Consensus Development Conference[pt] OR Systematic Review[pt] OR Meta-Analysis[pt] OR Randomized Controlled Trial[pt])`;
  const searchUrl1 = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${baseParams}&term=${encodeURIComponent(
    guidelineTerm
  )}&retmax=6&sort=pub_date`;

  let pmids: string[] = [];
  try {
    const res1 = await fetchWithRetry(searchUrl1);
    const json1 = (await res1.json()) as { esearchresult?: { idlist?: string[] } };
    pmids = Array.isArray(json1.esearchresult?.idlist) ? json1.esearchresult!.idlist! : [];
  } catch {
    pmids = [];
  }

  if (pmids.length < 3) {
    try {
      const fallbackUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${baseParams}&term=${encodeURIComponent(
        topic
      )}&retmax=6&sort=relevance`;
      const res2 = await fetchWithRetry(fallbackUrl);
      const json2 = (await res2.json()) as { esearchresult?: { idlist?: string[] } };
      const extra = Array.isArray(json2.esearchresult?.idlist)
        ? json2.esearchresult!.idlist!
        : [];
      pmids = Array.from(new Set([...pmids, ...extra])).slice(0, 6);
    } catch {
      // Preserve any initial pmids
    }
  }

  if (pmids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${baseParams}&id=${pmids.join(
    ','
  )}`;
  const sumRes = await fetchWithRetry(summaryUrl);
  const sumJson = (await sumRes.json()) as {
    result?: Record<
      string,
      {
        uid?: string;
        title?: string;
        source?: string;
        fulljournalname?: string;
        pubdate?: string;
        pubtype?: string[];
        authors?: Array<{ name?: string }>;
        articleids?: Array<{ idtype?: string; value?: string }>;
      }
    > & { uids?: string[] };
  };

  const uids = Array.isArray(sumJson.result?.uids) ? sumJson.result!.uids! : pmids;
  const items: ServerExternalEvidenceItem[] = [];

  for (const uid of uids) {
    const doc = sumJson.result?.[uid];
    if (!doc || !doc.title) continue;

    const pubTypes = (Array.isArray(doc.pubtype) ? doc.pubtype : []).map((t) =>
      String(t).toLowerCase()
    );
    let evidenceType: ServerExternalEvidenceItem['evidenceType'] = 'Peer-Reviewed Study';
    if (pubTypes.some((t) => t.includes('guideline') || t.includes('consensus'))) {
      evidenceType = 'Clinical Practice Guideline';
    } else if (
      pubTypes.some((t) => t.includes('systematic review') || t.includes('meta-analysis'))
    ) {
      evidenceType = 'Systematic Review / Meta-Analysis';
    } else if (pubTypes.some((t) => t.includes('randomized') || t.includes('clinical trial'))) {
      evidenceType = 'Randomized Controlled Trial';
    }

    const doiObj = Array.isArray(doc.articleids)
      ? doc.articleids.find((a) => a.idtype === 'doi')
      : undefined;
    const authorNames = Array.isArray(doc.authors)
      ? doc.authors
          .slice(0, 3)
          .map((a) => a.name)
          .filter(Boolean)
          .join(', ')
      : '';

    const cleanTitle = String(doc.title).replace(/\.$/, '').trim();
    const journal = String(doc.fulljournalname || doc.source || 'PubMed Indexed Journal').trim();
    const pubDate = String(doc.pubdate || 'Recent').trim();

    items.push({
      id: `pubmed-${uid}`,
      title: cleanTitle,
      sourceOrgOrJournal: journal,
      publishedDate: pubDate,
      url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
      evidenceType,
      database: 'PubMed',
      summarySnippet: `${evidenceType} indexed in MEDLINE/PubMed${
        authorNames ? ` · Authors: ${authorNames}${doc.authors && doc.authors.length > 3 ? ' et al.' : ''}` : ''
      } (PMID ${uid}).`,
      authors: authorNames || undefined,
      pmid: uid,
      doi: doiObj?.value || undefined,
    });
  }

  return items;
}

async function searchMedlinePlusAgencyTopics(
  topic: string
): Promise<ServerExternalEvidenceItem[]> {
  const url = `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(
    topic
  )}&retmax=3`;
  const res = await fetchWithRetry(url);
  const xml = await res.text();

  const docRegex = /<document\s+[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/document>/gi;
  const items: ServerExternalEvidenceItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = docRegex.exec(xml)) !== null && items.length < 3) {
    const docUrl = match[1];
    const body = match[2];

    const extractField = (name: string): string => {
      const fieldMatch = new RegExp(
        `<content\\s+name="${name}"[^>]*>([\\s\\S]*?)<\\/content>`,
        'i'
      ).exec(body);
      return fieldMatch ? decodeXmlEntities(fieldMatch[1]) : '';
    };

    const title = extractField('title');
    if (!title) continue;
    const org =
      extractField('organizationName') ||
      'U.S. National Library of Medicine (NIH MedlinePlus)';
    const snippet =
      extractField('FullSummary') ||
      extractField('snippet') ||
      'Official U.S. government clinical health topic summary from NIH / NLM.';

    items.push({
      id: `medlineplus-${items.length}-${Buffer.from(docUrl).toString('base64').slice(0, 10)}`,
      title,
      sourceOrgOrJournal: org,
      publishedDate: 'Current NIH Guidance',
      url: docUrl,
      evidenceType: 'Government Health Agency',
      database: 'NIH MedlinePlus',
      summarySnippet: snippet.length > 260 ? `${snippet.slice(0, 257)}...` : snippet,
    });
  }

  return items;
}

async function searchClinicalTrialsEvidence(
  topic: string
): Promise<ServerExternalEvidenceItem[]> {
  const url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(
    topic
  )}&filter.advanced=${encodeURIComponent(
    'AREA[Phase](PHASE3 OR PHASE4)'
  )}&sort=LastUpdatePostDate:desc&pageSize=3&fields=NCTId,BriefTitle,OverallStatus,Phase,LastUpdatePostDateStruct,LeadSponsorName,BriefSummary`;

  const res = await fetchWithRetry(url);
  const json = (await res.json()) as {
    studies?: Array<{
      protocolSection?: {
        identificationModule?: { nctId?: string; briefTitle?: string };
        statusModule?: {
          overallStatus?: string;
          lastUpdatePostDateStruct?: { date?: string };
        };
        designModule?: { phases?: string[] };
        sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
        descriptionModule?: { briefSummary?: string };
      };
    }>;
  };

  const studies = Array.isArray(json.studies) ? json.studies : [];
  return studies
    .map((study) => {
      const p = study.protocolSection;
      const nctId = p?.identificationModule?.nctId;
      const title = p?.identificationModule?.briefTitle;
      if (!nctId || !title) return null;

      const sponsor =
        p?.sponsorCollaboratorsModule?.leadSponsor?.name || 'ClinicalTrials.gov Registry';
      const updated = p?.statusModule?.lastUpdatePostDateStruct?.date || 'Recent';
      const status = String(p?.statusModule?.overallStatus || '').replace(/_/g, ' ');
      const phases = (p?.designModule?.phases || []).join('/');
      const rawSummary = String(p?.descriptionModule?.briefSummary || '').replace(/\s+/g, ' ').trim();
      const summary = rawSummary
        ? `${status ? `[${status}${phases ? ` · ${phases}` : ''}] ` : ''}${
            rawSummary.length > 220 ? `${rawSummary.slice(0, 217)}...` : rawSummary
          }`
        : `Registered interventional clinical study (${nctId}).`;

      return {
        id: `ctgov-${nctId}`,
        title,
        sourceOrgOrJournal: sponsor,
        publishedDate: updated,
        url: `https://clinicaltrials.gov/study/${nctId}`,
        evidenceType: 'Clinical Trial (Phase 3/4)' as const,
        database: 'ClinicalTrials.gov' as const,
        summarySnippet: summary,
        nctId,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

// Caching recent external evidence lookups for 5 minutes to respect NCBI rate limits
const evidenceCache = new Map<
  string,
  { expiresAt: number; payload: Record<string, unknown> }
>();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      capabilities: {
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        ncbiApiKeyConfigured: Boolean(process.env.NCBI_API_KEY),
        upToDateAuthorizedApi: false,
      },
    });
  });

  // Encrypted Cloud Storage Push/Sync Endpoint
  app.post('/api/vault/sync', async (req, res) => {
    try {
      const workspaceKey = String(req.body?.workspaceKey || '').trim().toUpperCase();
      const payload = req.body?.payload;

      if (!workspaceKey || workspaceKey.length < 8 || workspaceKey.length > 64) {
        res.status(400).json({ error: 'Invalid Cloud Vault Key format.' });
        return;
      }
      if (!payload || typeof payload !== 'object') {
        res.status(400).json({ error: 'Missing vault payload.' });
        return;
      }

      const vaultId = getVaultId(workspaceKey);
      const store = await readVaultStore();
      const encrypted = encryptVaultPayload(workspaceKey, payload);
      store[vaultId] = encrypted;
      await writeVaultStore(store);

      res.json({
        synced: true,
        updatedAt: encrypted.updatedAt,
        encryption: 'AES-256-GCM',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud vault sync failed.';
      res.status(500).json({ error: message });
    }
  });

  // Encrypted Cloud Storage Pull Endpoint
  app.post('/api/vault/pull', async (req, res) => {
    try {
      const workspaceKey = String(req.body?.workspaceKey || '').trim().toUpperCase();
      if (!workspaceKey || workspaceKey.length < 8 || workspaceKey.length > 64) {
        res.status(400).json({ error: 'Invalid Cloud Vault Key format.' });
        return;
      }

      const vaultId = getVaultId(workspaceKey);
      const store = await readVaultStore();
      const record = store[vaultId];

      if (!record) {
        res.json({ found: false, payload: null });
        return;
      }

      const decrypted = decryptVaultPayload(workspaceKey, record);
      res.json({
        found: true,
        updatedAt: record.updatedAt,
        payload: decrypted,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to decrypt cloud vault.';
      res.status(500).json({ error: message });
    }
  });

  // Authorized External Medical Evidence Search (PubMed, NIH MedlinePlus, ClinicalTrials.gov)
  app.get('/api/evidence/search', async (req, res) => {
    try {
      const query = String(req.query.topic || req.query.q || '').trim();
      if (!query || query.length < 2) {
        res.status(400).json({ error: 'Provide a valid medical topic query.' });
        return;
      }

      const cacheKey = query.toLowerCase();
      const cached = evidenceCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.payload);
        return;
      }

      const [pubMedResult, medlineResult, trialsResult] = await Promise.allSettled([
        searchPubMedEvidence(query),
        searchMedlinePlusAgencyTopics(query),
        searchClinicalTrialsEvidence(query),
      ]);

      const items: ServerExternalEvidenceItem[] = [
        ...(pubMedResult.status === 'fulfilled' ? pubMedResult.value : []),
        ...(medlineResult.status === 'fulfilled' ? medlineResult.value : []),
        ...(trialsResult.status === 'fulfilled' ? trialsResult.value : []),
      ];

      const payload = {
        query,
        fetchedAt: new Date().toISOString(),
        ncbiApiKeyConfigured: Boolean(process.env.NCBI_API_KEY),
        items,
        externalPortals: buildExternalMedicalLinks(query),
      };

      evidenceCache.set(cacheKey, {
        expiresAt: Date.now() + 5 * 60_000,
        payload,
      });

      res.json(payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to query external medical sources.';
      res.status(500).json({ error: message });
    }
  });

  // Interactive Step-by-Step, Visual & Bilingual Medical Textbook AI Tutor Endpoint (@google/genai)
  app.post('/api/tutor/explain', async (req, res) => {
    try {
      const topic = String(req.body?.topic || '').trim();
      const textbookTitle = String(
        req.body?.textbookTitle || 'General Medical Knowledge'
      ).trim();
      const booksMeta: Array<{
        bookKey: string;
        id: string;
        title: string;
        subject?: string;
        pageCount: number;
      }> = Array.isArray(req.body?.books) ? req.body.books : [];

      const rawPageCount = Number(req.body?.pageCount);
      const hasAnyTextbook =
        booksMeta.length > 0 ||
        (Number.isFinite(rawPageCount) && rawPageCount > 0) ||
        Boolean(req.body?.pdfBase64);
      const pageCount = hasAnyTextbook ? Math.max(1, rawPageCount || 1) : 0;
      const clientCoverage = hasAnyTextbook ? String(req.body?.coverage || 'none') : 'none';

      const passages: Array<{
        passageId: string;
        pageNumber: number;
        chapterTitle?: string;
        textbookId?: string;
        textbookTitle?: string;
        citationTag?: string;
        text: string;
      }> = Array.isArray(req.body?.passages) ? req.body.passages : [];

      const pdfBase64 =
        typeof req.body?.pdfBase64 === 'string' && req.body.pdfBase64.length > 0
          ? req.body.pdfBase64
          : null;

      if (!topic || topic.length < 2) {
        res.status(400).json({ error: 'Please provide a valid medical topic.' });
        return;
      }

      const ai = getGeminiClient();
      const canonicalTopic = canonicalizeMedicalTopic(topic);
      const suggestedSystemTemplate = inferAnatomicalTemplate(canonicalTopic.canonicalTitle);

      const promptParts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (pdfBase64 && passages.length === 0) {
        promptParts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64,
          },
        });
      }

      const allowedPages = Array.from(
        new Set(passages.map((p) => Number(p.pageNumber)).filter((n) => n >= 1))
      ).sort((a, b) => a - b);

      const allowedCitationTags = Array.from(
        new Set(
          passages
            .map((p) => String(p.citationTag || '').trim())
            .filter((tag) => tag.length > 0)
        )
      );

      const booksHeaderBlock = !hasAnyTextbook
        ? '- (No uploaded textbooks selected — General Medical Topic Mode)'
        : booksMeta.length > 0
          ? booksMeta
              .map(
                (b) =>
                  `- [${b.bookKey}] "${b.title}" (${b.subject || 'Medicine'}, ${b.pageCount} indexed pages)`
              )
              .join('\n')
          : `- [B1] "${textbookTitle}" (${pageCount} indexed pages)`;

      const formattedPassages = passages
        .slice(0, 12)
        .map(
          (p) =>
            `=== [PASSAGE ${p.passageId} | CITATION_TAG "${p.citationTag || `B1:${p.pageNumber}`}" | BOOK "${
              p.textbookTitle || textbookTitle
            }" | EXACT PAGE ${p.pageNumber}] ${
              p.chapterTitle ? `(${p.chapterTitle})` : ''
            } ===\n${String(p.text || '').slice(0, 2000)}`
        )
        .join('\n\n');

      const isNoCoverage = !hasAnyTextbook || (passages.length === 0 && !pdfBase64);

      const canonicalTopicLockBlock = `
CANONICAL TOPIC LOCK (NON-NEGOTIABLE):
- Canonical Topic ID: "${canonicalTopic.canonicalTopicId}"
- Canonical Medical Topic Title: "${canonicalTopic.canonicalTitle}"
- Target Organ/System Domain: "${canonicalTopic.organDomain}" (${canonicalTopic.domainProfile.anatomicalRegionLabel})
- Set JSON "topic" strictly to "${canonicalTopic.canonicalTitle}".
- EVERY section, summary, mindMap node, flowchart, anatomicalDiagram callout, comparisonTable, clinicalCase, flashcard, clinicalNote, and MCQ MUST exclusively teach "${canonicalTopic.canonicalTitle}".
- NEVER switch to or summarize a different disease (for example, NEVER teach Achalasia, Esophageal Spasm, or Variceal Cirrhosis when the requested topic is Peptic Ulcer Disease), even if an attached PDF or passage discusses another disorder. If the attached PDF or passages discuss a different disorder, treat textbook coverage for "${canonicalTopic.canonicalTitle}" as "none" (referencedPages: [], citationTags: []) and teach "${canonicalTopic.canonicalTitle}" accurately from general_medical_knowledge.`;

      const sharedPedagogyInstructions = `
${canonicalTopicLockBlock}

INTERACTIVE TEACHING & VISUAL REQUIREMENTS:
A. STEP-BY-STEP TEACHING (5 numbered progressive steps in "sections"):
   - Progress logically from basic concepts to clinical mastery of "${canonicalTopic.canonicalTitle}":
     Step 1: Basic Concepts & Normal Physiology (explain normal physiology of ${canonicalTopic.domainProfile.anatomicalRegionLabel} BEFORE pathophysiology; decode 2-3 difficult medical terms in "termDefinitions").
     Step 2: Pathophysiology & Underlying Mechanisms of "${canonicalTopic.canonicalTitle}".
     Step 3: Clinical Presentation & Bedside Findings of "${canonicalTopic.canonicalTitle}".
     Step 4: Diagnosis, Investigations & Differential Diagnosis of "${canonicalTopic.canonicalTitle}".
     Step 5: Stepwise Management, Complications & Exam Pearls for "${canonicalTopic.canonicalTitle}".
   - Include "quickSummaryPoints" (2-3 crisp revision bullets per step) and "termDefinitions" (plain-English + simple Egyptian Arabic explanation of difficult terms).
B. BILINGUAL EGYPTIAN ARABIC SUPPORT:
   - Populate "summaryArabic" and each step's "contentArabic" and "keyTakeawayArabic" using clear, friendly, natural Egyptian Arabic (عامية مصرية طبية مبسطة زي شرح الدكاترة في المحاضرات) while PRESERVING English medical terminology inline.
C. VISUAL LEARNING DATA:
   - "mindMap": 6 to 8 connected nodes strictly for "${canonicalTopic.canonicalTitle}" ("id", "label", "category" in [physiology, pathophysiology, clinical, diagnosis, management, complications], "relationLabel" verb on arrow, optional "parentId" for sub-branches, "summary", "sourceBasis", "pageNumbers", "citationTags").
   - "flowcharts": 2 directed flowcharts strictly for "${canonicalTopic.canonicalTitle}":
     (1) flowType: "pathophysiology" (5-6 nodes + directed edges showing mechanism cascade)
     (2) flowType: "management" or "diagnosis" (5-6 nodes including at least one "decision" node + labeled Yes/No or branch edges).
   - "anatomicalDiagram": Choose "systemTemplate" from [cardiopulmonary, renal, respiratory, hepatobiliary, endocrine, neurology, hematology, immune, general_physiology] (suggested: "${suggestedSystemTemplate}"), explain normal vs pathological physiology of ${canonicalTopic.domainProfile.anatomicalRegionLabel} in "${canonicalTopic.canonicalTitle}", and place 4 numbered callouts (xPercent 18-82, yPercent 18-82) naming true anatomical structures of ${canonicalTopic.domainProfile.anatomicalRegionLabel}.
D. ACTIVE STUDY TOOLS:
   - "quickRevisionBullets": 5 high-yield one-line exam bullets on "${canonicalTopic.canonicalTitle}".
   - "comparisonTable": 3 columns comparing subtypes or close differentials of "${canonicalTopic.canonicalTitle}" and 4 comparison rows (Mechanism, Presentation, Key Lab/Imaging, First-Line Therapy).
   - "clinicalCases": 2 realistic bedside case scenarios of "${canonicalTopic.canonicalTitle}" with organ-appropriate vitals/labs, promptQuestion, idealWorkupAndDiagnosis, managementPlan, clinicalPearl, and arabicTakeaway.
   - "flashcards": 5 active-recall flashcards on "${canonicalTopic.canonicalTitle}" (front, back, backArabic, category).
   - "clinicalNotes": 3 high-yield notes on "${canonicalTopic.canonicalTitle}" ("Red Flag", "Clinical Pearl", "Diagnostic Pitfall", or "Management Protocol") with detailArabic.
   - "mcqs": 4 USMLE-style clinical vignette MCQs strictly testing "${canonicalTopic.canonicalTitle}" (4 options without letter prefixes, 0-based correctIndex, explanation, explanationArabic).`;

      const instructionBlock = isNoCoverage
        ? `Selected Medical Textbook Sources (Searched ${pageCount} total indexed pages):
${booksHeaderBlock}
Requested Medical Topic: "${canonicalTopic.canonicalTitle}" (Canonical ID: "${canonicalTopic.canonicalTopicId}")
Retrieval Result: ${
            !hasAnyTextbook
              ? 'NO UPLOADED TEXTBOOK SELECTED (General Medical Topic Mode — coverage = "none").'
              : 'ZERO RELEVANT PASSAGES FOUND IN SELECTED TEXTBOOK(S) (coverage = "none").'
          }

STRICT MANDATORY CITATION RULES:
1. Set "coverage" to "none" and "referencedPages" to [].
2. In "coverageNote", explicitly inform the learner upfront that ${
            !hasAnyTextbook
              ? `no uploaded textbook was selected for "${canonicalTopic.canonicalTitle}", so this Medical Topic Blueprint is synthesized from General Medical Knowledge with zero fabricated textbook citations.`
              : `all ${pageCount} pages across the selected textbook source(s) were searched and do NOT contain relevant information on "${canonicalTopic.canonicalTitle}", so zero textbook citations are made.`
          }
3. Provide the full step-by-step teaching lesson, visuals, cases, flashcards, and MCQs for "${canonicalTopic.canonicalTitle}" using general medical knowledge ONLY:
   - Set "sourceBasis" to "general_medical_knowledge", "pageNumbers" to [], and "citationTags" to [] on EVERY section, mindMap node, flowchart, callout, comparisonTable, clinicalCase, flashcard, clinicalNote, and mcq. NEVER invent book titles or page numbers.
${sharedPedagogyInstructions}`
        : `Selected Medical Textbook Sources (Total Pages Indexed: ${pageCount}):
${booksHeaderBlock}
Requested Medical Topic: "${canonicalTopic.canonicalTitle}" (Canonical ID: "${canonicalTopic.canonicalTopicId}")
Initial Retrieval Assessment: ${clientCoverage}
Verified Retrieved Citation Tags: [${allowedCitationTags.join(', ')}]
Verified Retrieved Page Numbers: [${allowedPages.join(', ')}]

Retrieved Textbook Passages:
${
  formattedPassages ||
  `(Scanned visual PDF attached above — examine all PDF pages directly. Cite exact 1-indexed PDF page numbers ONLY where "${canonicalTopic.canonicalTitle}" itself is taught. If the PDF teaches a DIFFERENT disease, set coverage="none", referencedPages=[], citationTags=[] and ignore the unrelated PDF content.)`
}

STRICT MANDATORY CITATION & MULTI-BOOK GROUNDING RULES:
1. NEVER claim a medical fact comes from a textbook unless it is directly supported by passages genuinely about "${canonicalTopic.canonicalTitle}".
2. Evaluate whether the retrieved passages or attached PDF genuinely cover "${canonicalTopic.canonicalTitle}":
   - If the passages/PDF discuss a DIFFERENT medical topic or do NOT contain relevant information on "${canonicalTopic.canonicalTitle}", set "coverage" to "none", "referencedPages" to [], state clearly that the selected textbook(s) lack coverage of "${canonicalTopic.canonicalTitle}", and label every item "sourceBasis": "general_medical_knowledge" with "pageNumbers": [] and "citationTags": [].
   - If the passages cover part of "${canonicalTopic.canonicalTitle}", set "coverage" to "partial" or "strong" as appropriate and explain clearly in "coverageNote" (mentioning the supporting book titles).
3. Distinguish Textbook Content vs Supplementary Medical Knowledge on EVERY item:
   - When a step, visual node, flowchart, case, flashcard, note, or MCQ is supported by retrieved passages on "${canonicalTopic.canonicalTitle}", set "sourceBasis" to "textbook", set "citationTags" strictly to exact tag(s) from [${allowedCitationTags.join(
     ', '
   )}], set "pageNumbers" to the corresponding integer page(s), and include a short verbatim "supportingQuote" on textbook sections.
   - When an item relies on supplementary medical knowledge, set "sourceBasis" to "general_medical_knowledge", "pageNumbers" to [], and "citationTags" to [].
${sharedPedagogyInstructions}`;

      promptParts.push({ text: instructionBlock });

      const generationConfig = {
        systemInstruction:
          `You are an interactive, evidence-grounded multi-book medical textbook professor. Maintain strict canonical topic fidelity to "${canonicalTopic.canonicalTitle}" (never drift to or summarize a different disorder from unrelated textbook pages). Follow strict citation honesty: NEVER attribute facts, book tags, or page numbers to a textbook unless present in passages genuinely covering "${canonicalTopic.canonicalTitle}". Distinguish "textbook" from "general_medical_knowledge" (empty citationTags: [], pageNumbers: []).`,
        temperature: 0.15,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            coverage: { type: Type.STRING, description: 'strong, partial, or none' },
            coverageNote: { type: Type.STRING },
            summary: { type: Type.STRING },
            summaryArabic: {
              type: Type.STRING,
              description: 'Egyptian Arabic overview preserving English medical terms.',
            },
            quickRevisionBullets: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            referencedPages: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stepNumber: { type: Type.INTEGER },
                  stepPhase: { type: Type.STRING },
                  heading: { type: Type.STRING },
                  content: { type: Type.STRING },
                  contentArabic: { type: Type.STRING },
                  quickSummaryPoints: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  termDefinitions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        term: { type: Type.STRING },
                        simpleExplanation: { type: Type.STRING },
                        arabicExplanation: { type: Type.STRING },
                      },
                      required: ['term', 'simpleExplanation'],
                    },
                  },
                  sourceBasis: { type: Type.STRING },
                  pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  citationTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  supportingQuote: { type: Type.STRING },
                  keyTakeaway: { type: Type.STRING },
                  keyTakeawayArabic: { type: Type.STRING },
                },
                required: [
                  'stepNumber',
                  'stepPhase',
                  'heading',
                  'content',
                  'contentArabic',
                  'quickSummaryPoints',
                  'sourceBasis',
                  'pageNumbers',
                  'keyTakeaway',
                ],
              },
            },
            mindMap: {
              type: Type.OBJECT,
              properties: {
                centralTopic: { type: Type.STRING },
                centralSubtitle: { type: Type.STRING },
                nodes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      label: { type: Type.STRING },
                      category: { type: Type.STRING },
                      relationLabel: { type: Type.STRING },
                      parentId: { type: Type.STRING },
                      summary: { type: Type.STRING },
                      sourceBasis: { type: Type.STRING },
                      pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                      citationTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: [
                      'id',
                      'label',
                      'category',
                      'relationLabel',
                      'summary',
                      'sourceBasis',
                      'pageNumbers',
                    ],
                  },
                },
              },
              required: ['centralTopic', 'nodes'],
            },
            flowcharts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  flowType: { type: Type.STRING },
                  sourceBasis: { type: Type.STRING },
                  pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  citationTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  nodes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        label: { type: Type.STRING },
                        detail: { type: Type.STRING },
                        nodeType: { type: Type.STRING },
                      },
                      required: ['id', 'label', 'nodeType'],
                    },
                  },
                  edges: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        from: { type: Type.STRING },
                        to: { type: Type.STRING },
                        label: { type: Type.STRING },
                      },
                      required: ['from', 'to'],
                    },
                  },
                },
                required: ['id', 'title', 'flowType', 'nodes', 'edges', 'sourceBasis', 'pageNumbers'],
              },
            },
            anatomicalDiagram: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                systemTemplate: { type: Type.STRING },
                normalPhysiologySummary: { type: Type.STRING },
                pathophysiologySummary: { type: Type.STRING },
                callouts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      number: { type: Type.INTEGER },
                      structureName: { type: Type.STRING },
                      xPercent: { type: Type.NUMBER },
                      yPercent: { type: Type.NUMBER },
                      normalRole: { type: Type.STRING },
                      pathologicalChange: { type: Type.STRING },
                      sourceBasis: { type: Type.STRING },
                      pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                      citationTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: [
                      'id',
                      'number',
                      'structureName',
                      'xPercent',
                      'yPercent',
                      'normalRole',
                      'pathologicalChange',
                      'sourceBasis',
                      'pageNumbers',
                    ],
                  },
                },
              },
              required: [
                'title',
                'systemTemplate',
                'normalPhysiologySummary',
                'pathophysiologySummary',
                'callouts',
              ],
            },
            comparisonTable: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                columns: { type: Type.ARRAY, items: { type: Type.STRING } },
                rows: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      feature: { type: Type.STRING },
                      cells: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ['feature', 'cells'],
                  },
                },
                sourceBasis: { type: Type.STRING },
                pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                citationTags: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['title', 'columns', 'rows', 'sourceBasis', 'pageNumbers'],
            },
            clinicalCases: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  patientPresentation: { type: Type.STRING },
                  vitalsAndLabs: { type: Type.STRING },
                  promptQuestion: { type: Type.STRING },
                  idealWorkupAndDiagnosis: { type: Type.STRING },
                  managementPlan: { type: Type.STRING },
                  clinicalPearl: { type: Type.STRING },
                  arabicTakeaway: { type: Type.STRING },
                  sourceBasis: { type: Type.STRING },
                  pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  citationTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: [
                  'id',
                  'title',
                  'patientPresentation',
                  'vitalsAndLabs',
                  'promptQuestion',
                  'idealWorkupAndDiagnosis',
                  'managementPlan',
                  'clinicalPearl',
                  'sourceBasis',
                  'pageNumbers',
                ],
              },
            },
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  front: { type: Type.STRING },
                  back: { type: Type.STRING },
                  backArabic: { type: Type.STRING },
                  category: { type: Type.STRING },
                  sourceBasis: { type: Type.STRING },
                  pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  citationTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['id', 'front', 'back', 'category', 'sourceBasis', 'pageNumbers'],
              },
            },
            clinicalNotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  category: { type: Type.STRING },
                  detail: { type: Type.STRING },
                  detailArabic: { type: Type.STRING },
                  sourceBasis: { type: Type.STRING },
                  pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  citationTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  supportingQuote: { type: Type.STRING },
                },
                required: ['title', 'category', 'detail', 'sourceBasis', 'pageNumbers'],
              },
            },
            mcqs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                  explanationArabic: { type: Type.STRING },
                  sourceBasis: { type: Type.STRING },
                  pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  citationTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: [
                  'question',
                  'options',
                  'correctIndex',
                  'explanation',
                  'sourceBasis',
                  'pageNumbers',
                ],
              },
            },
          },
          required: [
            'topic',
            'coverage',
            'coverageNote',
            'summary',
            'summaryArabic',
            'quickRevisionBullets',
            'referencedPages',
            'sections',
            'mindMap',
            'flowcharts',
            'anatomicalDiagram',
            'comparisonTable',
            'clinicalCases',
            'flashcards',
            'clinicalNotes',
            'mcqs',
          ],
        },
      };

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts: promptParts },
          config: {
            ...generationConfig,
            abortSignal: AbortSignal.timeout(24_000),
          },
        });
      } catch (primaryErr) {
        const errMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        const isTransient =
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('429') ||
          errMsg.toLowerCase().includes('abort') ||
          errMsg.toLowerCase().includes('timeout');
        if (isTransient) {
          const { thinkingConfig: _omitThinking, ...liteConfig } = generationConfig;
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: { parts: promptParts },
            config: liteConfig,
          });
        } else {
          throw primaryErr;
        }
      }

      const rawText = response.text;
      if (!rawText) {
        res.status(502).json({ error: 'Empty response received from medical tutor model.' });
        return;
      }

      const parsed = JSON.parse(rawText.trim());
      res.json({ guide: parsed });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate medical textbook explanation.';
      console.error('Gemini API error:', message);
      res.status(500).json({ error: message });
    }
  });

  // On-demand Egyptian Arabic medical explanation enrichment for older/offline guides
  app.post('/api/tutor/egyptian-explain', async (req, res) => {
    try {
      const topic = String(req.body?.topic || '').trim();
      const summary = String(req.body?.summary || '').trim();
      const sections: Array<{ heading: string; content: string; keyTakeaway: string }> =
        Array.isArray(req.body?.sections) ? req.body.sections : [];

      if (!topic || sections.length === 0) {
        res.status(400).json({ error: 'Valid guide topic and sections are required.' });
        return;
      }

      const ai = getGeminiClient();
      const prompt = `Explain the following medical study guide in simple, clear, accurate Egyptian Arabic (عامية مصرية طبية مبسطة زي شرح الكلية والامتياز) while keeping ALL English medical terminology, drug names, lab tests, and physiological terms in English inline. Do NOT invent new facts beyond what is written.

Topic: ${topic}
Summary: ${summary}
Sections:
${sections
  .map(
    (s, idx) =>
      `[${idx}] ${s.heading}\nContent: ${s.content}\nTakeaway: ${s.keyTakeaway}`
  )
  .join('\n\n')}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          temperature: 0.15,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summaryArabic: { type: Type.STRING },
              sectionTranslations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    contentArabic: { type: Type.STRING },
                    keyTakeawayArabic: { type: Type.STRING },
                  },
                  required: ['contentArabic', 'keyTakeawayArabic'],
                },
              },
            },
            required: ['summaryArabic', 'sectionTranslations'],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      res.json(parsed);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate Egyptian Arabic medical explanation.';
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // Medical Textbook Infographic PDF & 48-Question Bank Studio Endpoints
  // ============================================================================
  async function generateStructuredPdfStudioJson(
    prompt: string,
    responseSchema: Record<string, unknown>,
    systemInstruction: string,
    timeoutMs = 28_000
  ): Promise<Record<string, unknown>> {
    const ai = getGeminiClient();
    const primaryConfig = {
      systemInstruction,
      temperature: 0.2,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema,
    };

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          ...primaryConfig,
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      });
    } catch (primaryErr) {
      const errMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const isTransient =
        errMsg.includes('503') ||
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('429') ||
        errMsg.toLowerCase().includes('abort') ||
        errMsg.toLowerCase().includes('timeout');
      if (!isTransient) throw primaryErr;

      const { thinkingConfig: _omitThinking, ...liteConfig } = primaryConfig;
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: liteConfig,
      });
    }

    const rawText = (response.text || '').trim();
    if (!rawText) {
      throw new Error('Empty structured response received from Gemini medical model.');
    }
    return JSON.parse(rawText) as Record<string, unknown>;
  }

  app.post('/api/pdf-studio/synthesize-sciences', async (req, res) => {
    try {
      const topic = String(req.body?.topic || '').trim();
      const textbookTitle = String(req.body?.textbookTitle || 'Uploaded Medical Textbook').trim();
      const coverage = String(req.body?.coverage || 'none');
      const referencedPages: number[] = Array.isArray(req.body?.referencedPages)
        ? req.body.referencedPages.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
        : [];
      const relevantDisciplines: string[] = Array.isArray(req.body?.relevantDisciplines)
        ? req.body.relevantDisciplines.map(String)
        : ['anatomy', 'physiology', 'pathophysiology', 'pharmacology', 'clinical_correlations'];
      const passages: Array<{ pageNumber: number; chapterTitle?: string; textbookTitle?: string; text: string }> =
        Array.isArray(req.body?.passages) ? req.body.passages : [];

      if (!topic) {
        res.status(400).json({ error: 'Valid medical topic is required.' });
        return;
      }

      const canonicalTopic = canonicalizeMedicalTopic(topic);

      const passageBlock =
        passages.length > 0
          ? passages
              .map(
                (p) =>
                  `[BOOK "${p.textbookTitle || textbookTitle}" | VERIFIED PAGE ${p.pageNumber}${
                    p.chapterTitle ? ` | ${p.chapterTitle}` : ''
                  }]\n${String(p.text || '').slice(0, 1500)}`
              )
              .join('\n\n')
          : '(No matching textbook passages found — coverage is "none". Set sourceBasis="general_medical_knowledge" and pageNumbers=[] on every block.)';

      const prompt = `Create a textbook-grade Medical Infographic Integrated Sciences pack strictly locked to canonical topic: "${canonicalTopic.canonicalTitle}" (Canonical ID: "${canonicalTopic.canonicalTopicId}", Organ Domain: "${canonicalTopic.organDomain}" — ${canonicalTopic.domainProfile.anatomicalRegionLabel}).
Primary Textbook: "${textbookTitle}"
Coverage Status: "${coverage}"
Verified Allowed Page Numbers: [${referencedPages.join(', ')}]
Relevant Disciplines to Include (DO NOT include irrelevant disciplines): [${relevantDisciplines.join(', ')}]

Retrieved Textbook Passages:
${passageBlock}

CANONICAL TOPIC LOCK & REQUIREMENTS:
0. Every block, title, callout pin, normal/pathological comparison, and drug table row MUST exclusively describe "${canonicalTopic.canonicalTitle}" (${canonicalTopic.domainProfile.anatomicalRegionLabel}). NEVER discuss unrelated disorders (e.g. never discuss Achalasia or Liver Cirrhosis if the topic is Peptic Ulcer Disease). If any passage discusses a different condition, ignore that passage completely and set pageNumbers=[].
1. "learningObjectives": 4-5 concise, measurable clinical & basic-science learning objectives for "${canonicalTopic.canonicalTitle}".
2. "sourceGapNotice": Explicitly state which aspects of "${canonicalTopic.canonicalTitle}" come from verified textbook pages [${referencedPages.join(', ')}] versus which basic-science or clinical expansions rely on established Supplementary Medical Knowledge due to textbook scope/gaps. Never invent page numbers.
3. "relevantDisciplinesNote": 1 sentence explaining why [${relevantDisciplines.join(', ')}] were selected for "${canonicalTopic.canonicalTitle}".
4. "integratedDisciplines": Generate 1 rich textbook infographic block for EACH discipline in [${relevantDisciplines.join(', ')}]:
   - Preserve exact textbook terminology when supported by passages genuinely covering "${canonicalTopic.canonicalTitle}" (sourceBasis="textbook", pageNumbers subset of [${referencedPages.join(', ')}], optional verbatim supportingQuote).
   - If expanding beyond brief textbook passages, set sourceBasis="general_medical_knowledge" and pageNumbers=[].
   - Include 3-4 "calloutPins" (number 1..4, label, detail, xPct 18..82, yPct 18..82) naming true anatomical, histological, physiological, or pharmacological landmarks of ${canonicalTopic.domainProfile.anatomicalRegionLabel}.
   - For "pathology", populate "normalComparisonNote" and "pathologicalComparisonNote" for a side-by-side Normal vs Abnormal comparison of "${canonicalTopic.canonicalTitle}".
   - For "pharmacology", populate 3-4 "drugComparisonRows" (drugClass, prototypeAgents, mechanismOfAction, clinicalIndications, adverseEffectsAndContraindications) used specifically in "${canonicalTopic.canonicalTitle}".`;

      const parsed = await generateStructuredPdfStudioJson(
        prompt,
        {
          type: Type.OBJECT,
          properties: {
            learningObjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
            sourceGapNotice: { type: Type.STRING },
            relevantDisciplinesNote: { type: Type.STRING },
            integratedDisciplines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  discipline: { type: Type.STRING },
                  disciplineLabel: { type: Type.STRING },
                  title: { type: Type.STRING },
                  relevanceSummary: { type: Type.STRING },
                  detailedExplanation: { type: Type.STRING },
                  keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                  highlightedTerms: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        term: { type: Type.STRING },
                        definition: { type: Type.STRING },
                      },
                      required: ['term', 'definition'],
                    },
                  },
                  clinicalCorrelationPearl: { type: Type.STRING },
                  visualKind: { type: Type.STRING },
                  visualTitle: { type: Type.STRING },
                  visualCaption: { type: Type.STRING },
                  calloutPins: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        number: { type: Type.INTEGER },
                        label: { type: Type.STRING },
                        detail: { type: Type.STRING },
                        xPct: { type: Type.NUMBER },
                        yPct: { type: Type.NUMBER },
                      },
                      required: ['number', 'label', 'detail', 'xPct', 'yPct'],
                    },
                  },
                  normalComparisonNote: { type: Type.STRING },
                  pathologicalComparisonNote: { type: Type.STRING },
                  curveAxisX: { type: Type.STRING },
                  curveAxisY: { type: Type.STRING },
                  drugComparisonRows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        drugClass: { type: Type.STRING },
                        prototypeAgents: { type: Type.STRING },
                        mechanismOfAction: { type: Type.STRING },
                        clinicalIndications: { type: Type.STRING },
                        adverseEffectsAndContraindications: { type: Type.STRING },
                      },
                      required: [
                        'drugClass',
                        'prototypeAgents',
                        'mechanismOfAction',
                        'clinicalIndications',
                        'adverseEffectsAndContraindications',
                      ],
                    },
                  },
                  sourceBasis: { type: Type.STRING },
                  pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  supportingQuote: { type: Type.STRING },
                },
                required: [
                  'discipline',
                  'disciplineLabel',
                  'title',
                  'detailedExplanation',
                  'keyPoints',
                  'clinicalCorrelationPearl',
                  'visualKind',
                  'visualTitle',
                  'visualCaption',
                  'calloutPins',
                  'sourceBasis',
                  'pageNumbers',
                ],
              },
            },
          },
          required: [
            'learningObjectives',
            'sourceGapNotice',
            'relevantDisciplinesNote',
            'integratedDisciplines',
          ],
        },
        'You are a senior medical textbook author and illustrator. Never fabricate textbook page numbers or references. Clearly separate verified textbook facts from supplementary medical science.'
      );

      res.json(parsed);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Failed to synthesize integrated medical sciences.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/pdf-studio/generate-mcqs', async (req, res) => {
    try {
      const topic = String(req.body?.topic || '').trim();
      const textbookTitle = String(req.body?.textbookTitle || 'Uploaded Medical Textbook').trim();
      const count = Math.min(20, Math.max(5, Number(req.body?.count) || 15));
      const batchNumber = Number(req.body?.batchNumber) || 1;
      const focusDescription = String(
        req.body?.focusDescription ||
          'Foundational science, mechanisms, clinical application, and critical thinking'
      );
      const referencedPages: number[] = Array.isArray(req.body?.referencedPages)
        ? req.body.referencedPages.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
        : [];
      const avoidStems: string[] = Array.isArray(req.body?.avoidStems)
        ? req.body.avoidStems.map(String)
        : [];
      const passages: Array<{ pageNumber: number; text: string }> = Array.isArray(
        req.body?.passages
      )
        ? req.body.passages
        : [];

      if (!topic) {
        res.status(400).json({ error: 'Valid medical topic is required.' });
        return;
      }

      const canonicalTopic = canonicalizeMedicalTopic(topic);

      const passageBlock =
        passages.length > 0
          ? passages
              .map(
                (p) =>
                  `[VERIFIED PAGE ${p.pageNumber}] ${String(p.text || '').slice(0, 1200)}`
              )
              .join('\n\n')
          : '(No matching textbook passages — set sourceBasis="general_medical_knowledge" and pageNumbers=[] on all MCQs.)';

      const avoidBlock =
        avoidStems.length > 0
          ? `\nDO NOT repeat or paraphrase any of these existing MCQ stems:\n${avoidStems
              .map((s, i) => `- ${i + 1}. ${s.slice(0, 140)}`)
              .join('\n')}\n`
          : '';

      const prompt = `Generate EXACTLY ${count} unique, medically accurate, single-best-answer Multiple-Choice Questions (Batch ${batchNumber}) strictly locked to canonical topic: "${canonicalTopic.canonicalTitle}" (Canonical ID: "${canonicalTopic.canonicalTopicId}", Organ Domain: "${canonicalTopic.organDomain}").
Textbook: "${textbookTitle}" (Verified Pages: [${referencedPages.join(', ')}])
Batch Focus: ${focusDescription}
${avoidBlock}
Retrieved Passages:
${passageBlock}

STRICT CANONICAL TOPIC & ITEM RULES:
1. Return EXACTLY ${count} distinct MCQs in "mcqs" testing ONLY "${canonicalTopic.canonicalTitle}". Zero off-topic items (never test unrelated diseases even if mentioned as a differential or in an unrelated passage).
2. Each MCQ must have:
   - "difficulty": one of ["Foundational", "Mechanism", "Clinical Application", "Critical Thinking"]
   - "discipline": relevant medical discipline (e.g. "Anatomy", "Physiology", "Pathology", "Pathophysiology", "Pharmacology", "Clinical Diagnosis", "Management")
   - "stem": unambiguous clinical vignette or mechanism question specifically centred on "${canonicalTopic.canonicalTitle}"
   - "options": array of 4 plausible, mutually exclusive options WITHOUT letter prefixes ("A.", "B.")
   - "correctIndex": integer 0..3 for the single best answer
   - "explanation": concise rationale explaining why the correct answer is right for "${canonicalTopic.canonicalTitle}" and key distractors are wrong
   - "sourceBasis": "textbook" ONLY if directly tested from verified pages [${referencedPages.join(', ')}] genuinely covering "${canonicalTopic.canonicalTitle}", otherwise "general_medical_knowledge" with "pageNumbers": [].`;

      const parsed = await generateStructuredPdfStudioJson(
        prompt,
        {
          type: Type.OBJECT,
          properties: {
            mcqs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  difficulty: { type: Type.STRING },
                  discipline: { type: Type.STRING },
                  stem: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                  sourceBasis: { type: Type.STRING },
                  pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                },
                required: [
                  'difficulty',
                  'discipline',
                  'stem',
                  'options',
                  'correctIndex',
                  'explanation',
                  'sourceBasis',
                  'pageNumbers',
                ],
              },
            },
          },
          required: ['mcqs'],
        },
        'You are a medical board examination item writer (USMLE / MRCP standard). Write unambiguous single-best-answer stems, plausible distractors, and rigorous explanations without fabricating textbook citations.'
      );

      res.json(parsed);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to generate MCQ batch.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/pdf-studio/generate-written-and-cases', async (req, res) => {
    try {
      const topic = String(req.body?.topic || '').trim();
      const textbookTitle = String(req.body?.textbookTitle || 'Uploaded Medical Textbook').trim();
      const referencedPages: number[] = Array.isArray(req.body?.referencedPages)
        ? req.body.referencedPages.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
        : [];
      const passages: Array<{ pageNumber: number; text: string }> = Array.isArray(
        req.body?.passages
      )
        ? req.body.passages
        : [];

      if (!topic) {
        res.status(400).json({ error: 'Valid medical topic is required.' });
        return;
      }

      const canonicalTopic = canonicalizeMedicalTopic(topic);

      const passageBlock =
        passages.length > 0
          ? passages
              .map(
                (p) =>
                  `[VERIFIED PAGE ${p.pageNumber}] ${String(p.text || '').slice(0, 1200)}`
              )
              .join('\n\n')
          : '(No matching textbook passages — set sourceBasis="general_medical_knowledge" and pageNumbers=[] on all items.)';

      const prompt = `Generate EXACTLY 10 structured Written Examination Questions AND EXACTLY 8 Progressive Clinical Case Scenarios strictly locked to canonical topic: "${canonicalTopic.canonicalTitle}" (Canonical ID: "${canonicalTopic.canonicalTopicId}", Organ Domain: "${canonicalTopic.organDomain}").
Textbook: "${textbookTitle}" (Verified Pages: [${referencedPages.join(', ')}])

Retrieved Passages:
${passageBlock}

CANONICAL TOPIC LOCK:
- Every single Written Question and Clinical Case MUST assess "${canonicalTopic.canonicalTitle}" (${canonicalTopic.domainProfile.anatomicalRegionLabel}). NEVER generate questions or cases primarily about a different disease, and NEVER use generic unrelated respiratory/cardiac vitals unless clinically indicated by "${canonicalTopic.canonicalTitle}".

PART 1 — "writtenQuestions" (EXACTLY 10 distinct questions on "${canonicalTopic.canonicalTitle}"):
- Vary "commandVerb" across ["Explain", "Discuss", "Compare", "Enumerate", "Describe", "Clinical Work-up"].
- Include "difficulty" in ["Foundational", "Mechanism", "Clinical Application", "Critical Thinking"], "discipline", clear "prompt" explicitly naming "${canonicalTopic.canonicalTitle}", "markingPoints" (3-4 rubric bullets with integer "marks" summing to 10), and a concise, structured "modelAnswer".

PART 2 — "clinicalCases" (EXACTLY 8 distinct realistic clinical scenarios of "${canonicalTopic.canonicalTitle}"):
- Each case must feature a realistic "patientPresentation" of "${canonicalTopic.canonicalTitle}", 3-4 organ-appropriate "vitalsAndLabs" entries (parameter, value, referenceRange, flag in ["normal", "high", "low", "critical"]), and 3-4 "progressiveQuestions" ("Part A", "Part B", "Part C"...) spanning ["Diagnosis", "Differential Diagnosis", "Investigations", "Interpretation", "Management", "Complications"] with complete "modelAnswer" and "rationale", plus a "clinicalPearl".
- Strictly set "sourceBasis" to "textbook" ONLY when directly anchored in verified pages [${referencedPages.join(', ')}] genuinely covering "${canonicalTopic.canonicalTitle}", otherwise "general_medical_knowledge" with "pageNumbers": [].`;

      const parsed = await generateStructuredPdfStudioJson(
        prompt,
        {
          type: Type.OBJECT,
          properties: {
            writtenQuestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  commandVerb: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                  discipline: { type: Type.STRING },
                  prompt: { type: Type.STRING },
                  markingPoints: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        point: { type: Type.STRING },
                        marks: { type: Type.INTEGER },
                      },
                      required: ['point', 'marks'],
                    },
                  },
                  modelAnswer: { type: Type.STRING },
                  sourceBasis: { type: Type.STRING },
                  pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                },
                required: [
                  'commandVerb',
                  'difficulty',
                  'discipline',
                  'prompt',
                  'markingPoints',
                  'modelAnswer',
                  'sourceBasis',
                  'pageNumbers',
                ],
              },
            },
            clinicalCases: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                  patientPresentation: { type: Type.STRING },
                  vitalsAndLabs: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        parameter: { type: Type.STRING },
                        value: { type: Type.STRING },
                        referenceRange: { type: Type.STRING },
                        flag: { type: Type.STRING },
                      },
                      required: ['parameter', 'value'],
                    },
                  },
                  progressiveQuestions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        partLabel: { type: Type.STRING },
                        focusArea: { type: Type.STRING },
                        question: { type: Type.STRING },
                        modelAnswer: { type: Type.STRING },
                        rationale: { type: Type.STRING },
                      },
                      required: [
                        'partLabel',
                        'focusArea',
                        'question',
                        'modelAnswer',
                        'rationale',
                      ],
                    },
                  },
                  clinicalPearl: { type: Type.STRING },
                  sourceBasis: { type: Type.STRING },
                  pageNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                },
                required: [
                  'title',
                  'difficulty',
                  'patientPresentation',
                  'vitalsAndLabs',
                  'progressiveQuestions',
                  'clinicalPearl',
                  'sourceBasis',
                  'pageNumbers',
                ],
              },
            },
          },
          required: ['writtenQuestions', 'clinicalCases'],
        },
        'You are a clinical medicine professor authoring structured written assessments and progressive bedside cases. Never invent textbook citations; ensure medically plausible scenarios and clear marking rubrics.',
        34_000
      );

      res.json(parsed);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Failed to generate written questions and clinical cases.';
      res.status(500).json({ error: msg });
    }
  });

  // ============================================================================
  // Medical Animation Lecture Studio Endpoints
  // ============================================================================
  const execFileAsync = promisify(execFile);

  interface ExportSessionMeta {
    dirPath: string;
    fps: number;
    audioDurationSec: number;
    audioMeanDb: number;
    audioPeakDb: number;
    totalDurationSec: number;
    sceneCount: number;
    frameCount: number;
    createdAt: number;
  }

  interface Mp4DownloadArtifactMeta {
    filePath: string;
    sizeBytes: number;
    createdAt: number;
  }

  const mp4ExportSessions = new Map<string, ExportSessionMeta>();
  const mp4DownloadArtifacts = new Map<string, Mp4DownloadArtifactMeta>();
  const ttsModelCooldownUntil = new Map<
    string,
    { untilMs: number; reason: string }
  >();

  async function cleanupExpiredMp4Artifacts(nowMs = Date.now()): Promise<void> {
    const ttlMs = 20 * 60_000;
    for (const [token, artifact] of mp4DownloadArtifacts.entries()) {
      if (nowMs - artifact.createdAt > ttlMs) {
        mp4DownloadArtifacts.delete(token);
        await fs.rm(artifact.filePath, { force: true }).catch(() => {});
      }
    }
  }

  function parseQuotaCooldownMs(errMsg: string): number {
    const retryMatch = errMsg.match(/retryDelay["':\s]+(\d+)s/i);
    if (retryMatch) {
      const secs = Number(retryMatch[1]);
      if (Number.isFinite(secs) && secs > 0) {
        return Math.min(30 * 60_000, secs * 1000);
      }
    }
    if (/PerDay/i.test(errMsg) || /per day limit/i.test(errMsg)) {
      return 20 * 60_000;
    }
    if (/429|RESOURCE_EXHAUSTED|PerMinute/i.test(errMsg)) {
      return 58_000;
    }
    return 0;
  }

  async function synthesizeViaGeminiLiveAudio(
    ai: GoogleGenAI,
    spokenText: string,
    voiceName: string
  ): Promise<{ audioBytes: Buffer; mimeType: string }> {
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await new Promise<{ audioBytes: Buffer; mimeType: string }>(
          async (resolve, reject) => {
            const chunks: Buffer[] = [];
            let detectedMime = 'audio/pcm;rate=24000';
            let settled = false;
            let liveSession: {
              sendClientContent: (arg: unknown) => void;
              close: () => void;
            } | null = null;

            const finish = (err?: Error) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              try {
                liveSession?.close();
              } catch {
                // Ignore close error
              }
              if (err) {
                reject(err);
              } else {
                resolve({
                  audioBytes: Buffer.concat(chunks),
                  mimeType: detectedMime,
                });
              }
            };

            const timer = setTimeout(
              () => finish(new Error('Gemini Live neural audio timed out after 38s.')),
              38_000
            );

            try {
              liveSession = (await ai.live.connect({
                model: 'gemini-3.8-live',
                config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName },
                    },
                  },
                  systemInstruction:
                    'You are a deterministic text-to-speech voice synthesis engine for medical faculty lectures. Read the user provided narration script aloud verbatim, word for word, from the very first word to the very last word (including any Egyptian Arabic and inline English medical terms). Strictly do NOT add any disclaimers, medical advice warnings, introductions, summaries, or closing remarks.',
                },
                callbacks: {
                  onmessage: (msg) => {
                    const parts = msg.serverContent?.modelTurn?.parts || [];
                    for (const part of parts) {
                      if (part.inlineData?.data) {
                        if (part.inlineData.mimeType) {
                          detectedMime = part.inlineData.mimeType;
                        }
                        chunks.push(Buffer.from(part.inlineData.data, 'base64'));
                      }
                    }
                    if (msg.serverContent?.turnComplete && chunks.length > 0) {
                      finish();
                    }
                  },
                  onerror: (err: unknown) => {
                    const m =
                      err instanceof Error
                        ? err.message
                        : 'Gemini Live WebSocket error.';
                    finish(new Error(m));
                  },
                  onclose: (ev: { code?: number; reason?: string }) => {
                    if (!settled) {
                      if (chunks.length > 0) {
                        finish();
                      } else {
                        finish(
                          new Error(
                            `Gemini Live session closed before emitting audio (${ev?.code ?? ''} ${ev?.reason ?? ''}).`
                          )
                        );
                      }
                    }
                  },
                },
              })) as unknown as {
                sendClientContent: (arg: unknown) => void;
                close: () => void;
              };

              await new Promise((r) => setTimeout(r, 90));
              liveSession.sendClientContent({
                turns: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: `Read aloud verbatim without adding any extra words:\n${spokenText}`,
                      },
                    ],
                  },
                ],
                turnComplete: true,
              });
            } catch (connErr) {
              finish(
                connErr instanceof Error
                  ? connErr
                  : new Error(String(connErr))
              );
            }
          }
        );

        if (result.audioBytes.byteLength > 1000) {
          return result;
        }
        lastErr = new Error('Gemini Live returned empty audio stream.');
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }
    }

    throw lastErr || new Error('Gemini Live audio synthesis failed.');
  }

  /**
   * Decodes ANY Gemini TTS audio payload (RIFF WAV, raw 16-bit PCM with rate param,
   * or compressed MP3/OGG/Opus/AAC/FLAC/WebM via FFmpeg) into verified, peak-normalized
   * 24kHz mono 16-bit RIFF WAV, strictly rejecting silent or corrupt audio.
   */
  async function decodeVerifyAndNormalizeTtsAudio(
    rawBuffer: Buffer,
    declaredMimeType: string
  ): Promise<{
    canonicalWavBuffer: Buffer;
    sampleCount: number;
    durationSec: number;
    meanVolumeDb: number;
    peakVolumeDb: number;
    detectedKind: string;
  }> {
    const rawBytes = new Uint8Array(
      rawBuffer.buffer,
      rawBuffer.byteOffset,
      rawBuffer.byteLength
    );
    const detected = detectAudioContainerFormat(rawBytes, declaredMimeType);

    if (detected.kind === 'empty') {
      throw new Error('TTS response contained 0 audio bytes.');
    }

    let mono24kSamples: Int16Array | null = null;

    if (detected.kind === 'raw_pcm_s16le' || detected.kind === 'raw_pcm_s16be') {
      const mono = decodeRawPcm16ToMono(
        rawBytes,
        detected.channelsHint,
        detected.kind === 'raw_pcm_s16be'
      );
      mono24kSamples = resampleMonoPcm16(mono, detected.sampleRateHint, 24000);
    } else if (detected.kind === 'wav') {
      const strictWav = parseStrictRiffWav(rawBytes);
      if (strictWav.ok && !strictWav.needsExternalDecode) {
        mono24kSamples = resampleMonoPcm16(
          strictWav.pcmSamples,
          strictWav.sampleRate,
          24000
        );
      }
    }

    // If compressed container (MP3, OGG, Opus, AAC, WebM, FLAC), compressed WAV subformat, or unknown container:
    // NEVER treat encoded bytes as raw PCM — decode properly with FFmpeg into 24kHz mono s16le WAV!
    if (!mono24kSamples) {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medatlas-tts-dec-'));
      try {
        const inPath = path.join(tmpDir, `input.${detected.containerExtension}`);
        const outPath = path.join(tmpDir, 'decoded_24k.wav');
        await fs.writeFile(inPath, rawBuffer);
        await execFileAsync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-y',
            '-i',
            inPath,
            '-vn',
            '-ac',
            '1',
            '-ar',
            '24000',
            '-c:a',
            'pcm_s16le',
            '-f',
            'wav',
            outPath,
          ],
          { timeout: 20_000 }
        );
        const decodedBuf = await fs.readFile(outPath);
        const strictDecoded = parseStrictRiffWav(
          new Uint8Array(
            decodedBuf.buffer,
            decodedBuf.byteOffset,
            decodedBuf.byteLength
          )
        );
        if (!strictDecoded.ok || strictDecoded.pcmSamples.length === 0) {
          throw new Error(
            strictDecoded.error ||
              `FFmpeg decoded ${declaredMimeType || detected.kind}, but output contained no PCM samples.`
          );
        }
        mono24kSamples = resampleMonoPcm16(
          strictDecoded.pcmSamples,
          strictDecoded.sampleRate,
          24000
        );
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    // Verify raw signal BEFORE normalization so silent (-91 dB) responses never get passed off as valid speech
    const rawAnalysis = analyzePcmSignal(mono24kSamples, 24000);
    if (!rawAnalysis.isNonSilentSpeech) {
      throw new Error(
        rawAnalysis.failureReason ||
          `Neural TTS returned silent audio (mean ${rawAnalysis.meanDb} dBFS, peak ${rawAnalysis.peakDb} dBFS).`
      );
    }

    // Normalize peak to -3.0 dBFS with clean 50ms breath margins and 12ms cosine fades
    const normalizedPcm = normalizeAndTrimScenePcm(mono24kSamples, 24000, -3.0);
    const finalAnalysis = analyzePcmSignal(normalizedPcm, 24000);
    if (!finalAnalysis.isNonSilentSpeech) {
      throw new Error(
        finalAnalysis.failureReason || 'Normalized scene audio failed non-silent speech validation.'
      );
    }

    const canonicalWavBytes = createMono16WavBytes(normalizedPcm, 24000);
    return {
      canonicalWavBuffer: Buffer.from(
        canonicalWavBytes.buffer,
        canonicalWavBytes.byteOffset,
        canonicalWavBytes.byteLength
      ),
      sampleCount: finalAnalysis.sampleCount,
      durationSec: Math.round(finalAnalysis.durationSec * 100) / 100,
      meanVolumeDb: finalAnalysis.meanDb,
      peakVolumeDb: finalAnalysis.peakDb,
      detectedKind: detected.kind,
    };
  }

  /**
   * Runs ffprobe + ffmpeg volumedetect on an encoded MP4 file to guarantee an audible
   * AAC track exists, matches video duration, and is NOT silent (-91 dB).
   */
  async function inspectAndValidateMp4Audio(
    mp4Path: string
  ): Promise<Mp4AudioValidationReport> {
    const stat = await fs.stat(mp4Path);
    const { stdout: probeStdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        mp4Path,
      ],
      { timeout: 20_000 }
    );

    const probeJson = JSON.parse(probeStdout || '{}') as {
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        sample_rate?: string;
        channels?: number;
        duration?: string;
      }>;
      format?: { duration?: string };
    };

    const streams = Array.isArray(probeJson.streams) ? probeJson.streams : [];
    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    const formatDuration = Number(probeJson.format?.duration || 0);
    const videoDurationSec =
      Math.round(Number(videoStream?.duration || formatDuration || 0) * 100) / 100;
    const audioDurationSec =
      Math.round(Number(audioStream?.duration || 0) * 100) / 100;

    if (!audioStream) {
      return {
        hasAudioStream: false,
        audioCodec: 'none',
        sampleRate: 0,
        channels: 0,
        videoDurationSec,
        audioDurationSec: 0,
        meanVolumeDb: -96,
        maxVolumeDb: -96,
        fileSizeBytes: stat.size,
        isAudibleAndValid: false,
        failureReason: 'Exported MP4 is missing an audio stream.',
      };
    }

    // Run ffmpeg volumedetect filter across the entire MP4 audio stream
    let volStderr = '';
    try {
      const volRes = await execFileAsync(
        'ffmpeg',
        [
          '-hide_banner',
          '-i',
          mp4Path,
          '-vn',
          '-af',
          'volumedetect',
          '-f',
          'null',
          '-',
        ],
        { timeout: 30_000 }
      );
      volStderr = volRes.stderr || '';
    } catch (err: unknown) {
      volStderr =
        err && typeof err === 'object' && 'stderr' in err
          ? String((err as { stderr?: unknown }).stderr || '')
          : '';
    }

    const meanMatch = volStderr.match(/mean_volume:\s*([-\d.]+)\s*dB/i);
    const maxMatch = volStderr.match(/max_volume:\s*([-\d.]+)\s*dB/i);
    const meanVolumeDb = meanMatch ? Number(meanMatch[1]) : -96;
    const maxVolumeDb = maxMatch ? Number(maxMatch[1]) : -96;

    const sampleRate = Number(audioStream.sample_rate || 0);
    const channels = Number(audioStream.channels || 0);
    const audioCodec = String(audioStream.codec_name || 'unknown');
    const durationDelta = Math.abs(videoDurationSec - audioDurationSec);

    if (
      !Number.isFinite(meanVolumeDb) ||
      !Number.isFinite(maxVolumeDb) ||
      meanVolumeDb <= -48 ||
      maxVolumeDb <= -30
    ) {
      return {
        hasAudioStream: true,
        audioCodec,
        sampleRate,
        channels,
        videoDurationSec,
        audioDurationSec,
        meanVolumeDb,
        maxVolumeDb,
        fileSizeBytes: stat.size,
        isAudibleAndValid: false,
        failureReason: `Exported MP4 audio stream is silent or near-silent (mean ${meanVolumeDb.toFixed(
          1
        )} dB, peak ${maxVolumeDb.toFixed(1)} dB). Download blocked.`,
      };
    }

    if (audioDurationSec < 1 || durationDelta > 1.2) {
      return {
        hasAudioStream: true,
        audioCodec,
        sampleRate,
        channels,
        videoDurationSec,
        audioDurationSec,
        meanVolumeDb,
        maxVolumeDb,
        fileSizeBytes: stat.size,
        isAudibleAndValid: false,
        failureReason: `MP4 audio duration (${audioDurationSec.toFixed(
          1
        )}s) does not match video duration (${videoDurationSec.toFixed(1)}s).`,
      };
    }

    return {
      hasAudioStream: true,
      audioCodec,
      sampleRate,
      channels,
      videoDurationSec,
      audioDurationSec,
      meanVolumeDb,
      maxVolumeDb,
      fileSizeBytes: stat.size,
      isAudibleAndValid: true,
    };
  }

  async function checkFfmpegAvailable(): Promise<boolean> {
    try {
      await fs.access('/usr/bin/ffmpeg');
      return true;
    } catch {
      try {
        await execFileAsync('ffmpeg', ['-version']);
        return true;
      } catch {
        return false;
      }
    }
  }

  app.get('/api/lecture/capabilities', async (_req, res) => {
    const ffmpegMp4Available = await checkFfmpegAvailable();
    const geminiConfigured = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    res.json({
      ffmpegMp4Available,
      geminiScriptAvailable: geminiConfigured,
      geminiTtsAvailable: geminiConfigured,
      paidDiffusionVideoConfigured: false,
      engineNote:
        'MedAtlas Lecture Studio renders a consistent stylized procedural Three.js WebGL 3D White-Coat Doctor presenter on the LEFT (when WebGL is available; clean 2D vector portrait fallback otherwise) and an electronic smartboard on the RIGHT with single-concept whiteboard slides, procedural 3D organ/receptor models, honestly labeled 2D medical diagrams, 24 kHz Gemini Neural TTS WAV narration, and FFmpeg H.264/AAC MP4 export.',
      renderingLimitations: [
        'Uses deterministic stylized procedural Three.js 3D meshes and 2D vector smartboard graphics — NOT photorealistic human video or diffusion video generation.',
        'Lip-sync and arm pointing gestures are driven deterministically by the 24 kHz WAV RMS speech envelope and active smartboard bullet/diagram position.',
        'Headless or WebGL-restricted environments automatically fall back to clean 2D vector rendering.',
      ],
    });
  });

  // Generate Unified Blueprint / Textbook-Grounded Continuous Multi-Scene Lecture Script
  app.post('/api/lecture/generate-script', async (req, res) => {
    try {
      const rawTopic = String(req.body?.topic || '').trim();
      const targetDurationSec = Math.max(
        30,
        Math.min(300, Number(req.body?.targetDurationSec) || 90)
      );
      const preferredDiscipline = String(req.body?.preferredDiscipline || 'auto').trim();
      const books: Array<{
        bookKey: string;
        id: string;
        title: string;
        subject?: string;
        pageCount: number;
      }> = Array.isArray(req.body?.books) ? req.body.books : [];
      const passages: Array<{
        pageNumber: number;
        chapterTitle?: string;
        text: string;
        textbookTitle?: string;
        citationTag?: string;
      }> = Array.isArray(req.body?.passages) ? req.body.passages : [];

      if (!rawTopic || rawTopic.length < 2) {
        res.status(400).json({ error: 'Please provide a valid medical lecture topic.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server.',
        });
        return;
      }

      const canonical = canonicalizeMedicalTopic(rawTopic);
      const topic = canonical.canonicalTitle;

      const ai = getGeminiClient();
      const topicCategory = classifyLectureTopicCategory(topic);
      const adaptivePlan = selectAdaptiveLectureStages(topic);
      const allTeachingStages = adaptivePlan.stages.filter(
        (s) => s.stage !== 'summary'
      );
      const maxTeachingScenes =
        targetDurationSec <= 65
          ? Math.min(4, allTeachingStages.length)
          : targetDurationSec <= 125
            ? Math.min(6, allTeachingStages.length)
            : allTeachingStages.length;

      // Select topic-adapted stages without forcing irrelevant sections
      const selectedTeachingStages =
        allTeachingStages.length <= maxTeachingScenes
          ? allTeachingStages
          : [
              allTeachingStages[0],
              ...allTeachingStages
                .slice(1)
                .filter((_, idx, arr) => {
                  const needed = maxTeachingScenes - 1;
                  const step = arr.length / needed;
                  const pickedIndices = Array.from({ length: needed }, (__, k) =>
                    Math.min(arr.length - 1, Math.floor(k * step))
                  );
                  return pickedIndices.includes(idx);
                }),
            ].slice(0, maxTeachingScenes);

      const sceneTargetCount = selectedTeachingStages.length;
      const inferredSystem = canonical.systemTemplate || inferAnatomicalTemplate(topic);

      const allowedTags = Array.from(
        new Set(
          passages
            .map((p) => String(p.citationTag || '').trim().toUpperCase())
            .filter(Boolean)
        )
      );

      const formattedBooks =
        books.length > 0
          ? books
              .map(
                (b) =>
                  `- [${b.bookKey}] "${b.title}" (${b.subject || 'Medicine'}, ${b.pageCount} pages)`
              )
              .join('\n')
          : '- None selected (General Medical Knowledge & External Evidence Mode)';

      const formattedPassages =
        passages.length > 0
          ? passages
              .slice(0, 10)
              .map(
                (p, i) =>
                  `[PASSAGE ${i + 1} | TAG ${p.citationTag || `B1:${p.pageNumber}`} | BOOK "${
                    p.textbookTitle || 'Textbook'
                  }" | PAGE ${p.pageNumber}${p.chapterTitle ? ` — ${p.chapterTitle}` : ''}]\n${p.text}`
              )
              .join('\n\n---\n\n')
          : 'NO MATCHING PASSAGES WERE RETRIEVED FROM UPLOADED TEXTBOOKS. Teach accurately using verified general medical knowledge with citationTags=[].';

      const confuserLabels = canonical.conflictingEntities.map((c) => c.label);
      const primaryStructureLabels = canonical.domainProfile.defaultLandmarks.map((l) => l.label);
      const firstLineDrugs = canonical.domainProfile
        .firstLineDrugRowsTemplate(topic)
        .map((d) => `${d.drugClass} (${d.prototypeAgents})`);

      const stageOutlineLines = selectedTeachingStages
        .map(
          (st, i) =>
            `   - Scene ${i + 1}: pedagogicalStage="${st.stage}" | Stage="${st.stageLabel}" | visualMode="${st.visualMode}" | subjectDiscipline="${st.discipline}"`
        )
        .join('\n');

      const systemInstruction = `You are a calm, encouraging University Medical Professor standing on the LEFT side of a bright medical lecture room beside a large electronic teaching smartboard on the RIGHT.

CANONICAL TOPIC LOCK:
- Every single scene, heading, bullet point, diagram label, and narration sentence MUST strictly teach "${topic}" (${canonical.domainProfile.anatomicalRegionLabel}).
- NEVER drift into unrelated diseases${
        confuserLabels.length > 0
          ? ` (specifically NEVER mention ${confuserLabels.join(', ')} as the primary topic)`
          : ''
      }.

BEGINNER-FRIENDLY & CONTINUOUS LECTURE STYLE:
1. Assume the learner is a beginner medical student: explain every concept in a simple, calm, logical sequence, briefly clarifying medical terms the moment they appear.
2. Greet or introduce "${topic}" ONLY in Scene 1. Scenes 2 through ${sceneTargetCount} MUST connect naturally and smoothly from the previous scene ("Building on this...", "Next, let us see how...", "On the smartboard...") with ZERO repeated greetings and ZERO interruptions.
3. NEVER pause for questions, NEVER ask quiz questions, and NEVER insert interactive checkpoints in the spoken narration.
4. TOPIC-ADAPTIVE STRUCTURE (Topic Category: "${topicCategory}"):
   Generate ${sceneTargetCount} sequential teaching scenes following ONLY these relevant stages (irrelevant stages have been deliberately omitted; do NOT force omitted sections):
${stageOutlineLines}
   (Do NOT include the final Summary scene in JSON; our deterministic engine appends the closing Summary & Provenance slide automatically.)
5. CITATION HONESTY:
   - Allowed citationTags: ${allowedTags.length > 0 ? allowedTags.join(', ') : 'NONE'}.
   - Only set sourceBasis="textbook" with verified citationTags when directly supported by the retrieved passages below.
   - Otherwise set sourceBasis="general_medical_knowledge" and citationTags=[]. NEVER fabricate page numbers or citations.
6. Provide spoken narration in TWO calm, clear tracks for every scene:
   - narrationEn: Simple, calm, beginner-friendly Medical English (2-3 smooth spoken sentences, ~32-48 words per scene) explicitly referencing what appears on the smartboard.
   - narrationArEg: Natural, calm, beginner-friendly Egyptian Medical Arabic (عامية مصرية طبية هادية ومبسطة للمبتدئين) keeping ALL key English medical terms, anatomical structures, receptors, labs, and drug names inline in English.
7. CLEAN RIGHT-SIDE WHITEBOARD SLIDES (SINGLE ACTIVE CONCEPT):
   - Display ONLY the single concept currently being explained.
   - title: Clean, large-heading slide title (<= 54 chars).
   - keyBullets: Exactly 3 short, scannable bullet points (<= 65 chars each, no long paragraphs).
   - onScreenLabels: 3-4 short, accurate anatomical/diagram labels (<= 30 chars each, zero overlap) synchronized with the narration.
   - Total target lecture duration is ~${targetDurationSec}s.`;

      const promptText = `Canonical Lecture Topic: "${topic}" (User input: "${rawTopic}")
Topic Category: "${topicCategory}"
Organ System Template: "${inferredSystem}"
Key Structures: ${primaryStructureLabels.join(', ')}
Core Mechanisms: ${canonical.domainProfile.pathophysiologySummaryTemplate(topic)}
First-Line Drug Targets: ${firstLineDrugs.join(', ')}
Preferred Subject Discipline Focus: "${preferredDiscipline}"
Selected Textbooks:
${formattedBooks}

=== RETRIEVED VERIFIED TEXTBOOK PASSAGES ===
${formattedPassages}
=== END OF PASSAGES ===`;

      const generationConfig = {
        systemInstruction,
        temperature: 0.2,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            topic: { type: Type.STRING },
            systemTemplate: { type: Type.STRING },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  pedagogicalStage: { type: Type.STRING },
                  title: { type: Type.STRING },
                  visualMode: { type: Type.STRING },
                  subjectDiscipline: { type: Type.STRING },
                  systemTemplate: { type: Type.STRING },
                  narrationEn: { type: Type.STRING },
                  narrationArEg: { type: Type.STRING },
                  visualDescription: { type: Type.STRING },
                  keyBullets: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  onScreenLabels: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  highlightedCallouts: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  transitionType: { type: Type.STRING },
                  durationSec: { type: Type.NUMBER },
                  sourceBasis: { type: Type.STRING },
                  citationTags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: [
                  'pedagogicalStage',
                  'title',
                  'visualMode',
                  'subjectDiscipline',
                  'narrationEn',
                  'narrationArEg',
                  'visualDescription',
                  'keyBullets',
                  'onScreenLabels',
                  'transitionType',
                  'durationSec',
                  'sourceBasis',
                  'citationTags',
                ],
              },
            },
          },
          required: ['title', 'topic', 'systemTemplate', 'scenes'],
        },
      };

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: promptText,
          config: {
            ...generationConfig,
            abortSignal: AbortSignal.timeout(22_000),
          },
        });
      } catch (primaryErr) {
        const errMsg =
          primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        const isTransient =
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('429') ||
          errMsg.toLowerCase().includes('abort') ||
          errMsg.toLowerCase().includes('timeout');
        if (isTransient) {
          const { thinkingConfig: _omit, ...liteConfig } = generationConfig;
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: promptText,
            config: liteConfig,
          });
        } else {
          throw primaryErr;
        }
      }

      const rawText = (response.text || '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Empty response from lecture script model.' });
        return;
      }

      res.json({ lecture: JSON.parse(rawText) });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate medical lecture script.';
      console.error('Lecture script error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Synthesize Verified, Non-Silent Spoken Narration via Gemini Neural Audio (24kHz mono 16-bit WAV)
  app.post('/api/lecture/tts', async (req, res) => {
    try {
      const rawText = String(req.body?.text || '').trim();
      const rawVoice = String(req.body?.voiceName || 'Kore').trim();
      const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
      const voiceName = validVoices.includes(rawVoice) ? rawVoice : 'Kore';

      if (!rawText) {
        res.status(400).json({ error: 'Narration text is required for TTS synthesis.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured for neural speech synthesis.',
        });
        return;
      }

      const spokenText = prepareTextForMedicalTts(rawText);
      const ai = getGeminiClient();

      const unaryModels = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'] as const;
      const attemptErrors: string[] = [];
      let rawAudioBuffer: Buffer | null = null;
      let sourceMimeType = 'audio/wav';
      let modelUsed = '';

      for (const candidateModel of unaryModels) {
        const cooldown = ttsModelCooldownUntil.get(candidateModel);
        if (cooldown && cooldown.untilMs > Date.now()) {
          attemptErrors.push(`${candidateModel}: skipped (quota cooldown: ${cooldown.reason})`);
          continue;
        }

        try {
          const response = await ai.models.generateContent({
            model: candidateModel,
            contents: [
              {
                role: 'user',
                parts: [{ text: spokenText }],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              abortSignal: AbortSignal.timeout(25_000),
            },
          });

          const parts = response.candidates?.[0]?.content?.parts || [];
          const audioPart = parts.find((p) => Boolean(p.inlineData?.data));
          const b64 = audioPart?.inlineData?.data;
          if (!b64) {
            throw new Error(`No audio inlineData returned from ${candidateModel}.`);
          }

          rawAudioBuffer = Buffer.from(b64, 'base64');
          sourceMimeType = audioPart?.inlineData?.mimeType || 'audio/wav';
          modelUsed = candidateModel;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const cooldownMs = parseQuotaCooldownMs(msg);
          if (cooldownMs > 0) {
            const conciseReason = /PerDay/i.test(msg)
              ? 'Free-tier daily request limit reached'
              : 'Free-tier per-minute rate limit reached';
            ttsModelCooldownUntil.set(candidateModel, {
              untilMs: Date.now() + cooldownMs,
              reason: conciseReason,
            });
            attemptErrors.push(`${candidateModel}: 429 ${conciseReason}`);
          } else {
            attemptErrors.push(`${candidateModel}: ${msg.slice(0, 180)}`);
          }
        }
      }

      // If unary TTS models hit free-tier RPM/RPD quota or transient error, synthesize via Gemini 3.8 Live native audio
      if (!rawAudioBuffer) {
        try {
          const liveAudio = await synthesizeViaGeminiLiveAudio(ai, spokenText, voiceName);
          rawAudioBuffer = liveAudio.audioBytes;
          sourceMimeType = liveAudio.mimeType;
          modelUsed = 'gemini-3.8-live';
        } catch (liveErr) {
          const liveMsg = liveErr instanceof Error ? liveErr.message : String(liveErr);
          attemptErrors.push(`gemini-3.8-live: ${liveMsg.slice(0, 200)}`);
        }
      }

      if (!rawAudioBuffer) {
        res.status(429).json({
          error: `Neural speech synthesis failed across Gemini audio models (${attemptErrors.join(
            ' | '
          )}).`,
          attemptErrors,
        });
        return;
      }

      // Decode container/MIME properly, verify non-silent PCM samples, and peak-normalize to -3.0 dBFS
      const decoded = await decodeVerifyAndNormalizeTtsAudio(
        rawAudioBuffer,
        sourceMimeType
      );

      res.json({
        audioWavBase64: decoded.canonicalWavBuffer.toString('base64'),
        mimeType: 'audio/wav',
        sourceMimeType,
        detectedContainer: decoded.detectedKind,
        sampleRate: 24000,
        channels: 1,
        bitsPerSample: 16,
        sampleCount: decoded.sampleCount,
        durationSec: decoded.durationSec,
        meanVolumeDb: decoded.meanVolumeDb,
        peakVolumeDb: decoded.peakVolumeDb,
        modelUsed,
        quotaNotes: attemptErrors.length > 0 ? attemptErrors : undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to synthesize and verify neural speech audio.';
      console.error('Gemini TTS verification error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Chunked Server-Side H.264 + Verified AAC MP4 Video Export via FFmpeg (Zero Silent Fallback!)
  app.post('/api/lecture/export/init', async (req, res) => {
    try {
      const ffmpegReady = await checkFfmpegAvailable();
      if (!ffmpegReady) {
        res.status(501).json({
          error: 'FFmpeg MP4 encoder is not installed in this server environment.',
        });
        return;
      }

      // Clean up stale export sessions older than 15 minutes
      const now = Date.now();
      for (const [id, meta] of mp4ExportSessions.entries()) {
        if (now - meta.createdAt > 15 * 60_000) {
          mp4ExportSessions.delete(id);
          await fs.rm(meta.dirPath, { recursive: true, force: true }).catch(() => {});
        }
      }

      const fps = Math.max(6, Math.min(24, Number(req.body?.fps) || 8));
      const totalDurationSec = Math.max(4, Number(req.body?.totalDurationSec) || 60);
      const sceneCount = Math.max(1, Number(req.body?.sceneCount) || 1);
      const verifiedSceneCount = Number(req.body?.verifiedSceneCount ?? 0);

      if (verifiedSceneCount < sceneCount) {
        res.status(400).json({
          error: `Cannot export MP4: only ${verifiedSceneCount} of ${sceneCount} scenes have verified narration audio. Synthesize all scenes first.`,
        });
        return;
      }

      const audioWavBase64 =
        typeof req.body?.audioWavBase64 === 'string' ? req.body.audioWavBase64.trim() : '';

      if (audioWavBase64.length < 128) {
        res.status(400).json({
          error:
            'Cannot initialize MP4 export: missing verified WAV narration track. Silent MP4 export is blocked.',
        });
        return;
      }

      const wavBuffer = Buffer.from(audioWavBase64, 'base64');
      const strictWav = parseStrictRiffWav(
        new Uint8Array(wavBuffer.buffer, wavBuffer.byteOffset, wavBuffer.byteLength)
      );
      if (!strictWav.ok || strictWav.pcmSamples.length === 0) {
        res.status(400).json({
          error:
            strictWav.error ||
            'Cannot initialize MP4 export: narration audio is not a valid decodable RIFF WAV file.',
        });
        return;
      }

      const pcmStats = analyzePcmSignal(strictWav.pcmSamples, strictWav.sampleRate, 1.0);
      if (!pcmStats.isNonSilentSpeech) {
        res.status(422).json({
          error:
            pcmStats.failureReason ||
            `Cannot initialize MP4 export: narration audio track is silent (mean ${pcmStats.meanDb} dBFS, peak ${pcmStats.peakDb} dBFS).`,
        });
        return;
      }

      const sessionId = crypto.randomUUID();
      const dirPath = path.join(os.tmpdir(), `medatlas-mp4-${sessionId}`);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'narration.wav'), wavBuffer);

      mp4ExportSessions.set(sessionId, {
        dirPath,
        fps,
        audioDurationSec: pcmStats.durationSec,
        audioMeanDb: pcmStats.meanDb,
        audioPeakDb: pcmStats.peakDb,
        totalDurationSec,
        sceneCount,
        frameCount: 0,
        createdAt: now,
      });

      res.json({
        sessionId,
        fps,
        audioVerified: true,
        audioDurationSec: pcmStats.durationSec,
        audioMeanDb: pcmStats.meanDb,
        audioPeakDb: pcmStats.peakDb,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to initialize MP4 export.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/lecture/export/frames', async (req, res) => {
    try {
      const sessionId = String(req.body?.sessionId || '').trim();
      const startIndex = Math.max(0, Number(req.body?.startIndex) || 0);
      const frames: string[] = Array.isArray(req.body?.frames) ? req.body.frames : [];

      const session = mp4ExportSessions.get(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Export session expired or not found.' });
        return;
      }

      await Promise.all(
        frames.map(async (rawDataUrlOrB64, offset) => {
          const cleanB64 = rawDataUrlOrB64.replace(/^data:image\/\w+;base64,/, '');
          const frameNum = String(startIndex + offset + 1).padStart(5, '0');
          const filePath = path.join(session.dirPath, `frame_${frameNum}.jpg`);
          await fs.writeFile(filePath, Buffer.from(cleanB64, 'base64'));
        })
      );

      session.frameCount = Math.max(session.frameCount, startIndex + frames.length);
      res.json({ ok: true, frameCount: session.frameCount });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to write video frames.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/lecture/export/finalize', async (req, res) => {
    const sessionId = String(req.body?.sessionId || '').trim();
    const session = mp4ExportSessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Export session expired or not found.' });
      return;
    }

    mp4ExportSessions.delete(sessionId);

    try {
      if (session.frameCount < 1) {
        res.status(400).json({ error: 'No frames were uploaded for MP4 encoding.' });
        return;
      }

      const narrationWavPath = path.join(session.dirPath, 'narration.wav');
      const outputMp4Path = path.join(session.dirPath, 'lecture_output.mp4');
      const framePattern = path.join(session.dirPath, 'frame_%05d.jpg');

      const rawVideoDurationSec = session.frameCount / session.fps;
      // Preserve complete narration without truncating the end while aligning audio & video durations tightly
      const targetDurationSec = Math.max(rawVideoDurationSec, session.audioDurationSec);

      const ffmpegArgs: string[] = [
        '-y',
        '-framerate',
        String(session.fps),
        '-i',
        framePattern,
        '-i',
        narrationWavPath,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2,tpad=stop_mode=clone:stop_duration=2',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-ar',
        '24000',
        '-ac',
        '1',
        '-af',
        `apad=whole_dur=${targetDurationSec.toFixed(3)}`,
        '-t',
        targetDurationSec.toFixed(3),
        '-movflags',
        '+faststart',
        outputMp4Path,
      ];

      await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 120_000 });

      // Validate the final MP4's AAC stream & signal level before allowing download!
      const validation = await inspectAndValidateMp4Audio(outputMp4Path);
      if (!validation.isAudibleAndValid) {
        res.status(422).json({
          error:
            validation.failureReason ||
            'Exported MP4 failed final audio stream & signal-level validation.',
          validation,
        });
        return;
      }

      const mp4Buffer = await fs.readFile(outputMp4Path);

      await cleanupExpiredMp4Artifacts();
      const downloadToken = crypto.randomUUID();
      const cachedMp4Path = path.join(os.tmpdir(), `medatlas-dl-${downloadToken}.mp4`);
      await fs.copyFile(outputMp4Path, cachedMp4Path);
      mp4DownloadArtifacts.set(downloadToken, {
        filePath: cachedMp4Path,
        sizeBytes: mp4Buffer.byteLength,
        createdAt: Date.now(),
      });

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', String(mp4Buffer.byteLength));
      res.setHeader('X-MedAtlas-Audio-Included', 'neural-wav');
      res.setHeader('X-MedAtlas-Audio-Validation', JSON.stringify(validation));
      res.setHeader('X-MedAtlas-Download-Token', downloadToken);
      res.setHeader(
        'Access-Control-Expose-Headers',
        'X-MedAtlas-Audio-Included, X-MedAtlas-Audio-Validation, X-MedAtlas-Download-Token'
      );
      res.send(mp4Buffer);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'FFmpeg failed to encode MP4 lecture.';
      console.error('FFmpeg MP4 export error:', msg);
      res.status(500).json({ error: msg });
    } finally {
      await fs.rm(session.dirPath, { recursive: true, force: true }).catch(() => {});
    }
  });

  // Android-Compatible Direct HTTP MP4 Attachment & Byte-Range Download Endpoint
  app.get('/api/lecture/export/download/:token', async (req, res) => {
    try {
      await cleanupExpiredMp4Artifacts();
      const token = String(req.params.token || '').trim();
      const artifact = mp4DownloadArtifacts.get(token);
      if (!artifact) {
        res.status(404).json({
          error: 'Rendered MP4 download token expired or not found. Please click Render & Validate MP4 again.',
        });
        return;
      }

      const stat = await fs.stat(artifact.filePath).catch(() => null);
      if (!stat || stat.size < 1024) {
        mp4DownloadArtifacts.delete(token);
        res.status(404).json({
          error: 'Rendered MP4 file is no longer available on disk. Please re-render.',
        });
        return;
      }

      const rawFilename = String(req.query.filename || 'medatlas-lecture.mp4').trim();
      const safeBase =
        rawFilename
          .replace(/\.mp4$/i, '')
          .replace(/[^a-zA-Z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 72) || 'medatlas-lecture';
      const safeFilename = `${safeBase}.mp4`;

      const totalSize = stat.size;
      const rangeHeader = req.headers.range;

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
      );
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=600');

      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
        if (!match) {
          res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
          return;
        }
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(totalSize - 1, parseInt(match[2], 10)) : totalSize - 1;
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          start >= totalSize ||
          end < start
        ) {
          res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
          return;
        }

        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        res.setHeader('Content-Length', String(chunkSize));
        createReadStream(artifact.filePath, { start, end }).pipe(res);
        return;
      }

      res.status(200);
      res.setHeader('Content-Length', String(totalSize));
      createReadStream(artifact.filePath).pipe(res);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to stream MP4 download.';
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MedAtlas Tutor server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
