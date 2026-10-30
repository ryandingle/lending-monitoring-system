"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { showAppToast } from "../_components/app-toast";
import {
  IconSearch,
  IconChevronUp,
  IconChevronDown,
  IconEye,
  IconX,
  IconFileText,
  IconShield,
  IconDownload,
} from "../_components/icons";
import { useReportsRange } from "./reports-range";

type ReportActionInfo = {
  locked: boolean;
  createdAtIso: string | null;
  actedByName: string | null;
};

type ReportActionStatus = {
  download: ReportActionInfo;
};

type Group = { id: string; name: string; activeMemberCount: number; reportActions: ReportActionStatus };
type Member = { id: string; firstName: string; lastName: string; reportActions: ReportActionStatus };
type Officer = {
  id: string;
  firstName: string;
  lastName: string;
  groupsAsCollectionOfficer: { id: string; name: string }[];
  reportActions: ReportActionStatus;
};

type ExportControlState = {
  key: string;
  enabled: boolean;
  expiresAtIso: string | null;
  isExpired: boolean;
};

const ROLE_SUPER_ADMIN = "SUPER_ADMIN";
const ROLE_ENCODER = "ENCODER";
const REPORT_CONTROL_KEY = "REPORT_VIEW_DOWNLOAD_ENABLED";

interface ReportsClientProps {
  initialGroups: Group[];
  initialTotalGroups: number;
  initialMembers: Member[];
  initialTotalMembers: number;
  initialOfficers: Officer[];
  userRole: string;
  initialExportControl: ExportControlState;
}

