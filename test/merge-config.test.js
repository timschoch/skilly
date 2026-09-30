import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeConfig } from '../bundles/workflow/skills/naming/scripts/merge-config.mjs';
import { validateSharedCopies } from '../scripts/validate-shared-copies.mjs';

test('objects merge by key, at every depth', () => {
  const merged = mergeConfig(
    { shortWords: { opts: 'options', err: 'error' }, discriminant: 'kind' },
    { shortWords: { dto: 'data transfer object' } },
  );
  assert.deepEqual(merged, {
    shortWords: { opts: 'options', err: 'error', dto: 'data transfer object' },
    discriminant: 'kind',
  });
});

test('null in the override drops the key', () => {
  assert.deepEqual(mergeConfig({ shortWords: { opts: 'options' } }, { shortWords: { opts: null } }), {
    shortWords: {},
  });
  assert.deepEqual(mergeConfig({ noiseWords: ['Data'], discriminant: 'kind' }, { noiseWords: null }), {
    discriminant: 'kind',
  });
});

test('arrays append, dedupe and keep their order', () => {
  assert.deepEqual(mergeConfig({ noiseWords: ['Data', 'Info'] }, { noiseWords: ['Info', 'Wrapper'] }), {
    noiseWords: ['Data', 'Info', 'Wrapper'],
  });
});

test('a leading dash in the override removes the entry it names', () => {
  assert.deepEqual(mergeConfig({ noiseWords: ['Data', 'Info'] }, { noiseWords: ['-Data', 'Wrapper'] }), {
    noiseWords: ['Info', 'Wrapper'],
  });
});

test('a scalar override replaces the base value', () => {
  assert.deepEqual(mergeConfig({ discriminant: 'kind' }, { discriminant: 'type' }), { discriminant: 'type' });
});

test('$comment is dropped from the base and from the override', () => {
  const merged = mergeConfig(
    { $comment: 'the defaults', synonyms: { $comment: 'keyed by the wrong prefix', retrieve: 'get' } },
    { $comment: 'my repo', synonyms: { $comment: 'mine', grab: 'get' } },
  );
  assert.deepEqual(merged, { synonyms: { retrieve: 'get', grab: 'get' } });
});

test('objects without a name append without dedupe', () => {
  const example = { good: 'getUser', bad: 'grabUser' };
  const merged = mergeConfig({ examples: [example] }, { examples: [example, { good: 'listUsers' }] });
  assert.deepEqual(merged.examples, [example, example, { good: 'listUsers' }]);
});

test('an object with a name merges into the base entry of that name, in place', () => {
  const merged = mergeConfig(
    {
      steps: [
        { name: 'lint', run: 'npm run lint', why: 'style' },
        { name: 'unit', run: 'npm test' },
      ],
    },
    {
      steps: [
        { name: 'lint', run: 'pnpm lint' },
        { name: 'e2e', run: 'playwright test' },
      ],
    },
  );
  assert.deepEqual(merged.steps, [
    { name: 'lint', run: 'pnpm lint', why: 'style' },
    { name: 'unit', run: 'npm test' },
    { name: 'e2e', run: 'playwright test' },
  ]);
});

test('a leading dash removes the entry with that name', () => {
  const merged = mergeConfig(
    {
      steps: [
        { name: 'lint', run: 'x' },
        { name: 'unit', run: 'y' },
      ],
    },
    { steps: ['-lint'] },
  );
  assert.deepEqual(merged.steps, [{ name: 'unit', run: 'y' }]);
});

test('the shipped copies of merge-config.mjs are identical', () => {
  assert.deepEqual(validateSharedCopies(process.cwd()), []);
});

test('the copy check names a copy that differs', () => {
  const read = (path) => (path.includes('verify') ? 'changed' : readFileSync(path, 'utf8'));
  assert.deepEqual(validateSharedCopies(process.cwd(), read), [
    'bundles/workflow/skills/verify/scripts/merge-config.mjs',
  ]);
});
