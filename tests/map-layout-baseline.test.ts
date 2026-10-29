import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareBaselines, createBaseline, DEFAULT_BASELINE, differences, main, parseGitStatus, validateBaseline, valueRecord } from '../scripts/layout-migration/baseline.mjs';

const baseline = JSON.parse(await readFile(DEFAULT_BASELINE, 'utf8'));
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('retained Map migration baseline (no Map checkout or WASM required)', () => {
  it('preserves both porcelain status columns and path whitespace when parsing Git output', () => {
    expect(parseGitStatus(' M .gitignore\nM  staged.js\n?? source with spaces.js\n')).toEqual([
      ' M .gitignore', 'M  staged.js', '?? source with spaces.js',
    ]);
    expect(parseGitStatus(' M path with trailing space \r\n')).toEqual([' M path with trailing space ']);
    expect(parseGitStatus('')).toEqual([]);
  });

  it('retains readable source inputs, semantic identities and geometry across the selected families', () => {
    expect(validateBaseline(baseline)).toBe(baseline);
    expect(compareBaselines(baseline, structuredClone(baseline))).toEqual([]);
    const cases = new Map(baseline.cases.map((item: any) => [item.id, item]));
    for (const family of ['semantic', 'decision', 'component', 'sequence']) {
      const item: any = cases.get(`${family}-automatic`);
      expect(item.input.layout.family).toBe(family);
      expect(item.result.layout.boxes.length).toBe(item.input.nodes.length);
      expect(item.inputUnchanged && item.repeatedRunEqual).toBe(true);
      for (const node of item.input.nodes) {
        expect(item.result.scene.some((element: any) => element.type === 'text'
          && element.semantic?.kind === 'node' && element.semantic.semanticId === node.id)).toBe(true);
      }
    }
    const areas: any = cases.get('nested-dsl-areas');
    expect(areas.result.composedModel.layout.areas.some((area: any) => area.parentId === 'whole')).toBe(true);
    expect(areas.result.areas.length).toBe(3);
    const sequence: any = cases.get('sequence-automatic');
    expect(sequence.result.layout.orderedEdges.map((edge: any) => edge.order)).toEqual([1, 2, 3, 4]);
    expect(sequence.result.scene.filter((element: any) => element.semantic?.role === 'lifeline')).toHaveLength(3);
    expect((cases.get('component-automatic') as any).result.layout.containers.length).toBeGreaterThan(0);
  });

  it('preserves pin precedence, manual ports/waypoints, diagnostics and all side-fit states', () => {
    const get = (id: string) => baseline.cases.find((item: any) => item.id === id);
    for (const mode of ['partial', 'complete']) {
      const item = get(`${mode}-pins-unmet-hint`);
      expect(item.result.layout.boxes.find(([id]: [string]) => id === 'client')[1].x).toBe(5000);
      expect(item.result.layout.diagnostics).toContainEqual(expect.objectContaining({ code: 'PLACEMENT_HINT_UNMET', severity: 'warning', path: '/layout/hints/0' }));
    }
    for (const state of ['measured', 'unverified', 'unavailable']) {
      expect(get(`side-fit-${state}`).result.layout.fitComparison.status).toBe(state);
    }
    expect(get('side-fit-measured').result.layout.fitComparison.passed).toBe(false);
    const explicit = get('explicit-positions-and-routes');
    expect(explicit.result.layout.diagnostics).toContainEqual(expect.objectContaining({ code: 'LABEL_NO_SLOT', path: '/layout/labels/e-engine-market' }));
    const route = explicit.result.layout.edgeRoutes.find(([id]: [string]) => id === 'e-prediction-data')[1];
    expect(route.sourceSide).toBe(explicit.input.layout.routes['e-prediction-data'].sourceSide);
    expect(route.targetSide).toBe(explicit.input.layout.routes['e-prediction-data'].targetSide);
    for (const waypoint of explicit.input.layout.routes['e-prediction-data'].waypoints) {
      expect(route.points).toContainEqual([waypoint.x, waypoint.y]);
    }
    expect(get('missing-engines').result.code).toBe('LAYOUT_ENGINES_REQUIRED');
    expect(get('port-capacity-refusal').result.code).toBe('PORT_CAPACITY_EXCEEDED');
    expect(get('conflicting-extreme-hints').result.diagnostics[0].path).toBe('/layout/hints/1');
    expect(get('automatic-unmet-hint-error').result.diagnostics[0].severity).toBe('error');
    expect(get('authored-waypoint-budget').result.valid).toBe(false);
    expect(get('route-point-limit').result.code).toBe('ROUTE_POINT_LIMIT');
  });

  it.each(['coordinate', 'edge-direction', 'edge-order', 'diagnostic', 'fit-state', 'input-text'])('detects a relevant tampered %s with a readable field path', kind => {
    const changed = structuredClone(baseline);
    const first = changed.cases[0];
    if (kind === 'coordinate') first.result.layout.boxes[0][1].x += 1;
    if (kind === 'edge-direction') first.result.layout.orderedEdges[0].to = 'client';
    if (kind === 'edge-order') first.result.layout.orderedEdges.reverse();
    if (kind === 'diagnostic') changed.cases.find((item: any) => item.id === 'missing-engines').result.diagnostics[0].path = '/different';
    if (kind === 'fit-state') changed.cases.find((item: any) => item.id === 'side-fit-measured').result.layout.fitComparison.passed = true;
    if (kind === 'input-text') first.input.nodes[0].label += ' changed';
    const mismatches = compareBaselines(baseline, changed);
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches[0].path).toMatch(/^\$\.cases\[/);
    expect(mismatches[0]).toHaveProperty('expected');
    expect(mismatches[0]).toHaveProperty('actual');
  });

  it.each(['text', 'y'])('detects node visible %s changes even when the card bounds stay unchanged', field => {
    const changed = structuredClone(baseline);
    const first = changed.cases[0];
    const index = first.result.scene.findIndex((element: any) => element.type === 'text' && element.semantic?.kind === 'node');
    expect(index).toBeGreaterThanOrEqual(0);
    const text = first.result.scene[index];
    if (field === 'text') text.text += '\nChanged visible wrapping';
    else text.y += 1;
    expect(first.result.layout.boxes).toEqual(baseline.cases[0].result.layout.boxes);
    expect(compareBaselines(baseline, changed)).toEqual([{
      path: `$.cases[0].result.scene[${index}].${field}`,
      expected: baseline.cases[0].result.scene[index][field],
      actual: text[field],
    }]);
  });

  it('rejects incomplete and lossy records and preserves collection order/types', () => {
    const invalid = structuredClone(baseline);
    delete invalid.cases[0].result.layout.boxes[0][1].width;
    expect(() => validateBaseline(invalid)).toThrow(/finite geometry/);
    expect(() => validateBaseline({ ...baseline, schema: 'future' })).toThrow(/schema/);
    expect(() => valueRecord({ x: Infinity })).toThrow(/non-finite/);
    expect(valueRecord(new Map([['b', new Set([2, 1])], ['a', null]]))).toEqual([['b', [2, 1]], ['a', null]]);
    expect(differences({ value: 1 }, { value: '1' })[0].path).toBe('$.value');
    expect(differences({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  it('creates once, refuses overwrite, and leaves missing check destinations absent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'map-layout-baseline-test-'));
    temporary.push(directory);
    const target = join(directory, 'baseline.json');
    await createBaseline(target, baseline);
    await expect(createBaseline(target, baseline)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(baseline);
    const absent = join(directory, 'absent.json');
    await expect(main(['--map-root', '/unused-map-checkout', '--baseline', absent])).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(absent)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(main([])).rejects.toThrow(/--map-root/);
  });
});
