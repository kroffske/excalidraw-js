import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ComponentLayoutError, layoutComponent } from '../src/graph-layout/component.js';
import type { ComponentLayoutRelation, ComponentLayoutRequest } from '../src/graph-layout/component.js';

function request(): ComponentLayoutRequest {
  return {
    nodes: [
      { id: 'root', width: 200, height: 80, children: ['a', 'b'] },
      { id: 'a', width: 100, height: 80, children: [] },
      { id: 'b', width: 120, height: 100, children: [] },
    ],
    roots: ['root'],
    relations: [{ id: 'ab', from: 'a', to: 'b', label: 'Call', headerRail: false }],
    direction: 'LR',
    labelFontSize: 16,
  };
}

function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

describe('measured component geometry', () => {
  it.each([
    ['LR', [
      ['other', { width: 110, height: 70, x: 80, y: 80 }],
      ['root', { width: 716, height: 528, x: 80, y: 246 }],
      ['branch', { width: 240, height: 268, x: 128, y: 458 }],
      ['grand', { width: 100, height: 40, x: 176, y: 638 }],
      ['leaf', { width: 160, height: 90, x: 588, y: 458 }],
    ]],
    ['TB', [
      ['other', { width: 110, height: 70, x: 80, y: 80 }],
      ['root', { width: 336, height: 838, x: 80, y: 246 }],
      ['branch', { width: 240, height: 268, x: 128, y: 458 }],
      ['grand', { width: 100, height: 40, x: 176, y: 638 }],
      ['leaf', { width: 160, height: 90, x: 128, y: 946 }],
    ]],
  ] as const)('preserves %s nesting, measured headers and explicit root/child order', (direction, expected) => {
    const input: ComponentLayoutRequest = {
      nodes: [
        { id: 'leaf', width: 160, height: 90, children: [] },
        { id: 'root', width: 300, height: 200, children: ['branch', 'leaf'] },
        { id: 'grand', width: 100, height: 40, children: [] },
        { id: 'branch', width: 240, height: 80, children: ['grand'] },
        { id: 'other', width: 110, height: 70, children: [] },
      ],
      roots: ['other', 'root'], relations: [], direction, labelFontSize: 18,
    };
    const before = structuredClone(input);
    freeze(input);
    const result = layoutComponent(input);
    expect([...result.boxes]).toEqual(expected);
    expect([...result.containers]).toEqual(['root', 'branch']);
    expect(result.direction).toBe(direction);
    expect([...result.edgeGeometry]).toEqual([]);
    expect(input).toEqual(before);
    expect(layoutComponent(input)).toEqual(result);
  });

  it.each([[16, 488], [18, 513]] as const)('measures multiline label corridors by Unicode code points at font size %s', (labelFontSize, expectedX) => {
    const input = request();
    input.nodes[2].width = 110;
    input.labelFontSize = labelFontSize;
    input.relations = [{ id: 'rail', from: 'root', to: 'a', label: `${'😀'.repeat(25)}\nx`, headerRail: true }];
    const result = layoutComponent(input);
    expect(result.boxes.get('b')!.x).toBe(expectedX);
    expect(result.boxes.get('root')!.width).toBe(expectedX - 80 + 110 + 48);
  });

  it('retains straight ports, the header rail and the self loop in input relation order', () => {
    const input = request();
    input.relations = [
      { id: 'z-call', from: 'a', to: 'b', label: '', headerRail: false },
      { id: 'm-rail', from: 'root', to: 'a', label: 'Owns', headerRail: true },
      { id: 'a-self', from: 'a', to: 'a', label: 'Retry', headerRail: true },
    ];
    expect([...layoutComponent(input).edgeGeometry]).toEqual([
      ['z-call', { x: 228, y: 300, points: [[0, 0], [220, 10]] }],
      ['m-rail', { x: 228, y: 128, points: [[0, 0], [0, 132]] }],
      ['a-self', { x: 228, y: 288, points: [[0, 0], [56, 0], [56, 46], [0, 46]] }],
    ]);
  });

  it.each([
    ['LR', [
      ['ab', { x: 228, y: 336, points: [[0, 0], [220, 10]] }],
      ['ba', { x: 448, y: 274, points: [[0, 0], [-220, -10]] }],
    ]],
    ['TB', [
      ['ab', { x: 214, y: 340, points: [[0, 0], [10, 220]] }],
      ['ba', { x: 152, y: 560, points: [[0, 0], [-10, -220]] }],
    ]],
  ] as const)('keeps %s reciprocal offsets and reverse endpoint directions', (direction, expected) => {
    const input = request();
    input.direction = direction;
    input.relations = [...input.relations, { id: 'ba', from: 'b', to: 'a', label: 'Return', headerRail: false }];
    expect([...layoutComponent(input).edgeGeometry]).toEqual(expected);
  });

  it('uses perpendicular ports for vertically stacked LR roots, including reciprocal offsets', () => {
    const input = request();
    input.nodes = input.nodes.slice(1);
    input.roots = ['a', 'b'];
    expect(layoutComponent(input).edgeGeometry.get('ab')).toEqual({ x: 130, y: 160, points: [[0, 0], [10, 96]] });
    input.relations = [...input.relations, { id: 'ba', from: 'b', to: 'a', label: '', headerRail: false }];
    expect([...layoutComponent(input).edgeGeometry]).toEqual([
      ['ab', { x: 166, y: 160, points: [[0, 0], [10, 96]] }],
      ['ba', { x: 104, y: 256, points: [[0, 0], [-10, -96]] }],
    ]);
  });

  it('applies reciprocal separation to selected header rails as well', () => {
    const input = request();
    input.relations = [
      { id: 'owns', from: 'root', to: 'a', label: '', headerRail: true },
      { id: 'back', from: 'a', to: 'root', label: '', headerRail: false },
    ];
    expect([...layoutComponent(input).edgeGeometry]).toEqual([
      ['owns', { x: 192, y: 128, points: [[0, 0], [0, 132]] }],
      ['back', { x: 128, y: 336, points: [[0, 0], [488, -56]] }],
    ]);
  });

  it('accepts arbitrary nonempty IDs without normalization or inferred hierarchy', () => {
    const ids = ['__proto__', 'node/a~b', ' '];
    const input: ComponentLayoutRequest = {
      nodes: ids.map(id => ({ id, width: 100, height: 80, children: [] })),
      roots: [...ids].reverse(), direction: 'LR', labelFontSize: 16,
      relations: [{ id: 'edge/~a → b', from: ids[0], to: ids[1], label: 'Exact\nText', headerRail: true }],
    };
    const before = structuredClone(input);
    freeze(input);
    const result = layoutComponent(input);
    expect([...result.boxes.keys()]).toEqual([' ', 'node/a~b', '__proto__']);
    expect([...result.containers]).toEqual([]);
    expect([...result.edgeGeometry.keys()]).toEqual(['edge/~a → b']);
    expect(input).toEqual(before);
    result.boxes.get('__proto__')!.width = 999;
    expect(input.nodes[0].width).toBe(100);
    expect(layoutComponent(input).boxes.get('__proto__')!.width).toBe(100);
  });

  const invalid: [string, (input: ComponentLayoutRequest) => void][] = [
    ['empty node ID', input => { input.nodes[0].id = ''; }],
    ['duplicate node ID', input => { input.nodes[1].id = 'root'; }],
    ['zero width', input => { input.nodes[0].width = 0; }],
    ['negative height', input => { input.nodes[0].height = -1; }],
    ['infinite width', input => { input.nodes[0].width = Infinity; }],
    ['NaN height', input => { input.nodes[0].height = NaN; }],
    ['absent children', input => { input.nodes[0].children = undefined as unknown as string[]; }],
    ['foreign child', input => { input.nodes[0].children = ['missing', 'b']; }],
    ['repeated child', input => { input.nodes[0].children = ['a', 'a', 'b']; }],
    ['multiple parents', input => {
      input.nodes = [...input.nodes, { id: 'other', width: 10, height: 10, children: ['a'] }];
      input.roots = ['root', 'other'];
    }],
    ['foreign root', input => { input.roots = ['missing']; }],
    ['duplicate root', input => { input.roots = ['root', 'root']; }],
    ['root also a child', input => { input.roots = ['root', 'a']; }],
    ['missing root coverage', input => { input.roots = []; }],
    ['missing child coverage', input => { input.nodes[0].children = ['a']; }],
    ['disconnected cycle', input => {
      input.nodes = [{ id: 'a', width: 10, height: 10, children: ['b'] }, { id: 'b', width: 10, height: 10, children: ['a'] }];
      input.roots = [];
    }],
    ['self cycle', input => {
      input.nodes = [{ id: 'a', width: 10, height: 10, children: ['a'] }];
      input.roots = [];
    }],
    ['empty relation ID', input => { input.relations[0].id = ''; }],
    ['duplicate relation ID', input => { input.relations = [input.relations[0], { ...input.relations[0] }]; }],
    ['foreign relation source', input => { input.relations[0].from = 'missing'; }],
    ['foreign relation target', input => { input.relations[0].to = 'missing'; }],
    ['nontext label', input => { input.relations[0].label = 12 as unknown as string; }],
    ['nonboolean header rail', input => { input.relations[0].headerRail = 1 as unknown as boolean; }],
    ['absent header rail', input => { delete (input.relations[0] as Partial<ComponentLayoutRelation>).headerRail; }],
    ['unsupported direction', input => { input.direction = 'RL' as 'LR'; }],
    ['absent direction', input => { delete (input as Partial<ComponentLayoutRequest>).direction; }],
    ['zero font size', input => { input.labelFontSize = 0; }],
    ['infinite font size', input => { input.labelFontSize = Infinity; }],
    ['NaN font size', input => { input.labelFontSize = NaN; }],
  ];
  it.each(invalid)('refuses %s explicitly without changing the input', (_name, mutate) => {
    const input = request();
    mutate(input);
    const before = structuredClone(input);
    freeze(input);
    expect(() => layoutComponent(input)).toThrowError(ComponentLayoutError);
    expect(() => layoutComponent(input)).toThrowError(expect.objectContaining({ code: 'INVALID_LAYOUT_REQUEST', diagnostics: [expect.objectContaining({ code: 'INVALID_LAYOUT_REQUEST' })] }));
    expect(input).toEqual(before);
  });

  it.each([null, {}, { nodes: [], roots: [] }, { nodes: null, roots: [], relations: [] }])('rejects malformed request shape %j', input => {
    expect(() => layoutComponent(input as ComponentLayoutRequest)).toThrowError(ComponentLayoutError);
  });

  it('preserves original subject IDs alongside escaped error locations', () => {
    const input = request();
    input.nodes[0].id = 'node/a~b';
    input.roots = ['node/a~b'];
    input.nodes[0].children = ['missing'];
    expect(() => layoutComponent(input)).toThrowError(expect.objectContaining({ diagnostics: [{
      code: 'INVALID_LAYOUT_REQUEST', path: '/nodes/node~1a~0b/children/0', nodeId: 'node/a~b', message: expect.any(String),
    }] }));
    input.nodes[0].children = ['a', 'b'];
    input.relations[0].id = 'edge/a~b';
    input.relations[0].to = 'missing';
    expect(() => layoutComponent(input)).toThrowError(expect.objectContaining({ diagnostics: [{
      code: 'INVALID_LAYOUT_REQUEST', path: '/relations/0', edgeId: 'edge/a~b', message: expect.any(String),
    }] }));
  });

  it('refuses nonfinite calculated geometry instead of returning a partial layout', () => {
    const input = request();
    input.nodes[1].width = Number.MAX_VALUE;
    input.nodes[2].width = Number.MAX_VALUE;
    expect(() => layoutComponent(input)).toThrowError(ComponentLayoutError);
    const labels = request();
    labels.labelFontSize = Number.MAX_VALUE;
    expect(() => layoutComponent(labels)).toThrowError(ComponentLayoutError);
    const roots = request();
    roots.nodes = [{ id: 'a', width: 10, height: Number.MAX_VALUE, children: [] }, { id: 'b', width: 10, height: Number.MAX_VALUE, children: [] }];
    roots.roots = ['a', 'b'];
    roots.relations = [];
    expect(() => layoutComponent(roots)).toThrowError(ComponentLayoutError);
  });

  it('places a deep valid forest without depending on the JavaScript recursion limit', () => {
    const count = 3000;
    const input: ComponentLayoutRequest = {
      nodes: Array.from({ length: count }, (_, index) => ({ id: String(index), width: 1, height: 1, children: index + 1 < count ? [String(index + 1)] : [] })),
      roots: ['0'], relations: [], direction: 'LR', labelFontSize: 16,
    };
    const result = layoutComponent(input);
    expect(result.boxes.size).toBe(count);
    expect(result.boxes.get(String(count - 1))).toEqual({ width: 1, height: 1, x: 80 + 48 * (count - 1), y: 80 + 180 * (count - 1) });
  });

  it('supports an empty forest with no engines', () => {
    expect(layoutComponent({ nodes: [], roots: [], relations: [], direction: 'TB', labelFontSize: 16 })).toEqual({
      boxes: new Map(), containers: new Set(), direction: 'TB', edgeGeometry: new Map(),
    });
  });

  it('runs the transpiled module without Node, DOM, engines or Map application imports', () => {
    const modules = new Map<string, Record<string, unknown>>();
    const load = (name: string): Record<string, unknown> => {
      if (modules.has(name)) return modules.get(name)!;
      const source = readFileSync(new URL(`../src/graph-layout/${name}.ts`, import.meta.url), 'utf8');
      const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
      const exports = {};
      modules.set(name, exports);
      runInNewContext(compiled.outputText, { exports, require(specifier: string) {
        if (!['./text.js', './labels.js', './routing.js', './routing-labels.js', './types.js', './component-compact.js', './component-clearance.js'].includes(specifier)) throw new Error(`Unexpected runtime import: ${specifier}`);
        return load(specifier.slice(2, -3));
      } });
      return exports;
    };
    const exports = load('component') as { layoutComponent: typeof layoutComponent };
    expect([...exports.layoutComponent(request()).boxes]).toEqual([...layoutComponent(request()).boxes]);
  });
});
