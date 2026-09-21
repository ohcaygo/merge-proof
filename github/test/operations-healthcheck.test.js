"use strict";

const { test } = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ping, runFromEnvironment, outcomeForJobStatus } = require("../operations/healthcheck");
const monitor = require("../operations/monitor");
const { projectHealthchecks } = require("../operations/refresh-credentials");

const serviceUrl = "https://hc-ping.com/123e4567-e89b-12d3-a456-426614174000";
const backupUrl = "https://hc-ping.com/123e4567-e89b-12d3-a456-426614174001";

function response(status, body) {
  return { status, text: async () => body };
}

function fixture(t, { activityAt = Date.now(), backupAt = Date.now() - 10000, signing = "AVAILABLE" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-healthcheck-"));
  const stateDir = path.join(root, "state");
  fs.mkdirSync(stateDir);
  fs.writeFileSync(
    path.join(stateDir, "state.json"),
    JSON.stringify({ github: { lastActivityAt: activityAt, signingHealth: { state: signing } } }),
  );
  const backupRecord = path.join(root, "backup.json");
  fs.writeFileSync(
    backupRecord,
    JSON.stringify({ state: "RECOVERY_MANIFEST_CONFIRMED", snapshotAt: new Date(backupAt).toISOString() }),
  );
  const externalHealthFile = path.join(root, "healthchecks.json");
  const memoryInfoFile = path.join(root, "meminfo");
  fs.writeFileSync(externalHealthFile, JSON.stringify({ service: serviceUrl, backup: backupUrl }), { mode: 0o600 });
  fs.writeFileSync(memoryInfoFile, "MemTotal:       1000 kB\nMemAvailable:    500 kB\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, stateDir, backupRecord, externalHealthFile, memoryInfoFile };
}

test("Healthchecks URL and method validation rejects before I/O", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(200, "OK"); };
  for (const value of [
    "http://hc-ping.com/123e4567-e89b-12d3-a456-426614174000",
    "https://other.example/123e4567-e89b-12d3-a456-426614174000",
    "https://user:secret@hc-ping.com/123e4567-e89b-12d3-a456-426614174000",
    `${serviceUrl}?x=1`,
    `${serviceUrl}#fragment`,
    `${serviceUrl}/fail`,
    "https://hc-ping.com/not-a-uuid",
  ])
    await a.rejects(ping(value, { fetchImpl }), { code: "HEALTHCHECK_URL_INVALID" });
  await a.rejects(ping(serviceUrl, { method: "POST", fetchImpl }), { code: "HEALTHCHECK_METHOD_INVALID" });
  a.equal(calls, 0);
});

test("Healthchecks accepts only an exact OK body and sends a bare GET", async () => {
  let request;
  for (const body of ["OK (not found)", "OK (rate limited)"]) {
    const wrong = await ping(serviceUrl, {
      fetchImpl: async (url, init) => {
        request = { url, init };
        return response(200, body);
      },
    });
    a.deepEqual(wrong, { state: "FAILED", code: "HEALTHCHECK_RESPONSE_INVALID" });
  }
  a.equal(request.url, serviceUrl);
  a.equal(request.init.method, "GET");
  a.equal(request.init.redirect, "error");
  a.equal(request.init.headers, undefined);
  a.equal(request.init.body, undefined);
  const success = await ping(serviceUrl, { fetchImpl: async () => response(200, "OK") });
  a.deepEqual(success, { state: "RECEIVED" });
});

