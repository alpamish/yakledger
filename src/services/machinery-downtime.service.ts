// Machinery downtime service (Phase 3).
//
// DowntimeRecord tracks breakdowns/stoppages per machine. The chargeable flag
// defaults to the active assignment contract's downtimeChargeable (the
// responsibility matrix set on the contract), falling back to true.
import { db } from "@/lib/db";

export class DowntimeError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "DowntimeError";
  }
}

/** Default chargeable flag: the active contract's downtimeChargeable, else true. */
async function resolveChargeableDefault(machineryId: string, at: Date): Promise<boolean> {
  const assignment = await db.machineryAssignment.findFirst({
    where: {
      machineryId,
      startDate: { lte: at },
      OR: [{ endDate: null }, { endDate: { gte: at } }],
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    include: { contract: { select: { downtimeChargeable: true } } },
  });
  return assignment?.contract?.downtimeChargeable ?? true;
}

export interface CreateDowntimeInput {
  machineryId: string;
  start: Date;
  end?: Date | null;
  reason: string;
  chargeable?: boolean | null;
  notes?: string | null;
  loggedBy: string;
  userId: string;
}

export async function createDowntime(input: CreateDowntimeInput) {
  const machinery = await db.machinery.findUnique({
    where: { id: input.machineryId },
    select: { id: true },
  });
  if (!machinery) throw new DowntimeError("Machinery not found", 404);

  if (input.end && input.end <= input.start) {
    throw new DowntimeError("End time must be after start time");
  }

  const chargeable =
    input.chargeable != null
      ? input.chargeable
      : await resolveChargeableDefault(input.machineryId, input.start);

  return db.downtimeRecord.create({
    data: {
      machineryId: input.machineryId,
      start: input.start,
      end: input.end ?? null,
      reason: input.reason,
      chargeable,
      notes: input.notes ?? null,
      loggedBy: input.loggedBy,
      createdBy: input.userId,
    },
  });
}

export interface UpdateDowntimeInput {
  start?: Date;
  end?: Date | null;
  reason?: string;
  chargeable?: boolean;
  notes?: string | null;
}

export async function updateDowntime(recordId: string, input: UpdateDowntimeInput) {
  const existing = await db.downtimeRecord.findUnique({
    where: { id: recordId },
    select: { id: true, start: true, end: true },
  });
  if (!existing) throw new DowntimeError("Downtime record not found", 404);

  const start = input.start ?? existing.start;
  const end = input.end === undefined ? existing.end : input.end;
  if (end && end <= start) {
    throw new DowntimeError("End time must be after start time");
  }

  return db.downtimeRecord.update({
    where: { id: recordId },
    data: {
      ...(input.start ? { start: input.start } : {}),
      ...(input.end !== undefined ? { end: input.end } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.chargeable !== undefined ? { chargeable: input.chargeable } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
}

export async function deleteDowntime(recordId: string) {
  const existing = await db.downtimeRecord.findUnique({
    where: { id: recordId },
    select: { id: true },
  });
  if (!existing) throw new DowntimeError("Downtime record not found", 404);
  await db.downtimeRecord.delete({ where: { id: recordId } });
  return true;
}

/** List downtime with durationHours computed for each record. */
export async function listDowntime(filters: {
  where: Record<string, unknown>;
  page: number;
  pageSize: number;
}) {
  const { where, page, pageSize } = filters;
  const [total, records] = await Promise.all([
    db.downtimeRecord.count({ where }),
    db.downtimeRecord.findMany({
      where,
      orderBy: [{ start: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const data = records.map((r: any) => ({
    ...r,
    durationHours: r.end
      ? Math.round(((new Date(r.end).getTime() - new Date(r.start).getTime()) / 3_600_000) * 100) /
        100
      : null,
  }));
  return { total, page, pageSize, data };
}
