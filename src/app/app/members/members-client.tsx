"use client";

import { MemberList, Member, Group } from "../_components/member-list";
import { Role } from "@prisma/client";

interface MembersClientProps {
  initialMembers: Member[];
  initialTotal: number;
  initialGroups: Group[];
  userRole: Role;
  initialGroupId?: string;
}

export function MembersClient({
  initialMembers,
  initialTotal,
  initialGroups,
  userRole,
  initialGroupId,
}: MembersClientProps) {
  return (
    <MemberList
      initialMembers={initialMembers}
      initialTotal={initialTotal}
      initialGroups={initialGroups}
      userRole={userRole}
      initialGroupId={initialGroupId}
    />
  );
}
