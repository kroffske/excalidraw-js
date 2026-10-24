import { describe, expect, it } from 'vitest';
import { fitCard, fit_card, fitText } from '../src/card.js';
import { fitText as legacyEntry } from '../src/text.js';
import { measureText } from '../src/graph-layout/text.js';

describe('shared browser card calculation', () => {
  it('keeps old entry points, defaults and approximate card geometry', () => {
    expect(fit_card).toBe(fitCard);
    expect(legacyEntry).toBe(fitText);
    const card = fitCard({ id: 'old', title: 'Title', rows: [{ text: 'Body' }] });
    expect(card.width).toBe(120);
    expect(card.title?.fitted.size).toBe(17);
    expect(card.title?.fitted.lineHeight).toBe(1.22);
    expect(card.height).toBeCloseTo(76.6);
    expect(card.rows[0].y).toBeCloseTo(44.74);
    expect(fitText('one two three', { width: 60, size: 10, maxLines: 1, overflow: 'ellipsis' }).text).toBe('one two…');
  });
  it('uses native metrics with exact source and growing height, without reducing fonts', () => {
    const title = 'ПреобразовательСверхДлинногоИдентификатора';
    const card = fitCard({ id: 'native', title, width: 160, padding: 20, titleSize: 24, titleMinSize: 24,
      titleMaxLines: Infinity, rows: [{ id: 'responsibility', text: 'Сохраняет каждый пункт и номер попытки', size: 20, minSize: 20 }],
      metrics: 'helvetica', lineHeight: 1.25, strict: true });
    expect(card.title?.source.text).toBe(title);
    expect(card.title?.fitted.text.replaceAll('\n', '')).toBe(title);
    expect(card.title?.fitted.lines.every(line => measureText(line, 24) <= 120)).toBe(true);
    expect(card.rows[0].source.id).toBe('responsibility');
    expect(card.rows[0].y).toBeGreaterThan(card.title!.y + card.title!.fitted.height);
    expect(card.height).toBeGreaterThan(200);
    expect(card.overflowed).toBe(false);
  });
  it('reports impossible widths and obeys explicit line height', () => {
    expect(() => fitCard({ id: 'bad', title: 'Ш', width: 2, metrics: 'helvetica', strict: true })).toThrow(/strict/);
    expect(() => fitCard({ id: 'bad', width: 0 })).toThrow(/positive/);
    expect(fitText('А\nБ', { width: 100, size: 20, lineHeight: 1.25, metrics: 'helvetica' }).height).toBe(50);
  });
});
