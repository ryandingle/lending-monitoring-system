import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireRole, requireUser } from "@/lib/auth/session";
import { createAuditLogStandalone, tryGetAuditRequestContext } from "@/lib/audit";
import {
  APP_CONTROL_KEYS,
  getManilaEndOfToday,
  resolveAppControl,
  setAppControl,
  type AppControlKey,
} from "@/lib/app-controls";

const ToggleSchema = z.object({
  key: z.enum([APP_CONTROL_KEYS.REPORT_VIEW_DOWNLOAD_ENABLED]),
  action: z.enum(["enable", "disable"]),
});

export async function GET(req: Request) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER, Role.VIEWER, Role.COLLECTOR]);

  const url = new URL(req.url);
  const keys = (url.searchParams.get("keys") ?? "").split(",").filter(Boolean);
  const allowedKeys: AppControlKey[] = [APP_CONTROL_KEYS.REPORT_VIEW_DOWNLOAD_ENABLED];
  const toResolve: AppControlKey[] =
    keys.length > 0
      ? allowedKeys.filter((k) => keys.includes(k))
      : allowedKeys;

  const resolved = new Map<string, Awaited<ReturnType<typeof resolveAppControl>>>();
  for (const key of toResolve) {
    resolved.set(key, await resolveAppControl(key));
  }

  return NextResponse.json({
    ok: true,
    data: Object.fromEntries(resolved.entries()),
  });
}

export async function PATCH(req: Request) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const json = ToggleSchema.parse(await req.json());
  const auditCtx = await tryGetAuditRequestContext();

  const key = json.key;
  if (json.action === "enable") {
    await setAppControl(key, {
      enabled: true,
      expiresAt: getManilaEndOfToday(),
      updatedById: actor.id,
    });
    await createAuditLogStandalone({
      actorType: "USER",
      actorUserId: actor.id,
      action: "app_control.enable",
      entityType: "AppControl",
      entityId: key,
      metadata: { expiresAtIso: getManilaEndOfToday().toISOString() },
      request: auditCtx,
    });
  } else {
    await setAppControl(key, {
      enabled: false,
      expiresAt: null,
      updatedById: actor.id,
    });
    await createAuditLogStandalone({
      actorType: "USER",
      actorUserId: actor.id,
      action: "app_control.disable",
      entityType: "AppControl",
      entityId: key,
      metadata: {},
      request: auditCtx,
    });
  }

  const control = await resolveAppControl(key);
  return NextResponse.json({ ok: true, data: control });
}
