"use strict";

// Proposal only. This file is not wired into any production unit or timer.
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { execFileSync, spawnSync } = require("node:child_process");

let endpoints;

function absolute(value, code) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw Error(code);
  return value;
}

function queueDepth(value) {
  return Array.isArray(value) ? value.length : Object.keys(value || {}).length;
}

function command(file, args) {
  return execFileSync(file, args, { encoding: "utf8" }).trim();
}

function signal(base, ok) {
  return new Promise((resolve, reject) => {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.hostname !== "hc-ping.com") {
      reject(Error("HEALTHCHECK_URL_INVALID"));
      return;
    }
    if (!ok) url.pathname = `${url.pathname.replace(/\/$/, "")}/fail`;
    const request = https.get(url, { timeout: 10_000 }, (response) => {
      response.resume();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(Error("HEALTHCHECK_PING_FAILED"));
        return;
      }
      resolve();
    });
    request.on("timeout", () => request.destroy(Error("HEALTHCHECK_TIMEOUT")));
    request.on("error", reject);
  });
}

async function main() {
  const configFile = absolute(process.argv[2], "CONFIG_REQUIRED");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  endpoints = JSON.parse(fs.readFileSync(absolute(config.healthchecksFile, "HEALTHCHECKS_FILE_REQUIRED"), "utf8"));
  const state = JSON.parse(fs.readFileSync(absolute(config.stateFile, "STATE_FILE_REQUIRED"), "utf8"));
  const backup = JSON.parse(fs.readFileSync(absolute(config.backupRecord, "BACKUP_RECORD_REQUIRED"), "utf8"));
  const expectedSourceCommit = config.expectedSourceCommit;
  const expectedSourceTree = config.expectedSourceTree;
  if (!/^[a-f0-9]{40}$/.test(expectedSourceCommit || "") || !/^[a-f0-9]{40}$/.test(expectedSourceTree || "")) {
    throw Error("EXPECTED_SOURCE_INVALID");
  }
  const deployedCommit = fs.readFileSync(absolute(config.deployedCommitFile, "DEPLOYED_COMMIT_FILE_REQUIRED"), "utf8").trim();
  const unit = config.unit || "merge-proof";
  const now = Date.now();
  const github = state.github || {};
  const deliveryAt = Number(github.deliveryScanAt);
  const backupAt = Date.parse(backup.backupAt);
  const warnings = command("journalctl", ["-q", "-u", unit, "--since", "24 hours ago", "-p", "warning", "--output=json"])
    .split("\n")
    .filter(Boolean).length;
  const failedUnits = command("systemctl", ["--failed", "--no-legend", "--plain"])
    .split("\n")
    .filter(Boolean).length;
  const restarts = Number(command("systemctl", ["show", unit, "-p", "NRestarts", "--value"]));
  const queues = Object.fromEntries(
    ["queue", "landingQueue", "groupQueue", "retractionQueue", "pushQueue"].map((name) => [name, queueDepth(github[name])]),
  );
  const refreshStates = Object.values(github.subscriptions || {}).reduce((out, row) => {
    const key = row.refreshState || "UNKNOWN";
    out[key] = (out[key] || 0) + 1;
    return out;
  }, {});
  const activeResult = spawnSync("systemctl", ["is-active", unit], { encoding: "utf8" });
  const service = {
    active: activeResult.status === 0 && activeResult.stdout.trim() === "active",
    releaseMatches: deployedCommit === expectedSourceCommit,
    restarts,
    failedUnits,
    warningLogs24h: warnings,
    queues,
    deliveryHealth: github.deliveryHealth || null,
    deliveryAgeSeconds: Number.isFinite(deliveryAt) ? Math.floor((now - deliveryAt) / 1000) : null,
    subscriptionRefreshStates: refreshStates,
  };
  const serviceOk =
    service.active &&
    service.releaseMatches &&
    restarts === 0 &&
    failedUnits === 0 &&
    warnings === 0 &&
    Object.values(queues).every((value) => value === 0) &&
    service.deliveryHealth === "RECONCILED" &&
    Number.isFinite(service.deliveryAgeSeconds) &&
    service.deliveryAgeSeconds <= config.deliveryMaxAgeSeconds &&
    !refreshStates.UNAVAILABLE;
  const backupStatus = {
    ageSeconds: Number.isFinite(backupAt) ? Math.floor((now - backupAt) / 1000) : null,
    result: backup.result || null,
    hashMatches:
      /^[a-f0-9]{64}$/.test(backup.archiveSha256 || "") &&
      backup.archiveSha256 === backup.offHostArchiveSha256,
    mirrorMatches:
      backup.mirrorCommit === expectedSourceCommit &&
      backup.mirrorTree === expectedSourceTree,
  };
  const backupOk =
    Number.isFinite(backupStatus.ageSeconds) &&
    backupStatus.ageSeconds <= config.backupMaxAgeSeconds &&
    backupStatus.result === "RESTORE_VERIFIED_WITH_LEGACY_UNSUPPORTED" &&
    backupStatus.hashMatches &&
    backupStatus.mirrorMatches;
  const signals = await Promise.allSettled([
    signal(endpoints.service, serviceOk),
    signal(endpoints.backup, backupOk),
  ]);
  const output = {
    schema: "merge-proof-early-access-health/v1",
    at: new Date(now).toISOString(),
    state: serviceOk && backupOk && signals.every((row) => row.status === "fulfilled") ? "HEALTHY" : "CRITICAL",
    service,
    backup: backupStatus,
    externalHealth: {
      service: signals[0].status === "fulfilled" ? "RECEIVED" : "FAILED",
      backup: signals[1].status === "fulfilled" ? "RECEIVED" : "FAILED",
    },
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (output.state !== "HEALTHY") process.exitCode = 2;
}

main().catch(async (error) => {
  if (endpoints) {
    await Promise.allSettled([signal(endpoints.service, false), signal(endpoints.backup, false)]);
  }
  process.stderr.write(`${error.code || error.message || "EARLY_ACCESS_HEALTH_FAILED"}\n`);
  process.exitCode = 2;
});
