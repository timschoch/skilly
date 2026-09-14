#!/usr/bin/env node
// Gate check `naming`: the machine-checkable half of the naming Rule, over the
// files a PR changes. Regex-only, on comment- and string-blanked source — the
// gate runs in a consumer checkout that installs nothing, so there is no parser
// to lean on. Every check stays conservative: a missed bad name costs less than
// a false FAIL, which teaches people to ignore the gate.
// Every word list — short words, noise words, verb synonyms, env roles, the
// discriminant key and the allow list — lives in the naming skill's
// `references/naming.json`, merged with the consumer's `docs/agents/naming.json`
// by `skills/naming/scripts/config.mjs`. Only the single-letter ban is in code.
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadNamingConfig } from '../skills/naming/scripts/config.mjs';

const SKIP_SEGMENTS = new Set(['node_modules', '.agents', '.claude', '.skilly-hub', 'dist', 'build', '.next']);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const GENERATED = /\.generated\.|\.d\.ts$/;
const ENV_EXAMPLE = /^\.env(\.[^.]+)*\.(example|sample)$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ENV_NAME = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
const VALUE_KINDS = new Set(['binding', 'function', 'param']);
const NAMED_KINDS = new Set(['binding', 'function', 'type', 'interface', 'class', 'enum']);
const TYPE_KINDS = new Set(['type', 'interface', 'class']);

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The config's word lists, turned into the shapes the checks below match on.
function toCheckLists(config) {
  const shortWords = {};
  for (const [abbreviation, word] of Object.entries(config.shortWords ?? {})) {
    shortWords[abbreviation.toLowerCase()] = word;
  }
  const noiseWords = config.noiseWords ?? [];
  const roles = config.artifacts?.env?.roles ?? [];
  return {
    shortWords,
    // Longest prefix first: getAll/fetchAll must be read before their bare stems.
    synonyms: Object.entries(config.synonyms ?? {}).sort(([left], [right]) => right.length - left.length),
    noiseSuffix: noiseWords.length ? new RegExp(`(${noiseWords.map(escapeRegExp).join('|')})$`) : null,
    envRoles: roles,
    envFor: roles.length
      ? new RegExp(`^[A-Z0-9]+(_[A-Z0-9]+)*_(${roles.map(escapeRegExp).join('|')})_FOR_[A-Z0-9]+$`)
      : null,
    discriminant: config.discriminant,
  };
}

// --- source shaping ---------------------------------------------------------

// Blanks comment bodies and string/template contents to spaces, keeping every
// byte offset and newline. Findings stay on their real line, and the regexes
// below never see prose or literals.
export function blankNoise(source) {
  const out = source.split('');
  const blank = (from, to) => {
    for (let index = from; index < to && index < out.length; index++) if (out[index] !== '\n') out[index] = ' ';
  };
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      let end = source.indexOf('\n', index);
      if (end === -1) end = source.length;
      blank(index, end);
      index = end;
      continue;
    }
    if (char === '/' && next === '*') {
      const found = source.indexOf('*/', index + 2);
      const end = found === -1 ? source.length : found + 2;
      blank(index, end);
      index = end;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) break;
        if (char !== '`' && source[cursor] === '\n') break; // unterminated quote: stop at the line end
        cursor++;
      }
      blank(index + 1, cursor);
      index = cursor + 1;
      continue;
    }
    index++;
  }
  return out.join('');
}

const lineOf = (source, index) => {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < source.length; cursor++) if (source[cursor] === '\n') line++;
  return line;
};

const PAIRS = { '(': ')', '{': '}', '[': ']' };

function matchBracket(source, open) {
  const close = PAIRS[source[open]];
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === source[open]) depth++;
    else if (source[index] === close && --depth === 0) return index;
  }
  return -1;
}

function matchParenBackward(source, close) {
  let depth = 0;
  for (let index = close; index >= 0; index--) {
    if (source[index] === ')') depth++;
    else if (source[index] === '(' && --depth === 0) return index;
  }
  return -1;
}

