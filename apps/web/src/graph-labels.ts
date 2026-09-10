export interface LabelRect { x: number; y: number; width: number; height: number }

export function overlaps(a: LabelRect, b: LabelRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Place every label without moving graph nodes or dropping labels. Coordinates are graph units. */
export function placeLabel(x: number, y: number, width: number, height: number, radius: number, occupied: readonly LabelRect[] | LabelIndex): LabelRect {
  const gap = height / 3;
  const right = x + radius + gap;
  const left = x - radius - gap - width;
  for (let step = 0; step < 12; step++) {
    for (const offset of step === 0 ? [0] : [-step * height, step * height]) {
      for (const candidateX of [right, left]) {
        const candidate = { x: candidateX, y: y - height / 2 + offset, width, height };
        if (!(occupied instanceof LabelIndex ? occupied.collides(candidate) : occupied.some(rect => overlaps(candidate, rect)))) return candidate;
      }
    }
  }
  // A crowded graph still keeps every label. The module list provides the full paths.
  const bottom = occupied instanceof LabelIndex ? Math.max(y, occupied.bottom) : occupied.reduce((max, rect) => Math.max(max, rect.y + rect.height), y);
  return { x: right, y: bottom + gap, width, height };
}

/** Spatial bins bound collision queries to nearby rectangles, including dense graphs. */
export class LabelIndex {
  private cells = new Map<string, LabelRect[]>();
  bottom = -Infinity;
  constructor(private cellSize: number) {}
  add(rect: LabelRect): void {
    this.bottom = Math.max(this.bottom, rect.y + rect.height);
    for (const key of this.keys(rect)) {
      const bucket = this.cells.get(key) ?? [];
      bucket.push(rect);
      this.cells.set(key, bucket);
    }
  }
  collides(rect: LabelRect): boolean {
    for (const key of this.keys(rect)) {
      if (this.cells.get(key)?.some(other => overlaps(rect, other))) return true;
    }
    return false;
  }
  private *keys(rect: LabelRect): Generator<string> {
    for (let x = Math.floor(rect.x / this.cellSize); x <= Math.floor((rect.x + rect.width) / this.cellSize); x++) {
      for (let y = Math.floor(rect.y / this.cellSize); y <= Math.floor((rect.y + rect.height) / this.cellSize); y++) yield `${x},${y}`;
    }
  }
}
