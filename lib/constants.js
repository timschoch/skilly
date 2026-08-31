import { homedir } from 'node:os';
import { join } from 'node:path';

// Pinned: `add` output is unparseable and exit codes lie (docs/research/skills-cli-surface.md).
export const SKILLS_CLI_VERSION = '1.5.23';
export const HUB_REPO = 'timschoch/skilly';

// Personal tool, one machine (docs/spec-v1.md, `skilly onboard`).
export const SKILLY_APP_ID = '4778931';
export const SKILLY_APP_PEM = join(homedir(), 'repo', '.skilly', 'skilly-app.pem');
