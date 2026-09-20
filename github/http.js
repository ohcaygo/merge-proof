"use strict";
const { html } = require("./receipt");
const { assert } = require("./common");
const { page, script, interactive } = require("./public");
async function handle(service, req, res, url) {
  if (!url.pathname.startsWith("/proof/")) return false;
  const send = (status, data, type = "application/json") => {
    res.writeHead(status, { "Content-Type": type });
    res.end(type === "application/json" ? JSON.stringify(data) : data);
  };
  // Only same-origin scripts and the existing product mark are loaded; no source contents.
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; img-src ${new URL("/proof/brand-mark.png", service.config.origin).href}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  );
  try {
    const customers = service.customers;
    if (customers && req.method === "GET" && url.pathname === "/proof/login") {
      const login = customers.start(url.searchParams.get("source"));
      res.setHeader("Set-Cookie", login.cookie);
      res.writeHead(302, { Location: login.url });
      res.end();
      return true;
    }
    if (
      customers &&
      req.method === "GET" &&
      url.pathname === "/proof/callback"
    ) {
      try {
        res.setHeader("Set-Cookie", await customers.callback(req, url));
        res.writeHead(303, { Location: "/proof/?view=account" });
        res.end();
      } catch {
        res.writeHead(303, {
          Location: "/proof/?login=canceled-or-unavailable",
        });
        res.end();
      }
      return true;
    }
    if (req.method === "GET" && url.pathname === "/proof/") {
      send(
        200,
        customers ? require("./customer-public").renderPage(url) : page,
        "text/html; charset=utf-8",
      );
      return true;
    }
    if (req.method === "GET" && url.pathname === "/proof/brand-mark.png") {
      send(200, require("node:fs").readFileSync(require("node:path").join(__dirname, "../factory/public/ohcaygo-mark.png")), "image/png");
      return true;
    }
    if (req.method === "GET" && url.pathname === "/proof/app.js") {
      send(
        200,
        customers ? require("./customer-public").script : script,
        "application/javascript",
      );
      return true;
    }
    if (req.method === "GET" && url.pathname === "/proof/receipt.js") {
      send(200, script, "application/javascript");
      return true;
    }
    let raw = Buffer.alloc(0);
    if (req.method === "POST") {
      for await (const chunk of req) {
        raw = Buffer.concat([raw, chunk]);
        assert(raw.length <= 262144, "REQUEST_TOO_LARGE");
      }
      if (url.pathname === "/proof/webhook") {
        send(202, await service.webhook(raw, req.headers));
        return true;
      }
      if (url.pathname === "/proof/stripe-webhook" && service.billing) {
        await service.billing.webhook(raw, req.headers["stripe-signature"]);
        send(200, { received: true });
        return true;
      }
      if (url.pathname === "/proof/v1/decision") {
        assert(!req.headers.origin || req.headers.origin === service.config.origin, "ORIGIN_DENIED");
        assert(req.headers["content-type"]?.startsWith("application/json"), "INVALID_CONTENT_TYPE");
        const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
        assert(token, "ACCESS_DENIED");
        const input = require("./verify-cli").validateRequest(JSON.parse(raw));
        const client = service.clientFactory({ token });
        const repo = await client.authorize(input.repository, input.repositoryId);
        assert(repo.permissions?.push === true || repo.permissions?.admin === true, "ACCESS_DENIED");
        const sub = service.data.subscriptions[`${input.repositoryId}:${input.pr}`];
        if (service.meter) {
          assert(sub?.installationId && customers, "AUTHORIZED_INSTALLATION_REQUIRED");
          const installations = await customers.installations({ token });
          assert(installations.some(i => i.id === sub.installationId), "ACCESS_DENIED");
          const repositories = await customers.list({ token }, `/user/installations/${sub.installationId}/repositories`, "repositories");
          assert(repositories.some(r => r.id === input.repositoryId && r.full_name?.toLowerCase() === input.repository.toLowerCase()), "ACCESS_DENIED");
        }
        let out;
        const saved = service.data.receipts[sub?.latestReceiptId];
        if (saved && saved.artifacts?.policy?.codeDigest === require("./bundle").codeDigest() && ["github-exact-state-v2", "github-exact-state-v3"].includes(saved.receipt.policy))
          out = await service.read(saved.receipt.receiptId, token, { refresh: true });
        if (!out || out.current.state !== "CURRENT") out = await service.run(input.repository, input.pr, { client, installationId: sub?.installationId, mergeGroup: sub?.mergeGroup });
        send(200, require("./decision").decide(out.receipt, out.current, input, service.config.origin));
        return true;
      }
      // Browser writes require same origin; non-browser bearer calls have no ambient cookies.
      assert(
        customers
          ? req.headers.origin === service.config.origin
          : !req.headers.origin || req.headers.origin === service.config.origin,
        "ORIGIN_DENIED",
      );
      assert(
        req.headers["content-type"]?.startsWith("application/json"),
        "INVALID_CONTENT_TYPE",
      );
    }
    let token =
      req.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1] || null;
    if (req.method === "GET" && url.pathname === "/proof/v1/receipts") {
      assert(token, "ACCESS_DENIED");
      const repositoryId = Number(url.searchParams.get("repository_id")), commit = url.searchParams.get("commit");
      assert(Number.isSafeInteger(repositoryId) && require("./common").sha(commit), "INVALID_SCOPE");
      let records = require("./ledger").area(service.store).records.filter(r => r.repositoryId === repositoryId &&
        (r.mergeCommitSha === commit || service.data.landings[r.recordId]?.landed?.sha === commit));
      const archived=service.archive?.byCommit(repositoryId,commit)||[];
      for(const item of archived) if(!records.some(r=>r.recordId===item.record.recordId))records.push(item.record);
      const landedFor=r=>service.data.landings[r.recordId] || archived.filter(x=>x.record.recordId===r.recordId).sort((a,b)=>a.observation.recordedAt.localeCompare(b.observation.recordedAt)).at(-1)?.observation || {state:"LANDED_UNRESOLVED"};
      const pushes = Object.values(service.data.pushObservations).filter(p => p.repositoryId === repositoryId && p.commits.some(c => c.sha === commit));
      assert(records.length || pushes.length, "NOT_FOUND");
      await service.clientFactory({ token }).authorize((records[0] || pushes[0]).repository, repositoryId);
      if (service.meter) for (const r of [...records, ...pushes]) service.meter.account(r.installationId);
      send(200, { records: records.map(r => ({ receipt: r.proof?.receiptSnapshot || null, landed: landedFor(r) })),
        pushObservations: pushes.map(p => ({ observedAt: p.observedAt, ref: p.ref, commit: p.commits.find(c => c.sha === commit) })) });
      return true;
    }
    let session;
    if (customers) {
      session = customers.session(req);
      token = session.token;
      if (url.pathname === "/proof/logout" && req.method === "POST") {
        res.setHeader("Set-Cookie", customers.logout(req));
        send(200, { disconnected: true });
        return true;
      }
      if (url.pathname === "/proof/installations" && req.method === "GET") {
        const installations = await customers.installations(session);
        if (installations.length) customers.acquisition(session, "installation_available");
        send(200, {
          sessionExpiresAt: customers.session(req).expiresAt,
          installations: installations.map((i) => ({
            id: i.id,
            account: i.account.login,
          })),
          installUrl: service.config.installUrl || null,
        });
        return true;
      }
      if (url.pathname === "/proof/repositories" && req.method === "GET") {
        const id = Number(url.searchParams.get("installation"));
        assert(
          (await customers.installations(session)).some((i) => i.id === id),
          "ACCESS_DENIED",
        );
        const rows = await customers.list(
          session,
          `/user/installations/${id}/repositories`,
          "repositories",
        );
        send(200, {
          sessionExpiresAt: customers.session(req).expiresAt,
          repositories: rows.map((r) => ({ id: r.id, name: r.full_name })),
        });
        return true;
      }
      if (
        [
          "/proof/account",
          "/proof/run",
          "/proof/scan",
          "/proof/scan/cancel",
          "/proof/checkout",
          "/proof/portal",
          "/proof/quantity",
          "/proof/gate",
          "/proof/merges",
        ].includes(url.pathname)
      ) {
        const input = raw.length
          ? JSON.parse(raw)
          : Object.fromEntries(url.searchParams);
        const installationId = Number(input.installation),
          repositoryId = Number(input.repository);
        const { repo, installation } = await customers.repository(
          session,
          installationId,
          repositoryId,
        );
        if (url.pathname === "/proof/account" && req.method === "GET") {
          const receipts = Object.values(service.data.receipts)
            .filter(
              (r) =>
                r.installationId === installationId &&
                r.receipt.identity.repositoryId === repositoryId,
            )
            .slice(-30)
            .reverse()
            .map((r) => ({
              id: r.receipt.receiptId,
              pr: r.receipt.identity.pr,
              verdict: r.receipt.verdict,
              current:
                r.current.state === "STALE" ? "STALE" : "REFRESH_REQUIRED",
              issuedAt: r.receipt.issuedAt,
              remediation: service.remediationFor(r.receipt, { state: r.current.state === "STALE" ? "STALE" : "UNAVAILABLE" }),
              gate: r.gate
                ? { enforced: r.gate.enforced, conclusion: r.gate.conclusion }
                : null,
            }));
          const client = service.clientFactory({ token });
          const pulls = await client.get(
            `/repos/${repo.full_name}/pulls?state=open&per_page=30`,
          );
          service.watch(installationId,repositoryId,repo.full_name,pulls);
          const usage = service.meter.usage(installationId);
          service.save();
          let billingOwner = false;
          try {
            billingOwner = await customers.billingOwner(session, installation);
          } catch {}
          delete usage.used;
          if (!billingOwner) usage.activeDevelopers = [];
          send(200, {
            usage,
            trialStatus: require("./customer-view").trial(usage),
            inbox: require("./customer-view").inbox(service.data, service.config, installationId, repositoryId, pulls, usage, require("./policy").normalize(service.policyFor(repositoryId))),
            automation: require("./automation-status").status(service.data, installationId, repositoryId, pulls, usage),
            receipts,
            policy: require("./policy").normalize(
              service.policyFor(repositoryId),
            ),
            merges: require("./ledger").list(service.store, {
              installationId,
              repositoryId,
              limit: 10,
            }),
            billingOwner,
            pulls: pulls.map((p) => ({ number: p.number, title: p.title })),
            billingAvailable: !!service.billing,
          });
          return true;
        }
        // Required-merge-gate status and the repository's merge policy.
        if (url.pathname === "/proof/gate") {
          const setup = require("./setup");
          const policies = require("./policy");
          // Only a repository administrator can change whether Merge Proof
          // blocks a merge. Repository access alone is not that authority.
          const admin = repo.permissions?.admin === true;
          if (req.method === "POST") {
            assert(admin, "REPOSITORY_ADMIN_REQUIRED");
          }
          const client = await service.appClient(installationId, repositoryId);
          await client.authorize(repo.full_name, repositoryId);
          const status = await setup.observe(
            client,
            repo.full_name,
            repo.default_branch,
            service.config.appId,
          );
          if (req.method === "POST") {
            const chosen = policies.select(input.preset);
            assert(!chosen.enforced || service.meter.usage(installationId).plan === "PRO", "PAID_PRO_REQUIRED_FOR_GATE");
            assert(!chosen.enforced || status.readiness.state === "READY", "GATE_NOT_READY");
            service.setPolicy(repositoryId, input.preset, session.userId);
            await service.retractChecks(client, repositoryId);
          }
          send(200, {
            admin,
            enforcementAvailable: service.meter.usage(installationId).plan === "PRO",
            trialNotice: service.meter.usage(installationId).notice,
            policy: policies.normalize(service.policyFor(repositoryId)),
            presets: Object.values(policies.PRESETS).map((p) => ({
              id: p.id,
              label: p.label,
              description: p.description,
              enforced: p.enforced,
            })),
            status,
            instructions: setup.instructions(
              repo.full_name,
              repo.default_branch,
              status,
            ),
          });
          return true;
        }
        // Durable merge evidence record. A ledger, not a dashboard.
        if (url.pathname === "/proof/merges" && req.method === "GET") {
          const ledger = require("./ledger");
          const recordId = url.searchParams.get("record");
          if (recordId) {
            assert(/^[a-f0-9-]{36}$/.test(recordId), "NOT_FOUND");
            send(
              200,
              ledger.get(service.store, recordId, {
                installationId,
                repositoryId,
              }, service.archive),
            );
            return true;
          }
          send(
            200,
            ledger.list(service.store, {
              installationId,
              repositoryId,
              pr: Number(url.searchParams.get("pr")) || null,
              verdict: url.searchParams.get("verdict") || null,
              since: url.searchParams.get("since") || null,
              until: url.searchParams.get("until") || null,
              limit: url.searchParams.get("limit"),
            }),
          );
          return true;
        }
        if (url.pathname === "/proof/run" && req.method === "POST") {
          assert(
            Number.isSafeInteger(input.pr) && input.pr > 0,
            "INVALID_SCOPE",
          );
          const key = `${repositoryId}:${input.pr}`;
          service.data.subscriptions[key] = {
            ...service.data.subscriptions[key],
            repo: repo.full_name,
            repositoryId,
            installationId,
            pr: input.pr,
          };
          service.save();
          const client = await service.appClient(installationId, repositoryId);
          const out = await service.run(repo.full_name, input.pr, {
            client,
            installationId,
          });
          service.data.subscriptions[key].latestReceiptId =
            out.receipt.receiptId;
          service.save();
          customers.acquisition(session, "receipt_returned");
          send(201, {
            ...out,
            url: `/proof/receipts/${out.receipt.receiptId}`,
          });
          return true;
        }
        if (url.pathname === "/proof/scan") {
          const account = service.meter.account(installationId);
          if (req.method === "POST")
            service.startScan(installationId, repositoryId, repo.full_name);
          assert(
            !account.scan || account.scan.repositoryId === repositoryId,
            "SCAN_REPOSITORY_MISMATCH",
          );
          send(200, {
            scan: account.scan,
            bound:
              "Up to 5 merged PRs from the 30 most recently updated closed PRs. Unsupported history remains unavailable. This scan uses no live proofs.",
          });
          return true;
        }
        if (url.pathname === "/proof/scan/cancel" && req.method === "POST") {
          const scan = service.meter.account(installationId).scan;
          assert(
            scan && scan.repositoryId === repositoryId,
            "SCAN_REPOSITORY_MISMATCH",
          );
          if (scan.state === "RUNNING") scan.state = "CANCELED";
          service.save();
          send(200, { state: scan.state });
          return true;
        }
        if (
          ["/proof/checkout", "/proof/portal", "/proof/quantity"].includes(
            url.pathname,
          ) &&
          req.method === "POST"
        ) {
          // Paying-account owner only. Repository admin is not organization billing authority.
          assert(
            await customers.billingOwner(session, installation),
            "BILLING_OWNER_REQUIRED",
          );
          assert(service.billing, "BILLING_NOT_CONFIGURED");
          if (url.pathname === "/proof/quantity") {
            send(
              200,
              await service.billing.quantity(installationId, input.quantity),
            );
            return true;
          }
          send(
            200,
            url.pathname === "/proof/checkout"
              ? await service.billing.checkout(
                  installationId,
                  input.kind,
                  input.quantity,
                )
              : await service.billing.portal(installationId),
          );
          return true;
        }
      }
      const receiptId = url.pathname.match(
        /^\/proof\/receipts\/([a-f0-9-]{36})/,
      )?.[1];
      if (receiptId) {
        const row = service.data.receipts[receiptId];
        assert(row, "NOT_FOUND");
        await customers.repository(
          session,
          row.installationId,
          row.receipt.identity.repositoryId,
        );
      }
    }
    if (req.method === "POST" && url.pathname === "/proof/run") {
      const input = JSON.parse(raw);
      const out = await service.run(input.repo, input.pr, {
        token,
        publish: input.publish === true,
      });
      send(201, { ...out, url: `/proof/receipts/${out.receipt.receiptId}` });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/proof/.well-known/jwks.json") {
      assert(service.receiptSigner?.keys,"SIGNING_NOT_CONFIGURED");
      send(200,service.receiptSigner.keys);return true;
    }
    const bundleMatch = url.pathname.match(/^\/proof\/receipts\/([a-f0-9-]{36})\/bundle$/);
    if (bundleMatch && req.method === "GET") {
      const row = await service.access(bundleMatch[1], token);
      assert(row.artifacts, "HISTORICAL_BUNDLE_UNAVAILABLE");
      send(200, service.portable(row));
      return true;
    }
    const match = url.pathname.match(
      /^\/proof\/receipts\/([a-f0-9-]{36})(\/refresh)?$/,
    );
    if (
      match &&
      ((req.method === "GET" && !match[2]) ||
        (req.method === "POST" && match[2]))
    ) {
      const out = await service.read(match[1], token, {
        refresh: Boolean(match[2]),
      });
      const receiptRow = service.data.receipts[match[1]];
      const receiptUsage = customers ? service.meter.usage(receiptRow.installationId) : null;
      const notice = receiptUsage?.notice || "";
      if (customers) { out.entitlementNotice = notice; service.save(); }
      if (
        url.searchParams.get("format") === "json" ||
        (match[2] && url.searchParams.get("format") !== "html")
      )
        send(200, out);
      else
        send(
          200,
          interactive(require("./customer-brand").receipt(html(out.receipt, out.current, out.gate, out.remediation), require("./customer-view").presentation(receiptRow, require("./customer-view").context(service.data, service.config, receiptRow, receiptUsage, out.receipt.identity.prState === "open", require("./policy").normalize(service.policyFor(out.receipt.identity.repositoryId)))), receiptUsage ? require("./customer-view").trial(receiptUsage) : null))
            .replace('src="/proof/app.js"', 'src="/proof/receipt.js"')
            .replace('>Refresh current evidence</button>', '>Optional: recheck this historical receipt</button>')
            .replace(
              "</main>",
              `<p><a href="?format=json">Download JSON</a> · <a href="/proof/?view=account">Your account</a></p>${out.latestReceiptId && out.latestReceiptId !== out.receipt.receiptId && /^[a-f0-9-]{36}$/.test(out.latestReceiptId) ? `<p><a href="/proof/receipts/${out.latestReceiptId}">View latest receipt</a></p>` : ""}</main>`,
            ),
          "text/html; charset=utf-8",
        );
      return true;
    }
    send(404, { error: "NOT_FOUND" });
  } catch (e) {
    // Do not leak provider response, repository identity or token through errors.
    const safe = [
      "PROOF_BUSY",
      "LOGIN_REQUIRED",
      "ALLOWANCE_EXHAUSTED",
      "TRIAL_EXPIRED",
      "PAID_PRO_REQUIRED_FOR_GATE",
      "BILLING_NOT_CONFIGURED",
      "BILLING_OWNER_REQUIRED",
      "REVIEW_ACTIVE_DEVELOPERS",
      "CHECKOUT_PENDING",
      "SCAN_TASTE_ALREADY_RESERVED",
      "SCAN_BUSY",
      "SCAN_REPOSITORY_MISMATCH",
      "REPOSITORY_ADMIN_REQUIRED",
      "UNKNOWN_POLICY",
      "GATE_NOT_READY",
      "CHECK_RECONCILIATION_PENDING",
    ];
    if (req.method === "GET" && /^\/proof\/receipts\/[^/]+$/.test(url.pathname) && !url.searchParams.has("format") && (req.headers.accept || "").includes("text/html")) {
      send(403, require("./customer-brand").error(e.code === "LOGIN_REQUIRED" ? "Connect GitHub to view this receipt. Existing repository authorization is still required." : "This receipt could not be loaded with your current access. Check your connection and repository authorization, then retry."), "text/html; charset=utf-8");
      return true;
    }
    send(e.code === "PROOF_BUSY" ? 409 : 403, {
      error: safe.includes(e.code) ? e.code : "PROOF_UNAVAILABLE_OR_DENIED",
    });
  }
  return true;
}
module.exports = { handle };
