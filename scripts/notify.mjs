/**
 * Email notification layer for daily-priorities.mjs and weekly-report.mjs.
 *
 * Sends the digest / report via Gmail when the following env vars are set:
 *   GMAIL_USER            — the sender Gmail address
 *   GMAIL_APP_PASSWORD    — a 16-character Google app password (NOT your login)
 *   GMAIL_TO              — recipient; defaults to GMAIL_USER if unset
 *
 * notify() is a no-op (just logs) if the credentials are missing, so the
 * scripts still succeed even before you've wired up email.
 *
 * Implemented as a minimal SMTP client over Node's built-in TLS socket so
 * we don't have to pull nodemailer or any other npm dependency — the
 * GitHub Actions runner stays lean.
 */

import { createConnection } from "node:net";
import { TLSSocket } from "node:tls";

/**
 * Send a notification email to the configured recipient.
 *
 * @param {Object} args
 * @param {string} args.subject  Short one-line subject.
 * @param {string} args.body     Plain-text body (already formatted for humans).
 * @param {string} [args.url]    Optional deep link appended to the body.
 */
export async function notify({ subject, body, url }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log("    ℹ  notify: Gmail not configured (skipping)");
    return { sent: 0, failed: 0 };
  }

  const enrichedBody = url ? `${body}\n\n🔗 ${url}` : body;

  try {
    await sendGmail({ subject, body: enrichedBody });
    console.log(`    ✓ notify → gmail (${process.env.GMAIL_TO || process.env.GMAIL_USER})`);
    return { sent: 1, failed: 0 };
  } catch (err) {
    const detail = err?.message ?? String(err);
    console.error(`    ✗ notify → gmail failed: ${detail}`);
    return { sent: 0, failed: 1 };
  }
}

/* ─── Gmail (raw SMTP over TLS, no npm deps) ───────────────────────────── */

async function sendGmail({ subject, body }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD; // 16-char app password
  const to = process.env.GMAIL_TO || user;

  const host = "smtp.gmail.com";
  const port = 465; // implicit TLS

  return new Promise((resolve, reject) => {
    const socket = new TLSSocket(createConnection(port, host), {
      servername: host,
      rejectUnauthorized: true,
    });

    let buffer = "";
    let step = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error("Gmail SMTP timed out after 20s"));
    }, 20000);

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.end();
      resolve();
    };

    // Minimal SMTP state machine. Each final 2xx response advances one step.
    const steps = [
      // 0: banner 220 → EHLO
      () => socket.write(`EHLO hawkeye-sterling\r\n`),
      // 1: 250 EHLO → AUTH LOGIN
      () => socket.write(`AUTH LOGIN\r\n`),
      // 2: 334 Username: → base64 username
      () => socket.write(`${Buffer.from(user).toString("base64")}\r\n`),
      // 3: 334 Password: → base64 password
      () => socket.write(`${Buffer.from(pass).toString("base64")}\r\n`),
      // 4: 235 auth ok → MAIL FROM
      () => socket.write(`MAIL FROM:<${user}>\r\n`),
      // 5: 250 → RCPT TO
      () => socket.write(`RCPT TO:<${to}>\r\n`),
      // 6: 250 → DATA
      () => socket.write(`DATA\r\n`),
      // 7: 354 → headers + body + terminator
      () => {
        const now = new Date().toUTCString();
        const headers = [
          `From: Hawkeye Sterling Automation <${user}>`,
          `To: ${to}`,
          `Subject: ${subject}`,
          `Date: ${now}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/plain; charset=utf-8`,
          `Content-Transfer-Encoding: 8bit`,
        ].join("\r\n");
        // Dot-stuff any body line starting with "." and terminate with "\r\n.\r\n".
        const escapedBody = body
          .replace(/\r\n/g, "\n")
          .split("\n")
          .map((l) => (l.startsWith(".") ? `.${l}` : l))
          .join("\r\n");
        socket.write(`${headers}\r\n\r\n${escapedBody}\r\n.\r\n`);
      },
      // 8: 250 message accepted → QUIT
      () => socket.write(`QUIT\r\n`),
    ];

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        // SMTP multi-line responses use "XXX-..." until the final "XXX ...".
        if (line.length < 4 || line[3] === "-") continue;

        const code = Number.parseInt(line.slice(0, 3), 10);
        if (code >= 400) return fail(new Error(`Gmail SMTP: ${line}`));

        if (step >= steps.length) return done();
        const action = steps[step++];
        try {
          action();
        } catch (err) {
          return fail(err);
        }
      }
    });

    socket.on("error", fail);
    socket.on("end", () => {
      if (!settled) done();
    });
  });
}
