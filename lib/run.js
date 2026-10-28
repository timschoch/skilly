import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

// Shared process + prompt helpers for the skilly scripts.
export function run(cmd, args, { cwd, input, env } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    input,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : undefined,
  });
  if (result.error) throw new Error(`failed to run ${cmd}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  return result.stdout.trim();
}

// Like run, but returns null on failure instead of throwing.
export function tryRun(cmd, args, opts = {}) {
  try {
    return run(cmd, args, opts);
  } catch {
    return null;
  }
}

// headless auto-answers yes (nightly update, docs/update.mmd header).
export async function confirm(question, { headless = false } = {}) {
  if (headless) return true;
  if (!process.stdin.isTTY) throw new Error(`"${question}" needs a terminal — run locally or pass --headless`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}
