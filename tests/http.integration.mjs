import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test(
  "operator app: login required, role/plant scoping, shared changes, QR privacy, email preview, and reset",
  { timeout: 60000 },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "smf-public-demo-test-"));
    let child;
    try {
      const probe = createServer();
      probe.listen(0, "127.0.0.1");
      await once(probe, "listening");
      const port = probe.address().port;
      await new Promise((resolve) => probe.close(resolve));
      const base = `http://127.0.0.1:${port}`;
      const origin = base;

      child = spawn(
        process.execPath,
        [
          "node_modules/next/dist/bin/next",
          "start",
          "--port",
          String(port),
          "--hostname",
          "127.0.0.1",
        ],
        {
          cwd: new URL("..", import.meta.url),
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            NODE_ENV: "production",
            DATABASE_PATH: join(folder, "app.db"),
            NEXT_TELEMETRY_DISABLED: "1",
          },
        },
      );

      let logs = "";
      child.stdout.on("data", (chunk) => {
        logs += chunk;
      });
      child.stderr.on("data", (chunk) => {
        logs += chunk;
      });

      let ready = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        if (child.exitCode !== null)
          throw new Error(
            "Next server stopped before readiness: " + logs.slice(-2500),
          );
        try {
          if ((await fetch(base + "/login")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      assert.equal(ready, true, "Operator app should start");

      const send = (body, extraHeaders = {}) =>
        fetch(base + "/api/operations", {
          method: "POST",
          headers: {
            origin,
            "content-type": "application/json",
            ...extraHeaders,
          },
          body: JSON.stringify(body),
        });

      const login = async (email, password) => {
        const res = await fetch(base + "/api/login", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        assert.equal(
          res.status,
          200,
          "login for " + email + " should succeed: " + (await res.clone().text()),
        );
        const setCookie = res.headers.get("set-cookie");
        assert.ok(setCookie, "login should set a session cookie");
        return setCookie.split(";")[0];
      };

      // Logged out: the operator page redirects to /login, and the API is not usable.
      const home = await fetch(base + "/?view=approvals&visit=VISIT-002", {
        redirect: "manual",
      });
      assert.ok([301, 302, 303, 307, 308].includes(home.status));
      assert.match(home.headers.get("location") ?? "", /\/login$/);
      assert.equal((await fetch(base + "/login")).status, 200);

      let response = await fetch(base + "/api/operations");
      assert.equal(response.status, 401, "Operations require a signed-in session");

      const forged = await fetch(base + "/api/operations", {
        headers: {
          "oai-authenticated-user-email": "attacker@example.com",
          "oai-authenticated-user-id": "forged",
          cookie: "smf_session=forged.forged",
        },
      });
      assert.equal(forged.status, 401, "A forged cookie must not grant a session");

      // Sign in as the seeded administrator for the main authenticated flow.
      const adminCookie = await login("admin@smf.demo", "Admin#12345");
      response = await fetch(base + "/api/operations", {
        headers: { cookie: adminCookie },
      });
      assert.equal(response.status, 200);
      let state = await response.json();
      assert.equal(state.visits.length, 20);
      assert.deepEqual(state.actor, {
        email: "admin@smf.demo",
        name: "Demo Administrator",
        isAdmin: true,
        role: "admin",
        plant: "ALL",
        direction: "both",
      });
      assert.deepEqual(state.capabilities, {
        emailConfigured: false,
        scaleConfigured: false,
        sapConnected: false,
        externalDriverAccess: true,
      });

      const boardResponse = await fetch(base + "/api/board");
      assert.equal(boardResponse.status, 200);
      assert.match(boardResponse.headers.get("cache-control"), /no-store/);
      const board = await boardResponse.json();
      assert.equal(board.visits.length, 20);
      assert.equal(board.visits[0].plate, state.visits[0].plate);
      assert.equal(board.visits[0].productProgress.total, 2);
      for (const privateField of [
        "driver",
        "carrier",
        "lines",
        "expectedKg",
        "readings",
        "result",
        "decision",
        "token",
        "events",
      ])
        assert.equal(privateField in board.visits[0], false);

      response = await send(
        { revision: state.revision, kind: "reset" },
        {
          cookie: adminCookie,
          origin: "https://smf-truck-scale.example.com",
          "x-forwarded-host": "smf-truck-scale.example.com",
          "sec-fetch-site": "same-origin",
        },
      );
      assert.equal(
        response.status,
        200,
        "A reverse-proxy-forwarded public host should pass the same-site check",
      );
      state = await response.json();

      response = await send(
        { revision: state.revision, kind: "reset" },
        {
          cookie: adminCookie,
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
      );
      assert.equal(response.status, 403);

      response = await send(
        {
          revision: state.revision,
          kind: "settings",
          company: "1000",
          level: "plant",
          plant: "PAG",
          direction: "inbound",
          rule: {
            ...state.rules["plant:1000:PAG:inbound"],
            shortage: 2,
            excess: 2,
          },
          emailEnabled: false,
        },
        { cookie: adminCookie },
      );
      assert.equal(
        response.status,
        200,
        "Settings response: " + (await response.clone().text()),
      );
      state = await response.json();
      assert.equal(state.rules["plant:1000:PAG:inbound"].shortage, 2);

      // Notification recipients are maintained per site with their own
      // immediate-persist commands, independent of the settings bundle.
      response = await send(
        {
          revision: state.revision,
          kind: "add_recipient",
          email: "cebu.recipient@example.com",
          name: "Cebu Recipient",
          recipientPlant: "CEB",
          recipientDirection: "inbound",
        },
        { cookie: adminCookie },
      );
      assert.equal(response.status, 200, await response.clone().text());
      state = await response.json();
      assert.ok(
        state.supervisors.some((s) => s.email === "cebu.recipient@example.com"),
      );

      response = await send(
        {
          revision: state.revision,
          kind: "add_recipient",
          email: "cebu.recipient@example.com",
          name: "Duplicate",
          recipientPlant: "ALL",
          recipientDirection: "both",
        },
        { cookie: adminCookie },
      );
      assert.equal(response.status, 400, "Duplicate recipient email should be rejected");

      const pagOperatorCookieForRecipients = await login(
        "pagbilao.operator@smf.demo",
        "Operator#12345",
      );
      response = await send(
        {
          revision: state.revision,
          kind: "add_recipient",
          email: "not-allowed@example.com",
          name: "Should Fail",
          recipientPlant: "PAG",
          recipientDirection: "both",
        },
        { cookie: pagOperatorCookieForRecipients },
      );
      assert.equal(response.status, 400, "Only the administrator can add recipients");

      response = await send(
        {
          revision: state.revision,
          kind: "remove_recipient",
          email: "cebu.recipient@example.com",
        },
        { cookie: adminCookie },
      );
      assert.equal(response.status, 200, await response.clone().text());
      state = await response.json();
      assert.equal(
        state.supervisors.some((s) => s.email === "cebu.recipient@example.com"),
        false,
      );

      response = await send(
        {
          revision: state.revision - 1,
          kind: "approve",
          id: "VISIT-002",
          reason: "Stale demo decision",
        },
        { cookie: adminCookie },
      );
      assert.equal(response.status, 409);

      response = await send(
        {
          revision: state.revision,
          kind: "approve",
          id: "VISIT-002",
          reason: "Documents checked in the demo",
        },
        { cookie: adminCookie },
      );
      assert.equal(response.status, 200);
      state = await response.json();
      const approved = state.visits.find((visit) => visit.id === "VISIT-002");
      assert.equal(approved.stage, "cleared");
      assert.equal(approved.decision.by, "admin@smf.demo");

      response = await fetch(base + "/api/tracking/" + approved.token);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control"), /no-store/);
      const tracking = await response.json();
      assert.equal(tracking.stage, "cleared");
      for (const field of [
        "driver",
        "lines",
        "supervisors",
        "expectedKg",
        "result",
        "notifications",
        "audit",
      ])
        assert.equal(field in tracking, false);
      assert.equal(
        JSON.stringify(tracking).includes("Documents checked in the demo"),
        false,
      );

      const oldToken = approved.token;
      response = await send(
        { revision: state.revision, kind: "renew_qr", id: approved.id },
        { cookie: adminCookie },
      );
      assert.equal(response.status, 200);
      state = await response.json();
      assert.equal(
        (await fetch(base + "/api/tracking/" + oldToken)).status,
        404,
      );
      assert.equal(
        (await fetch(base + "/api/tracking/not-a-token")).status,
        404,
      );

      const notification = state.notifications.find(
        (item) => item.visitId === "OUT-002",
      );
      response = await send(
        { revision: state.revision, kind: "notify", id: notification.id },
        { cookie: adminCookie },
      );
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /not turned on/);

      // Plant-scoped accounts only see and can only act on their own plant.
      const pagOperatorCookie = await login(
        "pagbilao.operator@smf.demo",
        "Operator#12345",
      );
      response = await fetch(base + "/api/operations", {
        headers: { cookie: pagOperatorCookie },
      });
      assert.equal(response.status, 200);
      const pagView = await response.json();
      assert.ok(pagView.visits.length > 0);
      assert.ok(pagView.visits.every((visit) => visit.plant === "PAG"));
      assert.equal(pagView.actor.role, "operator");
      assert.equal(pagView.actor.plant, "PAG");

      const cebVisit = state.visits.find((visit) => visit.plant === "CEB");
      response = await send(
        {
          revision: pagView.revision,
          kind: "hold",
          id: cebVisit.id,
          reason: "Should be rejected",
        },
        { cookie: pagOperatorCookie },
      );
      assert.equal(
        response.status,
        400,
        "An operator scoped to PAG must not act on a CEB visit",
      );
      assert.match((await response.clone().json()).error, /not authorized/);

      response = await send(
        { revision: pagView.revision, kind: "reset" },
        { cookie: pagOperatorCookie },
      );
      assert.equal(response.status, 403, "Reset is administrator-only");

      const pagSupervisorCookie = await login(
        "pagbilao.supervisor@smf.demo",
        "Supervisor#12345",
      );
      response = await fetch(base + "/api/users", {
        headers: { cookie: pagSupervisorCookie },
      });
      assert.equal(
        response.status,
        403,
        "Only the administrator can manage users",
      );

      response = await fetch(base + "/api/users", {
        headers: { cookie: adminCookie },
      });
      assert.equal(response.status, 200);
      const users = await response.json();
      assert.ok(users.users.length >= 7);
      assert.ok(users.users.every((user) => !("passwordHash" in user)));

      const revisionBeforeReset = state.revision;
      response = await send(
        { revision: revisionBeforeReset, kind: "reset" },
        { cookie: adminCookie },
      );
      assert.equal(response.status, 200);
      state = await response.json();
      assert.equal(state.revision, revisionBeforeReset + 1);
      assert.equal(state.visits.length, 20);
      assert.equal(
        state.visits.find((visit) => visit.id === "VISIT-002").stage,
        "approval",
      );
      assert.equal(state.rules["plant:1000:PAG:inbound"].shortage, 1);

      const persisted = await (
        await fetch(base + "/api/operations", { headers: { cookie: adminCookie } })
      ).json();
      assert.equal(persisted.revision, state.revision);
      assert.equal(persisted.visits.length, 20);

      // Logout clears the browser's cookie. Sessions are stateless signed
      // cookies with no server-side revocation list (accepted trade-off for
      // this demo/POC), so the raw token stays valid until it expires even
      // after logout — only the Set-Cookie clearing instruction is checked here.
      const loggedOut = await fetch(base + "/api/logout", {
        method: "POST",
        headers: { origin, cookie: adminCookie },
      });
      assert.equal(loggedOut.status, 200);
      assert.match(loggedOut.headers.get("set-cookie") ?? "", /smf_session=;/);
    } finally {
      if (child && child.exitCode === null) {
        const stopped = once(child, "exit");
        child.kill("SIGTERM");
        await stopped;
      }
      await rm(folder, { recursive: true, force: true });
    }
  },
);
