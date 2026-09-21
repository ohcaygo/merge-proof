"use strict";
// Hosted presentation only. These projections never collect evidence, write
// state, evaluate policy, or change canonical API verdict/currentness values.
const {escape} = require("./receipt");
const {specialize} = require("./wording");
function trial(usage) {
  if (!usage) return {label:"Account status unavailable", detail:"Return to your account to check hosted access."};
  const end = usage.trial?.endsAt, days=Number.isSafeInteger(usage.trialDays)&&usage.trialDays>0?usage.trialDays:7;
  if (usage.plan === "PRO") return {label:"Paid Pro active", detail:"Hosted access is active for the verified subscription period. $29/month per active developer."};
  if (usage.plan === "TRIAL" && end) return {label:"Trial active", detail:`Your ${days}-day report-only trial expires at ${end}. No automatic charge at expiry.`};
  if (usage.plan === "PAUSED") return {label:end ? "Trial expired — hosted access paused" : "Hosted access paused", detail:`${end ? "Your " + days + "-day trial expired at " + end + ". " : ""}New proofs, re-proofs and scans pause. Existing receipts remain accessible with current repository authorization, within retention and capacity limits. Continue Pro for $29/month per active developer. No automatic charge at trial expiry. Existing required checks may still affect merging; Merge Proof never changes GitHub rules.`};
  if (usage.plan === "AWAITING_FIRST_PROOF") return {label:"Trial not started", detail:`Your ${days}-day report-only trial starts with your first CURRENT, collection-complete VERIFIED or NOT_PROVEN hosted proof. Incomplete or unavailable collection, FAIL, stale results, installation and historical scans do not start the clock. No card required.`};
  return {label:"Account status unavailable", detail:"Refresh account information to check your access. No active trial or payment is inferred."};
}
function context(data, config, row, usage, open, policy = null) {
  const r=row.receipt, matches=x=>x.installationId===row.installationId&&x.repositoryId===r.identity.repositoryId&&x.pr===r.identity.pr;
  const sub=Object.values(data.subscriptions||{}).find(matches);
  const jobs=(data.queue||[]).filter(matches);
  const tracked=Boolean(sub&&config.appId&&config.privateKey&&config.webhookSecret&&open);
  return {usage,tracked,jobs,sub,open,policy,delivery:row.checkDelivery};
}
function operation(c={}) {
  if (c.usage?.automationAllowed===false) return {state:"PAUSED",text:"Automatic collection is paused. Paid access is needed to resume hosted work; existing GitHub requirements still apply."};
  if (c.jobs?.length) return {state:c.jobs.some(j=>j.attempts||j.retryAt)?"RETRYING":"CHECKING",text:c.jobs.some(j=>j.attempts||j.retryAt)?"An automatic retry is queued. Completion and Check delivery depend on provider access, evidence and capacity.":"Checking current evidence: a collection is queued or running. No new result is established yet."};
  if (c.sub?.refreshState==="UNAVAILABLE") return {state:"ATTENTION",text:"Automatic collection exhausted its retries. No recovery is queued. Resolve the evidence or access issue, then use optional manual recovery; later relevant activity may also trigger another attempt."};
  if (c.delivery === "UNAVAILABLE") return {state:"DELIVERY_UNAVAILABLE",text:"GitHub Check delivery is unavailable. No recovery is queued in this view; inspect the receipt and contact support if delivery remains unavailable."};
  if (c.tracked) return {state:"EVENT_DRIVEN",text:"No re-check is queued. Merge Proof will check again when it receives relevant authorized PR activity. It cannot repair conflicts, provider restrictions or unsupported history; missed events are not guaranteed to be replayed."};
  return {state:"UNCONFIRMED",text:"Automatic re-check is not confirmed for this PR in this view. Check repository access and the PR's open state; use manual recovery only when needed."};
}
function explanation(r) {
  const s=r.summary||{}, gaps=new Set(r.gaps||[]);
  const failed=(s.ci?.required||[]).find(x=>x.state==="FAILED"&&["failure","timed_out","cancelled","action_required","startup_failure"].includes(x.conclusion));
  if(failed) return {explanation:`Required check “${failed.name}” did not succeed on the observed validation state. Other evidence gaps may also remain.`,action:"Open the failed check in GitHub, resolve its reported cause, then rerun the required validation on the applicable version."};
  if(s.approval?.reason==="CHANGES_REQUESTED_OBSERVED")return {explanation:"A changes-requested review was observed. Other evidence gaps may also remain.",action:"Open this PR in GitHub and address the changes-requested review."};
  if(r.verdict==="VERIFIED"&&!(r.gaps||[]).length&&r.freshness?.state==="CURRENT")return {explanation:"The supported evidence claims were sufficiently established for the recorded version at observation. This is not a bug-free guarantee or a current permission to merge.",action:"No action needed for the recorded evidence claims. Check the separate freshness and merge-impact statements before relying on them now."};
  if(r.verdict==="NOT_PROVEN"&&gaps.has("NO_REQUIRED_VALIDATION_CONFIGURED")&&gaps.size===1) {
    const wording=specialize("NO_REQUIRED_VALIDATION_CONFIGURED",r);
    return {explanation:wording.plain,action:wording.doNext};
  }
  const conflict=r.identity?.githubMergeable===false&&r.identity?.githubMergeState==="dirty";
  if(conflict)return {explanation:"GitHub reported merge conflicts at this observation. Merge Proof could not establish the applicable combined-state evidence."+((gaps.has("INCOMPLETE_GIT_METADATA")||gaps.has("GIT_HISTORY_UNAVAILABLE"))?" Git comparison evidence was incomplete.":"")+(gaps.has("RULES_UNAVAILABLE")?" Branch requirements could not be read.":""),action:"Open this PR in GitHub and resolve the reported conflicts. Inspect the evidence limits in the receipt; repeated refreshes do not fix unchanged comparison limits or provider restrictions."};
  if(gaps.has("INCOMPLETE_GIT_METADATA")||gaps.has("GIT_HISTORY_UNAVAILABLE"))return {explanation:"Merge Proof could not complete the Git history/comparison evidence needed for this observation.",action:"Inspect the missing Git evidence in the receipt. Use full local history to investigate the comparison; the local verifier does not replace unavailable hosted rules/check evidence. Repeated refreshes alone are not an established fix."};
  if(gaps.has("RULES_UNAVAILABLE"))return {explanation:"The applicable repository requirements could not be established; unknown requirements do not mean no requirements.",action:"Ask the repository owner or support to diagnose the unavailable rules read using the receipt details. Reinstalling or granting a permission is not an established fix."};
  const gap=[...gaps][0], wording=gap?specialize(gap,r):null;
  return {explanation:wording?.plain||"The available evidence does not establish the required claims. This does not mean the code is broken.",action:wording?.doNext||"Inspect the missing evidence in this receipt before relying on it. No specific fix is established."};
}
function result(r) {
  // Machine verdict is the answer; evidence explains it without renaming it.
  return {...explanation(r),label:r.verdict||"No observation available"};
}
function presentation(row,c={}) {
  const r=row.receipt, saved=row.current||r.freshness||{state:"UNAVAILABLE"};
  const answer=result(r), automation=operation(c);
  const stale=saved.state==="STALE";
  const freshness=stale?"Out of date":saved.state==="CURRENT"?"Current at last observation — not rechecked now":"Currentness unavailable";
  const freshnessDetail=stale?"Code or evidence changed, or a newer observation superseded this receipt. Its original verdict remains unchanged.":saved.state==="CURRENT"?"This is a saved observation, not a live all-clear. Silence and worker completion do not establish current evidence.":"Available evidence cannot establish that this receipt applies to the current merge state.";
  const gate=c.policy||row.gate;
  const mergeImpact=!gate?"Merge impact unknown: this view has no established Merge Proof policy result.":!gate.enforced?"Merge Proof is report-only. Its result does not block merging; GitHub conflicts and other repository requirements still apply.":"An enforcing Merge Proof policy is configured. Whether GitHub currently blocks or allows this merge depends on the required check and its delivered result; this saved observation does not establish that live state.";
  return {id:r.receiptId,repository:r.identity.repository,pr:r.identity.pr,verdict:r.verdict,label:answer.label,freshness, freshnessDetail,observedAt:r.issuedAt,currentnessObservedAt:saved.asOf||null,explanation:answer.explanation,nextAction:stale?(c.jobs?.length?"Wait for the queued check to complete before relying on this outdated observation. Its underlying evidence gaps may still need action.":"Review the reported evidence gap and automatic re-check status. If no new relevant activity is expected, use optional manual recovery after resolving the gap."):answer.action,mergeImpact,automation};
}
function inbox(data,config,installationId,repositoryId,pulls,usage,policy=null) {
  const open=new Set(pulls.map(p=>p.number));
  const rows=Object.values(data.receipts||{}).filter(x=>x.installationId===installationId&&x.receipt.identity.repositoryId===repositoryId)
    .sort((a,b)=>Date.parse(b.receipt.issuedAt)-Date.parse(a.receipt.issuedAt)||b.receipt.receiptId.localeCompare(a.receipt.receiptId));
  const groups=new Map();
  for(const row of rows){const pr=row.receipt.identity.pr;const view=presentation(row,context(data,config,row,usage,open.has(pr),policy));if(!groups.has(pr))groups.set(pr,{...view,title:pulls.find(p=>p.number===pr)?.title||null,history:[]});else groups.get(pr).history.push(view);}
  for(const p of pulls)if(!groups.has(p.number)){
    const row={installationId,receipt:{identity:{repositoryId,repository:p.base?.repo?.full_name||p.head?.repo?.full_name||"Selected repository",pr:p.number}}};
    const op=operation(context(data,config,row,usage,true,policy));
    groups.set(p.number,{id:null,repository:row.receipt.identity.repository,pr:p.number,title:p.title,verdict:null,label:op.state==="CHECKING"||op.state==="RETRYING"?"Checking current evidence":"No observation available",freshness:"Not established",freshnessDetail:"No saved receipt establishes this PR's merge evidence.",observedAt:"No observation yet",explanation:"Collection progress is separate from evidence validity.",nextAction:op.state==="CHECKING"?"Wait for the queued collection; no result is established yet.":"Check the automatic collection status below before using optional manual recovery.",mergeImpact:policy?.enforced?"An enforcing policy is configured. Check the required GitHub result; no receipt in this view establishes its live state.":"No proof result is established. GitHub requirements still apply.",automation:op,history:[]});
  }
  return [...groups.values()];
}
function summaryHtml(view,heading="h2") {
  return `<${heading}>${escape(view.label)}</${heading}><p>${escape(view.explanation)}</p><p class="proof-badges"><span class="badge">Verdict: ${escape(view.label)}</span> <span class="badge">Freshness: ${escape(view.freshness)}</span></p><p><strong>Merging:</strong> ${escape(view.mergeImpact)}</p><p><strong>Next action:</strong> ${escape(view.nextAction)}</p><p><strong>Automatic re-check:</strong> ${escape(view.automation.text)}</p><p class="small">Observed: ${escape(view.observedAt)}${view.currentnessObservedAt?" · Currentness last checked: "+escape(view.currentnessObservedAt):""}. ${escape(view.freshnessDetail)}</p>`;
}
function trialHtml(value) {return `<aside class="trial-status" aria-label="Trial and hosted access"><h2>${escape(value.label)}</h2><p>${escape(value.detail)}</p><a href="/proof/?view=account#billing">Account / Continue Pro</a></aside>`;}
module.exports={trial,context,operation,result,presentation,inbox,summaryHtml,trialHtml};
