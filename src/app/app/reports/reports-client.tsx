"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { IconSearch, IconChevronUp, IconChevronDown } from "../_components/icons";

type Group = { id: string; name: string; _count: { members: number } };
type Member = { id: string; firstName: string; lastName: string };
type Officer = {
  id: string;
  firstName: string;
  lastName: string;
  groupsAsCollectionOfficer: { id: string; name: string }[];
};

interface ReportsClientProps {
  initialGroups: Group[];
  initialTotalGroups: number;
  initialMembers: Member[];
  initialTotalMembers: number;
  initialOfficers: Officer[];
  from: string;
  to: string;
}

function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  isLoading,
  className = "",
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="text-xs text-slate-500">
        Page {currentPage} of {totalPages}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1 || isLoading}
          className={`rounded px-2 py-1 text-xs font-medium ${
            currentPage > 1 && !isLoading
              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "pointer-events-none bg-slate-50 text-slate-400"
          }`}
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages || isLoading}
          className={`rounded px-2 py-1 text-xs font-medium ${
            currentPage < totalPages && !isLoading
              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "pointer-events-none bg-slate-50 text-slate-400"
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function ReportsClient({
  initialGroups,
  initialTotalGroups,
  initialMembers,
  initialTotalMembers,
  initialOfficers,
  from,
  to,
}: ReportsClientProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [totalGroups, setTotalGroups] = useState(initialTotalGroups);
  const [groupPage, setGroupPage] = useState(1);
  const [groupSearch, setGroupSearch] = useState("");
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);

  const [members, setMembers] = useState(initialMembers);
  const [totalMembers, setTotalMembers] = useState(initialTotalMembers);
  const [memberPage, setMemberPage] = useState(1);
  const [memberSearch, setMemberSearch] = useState("");
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [memberSort, setMemberSort] = useState<"asc" | "desc">("asc");

  const [officerDate, setOfficerDate] = useState(to);

  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const officerQuery = `from=${encodeURIComponent(officerDate)}&to=${encodeURIComponent(
    officerDate,
  )}`;
  const limit = 20;
  const totalGroupPages = Math.ceil(totalGroups / limit);
  const totalMemberPages = Math.ceil(totalMembers / limit);

  // Fetch Groups
  useEffect(() => {
    if (groupPage === 1 && groupSearch === "" && groups === initialGroups) return;

    const fetchGroups = async () => {
      setIsGroupsLoading(true);
      try {
        const res = await fetch(
          `/api/reports/groups?page=${groupPage}&limit=${limit}&q=${encodeURIComponent(
            groupSearch
          )}`
        );
        if (!res.ok) throw new Error("Failed to fetch groups");
        const data = await res.json();
        setGroups(data.items);
        setTotalGroups(data.total);
      } catch (error) {
        console.error(error);
      } finally {
        setIsGroupsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchGroups();
    }, 300);

    return () => clearTimeout(timer);
  }, [groupPage, groupSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Members
  useEffect(() => {
    if (memberPage === 1 && memberSearch === "" && memberSort === "asc" && members === initialMembers) return;

    const fetchMembers = async () => {
      setIsMembersLoading(true);
      try {
        const res = await fetch(
          `/api/reports/members?page=${memberPage}&limit=${limit}&q=${encodeURIComponent(
            memberSearch
          )}&sort=${memberSort}`
        );
        if (!res.ok) throw new Error("Failed to fetch members");
        const data = await res.json();
        setMembers(data.items);
        setTotalMembers(data.total);
      } catch (error) {
        console.error(error);
      } finally {
        setIsMembersLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchMembers();
    }, 300);

    return () => clearTimeout(timer);
  }, [memberPage, memberSearch, memberSort]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset page when search changes
  useEffect(() => {
    setGroupPage(1);
  }, [groupSearch]);

  useEffect(() => {
    setMemberPage(1);
  }, [memberSearch, memberSort]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Export group data</h2>
            <p className="mt-1 text-sm text-slate-500">
              Download a report for a group (members, balances, savings, adjustments).
            </p>
          </div>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              <IconSearch className="h-4 w-4" />
            </div>
            <input
              type="text"
              placeholder="Search groups..."
              className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
            />
          </div>
        </div>

        <PaginationControls
          currentPage={groupPage}
          totalPages={totalGroupPages}
          onPageChange={setGroupPage}
          isLoading={isGroupsLoading}
          className="mb-4"
        />

        <div className="overflow-x-auto relative">
          {isGroupsLoading && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center text-slate-500 text-sm">Loading...</div>}
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">Group</th>
                <th className="py-2 pr-4 text-center">Members</th>
                <th className="py-2 pr-0 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {groups.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="py-2 pr-4 font-medium text-slate-900">
                    <Link href={`/app/groups/${g.id}`} className="hover:underline">
                      {g.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-center text-slate-600">
                    {g._count?.members || 0}
                  </td>
                  <td className="py-2 pr-0 text-right">
                    <a
                      href={`/api/groups/${g.id}/export?${query}`}
                      title="Download group report (PDF)"
                      className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
              {groups.length === 0 && !isGroupsLoading ? (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={2}>
                    No groups found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <PaginationControls
          currentPage={groupPage}
          totalPages={totalGroupPages}
          onPageChange={setGroupPage}
          isLoading={isGroupsLoading}
          className="mt-4 border-t border-slate-200 pt-4"
        />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Daily collection report (per officer)
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Download a daily collection summary per collection officer and their groups.
              </p>
            </div>
            <div className="flex flex-col items-start gap-1 text-sm text-slate-600">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Report date
              </span>
              <input
                type="date"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                value={officerDate}
                onChange={(e) => setOfficerDate(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Collection officer</th>
                  <th className="py-2 pr-0 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {initialOfficers.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-900">
                      <div>
                        <div>
                          {o.lastName}, {o.firstName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                          <span className="text-slate-500">Groups:</span>
                          {o.groupsAsCollectionOfficer.length > 0 ? (
                            o.groupsAsCollectionOfficer.map((g) => (
                              <span
                                key={g.id}
                                className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600"
                              >
                                {g.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500">None</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-0 text-right">
                      <a
                        href={`/api/employees/${o.id}/collection-report?${officerQuery}`}
                        title="Download daily collection report (PDF)"
                        className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
                {initialOfficers.length === 0 ? (
                  <tr>
                    <td className="py-4 text-slate-500" colSpan={2}>
                      No collection officers found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Export member data</h2>
            <p className="mt-1 text-sm text-slate-500">
              Download a report for a member (balance history, savings accruals, adjustments).
            </p>
          </div>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              <IconSearch className="h-4 w-4" />
            </div>
            <input
              type="text"
              placeholder="Search members..."
              className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
          </div>
        </div>

        <PaginationControls
          currentPage={memberPage}
          totalPages={totalMemberPages}
          onPageChange={setMemberPage}
          isLoading={isMembersLoading}
          className="mb-4"
        />

        <div className="overflow-x-auto relative">
          {isMembersLoading && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center text-slate-500 text-sm">Loading...</div>}
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">
                  <button
                    onClick={() => setMemberSort(s => s === "asc" ? "desc" : "asc")}
                    className="flex items-center gap-1 hover:text-slate-700 group"
                  >
                    Member
                    <span className="text-slate-500 group-hover:text-slate-600">
                      {memberSort === "asc" ? <IconChevronUp className="h-3 w-3" /> : <IconChevronDown className="h-3 w-3" />}
                    </span>
                  </button>
                </th>
                <th className="py-2 pr-0 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="py-2 pr-4 font-medium text-slate-900">
                    <Link href={`/app/members/${m.id}`} className="hover:underline">
                      {m.lastName}, {m.firstName}
                    </Link>
                  </td>
                  <td className="py-2 pr-0 text-right">
                    <a
                      href={`/api/members/${m.id}/export?${query}`}
                      title="Download member report (PDF)"
                      className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
              {members.length === 0 && !isMembersLoading ? (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={2}>
                    No members found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <PaginationControls
          currentPage={memberPage}
          totalPages={totalMemberPages}
          onPageChange={setMemberPage}
          isLoading={isMembersLoading}
          className="mt-4 border-t border-slate-200 pt-4"
        />
      </div>
    </div>
  );
}