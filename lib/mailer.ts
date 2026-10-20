import nodemailer from "nodemailer";
import { appStore, initializeRecord, replaceRevision } from "./blob-storage";
import { HttpError } from "./http-error";

export type SmtpSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
  allowSelfSigned: boolean;
};
export type SmtpSettingsDoc = { revision: number; settings: SmtpSettings | null };
export type PublicSmtpSettings = Omit<SmtpSettings, "password"> & {
  passwordSet: boolean;
};

export const publicSmtpSettings = (
  settings: SmtpSettings | null,
): PublicSmtpSettings | null =>
  settings && {
    host: settings.host,
    port: settings.port,
    user: settings.user,
    from: settings.from,
    secure: settings.secure,
    allowSelfSigned: settings.allowSelfSigned,
    passwordSet: !!settings.password,
  };

export async function loadSmtpSettings(): Promise<SmtpSettingsDoc> {
  return await initializeRecord(appStore(), "smtp-settings", () => ({
    revision: 0,
    settings: null,
  }));
}
export async function saveSmtpSettings(next: SmtpSettingsDoc, expectedRevision: number) {
  await replaceRevision(appStore(), "smtp-settings", next, expectedRevision);
}

function envConfig(): SmtpSettings | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !user || !password) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host,
    port,
    user,
    password,
    from: process.env.SMTP_FROM || user,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    allowSelfSigned: process.env.SMTP_ALLOW_SELF_SIGNED === "true",
  };
}

// Settings saved in Settings > Manage SMTP take precedence over env vars,
// so a deployment can be configured either way without code changes.
async function resolvedConfig(): Promise<SmtpSettings | null> {
  const doc = await loadSmtpSettings();
  if (doc.settings?.host && doc.settings.user && doc.settings.password)
    return doc.settings;
  return envConfig();
}

export async function mailerConfigured(): Promise<boolean> {
  return (await resolvedConfig()) !== null;
}

export async function sendMail(message: { to: string; subject: string; text: string }) {
  const cfg = await resolvedConfig();
  if (!cfg) throw new HttpError("SMTP is not configured.", 503);
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    tls: cfg.allowSelfSigned ? { rejectUnauthorized: false } : undefined,
  });
  await transporter.sendMail({
    from: cfg.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

export type SmtpCommand =
  | {
      kind: "save";
      host: string;
      port: number;
      user: string;
      password?: string;
      from: string;
      secure: boolean;
      allowSelfSigned: boolean;
    }
  | { kind: "clear" };

export function applySmtpCommand(
  doc: SmtpSettingsDoc,
  cmd: SmtpCommand,
): SmtpSettingsDoc {
  const next = structuredClone(doc);
  if (cmd.kind === "clear") {
    next.settings = null;
    return next;
  }
  const password = cmd.password?.trim() || next.settings?.password;
  if (!password)
    throw new HttpError("Enter the SMTP account password.");
  if (!cmd.host.trim() || !cmd.user.trim() || !cmd.from.trim())
    throw new HttpError("Enter the SMTP host, username, and from address.");
  next.settings = {
    host: cmd.host.trim(),
    port: cmd.port,
    user: cmd.user.trim(),
    password,
    from: cmd.from.trim(),
    secure: cmd.secure,
    allowSelfSigned: cmd.allowSelfSigned,
  };
  return next;
}
