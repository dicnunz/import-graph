import { expect, test } from 'vitest';
import { overlaps, placeLabel, type LabelRect } from './graph-labels.js';

test('close node labels dodge each other without changing node coordinates', () => {
  const points = [{ x: 0, y: 0 }, { x: 35, y: -4 }, { x: 70, y: 3 }];
  const before = structuredClone(points);
  const occupied: LabelRect[] = points.map(p => ({ x: p.x - 5, y: p.y - 5, width: 10, height: 10 }));
  for (const point of points) {
    const rect = placeLabel(point.x, point.y, 110, 16, 5, occupied);
    expect(occupied.every(other => !overlaps(rect, other))).toBe(true);
    expect(placeLabel(point.x, point.y, 110, 16, 5, occupied)).toEqual(rect);
    occupied.push(rect);
  }
  expect(points).toEqual(before);
});

test('crowded fallback retains the label without overlap', () => {
  const occupied = [{ x: -1000, y: -1000, width: 2000, height: 2000 }];
  expect(overlaps(placeLabel(0, 0, 100, 16, 5, occupied), occupied[0]!)).toBe(false);
});

test('spatial collision index gives identical placement to the exhaustive scan', async () => {
  const { LabelIndex } = await import('./graph-labels.js');
  const rects: LabelRect[] = [];
  const index = new LabelIndex(64);
  for (let i = 0; i < 100; i++) {
    const rect = { x: (i % 10) * 17 - 80, y: Math.floor(i / 10) * 21 - 100, width: 16, height: 16 };
    rects.push(rect); index.add(rect);
  }
  for (let i = 0; i < 30; i++) {
    const indexed = placeLabel(i * 3, i * 7, 110, 16, 5, index);
    expect(indexed).toEqual(placeLabel(i * 3, i * 7, 110, 16, 5, rects));
    rects.push(indexed); index.add(indexed);
  }
});
