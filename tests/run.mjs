import { runAll } from "./suite.js";

const checks = runAll();
checks.forEach((item) => {
  console.log((item.ok ? "PASS" : "FAIL") + "  " + item.name + (item.detail ? "  " + item.detail : ""));
});
if (checks.some((item) => !item.ok)) process.exitCode = 1;
