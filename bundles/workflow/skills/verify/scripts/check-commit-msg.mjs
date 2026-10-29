#!/usr/bin/env node
// Moved to the Engine: verify/check-commit-msg.mjs. This old path runs it, see run-engine-script.mjs.
import { runEngineScript } from './run-engine-script.mjs';

runEngineScript('verify/check-commit-msg.mjs', import.meta.url);
