import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { MedicalTextbook, TextbookPage } from '../types/medical';
import { chunkPagesIntoPassages } from './textbookEngine';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return pdfjsLib;
    });
  }
  return pdfjsPromise;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function cleanFileNameToTitle(fileName: string): string {
  const cleaned = fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function inferPageHeading(pageText: string): string | undefined {
  const lines = pageText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 3)) {
    if (/^\d+$/.test(line) || /^page\s+\d+$/i.test(line)) continue;
    if (line.length >= 4 && line.length <= 105) {
      return line;
    }
  }
  return undefined;
}

export function inferMedicalSubject(title: string, sampleText: string): string {
  const hay = `${title} ${sampleText.slice(0, 4500)}`.toLowerCase();
  const rules: Array<{ subject: string; keywords: string[] }> = [
    {
      subject: 'Pharmacology & Therapeutics',
      keywords: ['pharmacology', 'therapeutics', 'drug', 'pharmacokinetics', 'receptor', 'antidote', 'dosage'],
    },
    {
      subject: 'Cardiology & Critical Care',
      keywords: ['cardiology', 'coronary', 'myocardial', 'arrhythmia', 'heart failure', 'electrocardiogram', 'valvular'],
    },
    {
      subject: 'Pulmonology',
      keywords: ['pulmonology', 'respiratory', 'asthma', 'copd', 'spirometry', 'pleural', 'alveolar'],
    },
    {
      subject: 'Gastroenterology & Hepatology',
      keywords: ['gastroenterology', 'hepatology', 'cirrhosis', 'pancreatitis', 'colitis', 'esophageal'],
    },
    {
      subject: 'Nephrology & Electrolytes',
      keywords: ['nephrology', 'glomerular', 'renal', 'dialysis', 'hyponatremia', 'hyperkalemia'],
    },
    {
      subject: 'Endocrinology & Metabolism',
      keywords: ['endocrinology', 'thyroid', 'adrenal', 'pituitary', 'ketoacidosis', 'insulin'],
    },
    {
      subject: 'Hematology & Oncology',
      keywords: ['hematology', 'oncology', 'leukemia', 'lymphoma', 'anemia', 'thrombocytopenia', 'coagulation'],
    },
    {
      subject: 'Infectious Diseases',
      keywords: ['infectious', 'microbiology', 'bacteremia', 'meningitis', 'antimicrobial', 'sepsis'],
    },
    {
      subject: 'Neurology',
      keywords: ['neurology', 'stroke', 'epilepticus', 'seizure', 'demyelinating', 'neuropathy'],
    },
    {
      subject: 'Pathology',
      keywords: ['pathology', 'histopathology', 'biopsy', 'neoplasia', 'granuloma', 'robbins'],
    },
    {
      subject: 'Rheumatology & Immunology',
      keywords: ['rheumatology', 'lupus', 'autoimmune', 'vasculitis', 'arthritis'],
    },
    {
      subject: 'Surgery',
      keywords: ['surgery', 'surgical', 'laparoscopic', 'operative', 'trauma', 'appendicitis'],
    },
    {
      subject: 'Pediatrics',
      keywords: ['pediatrics', 'pediatric', 'neonatal', 'congenital', 'childhood'],
    },
    {
      subject: 'Obstetrics & Gynecology',
      keywords: ['obstetrics', 'gynecology', 'preeclampsia', 'gestational', 'postpartum'],
    },
  ];

  let bestSubject = 'Internal Medicine';
  let bestHits = 0;

  for (const rule of rules) {
    let hits = 0;
    for (const kw of rule.keywords) {
      if (title.toLowerCase().includes(kw)) hits += 3;
      if (hay.includes(kw)) hits += 1;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestSubject = rule.subject;
    }
  }

  return bestSubject;
}

const MAX_PDF_FILE_BYTES = 150 * 1024 * 1024;
const MAX_INLINE_SCANNED_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Parses and indexes 100% of pages (1..numPages) in an uploaded medical textbook PDF.
 * Cleans up per-page PDF.js resources and yields periodically so large multi-hundred-page
 * textbooks index smoothly on Android and desktop browsers without memory spikes.
 */
