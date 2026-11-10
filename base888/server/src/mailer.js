"use strict";
// Real email: sends via SMTP when SMTP_URL is configured, otherwise writes a
// real .eml artifact to the local outbox (genuine local delivery, not a fake OK).
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const cfg = require("./config");
const { uid } = require("./db");

let transport = null;
if (cfg.SMTP_URL) transport = nodemailer.createTransport(cfg.SMTP_URL);

async function sendEmail({ to, subject, body, html }) {
  if (!to || !subject) throw Object.assign(new Error("to and subject required"), { status: 400 });
  const message = { from: cfg.MAIL_FROM, to, subject, text: body, html };

  if (transport) {
    const info = await transport.sendMail(message);
    return { ok: true, delivery: "smtp", messageId: info.messageId };
  }

  // Outbox fallback: assemble and persist a real RFC822 .eml file.
  const built = await nodemailer.createTransport({ streamTransport: true, newline: "unix", buffer: true }).sendMail(message);
  const id = uid("mail");
  const file = path.join(cfg.OUTBOX_DIR, `${id}.eml`);
  fs.writeFileSync(file, built.message);
  return { ok: true, delivery: "outbox", messageId: built.messageId, path: file };
}

module.exports = { sendEmail };
