const test = require('node:test');

test('red probe', () => {
  throw new Error('red on purpose');
});
