"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { createServer } = require("../server");

test("public legal and invited-entry routes serve their real files without order authentication", async t => {
  let authCalls = 0;
  const factory = { config: { mode: "test", origin: "http://127.0.0.1" }, auth() {
    authCalls++;
    throw Object.assign(Error("not found"), { code: "NOT_FOUND", status: 404 });
  } };
  const server = createServer(factory);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  factory.config.origin = `http://127.0.0.1:${server.address().port}`;
  for (const [route, name] of [["/privacy", "privacy.html"], ["/terms", "terms.html"], ["/early-access", "early-access.html"]]) {
    const response = await fetch(factory.config.origin + route);
    a.equal(response.status, 200, route);
    a.match(response.headers.get("content-type"), /text\/html/);
    a.equal(await response.text(), fs.readFileSync(path.join(__dirname, "../public", name), "utf8"));
  }
  a.equal(authCalls, 0);
  const traversal = await fetch(factory.config.origin + "/privacy%2f..%2f..%2fpackage.json");
  a.notEqual(traversal.status, 200);
});
