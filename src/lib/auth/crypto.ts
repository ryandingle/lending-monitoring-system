import crypto from "crypto";

export function getAuthSecret() {
  return process.env.AUTH_SECRET || "dev-secret-change-me";
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashToken(token: string) {
  return crypto.createHmac("sha256", getAuthSecret()).update(token).digest("hex");
}