test("Healthcheck timeout and provider errors are bounded and redacted", async () => {
  const result = await ping(serviceUrl, {
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => await new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error(`secret ${serviceUrl}`), { name: "AbortError" })));
    }),
  });
  a.deepEqual(result, { state: "FAILED", code: "HEALTHCHECK_TIMEOUT" });
  a.doesNotMatch(JSON.stringify(result), /hc-ping|123e4567|secret/);
  await a.rejects(ping(serviceUrl, { timeoutMs: 5001, fetchImpl: async () => response(200, "OK") }), { code: "HEALTHCHECK_TIMEOUT_INVALID" });
  await a.rejects(ping(serviceUrl, { maxResponseBytes: 4097, fetchImpl: async () => response(200, "OK") }), { code: "HEALTHCHECK_RESPONSE_LIMIT_INVALID" });
  const oversized = await ping(serviceUrl, { maxResponseBytes: 2, fetchImpl: async () => response(200, "OK!") });
  a.deepEqual(oversized, { state: "FAILED", code: "HEALTHCHECK_RESPONSE_TOO_LARGE" });
  let cancelled = false, aborted = false;
  const streamed = await ping(serviceUrl, {
    maxResponseBytes: 2,
    fetchImpl: async (_url, init) => {
      init.signal.addEventListener("abort", () => { aborted = true; });
      return {
        status: 200,
        body: {
          getReader: () => ({
            read: async () => ({ done: false, value: Buffer.from("OK!") }),
            cancel: async () => { cancelled = true; },
            releaseLock: () => {},
          }),
        },
      };
    },
  });
  a.deepEqual(streamed, { state: "FAILED", code: "HEALTHCHECK_RESPONSE_TOO_LARGE" });
  a.equal(cancelled, true);
  a.equal(aborted, true);
});

test("lab heartbeat maps only success to the base URL and sends failure acknowledgement to /fail", async () => {
  a.equal(outcomeForJobStatus("success"), "success");
  for (const status of ["failure", "cancelled", undefined]) a.equal(outcomeForJobStatus(status), "fail");
  let request;
  const failed = await runFromEnvironment(
    { MP_LAB_HEALTHCHECK_URL: serviceUrl, JOB_STATUS: "failure" },
    async (url, init) => { request = { url, init }; return response(200, "OK (not found)"); },
  );
  a.deepEqual(failed, { state: "FAILED", code: "HEALTHCHECK_RESPONSE_INVALID" });
  a.equal(request.url, `${serviceUrl}/fail`);
  a.equal(request.init.method, "GET");
  const success = await runFromEnvironment(
    { MP_LAB_HEALTHCHECK_URL: serviceUrl, JOB_STATUS: "success" },
    async (url) => { request = { url }; return response(200, "OK"); },
  );
  a.deepEqual(success, { state: "RECEIVED" });
  a.equal(request.url, serviceUrl);
});

test("external monitor reports healthy only with fresh service, fresh confirmed backup and exact responses", async t => {
  const now = Date.now();
  const f = fixture(t, { activityAt: now, backupAt: now - 10000 });
  const calls = [];
  const out = await monitor.inspectExternal(
    f,
    now,
    async url => { calls.push(url); return { state: "RECEIVED" }; },
    { ownerUid: process.getuid() },
  );
  a.equal(out.externalHealth.state, "RECEIVED");
  a.equal(out.externalHealth.service.state, "RECEIVED");
  a.equal(out.externalHealth.backup.state, "RECEIVED");
  a.equal(calls.length, 2);
  a.doesNotMatch(JSON.stringify(out), /hc-ping|123e4567/);
});

test("stale backup and stalled proof send failure heartbeats without claiming health", async t => {
  const now = Date.now();
  const stale = fixture(t, { activityAt: now, backupAt: now - 901000 });
  const staleCalls = [];
  const staleOut = await monitor.inspectExternal(stale, now, async (url, init) => { staleCalls.push({ url, outcome: init.outcome }); return { state: "RECEIVED" }; }, { ownerUid: process.getuid() });
  a.equal(staleOut.externalHealth.state, "FAILED");
  a.equal(staleOut.externalHealth.backup.code, "HEALTHCHECK_BACKUP_NOT_READY");
  a.equal(staleOut.externalHealth.backup.signal, "RECEIVED");
  a.ok(staleOut.alarms.some(x => x.code === "EXTERNAL_HEALTH_BACKUP_FAILED"));
  a.equal(staleCalls.length, 2);
  a.deepEqual(staleCalls, [{ url: serviceUrl, outcome: "success" }, { url: backupUrl, outcome: "fail" }]);

  const stalled = fixture(t, { activityAt: now - 121000, backupAt: now - 10000 });
  const stalledCalls = [];
  const stalledOut = await monitor.inspectExternal(stalled, now, async (url, init) => { stalledCalls.push({ url, outcome: init.outcome }); return { state: "RECEIVED" }; }, { ownerUid: process.getuid() });
  a.equal(stalledOut.externalHealth.service.code, "HEALTHCHECK_SERVICE_NOT_READY");
  a.equal(stalledOut.externalHealth.service.signal, "RECEIVED");
  a.deepEqual(stalledCalls, [{ url: serviceUrl, outcome: "fail" }, { url: backupUrl, outcome: "success" }]);
});

