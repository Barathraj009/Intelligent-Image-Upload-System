"use strict";

// Boot + graceful-shutdown test.
//
// Spawns the real server exactly as a platform would (`node app.js`) against
// a throwaway DATA_DIR, waits for readiness, then sends SIGTERM and asserts
// the process exits 0 (proving the shutdown handler drains cleanly instead
// of being SIGKILLed by the orchestrator).
//
// On Windows the OS does not deliver SIGTERM to the child (Node emulates
// only a few signals), so the graceful-exit assertion is limited to POSIX
// (GitHub Actions runs Linux). Windows still verifies boot + health.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

const IS_WINDOWS = process.platform === "win32";

test("boots, becomes healthy, and shuts down gracefully on SIGTERM", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "iiu-boot-test-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const repoRoot = path.resolve(__dirname, "..");

  const child = spawn(process.execPath, ["app.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      NODE_ENV: "test",
      EMAIL_TRANSPORT: "json",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const url = `http://127.0.0.1:${port}/api/health`;
    const deadline = Date.now() + 15_000;
    let health = null;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url);
        if (res.status === 200) {
          health = await res.json();
          break;
        }
      } catch (_error) {
        /* server not up yet */
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    assert.ok(health, "server did not become healthy in time");
    assert.equal(health.status, "ok");
    assert.equal(health.db, "ok");

    child.kill("SIGTERM");

    const outcome = await Promise.race([
      new Promise((resolve) =>
        child.once("exit", (code, signal) => resolve({ code, signal }))
      ),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("graceful shutdown timed out")), 5_000)
      ),
    ]);

    if (IS_WINDOWS) {
      // Signal delivery semantics differ on Windows — the process is torn
      // down rather than run the handler. Boot + health already passed.
      assert.ok(outcome);
    } else {
      assert.equal(outcome.code, 0, "SIGTERM should exit with code 0");
    }
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});