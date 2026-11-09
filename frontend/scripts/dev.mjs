import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["mock/server.mjs"], { stdio: "inherit" }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
    { stdio: "inherit" },
  ),
];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  children.forEach((p) => p.kill());
  process.exitCode = code;
}
children.forEach((p) => {
  p.on("error", () => stop(1));
  p.on("exit", (code) => stop(code || 0));
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
