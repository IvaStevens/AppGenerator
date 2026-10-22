#!/usr/bin/env node
// Executable shim. No logic lives here - it delegates to src/cli.js and
// must not swallow errors.

import { main } from "../src/cli.js";

const code = await main();
process.exitCode = code;
