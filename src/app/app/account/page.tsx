import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import AccountClient from "./account-client";

export default async function AccountPage() {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  return <AccountClient user={user} />;
}
