import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { layoutSequence, SequenceLayoutError } from '../src/graph-layout/sequence.js';
import type { SequenceLayoutRequest } from '../src/graph-layout/sequence.js';

// Pure sequence imports and calculation must work when neither engine is available.
vi.mock('@hpcc-js/wasm-graphviz', () => { throw new Error('Sequence geometry imported Graphviz.'); });
vi.mock('libavoid-js', () => { throw new Error('Sequence geometry imported libavoid.'); });

const baseline = JSON.parse(await readFile(new URL('./fixtures/map-layout-migration/baseline.json', import.meta.url), 'utf8'));
const retained = baseline.cases.find((item: { id: string }) => item.id === 'sequence-automatic').result;

function request(): SequenceLayoutRequest {
  return {
    participants: [{ id: 'z', width: 120, height: 60 }, { id: 'a', width: 200, height: 140 }],
    messages: [
      { id: 'z-first', from: 'z', to: 'a', label: 'send [ready]' },
      { id: 'a-next', from: 'a', to: 'z', label: 'reply' },
      { id: 'self', from: 'a', to: 'a', label: 'wait' },
    ],
    wrapLabels: true,
    labelFontSize: 18,
  };
}

function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

describe('pure measured sequence geometry', () => {
  it('matches retained Stage 0 sequence boxes, labels, lifelines and native arrow points exactly', () => {
    const result = layoutSequence({
      participants: [
        { id: 'client', width: 260, height: 329 },
        { id: 'api', width: 260, height: 329 },
        { id: 'store', width: 260, height: 345 },
      ],
      messages: [
        { id: 'request', from: 'client', to: 'api', label: '1. request' },
        { id: 'persist', from: 'api', to: 'store', label: '2. persist' },
        { id: 'ack', from: 'store', to: 'api', label: '3. acknowledge' },
        { id: 'response', from: 'api', to: 'client', label: '4. respond' },
      ],
      wrapLabels: true,
      labelFontSize: 18,
    });
    expect([...result.boxes]).toEqual(retained.layout.boxes);
    expect(result.direction).toBe(retained.layout.direction);
    expect(result.messageTop).toBe(retained.layout.messageTop);
    expect(result.messageGap).toBe(retained.layout.messageGap);
    expect([...result.messageLabels]).toEqual(retained.layout.messageLabels);
    for (const element of retained.scene) {
      const id = element.semantic?.semanticId;
      if (element.semantic?.role === 'lifeline') {
        expect(result.lifelines.get(id)).toEqual({ x: element.x, y: element.y, width: element.width, height: element.height });
      }
      if (element.semantic?.role === 'arrow') {
        expect(result.edgeGeometry.get(id)).toEqual({ x: element.x, y: element.y, points: element.points });
      }
    }
  });

  it('preserves explicit participant/message order, variable heights, reverse arrows and self loops', () => {
    const result = layoutSequence(request());
    expect([...result.boxes]).toEqual([
      ['z', { x: 80, y: 80, width: 120, height: 60 }],
      ['a', { x: 248, y: 80, width: 200, height: 140 }],
    ]);
    expect(result.messageTop).toBe(307);
    expect(result.messageGap).toBe(87);
    expect([...result.messageLabels]).toEqual([
      ['z-first', { text: 'send [ready]', centerX: 244 }],
      ['a-next', { text: 'reply', centerX: 244 }],
      ['self', { text: 'wait', centerX: 404 }],
    ]);
    expect([...result.edgeGeometry]).toEqual([
      ['z-first', { x: 140, y: 307, points: [[0, 0], [104, 0], [208, 0]] }],
      ['a-next', { x: 348, y: 394, points: [[0, 0], [-104, 0], [-208, 0]] }],
      ['self', { x: 348, y: 481, points: [[0, 0], [56, 0], [56, 36], [0, 36]] }],
    ]);
    expect([...result.lifelines]).toEqual([
      ['z', { x: 139, y: 140, width: 2, height: 428 }],
      ['a', { x: 347, y: 220, width: 2, height: 348 }],
    ]);
  });

  it('keeps legacy and E2 unwrapped labels out of geometry, including authored multiline labels', () => {
    const input = request();
    input.wrapLabels = false;
    input.messages = [{ ...input.messages[0], label: 'unchanged\r\n' + 'long text '.repeat(80) }, ...input.messages.slice(1)];
    const result = layoutSequence(input);
    expect(result.messageLabels.size).toBe(0);
    expect(result.messageGap).toBe(87);
    expect(result.messageTop).toBe(307);
    expect([...result.edgeGeometry]).toEqual([
      ['z-first', { x: 140, y: 307, points: [[0, 0], [208, 0]] }],
      ['a-next', { x: 348, y: 394, points: [[0, 0], [-208, 0]] }],
      ['self', { x: 348, y: 481, points: [[0, 0], [56, 0], [56, 36], [0, 36]] }],
    ]);
  });

  it('retains authored Unicode, conditions and graphemes while applying current self-label wrapping', () => {
    const label = '1. Передать состояние [готово]\r\nСемья 👩‍👩‍👧‍👦 é\nalpha-beta-gamma';
    const result = layoutSequence({ participants: [{ id: 'one', width: 120, height: 80 }],
      messages: [{ id: 'self', from: 'one', to: 'one', label }], wrapLabels: true, labelFontSize: 18 });
    // Expected wrapping captured from the retained Map native-text implementation.
    expect(result.messageLabels.get('self')).toEqual({
      text: '1.\nПередат\nь\nсостоян\nие\n[готово]\nСемья\n👩‍👩‍👧‍👦\né\nalpha-\nbeta-\ngamma', centerX: 196,
    });
    expect(result.messageGap).toBe(306);
    expect(result.messageTop).toBe(470);
    expect(result.lifelines.get('one')).toEqual({ x: 139, y: 160, width: 2, height: 616 });
    expect(result.edgeGeometry.get('self')).toEqual({ x: 140, y: 470, points: [[0, 0], [56, 0], [56, 36], [0, 36]] });
  });

  it('chooses the midpoint corridor and preserves leftmost ties in either message direction', () => {
    const result = layoutSequence({
      participants: ['z', 'm', 'a', 'b'].map(id => ({ id, width: 100, height: 84 })),
      messages: [
        { id: 'across', from: 'z', to: 'b', label: 'across' },
        { id: 'tie', from: 'z', to: 'a', label: 'tie' },
        { id: 'reverse', from: 'a', to: 'z', label: 'reverse' },
        { id: 'inner', from: 'm', to: 'b', label: 'inner' },
      ], wrapLabels: true, labelFontSize: 18,
    });
    expect([...result.messageLabels].map(([id, label]) => [id, label.centerX])).toEqual([
      ['across', 352], ['tie', 204], ['reverse', 204], ['inner', 352],
    ]);
    expect(result.edgeGeometry.get('across')?.points).toEqual([[0, 0], [222, 0], [444, 0]]);
    expect(result.edgeGeometry.get('reverse')?.points).toEqual([[0, 0], [-222, 0], [-296, 0]]);
  });

  it.each([12, 18, 24])('uses caller font size %s with retained line height and padding', labelFontSize => {
    const result = layoutSequence({ participants: [{ id: 'one', width: 120, height: 84 }],
      messages: [{ id: 'self', from: 'one', to: 'one', label: 'a\nb\nc' }], wrapLabels: true, labelFontSize });
    const gap = Math.max(87, 3 * labelFontSize * 1.25 + 36);
    expect(result.messageGap).toBe(gap);
    expect(result.messageTop).toBe(164 + gap);
  });

  it.each([true, false])('has deterministic empty geometry with wrapping=%s', wrapLabels => {
    const result = layoutSequence({ participants: [], messages: [], wrapLabels, labelFontSize: 18 });
    expect(result).toEqual({ boxes: new Map(), direction: 'LR', messageTop: 251, messageGap: 87,
      messageLabels: new Map(), lifelines: new Map(), edgeGeometry: new Map() });
    const onlyParticipant = layoutSequence({ participants: [{ id: 'one', width: 120, height: 60 }],
      messages: [], wrapLabels, labelFontSize: 18 });
    expect(onlyParticipant.lifelines.get('one')).toEqual({ x: 139, y: 140, width: 2, height: 198 });
  });

  it('accepts arbitrary nonempty identities without object-key hazards or namespace merging', () => {
    const input: SequenceLayoutRequest = {
      participants: ['__proto__', 'constructor', 'node/a~b', ' '].map(id => ({ id, width: 120, height: 84 })),
      messages: [{ id: '__proto__', from: '__proto__', to: 'node/a~b', label: '' },
        { id: 'edge/a~b', from: 'constructor', to: ' ', label: ' [ready] ' }],
      wrapLabels: false, labelFontSize: 18,
    };
    const result = layoutSequence(input);
    expect([...result.boxes.keys()]).toEqual(['__proto__', 'constructor', 'node/a~b', ' ']);
    expect([...result.edgeGeometry.keys()]).toEqual(['__proto__', 'edge/a~b']);
  });

  it('does not mutate requests or alias result boxes, and repeats deterministically without engines', () => {
    const input = request(), before = structuredClone(input);
    freeze(input);
    const first = layoutSequence(input), second = layoutSequence(input);
    expect(first).toEqual(second);
    expect(input).toEqual(before);
    first.boxes.get('z')!.width = 999;
    first.edgeGeometry.get('z-first')!.points[0][0] = 999;
    expect(second.boxes.get('z')!.width).toBe(120);
    expect(second.edgeGeometry.get('z-first')!.points[0]).toEqual([0, 0]);
    expect(input).toEqual(before);
  });

  it.each([
    ['null request', null, '/'],
    ['array request', [], '/'],
    ['missing participants', { ...request(), participants: undefined }, '/'],
    ['missing messages', { ...request(), messages: undefined }, '/'],
    ['missing wrapping choice', { ...request(), wrapLabels: undefined }, '/wrapLabels'],
    ['nonboolean wrapping', { ...request(), wrapLabels: 1 }, '/wrapLabels'],
    ['missing font size', { ...request(), labelFontSize: undefined }, '/labelFontSize'],
    ['nonfinite font size', { ...request(), labelFontSize: Infinity }, '/labelFontSize'],
    ['zero font size', { ...request(), labelFontSize: 0 }, '/labelFontSize'],
    ['string font size', { ...request(), labelFontSize: '18' }, '/labelFontSize'],
    ['null participant', { ...request(), participants: [null] }, '/participants/0'],
    ['empty participant ID', { ...request(), participants: [{ id: '', width: 10, height: 10 }] }, '/participants/0'],
    ['numeric participant ID', { ...request(), participants: [{ id: 1, width: 10, height: 10 }] }, '/participants/0'],
    ['duplicate participants', { ...request(), participants: [request().participants[0], request().participants[0]] }, '/participants/1'],
    ['nonfinite width', { ...request(), participants: [{ id: 'z', width: Infinity, height: 10 }] }, '/participants/0'],
    ['NaN height', { ...request(), participants: [{ id: 'z', width: 10, height: NaN }] }, '/participants/0'],
    ['negative height', { ...request(), participants: [{ id: 'z', width: 10, height: -1 }] }, '/participants/0'],
    ['zero width', { ...request(), participants: [{ id: 'z', width: 0, height: 10 }] }, '/participants/0'],
    ['sparse participant list', { ...request(), participants: Array(1) }, '/participants/0'],
    ['null message', { ...request(), messages: [null] }, '/messages/0'],
    ['empty message ID', { ...request(), messages: [{ ...request().messages[0], id: '' }] }, '/messages/0'],
    ['duplicate messages', { ...request(), messages: [request().messages[0], request().messages[0]] }, '/messages/1'],
    ['unknown source', { ...request(), messages: [{ ...request().messages[0], from: 'missing' }] }, '/messages/0'],
    ['unknown target', { ...request(), messages: [{ ...request().messages[0], to: 'missing' }] }, '/messages/0'],
    ['numeric endpoint', { ...request(), messages: [{ ...request().messages[0], to: 1 }] }, '/messages/0'],
    ['missing label', { ...request(), messages: [{ id: 'message', from: 'z', to: 'a' }] }, '/messages/0'],
    ['null label', { ...request(), messages: [{ ...request().messages[0], label: null }] }, '/messages/0'],
    ['sparse message list', { ...request(), messages: Array(1) }, '/messages/0'],
  ])('refuses malformed %s with a stable diagnostic', (_name, input, path) => {
    expect(() => layoutSequence(input as SequenceLayoutRequest)).toThrowError(expect.objectContaining({
      name: 'SequenceLayoutError', code: 'INVALID_SEQUENCE_LAYOUT_REQUEST', path,
      diagnostics: [expect.objectContaining({ code: 'INVALID_SEQUENCE_LAYOUT_REQUEST', path })],
    }));
  });

  it('retains exact node/edge identities in validation diagnostics', () => {
    const invalidParticipant = { ...request(), participants: [{ id: 'node/a~b', width: 0, height: 10 }] };
    const invalidMessage = { ...request(), messages: [{ id: 'edge/a~b', from: 'z', to: 'missing', label: '' }] };
    expect(() => layoutSequence(invalidParticipant)).toThrowError(expect.objectContaining({
      diagnostics: [expect.objectContaining({ nodeId: 'node/a~b', path: '/participants/0' })],
    }));
    try { layoutSequence(invalidMessage); }
    catch (error) {
      expect(error).toBeInstanceOf(SequenceLayoutError);
      expect((error as SequenceLayoutError).diagnostics[0]).toMatchObject({ edgeId: 'edge/a~b', path: '/messages/0' });
      return;
    }
    throw new Error('An unknown endpoint was accepted.');
  });

  it.each([
    { participants: [{ id: 'a', width: Number.MAX_VALUE, height: 84 }, { id: 'b', width: Number.MAX_VALUE, height: 84 }],
      messages: [{ id: 'ab', from: 'a', to: 'b', label: 'send' }], wrapLabels: false, labelFontSize: 18 },
    { participants: [{ id: 'one', width: 120, height: 84 }],
      messages: [{ id: 'self', from: 'one', to: 'one', label: 'a' }], wrapLabels: true, labelFontSize: Number.MAX_VALUE },
  ])('refuses arithmetic overflow instead of returning nonfinite geometry', input => {
    expect(() => layoutSequence(input)).toThrowError(expect.objectContaining({
      code: 'INVALID_SEQUENCE_LAYOUT_REQUEST', message: expect.stringContaining('finite coordinate range'),
    }));
  });

  it('refuses overflowing participant extents even when scalar fields and lifeline centers remain finite', () => {
    const width = Number.MAX_VALUE * 0.6;
    const input: SequenceLayoutRequest = {
      participants: [{ id: 'a', width, height: 10 }, { id: 'b', width, height: 10 }],
      messages: [], wrapLabels: false, labelFontSize: 18,
    };
    expect(() => layoutSequence(input)).toThrowError(expect.objectContaining({
      code: 'INVALID_SEQUENCE_LAYOUT_REQUEST', path: '/participants',
      diagnostics: [expect.objectContaining({ nodeId: 'b' })],
    }));
  });
});
