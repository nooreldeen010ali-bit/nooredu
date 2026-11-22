import type {
  AnatomicalSystemTemplate,
  FlowchartData,
  FlowchartEdge,
  FlowchartNode,
  MindMapBranchCategory,
  MindMapData,
  MindMapNode,
} from '../types/medical';

export interface PositionedMindMapNode {
  node: MindMapNode;
  x: number;
  y: number;
  width: number;
  height: number;
  side: 'left' | 'right' | 'center';
  depth: 1 | 2;
  colorHex: string;
  tintHex: string;
  borderHex: string;
}

export interface PositionedMindMapEdge {
  id: string;
  fromId: string;
  toId: string;
  pathD: string;
  label: string;
  labelX: number;
  labelY: number;
  colorHex: string;
}

export interface MindMapLayoutResult {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  centerWidth: number;
  centerHeight: number;
  nodes: PositionedMindMapNode[];
  edges: PositionedMindMapEdge[];
}

export const MIND_MAP_CATEGORY_PALETTE: Record<
  MindMapBranchCategory,
  { colorHex: string; tintHex: string; borderHex: string; title: string }
> = {
  physiology: {
    colorHex: '#0F4C81',
    tintHex: '#EFF6FF',
    borderHex: '#93C5FD',
    title: 'Normal Physiology',
  },
  pathophysiology: {
    colorHex: '#B45309',
    tintHex: '#FFFBEB',
    borderHex: '#FCD34D',
    title: 'Pathophysiology',
  },
  clinical: {
    colorHex: '#0369A1',
    tintHex: '#F0F9FF',
    borderHex: '#7DD3FC',
    title: 'Clinical Features',
  },
  diagnosis: {
    colorHex: '#0F766E',
    tintHex: '#F0FDFA',
    borderHex: '#5EEAD4',
    title: 'Diagnosis & Labs',
  },
  management: {
    colorHex: '#15803D',
    tintHex: '#F0FDF4',
    borderHex: '#86EFAC',
    title: 'Management',
  },
  complications: {
    colorHex: '#B91C1C',
    tintHex: '#FEF2F2',
    borderHex: '#FCA5A5',
    title: 'Complications & Pearls',
  },
};

