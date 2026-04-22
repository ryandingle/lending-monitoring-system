import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import AccountClient from "./account-client";

export default async function AccountPage() {
  const user = await requireUser();
  requireRole(user, ["SUPER_ADMIN", "ENCODER", "COLLECTOR"] as Role[]);

  return <AccountClient user={user} />;
}
