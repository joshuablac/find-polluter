
test('x1', () => expect(1).toBe(1));
test('x2', () => expect(1).toBe(1));
test('x3', () => expect(1).toBe(1));
test('stubs Date.now', () => { jest.spyOn(Date, 'now').mockReturnValue(0); expect(Date.now()).toBe(0); });
test('x4', () => expect(1).toBe(1));
test('clock is real', () => expect(Date.now()).toBeGreaterThan(0));
