# Early Access daily health procedure

Status: **manual procedure established; automation proposed but not enabled**. This is Early Access operations, not L3 production scheduling or retention acceptance.

Run once per day using the existing SSH identity. Record only aggregates; never print customer, repository, receipt, token, credential, or Healthchecks endpoint values.

## Manual check

### 1. Runtime identity and service

```sh
ssh -i ~/.ssh/merge-proof-factory root@161.35.59.206 '
  readlink -f /opt/merge-proof/current
  cat /opt/merge-proof/current/DEPLOYED_COMMIT
  systemctl is-active merge-proof
  systemctl show merge-proof -p NRestarts -p ActiveEnterTimestamp
  systemctl --failed --no-legend --plain
  journalctl -q -u merge-proof --since "24 hours ago" -p warning --no-pager
'
```

Require the approved release/SHA, `active`, no unexplained restart increase, no failed unit, and no unexplained warning-or-higher entry.

### 2. Queue, reconciliation, and subscription health

Read `/etc/merge-proof/pro.json` only on the host to locate `stateDir`; never print the config. Parse `state.json` and report:

- `queue`, `landingQueue`, `groupQueue`, `retractionQueue`, and `pushQueue` depth;
- `deliveryHealth` and age from `deliveryScanAt`;
- counts by subscription `refreshState`;
- retained `landingRetries` counts separately from the active landing queue.

Require all five queues to drain, `deliveryHealth === "RECONCILED"`, delivery age no more than five hours, and no `UNAVAILABLE` subscription. Retained landing retries at the bounded three-attempt limit are historical when the active landing queue is empty; do not call them active work. Stop if a queue remains nonzero across two observations 10 minutes apart or a subscription becomes `UNAVAILABLE`.

### 3. Backup and restore age

Require the newest off-host backup set to:

- be no more than 24 hours old;
- match SHA-256 on production and off-host storage;
- contain both production state roots and, beside the archive, the authoritative source mirror;
- restore into a new mode-0700 scratch directory;
- parse both state files;
- replay every replay-capable archive row as `CONSISTENT_OFFLINE`;
- list legacy `UNSUPPORTED` rows privately;
- have zero parse or replay failures;
- pass `git fsck --full` and exact `main` commit/tree checks for the mirror.

Never open restored state as a writer or replace production. Restored currentness remains `NOT_PROVEN`.

### 4. Capacity and public boundary

Require disk below 70% and inspect `MemAvailable`. Confirm `/`, `/proof/examples/verified`, `/proof/examples/fail`, and `/proof/examples/not-proven` return 200. Confirm a known real private receipt and replay route still return 403 anonymously without logging the identifier.

### 5. Healthchecks

Inspect the production-scoped service and recovery-backup checks. Require a fresh successful ping inside their configured grace period. The September checks were attached to the bounded nonproduction L3 monitor and its timer was deliberately disabled; they do not establish continuous production coverage. Until Ryan authorizes production-scoped pings, record this line as `NOT_PROVEN` and continue the manual procedure.

## Stop conditions

Stop invitations and investigate on inactive service, unexpected restart increase, failed unit, unexplained warning log, stuck queue, subscription `UNAVAILABLE`, delivery not `RECONCILED` or older than five hours, backup older than 24 hours, hash/restore/replay failure, disk at or above 70%, access-control regression, or failed/stale production heartbeat.

## Proposed automation — not installed or enabled

Reuse the existing production host and Healthchecks account. Do not create another provider or monitoring platform. Before installation, Ryan must confirm whether the existing two checks may be reassigned to production; otherwise obtain two production-scoped ping URLs under separate authority.

Proposed root-only inputs:

- `/etc/merge-proof/early-access-health.json` mode `0600`: state/deployed-commit/backup-record paths, exact release SHA/tree, five-hour delivery limit, 24-hour backup limit, and the separate Healthchecks file path.
- `/etc/merge-proof/early-access-healthchecks.json` mode `0600`: private service and backup ping URLs.
- `/var/lib/merge-proof/ops-health/latest-backup.json` mode `0600`: latest archive timestamp, production/off-host matching SHA-256 values, mirror commit/tree, and restore result. No receipt IDs.

Exact non-secret configuration shape:

```json
{
  "unit": "merge-proof",
  "stateFile": "/var/lib/merge-proof/pro-live/state.json",
  "deployedCommitFile": "/opt/merge-proof/current/DEPLOYED_COMMIT",
  "expectedSourceCommit": "b31215adadfb29718069155ad0954aebde8b2c70",
  "expectedSourceTree": "fb65a74958defc88f8db239781670901a2614036",
  "backupRecord": "/var/lib/merge-proof/ops-health/latest-backup.json",
  "healthchecksFile": "/etc/merge-proof/early-access-healthchecks.json",
  "deliveryMaxAgeSeconds": 18000,
  "backupMaxAgeSeconds": 86400
}
```

Proposed service:

```ini
[Unit]
Description=Merge-Proof Early Access daily health
After=network-online.target merge-proof.service
Wants=network-online.target

[Service]
Type=oneshot
User=root
Group=root
WorkingDirectory=/opt/merge-proof/current
ExecStart=/usr/bin/node /usr/local/libexec/merge-proof-early-access-health.js /etc/merge-proof/early-access-health.json
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/var/lib/merge-proof /etc/merge-proof /opt/merge-proof
```

Proposed timer:

```ini
[Unit]
Description=Daily Merge-Proof Early Access health schedule

[Timer]
OnCalendar=*-*-* 09:00:00 America/Chicago
RandomizedDelaySec=5m
Persistent=true
Unit=merge-proof-early-access-health.service

[Install]
WantedBy=timers.target
```

The proposed implementation is retained, inactive, at [`proposals/early-access-health.js`](proposals/early-access-health.js), with the exact [service](proposals/merge-proof-early-access-health.service) and [timer](proposals/merge-proof-early-access-health.timer) files. It automates the required service, restart, warning-log, queue, delivery, subscription, backup-age, restore-result, and Healthchecks signals and emits only aggregate JSON. Capacity and access-control probes remain explicit manual checks. Configuration absence, malformed state, network error, or stale evidence exits nonzero and sends failure where possible.

Exact activation commands, **not run**:

```sh
install -m 0755 github/operations/proposals/early-access-health.js /usr/local/libexec/merge-proof-early-access-health.js
install -m 0644 github/operations/proposals/merge-proof-early-access-health.service /etc/systemd/system/merge-proof-early-access-health.service
install -m 0644 github/operations/proposals/merge-proof-early-access-health.timer /etc/systemd/system/merge-proof-early-access-health.timer
install -m 0600 early-access-health.json /etc/merge-proof/early-access-health.json
install -m 0600 early-access-healthchecks.json /etc/merge-proof/early-access-healthchecks.json
systemctl daemon-reload
systemctl enable --now merge-proof-early-access-health.timer
```

No script, configuration, unit, timer, or ping was installed or enabled by this proposal.
