'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');

function findChrome(explicit) {
  if (explicit || process.env.CHROME_BIN) return explicit || process.env.CHROME_BIN;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ...['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].flatMap(
      (name) => (process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, name))),
    ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).map((dir) => path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe')),
  ];
  const found = candidates.find((file) => fs.existsSync(file));
  if (!found) throw new Error('PDF export needs Chrome/Chromium. Install it or set CHROME_BIN; use --html-only for HTML.');
  return found;
}

async function printPdf(htmlPath, pdfPath, chrome) {
  const executable = findChrome(chrome);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-proof-pdf-'));
  const temporaryPdf = path.join(temp, 'report.pdf');
  const ownProcessGroup = process.platform !== 'win32';
  let browser;
  let closed;
  try {
    browser = spawn(executable, [
      '--headless', '--disable-gpu', '--disable-background-networking',
      '--disable-component-update', '--disable-extensions', '--disable-background-mode',
      '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${path.join(temp, 'profile')}`, '--no-pdf-header-footer',
      `--print-to-pdf=${temporaryPdf}`, pathToFileURL(htmlPath).href,
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, detached: ownProcessGroup });
    closed = new Promise((resolve) => browser.once('close', resolve));
    let stderr = '';
    browser.stderr.on('data', (data) => { stderr = (stderr + data).slice(-1200); });
    // Some Chrome builds stay alive after printing. Wait for a complete file,
    // not browser shutdown, then close only our temporary-profile process.
    const bytes = await new Promise((resolve, reject) => {
      const finish = (error, data) => {
        clearInterval(poll);
        clearTimeout(timeout);
        if (error) reject(error); else resolve(data);
      };
      const readComplete = () => {
        if (!fs.existsSync(temporaryPdf)) return null;
        const data = fs.readFileSync(temporaryPdf);
        return data.length > 100 && data.subarray(0, 5).toString() === '%PDF-'
          && /%%EOF\s*$/.test(data.subarray(-128).toString()) ? data : null;
      };
      const poll = setInterval(() => {
        try { const data = readComplete(); if (data) finish(null, data); }
        catch (error) { finish(error); }
      }, 250);
      const timeout = setTimeout(() => finish(new Error('Chrome did not finish a PDF within 60 seconds')), 60000);
      browser.once('error', (error) => finish(error));
      browser.once('close', (code, signal) => {
        try {
          const data = readComplete();
          if (code === 0 && data) finish(null, data);
          else finish(new Error(`browser exit ${code}, signal ${signal || 'none'}; ${stderr}`));
        } catch (error) { finish(error); }
      });
    });
    fs.writeFileSync(pdfPath, bytes);
  } catch (error) {
    throw new Error(`PDF export failed: ${error.message}. HTML remains available; check --chrome / CHROME_BIN.`);
  } finally {
    // Chrome descendants can retain stderr after the parent exits, preventing
    // ChildProcess.close forever. Terminate only the group created by this
    // invocation; never signal a user's existing Chrome process or profile.
    if (browser?.pid && (ownProcessGroup || browser.exitCode === null && browser.signalCode === null)) {
      const terminate = signal => {
        try {
          if (ownProcessGroup) process.kill(-browser.pid, signal);
          else browser.kill(signal);
        } catch (error) { if (error.code !== 'ESRCH') throw error; }
      };
      terminate('SIGTERM');
      const forceClose = setTimeout(() => terminate('SIGKILL'), 2000);
      await closed;
      clearTimeout(forceClose);
    }
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

module.exports = { printPdf };
