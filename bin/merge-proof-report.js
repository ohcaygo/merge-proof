#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalize, renderHtml } = require('../src/pilot-report');
const { printPdf } = require('../src/pdf');

const HELP = `merge-proof-report - render existing evidence, without recollecting it

Usage:
  node bin/merge-proof-report.js --input result.json --scope "Pilot scope" --out output/pilot

Required:
  --input <path>   CLI --json result or study/collect.js dataset.
  --scope <text>   Repository / candidate selection and known time-window limits.
  --out <prefix>   Writes <prefix>.html and <prefix>.pdf. Input is never overwritten.
Options:
  --repo <owner/name>  Filter a collector dataset to exactly this repository.
  --html-only         Explicitly skip PDF generation.
  --chrome <path>     Chrome/Chromium executable (or set CHROME_BIN).
  --help              Show this help.

Node >=18. HTML needs no dependencies. PDF needs locally installed Chrome/Chromium.
Exit 0 means the report was generated, not that its records are VERIFIED.
Invalid input or failed PDF export exits 1; errors never become evidence verdicts.
`;

async function main(argv) {
  try {
    const options = {};
    for (let i = 0; i < argv.length; i += 1) {
      const key = argv[i];
      if (key === '--help') { process.stdout.write(HELP); return 0; }
      if (key === '--html-only') { options.htmlOnly = true; continue; }
      if (!['--input', '--scope', '--out', '--repo', '--chrome'].includes(key)) throw new Error(`Unknown option: ${key}`);
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`);
      if (options[key.slice(2)] !== undefined) throw new Error(`Duplicate option: ${key}`);
      options[key.slice(2)] = value;
    }
    for (const key of ['input', 'scope', 'out']) {
      if (!options[key]?.trim()) throw new Error(`--${key} is required; use --help`);
    }
    const input = path.resolve(options.input);
    const prefix = path.resolve(options.out);
    const htmlPath = `${prefix}.html`;
    const pdfPath = `${prefix}.pdf`;
    // Resolve symlinks too, before creating or deleting any output.
    const realInput = fs.realpathSync(input);
    for (const output of [htmlPath, pdfPath]) {
      if (output === input || (fs.existsSync(output) && fs.realpathSync(output) === realInput)) {
        throw new Error('Output must not overwrite the JSON input');
      }
      if (fs.existsSync(output) && !fs.lstatSync(output).isFile()) throw new Error(`Output must be a regular file: ${output}`);
    }
    const bytes = fs.readFileSync(input);
    const model = normalize(JSON.parse(bytes), options);
    const html = renderHtml(model, {
      scope: options.scope,
      source: path.basename(input),
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
    fs.mkdirSync(path.dirname(prefix), { recursive: true });
    // Invalidate previous artifacts so a failed rerun cannot leave a stale PDF.
    fs.rmSync(pdfPath, { force: true });
    fs.writeFileSync(htmlPath, html);
    process.stdout.write(`HTML: ${htmlPath}\n`);
    if (!options.htmlOnly) {
      await printPdf(htmlPath, pdfPath, options.chrome);
      process.stdout.write(`PDF: ${pdfPath}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`merge-proof-report: ${error.message}\n`);
    return 1;
  }
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
module.exports = { main };
