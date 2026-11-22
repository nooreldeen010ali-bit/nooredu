import { jsPDF } from 'jspdf';
import type {
  AnatomicalDiagramData,
  ClinicalNote,
  ComparisonTableData,
  DrugComparisonRow,
  FlowchartData,
  IntegratedDisciplineBlock,
  MindMapData,
  PdfPageOrientation,
  QuestionBankClinicalCase,
  QuestionBankMcq,
  QuestionBankWrittenItem,
} from '../types/medical';
import { DISCIPLINE_META } from './infographicQuestionBankEngine';
import { formatBookCitationsSummary } from './multiBookEngine';
import { resolveStrictTopicAtlasKey } from './pdfImageAssets';
import {
  sanitizePdfVectorText,
  validateStudyPdfCoherence,
  type StudyPdfDocumentModel,
  type StudyPdfUnit,
} from './studyPdfModel';
import type {
  CanonicalTopicDescriptor,
  FineOrganDomain,
} from './topicCanonicalizer';
import {
  computeFlowchartLayout,
  computeMindMapLayout,
  MIND_MAP_CATEGORY_PALETTE,
} from './visualLayout';

type RgbTuple = [number, number, number];

function hexToRgb(hex: string): RgbTuple {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return [15, 76, 129];
}

const COLORS = {
  cobalt: [15, 76, 129] as RgbTuple, // #0F4C81
  cobaltDark: [10, 52, 92] as RgbTuple,
  sky: [2, 132, 199] as RgbTuple, // #0284C7
  skyLight: [240, 249, 255] as RgbTuple, // #F0F9FF
  skyBorder: [186, 230, 253] as RgbTuple, // #BAE6FD
  slate900: [15, 23, 42] as RgbTuple,
  slate700: [51, 65, 85] as RgbTuple,
  slate500: [100, 116, 139] as RgbTuple,
  slate300: [203, 213, 225] as RgbTuple,
  slate200: [226, 232, 240] as RgbTuple,
  slate50: [248, 250, 252] as RgbTuple,
  emerald: [21, 128, 61] as RgbTuple,
  emeraldLight: [240, 253, 244] as RgbTuple,
  emeraldBorder: [167, 243, 208] as RgbTuple,
  amber: [180, 83, 9] as RgbTuple,
  amberLight: [255, 251, 235] as RgbTuple,
  amberBorder: [253, 230, 138] as RgbTuple,
  red: [185, 28, 28] as RgbTuple,
  redLight: [254, 242, 242] as RgbTuple,
  redBorder: [254, 202, 202] as RgbTuple,
  indigo: [67, 56, 202] as RgbTuple,
  indigoLight: [238, 242, 255] as RgbTuple,
  teal: [15, 118, 110] as RgbTuple,
  tealLight: [240, 253, 250] as RgbTuple,
  white: [255, 255, 255] as RgbTuple,
};

function sanitizePdfFilename(raw: string): string {
  const clean = sanitizePdfVectorText(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 68);
  return `${clean || 'medatlas-study-guide'}.pdf`;
}

function drawFilledArrowhead(
  doc: jsPDF,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  rgb: RgbTuple,
  sizeMm = 1.9
) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const baseX = toX - ux * sizeMm;
  const baseY = toY - uy * sizeMm;
  const leftX = baseX + px * (sizeMm * 0.58);
  const leftY = baseY + py * (sizeMm * 0.58);
  const rightX = baseX - px * (sizeMm * 0.58);
  const rightY = baseY - py * (sizeMm * 0.58);

  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.triangle(toX, toY, leftX, leftY, rightX, rightY, 'F');
}

