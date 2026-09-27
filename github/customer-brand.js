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
.proof-page .receipt-subject{padding-bottom:18px;border-bottom:0!important}
.proof-page .receipt-subject>.eyebrow{margin-bottom:0}
.proof-page .merge-truth{padding-top:18px;padding-bottom:36px}
.proof-page .merge-truth>h1{margin-bottom:12px}
.proof-page .merge-truth>.eyebrow{margin:0 0 8px}
.proof-page .merge-truth-lede{font-size:clamp(1.2rem,2.6vw,1.55rem);line-height:1.35;margin:0 0 10px;max-width:760px}
.proof-page .merge-truth-context{margin:0 0 24px;color:#d9dadd;max-width:800px}
.proof-page .merge-truth-comparison{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 24px}
.proof-page .truth-side{padding:16px;border:1px solid var(--line);border-radius:6px;background:var(--panel)}
.proof-page .truth-side>small,.proof-page .truth-side>strong{display:block}.proof-page .truth-side>strong{margin-top:6px;overflow-wrap:anywhere}
.proof-page .evidence-chain{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;list-style:none;margin:0;padding:0}
.proof-page .chain-stage{min-width:0;margin:0;padding:16px 14px;border:1px solid var(--line);border-top:3px solid #887025;border-radius:6px;background:var(--panel)}
.proof-page .chain-stage.good{border-top-color:#467557}.proof-page .chain-stage.bad{border-top-color:#9c4848}
.proof-page .chain-label{display:flex;align-items:center;gap:7px;margin:0 0 12px;color:var(--muted);font-size:.72rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
.proof-page .chain-label span{display:grid;place-items:center;width:22px;height:22px;border:1px solid #61646b;border-radius:50%;font:600 .7rem ui-monospace,monospace;color:#f6f6f4}
.proof-page .chain-state{display:inline-block;margin:0 0 12px;padding:3px 7px;border:1px solid #61646b;border-radius:4px;font:650 .7rem ui-monospace,monospace;text-transform:uppercase}
.proof-page .chain-stage.good .chain-state{border-color:#467557;color:#91dcad}.proof-page .chain-stage.bad .chain-state{border-color:#9c4848;color:#ffb0b0}
.proof-page .chain-stage>strong{display:block;line-height:1.35;overflow-wrap:anywhere}
.proof-page .chain-stage>p:not(.chain-label):not(.chain-state){margin:8px 0;color:#d9dadd;font-size:.82rem;line-height:1.45}
.proof-page .chain-stage>small{display:block;font-size:.72rem;line-height:1.4}
.proof-page .replay-packet-action{display:flex;align-items:center;gap:16px;margin:20px 0;padding:16px;border:1px solid var(--line);background:var(--panel)}
.proof-page .replay-packet-action>a{display:inline-block;white-space:nowrap;padding:10px 14px;border-radius:6px;background:#f6f6f4;color:#15161a;font-weight:700;text-decoration:none}
.proof-page .replay-packet-action p{margin:0;color:var(--muted);font-size:.92rem;line-height:1.45}
.proof-page .reconciliation-status{margin:18px 0 8px;padding:16px 18px;border:1px solid var(--line);border-left:3px solid #887025;background:var(--panel);border-radius:4px}
.proof-page .reconciliation-status.good{border-left-color:#467557}
.proof-page .reconciliation-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 6px}
.proof-page .reconciliation-heading span{color:var(--muted);font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.proof-page .reconciliation-heading strong{font:650 .76rem ui-monospace,monospace;text-transform:uppercase}
.proof-page .reconciliation-status>p:not(.reconciliation-heading){margin:0 0 4px;color:#d9dadd}
.proof-page .reconciliation-status>small{display:block;line-height:1.45}
.proof-page .independent-verification-status{margin:18px 0 8px;padding:20px;border:1px solid var(--line);border-left:3px solid #887025;background:var(--panel);border-radius:4px}
.proof-page .independent-verification-status.good{border-left-color:#467557}.proof-page .independent-verification-status.bad{border-left-color:#9c4848}
.proof-page .independent-verification-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 8px;color:var(--muted);font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.proof-page .independent-verification-heading strong{font:650 .76rem ui-monospace,monospace}.proof-page .independent-verification-status h2{margin:0 0 6px;font-size:1.25rem}
.proof-page .independent-verification-status>p{margin:6px 0}.proof-page .independent-verification-count{color:#f6f6f4;font-size:1.05rem}.proof-page .independent-verification-status>small{display:block;line-height:1.5;margin-top:10px}
.proof-page .independent-verification-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.proof-page .independent-verification-grid article{padding:18px;border:1px solid var(--line);border-top:3px solid #467557;border-radius:6px;background:var(--panel)}
.proof-page .independent-verification-grid h3{margin:0 0 8px;font-size:1rem}.proof-page .independent-verification-grid strong{display:block;color:#91dcad;font:650 .78rem ui-monospace,monospace;overflow-wrap:anywhere}.proof-page .independent-verification-grid p{font-size:.86rem;color:#d9dadd}
.proof-page .independent-verification-command{padding:16px;background:var(--panel);border:1px solid var(--line)}.proof-page .independent-verification-details{margin:32px 0;padding-top:18px}.proof-page .independent-verification-details>summary{font-size:1.05rem}
.proof-page .independent-verification-machine{margin:20px 0}.proof-page .independent-verification-table-wrap{overflow-x:auto}.proof-page .independent-verification-table{width:100%;border-collapse:collapse}.proof-page .independent-verification-table th,.proof-page .independent-verification-table td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top}.proof-page .independent-verification-table code{font-size:.76rem;overflow-wrap:anywhere}
.proof-page .merge-truth-details{margin-top:18px}
.proof-page .merge-truth-details h3{margin-top:22px}
.proof-page .evaluated-evidence{margin-top:8px;padding:28px 0 10px}
.proof-page .evaluated-evidence>h2{margin-bottom:10px}
[hidden]{display:none!important}
@media(max-width:800px){.proof-page .evidence-chain{grid-template-columns:1fr}.proof-page .chain-stage{display:grid;grid-template-columns:minmax(90px,.55fr) 1.45fr;column-gap:14px}.proof-page .chain-label,.proof-page .chain-state{align-self:start}.proof-page .chain-stage>strong,.proof-page .chain-stage>p:not(.chain-label):not(.chain-state),.proof-page .chain-stage>small{grid-column:2}.proof-page .chain-stage>strong{grid-row:1}.proof-page .chain-state{grid-row:2}.proof-page .chain-stage>p:not(.chain-label):not(.chain-state){grid-row:2;margin-top:30px}.proof-page .chain-stage>small{grid-row:3}.proof-page .replay-packet-action{align-items:flex-start;flex-direction:column}.proof-page .independent-verification-grid{grid-template-columns:1fr}}
@media(max-width:600px){.proof-page main,.proof-page footer{padding-left:20px;padding-right:20px}.proof-page .site-header{padding:20px;gap:14px}.proof-page .site-header nav{font-size:.8rem}.proof-page .proof-intro{padding-top:32px}.proof-page .trial-card{padding:20px}.proof-page .primary{width:100%;text-align:center}.proof-page label{display:block}.proof-page select{display:block;width:100%;margin-top:8px}.proof-page dl{grid-template-columns:1fr}.proof-page dd{margin-bottom:12px}.proof-page .merge-truth-comparison{grid-template-columns:1fr}.proof-page .chain-stage{grid-template-columns:1fr}.proof-page .chain-label,.proof-page .chain-state,.proof-page .chain-stage>strong,.proof-page .chain-stage>p:not(.chain-label):not(.chain-state),.proof-page .chain-stage>small{grid-column:1;grid-row:auto}.proof-page .chain-stage>p:not(.chain-label):not(.chain-state){margin-top:8px}.proof-page .reconciliation-heading,.proof-page .independent-verification-heading{align-items:flex-start;flex-direction:column;gap:4px}.proof-page .independent-verification-table thead{display:none}.proof-page .independent-verification-table tr,.proof-page .independent-verification-table td{display:block}.proof-page .independent-verification-table tr{padding:10px 0}.proof-page .independent-verification-table td{border:0;padding:3px 0}}
.proof-page .proof-badges{display:flex;gap:10px;flex-wrap:wrap}.proof-page .trial-status{margin:24px 0}.proof-page #receipts h3{font-size:1.3rem}.proof-page #receipts details li{border:0;padding:8px 0}.proof-page .manual-controls{padding:12px 0}.proof-page #run{background:var(--panel);color:#f6f6f4;border:1px solid var(--line);font-weight:600}
@media print{body.proof-page{background:white;color:black}.proof-page .site-header,.proof-page button{display:none}.proof-page :is(p,small,dt,a){color:black}.proof-page .policy,.proof-page aside{background:white}}
`;
const header = `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="/" aria-label="OHCAYGO Merge Proof home"><img src="/proof/brand-mark.png" width="48" height="48" alt=""><span>OHCAYGO<small>MERGE PROOF</small></span></a><nav aria-label="Product navigation"><a href="/">Merge Proof home</a><a href="/proof/">Trial information</a><a href="/proof/?view=account">Connected repositories</a></nav></header>`;
function receipt(document, view = null, trial = null, mergeTruth = null, independentVerification = null) {
  if(view) {
    const ui=require("./customer-view");
    const esc=require("./receipt").escape;
    const independentHtml=mergeTruth?.references?.replayPacket
      ? require("./independent-verification-view").summaryHtml(independentVerification,{detailUrl:`/proof/receipts/${mergeTruth.evaluated.receiptId}/independent-verification`},esc)
      : "";
    const primary=mergeTruth
      ? `<header class="receipt-subject"><p class="eyebrow">${esc(view.repository)} · PR #${view.pr}</p></header>${require("./merge-truth").html(mergeTruth,esc,ui.evidenceSummaryHtml(view),independentHtml)}`
      : `<header><p class="eyebrow">${esc(view.repository)} · PR #${view.pr}</p>${ui.summaryHtml(view,"h1")}</header>`;
    const technicalLabel=mergeTruth?"Raw technical evidence and machine verdict":"Technical evidence and machine verdict";
    document=document.replace(/<main>([\s\S]*?)<\/main>/, (_, original) => `<main>${primary}${trial?ui.trialHtml(trial):""}<details><summary>${technicalLabel}: ${esc(view.verdict)}</summary>${original}</details></main>`);
  }
  return document.replace(/<style>[\s\S]*?<\/style>/, `<style>${css}</style><body class="brand-page proof-page">${header}`)
    .replace('<main>', '<main id="main">')
    .replace('</html>', '</body></html>');
}
function error(message) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Merge Proof · Connection needed</title><style>${css}</style><body class="brand-page proof-page">${header}<main id="main"><header class="proof-intro"><p class="eyebrow">HOSTED MERGE PROOF</p><h1>Receipt unavailable</h1></header><p role="status">${message}</p><p><a class="primary" href="/proof/?view=account">Connect / return to your account</a></p><p><a href="/proof/">Back to trial information</a></p></main></body></html>`;
}
module.exports = {css, header, receipt, error};
