"use strict";

const { assert } = require("../common");

const UUID_PATH = /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESPONSE_BYTES = 4096;

function invalid(code) {
  throw Object.assign(new Error(code), { code });
}

function validateUrl(value) {
  assert(typeof value === "string", "HEALTHCHECK_URL_INVALID");
  let url;
  try {
    url = new URL(value);
  } catch {
    invalid("HEALTHCHECK_URL_INVALID");
  }
  assert(
    url.protocol === "https:" &&
      url.hostname === "hc-ping.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      UUID_PATH.test(url.pathname),
    "HEALTHCHECK_URL_INVALID",
  );
  return url;
}
function assertUrl(value) {
  validateUrl(value);
  return true;
}
function assertUrlPair(service, backup) {
  const first = validateUrl(service), second = validateUrl(backup);
  assert(first.pathname.toLowerCase() !== second.pathname.toLowerCase(), "HEALTHCHECK_URLS_DUPLICATED");
  return true;
}

async function boundedText(response, maxBytes, onLimit) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maxBytes) {
          onLimit?.();
          await reader.cancel().catch(() => {});
          invalid("HEALTHCHECK_RESPONSE_TOO_LARGE");
        }
        chunks.push(Buffer.from(next.value));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  assert(typeof response.text === "function", "HEALTHCHECK_RESPONSE_INVALID");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > maxBytes) {
    onLimit?.();
    invalid("HEALTHCHECK_RESPONSE_TOO_LARGE");
  }
  return body;
}

async function ping(
  value,
  {
    fetchImpl = globalThis.fetch,
    method = "GET",
    outcome = "success",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  } = {},
) {
  assert(method === "GET", "HEALTHCHECK_METHOD_INVALID");
  assert(outcome === "success" || outcome === "fail", "HEALTHCHECK_OUTCOME_INVALID");
  const url = validateUrl(value);
  assert(typeof fetchImpl === "function", "HEALTHCHECK_UNAVAILABLE");
  assert(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= DEFAULT_TIMEOUT_MS, "HEALTHCHECK_TIMEOUT_INVALID");
  assert(Number.isSafeInteger(maxResponseBytes) && maxResponseBytes > 0 && maxResponseBytes <= DEFAULT_MAX_RESPONSE_BYTES, "HEALTHCHECK_RESPONSE_LIMIT_INVALID");
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error("HEALTHCHECK_TIMEOUT"), { code: "HEALTHCHECK_TIMEOUT" }));
    }, timeoutMs);
  });
  const request = (async () => {
    const destination = new URL(url.href);
    if (outcome === "fail") destination.pathname += "/fail";
    const response = await fetchImpl(destination.href, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status !== 200) return { state: "FAILED", code: "HEALTHCHECK_HTTP_STATUS" };
    const body = await boundedText(response, maxResponseBytes, () => controller.abort());
    return body === "OK"
      ? { state: "RECEIVED" }
      : { state: "FAILED", code: "HEALTHCHECK_RESPONSE_INVALID" };
  })();
  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (error?.code === "HEALTHCHECK_RESPONSE_TOO_LARGE")
      return { state: "FAILED", code: error.code };
    if (error?.code === "HEALTHCHECK_TIMEOUT")
      return { state: "FAILED", code: error.code };
    return {
      state: "FAILED",
      code: error?.name === "AbortError" ? "HEALTHCHECK_TIMEOUT" : "HEALTHCHECK_UNAVAILABLE",
    };
  } finally {
    clearTimeout(timer);
  }
}

function outcomeForJobStatus(status) {
  return status === "success" ? "success" : "fail";
}

async function runFromEnvironment(env = process.env, fetchImpl = globalThis.fetch) {
  return ping(env.MP_LAB_HEALTHCHECK_URL || env.MP_HEALTHCHECK_URL, {
    outcome: outcomeForJobStatus(env.JOB_STATUS),
    fetchImpl,
  });
}

if (require.main === module) {
  runFromEnvironment()
    .then(result => { if (result.state !== "RECEIVED") process.exitCode = 2; })
    .catch(() => { process.exitCode = 2; });
}

module.exports = { ping, assertUrl, assertUrlPair, outcomeForJobStatus, runFromEnvironment };