function drawVectorOrganSchematic(
  doc: jsPDF,
  template: AnatomicalDiagramData['systemTemplate'],
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  organDomain?: FineOrganDomain,
  discipline?: IntegratedDisciplineBlock['discipline']
) {
  const cx = boxX + boxW * 0.5;
  const cy = boxY + boxH * 0.52;

  doc.setFillColor(252, 253, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2.5, 2.5, 'FD');

  // Discipline-specific vector schematic views for Pathology & Pharmacology so every visual matches its section
  if (discipline === 'pathology') {
    const halfW = (boxW - 10) / 2;
    const cardH = boxH - 12;
    const leftX = boxX + 3.5;
    const rightX = boxX + 6.5 + halfW;
    const topY = boxY + 6;

    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(21, 128, 61);
    doc.setLineWidth(0.4);
    doc.roundedRect(leftX, topY, halfW, cardH, 1.8, 1.8, 'FD');

    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(185, 28, 28);
    doc.roundedRect(rightX, topY, halfW, cardH, 1.8, 1.8, 'FD');

    // Intact columnar mucosal barrier vs ulcer/lesion crater
    doc.setDrawColor(21, 128, 61);
    doc.setLineWidth(0.9);
    doc.line(leftX + 3, topY + cardH * 0.45, leftX + halfW - 3, topY + cardH * 0.45);
    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(1.2);
    doc.line(leftX + 3, topY + cardH * 0.37, leftX + halfW - 3, topY + cardH * 0.37);

    doc.setDrawColor(185, 28, 28);
    doc.setLineWidth(0.9);
    doc.line(rightX + 3, topY + cardH * 0.45, rightX + halfW * 0.3, topY + cardH * 0.45);
    doc.line(rightX + halfW * 0.3, topY + cardH * 0.45, rightX + halfW * 0.5, topY + cardH * 0.76);
    doc.line(rightX + halfW * 0.5, topY + cardH * 0.76, rightX + halfW * 0.7, topY + cardH * 0.45);
    doc.line(rightX + halfW * 0.7, topY + cardH * 0.45, rightX + halfW - 3, topY + cardH * 0.45);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.setTextColor(21, 128, 61);
    doc.text('Intact Normal Architecture', leftX + halfW / 2, topY + 4.5, { align: 'center' });
    doc.setTextColor(185, 28, 28);
    doc.text('Pathological Lesion / Defect', rightX + halfW / 2, topY + 4.5, { align: 'center' });
    return;
  }

  if (discipline === 'pharmacology') {
    const bW = boxW * 0.26;
    const bH = 11;
    const x1 = boxX + boxW * 0.07;
    const x2 = boxX + boxW * 0.37;
    const x3 = boxX + boxW * 0.67;
    const yMid = cy - bH / 2;

    doc.setFillColor(238, 242, 255);
    doc.setDrawColor(67, 56, 202);
    doc.setLineWidth(0.45);
    doc.roundedRect(x1, yMid, bW, bH, 1.8, 1.8, 'FD');

    doc.setFillColor(240, 249, 255);
    doc.setDrawColor(2, 132, 199);
    doc.roundedRect(x2, yMid, bW, bH, 1.8, 1.8, 'FD');

    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(21, 128, 61);
    doc.roundedRect(x3, yMid, bW, bH, 1.8, 1.8, 'FD');

    doc.setDrawColor(67, 56, 202);
    doc.line(x1 + bW, cy, x2, cy);
    drawFilledArrowhead(doc, x1 + bW, cy, x2, cy, COLORS.indigo, 1.5);
    doc.setDrawColor(21, 128, 61);
    doc.line(x2 + bW, cy, x3, cy);
    drawFilledArrowhead(doc, x2 + bW, cy, x3, cy, COLORS.emerald, 1.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.3);
    doc.setTextColor(67, 56, 202);
    doc.text('Selective Drug Class', x1 + bW / 2, cy + 0.8, { align: 'center' });
    doc.setTextColor(15, 76, 129);
    doc.text('Target Receptor / Pump', x2 + bW / 2, cy + 0.8, { align: 'center' });
    doc.setTextColor(21, 128, 61);
    doc.text('Mucosal / Organ Healing', x3 + bW / 2, cy + 0.8, { align: 'center' });
    return;
  }

  // Fine-grained Organ Domain Schematics (Stomach/Duodenum, Esophagus, Pancreas, Intestine)
  if (organDomain === 'gastroduodenal') {
    // Esophageal entry -> Gastric Fundus/Body J-curve -> Antrum -> Pylorus -> Duodenal Bulb (D1)
    const stX = cx - boxW * 0.08;
    const stY = cy + 1;
    doc.setFillColor(255, 228, 230);
    doc.setDrawColor(190, 18, 60);
    doc.setLineWidth(0.65);
    // Gastric body/fundus ellipse + antrum + duodenal C-bulb
    doc.ellipse(stX - 6, stY - 2, boxW * 0.19, boxH * 0.28, 'FD');
    doc.roundedRect(stX + 2, stY + 2, boxW * 0.18, 9, 3.2, 3.2, 'FD');
    // Duodenal bulb (D1) & descending D2
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(180, 83, 9);
    doc.roundedRect(stX + boxW * 0.2, stY - 2, boxW * 0.14, 8.5, 2.8, 2.8, 'FD');
    // Gastroduodenal artery running posterior to D1
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.9);
    doc.line(stX + boxW * 0.27, stY - 12, stX + boxW * 0.27, stY + 13);
    // Protective Mucus-HCO3- gel arc
    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(0.8);
    doc.line(stX - 15, stY - 6, stX - 2, stY + 5);
    // Ulcer crater highlights on gastric antrum & D1 bulb
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.55);
    doc.circle(stX + 8, stY + 6, 2.3, 'FD');
    doc.circle(stX + boxW * 0.25, stY + 2, 2.1, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.setTextColor(15, 76, 129);
    doc.text('Gastric Fundus & Body', stX - 7, stY - boxH * 0.31, { align: 'center' });
    doc.setTextColor(2, 132, 199);
    doc.text('Mucus-HCO3- Barrier', stX - 11, stY - 8, { align: 'center' });
    doc.setTextColor(190, 18, 60);
    doc.text('Antral Ulcer Site', stX + 9, stY + 14.5, { align: 'center' });
    doc.setTextColor(180, 83, 9);
    doc.text('D1 Bulb & GDA', stX + boxW * 0.27, stY - 14, { align: 'center' });
    return;
  }

  if (organDomain === 'esophageal') {
    doc.setFillColor(224, 242, 254);
    doc.setDrawColor(3, 105, 161);
    doc.setLineWidth(0.6);
    doc.roundedRect(cx - 7, boxY + 6, 14, boxH * 0.56, 3, 3, 'FD');
    // Tapered LES zone + crural diaphragm
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(180, 83, 9);
    doc.ellipse(cx, boxY + 6 + boxH * 0.58, 5.5, 2.8, 'FD');
    doc.setLineWidth(0.9);
    doc.line(cx - 22, boxY + 6 + boxH * 0.58, cx - 7, boxY + 6 + boxH * 0.58);
    doc.line(cx + 7, boxY + 6 + boxH * 0.58, cx + 22, boxY + 6 + boxH * 0.58);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(15, 76, 129);
    doc.text('Esophageal Body', cx, boxY + 14, { align: 'center' });
    doc.setTextColor(180, 83, 9);
    doc.text('LES High-Pressure Zone', cx, boxY + 12 + boxH * 0.62, { align: 'center' });
    return;
  }

  if (organDomain === 'pancreatic') {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(180, 83, 9);
    doc.setLineWidth(0.6);
    doc.ellipse(cx - 12, cy, 8, 9, 'FD');
    doc.roundedRect(cx - 6, cy - 5.5, boxW * 0.34, 10, 3.5, 3.5, 'FD');
    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(0.85);
    doc.line(cx - 13, cy, cx + boxW * 0.25, cy - 0.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(180, 83, 9);
    doc.text('Exocrine Pancreas & Acini', cx + 4, cy - 8, { align: 'center' });
    doc.setTextColor(2, 132, 199);
    doc.text('Main Pancreatic Duct', cx + 4, cy + 8.5, { align: 'center' });
    return;
  }

  if (organDomain === 'intestinal_colorectal') {
    doc.setDrawColor(190, 18, 60);
    doc.setFillColor(255, 228, 230);
    doc.setLineWidth(0.7);
    doc.roundedRect(cx - boxW * 0.26, cy - boxH * 0.26, boxW * 0.52, boxH * 0.5, 5, 5, 'FD');
    doc.setFillColor(252, 253, 255);
    doc.roundedRect(cx - boxW * 0.16, cy - boxH * 0.15, boxW * 0.32, boxH * 0.3, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(153, 27, 27);
    doc.text('Ileocolonic Tract & Mucosa', cx, cy, { align: 'center' });
    return;
  }

  if (template === 'cardiopulmonary') {
    doc.setFillColor(240, 249, 255);
    doc.setDrawColor(125, 211, 252);
    doc.setLineWidth(0.45);
    doc.ellipse(cx - boxW * 0.23, cy - 2, boxW * 0.14, boxH * 0.31, 'FD');
    doc.ellipse(cx + boxW * 0.23, cy - 2, boxW * 0.14, boxH * 0.31, 'FD');

    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(2.0);
    doc.line(cx - 5, cy - boxH * 0.34, cx - 5, cy + boxH * 0.28);

    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(2.0);
    doc.line(cx + 5, cy - boxH * 0.32, cx + 5, cy + boxH * 0.26);

    doc.setFillColor(255, 241, 242);
    doc.setDrawColor(190, 18, 60);
    doc.setLineWidth(0.6);
    doc.ellipse(cx, cy + 1, boxW * 0.15, boxH * 0.24, 'FD');
    doc.line(cx, cy - boxH * 0.22, cx, cy + boxH * 0.24);
    doc.line(cx - boxW * 0.14, cy, cx + boxW * 0.14, cy);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(15, 76, 129);
    doc.text('RA', cx - 5, cy - 3, { align: 'center' });
    doc.text('RV', cx - 5, cy + 6, { align: 'center' });
    doc.setTextColor(153, 27, 27);
    doc.text('LA', cx + 5, cy - 3, { align: 'center' });
    doc.text('LV', cx + 5, cy + 6, { align: 'center' });
  } else if (template === 'renal') {
    const gx = boxX + boxW * 0.28;
    const gy = cy - 4;
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(15, 76, 129);
    doc.setLineWidth(0.55);
    doc.circle(gx, gy, 8.0, 'FD');
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(220, 38, 38);
    doc.circle(gx, gy, 4.5, 'FD');

    doc.setDrawColor(15, 118, 110);
    doc.setLineWidth(1.0);
    doc.line(gx + 8, gy, gx + 19, gy);
    doc.line(gx + 19, gy, gx + 19, gy + 14);
    doc.line(gx + 19, gy + 14, gx + 27, gy + 14);
    doc.line(gx + 27, gy + 14, gx + 27, gy - 5);
    doc.line(gx + 27, gy - 5, gx + 38, gy - 5);
    doc.line(gx + 38, gy - 12, gx + 38, gy + 16);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(15, 76, 129);
    doc.text('Glomerulus', gx, gy - 10, { align: 'center' });
    doc.text('Loop of Henle', gx + 23, gy + 19, { align: 'center' });
    doc.text('Collecting Duct', gx + 38, gy - 14, { align: 'center' });
  } else if (template === 'respiratory') {
    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(1.8);
    doc.line(cx, boxY + 8, cx, cy - 5);
    doc.line(cx, cy - 5, cx - 13, cy + 4);
    doc.line(cx, cy - 5, cx + 13, cy + 4);

    doc.setFillColor(240, 249, 255);
    doc.setDrawColor(56, 189, 248);
    doc.setLineWidth(0.5);
    doc.ellipse(cx - 16, cy + 4, boxW * 0.16, boxH * 0.27, 'FD');
    doc.ellipse(cx + 16, cy + 4, boxW * 0.16, boxH * 0.27, 'FD');
    doc.circle(cx + 17, cy + 8, 5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(15, 76, 129);
    doc.text('Alveoli', cx + 17, cy + 9, { align: 'center' });
  } else if (template === 'hepatobiliary') {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(180, 83, 9);
    doc.setLineWidth(0.55);
    doc.ellipse(cx - 6, cy - 3, boxW * 0.25, boxH * 0.22, 'FD');
    doc.setFillColor(220, 252, 231);
    doc.setDrawColor(21, 128, 61);
    doc.ellipse(cx + 4, cy + 7, 6.2, 3.6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(146, 64, 14);
    doc.text('Hepatic Parenchyma & Portal Vein', cx - 4, cy - 3, { align: 'center' });
    doc.setTextColor(21, 128, 61);
    doc.text('Biliary Tree', cx + 4, cy + 13, { align: 'center' });
  } else {
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(15, 76, 129);
    doc.setLineWidth(0.5);
    doc.roundedRect(cx - boxW * 0.3, cy - 13, boxW * 0.24, 11, 2, 2, 'FD');
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(21, 128, 61);
    doc.roundedRect(cx + boxW * 0.06, cy - 13, boxW * 0.24, 11, 2, 2, 'FD');
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(180, 83, 9);
    doc.roundedRect(cx - boxW * 0.16, cy + 5, boxW * 0.32, 11, 2, 2, 'FD');

    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(0.45);
    doc.line(cx - boxW * 0.06, cy - 7.5, cx + boxW * 0.06, cy - 7.5);
    drawFilledArrowhead(
      doc,
      cx - boxW * 0.06,
      cy - 7.5,
      cx + boxW * 0.06,
      cy - 7.5,
      COLORS.sky,
      1.6
    );
    doc.line(cx + boxW * 0.18, cy - 2, cx + boxW * 0.06, cy + 5);
    drawFilledArrowhead(
      doc,
      cx + boxW * 0.18,
      cy - 2,
      cx + boxW * 0.06,
      cy + 5,
      COLORS.amber,
      1.6
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6);
    doc.setTextColor(15, 76, 129);
    doc.text('Homeostatic Axis', cx - boxW * 0.18, cy - 6.8, { align: 'center' });
    doc.setTextColor(21, 128, 61);
    doc.text('Cellular Pathway', cx + boxW * 0.18, cy - 6.8, { align: 'center' });
    doc.setTextColor(180, 83, 9);
    doc.text('Target Organ Response', cx, cy + 11.5, { align: 'center' });
  }
}

function drawPhysiologyCurveVector(
  doc: jsPDF,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  axisXLabel: string,
  axisYLabel: string
) {
  doc.setFillColor(252, 254, 255);
  doc.setDrawColor(...COLORS.slate300);
  doc.setLineWidth(0.25);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2.2, 2.2, 'FD');

  const ox = boxX + 10;
  const oy = boxY + boxH - 9;
  const gw = boxW - 15;
  const gh = boxH - 15;

  // Subtle grid lines
  doc.setDrawColor(235, 241, 248);
  doc.setLineWidth(0.18);
  for (let i = 1; i <= 3; i++) {
    const gy = oy - (gh * i) / 4;
    doc.line(ox, gy, ox + gw, gy);
    const gx = ox + (gw * i) / 4;
    doc.line(gx, oy - gh, gx, oy);
  }

  // Axes
  doc.setDrawColor(...COLORS.slate700);
  doc.setLineWidth(0.4);
  doc.line(ox, oy - gh, ox, oy);
  doc.line(ox, oy, ox + gw, oy);
  drawFilledArrowhead(doc, ox, oy, ox, oy - gh, COLORS.slate700, 1.4);
  drawFilledArrowhead(doc, ox, oy, ox + gw, oy, COLORS.slate700, 1.4);

  // Normal Homeostatic Curve (Emerald/Cobalt steep physiological reserve)
  doc.setDrawColor(...COLORS.emerald);
  doc.setLineWidth(0.7);
  const normPts: Array<[number, number]> = [
    [0.04, 0.12],
    [0.18, 0.42],
    [0.36, 0.68],
    [0.58, 0.84],
    [0.8, 0.91],
    [0.95, 0.93],
  ];
  for (let i = 0; i < normPts.length - 1; i++) {
    doc.line(
      ox + normPts[i][0] * gw,
      oy - normPts[i][1] * gh,
      ox + normPts[i + 1][0] * gw,
      oy - normPts[i + 1][1] * gh
    );
  }

  // Decompensated / Pathophysiological Curve (Crimson depressed output)
  doc.setDrawColor(...COLORS.red);
  doc.setLineWidth(0.7);
  const pathPts: Array<[number, number]> = [
    [0.04, 0.08],
    [0.2, 0.22],
    [0.42, 0.36],
    [0.64, 0.43],
    [0.82, 0.41],
    [0.95, 0.35],
  ];
  for (let i = 0; i < pathPts.length - 1; i++) {
    doc.line(
      ox + pathPts[i][0] * gw,
      oy - pathPts[i][1] * gh,
      ox + pathPts[i + 1][0] * gw,
      oy - pathPts[i + 1][1] * gh
    );
  }

  // Decompensation threshold vertical marker
  const threshX = ox + 0.64 * gw;
  doc.setDrawColor(...COLORS.amber);
  doc.setLineWidth(0.35);
  doc.line(threshX, oy - gh + 2, threshX, oy);

  // Editable PDF Text Labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(...COLORS.emerald);
  doc.text('Normal Homeostatic Curve', ox + 0.42 * gw, oy - 0.88 * gh);

  doc.setTextColor(...COLORS.red);
  doc.text('Decompensated Disease State', ox + 0.45 * gw, oy - 0.47 * gh);

  doc.setTextColor(...COLORS.amber);
  doc.text('Reserve Limit', threshX + 1.2, oy - gh + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.6);
  doc.setTextColor(...COLORS.slate700);
  doc.text(
    sanitizePdfVectorText(axisXLabel).slice(0, 38),
    ox + gw * 0.5,
    boxY + boxH - 2.5,
    { align: 'center' }
  );
  doc.text(sanitizePdfVectorText(axisYLabel).slice(0, 26), boxX + 2.5, boxY + 4.2);
}

function drawEmbeddedOrVectorPlate(
  doc: jsPDF,
  embeddedImages: Record<string, string> | undefined,
  atlasKey: string,
  systemTemplate: AnatomicalDiagramData['systemTemplate'],
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  pins: Array<{ number: number; label: string; xPct: number; yPct: number }>,
  accentRgb: RgbTuple = COLORS.cobalt,
  organDomain?: FineOrganDomain,
  discipline?: IntegratedDisciplineBlock['discipline']
) {
  const isVectorOnly = atlasKey.startsWith('vector:');
  const dataUrl = !isVectorOnly ? embeddedImages?.[atlasKey] : undefined;
  if (dataUrl && dataUrl.startsWith('data:image/')) {
    doc.setFillColor(...COLORS.white);
    doc.setDrawColor(...COLORS.slate300);
    doc.setLineWidth(0.3);
    doc.roundedRect(boxX, boxY, boxW, boxH, 2.2, 2.2, 'FD');

    const pad = 1.4;
    try {
      const format = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(
        dataUrl,
        format,
        boxX + pad,
        boxY + pad,
        boxW - pad * 2,
        boxH - pad * 2,
        `atlas_${atlasKey}`,
        'FAST'
      );
    } catch {
      drawVectorOrganSchematic(
        doc,
        systemTemplate,
        boxX,
        boxY,
        boxW,
        boxH,
        organDomain,
        discipline
      );
    }
  } else {
    drawVectorOrganSchematic(
      doc,
      systemTemplate,
      boxX,
      boxY,
      boxW,
      boxH,
      organDomain,
      discipline
    );
  }

  // Overlay crisp vector leader lines + numbered badges + editable PDF text labels!
  pins.slice(0, 5).forEach((pin) => {
    const px = boxX + Math.min(0.86, Math.max(0.14, pin.xPct / 100)) * boxW;
    const py = boxY + Math.min(0.86, Math.max(0.16, pin.yPct / 100)) * boxH;

    // Leader line & editable text tag box near pin
    const labelRight = pin.xPct < 52;
    const tagW = Math.min(34, boxW * 0.42);
    const tagH = 4.6;
    const tagX = labelRight
      ? Math.min(boxX + boxW - tagW - 1.5, px + 4.2)
      : Math.max(boxX + 1.5, px - tagW - 4.2);
    const tagY = Math.min(boxY + boxH - tagH - 1.5, Math.max(boxY + 1.5, py - tagH / 2));

    doc.setDrawColor(...accentRgb);
    doc.setLineWidth(0.35);
    doc.line(px, py, labelRight ? tagX : tagX + tagW, tagY + tagH / 2);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...accentRgb);
    doc.setLineWidth(0.28);
    doc.roundedRect(tagX, tagY, tagW, tagH, 1.0, 1.0, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.setTextColor(...accentRgb);
    doc.text(
      sanitizePdfVectorText(`${pin.number}. ${pin.label}`).slice(0, 24),
      tagX + 1.4,
      tagY + 3.1
    );

    doc.setFillColor(...accentRgb);
    doc.setDrawColor(...COLORS.white);
    doc.setLineWidth(0.35);
    doc.circle(px, py, 2.4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.0);
    doc.setTextColor(...COLORS.white);
    doc.text(String(pin.number), px, py + 0.8, { align: 'center' });
  });
}

export interface GeneratedPdfResult {
  blob: Blob;
  filename: string;
  pageCount: number;
}

/**
 * Generates a real, downloadable, text-based and illustrated Medical Textbook Infographic PDF
 * with 11 structured sections, dynamic A4 Portrait + Landscape pages for wide diagrams/tables,
 * embedded medical illustrations with editable text labels, and a validated 48-item Question Bank
 * (30 MCQs + 10 Written Questions + 8 Progressive Clinical Cases) with separate Answer Keys.
 */
export function generateStudyPdfDocument(model: StudyPdfDocumentModel): {
  doc: jsPDF;
  filename: string;
  pageCount: number;
} {
  // AUTOMATED PRE-EXPORT COHERENCE GATE: Hard-block PDF export whenever title, content,
  // illustrations, or the 30/10/8 question bank do not match the canonical selected topic!
  const coherence = validateStudyPdfCoherence(model);
  if (!coherence.valid) {
    throw new Error(
      `PDF Export Blocked — Topic Coherence Validation Failed: ${coherence.issues
        .map((i) => `[${i.section}] ${i.message}`)
        .join(' | ')}`
    );
  }

  const defaultOrientation: PdfPageOrientation = model.config.orientation;
  const isCompact = model.config.style === 'compact';
  const exportMode = model.exportMode || 'full_study_guide';
  const includeQuestionBank =
    exportMode !== 'full_study_guide'
      ? true
      : model.config.includeQuestionBank ?? model.config.includeMcqsWithAnswers;
  const autoLandscapeWide = Boolean(model.config.autoLandscapeWidePages);
  const embeddedImages = model.config.embeddedAtlasImages;

  const doc = new jsPDF({
    orientation: defaultOrientation,
    unit: 'mm',
    format: 'a4',
    compress: false,
  });

  const marginX = 14;
  const headerBottomY = 16.5;

  let curOrientation: PdfPageOrientation = defaultOrientation;
  let pageWidth = curOrientation === 'landscape' ? 297 : 210;
  let pageHeight = curOrientation === 'landscape' ? 210 : 297;
  let footerTopY = pageHeight - 12.5;
  let contentWidth = pageWidth - marginX * 2;
  let maxContentY = footerTopY - 3;
  let cursorY = headerBottomY + 4;

  const syncGeometry = (orient: PdfPageOrientation) => {
    curOrientation = orient;
    pageWidth = orient === 'landscape' ? 297 : 210;
    pageHeight = orient === 'landscape' ? 210 : 297;
    footerTopY = pageHeight - 12.5;
    contentWidth = pageWidth - marginX * 2;
    maxContentY = footerTopY - 3;
  };

  syncGeometry(defaultOrientation);

  const tocPageMap = new Map<string, number>();
  const shouldRenderToc =
    model.config.includeTableOfContents &&
    (model.units.length > 1 || model.tocItems.length >= 3);

  let coverIncluded = false;
  const tocPagesReserved: number[] = [];

  const addContentPage = (targetOrientation?: PdfPageOrientation) => {
    const nextOrient = targetOrientation || curOrientation;
    doc.addPage('a4', nextOrient);
    syncGeometry(nextOrient);
    cursorY = headerBottomY + 5;
  };

  const ensureOrientationAndSpace = (
    neededMm: number,
    desiredOrientation?: PdfPageOrientation
  ) => {
    const want = desiredOrientation || curOrientation;
    if (want !== curOrientation) {
      addContentPage(want);
      return;
    }
    if (cursorY + neededMm > maxContentY) {
      addContentPage(curOrientation);
    }
  };

  const ensureSpace = (neededMm: number) => {
    ensureOrientationAndSpace(neededMm, curOrientation);
  };

  // =========================================================================
  // SECTION 1: COVER PAGE, ILLUSTRATION & LEARNING OBJECTIVES
  // =========================================================================
  if (model.config.includeCoverPage) {
    coverIncluded = true;
    const isCoverLand = curOrientation === 'landscape';
    const bannerH = isCoverLand ? 58 : 74;

    doc.setFillColor(...COLORS.cobalt);
    doc.rect(0, 0, pageWidth, bannerH, 'F');
    doc.setFillColor(...COLORS.sky);
    doc.rect(0, bannerH, pageWidth, 2.2, 'F');

    // Geometric Medical Atlas Emblem
    const emblemX = pageWidth - marginX - 13;
    const emblemY = 22;
    doc.setDrawColor(125, 211, 252);
    doc.setLineWidth(0.5);
    doc.circle(emblemX, emblemY, 10.5, 'S');
    doc.circle(emblemX, emblemY, 7.0, 'S');
    doc.setFillColor(255, 255, 255);
    doc.rect(emblemX - 1.1, emblemY - 4.2, 2.2, 8.4, 'F');
    doc.rect(emblemX - 4.2, emblemY - 1.1, 8.4, 2.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(186, 230, 253);
    doc.text(
      sanitizePdfVectorText(
        `MEDATLAS MEDICAL TEXTBOOK INFOGRAPHIC  |  ${model.scopeLabel.toUpperCase()}`
      ),
      marginX,
      16
    );

    doc.setFont('times', 'bold');
    doc.setFontSize(isCoverLand ? 21 : 23);
    doc.setTextColor(...COLORS.white);
    const titleLines = doc.splitTextToSize(
      sanitizePdfVectorText(model.title),
      contentWidth - 30
    );
    doc.text(titleLines.slice(0, 3), marginX, 27.5);

    const subY = 27.5 + Math.min(3, titleLines.length) * 9 + 2.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(224, 242, 254);
    const subLines = doc.splitTextToSize(
      sanitizePdfVectorText(model.subtitle),
      contentWidth - 28
    );
    doc.text(subLines.slice(0, 2), marginX, Math.min(bannerH - 5, subY));

    let coverY = bannerH + 9;

    // Cover Split Row: Embedded Topic Medical Illustration + Learning Objectives
    const primaryUnit = model.units[0];
    if (primaryUnit) {
      const heroH = isCoverLand ? 54 : 64;
      const illusW = contentWidth * 0.44;
      const objW = contentWidth - illusW - 5;

      const coverPins = (
        primaryUnit.anatomicalDiagram?.callouts.map((c) => ({
          number: c.number,
          label: c.structureName,
          xPct: c.xPercent,
          yPct: c.yPercent,
        })) ||
        primaryUnit.infographicPack.integratedDisciplines[0]?.calloutPins ||
        []
      ).slice(0, 4);

      drawEmbeddedOrVectorPlate(
        doc,
        embeddedImages,
        primaryUnit.coverAtlasKey,
        primaryUnit.systemTemplate,
        marginX,
        coverY,
        illusW,
        heroH,
        coverPins,
        COLORS.cobalt,
        primaryUnit.canonicalTopic.organDomain,
        'anatomy'
      );

      // Right Column: Learning Objectives Card
      const objX = marginX + illusW + 5;
      doc.setFillColor(...COLORS.skyLight);
      doc.setDrawColor(...COLORS.skyBorder);
      doc.setLineWidth(0.3);
      doc.roundedRect(objX, coverY, objW, heroH, 2.2, 2.2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(...COLORS.cobalt);
      doc.text('SECTION 1  |  LEARNING OBJECTIVES', objX + 4, coverY + 6.5);
      doc.setDrawColor(...COLORS.sky);
      doc.setLineWidth(0.35);
      doc.line(objX + 4, coverY + 8.2, objX + objW - 4, coverY + 8.2);

      let oy = coverY + 13;
      const objectives = primaryUnit.infographicPack.learningObjectives.slice(0, 4);
      objectives.forEach((obj, oIdx) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.6);
        doc.setTextColor(...COLORS.sky);
        doc.text(`${oIdx + 1}.`, objX + 4, oy);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.6);
        doc.setTextColor(...COLORS.slate900);
        const oLines = doc.splitTextToSize(
          sanitizePdfVectorText(obj),
          objW - 11
        ).slice(0, 3);
        doc.text(oLines, objX + 8.5, oy);
        oy += oLines.length * 3.5 + 2.2;
      });

      coverY += heroH + 6;
    }

    // Edition & 48-Question Bank Metadata Strip
    doc.setFillColor(...COLORS.slate50);
    doc.setDrawColor(...COLORS.slate200);
    doc.setLineWidth(0.28);
    doc.roundedRect(marginX, coverY, contentWidth, 21, 2, 2, 'FD');

    const statCols = [
      { label: 'Infographic Style', value: model.styleLabel },
      { label: 'Page Geometry', value: model.orientationLabel },
      {
        label: 'Question Bank Included',
        value: includeQuestionBank
          ? `${model.stats.mcqCount} MCQs  |  ${model.stats.writtenCount} Written  |  ${model.stats.clinicalCaseCount} Clinical Cases`
          : ' omitted by user setting',
      },
      { label: 'Generated Date', value: model.generatedDateLabel },
    ];

    const colW = contentWidth / 2;
    statCols.forEach((st, i) => {
      const cx = marginX + 4 + (i % 2) * colW;
      const cy = coverY + 6.5 + Math.floor(i / 2) * 8.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.0);
      doc.setTextColor(...COLORS.slate500);
      doc.text(sanitizePdfVectorText(st.label.toUpperCase()), cx, cy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.0);
      doc.setTextColor(...COLORS.cobalt);
      doc.text(sanitizePdfVectorText(st.value).slice(0, 56), cx + 33, cy);
    });

    coverY += 26;

    // Participating Textbooks Box
    if (coverY + 24 < pageHeight - 28) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.8);
      doc.setTextColor(...COLORS.cobalt);
      doc.text('Indexed Primary Source Textbooks in Library Scope', marginX, coverY);
      coverY += 4;

      const maxBooksOnCover = isCoverLand ? 2 : 3;
      for (const bk of model.participatingBooks.slice(0, maxBooksOnCover)) {
        if (coverY + 13 > pageHeight - 26) break;
        const citedEntry = model.verifiedBookReferences.find(
          (r) => r.textbookId === bk.id
        );
        doc.setFillColor(...COLORS.white);
        doc.setDrawColor(...COLORS.slate200);
        doc.setLineWidth(0.25);
        doc.roundedRect(marginX, coverY, contentWidth, 11, 1.8, 1.8, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.4);
        doc.setTextColor(...COLORS.slate900);
        doc.text(
          sanitizePdfVectorText(bk.title).slice(0, isCoverLand ? 95 : 62),
          marginX + 3.5,
          coverY + 4.6
        );

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.4);
        doc.setTextColor(...COLORS.slate500);
        doc.text(
          sanitizePdfVectorText(
            `Subject: ${bk.subject}  |  ${bk.pageCount} Indexed Pages`
          ),
          marginX + 3.5,
          coverY + 8.8
        );

        doc.setFont('courier', 'bold');
        doc.setFontSize(7.6);
        if (citedEntry) {
          doc.setTextColor(...COLORS.cobalt);
          doc.text(
            sanitizePdfVectorText(`Verified: ${citedEntry.pageLabel}`),
            pageWidth - marginX - 3.5,
            coverY + 6.8,
            { align: 'right' }
          );
        } else {
          doc.setTextColor(...COLORS.amber);
          doc.text('0 pages matched', pageWidth - marginX - 3.5, coverY + 6.8, {
            align: 'right',
          });
        }
        coverY += 12.8;
      }
    }

    // Three-Tier Provenance Guarantee Box at bottom of Cover
    const noteY = pageHeight - 25;
    doc.setFillColor(...COLORS.skyLight);
    doc.setDrawColor(...COLORS.skyBorder);
    doc.roundedRect(marginX, noteY, contentWidth, 14.5, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(...COLORS.cobalt);
    doc.text(
      'Three-Tier Medical Source Provenance Guarantee:',
      marginX + 3.5,
      noteY + 4.8
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.slate700);
    const provLines = doc.splitTextToSize(
      'Strictly separates (1) Verified Uploaded Textbook Citations with exact page numbers, (2) Supplementary Medical Knowledge where textbook excerpts are concise, and (3) Authorized External Clinical Evidence (PubMed / NIH / ClinicalTrials.gov). Never fabricates references.',
      contentWidth - 7
    );
    doc.text(provLines.slice(0, 2), marginX + 3.5, noteY + 8.8);
  }

  // =========================================================================
  // RESERVE TABLE OF CONTENTS PAGE(S) (Two-Pass Exact Page Numbering)
  // =========================================================================
  if (shouldRenderToc) {
    const itemsPerPage = defaultOrientation === 'landscape' ? 16 : 25;
    const neededTocPages = Math.max(
      1,
      Math.ceil(model.tocItems.length / itemsPerPage)
    );
    for (let i = 0; i < neededTocPages; i++) {
      if (coverIncluded || i > 0) {
        doc.addPage('a4', defaultOrientation);
        syncGeometry(defaultOrientation);
      }
      tocPagesReserved.push(doc.getNumberOfPages());
    }
  }

  if (coverIncluded || tocPagesReserved.length > 0) {
    addContentPage(defaultOrientation);
  } else {
    cursorY = headerBottomY + 5;
  }

  // =========================================================================
  // REUSABLE TEXTBOOK INFOGRAPHIC SECTION & DIAGRAM RENDERERS
  // =========================================================================
  const drawBlueSectionBanner = (
    sectionNumberLabel: string,
    title: string,
    rightMeta?: string,
    tocId?: string,
    accentRgb: RgbTuple = COLORS.cobalt
  ) => {
    ensureSpace(15);
    if (tocId) {
      tocPageMap.set(tocId, doc.getNumberOfPages());
    }

    doc.setFillColor(...COLORS.skyLight);
    doc.setDrawColor(...COLORS.skyBorder);
    doc.setLineWidth(0.28);
    doc.roundedRect(marginX, cursorY - 3.5, contentWidth, 9.5, 1.6, 1.6, 'FD');

    // Left solid accent tab
    doc.setFillColor(...accentRgb);
    doc.roundedRect(marginX, cursorY - 3.5, 2.4, 9.5, 0.8, 0.8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.sky);
    doc.text(sanitizePdfVectorText(sectionNumberLabel.toUpperCase()), marginX + 5, cursorY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...accentRgb);
    doc.text(
      sanitizePdfVectorText(title).slice(0, curOrientation === 'landscape' ? 98 : 66),
      marginX + 5,
      cursorY + 4.3
    );

    if (rightMeta) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(...COLORS.slate700);
      doc.text(
        sanitizePdfVectorText(rightMeta).slice(0, 46),
        pageWidth - marginX - 3,
        cursorY + 2.5,
        { align: 'right' }
      );
    }

    cursorY += 9.5;
  };

  const drawSubheadingRule = (
    title: string,
    rightMeta?: string,
    accentRgb: RgbTuple = COLORS.cobalt
  ) => {
    ensureSpace(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.2);
    doc.setTextColor(...accentRgb);
    doc.text(sanitizePdfVectorText(title), marginX, cursorY);

    if (rightMeta) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.3);
      doc.setTextColor(...COLORS.sky);
      doc.text(
        sanitizePdfVectorText(rightMeta).slice(0, 52),
        pageWidth - marginX,
        cursorY,
        { align: 'right' }
      );
    }

    cursorY += 2;
    doc.setDrawColor(...accentRgb);
    doc.setLineWidth(0.4);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 4.8;
  };

  const renderTwoColumnBullets = (heading: string, bullets: string[]) => {
    if (bullets.length === 0) return;
    ensureSpace(20);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.cobalt);
    doc.text(sanitizePdfVectorText(heading), marginX, cursorY);
    cursorY += 3.8;

    const gutter = 5;
    const colW = (contentWidth - gutter) / 2;
    for (let i = 0; i < bullets.length; i += 2) {
      const leftB = bullets[i];
      const rightB = bullets[i + 1];

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.1);
      const leftLines = doc.splitTextToSize(
        `- ${sanitizePdfVectorText(leftB)}`,
        colW - 5
      );
      const rightLines = rightB
        ? doc.splitTextToSize(`- ${sanitizePdfVectorText(rightB)}`, colW - 5)
        : [];
      const rowH = Math.max(leftLines.length, rightLines.length) * 3.7 + 3.4;

      ensureSpace(rowH + 2);
      doc.setFillColor(...COLORS.slate50);
      doc.setDrawColor(...COLORS.slate200);
      doc.setLineWidth(0.2);
      doc.roundedRect(marginX, cursorY - 2.2, colW, rowH, 1.4, 1.4, 'FD');
      doc.setTextColor(...COLORS.slate900);
      doc.text(leftLines, marginX + 2.5, cursorY + 1.2);

      if (rightB) {
        const rx = marginX + colW + gutter;
        doc.setFillColor(...COLORS.slate50);
        doc.setDrawColor(...COLORS.slate200);
        doc.roundedRect(rx, cursorY - 2.2, colW, rowH, 1.4, 1.4, 'FD');
        doc.setTextColor(...COLORS.slate900);
        doc.text(rightLines, rx + 2.5, cursorY + 1.2);
      }

      cursorY += rowH + 2;
    }
    cursorY += 1.5;
  };

  const renderDrugComparisonTable = (rows: DrugComparisonRow[], title: string) => {
    if (!rows || rows.length === 0) return;
    ensureSpace(24);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(...COLORS.indigo);
    doc.text(sanitizePdfVectorText(title), marginX, cursorY);
    cursorY += 2.8;

    const headers = [
      'Drug Class',
      'Prototype Agents',
      'Mechanism of Action',
      'Indications',
      'Adverse Effects / Contraindications',
    ];
    const colRatios = [0.16, 0.16, 0.25, 0.19, 0.24];
    const colWidths = colRatios.map((r) => contentWidth * r);

    const drawHeader = () => {
      doc.setFillColor(...COLORS.indigo);
      doc.rect(marginX, cursorY, contentWidth, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.0);
      doc.setTextColor(...COLORS.white);
      let x = marginX;
      headers.forEach((h, i) => {
        doc.text(h, x + 2, cursorY + 4.6);
        x += colWidths[i];
      });
      cursorY += 7;
    };

    drawHeader();

    rows.forEach((r, idx) => {
      const cells = [
        r.drugClass,
        r.prototypeAgents,
        r.mechanismOfAction,
        r.clinicalIndications,
        r.adverseEffectsAndContraindications,
      ];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.1);
      const wrapped = cells.map((c, i) =>
        doc.splitTextToSize(sanitizePdfVectorText(c), colWidths[i] - 3.5)
      );
      const maxLines = Math.max(...wrapped.map((w) => w.length));
      const rowH = maxLines * 3.4 + 3.2;

      if (cursorY + rowH > maxContentY) {
        addContentPage(curOrientation);
        drawHeader();
      }

      doc.setFillColor(...(idx % 2 === 0 ? COLORS.white : COLORS.indigoLight));
      doc.setDrawColor(...COLORS.slate200);
      doc.setLineWidth(0.2);
      doc.rect(marginX, cursorY, contentWidth, rowH, 'FD');

      let x = marginX;
      wrapped.forEach((lines, cIdx) => {
        doc.setFont('helvetica', cIdx === 0 ? 'bold' : 'normal');
        doc.setFontSize(7.1);
        doc.setTextColor(...(cIdx === 0 ? COLORS.indigo : COLORS.slate900));
        doc.text(lines, x + 1.8, cursorY + 3.6);
        x += colWidths[cIdx];
      });

      cursorY += rowH;
    });
    cursorY += 4;
  };

  const renderIntegratedDisciplineBlock = (
    block: IntegratedDisciplineBlock,
    systemTemplate: AnatomicalDiagramData['systemTemplate'],
    canonicalTopic: CanonicalTopicDescriptor
  ) => {
    const meta = DISCIPLINE_META[block.discipline] || DISCIPLINE_META.clinical_correlations;
    const accentRgb = hexToRgb(meta.accentHex);
    const tintRgb = hexToRgb(meta.tintHex);
    const borderRgb = hexToRgb(meta.borderHex);

    const cite =
      block.sourceBasis === 'textbook' &&
      (block.pageNumbers.length > 0 || (block.bookCitations && block.bookCitations.length > 0))
        ? formatBookCitationsSummary(block.bookCitations, block.pageNumbers)
        : 'Supplementary Medical Knowledge';

    ensureSpace(64);
    drawSubheadingRule(
      `${block.disciplineLabel} — ${block.title}`,
      cite,
      accentRgb
    );

    // Balanced Two-Column Textbook Spread: Left = Prose & Highlighted Terms | Right = Embedded/Vector Visual Plate + Callout Key
    const gutter = 5;
    const leftW = contentWidth * 0.51;
    const rightW = contentWidth - leftW - gutter;
    const rightX = marginX + leftW + gutter;
    const startSpreadY = cursorY;

    // Left Column: Detailed prose + Key Bullets + Highlighted Terms
    let leftY = startSpreadY;
    doc.setFont('times', 'normal');
    doc.setFontSize(9.3);
    doc.setTextColor(...COLORS.slate900);
    const proseLines = doc.splitTextToSize(
      sanitizePdfVectorText(block.detailedExplanation),
      leftW
    );
    const maxProseLines = Math.min(proseLines.length, 15);
    doc.text(proseLines.slice(0, maxProseLines), marginX, leftY + 3);
    leftY += maxProseLines * 3.9 + 4;

    if (block.keyPoints.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...accentRgb);
      doc.text('Key Mechanistic & Clinical Points:', marginX, leftY);
      leftY += 3.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(...COLORS.slate900);
      block.keyPoints.slice(0, 4).forEach((kp) => {
        const kpLines = doc.splitTextToSize(
          `- ${sanitizePdfVectorText(kp)}`,
          leftW - 2
        ).slice(0, 3);
        doc.text(kpLines, marginX + 1, leftY);
        leftY += kpLines.length * 3.4 + 1;
      });
    }

    if (block.highlightedTerms.length > 0) {
      leftY += 1.5;
      block.highlightedTerms.slice(0, 3).forEach((ht) => {
        const termText = `${ht.term}: ${ht.definition}`;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        const htLines = doc.splitTextToSize(
          sanitizePdfVectorText(termText),
          leftW - 5
        ).slice(0, 2);
        const hBox = htLines.length * 3.2 + 3.2;
        doc.setFillColor(...tintRgb);
        doc.setDrawColor(...borderRgb);
        doc.setLineWidth(0.2);
        doc.roundedRect(marginX, leftY - 2.2, leftW, hBox, 1.2, 1.2, 'FD');
        doc.setTextColor(...COLORS.slate900);
        doc.text(htLines, marginX + 2.2, leftY + 0.8);
        leftY += hBox + 1.5;
      });
    }

    // Right Column: Embedded Medical Illustration OR Vector Physiological Curve + Editable Callout Legend
    let rightY = startSpreadY;
    const plateH = 44;
    const atlasKey = resolveStrictTopicAtlasKey(
      canonicalTopic,
      block.discipline,
      block.visualKind
    );

    if (block.visualKind === 'physiology_curve') {
      drawPhysiologyCurveVector(
        doc,
        rightX,
        rightY,
        rightW,
        plateH,
        block.curveAxisX || 'Time / Physiological Load',
        block.curveAxisY || 'Homeostatic Output'
      );
    } else {
      drawEmbeddedOrVectorPlate(
        doc,
        embeddedImages,
        atlasKey,
        systemTemplate,
        rightX,
        rightY,
        rightW,
        plateH,
        block.calloutPins,
        accentRgb,
        canonicalTopic.organDomain,
        block.discipline
      );
    }
    rightY += plateH + 3.2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...accentRgb);
    const capTitleLines = doc.splitTextToSize(
      sanitizePdfVectorText(block.visualTitle),
      rightW
    ).slice(0, 2);
    doc.text(capTitleLines, rightX, rightY);
    rightY += capTitleLines.length * 3.1 + 0.8;

    // Editable Callout Pin Key below plate
    block.calloutPins.slice(0, 4).forEach((pin) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...COLORS.slate700);
      const pLines = doc.splitTextToSize(
        sanitizePdfVectorText(`(${pin.number}) ${pin.label}: ${pin.detail}`),
        rightW
      ).slice(0, 2);
      doc.text(pLines, rightX, rightY);
      rightY += pLines.length * 3.0 + 0.8;
    });

    cursorY = Math.max(leftY, rightY) + 2.5;

    // Normal vs Abnormal Histopathology Comparison Strip when pathology block has notes
    if (
      block.discipline === 'pathology' &&
      (block.normalComparisonNote || block.pathologicalComparisonNote)
    ) {
      const halfW = (contentWidth - 4) / 2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      const nLines = doc.splitTextToSize(
        sanitizePdfVectorText(block.normalComparisonNote || 'Intact normal histology.'),
        halfW - 5
      ).slice(0, 3);
      const pLines = doc.splitTextToSize(
        sanitizePdfVectorText(
          block.pathologicalComparisonNote || 'Characteristic pathological lesion.'
        ),
        halfW - 5
      ).slice(0, 3);
      const cmpH = Math.max(nLines.length, pLines.length) * 3.3 + 7.5;
      ensureSpace(cmpH + 3);

      doc.setFillColor(...COLORS.emeraldLight);
      doc.setDrawColor(...COLORS.emeraldBorder);
      doc.roundedRect(marginX, cursorY, halfW, cmpH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(...COLORS.emerald);
      doc.text('Normal Baseline Tissue Architecture', marginX + 2.5, cursorY + 4.2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.slate900);
      doc.text(nLines, marginX + 2.5, cursorY + 7.8);

      const px = marginX + halfW + 4;
      doc.setFillColor(...COLORS.redLight);
      doc.setDrawColor(...COLORS.redBorder);
      doc.roundedRect(px, cursorY, halfW, cmpH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(...COLORS.red);
      doc.text('Pathological Alteration & Lesion', px + 2.5, cursorY + 4.2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.slate900);
      doc.text(pLines, px + 2.5, cursorY + 7.8);

      cursorY += cmpH + 3;
    }

    // Clinical Pearl Box for Discipline
    if (block.clinicalCorrelationPearl) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      const pearlLines = doc.splitTextToSize(
        sanitizePdfVectorText(`Clinical Correlation Pearl: ${block.clinicalCorrelationPearl}`),
        contentWidth - 7
      ).slice(0, 3);
      const pearlH = pearlLines.length * 3.5 + 3.6;
      ensureSpace(pearlH + 3);
      doc.setFillColor(...tintRgb);
      doc.setDrawColor(...borderRgb);
      doc.roundedRect(marginX, cursorY - 2, contentWidth, pearlH, 1.5, 1.5, 'FD');
      doc.setTextColor(...accentRgb);
      doc.text(pearlLines, marginX + 3.5, cursorY + 1.4);
      cursorY += pearlH + 3;
    }

    // Pharmacology Drug Comparison Table when present
    if (block.drugComparisonRows && block.drugComparisonRows.length > 0) {
      renderDrugComparisonTable(
        block.drugComparisonRows,
        `Pharmacology Therapeutic Comparison — ${block.title}`
      );
    }
  };

  const renderVectorMindMap = (mindMap: MindMapData) => {
    const layout = computeMindMapLayout(mindMap);
    const figH = curOrientation === 'landscape' ? 88 : 74;
    ensureSpace(figH + 11);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.cobalt);
    doc.text(
      sanitizePdfVectorText(`Visual Mind Map — ${mindMap.centralTopic}`),
      marginX,
      cursorY
    );
    cursorY += 3;

    const boxY = cursorY;
    doc.setFillColor(252, 253, 255);
    doc.setDrawColor(...COLORS.slate200);
    doc.setLineWidth(0.28);
    doc.roundedRect(marginX, boxY, contentWidth, figH, 2.5, 2.5, 'FD');

    const pad = 4.5;
    const scaleX = (contentWidth - pad * 2) / Math.max(1, layout.width);
    const scaleY = (figH - pad * 2) / Math.max(1, layout.height);
    const mapX = (sx: number) => marginX + pad + sx * scaleX;
    const mapY = (sy: number) => boxY + pad + sy * scaleY;

    const posMap = new Map<string, { x: number; y: number }>();
    posMap.set('__center__', { x: mapX(layout.centerX), y: mapY(layout.centerY) });
    for (const pn of layout.nodes) {
      posMap.set(pn.node.id, { x: mapX(pn.x), y: mapY(pn.y) });
    }

    for (const edge of layout.edges) {
      const fromPt = posMap.get(edge.fromId);
      const toPt = posMap.get(edge.toId);
      if (!fromPt || !toPt) continue;
      const rgb = hexToRgb(edge.colorHex);
      doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
      doc.setLineWidth(0.48);
      const midX = (fromPt.x + toPt.x) / 2;
      doc.line(fromPt.x, fromPt.y, midX, fromPt.y);
      doc.line(midX, fromPt.y, midX, toPt.y);
      doc.line(midX, toPt.y, toPt.x, toPt.y);

      if (edge.label) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.2);
        doc.setTextColor(...COLORS.slate500);
        doc.text(
          sanitizePdfVectorText(edge.label).slice(0, 22),
          midX,
          (fromPt.y + toPt.y) / 2 - 0.8,
          { align: 'center' }
        );
      }
    }

    const cw = Math.max(38, layout.centerWidth * scaleX);
    const ch = Math.max(12.5, layout.centerHeight * scaleY);
    const cx = mapX(layout.centerX) - cw / 2;
    const cy = mapY(layout.centerY) - ch / 2;
    doc.setFillColor(...COLORS.cobalt);
    doc.roundedRect(cx, cy, cw, ch, 2.2, 2.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(...COLORS.white);
    const cLines = doc.splitTextToSize(
      sanitizePdfVectorText(mindMap.centralTopic),
      cw - 4
    );
    doc.text(
      cLines.slice(0, 2),
      cx + cw / 2,
      cy + ch / 2 - (cLines.length > 1 ? 1 : -1),
      { align: 'center' }
    );

    for (const pn of layout.nodes) {
      const nw = Math.max(34, pn.width * scaleX);
      const nh = Math.max(10, pn.height * scaleY);
      const nx = mapX(pn.x) - nw / 2;
      const ny = mapY(pn.y) - nh / 2;
      const fillRgb = hexToRgb(pn.tintHex);
      const borderRgb = hexToRgb(pn.borderHex);
      const titleRgb = hexToRgb(pn.colorHex);

      doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
      doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
      doc.setLineWidth(0.35);
      doc.roundedRect(nx, ny, nw, nh, 1.6, 1.6, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.7);
      doc.setTextColor(titleRgb[0], titleRgb[1], titleRgb[2]);
      const nLines = doc.splitTextToSize(
        sanitizePdfVectorText(pn.node.label),
        nw - 3
      );
      doc.text(nLines.slice(0, 2), nx + nw / 2, ny + 3.8, { align: 'center' });

      const catTitle =
        MIND_MAP_CATEGORY_PALETTE[pn.node.category]?.title || pn.node.category;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.4);
      doc.setTextColor(...COLORS.slate500);
      doc.text(
        sanitizePdfVectorText(catTitle).slice(0, 24),
        nx + nw / 2,
        ny + nh - 1.4,
        { align: 'center' }
      );
    }

    cursorY = boxY + figH + 5;
  };

  const renderVectorFlowchart = (flow: FlowchartData) => {
    const layout = computeFlowchartLayout(flow);
    const figH = Math.min(
      curOrientation === 'landscape' ? 86 : 88,
      Math.max(52, layout.height * 0.145)
    );
    ensureSpace(figH + 11);

    const citeLabel =
      flow.sourceBasis === 'textbook' &&
      (flow.pageNumbers.length > 0 ||
        (flow.bookCitations && flow.bookCitations.length > 0))
        ? formatBookCitationsSummary(flow.bookCitations, flow.pageNumbers)
        : 'Supplementary Medical Knowledge';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.cobalt);
    doc.text(sanitizePdfVectorText(`Mechanism Flowchart — ${flow.title}`), marginX, cursorY);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.slate500);
    doc.text(sanitizePdfVectorText(citeLabel), pageWidth - marginX, cursorY, {
      align: 'right',
    });
    cursorY += 3;

    const boxY = cursorY;
    doc.setFillColor(252, 253, 255);
    doc.setDrawColor(...COLORS.slate200);
    doc.setLineWidth(0.28);
    doc.roundedRect(marginX, boxY, contentWidth, figH, 2.5, 2.5, 'FD');

    const padX = 8;
    const padY = 5;
    const scaleX = (contentWidth - padX * 2) / Math.max(1, layout.width);
    const scaleY = (figH - padY * 2) / Math.max(1, layout.height);
    const fx = (sx: number) => marginX + padX + sx * scaleX;
    const fy = (sy: number) => boxY + padY + sy * scaleY;

    const nodeLookup = new Map<
      string,
      { cx: number; cy: number; w: number; h: number }
    >();
    for (const pn of layout.nodes) {
      const w = Math.min(
        curOrientation === 'landscape' ? 76 : 64,
        Math.max(36, pn.width * scaleX)
      );
      const h = Math.min(15.5, Math.max(9.5, pn.height * scaleY));
      nodeLookup.set(pn.node.id, { cx: fx(pn.x), cy: fy(pn.y), w, h });
    }

    for (const edge of layout.edges) {
      const src = nodeLookup.get(edge.edge.from);
      const dst = nodeLookup.get(edge.edge.to);
      if (!src || !dst) continue;

      const x1 = src.cx;
      const y1 = src.cy + src.h / 2;
      const x2 = dst.cx;
      const y2 = dst.cy - dst.h / 2;

      doc.setDrawColor(...COLORS.sky);
      doc.setLineWidth(0.45);
      if (Math.abs(x1 - x2) < 2) {
        doc.line(x1, y1, x2, y2);
        drawFilledArrowhead(doc, x1, y1, x2, y2, COLORS.sky, 1.8);
      } else {
        const midY = (y1 + y2) / 2;
        doc.line(x1, y1, x1, midY);
        doc.line(x1, midY, x2, midY);
        doc.line(x2, midY, x2, y2);
        drawFilledArrowhead(doc, x2, midY, x2, y2, COLORS.sky, 1.8);
      }

      if (edge.edge.label) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.0);
        doc.setTextColor(...COLORS.cobalt);
        doc.text(
          sanitizePdfVectorText(edge.edge.label).slice(0, 26),
          (x1 + x2) / 2 + 1.5,
          (y1 + y2) / 2 - 0.6
        );
      }
    }

    for (const pn of layout.nodes) {
      const geom = nodeLookup.get(pn.node.id);
      if (!geom) continue;
      const nx = geom.cx - geom.w / 2;
      const ny = geom.cy - geom.h / 2;

      let fill = COLORS.white;
      let stroke = COLORS.cobalt;
      let textCol = COLORS.slate900;

      if (pn.node.nodeType === 'start') {
        fill = COLORS.cobalt;
        stroke = COLORS.cobalt;
        textCol = COLORS.white;
      } else if (pn.node.nodeType === 'decision') {
        fill = COLORS.amberLight;
        stroke = COLORS.amber;
      } else if (pn.node.nodeType === 'action') {
        fill = COLORS.emeraldLight;
        stroke = COLORS.emerald;
      } else if (pn.node.nodeType === 'alert') {
        fill = COLORS.redLight;
        stroke = COLORS.red;
      } else {
        fill = COLORS.skyLight;
        stroke = COLORS.sky;
      }

      doc.setFillColor(...fill);
      doc.setDrawColor(...stroke);
      doc.setLineWidth(0.4);
      doc.roundedRect(nx, ny, geom.w, geom.h, 1.8, 1.8, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.7);
      doc.setTextColor(...textCol);
      const labelLines = doc.splitTextToSize(
        sanitizePdfVectorText(pn.node.label),
        geom.w - 3
      );
      doc.text(
        labelLines.slice(0, 2),
        geom.cx,
        ny + (labelLines.length > 1 ? 3.6 : geom.h / 2 + 1),
        { align: 'center' }
      );
    }

    cursorY = boxY + figH + 5;
  };

  const renderLabeledAnatomicalOverviewPlate = (
    diagram: AnatomicalDiagramData,
    canonicalTopic: CanonicalTopicDescriptor
  ) => {
    const schematicH = 56;
    ensureSpace(schematicH + 26);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.cobalt);
    doc.text(
      sanitizePdfVectorText(`Labeled Anatomical Cross-Section — ${diagram.title}`),
      marginX,
      cursorY
    );
    cursorY += 3;

    const schemW = contentWidth * 0.48;
    const summaryW = contentWidth - schemW - 5;
    const topY = cursorY;

    const atlasKey = resolveStrictTopicAtlasKey(
      canonicalTopic,
      'anatomy',
      'atlas_plate'
    );
    drawEmbeddedOrVectorPlate(
      doc,
      embeddedImages,
      atlasKey,
      diagram.systemTemplate,
      marginX,
      topY,
      schemW,
      schematicH,
      diagram.callouts.map((c) => ({
        number: c.number,
        label: c.structureName,
        xPct: c.xPercent,
        yPct: c.yPercent,
      })),
      COLORS.cobalt,
      canonicalTopic.organDomain,
      'anatomy'
    );

    const rightX = marginX + schemW + 5;
    const halfH = (schematicH - 3) / 2;

    doc.setFillColor(...COLORS.skyLight);
    doc.setDrawColor(...COLORS.skyBorder);
    doc.roundedRect(rightX, topY, summaryW, halfH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLORS.cobalt);
    doc.text('Normal Baseline Physiology', rightX + 3, topY + 4.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...COLORS.slate700);
    const normLines = doc.splitTextToSize(
      sanitizePdfVectorText(diagram.normalPhysiologySummary),
      summaryW - 6
    );
    doc.text(normLines.slice(0, 4), rightX + 3, topY + 9);

    const pathY = topY + halfH + 3;
    doc.setFillColor(...COLORS.amberLight);
    doc.setDrawColor(...COLORS.amberBorder);
    doc.roundedRect(rightX, pathY, summaryW, halfH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLORS.amber);
    doc.text('Pathophysiological Remodeling', rightX + 3, pathY + 4.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...COLORS.slate700);
    const pathLines = doc.splitTextToSize(
      sanitizePdfVectorText(diagram.pathophysiologySummary),
      summaryW - 6
    );
    doc.text(pathLines.slice(0, 4), rightX + 3, pathY + 9);

    cursorY = topY + schematicH + 4;

    const gutter = 5;
    const colW = (contentWidth - gutter) / 2;
    const callouts = diagram.callouts;
    for (let i = 0; i < callouts.length; i += 2) {
      const leftC = callouts[i];
      const rightC = callouts[i + 1];

      const formatCalloutBody = (c: typeof leftC) =>
        `Normal: ${sanitizePdfVectorText(c.normalRole)}\nPathology: ${sanitizePdfVectorText(c.pathologicalChange)}`;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      const lLines = doc.splitTextToSize(formatCalloutBody(leftC), colW - 6);
      const rLines = rightC
        ? doc.splitTextToSize(formatCalloutBody(rightC), colW - 6)
        : [];
      const cardH = Math.max(lLines.length, rLines.length) * 3.4 + 7.5;

      ensureSpace(cardH + 2);
      doc.setFillColor(...COLORS.white);
      doc.setDrawColor(...COLORS.slate200);
      doc.roundedRect(marginX, cursorY, colW, cardH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...COLORS.cobalt);
      doc.text(
        sanitizePdfVectorText(`(${leftC.number}) ${leftC.structureName}`),
        marginX + 3,
        cursorY + 4.4
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...COLORS.slate700);
      doc.text(lLines, marginX + 3, cursorY + 8.2);

      if (rightC) {
        const rx = marginX + colW + gutter;
        doc.setFillColor(...COLORS.white);
        doc.setDrawColor(...COLORS.slate200);
        doc.roundedRect(rx, cursorY, colW, cardH, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(...COLORS.cobalt);
        doc.text(
          sanitizePdfVectorText(`(${rightC.number}) ${rightC.structureName}`),
          rx + 3,
          cursorY + 4.4
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(...COLORS.slate700);
        doc.text(rLines, rx + 3, cursorY + 8.2);
      }

      cursorY += cardH + 2.2;
    }
    cursorY += 2;
  };

  const renderComparisonTable = (table: ComparisonTableData) => {
    ensureSpace(24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.cobalt);
    doc.text(sanitizePdfVectorText(table.title), marginX, cursorY);
    cursorY += 3;

    const totalCols = 1 + table.columns.length;
    const featureW = contentWidth * 0.22;
    const dataColW = (contentWidth - featureW) / Math.max(1, totalCols - 1);

    const drawHeaderRow = () => {
      doc.setFillColor(...COLORS.cobalt);
      doc.rect(marginX, cursorY, contentWidth, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...COLORS.white);
      doc.text('Clinical Feature', marginX + 2.5, cursorY + 5);
      table.columns.forEach((col, cIdx) => {
        const cx = marginX + featureW + cIdx * dataColW + 2.5;
        doc.text(
          sanitizePdfVectorText(col).slice(
            0,
            curOrientation === 'landscape' ? 42 : 28
          ),
          cx,
          cursorY + 5
        );
      });
      cursorY += 7.5;
    };

    drawHeaderRow();

    table.rows.forEach((row, rIdx) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      const featLines = doc.splitTextToSize(
        sanitizePdfVectorText(row.feature),
        featureW - 4
      );
      const cellLineArrays = table.columns.map((_, cIdx) =>
        doc.splitTextToSize(
          sanitizePdfVectorText(row.cells[cIdx] || '-'),
          dataColW - 4
        )
      );
      const maxLines = Math.max(
        featLines.length,
        ...cellLineArrays.map((arr) => arr.length)
      );
      const rowH = maxLines * 3.6 + 3.5;

      if (cursorY + rowH > maxContentY) {
        addContentPage(curOrientation);
        drawHeaderRow();
      }

      doc.setFillColor(...(rIdx % 2 === 0 ? COLORS.white : COLORS.slate50));
      doc.setDrawColor(...COLORS.slate200);
      doc.setLineWidth(0.2);
      doc.rect(marginX, cursorY, contentWidth, rowH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(...COLORS.cobalt);
      doc.text(featLines, marginX + 2.5, cursorY + 4);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.slate900);
      cellLineArrays.forEach((cLines, cIdx) => {
        const cx = marginX + featureW + cIdx * dataColW + 2.5;
        doc.text(cLines, cx, cursorY + 4);
      });

      cursorY += rowH;
    });
    cursorY += 4.5;
  };

  const renderClinicalNotesGrid = (notes: ClinicalNote[]) => {
    if (notes.length === 0) return;
    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.cobalt);
    doc.text('Clinical Pearls, Red Flags & Bedside Protocols', marginX, cursorY);
    cursorY += 3.8;

    const gutter = 5;
    const colW = (contentWidth - gutter) / 2;

    for (let i = 0; i < notes.length; i += 2) {
      const leftN = notes[i];
      const rightN = notes[i + 1];

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      const lLines = doc.splitTextToSize(
        sanitizePdfVectorText(leftN.detail),
        colW - 6
      );
      const rLines = rightN
        ? doc.splitTextToSize(sanitizePdfVectorText(rightN.detail), colW - 6)
        : [];
      const boxH = Math.max(lLines.length, rLines.length) * 3.6 + 9.5;

      ensureSpace(boxH + 2);

      const drawNoteBox = (n: ClinicalNote, bx: number, lines: string[]) => {
        const isRed = n.category === 'Red Flag';
        doc.setFillColor(...(isRed ? COLORS.redLight : COLORS.slate50));
        doc.setDrawColor(...(isRed ? COLORS.redBorder : COLORS.slate200));
        doc.setLineWidth(0.25);
        doc.roundedRect(bx, cursorY, colW, boxH, 1.8, 1.8, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(...(isRed ? COLORS.red : COLORS.cobalt));
        doc.text(
          sanitizePdfVectorText(`${n.category}: ${n.title}`).slice(0, 52),
          bx + 3,
          cursorY + 4.4
        );

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.6);
        doc.setTextColor(...COLORS.slate900);
        doc.text(lines, bx + 3, cursorY + 8.4);

        const cite =
          n.sourceBasis === 'textbook' &&
          (n.pageNumbers.length > 0 ||
            (n.bookCitations && n.bookCitations.length > 0))
            ? formatBookCitationsSummary(n.bookCitations, n.pageNumbers)
            : 'Supplementary Knowledge';
        doc.setFont('courier', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...COLORS.slate500);
        doc.text(sanitizePdfVectorText(cite).slice(0, 48), bx + 3, cursorY + boxH - 1.5);
      };

      drawNoteBox(leftN, marginX, lLines);
      if (rightN) {
        drawNoteBox(rightN, marginX + colW + gutter, rLines);
      }
      cursorY += boxH + 2.5;
    }
    cursorY += 2;
  };

  // =========================================================================
  // QUESTION BANK RENDERERS (SECTIONS 7, 8, 9 SELF-TEST + SECTION 10 ANSWER KEY)
  // =========================================================================
  const renderSelfTestMcqsSection = (mcqs: QuestionBankMcq[], tocId: string) => {
    if (mcqs.length === 0) return;
    drawBlueSectionBanner(
      'Section 7  |  Self-Assessment Multiple-Choice Questions',
      `${mcqs.length} Single-Best-Answer MCQs (Question-Only for Self-Testing)`,
      'Score: [ ____ / 30 ]',
      tocId
    );

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLORS.slate500);
    doc.text(
      'Instructions: Select the single best option for each question before checking Section 10 (Separate Answer Keys & Rationales).',
      marginX,
      cursorY
    );
    cursorY += 4.5;

    // Two-Column Exam Layout for crisp, readable self-testing
    const gutter = 6;
    const colW = (contentWidth - gutter) / 2;

    for (let i = 0; i < mcqs.length; i += 2) {
      const leftQ = mcqs[i];
      const rightQ = mcqs[i + 1];

      const measureQuestionCard = (q: QuestionBankMcq) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        const stemLines = doc.splitTextToSize(
          sanitizePdfVectorText(`Q${q.number}. ${q.stem}`),
          colW - 5
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.4);
        const optLinesArr = q.options.map((opt, oIdx) =>
          doc.splitTextToSize(
            sanitizePdfVectorText(`[ ] ${String.fromCharCode(65 + oIdx)}. ${opt}`),
            colW - 7
          )
        );
        const optHeight = optLinesArr.reduce(
          (sum, arr) => sum + arr.length * 3.3 + 0.8,
          0
        );
        return {
          stemLines,
          optLinesArr,
          totalH: 5.5 + stemLines.length * 3.5 + optHeight + 2.5,
        };
      };

      const leftM = measureQuestionCard(leftQ);
      const rightM = rightQ ? measureQuestionCard(rightQ) : null;
      const rowH = Math.max(leftM.totalH, rightM?.totalH || 0);

      ensureSpace(Math.min(maxContentY - headerBottomY - 8, rowH + 2));

      const drawCard = (
        q: QuestionBankMcq,
        m: ReturnType<typeof measureQuestionCard>,
        bx: number
      ) => {
        doc.setFillColor(...COLORS.white);
        doc.setDrawColor(...COLORS.slate200);
        doc.setLineWidth(0.22);
        doc.roundedRect(bx, cursorY, colW, rowH, 1.5, 1.5, 'FD');

        // Metadata line (Difficulty · Discipline)
        doc.setFont('courier', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(...COLORS.sky);
        doc.text(
          sanitizePdfVectorText(`${q.difficulty}  |  ${q.discipline}`).slice(0, 46),
          bx + 2.5,
          cursorY + 3.6
        );

        let qy = cursorY + 7.2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(...COLORS.slate900);
        doc.text(m.stemLines, bx + 2.5, qy);
        qy += m.stemLines.length * 3.5 + 1.2;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.3);
        doc.setTextColor(...COLORS.slate700);
        m.optLinesArr.forEach((oLines) => {
          doc.text(oLines, bx + 3.5, qy);
          qy += oLines.length * 3.3 + 0.8;
        });
      };

      drawCard(leftQ, leftM, marginX);
      if (rightQ && rightM) {
        drawCard(rightQ, rightM, marginX + colW + gutter);
      }

      cursorY += rowH + 2.4;
    }
    cursorY += 2;
  };

  const renderSelfTestWrittenSection = (
    written: QuestionBankWrittenItem[],
    tocId: string
  ) => {
    if (written.length === 0) return;
    drawBlueSectionBanner(
      'Section 8  |  Structured Written Examination',
      `${written.length} Short-Essay & Clinical Work-Up Questions (Question-Only)`,
      'Total: 100 Marks',
      tocId,
      COLORS.indigo
    );

    written.forEach((wq) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.4);
      const pLines = doc.splitTextToSize(
        sanitizePdfVectorText(`W${wq.number}. [${wq.commandVerb.toUpperCase()}] ${wq.prompt}`),
        contentWidth - 26
      );
      const cardH = pLines.length * 3.8 + 8.5;
      ensureSpace(cardH + 2);

      doc.setFillColor(...COLORS.slate50);
      doc.setDrawColor(...COLORS.slate200);
      doc.setLineWidth(0.24);
      doc.roundedRect(marginX, cursorY, contentWidth, cardH, 1.6, 1.6, 'FD');

      doc.setFont('courier', 'bold');
      doc.setFontSize(6.6);
      doc.setTextColor(...COLORS.indigo);
      doc.text(
        sanitizePdfVectorText(`${wq.difficulty}  |  ${wq.discipline}`),
        marginX + 3,
        cursorY + 3.8
      );
      doc.text(
        `[${wq.totalMarks} Marks]`,
        pageWidth - marginX - 3,
        cursorY + 3.8,
        { align: 'right' }
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(...COLORS.slate900);
      doc.text(pLines, marginX + 3, cursorY + 7.8);

      cursorY += cardH + 2.2;
    });
    cursorY += 2;
  };

  const renderSelfTestCasesSection = (
    cases: QuestionBankClinicalCase[],
    tocId: string
  ) => {
    if (cases.length === 0) return;
    drawBlueSectionBanner(
      'Section 9  |  Progressive Clinical Case Scenarios',
      `${cases.length} Bedside Vignettes with Progressive Questions (Question-Only)`,
      'Diagnosis -> Workup -> Management',
      tocId,
      COLORS.teal
    );

    cases.forEach((cs) => {
      doc.setFont('times', 'normal');
      doc.setFontSize(8.8);
      const presLines = doc.splitTextToSize(
        sanitizePdfVectorText(cs.patientPresentation),
        contentWidth - 7
      );

      const subQLines = cs.progressiveQuestions.map((pq) =>
        doc.splitTextToSize(
          sanitizePdfVectorText(
            `${pq.partLabel} (${pq.focusArea}): ${pq.question}`
          ),
          contentWidth - 9
        )
      );
      const vitalsRows = Math.ceil(cs.vitalsAndLabs.length / 2);
      const vitalsH = vitalsRows > 0 ? vitalsRows * 5.2 + 3 : 0;
      const subQH = subQLines.reduce((s, arr) => s + arr.length * 3.5 + 1.2, 0);
      const cardH = 8 + presLines.length * 3.8 + vitalsH + subQH + 3;

      ensureSpace(Math.min(maxContentY - headerBottomY - 6, cardH + 3));

      doc.setFillColor(...COLORS.white);
      doc.setDrawColor(...COLORS.slate300);
      doc.setLineWidth(0.28);
      doc.roundedRect(marginX, cursorY, contentWidth, cardH, 1.8, 1.8, 'FD');

      // Case Header Strip
      doc.setFillColor(...COLORS.tealLight);
      doc.roundedRect(marginX + 0.3, cursorY + 0.3, contentWidth - 0.6, 6.2, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(...COLORS.teal);
      doc.text(
        sanitizePdfVectorText(`Case ${cs.number}: ${cs.title}`).slice(0, 78),
        marginX + 3,
        cursorY + 4.5
      );
      doc.setFont('courier', 'bold');
      doc.setFontSize(6.6);
      doc.text(
        sanitizePdfVectorText(cs.difficulty),
        pageWidth - marginX - 3,
        cursorY + 4.5,
        { align: 'right' }
      );

      let cy = cursorY + 9.8;
      doc.setFont('times', 'normal');
      doc.setFontSize(8.6);
      doc.setTextColor(...COLORS.slate900);
      doc.text(presLines, marginX + 3.5, cy);
      cy += presLines.length * 3.8 + 1.5;

      // Vitals & Labs 2-column grid
      if (cs.vitalsAndLabs.length > 0) {
        const vColW = (contentWidth - 9) / 2;
        for (let v = 0; v < cs.vitalsAndLabs.length; v += 2) {
          const leftV = cs.vitalsAndLabs[v];
          const rightV = cs.vitalsAndLabs[v + 1];
          doc.setFillColor(...COLORS.slate50);
          doc.setDrawColor(...COLORS.slate200);
          doc.roundedRect(marginX + 3.5, cy - 2.8, contentWidth - 7, 4.6, 1, 1, 'FD');

          const drawVital = (entry: typeof leftV, vx: number) => {
            const isAbn = entry.flag && entry.flag !== 'normal';
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.8);
            doc.setTextColor(...COLORS.slate700);
            doc.text(
              sanitizePdfVectorText(`${entry.parameter}:`).slice(0, 24),
              vx,
              cy + 0.4
            );
            doc.setFont('courier', 'bold');
            doc.setTextColor(...(isAbn ? COLORS.red : COLORS.emerald));
            doc.text(
              sanitizePdfVectorText(
                `${entry.value}${entry.referenceRange ? ` (${entry.referenceRange})` : ''}`
              ).slice(0, 32),
              vx + 28,
              cy + 0.4
            );
          };

          drawVital(leftV, marginX + 5);
          if (rightV) {
            drawVital(rightV, marginX + 5 + vColW);
          }
          cy += 5.2;
        }
        cy += 1;
      }

      // Progressive Sub-Questions
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(...COLORS.cobalt);
      subQLines.forEach((lines) => {
        doc.text(lines, marginX + 4, cy);
        cy += lines.length * 3.5 + 1.2;
      });

      cursorY += cardH + 3;
    });
  };

  const renderSeparateAnswerKeySection = (unit: StudyPdfUnit, tocId: string) => {
    const qb = unit.infographicPack.questionBank;
    // Always start Section 10 on a fresh page so self-testing questions are never spoiled!
    addContentPage(defaultOrientation);

    drawBlueSectionBanner(
      'Section 10  |  Separate Answer Keys & Model Explanations',
      `Complete Solutions for 30 MCQs, 10 Written Questions & 8 Clinical Cases`,
      unit.topic,
      tocId,
      COLORS.emerald
    );

    // 10A. Rapid-Check 30-MCQ Answer Grid
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.setTextColor(...COLORS.cobalt);
    doc.text('10A. Rapid Self-Grading Key — 30 Multiple-Choice Questions', marginX, cursorY);
    cursorY += 3;

    const colsPerRow = 6;
    const cellW = contentWidth / colsPerRow;
    const gridRows = Math.ceil(qb.mcqs.length / colsPerRow);
    ensureSpace(gridRows * 6 + 6);

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < colsPerRow; c++) {
        const idx = r * colsPerRow + c;
        const item = qb.mcqs[idx];
        if (!item) continue;
        const gx = marginX + c * cellW;
        const gy = cursorY + r * 5.8;
        doc.setFillColor(...COLORS.emeraldLight);
        doc.setDrawColor(...COLORS.emeraldBorder);
        doc.setLineWidth(0.2);
        doc.rect(gx, gy, cellW, 5.8, 'FD');

        doc.setFont('courier', 'bold');
        doc.setFontSize(7.4);
        doc.setTextColor(...COLORS.slate900);
        doc.text(
          `Q${item.number}: ${String.fromCharCode(65 + item.correctIndex)}`,
          gx + cellW / 2,
          gy + 3.9,
          { align: 'center' }
        );
      }
    }
    cursorY += gridRows * 5.8 + 5;

    // Detailed MCQ Rationales (2-column compact textbook explanations)
    const gutter = 5;
    const colW = (contentWidth - gutter) / 2;
    for (let i = 0; i < qb.mcqs.length; i += 2) {
      const leftM = qb.mcqs[i];
      const rightM = qb.mcqs[i + 1];

      const formatMcqExp = (m: QuestionBankMcq) => {
        const letter = String.fromCharCode(65 + m.correctIndex);
        const ansText = m.options[m.correctIndex] || '';
        const cite =
          m.sourceBasis === 'textbook' && m.pageNumbers.length > 0
            ? `[Textbook p. ${m.pageNumbers.join(', ')}]`
            : '[Supplementary]';
        return `Q${m.number} -> ${letter} (${ansText}): ${m.explanation} ${cite}`;
      };

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.1);
      const lLines = doc.splitTextToSize(
        sanitizePdfVectorText(formatMcqExp(leftM)),
        colW - 4
      );
      const rLines = rightM
        ? doc.splitTextToSize(sanitizePdfVectorText(formatMcqExp(rightM)), colW - 4)
        : [];
      const boxH = Math.max(lLines.length, rLines.length) * 3.2 + 3.2;

      ensureSpace(boxH + 1.5);
      doc.setFillColor(...COLORS.slate50);
      doc.setDrawColor(...COLORS.slate200);
      doc.roundedRect(marginX, cursorY, colW, boxH, 1.2, 1.2, 'FD');
      doc.setTextColor(...COLORS.slate900);
      doc.text(lLines, marginX + 2, cursorY + 3.4);

      if (rightM) {
        const rx = marginX + colW + gutter;
        doc.setFillColor(...COLORS.slate50);
        doc.setDrawColor(...COLORS.slate200);
        doc.roundedRect(rx, cursorY, colW, boxH, 1.2, 1.2, 'FD');
        doc.text(rLines, rx + 2, cursorY + 3.4);
      }

      cursorY += boxH + 1.6;
    }

    cursorY += 4;

    // 10B. Written Question Marking Rubrics & Model Answers
    drawSubheadingRule(
      '10B. Written Examination Marking Rubrics & Model Answers (W1 - W10)',
      'Structured Marking Points',
      COLORS.indigo
    );

    qb.writtenQuestions.forEach((wq) => {
      const rubricText = wq.markingPoints
        .map((mp) => `[+${mp.marks}m] ${mp.point}`)
        .join('  |  ');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      const rubLines = doc.splitTextToSize(
        sanitizePdfVectorText(`Marking Scheme (${wq.totalMarks}m): ${rubricText}`),
        contentWidth - 6
      );
      const ansLines = doc.splitTextToSize(
        sanitizePdfVectorText(`Model Answer: ${wq.modelAnswer}`),
        contentWidth - 6
      );
      const boxH = (rubLines.length + ansLines.length) * 3.4 + 8.5;

      ensureSpace(boxH + 2);
      doc.setFillColor(...COLORS.indigoLight);
      doc.setDrawColor(...COLORS.slate200);
      doc.roundedRect(marginX, cursorY, contentWidth, boxH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.0);
      doc.setTextColor(...COLORS.indigo);
      doc.text(
        sanitizePdfVectorText(`W${wq.number} (${wq.commandVerb}) — ${wq.discipline}`),
        marginX + 3,
        cursorY + 4.2
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(...COLORS.cobalt);
      doc.text(rubLines, marginX + 3, cursorY + 7.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(...COLORS.slate900);
      doc.text(ansLines, marginX + 3, cursorY + 7.8 + rubLines.length * 3.4 + 0.8);

      cursorY += boxH + 2.2;
    });

    cursorY += 3;

    // 10C. Clinical Cases Progressive Answer Keys & Rationales
    drawSubheadingRule(
      '10C. Clinical Case Scenarios — Progressive Solutions & Rationales (Cases 1 - 8)',
      'Bedside Reasoning Keys',
      COLORS.teal
    );

    qb.clinicalCases.forEach((cs) => {
      const partBlocks = cs.progressiveQuestions.map((pq) =>
        doc.splitTextToSize(
          sanitizePdfVectorText(
            `${pq.partLabel} (${pq.focusArea}): ${pq.modelAnswer} — Rationale: ${pq.rationale}`
          ),
          contentWidth - 6
        )
      );
      const pearlLines = doc.splitTextToSize(
        sanitizePdfVectorText(`Clinical Pearl: ${cs.clinicalPearl}`),
        contentWidth - 6
      );
      const partsH = partBlocks.reduce((s, arr) => s + arr.length * 3.4 + 1, 0);
      const boxH = 6.5 + partsH + pearlLines.length * 3.4 + 3;

      ensureSpace(Math.min(maxContentY - headerBottomY - 6, boxH + 2.5));
      doc.setFillColor(...COLORS.tealLight);
      doc.setDrawColor(...COLORS.emeraldBorder);
      doc.roundedRect(marginX, cursorY, contentWidth, boxH, 1.6, 1.6, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.0);
      doc.setTextColor(...COLORS.teal);
      doc.text(
        sanitizePdfVectorText(`Case ${cs.number} Key — ${cs.title}`),
        marginX + 3,
        cursorY + 4.4
      );

      let ky = cursorY + 8.0;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      doc.setTextColor(...COLORS.slate900);
      partBlocks.forEach((lines) => {
        doc.text(lines, marginX + 3, ky);
        ky += lines.length * 3.4 + 1;
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(...COLORS.emerald);
      doc.text(pearlLines, marginX + 3, ky + 0.4);

      cursorY += boxH + 2.4;
    });
  };

  // =========================================================================
  // RENDER EACH STUDY UNIT ACROSS REQUIRED SECTIONS (1 -> 10)
  // =========================================================================
  model.units.forEach((unit: StudyPdfUnit, uIdx: number) => {
    if (uIdx > 0) {
      addContentPage(defaultOrientation);
    } else if (curOrientation !== defaultOrientation) {
      addContentPage(defaultOrientation);
    }

    if (exportMode === 'full_study_guide') {
      // --- SECTION 1 (Continued): Unit Executive Overview & Source Gap Disclosure ---
      tocPageMap.set(`unit-${unit.unitNumber}-overview`, doc.getNumberOfPages());

      ensureSpace(30);
      doc.setFillColor(...COLORS.skyLight);
      doc.setDrawColor(...COLORS.skyBorder);
      doc.setLineWidth(0.35);
      doc.roundedRect(marginX, cursorY - 3, contentWidth, 20, 2.2, 2.2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(...COLORS.sky);
      doc.text(
        sanitizePdfVectorText(
          `${model.units.length > 1 ? `UNIT ${unit.unitNumber}  |  ` : ''}${unit.coverageLabel.toUpperCase()}`
        ),
        marginX + 4,
        cursorY + 1.8
      );

      doc.setFont('times', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...COLORS.cobalt);
      const uTitleLines = doc.splitTextToSize(
        sanitizePdfVectorText(unit.topic),
        contentWidth - 8
      );
      doc.text(uTitleLines.slice(0, 1), marginX + 4, cursorY + 8.2);

      doc.setFont('courier', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(...COLORS.slate700);
      doc.text(
        sanitizePdfVectorText(`Primary Sources: ${unit.citationSummary}`).slice(
          0,
          curOrientation === 'landscape' ? 128 : 88
        ),
        marginX + 4,
        cursorY + 13.8
      );
      cursorY += 21.5;

      // Source Coverage / Gap Disclosure Box
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      const gapLines = doc.splitTextToSize(
        sanitizePdfVectorText(unit.infographicPack.sourceGapNotice),
        contentWidth - 7
      );
      const gapH = gapLines.length * 3.5 + 3.8;
      ensureSpace(gapH + 3);
      doc.setFillColor(...COLORS.amberLight);
      doc.setDrawColor(...COLORS.amberBorder);
      doc.roundedRect(marginX, cursorY - 2, contentWidth, gapH, 1.5, 1.5, 'FD');
      doc.setTextColor(...COLORS.amber);
      doc.text(gapLines, marginX + 3.5, cursorY + 1.4);
      cursorY += gapH + 3;

      // Executive Summary Prose
      doc.setFont('times', 'normal');
      doc.setFontSize(9.8);
      doc.setTextColor(...COLORS.slate900);
      const sumLines = doc.splitTextToSize(
        sanitizePdfVectorText(unit.summary),
        contentWidth
      );
      ensureSpace(sumLines.length * 4.2 + 3);
      doc.text(sumLines, marginX, cursorY);
      cursorY += sumLines.length * 4.2 + 4;

      // --- SECTION 2: STEP-BY-STEP TEXTBOOK EXPLANATION ---
      drawBlueSectionBanner(
        'Section 2  |  Step-by-Step Explanation',
        `Progressive Clinical & Mechanistic Teaching (${unit.sections.length} Steps)`,
        isCompact ? 'Compact 2-Column Mode' : 'Detailed Textbook Mode',
        `unit-${unit.unitNumber}-steps`
      );

      if (isCompact) {
        const gutter = 5;
        const colW = (contentWidth - gutter) / 2;
        for (let i = 0; i < unit.sections.length; i += 2) {
          const leftS = unit.sections[i];
          const rightS = unit.sections[i + 1];

          const buildCompactStepText = (s: typeof leftS) =>
            s.quickSummaryPoints && s.quickSummaryPoints.length > 0
              ? s.quickSummaryPoints
                  .map((p) => `- ${sanitizePdfVectorText(p)}`)
                  .join('\n')
              : sanitizePdfVectorText(s.keyTakeaway || s.content.slice(0, 260));

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.6);
          const lBody = doc.splitTextToSize(buildCompactStepText(leftS), colW - 6);
          const rBody = rightS
            ? doc.splitTextToSize(buildCompactStepText(rightS), colW - 6)
            : [];
          const cardH = Math.max(lBody.length, rBody.length) * 3.5 + 10.5;

          ensureSpace(cardH + 2);

          const drawCompactStep = (s: typeof leftS, bx: number, lines: string[]) => {
            doc.setFillColor(...COLORS.white);
            doc.setDrawColor(...COLORS.slate200);
            doc.roundedRect(bx, cursorY, colW, cardH, 1.6, 1.6, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.0);
            doc.setTextColor(...COLORS.cobalt);
            doc.text(
              sanitizePdfVectorText(s.heading).slice(0, 48),
              bx + 3,
              cursorY + 4.4
            );

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...COLORS.slate900);
            doc.text(lines, bx + 3, cursorY + 8.2);

            const cite =
              s.sourceBasis === 'textbook' &&
              (s.pageNumbers.length > 0 ||
                (s.bookCitations && s.bookCitations.length > 0))
                ? formatBookCitationsSummary(s.bookCitations, s.pageNumbers)
                : 'Supplementary Medical Knowledge';
            doc.setFont('courier', 'normal');
            doc.setFontSize(6.4);
            doc.setTextColor(...COLORS.sky);
            doc.text(
              sanitizePdfVectorText(cite).slice(0, 48),
              bx + 3,
              cursorY + cardH - 1.5
            );
          };

          drawCompactStep(leftS, marginX, lBody);
          if (rightS) {
            drawCompactStep(rightS, marginX + colW + gutter, rBody);
          }
          cursorY += cardH + 2.4;
        }
        cursorY += 2;
      } else {
        unit.sections.forEach((sec) => {
          const cite =
            sec.sourceBasis === 'textbook' &&
            (sec.pageNumbers.length > 0 ||
              (sec.bookCitations && sec.bookCitations.length > 0))
              ? formatBookCitationsSummary(sec.bookCitations, sec.pageNumbers)
              : 'Supplementary Medical Knowledge';

          drawSubheadingRule(sec.heading, cite, COLORS.cobalt);

          doc.setFont('times', 'normal');
          doc.setFontSize(9.6);
          doc.setTextColor(...COLORS.slate900);
          const paragraphs = sanitizePdfVectorText(sec.content)
            .split(/\n+/)
            .map((p) => p.trim())
            .filter(Boolean);

          for (const para of paragraphs) {
            const pLines = doc.splitTextToSize(para, contentWidth);
            ensureSpace(pLines.length * 4.0 + 2);
            doc.text(pLines, marginX, cursorY);
            cursorY += pLines.length * 4.0 + 1.8;
          }

          if (sec.termDefinitions && sec.termDefinitions.length > 0) {
            renderTwoColumnBullets(
              'Highlighted Medical Terminology',
              sec.termDefinitions.map((td) => `${td.term}: ${td.simpleExplanation}`)
            );
          }

          if (sec.sourceBasis === 'textbook' && sec.supportingQuote) {
            doc.setFont('times', 'italic');
            doc.setFontSize(8.4);
            const qLines = doc.splitTextToSize(
              sanitizePdfVectorText(
                `Verified Textbook Excerpt (${cite}): "${sec.supportingQuote}"`
              ),
              contentWidth - 8
            );
            const qH = qLines.length * 3.7 + 3.8;
            ensureSpace(qH + 2);
            doc.setFillColor(...COLORS.slate50);
            doc.setDrawColor(...COLORS.slate200);
            doc.roundedRect(marginX, cursorY - 2.2, contentWidth, qH, 1.5, 1.5, 'FD');
            doc.setTextColor(...COLORS.slate700);
            doc.text(qLines, marginX + 4, cursorY + 1.2);
            cursorY += qH + 2.2;
          }

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.2);
          const tkLines = doc.splitTextToSize(
            sanitizePdfVectorText(`Key Takeaway: ${sec.keyTakeaway}`),
            contentWidth - 8
          );
          const tkH = tkLines.length * 3.7 + 3.8;
          ensureSpace(tkH + 2.5);
          doc.setFillColor(...COLORS.skyLight);
          doc.setDrawColor(...COLORS.skyBorder);
          doc.roundedRect(marginX, cursorY - 2.2, contentWidth, tkH, 1.5, 1.5, 'FD');
          doc.setTextColor(...COLORS.cobalt);
          doc.text(tkLines, marginX + 4, cursorY + 1.2);
          cursorY += tkH + 3.5;
        });
      }

      // --- SECTION 3: DETAILED ILLUSTRATED MEDICAL CONTENT (INTEGRATED SCIENCES) ---
      drawBlueSectionBanner(
        'Section 3  |  Detailed Illustrated Medical Content',
        `Topic-Adaptive Integrated Medical Sciences (${unit.infographicPack.integratedDisciplines.length} Disciplines)`,
        'Illustrated Two-Column Spreads',
        `unit-${unit.unitNumber}-sciences`
      );

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.6);
      doc.setTextColor(...COLORS.slate500);
      const relLines = doc.splitTextToSize(
        sanitizePdfVectorText(unit.infographicPack.relevantDisciplinesNote),
        contentWidth
      );
      ensureSpace(relLines.length * 3.5 + 3);
      doc.text(relLines, marginX, cursorY);
      cursorY += relLines.length * 3.5 + 3;

      if (model.config.includeVisualDiagrams && unit.anatomicalDiagram) {
        renderLabeledAnatomicalOverviewPlate(unit.anatomicalDiagram, unit.canonicalTopic);
      }

      unit.infographicPack.integratedDisciplines.forEach((discBlock) => {
        renderIntegratedDisciplineBlock(
          discBlock,
          unit.systemTemplate,
          unit.canonicalTopic
        );
      });

      // --- SECTION 4: MECHANISM FLOWCHARTS & VISUAL MIND MAPS (A4 LANDSCAPE WHEN WIDE) ---
      if (
        model.config.includeVisualDiagrams &&
        (unit.mindMap || unit.flowcharts.length > 0)
      ) {
        const diagramOrientation: PdfPageOrientation = autoLandscapeWide
          ? 'landscape'
          : defaultOrientation;
        if (curOrientation !== diagramOrientation) {
          addContentPage(diagramOrientation);
        } else {
          ensureSpace(95);
        }

        drawBlueSectionBanner(
          'Section 4  |  Mechanism Flowcharts & Visual Mind Maps',
          'Directed Causal Pathways, Clinical Decision Trees & Radial Concept Map',
          diagramOrientation === 'landscape'
            ? 'Wide A4 Landscape Plate'
            : 'Vector Medical Diagrams',
          `unit-${unit.unitNumber}-visuals`
        );

        if (unit.mindMap) {
          renderVectorMindMap(unit.mindMap);
        }
        for (const flow of unit.flowcharts.slice(0, isCompact ? 1 : 2)) {
          renderVectorFlowchart(flow);
        }
      }

      // --- SECTION 5: CLINICAL CORRELATIONS & COMPARISON TABLES (A4 LANDSCAPE WHEN WIDE) ---
      if (model.config.includeComparisonAndCases && unit.comparisonTable) {
        const wideTable = unit.comparisonTable.columns.length >= 2;
        const tableOrientation: PdfPageOrientation =
          autoLandscapeWide && wideTable ? 'landscape' : defaultOrientation;
        if (curOrientation !== tableOrientation) {
          addContentPage(tableOrientation);
        } else {
          ensureSpace(45);
        }

        drawBlueSectionBanner(
          'Section 5  |  Clinical Correlations & Comparison Tables',
          unit.comparisonTable.title,
          tableOrientation === 'landscape'
            ? 'Wide A4 Landscape Table'
            : 'Differential Matrix',
          `unit-${unit.unitNumber}-tables`
        );
        renderComparisonTable(unit.comparisonTable);
      }

      // Return smoothly to Default Orientation (A4 Portrait) for Section 6 onward
      if (curOrientation !== defaultOrientation) {
        addContentPage(defaultOrientation);
      }

      // --- SECTION 6: HIGH-YIELD SUMMARY & CLINICAL PEARLS ---
      drawBlueSectionBanner(
        'Section 6  |  High-Yield Summary & Clinical Pearls',
        'Rapid Board Revision Checklist, Red Flags & Diagnostic Pitfalls',
        `${unit.quickRevisionBullets.length} Bullets + ${unit.clinicalNotes.length} Pearls`,
        `unit-${unit.unitNumber}-pearls`
      );
      renderTwoColumnBullets(
        'High-Yield Exam Revision Checklist',
        unit.quickRevisionBullets
      );
      renderClinicalNotesGrid(unit.clinicalNotes);
    }

    // --- SECTIONS 7, 8, 9 & 10: COMPREHENSIVE 48-QUESTION BANK & SEPARATE ANSWER KEYS ---
    if (includeQuestionBank) {
      if (curOrientation !== defaultOrientation) {
        addContentPage(defaultOrientation);
      } else if (exportMode === 'full_study_guide') {
        // Start the Self-Testing Question Bank cleanly on a new page
        addContentPage(defaultOrientation);
      }

      const qb = unit.infographicPack.questionBank;
      renderSelfTestMcqsSection(qb.mcqs, `unit-${unit.unitNumber}-qb-mcqs`);
      renderSelfTestWrittenSection(
        qb.writtenQuestions,
        `unit-${unit.unitNumber}-qb-written`
      );
      renderSelfTestCasesSection(
        qb.clinicalCases,
        `unit-${unit.unitNumber}-qb-cases`
      );

      if (
        exportMode !== 'question_bank_self_test' &&
        model.config.includeMcqsWithAnswers
      ) {
        renderSeparateAnswerKeySection(unit, `unit-${unit.unitNumber}-qb-answers`);
      }
    }
  });

  // =========================================================================
  // SECTION 11: VERIFIED REFERENCES & THREE-TIER SOURCE PROVENANCE INDEX
  // =========================================================================
  if (model.config.includeReferences) {
    if (curOrientation !== defaultOrientation) {
      addContentPage(defaultOrientation);
    } else {
      ensureSpace(50);
    }

    drawBlueSectionBanner(
      'Section 11  |  Verified References & Source Provenance',
      'Three-Tier Separation: Textbook vs. Supplementary Science vs. External Evidence',
      'Academic Provenance Index',
      'references-appendix'
    );

    // Tier A: Verified Uploaded Textbook Citations
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.cobalt);
    doc.text('A. Verified Primary Textbook Citations', marginX, cursorY);
    cursorY += 4.2;

    if (model.verifiedBookReferences.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.2);
      doc.setTextColor(...COLORS.amber);
      doc.text(
        'Zero textbook pages matched this topic in the selected library; zero textbook page citations are claimed.',
        marginX + 2,
        cursorY
      );
      cursorY += 5.5;
    } else {
      model.verifiedBookReferences.forEach((ref, idx) => {
        ensureSpace(8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.4);
        doc.setTextColor(...COLORS.slate900);
        doc.text(
          sanitizePdfVectorText(
            `[${idx + 1}] ${ref.textbookTitle}${ref.subject ? ` (${ref.subject})` : ''} — Verified ${ref.pageLabel}`
          ),
          marginX + 2,
          cursorY
        );
        cursorY += 4.8;
      });
      cursorY += 2.5;
    }

    // Tier B: Supplementary Medical Knowledge & Source Coverage Gap Disclosure
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.amber);
    doc.text(
      'B. Supplementary Medical Knowledge & Source Coverage Scope',
      marginX,
      cursorY
    );
    cursorY += 4.2;

    model.supplementaryDisclosures.forEach((sd) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.9);
      doc.setTextColor(...COLORS.slate700);
      const sdLines = doc.splitTextToSize(
        sanitizePdfVectorText(`- ${sd.topic}: ${sd.disclosure}`),
        contentWidth - 4
      );
      ensureSpace(sdLines.length * 3.6 + 2);
      doc.text(sdLines, marginX + 2, cursorY);
      cursorY += sdLines.length * 3.6 + 2;
    });
    cursorY += 2;

    // Tier C: External Medical Evidence & Clinical Guidelines
    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.teal);
    doc.text(
      'C. External Medical Evidence & Clinical Guidelines (Separate from Uploaded Textbooks)',
      marginX,
      cursorY
    );
    cursorY += 4.2;

    if (model.externalEvidenceReferences.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.0);
      doc.setTextColor(...COLORS.slate500);
      const extNote = doc.splitTextToSize(
        'No external PubMed, NIH MedlinePlus, or ClinicalTrials.gov records were attached prior to export. Open the "Latest Evidence" tab in MedAtlas Tutor before generating to append live peer-reviewed guideline citations.',
        contentWidth - 4
      );
      doc.text(extNote, marginX + 2, cursorY);
      cursorY += extNote.length * 3.6 + 3;
    } else {
      model.externalEvidenceReferences.forEach((ev, idx) => {
        const line1 = `[E${idx + 1}] ${ev.title}`;
        const line2 = `${ev.evidenceType}  |  ${ev.sourceOrgOrJournal} (${ev.publishedDate})  |  ${ev.database}${
          ev.pmid ? ` PMID: ${ev.pmid}` : ev.nctId ? ` NCT: ${ev.nctId}` : ''
        }`;
        const line3 = `URL: ${ev.url}`;

        const l1 = doc.splitTextToSize(
          sanitizePdfVectorText(line1),
          contentWidth - 4
        );
        ensureSpace(l1.length * 3.8 + 9);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.1);
        doc.setTextColor(...COLORS.slate900);
        doc.text(l1, marginX + 2, cursorY);
        cursorY += l1.length * 3.8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.4);
        doc.setTextColor(...COLORS.teal);
        doc.text(sanitizePdfVectorText(line2), marginX + 4, cursorY);
        cursorY += 3.5;

        doc.setFont('courier', 'normal');
        doc.setFontSize(6.9);
        doc.setTextColor(...COLORS.sky);
        doc.text(sanitizePdfVectorText(line3).slice(0, 110), marginX + 4, cursorY);
        cursorY += 4.6;
      });
    }
  }

  // =========================================================================
  // POPULATE RESERVED TABLE OF CONTENTS PAGE(S) WITH EXACT PAGE NUMBERS & LINKS
  // =========================================================================
  if (tocPagesReserved.length > 0) {
    const itemsPerPage = defaultOrientation === 'landscape' ? 16 : 25;
    tocPagesReserved.forEach((tocPageNum, pageIdx) => {
      doc.setPage(tocPageNum);
      const pw = doc.internal.pageSize.getWidth();
      let ty = headerBottomY + 7;

      doc.setFont('times', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...COLORS.cobalt);
      doc.text(
        pageIdx === 0 ? 'Table of Contents' : 'Table of Contents (Continued)',
        marginX,
        ty
      );
      ty += 3;
      doc.setDrawColor(...COLORS.sky);
      doc.setLineWidth(0.5);
      doc.line(marginX, ty, pw - marginX, ty);
      ty += 7;

      const slice = model.tocItems.slice(
        pageIdx * itemsPerPage,
        (pageIdx + 1) * itemsPerPage
      );

      for (const item of slice) {
        const targetPage = tocPageMap.get(item.id) || tocPageNum + 1;
        const isL1 = item.level === 1;
        const indentX = isL1 ? marginX : marginX + 5;

        doc.setFont('helvetica', isL1 ? 'bold' : 'normal');
        doc.setFontSize(isL1 ? 9.0 : 8.1);
        doc.setTextColor(...(isL1 ? COLORS.cobalt : COLORS.slate700));

        const cleanLabel = sanitizePdfVectorText(item.label).slice(
          0,
          pw > 250 ? 114 : 78
        );
        doc.text(cleanLabel, indentX, ty);

        doc.setFont('courier', 'bold');
        doc.setFontSize(8.4);
        doc.setTextColor(...COLORS.cobalt);
        doc.text(`p. ${targetPage}`, pw - marginX, ty, { align: 'right' });

        // Clickable internal jump link across the TOC row
        doc.link(indentX, ty - 3.5, pw - marginX - indentX, 5.2, {
          pageNumber: targetPage,
        });

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.15);
        doc.line(indentX, ty + 1.8, pw - marginX, ty + 1.8);

        ty += isL1 ? 7.0 : 5.8;
      }
    });
  }

  // =========================================================================
  // STAMP PER-PAGE GEOMETRY-AWARE RUNNING HEADERS & PAGE NUMBERS
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const pFooterTopY = ph - 12.5;

    if (coverIncluded && p === 1) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(...COLORS.slate500);
      doc.text(`Page 1 of ${totalPages}`, pw - marginX, ph - 5.5, {
        align: 'right',
      });
      continue;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...COLORS.cobalt);
    doc.text('MedAtlas Textbook Infographic', marginX, 10.8);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.slate500);
    doc.text(
      sanitizePdfVectorText(model.title).slice(0, pw > 250 ? 96 : 58),
      pw - marginX,
      10.8,
      { align: 'right' }
    );

    doc.setDrawColor(...COLORS.slate200);
    doc.setLineWidth(0.25);
    doc.line(marginX, 13.2, pw - marginX, 13.2);

    doc.setDrawColor(...COLORS.slate200);
    doc.line(marginX, pFooterTopY, pw - marginX, pFooterTopY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.0);
    doc.setTextColor(...COLORS.slate500);
    doc.text(
      sanitizePdfVectorText(
        `${model.styleLabel}  |  Verified Textbook & Evidence Provenance`
      ),
      marginX,
      ph - 6.8
    );

    doc.setFont('courier', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLORS.cobalt);
    doc.text(`Page ${p} of ${totalPages}`, pw - marginX, ph - 6.8, {
      align: 'right',
    });
  }

  return {
    doc,
    filename: sanitizePdfFilename(model.title),
    pageCount: totalPages,
  };
}

export function generateStudyPdfBlob(
  model: StudyPdfDocumentModel
): GeneratedPdfResult {
  const { doc, filename, pageCount } = generateStudyPdfDocument(model);
  const arrayBuffer = doc.output('arraybuffer');
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  return {
    blob,
    filename,
    pageCount,
  };
}

/**
 * Triggers a direct client-side file download (.pdf) compatible with Android Chrome,
 * desktop browsers, and iframe environments (never calls window.open or window.alert).
 */
export function triggerPdfBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
