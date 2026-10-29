#!/usr/bin/env node
// Moved to the Engine: verify/check-push-branch.mjs. This old path runs it, see run-engine-script.mjs.
import { runEngineScript } from './run-engine-script.mjs';

runEngineScript('verify/check-push-branch.mjs', import.meta.url);