// Splits a parameter or destructuring list on its top-level commas, carrying
// each part's offset so findings keep a real position.
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if ('([{<'.includes(char)) depth++;
    else if (')]}'.includes(char) || (char === '>' && text[index - 1] !== '=')) depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push({ text: text.slice(start, index), offset: start });
      start = index + 1;
    }
  }
  parts.push({ text: text.slice(start), offset: start });
  return parts;
}

// The locals a binding introduces: a plain identifier, or the names a one-level
// destructuring pattern creates. Nested patterns fall through unnamed.
function bindingNames(text, base) {
  const trimmed = text.trimStart();
  const lead = base + (text.length - trimmed.length);
  const open = trimmed[0];
  if (open === '{' || open === '[') {
    const close = matchBracket(trimmed, 0);
    if (close === -1) return [];
    const names = [];
    for (const part of splitTopLevel(trimmed.slice(1, close))) {
      const beforeDefault = part.text.split('=')[0];
      const colon = open === '{' ? beforeDefault.lastIndexOf(':') : -1;
      const tail = colon === -1 ? beforeDefault : beforeDefault.slice(colon + 1);
      const match = tail.match(/^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)\s*$/);
      if (match) names.push({ name: match[1], index: lead + 1 + part.offset + colon + 1 + tail.indexOf(match[1]) });
    }
    return names;
  }
  const match = trimmed.match(/^(?:\.\.\.)?([A-Za-z_$][\w$]*)/);
  return match ? [{ name: match[1], index: lead + match[0].length - match[1].length }] : [];
}

const FUNCTION_INITIALIZER =
  /^(?:async\s+)?(?:function\b|(?:\([^;]{0,300}?\)|<[^;]{0,100}?>\s*\([^;]{0,300}?\)|[A-Za-z_$][\w$]*)\s*(?::[^;=]{0,100})?=>)/;

// --- declaration harvesting -------------------------------------------------

