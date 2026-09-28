const store = new Map();
module.exports = { get: k => store.get(k), set: (k, v) => store.set(k, v) };
