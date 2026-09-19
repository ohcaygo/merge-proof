"use strict";
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs"), path = require("node:path");
const { assert, repoName, sha } = require("./common");
function authEnvironment(token) {
  return token ? { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}` } : {};
}
function work({ config, repository, repositoryId, token, input }) {
  assert(repoName(repository) && Number.isSafeInteger(repositoryId) && repositoryId > 0, "INVALID_SCOPE");
  assert(sha(input.base) && sha(input.head), "EXACT_INPUT_COMMITS_REQUIRED");
  assert(path.isAbsolute(config.root) && path.isAbsolute(config.binary) && typeof config.version === "string", "MIRROR_CONFIGURATION_REQUIRED");
  fs.mkdirSync(config.root, { recursive: true, mode: 0o700 });
  const dir = path.join(config.root, String(repositoryId));
  fs.mkdirSync(dir, { mode: 0o700, recursive: true });

  const env = { PATH: "/usr/bin:/bin", LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_NO_REPLACE_OBJECTS: "1", ...authEnvironment(token) };
  const git = args => {
    const r = spawnSync(config.binary, ["-C", dir, "-c", "core.hooksPath=/dev/null", ...args], { env, encoding: "utf8", timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
    assert(r.status === 0, "MIRROR_FETCH_UNAVAILABLE"); return r.stdout.trim();
  };
  try {
    assert(require("node:crypto").createHash("sha256").update(fs.readFileSync(config.binary)).digest("hex") === config.sha256, "PINNED_GIT_BINARY_MISMATCH");
    assert(git(["--version"]) === config.version, "PINNED_GIT_VERSION_MISMATCH");
    if (!fs.existsSync(path.join(dir, "HEAD"))) git(["init", "--bare", "."]);
    const remote = `https://github.com/${repository}.git`;
    git(["config", "remote.origin.url", remote]);
    git(["config", "remote.origin.promisor", "true"]);
    git(["config", "remote.origin.partialclonefilter", "blob:none"]);
    git(["fetch", "--no-tags", "--filter=blob:none", "origin", ...new Set([input.base, input.head, ...(input.entries || []).map(x => x.head)])]);
    return require("./reconstruct").reconstruct(dir, input, { ...config, authEnvironment: authEnvironment(token) });
  } finally { /* Lock lifetime is owned by the parent, including termination. */ }
}
function reconstruct(options) {
  return new Promise(resolve => {
    let lock, fd;
    const unavailable = reason => ({ status: "NOT_RECONSTRUCTABLE", tree: null, reason });
    try {
      assert(Number.isSafeInteger(options.repositoryId) && options.repositoryId > 0 && path.isAbsolute(options.config.root), "INVALID_SCOPE");
      const dir = path.join(options.config.root, String(options.repositoryId));
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); lock = path.join(dir, "merge-proof.lock");
      if (fs.existsSync(lock)) {
        const owner = JSON.parse(fs.readFileSync(lock, "utf8"));
        assert(Number.isSafeInteger(owner.pid) && owner.pid > 0, "MIRROR_LOCK_UNRESOLVED");
        try { process.kill(owner.pid, 0); } catch (e) { if (e.code === "ESRCH") fs.unlinkSync(lock); else throw e; }
      }
      fd = fs.openSync(lock, "wx", 0o600); fs.writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    } catch { resolve(unavailable("MIRROR_BUSY_OR_UNAVAILABLE")); return; }
    let settled = false, timer, result;
    const finish = value => {
      if (settled) return; settled = true; clearTimeout(timer);
      fs.closeSync(fd); fs.unlinkSync(lock); resolve(value);
    };
    let worker;
    try { worker = new Worker(__filename, { workerData: options }); }
    catch { finish(unavailable("MIRROR_UNAVAILABLE")); return; }
    timer = setTimeout(() => { result = unavailable("RECONSTRUCTION_TIME_LIMIT"); worker.terminate(); }, 120000);
    worker.once("message", value => { result = value; });
    worker.once("error", () => { result = unavailable("MIRROR_UNAVAILABLE"); });
    // Wait until the worker and its synchronous Git call stop before unlocking.
    worker.once("exit", () => finish(result || unavailable("MIRROR_UNAVAILABLE")));
  });
}
if (!isMainThread) {
  try { parentPort.postMessage(work(workerData)); }
  catch (e) { parentPort.postMessage({ status: "NOT_RECONSTRUCTABLE", tree: null, reason: e.code || "MIRROR_UNAVAILABLE" }); }
}
module.exports = { reconstruct, authEnvironment };
