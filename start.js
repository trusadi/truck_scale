import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = process.env.PORT || "3002";
const nextCli = fileURLToPath(new URL("./node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(process.execPath, [nextCli, "dev", "--webpack", "--hostname", "0.0.0.0", "--port", port], {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error("Could not start Truck Scale:", error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