test("critical storage health prevents a service heartbeat from looking healthy", async t => {
  const now = Date.now(), f = fixture(t, { activityAt: now, backupAt: now - 10000 });
  t.mock.method(fs, "statfsSync", () => ({ blocks: 100, bavail: 0, files: 100, ffree: 100 }));
  const calls = [];
  const out = await monitor.inspectExternal(f, now, async (url, init) => { calls.push({ url, init }); return { state: "RECEIVED" }; }, { ownerUid: process.getuid() });
  a.equal(out.externalHealth.service.state, "FAILED");
  a.equal(out.externalHealth.service.code, "HEALTHCHECK_SERVICE_NOT_READY");
  a.equal(out.externalHealth.service.signal, "RECEIVED");
  a.ok(out.alarms.some(x => x.code === "STORAGE_CAPACITY"));
  a.equal(calls[0].init.outcome, "fail");
});

test("missing or unsafe external configuration is explicit and never fakes health", async t => {
  const now = Date.now();
  const f = fixture(t, { activityAt: now, backupAt: now - 10000 });
  const missing = await monitor.inspectExternal({ stateDir: f.stateDir, backupRecord: f.backupRecord }, now, async () => { throw Error("must not call"); }, { ownerUid: process.getuid() });
  a.equal(missing.externalHealth.state, "NOT_CONFIGURED");
  a.equal(missing.externalHealth.service.state, "NOT_CONFIGURED");
  fs.chmodSync(f.externalHealthFile, 0o644);
  const unsafe = await monitor.inspectExternal(f, now, async () => { throw Error("must not call"); }, { ownerUid: process.getuid() });
  a.equal(unsafe.externalHealth.state, "UNAVAILABLE");
  a.equal(unsafe.externalHealth.service.code, "EXTERNAL_HEALTH_CONFIG_UNAVAILABLE");
  a.ok(unsafe.alarms.some(x => x.code === "EXTERNAL_HEALTH_CONFIG_UNAVAILABLE"));
  fs.chmodSync(f.externalHealthFile, 0o600);
  fs.writeFileSync(f.externalHealthFile, JSON.stringify({ service: serviceUrl, backup: serviceUrl }));
  const duplicate = await monitor.inspectExternal(f, now, async () => { throw Error("must not call"); }, { ownerUid: process.getuid() });
  a.equal(duplicate.externalHealth.state, "UNAVAILABLE");
  a.equal(duplicate.externalHealth.service.code, "EXTERNAL_HEALTH_CONFIG_UNAVAILABLE");
});

