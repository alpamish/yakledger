// Machinery daily-log service (Phase 3).
//
// One operating record per machine per day (unique machineryId+date).
// Validation: closingMeter must exceed openingMeter; the day's meter jump
// (closing - opening) above Machinery.meterJumpThreshold flags the record for
// review. A threshold of null/0 on the machine means flagging is disabled.
import { db } from "@/lib/db";

export class DailyLogError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "DailyLogError";
  }
}

/** Normalize any date input to UTC midnight so the (machineryId, date)
 * uniqueness constraint is stable regardless of time-of-day input. */
export function normalizeLogDate(input: Date): Date {
  return new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate())
  );
}

interface MeterFields {
  openingMeter: number;
  closingMeter: number;
}

interface ThresholdSource {
  meterJumpThreshold?: number | null;
}

function computeFlag(
  readings: MeterFields,
  machinery: ThresholdSource
): { flagged: boolean; flagReason: string | null } {
  const threshold = machinery.meterJumpThreshold ?? 0;
  const jump = Math.round((readings.closingMeter - readings.openingMeter) * 100) / 100;
  if (threshold > 0 && jump > threshold) {
    return {
      flagged: true,
      flagReason: `Meter jump ${jump} exceeds threshold ${threshold}`,
    };
  }
  return { flagged: false, flagReason: null };
}

export interface CreateDailyLogInput {
  machineryId: string;
  contractId?: string | null;
  date: Date;
  openingMeter: number;
  closingMeter: number;
  normalHours?: number;
  overtimeHours?: number;
  idleHours?: number;
  breakdownHours?: number;
  weather?: string | null;
  delayReason?: string | null;
  operator?: string | null;
  loggedBy: string;
  userId: string;
}

async function loadMachinery(machineryId: string) {
  const machinery = await db.machinery.findUnique({
    where: { id: machineryId },
    select: {
      id: true,
      meterJumpThreshold: true,
      assignedContractorId: true,
    },
  });
  if (!machinery) throw new DailyLogError("Machinery not found", 404);
  return machinery;
}

export async function createDailyLog(input: CreateDailyLogInput) {
  if (input.closingMeter <= input.openingMeter) {
    throw new DailyLogError("Closing meter must be greater than opening meter");
  }

  const machinery = await loadMachinery(input.machineryId);
  const date = normalizeLogDate(input.date);
  const { flagged, flagReason } = computeFlag(input, machinery);

  try {
    return await db.machineryDailyLog.create({
      data: {
        date,
        machineryId: input.machineryId,
        contractId: input.contractId ?? null,
        openingMeter: input.openingMeter,
        closingMeter: input.closingMeter,
        normalHours: input.normalHours ?? 0,
        overtimeHours: input.overtimeHours ?? 0,
        idleHours: input.idleHours ?? 0,
        breakdownHours: input.breakdownHours ?? 0,
        weather: input.weather ?? null,
        delayReason: input.delayReason ?? null,
        operator: input.operator ?? null,
        flagged,
        flagReason,
        loggedBy: input.loggedBy,
        createdBy: input.userId,
      },
    });
  } catch (error: any) {
    // P2002: unique (machineryId, date) violation.
    if (error?.code === "P2002") {
      throw new DailyLogError("A log already exists for this machine on that date", 409);
    }
    throw error;
  }
}

export interface UpdateDailyLogInput {
  date?: Date;
  contractId?: string | null;
  openingMeter?: number;
  closingMeter?: number;
  normalHours?: number;
  overtimeHours?: number;
  idleHours?: number;
  breakdownHours?: number;
  weather?: string | null;
  delayReason?: string | null;
  operator?: string | null;
}

export async function updateDailyLog(logId: string, input: UpdateDailyLogInput) {
  const existing = await db.machineryDailyLog.findUnique({
    where: { id: logId },
    select: {
      id: true,
      machineryId: true,
      date: true,
      openingMeter: true,
      closingMeter: true,
    },
  });
  if (!existing) throw new DailyLogError("Daily log not found", 404);

  const openingMeter = input.openingMeter ?? existing.openingMeter;
  const closingMeter = input.closingMeter ?? existing.closingMeter;
  if (closingMeter <= openingMeter) {
    throw new DailyLogError("Closing meter must be greater than opening meter");
  }

  const machinery = await loadMachinery(existing.machineryId);
  const readings = { openingMeter, closingMeter };
  const { flagged, flagReason } = computeFlag(readings, machinery);
  const date = input.date ? normalizeLogDate(input.date) : existing.date;

  try {
    return await db.machineryDailyLog.update({
      where: { id: logId },
      data: {
        date,
        ...(input.contractId !== undefined ? { contractId: input.contractId } : {}),
        openingMeter,
        closingMeter,
        ...(input.normalHours !== undefined ? { normalHours: input.normalHours } : {}),
        ...(input.overtimeHours !== undefined ? { overtimeHours: input.overtimeHours } : {}),
        ...(input.idleHours !== undefined ? { idleHours: input.idleHours } : {}),
        ...(input.breakdownHours !== undefined ? { breakdownHours: input.breakdownHours } : {}),
        ...(input.weather !== undefined ? { weather: input.weather } : {}),
        ...(input.delayReason !== undefined ? { delayReason: input.delayReason } : {}),
        ...(input.operator !== undefined ? { operator: input.operator } : {}),
        flagged,
        flagReason,
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      throw new DailyLogError("A log already exists for this machine on that date", 409);
    }
    throw error;
  }
}

export async function deleteDailyLog(logId: string) {
  const existing = await db.machineryDailyLog.findUnique({
    where: { id: logId },
    select: { id: true },
  });
  if (!existing) throw new DailyLogError("Daily log not found", 404);
  await db.machineryDailyLog.delete({ where: { id: logId } });
  return true;
}

export async function listDailyLogs(filters: {
  where: Record<string, unknown>;
  page: number;
  pageSize: number;
}) {
  const { where, page, pageSize } = filters;
  const [total, logs] = await Promise.all([
    db.machineryDailyLog.count({ where }),
    db.machineryDailyLog.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        contract: { select: { id: true, contractNumber: true, title: true } },
      },
    }),
  ]);
  return { total, page, pageSize, data: logs };
}
