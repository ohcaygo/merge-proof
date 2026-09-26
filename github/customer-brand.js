"use strict";
const fs = require("node:fs"), path = require("node:path");
// Reuse the published homepage's tokens, typography, lockup and components.
// Inline CSS preserves the hosted renderer's restrictive style policy.
const css = fs.readFileSync(path.join(__dirname, "../factory/public/brand.css"), "utf8") + `
*{box-sizing:border-box}
body.proof-page{margin:0;font-size:16px;line-height:1.6;color-scheme:dark}
.proof-page main,.proof-page footer{max-width:1040px;margin:auto;padding:0 40px}
.proof-page .site-header{max-width:1040px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;flex-wrap:wrap}
.proof-page .brand{text-decoration:none;font-weight:800}
.proof-page .site-header nav{flex-wrap:wrap;gap:12px 24px}
.proof-page .proof-intro{padding:48px 0 28px}
.proof-page h1{font-size:clamp(2.4rem,6vw,4rem);line-height:1.05;margin:0 0 22px}
.proof-page h2{font-size:clamp(1.5rem,3vw,2rem);margin:0 0 20px}
.proof-page section{padding:32px 0;border-top:1px solid var(--line)}
.proof-page .trial-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:28px}
.proof-page button,.proof-page select,.proof-page input{font:inherit;max-width:100%;min-height:44px;border:1px solid #61646b;border-radius:5px;background:var(--panel);color:#f6f6f4;padding:10px 16px}
.proof-page button{cursor:pointer;margin:6px 8px 6px 0}
.proof-page button:hover{border-color:var(--gold)}
.proof-page .primary,.proof-page #run,.proof-page #subscribe{display:inline-flex;justify-content:center;align-items:center;background:var(--gold);color:var(--ink);padding:16px 22px;min-height:54px;border:0;border-radius:5px;text-decoration:none;font-weight:800}
.proof-page .primary:hover,.proof-page #run:hover,.proof-page #subscribe:hover{background:#ffd153}
.proof-page button:disabled,.proof-page select:disabled{opacity:.55;cursor:default}
.proof-page :is(a,button,select,input,summary):focus-visible{outline:3px solid var(--gold);outline-offset:5px}
.proof-page label{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.proof-page select{min-width:200px}
.proof-page pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.875rem}
.proof-page #status,.proof-page .policy,.proof-page aside{padding:16px 20px;background:var(--panel);border-left:3px solid var(--gold);border-radius:4px}
.proof-page #status{margin:24px 0}
.proof-page details{border-top:1px solid var(--line);margin-top:18px}
.proof-page summary{font-weight:650}
.proof-page li{margin:12px 0;overflow-wrap:anywhere}
.proof-page #receipts{padding:0;list-style:none}
.proof-page #receipts>li{padding:20px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}
.proof-page p,.proof-page a{overflow-wrap:anywhere}
.proof-page footer{padding-top:32px;padding-bottom:40px;color:var(--muted)}
.proof-page small,.proof-page dt{color:var(--muted)}
.proof-page dl{display:grid;grid-template-columns:1fr 1.3fr;gap:10px}
.proof-page dd{margin:0;overflow-wrap:anywhere}
.proof-page .blocks,.proof-page .reported{padding:3px 7px;border:1px solid var(--line);border-radius:4px;font-size:.75rem}
.proof-page .blocks{background:#7a1f1f;color:white}
.proof-page .reported{background:var(--panel)}
.proof-page main>header:not(.proof-intro){padding:32px 0;border-bottom:1px solid var(--line)}
[hidden]{display:none!important}
@media(max-width:600px){.proof-page main,.proof-page footer{padding-left:20px;padding-right:20px}.proof-page .site-header{padding:20px;gap:14px}.proof-page .site-header nav{font-size:.8rem}.proof-page .proof-intro{padding-top:32px}.proof-page .trial-card{padding:20px}.proof-page .primary{width:100%;text-align:center}.proof-page label{display:block}.proof-page select{display:block;width:100%;margin-top:8px}.proof-page dl{grid-template-columns:1fr}.proof-page dd{margin-bottom:12px}}
.proof-page .proof-badges{display:flex;gap:10px;flex-wrap:wrap}.proof-page .trial-status{margin:24px 0}.proof-page #receipts h3{font-size:1.3rem}.proof-page #receipts details li{border:0;padding:8px 0}.proof-page .manual-controls{padding:12px 0}.proof-page #run{background:var(--panel);color:#f6f6f4;border:1px solid var(--line);font-weight:600}
@media print{body.proof-page{background:white;color:black}.proof-page .site-header,.proof-page button{display:none}.proof-page :is(p,small,dt,a){color:black}.proof-page .policy,.proof-page aside{background:white}}
`;
const header = `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="/" aria-label="OHCAYGO Merge Proof home"><img src="/proof/brand-mark.png" width="48" height="48" alt=""><span>OHCAYGO<small>MERGE PROOF</small></span></a><nav aria-label="Product navigation"><a href="/">Merge Proof home</a><a href="/proof/">Trial information</a><a href="/proof/?view=account">Connected repositories</a></nav></header>`;
function receipt(document, view = null, trial = null, mergeTruth = null) {
  if(view) {
    const ui=require("./customer-view");
    document=document.replace(/<main>([\s\S]*?)<\/main>/, (_, original) => `<main><header><p class="eyebrow">${require("./receipt").escape(view.repository)} · PR #${view.pr}</p>${ui.summaryHtml(view,"h1")}</header>${trial?ui.trialHtml(trial):""}${mergeTruth?require("./merge-truth").html(mergeTruth,require("./receipt").escape):""}<details><summary>Technical evidence and machine verdict: ${require("./receipt").escape(view.verdict)}</summary>${original}</details></main>`);
  }
  return document.replace(/<style>[\s\S]*?<\/style>/, `<style>${css}</style><body class="brand-page proof-page">${header}`)
    .replace('<main>', '<main id="main">')
    .replace('</html>', '</body></html>');
}
function error(message) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Merge Proof · Connection needed</title><style>${css}</style><body class="brand-page proof-page">${header}<main id="main"><header class="proof-intro"><p class="eyebrow">HOSTED MERGE PROOF</p><h1>Receipt unavailable</h1></header><p role="status">${message}</p><p><a class="primary" href="/proof/?view=account">Connect / return to your account</a></p><p><a href="/proof/">Back to trial information</a></p></main></body></html>`;
}
module.exports = {css, header, receipt, error};
