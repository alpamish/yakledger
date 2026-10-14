// Machinery assignment service (Phase 3).
//
// MachineryAssignment rows are the transfer history for a machine.
// Machinery.assignedContractorId is a denormalized pointer to the contractor
// of the active assignment, always maintained inside the same transaction as
// the assignment change so history and pointer can never diverge.
//
// Pointer derivation: the contractor of the latest ACTIVE assignment
// (startDate <= today and endDate null or >= today); when no assignment is
// active the most recent one by startDate wins ("last known" contractor);
// machinery that never had an assignment keeps its column as-is (legacy rows
// created before Phase 3).
import { db } from "@/lib/db";

export class AssignmentError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "AssignmentError";
  }
}

export interface AssignmentActor {
  userId: string;
  // Display name used for transferredBy when the caller does not supply one.
  userName: string;
}

export interface TransferInput {
  contractorId: string;
  startDate: Date;
  contractId?: string | null;
  projectName?: string | null;
  transferredBy?: string | null;
  notes?: string | null;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Create the very first assignment for a machine at creation time, so every
 * machine has a transfer history from day one. Assumes the caller has just
 * created the machinery row (pointer already set by the caller).
 */
export async function createInitialAssignment(
  tx: any,
  machinery: { id: string; assignedContractorId: string; contractStartDate?: Date | null },
  ctx: AssignmentActor
) {
  return tx.machineryAssignment.create({
    data: {
      machineryId: machinery.id,
      contractorId: machinery.assignedContractorId,
      startDate: machinery.contractStartDate ?? new Date(),
      transferredBy: ctx.userName,
      notes: "Initial assignment",
      createdBy: ctx.userId,
    },
  });
}

/**
 * Record a transfer to `input.contractorId`: close every assignment the new
 * one supersedes, backfill a first row for the previous contractor when the
 * machine predates assignment tracking, create the new open row, and repoint
 * machinery.assignedContractorId. All inside the caller's transaction.
 */
export async function applyTransfer(
  tx: any,
  machinery: {
    id: string;
    assignedContractorId: string;
    contractStartDate?: Date | null;
    createdAt: Date;
  },
  input: TransferInput,
  ctx: AssignmentActor
) {
  const latest = await tx.machineryAssignment.findFirst({
    where: { machineryId: machinery.id },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, startDate: true },
  });

  if (latest && input.startDate < latest.startDate) {
    throw new AssignmentError(
      "Start date precedes the latest assignment; edit that assignment instead"
    );
  }

  // Close every assignment the transfer supersedes (open-ended ones and any
  // still running on the transfer date).
  await tx.machineryAssignment.updateMany({
    where: {
      machineryId: machinery.id,
      OR: [{ endDate: null }, { endDate: { gte: input.startDate } }],
    },
    data: { endDate: input.startDate },
  });

  // Machines created before Phase 3 have a contractor but no history: record
  // a backfilled first assignment so the transfer chain is complete. The row
  // never starts after the transfer itself (backdated transfers on machines
  // without a contractStartDate would otherwise sort out of order).
  if (!latest && machinery.assignedContractorId !== input.contractorId) {
    const preferredStart = machinery.contractStartDate ?? machinery.createdAt;
    await tx.machineryAssignment.create({
      data: {
        machineryId: machinery.id,
        contractorId: machinery.assignedContractorId,
        startDate: preferredStart < input.startDate ? preferredStart : input.startDate,
        endDate: input.startDate,
        transferredBy: ctx.userName,
        notes: "Backfilled initial assignment (recorded on first transfer)",
        createdBy: ctx.userId,
      },
    });
  }

  const assignment = await tx.machineryAssignment.create({
    data: {
      machineryId: machinery.id,
      contractorId: input.contractorId,
      contractId: input.contractId ?? null,
      projectName: input.projectName ?? null,
      startDate: input.startDate,
      transferredBy: input.transferredBy ?? ctx.userName,
      notes: input.notes ?? null,
      createdBy: ctx.userId,
    },
  });

  await tx.machinery.update({
    where: { id: machinery.id },
    data: { assignedContractorId: input.contractorId },
  });

  return assignment;
}

/**
 * Close an assignment on `endDate` and repoint the machinery pointer to the
 * active (or most recent) assignment.
 */
export async function endAssignment(assignmentId: string, endDate: Date, ctx: AssignmentActor) {
  const assignment = await db.machineryAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, startDate: true, machineryId: true },
  });
  if (!assignment) throw new AssignmentError("Assignment not found", 404);
  if (endDate < assignment.startDate) {
    throw new AssignmentError("End date cannot be before the start date");
  }

  return db.$transaction(async (tx: any) => {
    const updated = await tx.machineryAssignment.update({
      where: { id: assignmentId },
      data: { endDate },
      include: {
        contractor: { select: { id: true, contractorName: true } },
        contract: { select: { id: true, contractNumber: true, title: true } },
      },
    });

    await recomputeAssignedContractor(tx, assignment.machineryId);
    return updated;
  });
}

/**
 * Repoint machinery.assignedContractorId from the assignment history:
 * active assignment first, else the most recent one, else unchanged.
 */
export async function recomputeAssignedContractor(tx: any, machineryId: string) {
  const rows = await tx.machineryAssignment.findMany({
    where: { machineryId },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: { contractorId: true, startDate: true, endDate: true },
  });

  const today = startOfToday();
  const target =
    rows.find(
      (r: any) => r.startDate <= today && (!r.endDate || r.endDate >= today)
    ) ?? rows[0];
  if (!target) return null; // no history: keep the column as-is

  await tx.machinery.update({
    where: { id: machineryId },
    data: { assignedContractorId: target.contractorId },
  });
  return target.contractorId;
}

/** Transfer history for one machine, newest first. */
export async function listAssignments(machineryId: string) {
  return db.machineryAssignment.findMany({
    where: { machineryId },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    include: {
      contractor: {
        select: { id: true, contractorName: true, contractorNumber: true, contractorType: true },
      },
      contract: { select: { id: true, contractNumber: true, title: true } },
    },
  });
}

export async function getAssignment(assignmentId: string) {
  return db.machineryAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      contractor: { select: { id: true, contractorName: true, contractorNumber: true } },
      contract: { select: { id: true, contractNumber: true, title: true } },
    },
  });
}

/** Editable fields on an existing assignment row (dates + context only). */
export async function updateAssignment(
  assignmentId: string,
  data: {
    startDate?: Date;
    endDate?: Date | null;
    contractId?: string | null;
    projectName?: string | null;
    transferredBy?: string;
    notes?: string | null;
  }
) {
  const existing = await db.machineryAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, startDate: true, endDate: true, machineryId: true },
  });
  if (!existing) throw new AssignmentError("Assignment not found", 404);

  const startDate = data.startDate ?? existing.startDate;
  const endDate = data.endDate === undefined ? existing.endDate : data.endDate;
  if (endDate && endDate < startDate) {
    throw new AssignmentError("End date cannot be before the start date");
  }

  return db.$transaction(async (tx: any) => {
    const updated = await tx.machineryAssignment.update({
      where: { id: assignmentId },
      data: {
        ...(data.startDate ? { startDate: data.startDate } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
        ...(data.contractId !== undefined ? { contractId: data.contractId } : {}),
        ...(data.projectName !== undefined ? { projectName: data.projectName } : {}),
        ...(data.transferredBy ? { transferredBy: data.transferredBy } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: {
        contractor: { select: { id: true, contractorName: true } },
        contract: { select: { id: true, contractNumber: true, title: true } },
      },
    });
    await recomputeAssignedContractor(tx, existing.machineryId);
    return updated;
  });
}