// Every name the file declares, as { name, index, kind, isFunction }. Kinds are
// what the checks below key off; positions are offsets into the blanked source.
export function declarations(source) {
  const found = [];
  const seen = new Set();
  const add = (name, index, kind, isFunction = false) => {
    const key = `${name}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ name, index, kind, isFunction });
  };
  const addParams = (open) => {
    const close = matchBracket(source, open);
    if (close === -1) return;
    const inner = source.slice(open + 1, close);
    if (!inner.trim()) return;
    for (const part of splitTopLevel(inner)) {
      for (const entry of bindingNames(part.text, open + 1 + part.offset)) add(entry.name, entry.index, 'param');
    }
  };

  for (const match of source.matchAll(/\b(?:const|let|var)\s+/g)) {
    const after = match.index + match[0].length;
    const rest = source.slice(after, after + 2000);
    if (/^enum\b/.test(rest)) continue; // `const enum X` is an enum, not a binding
    const simple = rest.match(/^[A-Za-z_$][\w$]*\s*(?::[^=;]{0,200})?=\s*/);
    const isFunction = simple ? FUNCTION_INITIALIZER.test(rest.slice(simple[0].length, simple[0].length + 400)) : false;
    for (const entry of bindingNames(rest, after)) add(entry.name, entry.index, 'binding', isFunction);
  }

  for (const match of source.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g)) {
    const head = match[0].slice(0, -1);
    if (match[1]) add(match[1], match.index + head.lastIndexOf(match[1]), 'function', true);
    addParams(match.index + match[0].length - 1);
  }

  for (const match of source.matchAll(/\bcatch\s*\(/g)) addParams(match.index + match[0].length - 1);

  for (const match of source.matchAll(/=>/g)) {
    let cursor = match.index - 1;
    while (cursor >= 0 && /\s/.test(source[cursor])) cursor--;
    if (source[cursor] !== ')') {
      // Step over a return type annotation — `(value: string): Result => …`.
      let scan = cursor;
      while (scan >= 0 && /[\w$.<>|&[\] ]/.test(source[scan])) scan--;
      if (source[scan] === ':') {
        let before = scan - 1;
        while (before >= 0 && /\s/.test(source[before])) before--;
        if (source[before] === ')') cursor = before;
      }
    }
    if (source[cursor] === ')') {
      const open = matchParenBackward(source, cursor);
      if (open !== -1) addParams(open);
      continue;
    }
    const single = source.slice(0, cursor + 1).match(/([A-Za-z_$][\w$]*)$/);
    if (!single) continue;
    let before = cursor - single[1].length;
    while (before >= 0 && /\s/.test(source[before])) before--;
    // A bare single-param arrow only follows an opener; anything else is a type.
    if (before >= 0 && !'(,=;{[\n'.includes(source[before])) continue;
    add(single[1], cursor + 1 - single[1].length, 'param');
  }

  for (const match of source.matchAll(/\b(interface|type|class|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    if (/\bimport\s+$/.test(source.slice(Math.max(0, match.index - 10), match.index))) continue;
    const kind = match[1] === 'enum' ? 'enum' : match[1];
    add(match[2], match.index + match[0].lastIndexOf(match[2]), kind);
  }
  return found;
}

// --- checks -----------------------------------------------------------------

const kebab = (text) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();

// Framework spellings — Next.js dynamic segments, route groups, parallel slots,
// private folders — are stripped before the kebab test, not exempted from it.
const stripDecorations = (segment) =>
  segment
    .replace(/^[_+@]/, '')
    .replace(/^\((.*)\)$/, '$1')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/^-+|-+$/g, '');

function fileCaseFindings(path) {
  const segments = path.split('/').filter((segment) => segment && segment !== '.');
  const name = segments.pop();
  const out = [];
  for (const segment of segments) {
    if (segment.startsWith('.')) continue;
    const bare = stripDecorations(segment);
    if (bare && !KEBAB.test(bare)) {
      out.push({
        line: 1,
        rule: 'file-case',
        message: `directory "${segment}" is not lowercase kebab-case`,
        suggestion: kebab(segment),
      });
    }
  }
  const stem = name.split('.')[0];
  const bare = stripDecorations(stem);
  if (bare && !KEBAB.test(bare)) {
    out.push({
      line: 1,
      rule: 'file-case',
      message: `file "${name}" is not lowercase kebab-case`,
      suggestion: kebab(stem),
    });
  }
  return out;
}

function identifierFindings(source, isTypeScript, allowed, lists) {
  const out = [];
  for (const { name, index, kind, isFunction } of declarations(source)) {
    if (allowed(name)) continue;
    const line = lineOf(source, index);
    const word = lists.shortWords[name.toLowerCase()];
    if (VALUE_KINDS.has(kind)) {
      if (name.length === 1 && name !== '_' && name !== '$') {
        out.push({ line, rule: 'short-word', message: `"${name}" is a single letter`, suggestion: 'a whole word' });
      } else if (word) {
        out.push({ line, rule: 'short-word', message: `"${name}" is an abbreviation`, suggestion: word });
      }
    }
    if (NAMED_KINDS.has(kind) && kind !== 'param' && lists.noiseSuffix) {
      const noise = name.match(lists.noiseSuffix);
      if (noise && name !== noise[1]) {
        out.push({
          line,
          rule: 'noise-word',
          message: `"${name}" ends in the filler word "${noise[1]}"`,
          suggestion: `name what it is, without "${noise[1]}"`,
        });
      }
    }
    if (kind === 'enum' && isTypeScript) {
      out.push({
        line,
        rule: 'enum',
        message: `enum "${name}"`,
        suggestion: 'a string union, or a const object plus a derived type',
      });
    }
    if (TYPE_KINDS.has(kind) && /^[IT][A-Z]/.test(name)) {
      out.push({
        line,
        rule: 'type-prefix',
        message: `"${name}" carries a type-marker prefix`,
        suggestion: name.slice(1),
      });
    }
    if (kind === 'function' || (kind === 'binding' && isFunction)) {
      for (const [prefix, verb] of lists.synonyms) {
        if (!name.startsWith(prefix) || !/^[A-Z0-9_]|^$/.test(name.slice(prefix.length))) continue;
        const rest = name.slice(prefix.length);
        const suggestion = verb === 'to' ? `to${rest} or parse${rest}` : `${verb}${rest}`;
        out.push({ line, rule: 'verb-synonym', message: `"${name}" says ${prefix}, the repo says ${verb}`, suggestion });
        break;
      }
    }
  }
  return out;
}

// A `type:` discriminant is a warning, not a failure: the word is not wrong,
// it just collides with the language's own `type`.
function discriminantFindings(source, discriminant) {
  const out = [];
  if (!discriminant || discriminant === 'type') return out;
  for (const match of source.matchAll(/\b(?:interface|type)\s+[A-Za-z_$][\w$]*[^;{]*?\{/g)) {
    const open = match.index + match[0].length - 1;
    const close = matchBracket(source, open);
    if (close === -1) continue;
    for (const property of source.slice(open, close).matchAll(/(?:readonly\s+)?\btype\s*\??\s*:\s*['"`]/g)) {
      out.push({
        line: lineOf(source, open + property.index),
        rule: 'discriminant',
        message: 'a string-literal property named "type"',
        suggestion: discriminant,
      });
    }
  }
  return out;
}

