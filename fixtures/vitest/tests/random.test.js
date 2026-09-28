import { describe, it, test, expect, vi, beforeAll } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
test('r1', () => expect(1).toBe(1));
test('r2', () => expect(1).toBe(1));
test('coin flip', () => expect(Math.random()).toBeLessThan(0.5));