type ReportKind = "group" | "officer" | "member";
type ReportActionKind = "download";

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
  userRole,
  initialExportControl,
}: ReportsClientProps) {
  // Range comes from the date filter's live state, so View/Download always use
  // whatever the user has selected without needing an Apply step.
  const { from, to } = useReportsRange();
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

  const [officers, setOfficers] = useState(initialOfficers);

  const [exportControl, setExportControl] = useState<ExportControlState>(initialExportControl);
  const [isToggleLoading, setIsToggleLoading] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);

  const isSuperAdmin = userRole === ROLE_SUPER_ADMIN;

  const nonAdminControlEnabled = exportControl.enabled && !exportControl.isExpired;

  const canAccessGroupReport = isSuperAdmin || nonAdminControlEnabled;
  const canAccessOfficerReport = isSuperAdmin || userRole === ROLE_ENCODER || nonAdminControlEnabled;
  const canAccessMemberReport = isSuperAdmin || nonAdminControlEnabled;

  useEffect(() => {
    const id = setInterval(() => {
      setExportControl((prev) => {
        if (!prev.expiresAtIso) return prev;
        const expired = new Date(prev.expiresAtIso).getTime() <= Date.now();
        if (expired !== prev.isExpired) {
          return { ...prev, isExpired: expired, enabled: expired ? false : prev.enabled };
        }
        return prev;
      });
    }, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const handleToggleControl = async () => {
    if (!isSuperAdmin) return;
    setIsToggleLoading(true);
    try {
      const action = exportControl.enabled && !exportControl.isExpired ? "disable" : "enable";
      const res = await fetch("/api/app-controls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: REPORT_CONTROL_KEY, action }),
      });
      if (res.ok) {
        const body = await res.json();
        const c = body.data;
        setExportControl({
          key: c.key,
          enabled: c.enabled,
          expiresAtIso: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
          isExpired: c.isExpired,
        });
      }
    } finally {
      setIsToggleLoading(false);
    }
  };

  // Preview Modal State
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<ReportKind | null>(null);
  const [previewEntityId, setPreviewEntityId] = useState<string | null>(null);

  useEffect(() => {
    setGroups(initialGroups);
    setTotalGroups(initialTotalGroups);
    setGroupPage(1);
  }, [initialGroups, initialTotalGroups]);

  useEffect(() => {
    setMembers(initialMembers);
    setTotalMembers(initialTotalMembers);
    setMemberPage(1);
  }, [initialMembers, initialTotalMembers]);

  useEffect(() => {
    setOfficers(initialOfficers);
  }, [initialOfficers]);

  const buildReportBaseUrl = useCallback(
    (type: ReportKind, id: string) => {
      if (type === "group") {
        return `/api/groups/${id}/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      }
      if (type === "officer") {
        return `/api/employees/${id}/collection-report?from=${encodeURIComponent(
          from,
        )}&to=${encodeURIComponent(to)}`;
      }
      return `/api/members/${id}/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    },
    [from, to],
  );

  const getLockPeriodLabel = useCallback(
    (type: ReportKind) => (type === "officer" ? "today" : "this week"),
    [],
  );

  const getLockedTitle = useCallback((info: ReportActionInfo, label: string, type: ReportKind) => {
    if (!info.locked) return label;

    const when = info.createdAtIso
      ? new Date(info.createdAtIso).toLocaleString("en-PH", {
          timeZone: "Asia/Manila",
        })
      : getLockPeriodLabel(type);

    return info.actedByName ? `${label} already used by ${info.actedByName} on ${when}` : `${label} already used on ${when}`;
  }, [getLockPeriodLabel]);

  const isActionLocked = useCallback(
    (status: ReportActionStatus | null, action: ReportActionKind) =>
      !isSuperAdmin && Boolean(status?.[action].locked),
    [isSuperAdmin],
  );

  const updateReportActions = useCallback(
    (
      type: ReportKind,
      id: string,
      action: ReportActionKind,
      createdAtIso: string,
      actedByName: string | null = null,
    ) => {
      const nextInfo = {
        locked: true,
        createdAtIso,
        actedByName,
      };

      if (type === "group") {
        setGroups((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, reportActions: { ...item.reportActions, [action]: nextInfo } }
              : item,
          ),
        );
        return;
      }

      if (type === "officer") {
        setOfficers((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, reportActions: { ...item.reportActions, [action]: nextInfo } }
              : item,
          ),
        );
        return;
      }

      setMembers((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, reportActions: { ...item.reportActions, [action]: nextInfo } }
            : item,
        ),
      );
    },
    [],
  );

  const handleView = async (type: ReportKind, id: string) => {
    if (type === "group" && !canAccessGroupReport) return;
    if (type === "officer" && !canAccessOfficerReport) return;
    if (type === "member" && !canAccessMemberReport) return;
    setPreviewType(type);
    setPreviewEntityId(id);
    setPreviewUrl(`${buildReportBaseUrl(type, id)}&preview=true`);
  };

  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewType(null);
    setPreviewEntityId(null);
  };

  const getReportActions = useCallback(
    (type: ReportKind, id: string): ReportActionStatus | null => {
      if (type === "group") {
        return groups.find((item) => item.id === id)?.reportActions ?? null;
      }
      if (type === "officer") {
        return officers.find((item) => item.id === id)?.reportActions ?? null;
      }
      return members.find((item) => item.id === id)?.reportActions ?? null;
    },
    [groups, members, officers],
  );

  const getActionButtonKey = useCallback(
    (type: ReportKind, id: string, action: ReportActionKind) => `${type}:${id}:${action}`,
    [],
  );

  const extractFilename = useCallback((header: string | null, fallback: string) => {
    if (!header) return fallback;
    const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utfMatch?.[1]) {
      return decodeURIComponent(utfMatch[1]);
    }
    const plainMatch = header.match(/filename=\"?([^\";]+)\"?/i);
    return plainMatch?.[1] ?? fallback;
  }, []);

  const handleReportAction = useCallback(
    async (type: ReportKind, id: string, action: ReportActionKind) => {
      const status = getReportActions(type, id);
      const actionInfo = status?.[action] ?? null;
      if (actionInfo && isActionLocked(status, action)) {
        showAppToast("warning", getLockedTitle(actionInfo, `Download already used ${getLockPeriodLabel(type)}.`, type));
        return;
      }

      const requestUrl = `${buildReportBaseUrl(type, id)}&action=${action}`;
      const loadingKey = getActionButtonKey(type, id, action);
      setActionLoadingKey(loadingKey);

      try {
        const res = await fetch(requestUrl, {
          method: "GET",
          cache: "no-store",
        });

        if (res.status === 409) {
          const body = await res.json().catch(() => null);
          const message = body?.error ?? `Download has already been used for this report ${getLockPeriodLabel(type)}.`;
          showAppToast("warning", message);

          const createdAtIso =
            typeof body?.lock?.createdAt === "string" ? body.lock.createdAt : new Date().toISOString();
          const actedByName = typeof body?.lock?.actedByName === "string" ? body.lock.actedByName : null;
          updateReportActions(type, id, action, createdAtIso, actedByName);
          return;
        }

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const fallbackName = `${type}-report-${id}.pdf`;
        const filename = extractFilename(res.headers.get("content-disposition"), fallbackName);

        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showAppToast("success", "Report downloaded.");

        updateReportActions(type, id, action, new Date().toISOString());
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      } catch (error) {
        console.error(error);
        showAppToast("error", `Failed to ${action} report.`);
      } finally {
        setActionLoadingKey(null);
      }
    },
    [
      buildReportBaseUrl,
      extractFilename,
      getActionButtonKey,
      getLockPeriodLabel,
      getLockedTitle,
      getReportActions,
      isActionLocked,
      updateReportActions,
    ],
  );

  const previewActions =
    previewType && previewEntityId ? getReportActions(previewType, previewEntityId) : null;
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
      {isSuperAdmin ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Report export access control
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {exportControl.enabled && !exportControl.isExpired
                  ? "Encoders can view/download reports today. Access will automatically disable at end of day in Asia/Manila timezone."
                  : "Encoders cannot view/download reports. SUPER_ADMIN is always allowed."}
                {exportControl.expiresAtIso && exportControl.enabled && !exportControl.isExpired ? (
                  <span className="block mt-1 text-[11px] text-slate-400">
                    Auto-disables at{" "}
                    {new Date(exportControl.expiresAtIso).toLocaleString("en-PH", {
                      timeZone: "Asia/Manila",
                    })}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleControl}
              disabled={isToggleLoading}
              className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                exportControl.enabled && !exportControl.isExpired
                  ? "border-red-100 bg-red-50 text-red-700 hover:bg-red-100"
                  : "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              <IconShield className="h-4 w-4" />
              {isToggleLoading
                ? "Saving..."
                : exportControl.enabled && !exportControl.isExpired
                ? "Disable access (today only)"
                : "Enable access until end of day"}
            </button>
          </div>
        </div>
      ) : null}

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
                    {g.activeMemberCount || 0}
                  </td>
                  <td className="py-2 pr-0 text-right flex justify-end gap-2">
                    {canAccessGroupReport ? (
                      <>
                        <button
                          onClick={() => handleView("group", g.id)}
                          disabled={actionLoadingKey !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <IconEye className="h-4 w-4" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReportAction("group", g.id, "download")}
                          disabled={
                            actionLoadingKey === getActionButtonKey("group", g.id, "download") ||
                            isActionLocked(g.reportActions, "download")
                          }
                          title={
                            isSuperAdmin
                              ? "Download group report"
                              : getLockedTitle(g.reportActions.download, "Download group report", "group")
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <IconDownload className="h-4 w-4" />
                          {actionLoadingKey === getActionButtonKey("group", g.id, "download")
                            ? "Downloading..."
                            : isActionLocked(g.reportActions, "download")
                              ? "Downloaded already this week"
                              : "Download"}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Disabled</span>
                    )}
                  </td>
                </tr>
              ))}
              {groups.length === 0 && !isGroupsLoading ? (
                <tr key="empty-groups">
                  <td className="py-4 text-slate-500" colSpan={3}>
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
                Collection report (per officer)
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Download a collection summary per collection officer and their groups for the
                selected date range.
              </p>
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
                {officers.map((o) => (
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
                    <td className="py-2 pr-0 text-right flex justify-end gap-2">
                      {canAccessOfficerReport ? (
                        <>
                          <button
                            onClick={() => handleView("officer", o.id)}
                            disabled={actionLoadingKey !== null}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <IconEye className="h-4 w-4" />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReportAction("officer", o.id, "download")}
                            disabled={
                              actionLoadingKey === getActionButtonKey("officer", o.id, "download") ||
                              isActionLocked(o.reportActions, "download")
                            }
                            title={
                              isSuperAdmin
                                ? "Download officer report"
                                : getLockedTitle(o.reportActions.download, "Download officer report", "officer")
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <IconDownload className="h-4 w-4" />
                            {actionLoadingKey === getActionButtonKey("officer", o.id, "download")
                              ? "Downloading..."
                              : isActionLocked(o.reportActions, "download")
                                ? "Downloaded already today"
                                : "Download"}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Disabled</span>
                      )}
                    </td>
                  </tr>
                ))}
                {officers.length === 0 ? (
                  <tr key="empty-officers">
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
                  <td className="py-2 pr-0 text-right flex justify-end gap-2">
                    {canAccessMemberReport ? (
                      <>
                        <button
                          onClick={() => handleView("member", m.id)}
                          disabled={actionLoadingKey !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-blue-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <IconEye className="h-4 w-4" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReportAction("member", m.id, "download")}
                          disabled={
                            actionLoadingKey === getActionButtonKey("member", m.id, "download") ||
                            isActionLocked(m.reportActions, "download")
                          }
                          title={
                            isSuperAdmin
                              ? "Download member report"
                              : getLockedTitle(m.reportActions.download, "Download member report", "member")
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <IconDownload className="h-4 w-4" />
                          {actionLoadingKey === getActionButtonKey("member", m.id, "download")
                            ? "Downloading..."
                            : isActionLocked(m.reportActions, "download")
                              ? "Downloaded already this week"
                              : "Download"}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Disabled</span>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && !isMembersLoading ? (
                <tr key="empty-members">
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

      {/* Preview Modal */}
      {previewType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[90vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {previewType === "group" && "Group Report Preview"}
                  {previewType === "officer" && "Collection Report Preview"}
                  {previewType === "member" && "Member Ledger Preview"}
                </h3>
                <p className="text-sm text-slate-500">
                  {from} - {to}
                </p>
              </div>
              <button
                onClick={closePreview}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <IconX className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 bg-slate-100 p-4">
              {previewUrl ? (
                <iframe
                  src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                  className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-sm"
                  title="Report Preview"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"></div>
                  <p className="text-sm font-medium text-slate-500">Generating preview...</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                onClick={closePreview}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
              {previewUrl && previewType && previewEntityId &&
              (
                (previewType === "group" && canAccessGroupReport) ||
                (previewType === "officer" && canAccessOfficerReport) ||
                (previewType === "member" && canAccessMemberReport)
              ) ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleReportAction(previewType, previewEntityId, "download")}
                    disabled={
                      actionLoadingKey === getActionButtonKey(previewType, previewEntityId, "download") ||
                      isActionLocked(previewActions, "download")
                    }
                    title={
                      !isSuperAdmin && previewActions
                        ? getLockedTitle(previewActions.download, "Download report", previewType)
                        : "Download report"
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
                  >
                    <IconFileText className="h-4 w-4" />
                    {actionLoadingKey === getActionButtonKey(previewType, previewEntityId, "download")
                      ? "Downloading..."
                      : isActionLocked(previewActions, "download")
                        ? previewType === "officer"
                          ? "Downloaded already today"
                          : "Downloaded already this week"
                        : "Download PDF"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
