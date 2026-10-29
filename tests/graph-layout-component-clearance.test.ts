import { describe, expect, it } from 'vitest';
import { finiteStrokeClearance, strokeClearanceBudget } from '../src/graph-layout/index.js';
const stroke = (a: [
    number,
    number
], b: [
    number,
    number
], width = 1.75) => ({ points: [a, b] as const, width, cap: 'round' as const });
describe('finite compact stroke clearance', () => {
    it('keeps end-cap contacts with zero and negative longitudinal projection', () => {
        expect(finiteStrokeClearance(stroke([0, 0], [10, 0]), stroke([10, 1], [20, 1])).gap).toBe(-.75);
        expect(finiteStrokeClearance(stroke([0, 0], [10, 0]), stroke([13, 4], [20, 4]))).toEqual({ distance: 5, gap: 3.25 });
        expect(finiteStrokeClearance(stroke([0, 0], [10, 0]), stroke([100, 0], [110, 0])).gap).toBe(88.25);
    });
    it('separates renderer error, strict admission and positive arithmetic design reserve', () => {
        const b = strokeClearanceBudget(4, { x: .005, y: .005 });
        expect(b.requiredGap).toBe(4 + 2 * Math.hypot(.005, .005));
        expect(b.designGap).toBe(b.requiredGap + 1e-6);
        expect(strokeClearanceBudget(4, { x: 0, y: 0 }).requiredGap).toBe(4);
    });
    it('refuses unsupported transforms and paint instead of returning a clear gap', () => {
        expect(() => finiteStrokeClearance(stroke([0, 0], [10, 1]), stroke([0, 10], [10, 10]))).toThrow('axis-aligned');
        expect(() => strokeClearanceBudget(4, { x: NaN, y: 0 })).toThrow();
    });
});
