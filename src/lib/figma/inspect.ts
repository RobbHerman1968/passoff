export type InspectFill = {
  type: string;
  color?: string;
  opacity?: number;
};

export type InspectTextStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
};

export type InspectNode = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layoutMode?: string | null;
  padding?: { top: number; right: number; bottom: number; left: number } | null;
  itemSpacing?: number | null;
  cornerRadius?: number | null;
  fills: InspectFill[];
  strokes: InspectFill[];
  strokeWeight?: number | null;
  text?: InspectTextStyle | null;
  children: InspectNode[];
};

type RestPaint = {
  type?: string;
  opacity?: number;
  color?: { r?: number; g?: number; b?: number; a?: number };
};

type RestNode = {
  id?: string;
  name?: string;
  type?: string;
  children?: RestNode[];
  absoluteBoundingBox?: { x?: number; y?: number; width?: number; height?: number };
  layoutMode?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  fills?: RestPaint[];
  strokes?: RestPaint[];
  strokeWeight?: number;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    lineHeightPx?: number;
    letterSpacing?: number;
  };
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function rgba(color: { r?: number; g?: number; b?: number; a?: number } | undefined, opacity = 1) {
  if (!color || !finite(color.r) || !finite(color.g) || !finite(color.b)) return undefined;
  const a = finite(color.a) ? color.a * opacity : opacity;
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (a >= 0.999) {
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

function paints(list: RestPaint[] | undefined): InspectFill[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((paint) => paint && typeof paint === "object")
    .slice(0, 8)
    .map((paint) => ({
      type: paint.type || "UNKNOWN",
      color: rgba(paint.color, finite(paint.opacity) ? paint.opacity : 1),
      opacity: finite(paint.opacity) ? paint.opacity : undefined,
    }));
}

function cornerRadius(node: RestNode) {
  if (finite(node.cornerRadius)) return node.cornerRadius;
  if (Array.isArray(node.rectangleCornerRadii) && node.rectangleCornerRadii.every(finite)) {
    const [a, b, c, d] = node.rectangleCornerRadii;
    if (a === b && b === c && c === d) return a;
  }
  return null;
}

function normalizeNode(node: RestNode, originX: number, originY: number, depth: number): InspectNode | null {
  if (!node || typeof node !== "object" || typeof node.id !== "string") return null;
  const box = node.absoluteBoundingBox;
  if (!box || !finite(box.x) || !finite(box.y) || !finite(box.width) || !finite(box.height)) return null;
  if (depth > 40) return null;

  const children: InspectNode[] = [];
  for (const child of node.children ?? []) {
    if (children.length >= 400) break;
    const next = normalizeNode(child, originX, originY, depth + 1);
    if (next) children.push(next);
  }

  return {
    id: node.id,
    name: (node.name || node.type || "Layer").slice(0, 200),
    type: node.type || "UNKNOWN",
    x: Math.round((box.x - originX) * 100) / 100,
    y: Math.round((box.y - originY) * 100) / 100,
    width: Math.round(box.width * 100) / 100,
    height: Math.round(box.height * 100) / 100,
    layoutMode: node.layoutMode || null,
    padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft].some(finite)
      ? {
          top: node.paddingTop || 0,
          right: node.paddingRight || 0,
          bottom: node.paddingBottom || 0,
          left: node.paddingLeft || 0,
        }
      : null,
    itemSpacing: finite(node.itemSpacing) ? node.itemSpacing : null,
    cornerRadius: cornerRadius(node),
    fills: paints(node.fills),
    strokes: paints(node.strokes),
    strokeWeight: finite(node.strokeWeight) ? node.strokeWeight : null,
    text: node.type === "TEXT" && node.style
      ? {
          fontFamily: node.style.fontFamily,
          fontSize: node.style.fontSize,
          fontWeight: node.style.fontWeight,
          lineHeight: node.style.lineHeightPx,
          letterSpacing: node.style.letterSpacing,
        }
      : null,
    children,
  };
}

/** Normalize a Figma REST / JSON_REST_V1 document root into a slim inspect tree rooted at the screen. */
export function normalizeInspectTree(document: unknown): InspectNode | null {
  if (!document || typeof document !== "object") return null;
  const root = document as RestNode;
  const box = root.absoluteBoundingBox;
  if (!box || !finite(box.x) || !finite(box.y)) return null;
  return normalizeNode(root, box.x, box.y, 0);
}

export function findInspectNode(root: InspectNode, id: string): InspectNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findInspectNode(child, id);
    if (found) return found;
  }
  return null;
}

export function flattenInspectNodes(root: InspectNode): InspectNode[] {
  const list: InspectNode[] = [root];
  for (const child of root.children) list.push(...flattenInspectNodes(child));
  return list;
}

/** Deepest node whose bounds contain the point (relative to screen). */
export function hitTestInspectNode(root: InspectNode, x: number, y: number): InspectNode | null {
  let best: InspectNode | null = null;
  function visit(node: InspectNode) {
    if (x < node.x || y < node.y || x > node.x + node.width || y > node.y + node.height) return;
    best = node;
    for (const child of node.children) visit(child);
  }
  visit(root);
  return best;
}

export function inspectNodeToCss(node: InspectNode): string {
  const lines: string[] = [];
  lines.push(`/* ${node.name} · ${node.type} */`);
  lines.push(`width: ${Math.round(node.width)}px;`);
  lines.push(`height: ${Math.round(node.height)}px;`);
  if (node.cornerRadius) lines.push(`border-radius: ${Math.round(node.cornerRadius)}px;`);
  if (node.padding) {
    const { top, right, bottom, left } = node.padding;
    if (top === right && right === bottom && bottom === left) {
      lines.push(`padding: ${Math.round(top)}px;`);
    } else {
      lines.push(`padding: ${Math.round(top)}px ${Math.round(right)}px ${Math.round(bottom)}px ${Math.round(left)}px;`);
    }
  }
  if (node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL") {
    lines.push(`display: flex;`);
    lines.push(`flex-direction: ${node.layoutMode === "HORIZONTAL" ? "row" : "column"};`);
    if (finite(node.itemSpacing)) lines.push(`gap: ${Math.round(node.itemSpacing)}px;`);
  }
  const fill = node.fills.find((paint) => paint.color);
  if (fill?.color) lines.push(`background: ${fill.color};`);
  const stroke = node.strokes.find((paint) => paint.color);
  if (stroke?.color && finite(node.strokeWeight)) {
    lines.push(`border: ${Math.round(node.strokeWeight)}px solid ${stroke.color};`);
  }
  if (node.text) {
    if (node.text.fontFamily) lines.push(`font-family: ${JSON.stringify(node.text.fontFamily)};`);
    if (finite(node.text.fontSize)) lines.push(`font-size: ${node.text.fontSize}px;`);
    if (finite(node.text.fontWeight)) lines.push(`font-weight: ${node.text.fontWeight};`);
    if (finite(node.text.lineHeight)) lines.push(`line-height: ${Math.round(node.text.lineHeight)}px;`);
    if (finite(node.text.letterSpacing)) lines.push(`letter-spacing: ${node.text.letterSpacing}px;`);
  }
  return lines.join("\n");
}
