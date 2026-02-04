"use client";

import Link from "next/link";
import { Role } from "@prisma/client";
import { MemberList, Member } from "../../_components/member-list";
import { IconPlus } from "../../_components/icons";

interface GroupDetailsClientProps {
  group: {
    id: string;
    name: string;
    description: string | null;
    collectionOfficer: {
      firstName: string;
      lastName: string;
    } | null;
  };
  groups: { id: string; name: string }[];
  initialMembers: Member[]; // using Member from member-list
  userRole: Role;
  onBulkUpdate: (updates: any[]) => Promise<any>; // Kept for compatibility but unused
  deleteMemberAction: (memberId: string) => Promise<void>; // Kept for compatibility but unused
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  sort: "asc" | "desc";
  createdStatus?: string;
}

export function GroupDetailsClient({
  group,
  groups,
  initialMembers,
  userRole,
  pagination,
}: GroupDetailsClientProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/app/groups" className="text-sm text-slate-400 hover:underline">
              ← Back to Groups
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-100">{group.name}</h1>
            <p className="mt-1 text-sm text-slate-400">{group.description ?? "-"}</p>
            {group.collectionOfficer ? (
              <p className="mt-1 text-sm text-slate-400">
                Collection officer: {group.collectionOfficer.firstName}{" "}
                {group.collectionOfficer.lastName}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
             {/* Additional group actions can go here */}
          </div>
        </div>
      </div>

      <MemberList
        initialMembers={initialMembers}
        initialTotal={pagination.totalCount}
        initialGroups={groups}
        userRole={userRole}
        fixedGroupId={group.id}
        showTitle={false}
      />
    </div>
  );
}
