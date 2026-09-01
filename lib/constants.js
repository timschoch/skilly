import { homedir } from 'node:os';
import { join } from 'node:path';

// Pinned: `add` output is unparseable and exit codes lie — the lock file is the only truth.
export const SKILLS_CLI_VERSION = '1.5.23';
export const HUB_REPO = 'timschoch/skilly';

// Personal tool, one machine: `skilly setup` reads the App key from this path.
export const SKILLY_APP_ID = '4778931';
export const SKILLY_APP_PEM = join(homedir(), 'repo', '.skilly', 'skilly-app.pem');
