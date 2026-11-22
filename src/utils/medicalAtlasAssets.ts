import type {
  AnatomicalSystemTemplate,
  LectureAnatomicalPin,
  MedicalSubjectDiscipline,
  SceneVisualMode,
  VisualAssetProvenanceKind,
} from '../types/medical';
import { canonicalizeMedicalTopic } from './topicCanonicalizer';

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
const studioHallUrl = new URL(
  '../assets/images/studio_medical_hall_1793195466823.jpg',
  import.meta.url
).href;
const pathologyHistologySplitUrl = new URL(
  '../assets/images/pathology_histology_split_1793195468805.jpg',
  import.meta.url
).href;
const immunologySynapseUrl = new URL(
  '../assets/images/immunology_synapse_plate_1793195470119.jpg',
  import.meta.url
).href;
const pharmacologyReceptorUrl = new URL(
  '../assets/images/pharmacology_receptor_plate_1793195470156.jpg',
  import.meta.url
).href;

export interface DirectionalFlowArrow {
  fromXPct: number;
  fromYPct: number;
  toXPct: number;
  toYPct: number;
  color: string;
  label?: string;
}

export interface ResolvedAtlasPlate {
  hasRealisticPlate: boolean;
  imageUrl: string | null;
  normalReferenceUrl?: string | null;
  abnormalComparisonUrl?: string | null;
  histologyComparisonUrl?: string | null;
  provenanceKind: VisualAssetProvenanceKind;
  provenanceLabel: string;
  plateCode: string;
  plateTitle: string;
  caption: string;
  closeUpFocus: { xPct: number; yPct: number; label: string };
  pins: LectureAnatomicalPin[];
  flowArrows: DirectionalFlowArrow[];
}

const ALL_ATLAS_URLS: string[] = [
  heartAnatomyUrl,
  heartPathoUrl,
  renalNephronUrl,
  respiratoryAlveoliUrl,
  endocrinePancreasUrl,
  neurovascularBrainUrl,
  studioHallUrl,
  pathologyHistologySplitUrl,
  immunologySynapseUrl,
  pharmacologyReceptorUrl,
];

export function getStudioHallBackdropUrl(): string {
  return studioHallUrl;
}

export function getPathologyHistologySplitUrl(): string {
  return pathologyHistologySplitUrl;
}

export function getImmunologySynapseUrl(): string {
  return immunologySynapseUrl;
}

export function getPharmacologyReceptorUrl(): string {
  return pharmacologyReceptorUrl;
}

const loadedImageCache = new Map<string, HTMLImageElement>();
const pendingImageLoads = new Map<string, Promise<HTMLImageElement | null>>();

export function loadAtlasImageElement(url: string): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  const existing = loadedImageCache.get(url);
  if (existing && existing.complete && existing.naturalWidth > 0) {
    return Promise.resolve(existing);
  }
  const pending = pendingImageLoads.get(url);
  if (pending) return pending;

  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      loadedImageCache.set(url, img);
      pendingImageLoads.delete(url);
      resolve(img);
    };
    img.onerror = () => {
      pendingImageLoads.delete(url);
      resolve(null);
    };
    img.src = url;
  });

  pendingImageLoads.set(url, p);
  return p;
}

export async function preloadAllMedicalAtlasImages(): Promise<void> {
  await Promise.all(ALL_ATLAS_URLS.map((u) => loadAtlasImageElement(u)));
}

export function getLoadedAtlasImage(url: string | null | undefined): HTMLImageElement | null {
  if (!url) return null;
  const cached = loadedImageCache.get(url);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }
  void loadAtlasImageElement(url);
  return null;
}

/**
 * Resolves a medically matched 2D anatomical/cellular/receptor atlas plate + editable text overlays.
 * Clearly distinguishes 2D medical illustrations, H&E histopathology schematics, and vector pathway diagrams
 * without claiming 2D raster plates are real-time 3D models.
 */
