"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { isIP } = require("node:net");
const { timingSafeEqual } = require("node:crypto");
const { ensure } = require("./common");
const { Store } = require("./store");
const { Stripe } = require("./stripe");
const { GitHub } = require("./github");
const { Runner } = require("./runner");
const { Factory } = require("./service");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
};
function loadConfig() {
  const file = process.env.FACTORY_CONFIG;
  const c = file ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const config = {
    mode: "test",
    origin: "http://127.0.0.1:4318",
    stateDir: path.resolve(__dirname, "../.factory-state"),
    ...c,
  };
  for (const [name, key] of Object.entries({
    STRIPE_SECRET_KEY: "stripeSecret",
    STRIPE_WEBHOOK_SECRET: "webhookSecret",
    STRIPE_PAYMENT_LINK_ID: "paymentLinkId",
    STRIPE_PRICE_ID: "priceId",
    FACTORY_ORIGIN: "origin",
    FACTORY_STATE_DIR: "stateDir",
  }))
    if (process.env[name]) config[key] = process.env[name];
  ensure(["test", "live"].includes(config.mode), "INVALID_CONFIG");
  const url = new URL(config.origin);
  ensure(config.origin === url.origin, "INVALID_CONFIG");
  ensure(
    url.protocol === "https:" ||
      (config.mode === "test" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)),
    "HTTPS_REQUIRED",
  );
  if (config.stripeSecret)
    ensure(
      ["sk", "rk"].some((kind) =>
        config.stripeSecret.startsWith(`${kind}_${config.mode}_`),
      ),
      "WRONG_PAYMENT_MODE",
    );
  return config;
}
function createProofRuntime(config, store, appConfig) {
  if (!appConfig) return null;
  let proofStore = store;
  if (appConfig.hosted) {
    ensure(typeof appConfig.stateDir === "string" && path.isAbsolute(appConfig.stateDir), "PRO_STATE_REQUIRED");
    ensure(path.resolve(appConfig.stateDir) !== path.resolve(config.stateDir), "SEPARATE_PRO_STATE_REQUIRED");
    const billing = appConfig.billing;
    if (billing) {
      ensure(["test", "live"].includes(billing.mode), "WRONG_PAYMENT_MODE");
      ensure(["sk", "rk"].some(kind => billing.stripeSecret?.startsWith(`${kind}_${billing.mode}_`)), "WRONG_PAYMENT_MODE");
    }
    proofStore = new Store(appConfig.stateDir);
  }
  try {
    const service = new (require("../github/service").ProofService)({store: proofStore, config: {...appConfig, origin: config.origin}});
    if (service.meter && appConfig.billing) {
      service.billing = new (require("../github/billing").Billing)(service, {...appConfig.billing, origin: config.origin});
      proofStore.save();
    }
    return service;
  } catch (error) {
    if (proofStore !== store) proofStore.close();
    throw error;
  }
}
function createServer(factory, proofService = null) {
  const rates = new Map();
  const config = factory.config;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://buy.stripe.com",
    );
    const send = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const cookie = (token) =>
      res.setHeader(
        "Set-Cookie",
        `mp_access=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${config.origin.startsWith("https:") ? "; Secure" : ""}`,
      );
    try {
      if (config.proxySecret) {
        const supplied = req.headers["x-mp-proxy-key"];
        ensure(
          typeof supplied === "string" &&
            Buffer.byteLength(supplied) ===
              Buffer.byteLength(config.proxySecret) &&
            timingSafeEqual(
              Buffer.from(supplied),
              Buffer.from(config.proxySecret),
            ),
          "PROXY_DENIED",
          403,
        );
        ensure(
          isIP(req.headers["x-mp-client-ip"] || "") !== 0,
          "INVALID_CLIENT_IP",
          400,
        );
      }
      const url = new URL(req.url, config.origin);
      ensure(url.origin === config.origin, "INVALID_REQUEST");
      if (
        proofService &&
        (await require("../github/http").handle(proofService, req, res, url))
      )
        return;
      if (
        req.method === "GET" &&
        [
          "/",
          "/app.js",
          "/landing.js",
          "/legacy",
          "/privacy",
          "/terms",
          "/early-access",
          "/style.css",
          "/brand.css",
          "/ohcaygo-mark.png",
          "/sample",
          "/kiota.css",
        ].includes(url.pathname)
      ) {
        const file =
          ["/sample", "/kiota.css"].includes(url.pathname)
            ? path.join(__dirname, url.pathname === "/sample" ? "../samples/kiota.html" : "../samples/kiota.css")
            : path.join(
                __dirname,
                "public",
                url.pathname === "/"
                  ? "index.html"
                  : url.pathname === "/legacy"
                    ? "legacy.html"
                    : ["/privacy", "/terms", "/early-access"].includes(url.pathname)
                      ? url.pathname.slice(1) + ".html"
                      : url.pathname.slice(1),
              );
        res.writeHead(200, { "Content-Type": types[path.extname(file)] });
        fs.createReadStream(file).pipe(res);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/offer") {
        if (config.retireLegacyOffer !== false) {
          send(200, {
            available: false,
            price: "Pro — $29/month per active developer",
            scope: "RETIRED_LEGACY_EVIDENCE_PACK",
            hostedUrl: "/proof/",
            trialDays: 7,
            trialStarts: "FIRST_SUCCESSFUL_HOSTED_PROOF",
          });
          return;
        }
        try {
          send(200, await factory.stripe.offer());
        } catch {
          send(200, {
            price: "Checkout unavailable until Stripe is configured",
            available: false,
            mode: config.mode,
          });
        }
        return;
      }
      let raw = Buffer.alloc(0);
      if (req.method === "POST") {
        for await (const chunk of req) {
          raw = Buffer.concat([raw, chunk]);
          ensure(raw.length < 262144, "REQUEST_TOO_LARGE", 413);
        }
        if (url.pathname === "/webhooks/stripe") {
          await factory.webhook(raw, req.headers["stripe-signature"]);
          send(200, { received: true });
          return;
        }
        ensure(req.headers.origin === config.origin, "ORIGIN_DENIED", 403);
        ensure(
          req.headers["content-type"]?.startsWith("application/json"),
          "INVALID_REQUEST",
          415,
        );
      }
      const input = raw.length ? JSON.parse(raw) : {};
      if (req.method === "POST" && url.pathname === "/api/eligibility") {
        ensure(config.retireLegacyOffer === false, "LEGACY_OFFER_RETIRED", 410);
        const ip = config.proxySecret
          ? req.headers["x-mp-client-ip"]
          : req.socket.remoteAddress;
        const now = Date.now();
        const r = rates.get(ip) || { count: 0, time: now };
        if (now - r.time > 3600000) {
          r.count = 0;
          r.time = now;
        }
        ensure(r.count < 6, "RATE_LIMIT", 429);
        r.count++;
        if (rates.size > 1000) rates.clear();
        rates.set(ip, r);
        const result = await factory.eligible(input);
        if (result.token) cookie(result.token);
        send(200, result);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/access") {
        const o = factory.auth(input.token);
        cookie(input.token);
        send(200, factory.public(o));
        return;
      }
      const token = req.headers.cookie
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("mp_access="))
        ?.slice(10);
      const order = factory.auth(token);
      if (req.method === "GET" && url.pathname === "/api/order") {
        send(200, factory.public(order));
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/download/")) {
        const [, , runId, name] = url.pathname.split("/");
        const file = factory.download(order, runId, name);
        res.writeHead(200, {
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${name}"`,
        });
        fs.createReadStream(file).pipe(res);
        return;
      }
      ensure(req.method === "POST", "NOT_FOUND", 404);
      if (url.pathname === "/api/checkout") {
        ensure(config.retireLegacyOffer === false, "LEGACY_OFFER_RETIRED", 410);
        send(200, await factory.checkout(order));
      } else if (url.pathname === "/api/authorize")
        send(200, await factory.authorize(order, input));
      else if (url.pathname === "/api/scope")
        send(200, await factory.prepare(order));
      else if (url.pathname === "/api/run")
        send(202, factory.start(order, input));
      else if (url.pathname === "/api/exception")
        send(200, factory.escalate(order, input.state));
      else send(404, { error: "NOT_FOUND" });
    } catch (error) {
      if (!res.headersSent)
        send(error.status || 400, { error: error.code || "REQUEST_FAILED" });
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}
if (require.main === module) {
  const config = loadConfig();
  const store = new Store(config.stateDir);
  const factory = new Factory({
    config,
    store,
    stripe: new Stripe(config),
    github: new GitHub(),
    runner: new Runner(),
  });
  factory.purge();
  const sweep = setInterval(() => factory.purge(), 3600000);
  // Opt-in extension; existing factory/Stripe routes and default startup stay intact.
  const appConfigPath = process.env.MP_GITHUB_APP_CONFIG;
  const appConfig = appConfigPath
    ? JSON.parse(fs.readFileSync(appConfigPath, "utf8"))
    : null;
  const proofService = createProofRuntime(config, store, appConfig);
  let proofDrain = Promise.resolve();
  let billingDrain = Promise.resolve();
  const billingTimer = proofService?.billing
    ? setInterval(() => {
        billingDrain = proofService.billing.reconcileQuantities().catch(() => {
          proofService.data.billingHealth = "RECONCILIATION_UNAVAILABLE";
          proofService.save();
        });
      }, 300000)
    : null;
  const proofTimer = proofService
    ? setInterval(() => {
        if (!proofService.draining)
          proofDrain = proofService.drain().catch(() => {});
      }, 5000)
    : null;
  const server = createServer(factory, proofService);
  server.once("error", () => {
    clearInterval(billingTimer);
    clearInterval(proofTimer);
    clearInterval(sweep);
    if (proofService && proofService.store !== store) proofService.store.close();
    store.close();
    console.error("FACTORY_LISTEN_FAILED");
    process.exitCode = 1;
  });
  server.listen(
    Number(process.env.PORT || 4318),
    process.env.FACTORY_HOST || "127.0.0.1",
    () => console.log(`Merge-Proof factory: ${config.origin} (${config.mode})`),
  );
  const close = () => {
    clearInterval(billingTimer);
    clearInterval(proofTimer);
    server.close(async () => {
      await Promise.allSettled([...factory.jobs]);
      await proofDrain;
      await billingDrain;
      await proofService?.scanJob;
      clearInterval(sweep);
      if (proofService && proofService.store !== store) proofService.store.close();
      store.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}
module.exports = { createServer, loadConfig, createProofRuntime };