test("root refresh projection is private, separate and removable without exposing values", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp-healthcheck-projection-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  projectHealthchecks({ monitor: { healthchecks: { service: serviceUrl, backup: backupUrl } } }, root, process.getgid());
  const dir = path.join(root, "monitor"), file = path.join(dir, "healthchecks.json");
  a.equal(fs.statSync(dir).mode & 0o777, 0o700);
  a.equal(fs.statSync(file).mode & 0o777, 0o600);
  a.deepEqual(JSON.parse(fs.readFileSync(file)), { service: serviceUrl, backup: backupUrl });
  a.throws(
    () => projectHealthchecks({ monitor: { healthchecks: { service: "https://hc-ping.com/not-a-uuid", backup: backupUrl } } }, root, process.getgid()),
    { code: "HEALTHCHECK_URL_INVALID" },
  );
  a.throws(
    () => projectHealthchecks({ monitor: { healthchecks: { service: serviceUrl, backup: serviceUrl } } }, root, process.getgid()),
    { code: "HEALTHCHECK_URLS_DUPLICATED" },
  );
  a.deepEqual(JSON.parse(fs.readFileSync(file)), { service: serviceUrl, backup: backupUrl });
  projectHealthchecks({}, root, process.getgid());
  a.equal(fs.existsSync(file), false);
});

test("runtime and lab heartbeat controls preserve isolation and failure mapping", () => {
  const unit = fs.readFileSync(path.join(__dirname, "../operations/runtime/merge-proof-monitor.service"), "utf8");
  a.match(unit, /InaccessiblePaths=.*credentials\/proof .*credentials\/policy .*credentials\/backup/);
  a.match(unit, /ReadOnlyPaths=.*credentials\/monitor/);
  const workflow = fs.readFileSync(path.join(__dirname, "../operations/runtime/private-lab.yml"), "utf8");
  a.match(workflow, /if: always\(\)/);
  a.match(workflow, /MP_LAB_HEALTHCHECK_URL: \$\{\{ secrets\.MP_LAB_HEALTHCHECK_URL \}\}/);
  a.match(workflow, /JOB_STATUS: \$\{\{ job\.status \}\}/);
  a.match(workflow, /node product\/github\/operations\/healthcheck\.js/);
  a.doesNotMatch(workflow, /curl /);
});


test("memory uses MemAvailable and explicit capacity or collection states", async t => {
  const now = Date.now(), f = fixture(t, { activityAt: now, backupAt: now - 10000 });
  fs.writeFileSync(f.memoryInfoFile, "MemTotal:       1000 kB\nMemAvailable:    150 kB\nCached:          900 kB\n");
  let out = monitor.inspect({ stateDir: f.stateDir, backupRecord: f.backupRecord, memoryInfoFile: f.memoryInfoFile }, now);
  a.equal(out.memoryUsedPercent, 85);
  a.deepEqual(out.alarms.find(x => x.code === "MEMORY_CAPACITY"), { code: "MEMORY_CAPACITY", severity: "WARNING" });
  fs.writeFileSync(f.memoryInfoFile, "MemTotal:       1000 kB\nMemAvailable:     50 kB\nCached:          900 kB\n");
  out = monitor.inspect({ stateDir: f.stateDir, backupRecord: f.backupRecord, memoryInfoFile: f.memoryInfoFile }, now);
  a.deepEqual(out.alarms.find(x => x.code === "MEMORY_CAPACITY"), { code: "MEMORY_CAPACITY", severity: "CRITICAL" });
  out = monitor.inspect({ stateDir: f.stateDir, backupRecord: f.backupRecord, memoryInfoFile: path.join(f.root, "missing-meminfo") }, now);
  a.equal(out.memoryUsedPercent, null);
  a.ok(out.alarms.some(x => x.code === "MEMORY_METRICS_UNAVAILABLE"));
});