export function resolveSceneAtlasAsset(
  systemTemplate: AnatomicalSystemTemplate,
  visualMode: SceneVisualMode,
  subjectDiscipline?: MedicalSubjectDiscipline,
  topicTitle?: string
): ResolvedAtlasPlate {
  const canonical = topicTitle ? canonicalizeMedicalTopic(topicTitle) : null;
  const topicLabel = canonical?.canonicalTitle || topicTitle?.trim() || '';

  // 1. Dedicated Immunology Cellular & Molecular Visualization
  if (subjectDiscipline === 'immunology' || systemTemplate === 'immune') {
    return {
      hasRealisticPlate: true,
      imageUrl: immunologySynapseUrl,
      provenanceKind: 'vector_pathway_schematic',
      provenanceLabel: '2D Cellular Immunology Illustration · Editable Labels',
      plateCode: 'FIG. IMM-1 · INNATE & ADAPTIVE IMMUNOLOGICAL SYNAPSE',
      plateTitle: topicLabel
        ? `${topicLabel}: Antigen Presentation (MHC-II), Cytokines & Effector Cascade`
        : 'Antigen Presentation (MHC-II), Lymphocyte Activation, Antibodies & Complement',
      caption:
        'Antigen-presenting cells display processed peptide on MHC-II to CD4⁺ T-helper TCRs, driving cytokine signaling, B-cell antibody production, and complement effector activity.',
      closeUpFocus: {
        xPct: 33,
        yPct: 60,
        label: 'MHC-II / TCR Immunological Synapse & Costimulation',
      },
      pins: [
        {
          id: 'pin-imm-apc',
          label: 'Antigen-Presenting Cell (APC)',
          detail:
            'Innate sentinel cell capturing antigen and presenting peptide-MHC complexes alongside costimulatory B7 (CD80/86) signals.',
          xPct: 22,
          yPct: 14,
          targetXPct: 19,
          targetYPct: 38,
          tone: 'normal',
        },
        {
          id: 'pin-imm-tcell',
          label: 'CD4⁺ T-Cell & MHC-TCR Synapse',
          detail:
            'MHC-II + TCR/CD4 recognition plus CD80/86–CD28 costimulation activates helper T-cell cytokine release.',
          xPct: 24,
          yPct: 88,
          targetXPct: 34,
          targetYPct: 70,
          tone: 'normal',
        },
        {
          id: 'pin-imm-bcell',
          label: 'Plasma B-Cell & IgG Secretion',
          detail:
            'CD40–CD40L interaction and helper cytokines drive antibody class switching and opsonization.',
          xPct: 62,
          yPct: 14,
          targetXPct: 62,
          targetYPct: 49,
          tone: 'intervention',
        },
        {
          id: 'pin-imm-comp',
          label: 'Cytokine & Complement Effectors',
          detail:
            'Inflammatory cytokines recruit leukocytes while complement C3b/C5b-9 mediates opsonization and membrane lysis.',
          xPct: 78,
          yPct: 86,
          targetXPct: 88,
          targetYPct: 66,
          tone: 'pathology',
        },
      ],
      flowArrows: [
        {
          fromXPct: 22,
          fromYPct: 44,
          toXPct: 33,
          toYPct: 62,
          color: '#0284C7',
          label: 'MHC-II → TCR',
        },
        {
          fromXPct: 42,
          fromYPct: 64,
          toXPct: 56,
          toYPct: 52,
          color: '#059669',
          label: 'Cytokine Help',
        },
        {
          fromXPct: 66,
          fromYPct: 54,
          toXPct: 84,
          toYPct: 62,
          color: '#D97706',
          label: 'IgG → Complement',
        },
      ],
    };
  }

  // 2. Dedicated Pharmacology Receptor & Transmembrane Signaling Visualization
  if (subjectDiscipline === 'pharmacology') {
    const drugRows = canonical
      ? canonical.domainProfile.firstLineDrugRowsTemplate(canonical.canonicalTitle)
      : [];
    const primaryTarget =
      drugRows[0]?.drugClass || 'Transmembrane Receptor / Pump Target';
    return {
      hasRealisticPlate: true,
      imageUrl: pharmacologyReceptorUrl,
      provenanceKind: 'vector_pathway_schematic',
      provenanceLabel: '2D Molecular Receptor Schematic · Editable Labels',
      plateCode: 'FIG. PHARM-1 · RECEPTOR BINDING & INTRACELLULAR TRANSDUCTION',
      plateTitle: topicLabel
        ? `${topicLabel}: ${primaryTarget} & Therapeutic Signaling`
        : 'Transmembrane Receptor, Transport Targets & Second-Messenger Cascade',
      caption:
        'Selective drug ligands bind target receptors, ion pumps, or cotransporters across the cell membrane to modulate intracellular signaling and restore physiological balance.',
      closeUpFocus: {
        xPct: 42,
        yPct: 55,
        label: `${primaryTarget} Binding Site`,
      },
      pins: [
        {
          id: 'pin-pharm-ligand',
          label: drugRows[0]?.drugClass
            ? `Primary: ${drugRows[0].drugClass.slice(0, 28)}`
            : 'Extracellular Drug Ligand',
          detail:
            'Selective binding at the target receptor or active transport site initiates the therapeutic response.',
          xPct: 24,
          yPct: 14,
          targetXPct: 35,
          targetYPct: 34,
          tone: 'intervention',
        },
        {
          id: 'pin-pharm-gpcr',
          label: 'Transmembrane Receptor Complex',
          detail:
            'Couples extracellular ligand occupancy to intracellular second-messenger or enzymatic pathways.',
          xPct: 24,
          yPct: 86,
          targetXPct: 45,
          targetYPct: 65,
          tone: 'normal',
        },
        {
          id: 'pin-pharm-channel',
          label: drugRows[1]?.drugClass
            ? `Adjunct: ${drugRows[1].drugClass.slice(0, 28)}`
            : 'Membrane Pump / Channel Target',
          detail:
            'Regulates transmembrane ion or solute transport across target epithelial or excitable cells.',
          xPct: 78,
          yPct: 16,
          targetXPct: 82,
          targetYPct: 52,
          tone: 'intervention',
        },
        {
          id: 'pin-pharm-msg',
          label: 'Downstream Cellular Effect',
          detail:
            'Alters second messengers (cAMP/cGMP/Ca²⁺) or acid/fluid secretion to reverse disease pathophysiology.',
          xPct: 76,
          yPct: 86,
          targetXPct: 52,
          targetYPct: 78,
          tone: 'intervention',
        },
      ],
      flowArrows: [
        {
          fromXPct: 32,
          fromYPct: 22,
          toXPct: 37,
          toYPct: 42,
          color: '#0284C7',
          label: 'Binding',
        },
        {
          fromXPct: 44,
          fromYPct: 58,
          toXPct: 49,
          toYPct: 77,
          color: '#059669',
          label: 'Transduction',
        },
      ],
    };
  }

  const isPatho = visualMode === 'pathophysiology' || subjectDiscipline === 'pathology';
  const landmarks = canonical?.domainProfile.defaultLandmarks || [];

  // Gastroduodenal / luminal GI topics use a dedicated vector-accurate schematic plate rather than an endocrine DKA pancreas caption
  if (
    canonical &&
    (canonical.organDomain === 'gastroduodenal' ||
      canonical.organDomain === 'esophageal' ||
      canonical.organDomain === 'intestinal_colorectal')
  ) {
    const struct0 = landmarks[0]?.label || 'Gastric Antrum & Lesser Curvature';
    const struct1 = landmarks[1]?.label || 'Duodenal Bulb (D1)';
    const struct2 = landmarks[2]?.label || 'Gastroduodenal Artery';
    const struct3 = landmarks[3]?.label || 'Mucosal HCO₃⁻-Mucus Barrier';

    return {
      hasRealisticPlate: true,
      imageUrl: endocrinePancreasUrl,
      normalReferenceUrl: endocrinePancreasUrl,
      histologyComparisonUrl: isPatho ? pathologyHistologySplitUrl : null,
      provenanceKind: 'vector_pathway_schematic',
      provenanceLabel: '2D Upper GI & Hepatopancreatic Regional Atlas · Editable Labels',
      plateCode: `FIG. GI-1 · ${canonical.canonicalTitle.toUpperCase()} REGIONAL ANATOMY`,
      plateTitle: `${canonical.canonicalTitle}: Upper GI & Peripancreatic Relations`,
      caption: `${canonical.canonicalTitle} involves ${struct0}, ${struct1}, and adjacent vascular/visceral relations (${struct2}).`,
      closeUpFocus: {
        xPct: 48,
        yPct: 50,
        label: struct0,
      },
      pins: [
        {
          id: 'pin-gi-1',
          label: struct0,
          detail: `Primary anatomical site in ${canonical.canonicalTitle}.`,
          xPct: 20,
          yPct: 14,
          targetXPct: 32,
          targetYPct: 36,
          tone: isPatho ? 'pathology' : 'normal',
        },
        {
          id: 'pin-gi-2',
          label: struct1,
          detail: `Key regional structure evaluated during diagnostic workup of ${canonical.canonicalTitle}.`,
          xPct: 22,
          yPct: 86,
          targetXPct: 42,
          targetYPct: 58,
          tone: isPatho ? 'pathology' : 'normal',
        },
        {
          id: 'pin-gi-3',
          label: struct2,
          detail: `Critical anatomical relation governing complications in ${canonical.canonicalTitle}.`,
          xPct: 74,
          yPct: 14,
          targetXPct: 62,
          targetYPct: 48,
          tone: 'pathology',
        },
        {
          id: 'pin-gi-4',
          label: struct3,
          detail: `Physiological defense and therapeutic target in ${canonical.canonicalTitle}.`,
          xPct: 76,
          yPct: 86,
          targetXPct: 74,
          targetYPct: 56,
          tone: 'intervention',
        },
      ],
      flowArrows: [
        {
          fromXPct: 32,
          fromYPct: 38,
          toXPct: 46,
          toYPct: 56,
          color: isPatho ? '#DC2626' : '#0284C7',
          label: 'Luminal Flow',
        },
      ],
    };
  }

  if (systemTemplate === 'cardiopulmonary') {
    if (isPatho) {
      return {
        hasRealisticPlate: true,
        imageUrl: heartPathoUrl,
        normalReferenceUrl: heartAnatomyUrl,
        abnormalComparisonUrl: heartPathoUrl,
        histologyComparisonUrl: pathologyHistologySplitUrl,
        provenanceKind: 'vector_pathway_schematic',
        provenanceLabel: '2D Pathological Atlas Illustration + H&E Schematic',
        plateCode: 'FIG. 1.2 · CARDIOPULMONARY PATHOLOGY & HEMODYNAMIC CONGESTION',
        plateTitle: topicLabel
          ? `${topicLabel}: Cardiac Chambers & Pulmonary Congestion`
          : 'Ventricular Dysfunction & Alveolar Pulmonary Edema Cross-Section',
        caption:
          'Impaired ventricular performance elevates filling pressures, transmitting hydrostatic pressure into pulmonary capillaries.',
        closeUpFocus: {
          xPct: 72,
          yPct: 54,
          label: 'Alveolar-Capillary Hemodynamic Interface',
        },
        pins: [
          {
            id: 'pin-hf-lv',
            label: landmarks[0]?.label || 'Left Ventricular Myocardium',
            detail:
              'Chamber wall stress and altered myocardial mechanics impair forward stroke volume.',
            xPct: 18,
            yPct: 84,
            targetXPct: 36,
            targetYPct: 67,
            tone: 'pathology',
          },
          {
            id: 'pin-hf-la',
            label: landmarks[1]?.label || 'Left Atrium & Venous Outflow',
            detail:
              'Retrograde pressure elevation increases left atrial and pulmonary venous pressures.',
            xPct: 18,
            yPct: 14,
            targetXPct: 35,
            targetYPct: 39,
            tone: 'pathology',
          },
          {
            id: 'pin-hf-alv',
            label: 'Alveolar-Capillary Interface',
            detail:
              'Elevated hydrostatic capillary pressure promotes interstitial and alveolar fluid shift.',
            xPct: 74,
            yPct: 14,
            targetXPct: 71,
            targetYPct: 52,
            tone: 'pathology',
          },
          {
            id: 'pin-hf-cap',
            label: 'Pulmonary Microvasculature',
            detail:
              'Distended pulmonary capillaries impair gas diffusion and trigger exertional dyspnea.',
            xPct: 74,
            yPct: 86,
            targetXPct: 62,
            targetYPct: 73,
            tone: 'pathology',
          },
        ],
        flowArrows: [
          {
            fromXPct: 36,
            fromYPct: 64,
            toXPct: 35,
            toYPct: 40,
            color: '#DC2626',
            label: '▲ Filling Pressure',
          },
          {
            fromXPct: 58,
            fromYPct: 70,
            toXPct: 69,
            toYPct: 56,
            color: '#D97706',
            label: 'Fluid Shift',
          },
        ],
      };
    }

    return {
      hasRealisticPlate: true,
      imageUrl: heartAnatomyUrl,
      normalReferenceUrl: heartAnatomyUrl,
      abnormalComparisonUrl: heartPathoUrl,
      histologyComparisonUrl: pathologyHistologySplitUrl,
      provenanceKind: 'vector_pathway_schematic',
      provenanceLabel: '2D Anatomical Cross-Section Illustration · Editable Labels',
      plateCode: 'FIG. 1.1 · CARDIOPULMONARY ANATOMY & PHYSIOLOGY',
      plateTitle: topicLabel
        ? `${topicLabel}: Cardiac Chambers, Valves & Pulmonary Circuit`
        : 'Four-Chamber Myocardium, Valves & Alveolar-Capillary Circuit',
      caption:
        'Systemic venous return enters the right heart to perfuse pulmonary alveoli, while oxygenated blood returns to the left heart for systemic ejection (CO = HR × SV).',
      closeUpFocus: {
        xPct: 44,
        yPct: 58,
        label: 'Ventricular Chambers, Valves & Conduction Axis',
      },
      pins: [
        {
          id: 'pin-norm-svc',
          label: 'Vena Cava & Right Atrium',
          detail:
            'Receives systemic venous return (preload) governing right ventricular end-diastolic stretch.',
          xPct: 18,
          yPct: 14,
          targetXPct: 27,
          targetYPct: 45,
          tone: 'normal',
        },
        {
          id: 'pin-norm-aorta',
          label: 'Aortic Arch (Systemic Outflow)',
          detail:
            'Conveys stroke volume against systemic vascular resistance (afterload) to perfuse organs.',
          xPct: 52,
          yPct: 12,
          targetXPct: 39,
          targetYPct: 24,
          tone: 'normal',
        },
        {
          id: 'pin-norm-lv',
          label: 'Left Ventricular Myocardium',
          detail:
            'High-pressure muscular chamber generating systemic arterial perfusion.',
          xPct: 22,
          yPct: 86,
          targetXPct: 49,
          targetYPct: 66,
          tone: 'normal',
        },
        {
          id: 'pin-norm-alv',
          label: 'Pulmonary Capillary Bed',
          detail:
            'Low-resistance vascular bed equilibrating alveolar O₂ with capillary hemoglobin.',
          xPct: 78,
          yPct: 84,
          targetXPct: 73,
          targetYPct: 48,
          tone: 'normal',
        },
      ],
      flowArrows: [
        {
          fromXPct: 27,
          fromYPct: 44,
          toXPct: 35,
          toYPct: 66,
          color: '#0284C7',
          label: 'Preload',
        },
        {
          fromXPct: 49,
          fromYPct: 64,
          toXPct: 40,
          toYPct: 28,
          color: '#DC2626',
          label: 'Stroke Volume',
        },
      ],
    };
  }

  if (systemTemplate === 'renal') {
    return {
      hasRealisticPlate: true,
      imageUrl: renalNephronUrl,
      normalReferenceUrl: renalNephronUrl,
      histologyComparisonUrl: isPatho ? pathologyHistologySplitUrl : null,
      provenanceKind: 'vector_pathway_schematic',
      provenanceLabel: '2D Renal & Nephron Atlas Illustration · Editable Labels',
      plateCode: 'FIG. 2.1 · RENAL PARENCHYMA & FUNCTIONAL NEPHRON',
      plateTitle: topicLabel
        ? `${topicLabel}: Renal Cortex, Glomerulus & Tubular Transport`
        : 'Renal Cortex/Medulla & Magnified Glomerulotubular Unit',
      caption:
        'Glomerular filtration across Bowman’s capsule is regulated by afferent/efferent arteriolar tone, followed by selective tubular solute and water transport.',
      closeUpFocus: {
        xPct: 68,
        yPct: 42,
        label: 'Glomerular Capillary Tuft & Tubular Segments',
      },
      pins: [
        {
          id: 'pin-ren-cortex',
          label: 'Renal Cortex & Medulla',
          detail: 'Receives ~20–25% of cardiac output; houses cortical glomeruli and medullary loops.',
          xPct: 18,
          yPct: 14,
          targetXPct: 23,
          targetYPct: 35,
          tone: 'normal',
        },
        {
          id: 'pin-ren-glom',
          label: 'Glomerulus & Bowman’s Capsule',
          detail:
            'Fenestrated endothelium, GBM, and podocytes filter plasma according to Starling forces.',
          xPct: 58,
          yPct: 12,
          targetXPct: 56,
          targetYPct: 27,
          tone: isPatho ? 'pathology' : 'normal',
        },
        {
          id: 'pin-ren-loop',
          label: 'Thick Ascending Limb (NKCC2)',
          detail:
            'Site of Na⁺-K⁺-2Cl⁻ cotransport establishing the corticomedullary osmotic gradient.',
          xPct: 58,
          yPct: 86,
          targetXPct: 72,
          targetYPct: 62,
          tone: 'intervention',
        },
        {
          id: 'pin-ren-cd',
          label: 'Collecting Duct (ENaC / AQP2)',
          detail:
            'Principal and intercalated cells regulate final Na⁺, K⁺, acid-base, and water balance.',
          xPct: 82,
          yPct: 48,
          targetXPct: 88,
          targetYPct: 52,
          tone: 'intervention',
        },
      ],
      flowArrows: [
        {
          fromXPct: 56,
          fromYPct: 27,
          toXPct: 69,
          toYPct: 28,
          color: '#0284C7',
          label: 'GFR Filtrate',
        },
      ],
    };
  }

  if (systemTemplate === 'respiratory') {
    return {
      hasRealisticPlate: true,
      imageUrl: respiratoryAlveoliUrl,
      normalReferenceUrl: respiratoryAlveoliUrl,
      abnormalComparisonUrl: heartPathoUrl,
      histologyComparisonUrl: pathologyHistologySplitUrl,
      provenanceKind: 'vector_pathway_schematic',
      provenanceLabel: '2D Bronchoalveolar Atlas Illustration · Editable Labels',
      plateCode: 'FIG. 3.1 · CONDUCTING AIRWAYS & ALVEOLAR GAS EXCHANGE',
      plateTitle: topicLabel
        ? `${topicLabel}: Tracheobronchial Tree & Alveolar-Capillary Unit`
        : 'Tracheobronchial Tree & Alveolar-Capillary Membrane',
      caption:
        'Conducting bronchioles deliver inspired gas to terminal alveolar sacs surrounded by pulmonary capillaries for O₂ uptake and CO₂ elimination.',
      closeUpFocus: {
        xPct: 73,
        yPct: 54,
        label: 'Alveolar Sac & Capillary Gas-Exchange Membrane',
      },
      pins: [
        {
          id: 'pin-resp-trachea',
          label: 'Trachea & Main Bronchi',
          detail: 'Cartilaginous rings maintain large-airway patency during intrathoracic pressure shifts.',
          xPct: 24,
          yPct: 14,
          targetXPct: 31,
          targetYPct: 26,
          tone: 'normal',
        },
        {
          id: 'pin-resp-bronch',
          label: 'Bronchiolar Lumen & Smooth Muscle',
          detail:
            'Bronchial smooth muscle tone and mucosal edema govern airway resistance (R ∝ 1/r⁴).',
          xPct: 22,
          yPct: 86,
          targetXPct: 43,
          targetYPct: 61,
          tone: isPatho ? 'pathology' : 'normal',
        },
        {
          id: 'pin-resp-alv',
          label: 'Alveolar Pneumocytes (Type I/II)',
          detail:
            'Type II surfactant lowers surface tension while Type I epithelium enables rapid gas diffusion.',
          xPct: 76,
          yPct: 14,
          targetXPct: 75,
          targetYPct: 56,
          tone: isPatho ? 'pathology' : 'normal',
        },
      ],
      flowArrows: [
        {
          fromXPct: 31,
          fromYPct: 22,
          toXPct: 39,
          toYPct: 50,
          color: '#0284C7',
          label: 'Ventilation',
        },
      ],
    };
  }

  if (systemTemplate === 'endocrine' || systemTemplate === 'hepatobiliary') {
    const isHepato = systemTemplate === 'hepatobiliary';
    return {
      hasRealisticPlate: true,
      imageUrl: endocrinePancreasUrl,
      normalReferenceUrl: endocrinePancreasUrl,
      histologyComparisonUrl: isPatho ? pathologyHistologySplitUrl : null,
      provenanceKind: 'vector_pathway_schematic',
      provenanceLabel: '2D Hepato-Pancreatic & Endocrine Illustration · Editable Labels',
      plateCode: isHepato
        ? 'FIG. 4.1 · HEPATOBILIARY & PANCREATIC AXIS'
        : 'FIG. 4.1 · ENDOCRINE & METABOLIC REGULATORY AXIS',
      plateTitle: topicLabel
        ? `${topicLabel}: ${
            isHepato ? 'Hepatic Parenchyma, Biliary Tree & Pancreas' : 'Endocrine Secretion & Metabolic Target Axis'
          }`
        : isHepato
          ? 'Hepatic Parenchyma, Biliary Ducts & Pancreatic Outflow'
          : 'Pancreatic Islet, Liver & Capillary Hormone Transport',
      caption: isHepato
        ? 'Portal venous inflow, hepatocyte lobules, biliary canaliculi, and pancreaticobiliary drainage coordinate digestion, detoxification, and synthesis.'
        : 'Endocrine secretory cells release peptide/steroid hormones into fenestrated capillaries to regulate systemic cellular metabolism.',
      closeUpFocus: {
        xPct: isHepato ? 30 : 67,
        yPct: 48,
        label: isHepato ? 'Hepatic Parenchyma & Biliary Tree' : 'Endocrine Secretory Microvasculature',
      },
      pins: [
        {
          id: 'pin-endo-liver',
          label: landmarks[0]?.label || 'Hepatic Parenchyma & Biliary Tree',
          detail: isHepato
            ? 'Hepatocyte plates and biliary ducts govern bilirubin conjugation, synthesis, and portal hemodynamics.'
            : 'Key metabolic target regulating glycogenolysis, gluconeogenesis, and lipid metabolism.',
          xPct: 20,
          yPct: 14,
          targetXPct: 24,
          targetYPct: 28,
          tone: isPatho ? 'pathology' : 'normal',
        },
        {
          id: 'pin-endo-panc',
          label: landmarks[1]?.label || 'Pancreatic Parenchyma & Duct',
          detail: 'Integrates exocrine digestive enzyme transport with regional biliary anatomy.',
          xPct: 22,
          yPct: 86,
          targetXPct: 35,
          targetYPct: 57,
          tone: 'normal',
        },
        {
          id: 'pin-endo-islet',
          label:
            landmarks[2]?.label ||
            (isHepato ? 'Portal-Sinusoidal Triad' : 'Endocrine Secretory Unit'),
          detail: isHepato
            ? 'Portal triad vascular-biliary interface affected by inflammation,cholestasis, or fibrosis.'
            : 'Hormone-secreting cells sensing systemic substrates and feedback signals.',
          xPct: 64,
          yPct: 14,
          targetXPct: 66,
          targetYPct: 50,
          tone: isPatho ? 'pathology' : 'normal',
        },
        {
          id: 'pin-endo-cap',
          label: landmarks[3]?.label || 'Systemic Microvascular Outflow',
          detail: 'Delivers hormones, metabolites, and electrolytes to peripheral target tissues.',
          xPct: 78,
          yPct: 86,
          targetXPct: 86,
          targetYPct: 52,
          tone: 'intervention',
        },
      ],
      flowArrows: [
        {
          fromXPct: 67,
          fromYPct: 50,
          toXPct: 84,
          toYPct: 50,
          color: isPatho ? '#DC2626' : '#0284C7',
          label: isHepato ? 'Biliary / Portal Flow' : 'Hormone Flux',
        },
      ],
    };
  }

  if (systemTemplate === 'neurology') {
    return {
      hasRealisticPlate: true,
      imageUrl: neurovascularBrainUrl,
      normalReferenceUrl: neurovascularBrainUrl,
      histologyComparisonUrl: isPatho ? pathologyHistologySplitUrl : null,
      provenanceKind: 'vector_pathway_schematic',
      provenanceLabel: '2D Neurovascular & Synaptic Illustration · Editable Labels',
      plateCode: 'FIG. 5.1 · CEREBRAL NEUROVASCULATURE & SYNAPTIC TRANSMISSION',
      plateTitle: topicLabel
        ? `${topicLabel}: Cerebral Territories & Synaptic Signaling`
        : 'Sagittal Encephalon, Cerebral Arteries & Magnified Chemical Synapse',
      caption:
        'Cerebral arterial autoregulation sustains cortical and brainstem perfusion while action potentials drive neurotransmitter signaling across synapses.',
      closeUpFocus: {
        xPct: 76,
        yPct: 70,
        label: 'Synaptic Cleft & Postsynaptic Receptors',
      },
      pins: [
        {
          id: 'pin-neuro-cortex',
          label: landmarks[0]?.label || 'Cerebral Cortex & Arterial Territory',
          detail:
            'High metabolic O₂/glucose demand requires regulated cerebral perfusion pressure (CPP = MAP − ICP).',
          xPct: 22,
          yPct: 14,
          targetXPct: 36,
          targetYPct: 28,
          tone: isPatho ? 'pathology' : 'normal',
        },
        {
          id: 'pin-neuro-stem',
          label: landmarks[1]?.label || 'Diencephalon, Brainstem & Tracts',
          detail:
            'Integrates cranial nerve nuclei, autonomic centers, and long motor/sensory pathways.',
          xPct: 20,
          yPct: 86,
          targetXPct: 43,
          targetYPct: 67,
          tone: 'normal',
        },
        {
          id: 'pin-neuro-synapse',
          label: landmarks[2]?.label || 'Synaptic Cleft & Neurotransmitters',
          detail:
            'Presynaptic Ca²⁺ influx releases neurotransmitters onto postsynaptic ionotropic/metabotropic receptors.',
          xPct: 75,
          yPct: 34,
          targetXPct: 75,
          targetYPct: 66,
          tone: 'intervention',
        },
      ],
      flowArrows: [
        {
          fromXPct: 75,
          fromYPct: 56,
          toXPct: 75,
          toYPct: 72,
          color: '#0284C7',
          label: 'Synaptic Signal',
        },
      ],
    };
  }

  // Verified 2D vector schematic fallback for hematology / general_physiology
  return {
    hasRealisticPlate: false,
    imageUrl: null,
    provenanceKind: 'vector_pathway_schematic',
    provenanceLabel: '2D Vector Physiological Schematic Diagram',
    plateCode: `FIG. 6.1 · ${systemTemplate.replace('_', ' ').toUpperCase()} SCHEMATIC`,
    plateTitle: topicLabel
      ? `${topicLabel}: Cellular & Systemic Mechanism`
      : `${systemTemplate
          .replace('_', ' ')
          .replace(/\b\w/g, (m) => m.toUpperCase())} Cellular & Systemic Pathway`,
    caption:
      '2D vector schematic diagram illustrating cellular sensors, intravascular mediators, and target-organ response.',
    closeUpFocus: {
      xPct: 50,
      yPct: 50,
      label: 'Pathway Integration Node',
    },
    pins: [],
    flowArrows: [],
  };
}
