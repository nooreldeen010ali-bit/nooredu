import type {
  AnatomicalSystemTemplate,
  DisciplineVisualKind,
  InfographicCalloutPin,
  IntegratedScienceDisciplineId,
} from '../types/medical';
import {
  canonicalizeMedicalTopic,
  type CanonicalTopicDescriptor,
  type StrictTopicAtlasKey,
} from './topicCanonicalizer';

const heartAnatomyUrl = new URL(
  '../assets/images/atlas_heart_anatomy_1793188659281.jpg',
  import.meta.url
).href;
const heartPathoUrl = new URL(
  '../assets/images/atlas_heart_pathophysiology_1793188661886.jpg',
  import.meta.url
).href;
const renalNephronUrl = new URL(
  '../assets/images/atlas_renal_nephron_1793188662652.jpg',
  import.meta.url
).href;
const respiratoryAlveoliUrl = new URL(
  '../assets/images/atlas_respiratory_alveoli_1793188664233.jpg',
  import.meta.url
).href;
const endocrinePancreasUrl = new URL(
  '../assets/images/atlas_endocrine_pancreas_1793188666227.jpg',
  import.meta.url
).href;
const neurovascularBrainUrl = new URL(
  '../assets/images/atlas_neurovascular_brain_1793188665648.jpg',
  import.meta.url
).href;
const hepatobiliaryPortalUrl = new URL(
  '../assets/images/atlas_hepatobiliary_portal_1793196727018.jpg',
  import.meta.url
).href;
const hematologyCoagulationUrl = new URL(
  '../assets/images/atlas_hematology_coagulation_1793196728688.jpg',
  import.meta.url
).href;

/**
 * Only genuine organ-matched 3D anatomical plates are registered here.
 * Generic stock plates (generic histology, generic immune synapse, generic receptor)
 * are intentionally excluded from topic-specific PDF embedding so unrelated illustrations
 * are NEVER reused across different medical diseases.
 */
export type PdfAtlasImageKey = StrictTopicAtlasKey;

const BROWSER_URL_MAP: Record<PdfAtlasImageKey, string> = {
  cardiopulmonary_anatomy: heartAnatomyUrl,
  cardiopulmonary_patho: heartPathoUrl,
  renal: renalNephronUrl,
  respiratory: respiratoryAlveoliUrl,
  endocrine: endocrinePancreasUrl,
  neurology: neurovascularBrainUrl,
  hepatobiliary: hepatobiliaryPortalUrl,
  hematology: hematologyCoagulationUrl,
};

const cachedDataUrls = new Map<PdfAtlasImageKey, string>();
let preloadPromise: Promise<Record<string, string>> | null = null;

async function fetchImageAsJpegDataUrl(url: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const rawDataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!rawDataUrl) return null;

    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = rawDataUrl;
    });
    if (!img || img.naturalWidth === 0) {
      return rawDataUrl;
    }

    const maxW = 1040;
    const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
    const targetW = Math.max(1, Math.round(img.naturalWidth * scale));
    const targetH = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', 0.86);
  } catch {
    return null;
  }
}

export async function loadPdfAtlasImagesInBrowser(): Promise<Record<string, string>> {
  if (cachedDataUrls.size === Object.keys(BROWSER_URL_MAP).length) {
    return Object.fromEntries(cachedDataUrls.entries());
  }
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const entries = Object.entries(BROWSER_URL_MAP) as Array<[PdfAtlasImageKey, string]>;
    await Promise.all(
      entries.map(async ([key, url]) => {
        if (cachedDataUrls.has(key)) return;
        const dataUrl = await fetchImageAsJpegDataUrl(url);
        if (dataUrl) {
          cachedDataUrls.set(key, dataUrl);
        }
      })
    );
    preloadPromise = null;
    return Object.fromEntries(cachedDataUrls.entries());
  })();

  return preloadPromise;
}

/**
 * Resolves the strict illustration key for a canonical topic and discipline.
 * - Returns an organ-matched raster key ONLY when `canonical.allowedRasterAtlasKey` is non-null
 *   AND the visual is an anatomical/clinical organ plate (or cardiovascular pathophysiology).
 * - Otherwise returns `vector:<organDomain>:<disciplineOrVisual>`, guaranteeing a dedicated
 *   topic-specific vector medical illustration rather than a mismatched organ or generic stock image.
 */
