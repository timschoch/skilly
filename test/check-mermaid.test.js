import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDiagrams, loadMermaid, validateMermaid } from '../bundles/workflow/skills/writing-rules/scripts/check-mermaid.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('Markdown yields one diagram per mermaid fence, with its first line', () => {
  const text = ['# Title', '```mermaid', 'flowchart LR', '  a --> b', '```', '', '```js', 'x()', '```', '~~~~ mermaid', 'erDiagram', '~~~~'].join('\n');
  assert.deepEqual(extractDiagrams('doc.md', text), [
    { line: 3, source: 'flowchart LR\n  a --> b' },
    { line: 11, source: 'erDiagram' },
  ]);
});

test('a .mmd file is one diagram, other files none', () => {
  assert.deepEqual(extractDiagrams('flow.mmd', 'flowchart LR'), [{ line: 1, source: 'flowchart LR' }]);
  assert.deepEqual(extractDiagrams('code.js', '```mermaid\nflowchart LR\n```'), []);
});

test('the five recommended kinds parse, broken diagrams fail on their file line', async () => {
  const mermaid = await loadMermaid(root);
  const valid = [
    'sequenceDiagram\n  A->>B: hi',
    'flowchart LR\n  a --> b{ok?}\n  b -- yes --> c',
    'stateDiagram-v2\n  [*] --> A\n  A --> [*]',
    'erDiagram\n  A ||--o{ B : has',
    'flowchart LR\n  subgraph h[hub]\n    a\n  end\n  a --> b',
  ].map((source, index) => ({ file: 'ok.md', line: index * 10, source }));
  assert.deepEqual(await validateMermaid(valid, mermaid), []);

  const failures = await validateMermaid(
    [
      { file: 'bad.md', line: 5, source: 'flowchart LR\n  a[call f(x)] --> b' },
      { file: 'bad.md', line: 20, source: 'flowchrt LR\n  a --> b' },
    ],
    mermaid,
  );
  assert.deepEqual(
    failures.map(({ file, line }) => `${file}:${line}`),
    ['bad.md:6', 'bad.md:20'],
  );
});

test('a repo without mermaid loads nothing', async () => {
  assert.equal(await loadMermaid(mkdtempSync(join(tmpdir(), 'skilly-mermaid-'))), null);
});
