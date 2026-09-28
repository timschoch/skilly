import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isNewRepo } from '../lib/setup.js';

const folder = () => mkdtempSync(join(tmpdir(), 'skilly-new-'));

test('isNewRepo: empty folder is new', () => assert.equal(isNewRepo(folder()), true));

test('isNewRepo: README with only a heading is new', () => {
  const cwd = folder();
  writeFileSync(join(cwd, 'README.md'), '# lego-archive\n');
  assert.equal(isNewRepo(cwd), true);
});

test('isNewRepo: README with text is not new', () => {
  const cwd = folder();
  writeFileSync(join(cwd, 'README.md'), '# Lego Archive\n\nPhotos of set instructions.\n');
  assert.equal(isNewRepo(cwd), false);
});

test('isNewRepo: a stack file is not new', () => {
  const cwd = folder();
  writeFileSync(join(cwd, 'package.json'), '{}');
  assert.equal(isNewRepo(cwd), false);
});