export function resolveStrictTopicAtlasKey(
  canonical: CanonicalTopicDescriptor,
  discipline?: IntegratedScienceDisciplineId,
  visualKind?: DisciplineVisualKind
): string {
  const suffix = discipline || visualKind || 'overview';
  if (!canonical.allowedRasterAtlasKey) {
    return `vector:${canonical.organDomain}:${suffix}`;
  }

  if (
    discipline === 'pathology' ||
    discipline === 'pharmacology' ||
    discipline === 'immunology' ||
    discipline === 'physiology'
  ) {
    return `vector:${canonical.organDomain}:${discipline}`;
  }

  if (discipline === 'pathophysiology') {
    if (canonical.allowedRasterAtlasKey === 'cardiopulmonary_anatomy') {
      return 'cardiopulmonary_patho';
    }
    return `vector:${canonical.organDomain}:pathophysiology`;
  }

  return canonical.allowedRasterAtlasKey;
}

function escapeXml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds an editable-text, topic-specific SVG schematic data URL for the Studio browser preview
 * whenever a dedicated vector diagram is used instead of a raster organ plate.
 */
export function buildTopicSvgPreviewDataUrl(
  canonical: CanonicalTopicDescriptor,
  discipline?: IntegratedScienceDisciplineId,
  visualTitle?: string,
  pins?: InfographicCalloutPin[]
): string {
  const title = escapeXml((visualTitle || `${canonical.canonicalTitle} — Anatomical Schematic`).slice(0, 68));
  const region = escapeXml(canonical.domainProfile.anatomicalRegionLabel.slice(0, 74));
  const activePins = (pins && pins.length > 0 ? pins : canonical.domainProfile.defaultLandmarks).slice(0, 4);

  let organArtwork = '';
  if (canonical.organDomain === 'gastroduodenal') {
    organArtwork = `
      <!-- Esophagus -> Stomach J-curve -> Pylorus -> Duodenal Bulb (D1) -->
      <path d="M 185 38 L 185 78 C 145 78, 108 110, 114 162 C 120 214, 178 242, 255 228 C 292 220, 315 198, 336 184 L 368 184 C 404 184, 426 206, 422 238 L 402 238 C 402 214, 386 204, 362 204 L 336 204 C 314 216, 286 244, 244 250 C 156 262, 92 222, 88 156 C 84 98, 134 62, 168 62 L 168 38 Z" fill="#FFE4E6" stroke="#BE123C" stroke-width="2.5"/>
      <!-- Mucus-HCO3- Protective Gel Band -->
      <path d="M 132 145 C 142 195, 195 215, 260 206" fill="none" stroke="#0284C7" stroke-width="5" stroke-dasharray="7 4"/>
      <!-- Antral Ulcer Crater -->
      <circle cx="268" cy="204" r="11" fill="#FEF2F2" stroke="#DC2626" stroke-width="2.5"/>
      <path d="M 261 204 L 275 204 M 268 197 L 268 211" stroke="#DC2626" stroke-width="2"/>
      <!-- Duodenal Bulb (D1) Ulcer & Gastroduodenal Artery -->
      <circle cx="382" cy="194" r="10" fill="#FFFBEB" stroke="#D97706" stroke-width="2.5"/>
      <path d="M 396 152 L 396 238" stroke="#E11D48" stroke-width="3"/>
      <text x="112" y="92" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#0F4C81">Gastric Fundus &amp; Oxyntic Mucosa</text>
      <text x="135" y="138" font-family="Inter, sans-serif" font-size="9.5" font-weight="600" fill="#0369A1">Mucus-HCO3- + PGE2 Barrier</text>
      <text x="225" y="238" font-family="Inter, sans-serif" font-size="9.5" font-weight="700" fill="#BE123C">Antral / Lesser Curvature Ulcer</text>
      <text x="336" y="144" font-family="Inter, sans-serif" font-size="9.5" font-weight="700" fill="#B45309">D1 Bulb &amp; Gastroduodenal a.</text>
    `;
  } else if (canonical.organDomain === 'esophageal') {
    organArtwork = `
      <!-- Tubular Esophagus + Dilated Body + LES High-Pressure Zone -->
      <path d="M 218 42 L 210 154 L 236 206 L 236 236 L 254 236 L 254 206 L 280 154 L 272 42 Z" fill="#E0F2FE" stroke="#0369A1" stroke-width="2.5"/>
      <!-- Crural Diaphragm -->
      <path d="M 140 206 Q 195 190 234 206 M 256 206 Q 295 190 350 206" fill="none" stroke="#B45309" stroke-width="4" stroke-linecap="round"/>
      <!-- LES High-Pressure Ring -->
      <ellipse cx="245" cy="204" rx="18" ry="8" fill="#FEF3C7" stroke="#D97706" stroke-width="2.5"/>
      <text x="292" y="108" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#0F4C81">Esophageal Body &amp; Myenteric Plexus</text>
      <text x="288" y="206" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#B45309">LES High-Pressure Zone</text>
    `;
  } else if (canonical.organDomain === 'pancreatic') {
    organArtwork = `
      <!-- Pancreatic Head, Body, Tail & Main Duct of Wirsung -->
      <path d="M 142 162 C 138 124, 178 112, 214 128 L 372 142 C 398 146, 398 176, 370 180 L 216 196 C 176 212, 144 198, 142 162 Z" fill="#FEF3C7" stroke="#D97706" stroke-width="2.5"/>
      <path d="M 168 164 L 368 160" fill="none" stroke="#0284C7" stroke-width="3.5"/>
      <path d="M 168 92 L 168 164" fill="none" stroke="#0F766E" stroke-width="3.5"/>
      <text x="220" y="118" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#B45309">Exocrine Pancreas &amp; Acinar Parenchyma</text>
      <text x="230" y="176" font-family="Inter, sans-serif" font-size="9.5" font-weight="600" fill="#0369A1">Main Pancreatic Duct (Wirsung)</text>
    `;
  } else if (canonical.organDomain === 'intestinal_colorectal') {
    organArtwork = `
      <!-- Colonic Frame & Terminal Ileum -->
      <path d="M 148 228 L 148 96 Q 148 72 176 72 L 328 72 Q 356 72 356 96 L 356 212 Q 356 234 328 234 L 280 234" fill="none" stroke="#BE123C" stroke-width="18" stroke-linecap="round"/>
      <path d="M 148 228 L 148 96 Q 148 72 176 72 L 328 72 Q 356 72 356 96 L 356 212 Q 356 234 328 234 L 280 234" fill="none" stroke="#FFE4E6" stroke-width="12" stroke-linecap="round"/>
      <text x="195" y="148" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#9F1239">Ileocolonic Mucosa &amp; Crypt Architecture</text>
    `;
  } else {
    organArtwork = `
      <rect x="96" y="76" width="142" height="148" rx="12" fill="#F0F9FF" stroke="#0284C7" stroke-width="2"/>
      <rect x="268" y="76" width="142" height="148" rx="12" fill="#FFF1F2" stroke="#E11D48" stroke-width="2"/>
      <path d="M 244 150 L 262 150" stroke="#0F4C81" stroke-width="3"/>
      <text x="112" y="102" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#0369A1">Homeostatic Baseline</text>
      <text x="284" y="102" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#BE123C">Disease Remodeling</text>
    `;
  }

  const pinMarkup = activePins
    .map((pin, idx) => {
      const cx = Math.round(55 + ((pin.xPct || 25 + idx * 18) / 100) * 390);
      const cy = Math.round(44 + ((pin.yPct || 28 + idx * 16) / 100) * 195);
      return `
        <circle cx="${cx}" cy="${cy}" r="10" fill="#0F4C81" stroke="#FFFFFF" stroke-width="2"/>
        <text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-family="Inter, sans-serif" font-size="9.5" font-weight="700" fill="#FFFFFF">${pin.number}</text>
      `;
    })
    .join('');

  const discTag = escapeXml((discipline || 'anatomy').replace(/_/g, ' ').toUpperCase());

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 280" width="500" height="280">
    <rect width="500" height="280" fill="#F8FAFC"/>
    <rect x="8" y="8" width="484" height="264" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
    <rect x="8" y="8" width="484" height="30" rx="10" fill="#EFF6FF"/>
    <text x="20" y="27" font-family="Inter, sans-serif" font-size="10.5" font-weight="700" fill="#0F4C81">${title}</text>
    <text x="480" y="27" text-anchor="end" font-family="Inter, sans-serif" font-size="8.5" font-weight="700" fill="#0284C7">${discTag}</text>
    ${organArtwork}
    ${pinMarkup}
    <text x="20" y="263" font-family="Inter, sans-serif" font-size="8.5" fill="#475569">Anatomical Locus: ${region}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function getBrowserPreviewAtlasUrl(
  systemTemplateOrTopic: AnatomicalSystemTemplate | string,
  discipline?: IntegratedScienceDisciplineId,
  visualKind?: DisciplineVisualKind,
  topicTitle?: string,
  pins?: InfographicCalloutPin[]
): string {
  const canonical = canonicalizeMedicalTopic(topicTitle || systemTemplateOrTopic);
  const resolvedKey = resolveStrictTopicAtlasKey(canonical, discipline, visualKind);
  if (resolvedKey in BROWSER_URL_MAP) {
    return BROWSER_URL_MAP[resolvedKey as PdfAtlasImageKey];
  }
  return buildTopicSvgPreviewDataUrl(canonical, discipline, topicTitle, pins);
}