export function wrapSvgLabelLines(text: string, maxCharsPerLine = 22, maxLines = 3): string[] {
  const cleaned = String(text || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return ['Concept'];
  const words = cleaned.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) {
        break;
      }
    }
  }

  const consumedWords = lines.join(' ').split(' ').filter(Boolean).length;
  const remainingWords = words.slice(consumedWords);
  if (remainingWords.length > 0) {
    const tail = remainingWords.join(' ');
    lines.push(
      tail.length > maxCharsPerLine + 3 ? `${tail.slice(0, maxCharsPerLine)}…` : tail
    );
  } else if (current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

/**
 * Computes a clean, zero-overlap two-sided radial/hierarchical SVG mind map layout
 * suitable for both desktop widescreen and Android touch zoom/pan.
 */
export function computeMindMapLayout(mindMap: MindMapData): MindMapLayoutResult {
  const allNodes = Array.isArray(mindMap.nodes) ? mindMap.nodes.slice(0, 14) : [];
  const nodeIds = new Set(allNodes.map((n) => n.id));

  const primaryNodes = allNodes.filter((n) => !n.parentId || !nodeIds.has(n.parentId));
  const childrenByParent = new Map<string, MindMapNode[]>();
  for (const n of allNodes) {
    if (n.parentId && nodeIds.has(n.parentId)) {
      const arr = childrenByParent.get(n.parentId) || [];
      arr.push(n);
      childrenByParent.set(n.parentId, arr);
    }
  }

  const hasSubChildren = Array.from(childrenByParent.values()).some((arr) => arr.length > 0);
  const canvasWidth = hasSubChildren ? 1320 : 1080;
  const centerX = canvasWidth / 2;

  const rightPrimary: MindMapNode[] = [];
  const leftPrimary: MindMapNode[] = [];
  primaryNodes.forEach((node, idx) => {
    if (idx % 2 === 0) rightPrimary.push(node);
    else leftPrimary.push(node);
  });

  const countSlots = (branchNodes: MindMapNode[]) =>
    branchNodes.reduce((sum, p) => {
      const kids = childrenByParent.get(p.id) || [];
      return sum + Math.max(1, kids.length);
    }, 0);

  const maxSlots = Math.max(3, countSlots(rightPrimary), countSlots(leftPrimary));
  const slotHeight = 108;
  const canvasHeight = Math.max(460, maxSlots * slotHeight + 110);
  const centerY = canvasHeight / 2;
  const centerWidth = 212;
  const centerHeight = 82;

  const positionedNodes: PositionedMindMapNode[] = [];
  const positionedEdges: PositionedMindMapEdge[] = [];

  const placeSide = (branchNodes: MindMapNode[], side: 'left' | 'right') => {
    const totalSlots = Math.max(1, countSlots(branchNodes));
    const usableHeight = totalSlots * slotHeight;
    let cursorY = centerY - usableHeight / 2 + slotHeight / 2;

    const dir = side === 'right' ? 1 : -1;
    const level1OffsetX = hasSubChildren ? 292 : 330;
    const level2OffsetX = 560;

    for (const pNode of branchNodes) {
      const kids = childrenByParent.get(pNode.id) || [];
      const branchSlotSpan = Math.max(1, kids.length);
      const pY = cursorY + ((branchSlotSpan - 1) * slotHeight) / 2;
      const pX = centerX + dir * level1OffsetX;
      const palette =
        MIND_MAP_CATEGORY_PALETTE[pNode.category] || MIND_MAP_CATEGORY_PALETTE.physiology;

      const pWidth = 184;
      const pHeight = 68;

      positionedNodes.push({
        node: pNode,
        x: pX,
        y: pY,
        width: pWidth,
        height: pHeight,
        side,
        depth: 1,
        colorHex: palette.colorHex,
        tintHex: palette.tintHex,
        borderHex: palette.borderHex,
      });

      const startX = centerX + dir * (centerWidth / 2);
      const startY = centerY + Math.max(-24, Math.min(24, (pY - centerY) * 0.18));
      const endX = pX - dir * (pWidth / 2);
      const endY = pY;
      const ctrl1X = startX + dir * 74;
      const ctrl2X = endX - dir * 68;

      positionedEdges.push({
        id: `edge-center-${pNode.id}`,
        fromId: 'center',
        toId: pNode.id,
        pathD: `M ${startX} ${startY} C ${ctrl1X} ${startY}, ${ctrl2X} ${endY}, ${endX} ${endY}`,
        label: pNode.relationLabel || 'relates to',
        labelX: (startX + endX) / 2,
        labelY: (startY + endY) / 2 - 8,
        colorHex: palette.colorHex,
      });

      kids.forEach((child, kIdx) => {
        const cY = cursorY + kIdx * slotHeight;
        const cX = centerX + dir * level2OffsetX;
        const cWidth = 172;
        const cHeight = 60;
        const cPalette =
          MIND_MAP_CATEGORY_PALETTE[child.category] || palette;

        positionedNodes.push({
          node: child,
          x: cX,
          y: cY,
          width: cWidth,
          height: cHeight,
          side,
          depth: 2,
          colorHex: cPalette.colorHex,
          tintHex: cPalette.tintHex,
          borderHex: cPalette.borderHex,
        });

        const cStartX = pX + dir * (pWidth / 2);
        const cEndX = cX - dir * (cWidth / 2);
        const cCtrl1X = cStartX + dir * 40;
        const cCtrl2X = cEndX - dir * 40;

        positionedEdges.push({
          id: `edge-${pNode.id}-${child.id}`,
          fromId: pNode.id,
          toId: child.id,
          pathD: `M ${cStartX} ${pY} C ${cCtrl1X} ${pY}, ${cCtrl2X} ${cY}, ${cEndX} ${cY}`,
          label: child.relationLabel || 'leads to',
          labelX: (cStartX + cEndX) / 2,
          labelY: (pY + cY) / 2 - 7,
          colorHex: cPalette.colorHex,
        });
      });

      cursorY += branchSlotSpan * slotHeight;
    }
  };

  placeSide(rightPrimary, 'right');
  placeSide(leftPrimary, 'left');

  return {
    width: canvasWidth,
    height: canvasHeight,
    centerX,
    centerY,
    centerWidth,
    centerHeight,
    nodes: positionedNodes,
    edges: positionedEdges,
  };
}

export interface PositionedFlowNode {
  node: FlowchartNode;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
}

export interface PositionedFlowEdge {
  id: string;
  edge: FlowchartEdge;
  pathD: string;
  labelX: number;
  labelY: number;
}

export interface FlowchartLayoutResult {
  width: number;
  height: number;
  nodes: PositionedFlowNode[];
  edges: PositionedFlowEdge[];
}

/**
 * Computes a clean top-to-bottom layered directed graph (DAG) layout for clinical
 * pathophysiology cascades, diagnostic algorithms, and treatment decision trees.
 */
export function computeFlowchartLayout(flow: FlowchartData): FlowchartLayoutResult {
  const nodes = Array.isArray(flow.nodes) ? flow.nodes.slice(0, 12) : [];
  if (nodes.length === 0) {
    return { width: 760, height: 240, nodes: [], edges: [] };
  }

  const nodeMap = new Map<string, FlowchartNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const validEdges = (Array.isArray(flow.edges) ? flow.edges : []).filter(
    (e) => nodeMap.has(e.from) && nodeMap.has(e.to) && e.from !== e.to
  );

  // Assign topological depth layers via BFS from roots (handles cycles safely)
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  });

  for (const e of validEdges) {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    adj.get(e.from)?.push(e.to);
  }

  const layerById = new Map<string, number>();
  const roots = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0);
  const queue: Array<{ id: string; layer: number }> =
    roots.length > 0
      ? roots.map((r) => ({ id: r.id, layer: 0 }))
      : [{ id: nodes[0].id, layer: 0 }];

  const visitCount = new Map<string, number>();
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const visits = (visitCount.get(curr.id) || 0) + 1;
    if (visits > nodes.length) continue;
    visitCount.set(curr.id, visits);

    const prevLayer = layerById.get(curr.id) ?? -1;
    if (curr.layer > prevLayer) {
      layerById.set(curr.id, curr.layer);
      for (const nextId of adj.get(curr.id) || []) {
        queue.push({ id: nextId, layer: curr.layer + 1 });
      }
    }
  }

  // Ensure any disconnected node gets placed sequentially
  let maxLayer = Math.max(0, ...Array.from(layerById.values()));
  for (const n of nodes) {
    if (!layerById.has(n.id)) {
      maxLayer += 1;
      layerById.set(n.id, maxLayer);
    }
  }

  const layers = new Map<number, FlowchartNode[]>();
  for (const n of nodes) {
    const l = layerById.get(n.id) || 0;
    const list = layers.get(l) || [];
    list.push(n);
    layers.set(l, list);
  }

  const sortedLayerIndices = Array.from(layers.keys()).sort((a, b) => a - b);
  const maxCols = Math.max(1, ...Array.from(layers.values()).map((arr) => arr.length));
  const nodeWidth = 224;
  const nodeHeight = 74;
  const colGap = 58;
  const rowGap = 66;

  const canvasWidth = Math.max(760, maxCols * (nodeWidth + colGap) + 96);
  const canvasHeight = Math.max(
    300,
    sortedLayerIndices.length * (nodeHeight + rowGap) + 72
  );

  const posMap = new Map<string, PositionedFlowNode>();
  sortedLayerIndices.forEach((layerIdx, visualRow) => {
    const rowNodes = layers.get(layerIdx) || [];
    const rowTotalWidth = rowNodes.length * nodeWidth + (rowNodes.length - 1) * colGap;
    const startX = (canvasWidth - rowTotalWidth) / 2 + nodeWidth / 2;
    const y = 52 + visualRow * (nodeHeight + rowGap) + nodeHeight / 2;

    rowNodes.forEach((node, colIdx) => {
      const x = startX + colIdx * (nodeWidth + colGap);
      posMap.set(node.id, {
        node,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        layer: visualRow,
      });
    });
  });

  // Fallback sequential edges if model returned nodes without edges
  const effectiveEdges: FlowchartEdge[] =
    validEdges.length > 0
      ? validEdges
      : nodes.slice(0, -1).map((n, idx) => ({
          from: n.id,
          to: nodes[idx + 1].id,
        }));

  const positionedEdges: PositionedFlowEdge[] = effectiveEdges.map((edge, idx) => {
    const fromPos = posMap.get(edge.from)!;
    const toPos = posMap.get(edge.to)!;

    if (fromPos.layer < toPos.layer) {
      const startX = fromPos.x;
      const startY = fromPos.y + fromPos.height / 2;
      const endX = toPos.x;
      const endY = toPos.y - toPos.height / 2 - 6;
      const midY = (startY + endY) / 2;
      return {
        id: `flow-edge-${idx}`,
        edge,
        pathD: `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`,
        labelX: (startX + endX) / 2,
        labelY: midY - 4,
      };
    }

    // Same-row or feedback arc
    const dir = toPos.x >= fromPos.x ? 1 : -1;
    const startX = fromPos.x + dir * (fromPos.width / 2);
    const startY = fromPos.y;
    const endX = toPos.x - dir * (toPos.width / 2 + 6);
    const endY = toPos.y;
    const arcY = Math.min(startY, endY) - 34;
    return {
      id: `flow-edge-${idx}`,
      edge,
      pathD: `M ${startX} ${startY} Q ${(startX + endX) / 2} ${arcY} ${endX} ${endY}`,
      labelX: (startX + endX) / 2,
      labelY: arcY + 8,
    };
  });

  return {
    width: canvasWidth,
    height: canvasHeight,
    nodes: Array.from(posMap.values()),
    edges: positionedEdges,
  };
}

