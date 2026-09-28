
test('t1', () => expect(1).toBe(1));
test('uses fake timers', () => { jest.useFakeTimers(); expect(1).toBe(1); });
test('t2', () => expect(1).toBe(1));
test('real timeout fires', async () => { await new Promise(r => setTimeout(r, 5)); expect(1).toBe(1); }, 1000);