function envFindings(source, allowed, lists) {
  const out = [];
  source.split('\n').forEach((text, offset) => {
    const match = text.match(/^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=/);
    if (!match || text.trimStart().startsWith('#')) return;
    const name = match[1];
    if (allowed(name)) return;
    const line = offset + 1;
    if (!ENV_NAME.test(name)) {
      out.push({
        line,
        rule: 'env-shape',
        message: `"${name}" is not UPPER_SNAKE_CASE`,
        suggestion: name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(),
      });
      return;
    }
    if (name.includes('_FOR_') && lists.envFor && !lists.envFor.test(name)) {
      const roles = lists.envRoles.join('|');
      out.push({
        line,
        rule: 'env-shape',
        message: `"${name}" does not read <SERVICE>_(${roles})_FOR_<CONSUMER>`,
        suggestion: `SERVICE_${lists.envRoles[0]}_FOR_CONSUMER`,
      });
    }
  });
  return out;
}

// --- entry points -----------------------------------------------------------

// `allow` in the config: one regex per entry, matched against an identifier, an
// env var name or a path. A match exempts it.
export function checkNaming({ root, files, config = loadNamingConfig(root), allow = config.allow ?? [] }) {
  const lists = toCheckLists(config);
  const patterns = allow.map((entry) => (entry instanceof RegExp ? entry : new RegExp(entry)));
  const allowed = (name) => patterns.some((pattern) => pattern.test(name));
  const failures = [];
  const warnings = [];

  for (const file of files) {
    const segments = file.split('/');
    const name = segments[segments.length - 1];
    if (segments.some((segment) => SKIP_SEGMENTS.has(segment)) || GENERATED.test(name)) continue;
    const path = join(root, file);
    if (!existsSync(path)) continue;
    // Findings are harvested per declaration kind; a reader wants them by line.
    const found = [];
    const collect = (findings) => found.push(...findings);
    const flush = () => {
      found.sort((left, right) => left.line - right.line);
      for (const finding of found) failures.push({ file, ...finding });
    };

    if (ENV_EXAMPLE.test(name)) {
      collect(envFindings(readFileSync(path, 'utf8'), allowed, lists));
      flush();
      continue;
    }
    const extension = extname(name);
    if (!CODE_EXTENSIONS.has(extension)) continue;

    const source = blankNoise(readFileSync(path, 'utf8'));
    const isTypeScript = extension === '.ts' || extension === '.tsx';
    if (!allowed(file)) collect(fileCaseFindings(file));
    collect(identifierFindings(source, isTypeScript, allowed, lists));
    flush();
    if (isTypeScript) {
      for (const finding of discriminantFindings(source, lists.discriminant)) warnings.push({ file, ...finding });
    }
  }
  return { failures, warnings };
}

const format = (level, { file, line, rule, message, suggestion }) =>
  `${level} ${file}:${line} ${rule}: ${message}${suggestion ? ` — use ${suggestion}` : ''}`;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function main(argv) {
  const files = (argv.length ? argv.join('\n') : readFileSync(0, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const root = process.cwd();
  const { failures, warnings } = checkNaming({ root, files });
  for (const finding of failures) console.log(format('FAIL', finding));
  for (const finding of warnings) console.log(format('WARN', finding));
  console.log(`naming: ${plural(failures.length, 'failure')}, ${plural(warnings.length, 'warning')} over ${plural(files.length, 'file')}`);
  return failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (failure) {
    console.error(failure.message);
    process.exit(1);
  }
}