/**
 * Infers the most relevant organ-system SVG diagram template from a medical topic string
 * when creating fallback or upgraded anatomical diagrams.
 */
export function inferAnatomicalTemplate(topic: string): AnatomicalSystemTemplate {
  const lower = String(topic || '').toLowerCase();
  if (
    /\b(heart|cardiac|coronary|stemi|nstemi|hfref|hfpef|adhf|atrial|arrhythmia|pericardi|valve|aortic|shock|hypertension)\b/.test(
      lower
    )
  ) {
    return 'cardiopulmonary';
  }
  if (/\b(asthma|copd|pulmonary|lung|pneumonia|alveol|pleural|hypoxemia|ards|embolism)\b/.test(lower)) {
    return 'respiratory';
  }
  if (
    /\b(kidney|renal|nephron|nephritis|nephrotic|glomerul|aki|tubular|sodium|hyponatremia|potassium|hyperkalemia|acidosis)\b/.test(
      lower
    )
  ) {
    return 'renal';
  }
  if (/\b(liver|hepat\w*|cirrhosis|ascites|varic\w*|portal\s+hypertension|biliary|gallbladder|cholecyst\w*|cholangit\w*|jaundice|bilirubin)\b/.test(lower)) {
    return 'hepatobiliary';
  }
  if (/\b(diabet|dka|ketoacidosis|thyroid|adrenal|cushing|addison|insulin|pituitary|calcium)\b/.test(lower)) {
    return 'endocrine';
  }
  if (/\b(stroke|seizure|epilepticus|meningitis|guillain|neuropath|brain|myasthenia|parkinson)\b/.test(lower)) {
    return 'neurology';
  }
  if (/\b(anemia|iron|cobalamin|b12|platelet|thrombocytopen|hit|ttp|coagul|leukemia|hemolysis)\b/.test(lower)) {
    return 'hematology';
  }
  if (/\b(lupus|sle|rheumatoid|vasculitis|autoimmune|anaphylaxis|sepsis|endocarditis)\b/.test(lower)) {
    return 'immune';
  }
  return 'general_physiology';
}

/**
 * Builds authorized, non-scraping external medical reference URLs for a clinical topic.
 */
export function buildExternalMedicalLinks(topic: string) {
  const clean = String(topic || '').trim() || 'Internal Medicine';
  const encoded = encodeURIComponent(clean);
  return {
    upToDateUrl: `https://www.uptodate.com/contents/search?search=${encoded}`,
    pubMedGuidelinesUrl: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(
      `${clean} AND (Practice Guideline[pt] OR Systematic Review[sb])`
    )}&sort=date`,
    medlinePlusUrl: `https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&v%3Asources=medlineplus-bundle&query=${encoded}`,
    niceGuidelinesUrl: `https://www.nice.org.uk/search?q=${encoded}`,
    whoGuidelinesUrl: `https://www.who.int/publications/i?searchKeyword=${encoded}`,
  };
}
