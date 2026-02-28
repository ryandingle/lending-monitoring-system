import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { EmployeePosition, Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { SubmitButton } from "../../_components/submit-button";
import { z } from "zod";
import Link from "next/link";
import { revalidatePath } from "next/cache";

const POSITION_LABELS: Record<EmployeePosition, string> = {
    COLLECTION_OFFICER: "Collection officer",
    OFFICE_CLERK: "Office clerk",
    UNIT_MANAGER: "Unit manager",
    OPERATIONS_MANAGER: "Operations manager",
};

const UpdateEmployeeSchema = z.object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    position: z.enum([
        "COLLECTION_OFFICER",
        "OFFICE_CLERK",
        "UNIT_MANAGER",
        "OPERATIONS_MANAGER",
    ]),
    assignedGroupIds: z.union([z.string(), z.array(z.string())]).optional(),
});

async function updateEmployeeAction(employeeId: string, formData: FormData) {
    "use server";

    const user = await requireUser();
    requireRole(user, [Role.SUPER_ADMIN]);

    const rawGroupIds = formData.getAll("assignedGroupIds");
    const assignedGroupIds = rawGroupIds.map(String).filter(Boolean);

    const parsed = UpdateEmployeeSchema.safeParse({
        firstName: String(formData.get("firstName") || "").trim(),
        lastName: String(formData.get("lastName") || "").trim(),
        position: String(formData.get("position") || ""),
        assignedGroupIds,
    });

    if (!parsed.success) redirect(`/app/employees/${employeeId}?updated=0`);

    const request = await tryGetAuditRequestContext();

    try {
        await prisma.$transaction(async (tx) => {
            await tx.employee.update({
                where: { id: employeeId },
                data: {
                    firstName: parsed.data.firstName,
                    lastName: parsed.data.lastName,
                    position: parsed.data.position as EmployeePosition,
                    groupsAsCollectionOfficer: {
                        set: assignedGroupIds.map((id) => ({ id })),
                    },
                },
            });

            await createAuditLog(tx, {
                actorUserId: user.id,
                action: "EMPLOYEE_UPDATE",
                entityType: "Employee",
                entityId: employeeId,
                metadata: {
                    firstName: parsed.data.firstName,
                    lastName: parsed.data.lastName,
                    position: parsed.data.position,
                    assignedGroupIds,
                },
                request,
            });
        });
    } catch (e) {
        console.error(e);
        redirect(`/app/employees/${employeeId}?updated=0`);
    }

    revalidatePath("/app/employees");
    redirect(`/app/employees/${employeeId}?updated=1`);
}

export default async function EmployeeDetailsPage({
    params,
    searchParams,
}: {
    params: Promise<{ employeeId: string }>;
    searchParams: Promise<{ updated?: string }>;
}) {
    const user = await requireUser();
    requireRole(user, [Role.SUPER_ADMIN]);
    const { employeeId } = await params;
    const sp = await searchParams;

    const [employee, groups] = await Promise.all([
        prisma.employee.findUnique({
            where: { id: employeeId },
            include: {
                groupsAsCollectionOfficer: { select: { id: true } },
            },
        }),
        prisma.group.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true, collectionOfficerId: true },
        }),
    ]);

    if (!employee) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-sm text-slate-500">Employee not found.</div>
                <div className="mt-4">
                    <Link href="/app/employees" className="text-sm font-medium text-slate-700 hover:underline">
                        Back to Employees
                    </Link>
                </div>
            </div>
        );
    }

    const assignedIds = new Set(employee.groupsAsCollectionOfficer.map((g) => g.id));

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <Link href="/app/employees" className="text-sm text-slate-500 hover:text-slate-700">
                        ← Back to Employees
                    </Link>
                    <div className="text-right">
                        <h1 className="text-xl font-semibold text-slate-900">{employee.firstName} {employee.lastName}</h1>
                        <p className="text-xs text-slate-500">Edit Employee Details</p>
                    </div>
                </div>

                {sp.updated === "1" ? (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        Employee updated successfully.
                    </div>
                ) : sp.updated === "0" ? (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        Update failed.
                    </div>
                ) : null}

                <form action={updateEmployeeAction.bind(null, employeeId)} className="mt-8 grid gap-6 max-w-3xl">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium text-slate-700">First Name</label>
                            <input
                                name="firstName"
                                defaultValue={employee.firstName}
                                required
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">Last Name</label>
                            <input
                                name="lastName"
                                defaultValue={employee.lastName}
                                required
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-700">Position</label>
                        <select
                            name="position"
                            defaultValue={employee.position}
                            required
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        >
                            {(Object.entries(POSITION_LABELS) as [EmployeePosition, string][]).map(
                                ([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                )
                            )}
                        </select>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-700">Assign Groups</label>
                        <div className="mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <div className="space-y-2">
                                {groups.map((group) => (
                                    <label key={group.id} className="flex items-center gap-2 hover:bg-slate-100 p-1 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="assignedGroupIds"
                                            value={group.id}
                                            defaultChecked={assignedIds.has(group.id)}
                                            className="h-4 w-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-600/20"
                                        />
                                        <span className="text-sm text-slate-700">{group.name}</span>
                                        {group.collectionOfficerId && !assignedIds.has(group.id) ? (
                                            <span className="text-xs text-slate-500">(Already assigned)</span>
                                        ) : null}
                                    </label>
                                ))}
                                {groups.length === 0 && (
                                    <div className="text-xs text-slate-500">No groups available.</div>
                                )}
                            </div>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                            Select groups this employee will manage.
                        </p>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-slate-200">
                        <SubmitButton loadingText="Saving Changes...">
                            Save Changes
                        </SubmitButton>
                    </div>
                </form>
            </div>
        </div>
    );
}