test("monitor validates its fixed log destination before I/O and publishes only redacted operational fields", async t => {
  const now = Date.now(), f = fixture(t, { activityAt: now, backupAt: now - 10000 }), aws = { accountId: "111111111111", region: "us-east-1" };
  fs.writeFileSync(path.join(f.stateDir, "state.json"), JSON.stringify({ github: { lastActivityAt: now, signingHealth: { state: "AVAILABLE" }, subscriptions: { fixture: { refreshState: "UNAVAILABLE" } } } }));
  t.mock.method(fs, "statfsSync", () => ({ blocks: 100, bavail: 50, files: 100, ffree: 50 }));
  const config = { environment: "nonproduction", stateDir: f.stateDir, backupRecord: f.backupRecord, memoryInfoFile: f.memoryInfoFile, aws, logs: { accountId: aws.accountId, region: aws.region, group: monitor.LOG_GROUP, stream: monitor.LOG_STREAM } };
  const calls = [], clientFactory = input => ({
    checkIdentity: async () => { calls.push({ service: "sts", operation: "get-caller-identity", input }); return {}; },
    call: async (service, operation, args) => { calls.push({ service, operation, args }); return {}; },
  });
  const out = await monitor.publish(config, clientFactory);
  a.equal(out.state, "WARNING");
  const metrics = JSON.parse(calls.find(x => x.operation === "put-metric-data").args[3]);
  a.deepEqual(metrics.map(x => x.MetricName), ["RecoveryBackupAgeSeconds", "StorageUsedPercent", "MemoryUsedPercent", "WarningHealth", "CriticalHealth"]);
  a.equal(metrics.find(x => x.MetricName === "WarningHealth").Value, 1);
  const event = JSON.parse(calls.find(x => x.operation === "put-log-events").args[5])[0];
  a.deepEqual(Object.keys(JSON.parse(event.message)).sort(), ["alarms", "at", "externalHealth", "memoryUsedPercent", "recoveryBackupAgeSeconds", "schema", "state", "storageUsedPercent"]);
  a.doesNotMatch(event.message, /mp-healthcheck|stateDir|backupRecord|hc-ping|secret|repository/i);
  a.deepEqual(calls.filter(x => x.service === "logs").map(x => x.operation), ["create-log-stream", "put-log-events"]);

  let network = 0, inspected = 0;
  const noIo = () => { network++; throw Error("must not connect"); };
  const inspectNever = async () => { inspected++; throw Error("must not inspect"); };
  await a.rejects(monitor.publish({ ...config, logs: { ...config.logs, group: "/other" } }, noIo, inspectNever), { code: "MONITOR_LOG_DESTINATION_INVALID" });
  await a.rejects(monitor.publish({ ...config, aws: { accountId: undefined, region: config.aws.region }, logs: { ...config.logs, accountId: undefined } }, noIo, inspectNever), { code: "MONITOR_LOG_DESTINATION_INVALID" });
  await a.rejects(monitor.publish({ ...config, aws: { accountId: config.aws.accountId, region: "eu-west-1" }, logs: { ...config.logs, region: "eu-west-1" } }, noIo, inspectNever), { code: "MONITOR_LOG_DESTINATION_INVALID" });
  a.equal(network, 0);a.equal(inspected, 0);

  await a.rejects(monitor.publish(config, () => ({ checkIdentity: async () => {}, call: async (_service, operation) => { if (operation === "put-log-events") throw Object.assign(Error("denied"), { providerCode: "AccessDeniedException" }); return {}; } })), { providerCode: "AccessDeniedException" });
  await a.rejects(monitor.publish(config, () => ({ checkIdentity: async () => {}, call: async (_service, operation) => operation === "put-log-events" ? { rejectedLogEventsInfo: { tooNewLogEventStartIndex: 0 } } : {} })), { code: "MONITOR_LOG_DELIVERY_REJECTED" });

  const safeResult = JSON.parse(JSON.stringify(out)), maliciousCalls = [];
  const privateClient = () => ({ checkIdentity: async () => { maliciousCalls.push("identity"); }, call: async (_service, operation) => { maliciousCalls.push(operation); return {}; } });
  for(const altered of [{ ...safeResult, alarms: [{ code: "EXFILTRATE_SECRET", severity: "WARNING" }] }, { ...safeResult, externalHealth: { state: "PRIVATE_URL", service: { state: "RECEIVED" }, backup: { state: "RECEIVED" } } }]){
    maliciousCalls.length=0;
    await a.rejects(monitor.publish(config, privateClient, async () => altered), { code: "MONITOR_LOG_EVENT_INVALID" });
    a.ok(!maliciousCalls.includes("put-log-events"));
  }
});