export async function parseUploadedPdf(
  file: File,
  onProgress?: (current: number, total: number) => void,
  options?: { subject?: string; customTitle?: string }
): Promise<MedicalTextbook> {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    throw new Error(`"${file.name}" is not a valid PDF document (.pdf).`);
  }
  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty (0 bytes).`);
  }
  if (file.size > MAX_PDF_FILE_BYTES) {
    throw new Error(
      `"${file.name}" exceeds the 150 MB browser memory safeguard. Split very large scanned volumes by section before uploading.`
    );
  }

  const pdfjsLib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
  });

  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;

  if (pageCount < 1) {
    await loadingTask.destroy();
    throw new Error(`"${file.name}" does not contain any readable pages.`);
  }

  const pages: TextbookPage[] = [];
  let totalCharacters = 0;

  try {
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      onProgress?.(pageNum, pageCount);

      const page = await pdf.getPage(pageNum);
      try {
        const textContent = await page.getTextContent();

        let lastY: number | null = null;
        let lastHeight = 12;
        const chunks: string[] = [];

        for (const rawItem of textContent.items) {
          if ('str' in rawItem) {
            const y = Array.isArray(rawItem.transform) ? Number(rawItem.transform[5]) : null;
            const itemHeight =
              typeof rawItem.height === 'number' && rawItem.height > 0
                ? rawItem.height
                : lastHeight;

            const trimmedStr = rawItem.str.trim();
            const isListOrHeadingStart =
              /^([-•*]|\d+[.)])\s/.test(trimmedStr) || /^chapter\s+\d+/i.test(trimmedStr);

            if (lastY !== null && y !== null) {
              const deltaY = Math.abs(y - lastY);
              if (deltaY > Math.max(15, itemHeight * 1.55)) {
                chunks.push('\n\n');
              } else if (deltaY > 5) {
                const prevChunk = chunks[chunks.length - 1] || '';
                if (isListOrHeadingStart || /[:]$/.test(prevChunk.trim())) {
                  chunks.push('\n');
                } else if (!prevChunk.endsWith(' ') && !prevChunk.endsWith('\n')) {
                  chunks.push(' ');
                }
              } else if (
                chunks.length > 0 &&
                !chunks[chunks.length - 1].endsWith('\n') &&
                !chunks[chunks.length - 1].endsWith(' ')
              ) {
                chunks.push(' ');
              }
            }

            chunks.push(rawItem.str);
            if (y !== null) lastY = y;
            lastHeight = itemHeight;
          }
        }

        const pageText = chunks
          .join('')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n[ \t]+/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        totalCharacters += pageText.length;
        const chapterTitle = pageText ? inferPageHeading(pageText) : undefined;

        pages.push({
          pageNumber: pageNum,
          text: pageText || `(Scanned visual content on page ${pageNum})`,
          chapterTitle,
        });
      } finally {
        page.cleanup();
      }

      if (pageNum % 10 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    await pdf.cleanup();
    await loadingTask.destroy();
  }

  const avgCharsPerPage = totalCharacters / pageCount;
  let pdfBase64: string | undefined;
  let scanNotice: string | undefined;

  if (avgCharsPerPage < 80) {
    if (file.size <= MAX_INLINE_SCANNED_PDF_BYTES) {
      pdfBase64 = arrayBufferToBase64(arrayBuffer);
      scanNotice = 'Image/scanned PDF detected — multimodal visual inspection enabled.';
    } else {
      scanNotice =
        'Scanned PDF lacks embedded text and exceeds 10 MB inline vision limit; upload an OCR-indexed PDF for exact passage retrieval.';
    }
  }

  const passages = chunkPagesIntoPassages(pages);
  const resolvedTitle =
    options?.customTitle?.trim() || cleanFileNameToTitle(file.name) || 'Medical Textbook';
  const sampleText = pages
    .slice(0, 6)
    .map((p) => p.text)
    .join(' ');
  const resolvedSubject =
    options?.subject?.trim() || inferMedicalSubject(resolvedTitle, sampleText);

  return {
    id: `book-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: resolvedTitle,
    subject: resolvedSubject,
    fileName: file.name,
    pageCount,
    passageCount: passages.length,
    pages,
    uploadedAt: new Date().toISOString(),
    fileSizeBytes: file.size,
    pdfBase64,
    scanNotice,
  };
}
