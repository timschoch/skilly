import { createInterface } from 'node:readline/promises';

// The Hub's old verbs ask the person; the Engine never prompts.
// headless auto-answers yes (nightly update, docs/update.mmd header).
export async function confirm(question, { headless = false } = {}) {
  if (headless) return true;
  if (!process.stdin.isTTY) throw new Error(`"${question}" needs a terminal — run locally or pass --headless`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}
