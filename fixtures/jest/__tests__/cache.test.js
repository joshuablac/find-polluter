
const cache = require('../cache.js');
test('innocent one', () => expect(1).toBe(1));
test('innocent two (a.b*c)', () => expect(2).toBe(2));
describe('writer', () => {
  test('innocent three', () => expect(3).toBe(3));
  test('seeds the cache', () => { cache.set('user', 'admin'); expect(cache.get('user')).toBe('admin'); });
});
test('innocent four', () => expect(4).toBe(4));
test('reads empty cache', () => expect(cache.get('user')).toBeUndefined());
