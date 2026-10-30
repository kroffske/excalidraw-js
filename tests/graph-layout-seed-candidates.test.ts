import { describe, expect, it } from 'vitest';
import { enumerateSeedLayouts } from '../src/graph-layout/index.js';
import type { GraphLayoutRequest } from '../src/graph-layout/types.js';

function request(): GraphLayoutRequest {
  return {
    nodes: [{ id: 'a', width: 100, height: 80, shape: 'rectangle' }, { id: 'b', width: 200, height: 80, shape: 'rectangle' }, { id: 'c', width: 100, height: 80, shape: 'rectangle' }],
    edges: [{ id: 'ab', from: 'a', to: 'b', label: 'Read [admitted]' }, { id: 'bc', from: 'b', to: 'c', label: 'Save [valid]' }],
    positions: { a: { x: 0, y: 0 }, b: { x: 400, y: 300 }, c: { x: 800, y: 0 } },
    profile: { baseNodeGap: null, wideLabelCorridors: true, alignAdjacentRows: true, preferContentLabels: true, routeNudge: 64 },
    labelTypography: { fontSize: 18, lineHeight: 1.25, paddingX: 12, paddingY: 6 },
    fit: { viewport: { width: 1898, height: 909 }, minZoom: 0.1, maxZoom: 30, paddingFraction: 0.94, maxSideDrop: 0.2 },
  };
}
function freeze(value: unknown) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }

describe('generated seed column candidates', () => {
  it('keeps seed zero and aligns unequal widths by center without moving y or nonmovables', () => {
    const input = request(), before = structuredClone(input); freeze(input);
    const result = enumerateSeedLayouts(input, { movableIds: ['b'] });
    expect(result.candidates.map(item => item.id)).toEqual(['seed', 'column-1', 'column-2']);
    expect(result.candidates[0].request).toEqual(input);
    expect(result.candidates[1].request.positions!.b).toEqual({ x: -50, y: 300 });
    expect(result.candidates[2].request.positions!.b).toEqual({ x: 750, y: 300 });
    for (const candidate of result.candidates) {
      expect(candidate.request.nodes).toEqual(input.nodes);
      expect(candidate.request.edges).toEqual(input.edges);
      expect(candidate.request.positions!.a).toEqual(input.positions!.a);
      expect(candidate.request.positions!.c).toEqual(input.positions!.c);
    }
    result.candidates[0].request.positions!.a.x = 999;
    expect(input).toEqual(before);
  });
  it('uses original occupied centers, stable IDs and a global attempted budget', () => {
    const input = request();
    const first = enumerateSeedLayouts(input, { movableIds: ['c', 'b', 'a'], maxCandidates: 3 });
    const second = enumerateSeedLayouts(input, { movableIds: ['a', 'b', 'c'], maxCandidates: 3 });
    expect(first).toEqual(second);
    expect(first.attempted).toBe(3); expect(first.truncated).toBe(true);
    expect(first.candidates[1].move?.nodeId).toBe('a');
    expect(first.candidates[2].move).toMatchObject({ nodeId: 'b', anchorCenterX: 50 });
    expect(enumerateSeedLayouts(input, { movableIds: ['b'], maxCandidates: 1 })).toMatchObject({ attempted: 1, truncated: true });
  });
  it('rejects hard-row violations early while retaining every original constraint', () => {
    const input = request(); input.positions!.b.y = 0;
    input.constraints = [{ type: 'row', ids: ['a', 'b', 'c'], index: 0 }];
    const result = enumerateSeedLayouts(input, { movableIds: ['b'] });
    expect(result.candidates).toHaveLength(1);
    expect(result.rejections).toHaveLength(2);
    expect(result.attempted).toBe(3);
    expect(result.rejections.every(item => item.diagnostics[0].code === 'PLACEMENT_HINT_UNMET')).toBe(true);
    expect(result.candidates[0].request.constraints).toEqual(input.constraints);
  });
  it('rejects an invalid baseline rather than silently omitting seed zero', () => {
    const input = request(); input.constraints = [{ type: 'row', ids: ['a', 'b'], index: 0 }];
    expect(() => enumerateSeedLayouts(input, { movableIds: ['b'] })).toThrow(/Seed positions/);
  });
  it('rejects manual routes including an empty routes declaration', () => {
    for (const routes of [{}, { ab: { sourceSide: 'right' as const, targetSide: 'left' as const } }]) {
      expect(() => enumerateSeedLayouts({ ...request(), routes }, { movableIds: ['c'] })).toThrow(/manual-route/);
    }
  });
  it('validates complete finite positions without extra or unknown fields', () => {
    for (const mutate of [
      (r: GraphLayoutRequest) => { delete r.positions!.b; },
      (r: GraphLayoutRequest) => { r.positions!.unknown = { x: 0, y: 0 }; },
      (r: GraphLayoutRequest) => { r.positions!.b.x = Infinity; },
      (r: GraphLayoutRequest) => { (r.positions!.b as unknown as Record<string, unknown>).z = 5; },
    ]) { const input = request(); mutate(input); expect(() => enumerateSeedLayouts(input, { movableIds: ['b'] })).toThrow(/complete finite/); }
  });
  it('validates movable ownership and hard candidate budget', () => {
    for (const movableIds of [[], ['unknown'], ['a', 'a']]) expect(() => enumerateSeedLayouts(request(), { movableIds })).toThrow(/movableIds/);
    for (const maxCandidates of [0, 9, 1.5, NaN]) expect(() => enumerateSeedLayouts(request(), { movableIds: ['a'], maxCandidates })).toThrow(/integer maxCandidates/);
  });
  it('does not invent a movement when all centers coincide', () => {
    const input = request(); input.positions = { a: { x: 50, y: 0 }, b: { x: 0, y: 200 }, c: { x: 50, y: 400 } };
    const result = enumerateSeedLayouts(input, { movableIds: ['a', 'b', 'c'] });
    expect(result.candidates).toHaveLength(1); expect(result.attempted).toBe(1); expect(result.truncated).toBe(false);
  });
});
