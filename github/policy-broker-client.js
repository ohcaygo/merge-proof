"use strict";
// The normal proof process only knows this Unix socket. No companion key/token.
const http = require("node:http"), path = require("node:path");
const {assert} = require("./common");
function brokerClient(socketPath) {
  assert(typeof socketPath === "string" && path.isAbsolute(socketPath), "POLICY_BROKER_NOT_CONFIGURED");
  return (operation, input) => new Promise((resolve, reject) => {
    assert(["discover", "observe", "webhook"].includes(operation), "POLICY_BROKER_OPERATION_DENIED");
    const body = Buffer.from(JSON.stringify(input));
    assert(body.length <= 400000, "REQUEST_TOO_LARGE");
    const req = http.request({socketPath, method: "POST", path: `/v1/${operation}`,
      headers: {"Content-Type": "application/json", "Content-Length": body.length}}, res => {
      let size = 0; const chunks = [];
      res.on("data", b => {size += b.length; if (size > 4 * 1024 * 1024) res.destroy(Object.assign(Error(), {code: "RESPONSE_LIMIT"})); else chunks.push(b);});
      res.on("error", reject);
      res.on("end", () => {try {const out = JSON.parse(Buffer.concat(chunks)); assert(res.statusCode === 200, out.error || "POLICY_BROKER_UNAVAILABLE"); resolve(out);} catch (e) {reject(e);}});
    });
    req.setTimeout(120000, () => req.destroy(Object.assign(Error(), {code: "POLICY_BROKER_TIMEOUT"})));
    req.on("error", reject); req.end(body);
  });
}
module.exports = {brokerClient};
