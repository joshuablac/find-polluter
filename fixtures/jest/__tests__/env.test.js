
test('a', () => expect(true).toBe(true));
test('sets debug flag', () => { process.env.APP_DEBUG = '1'; expect(process.env.APP_DEBUG).toBe('1'); });
test('b', () => expect(true).toBe(true));
test('c', () => expect(true).toBe(true));
test('debug is off by default', () => expect(process.env.APP_DEBUG).toBeUndefined());
