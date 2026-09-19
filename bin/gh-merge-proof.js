#!/usr/bin/env node
"use strict";
require("../github/verify-cli").main(process.argv.slice(2).filter((x, i) => i !== 0 || x !== "verify")).then(code => { process.exitCode = code; }).catch(() => { console.error("NOT_PROVEN: decision unavailable"); process.exitCode = 9; });
