// Contractor lifecycle service (Phase 5).
//
// suspend / blacklist / reactivate with a required reason and guarded
// transitions. ARCHIVED contractors are managed by the Phase 1 archive
// mechanics (delete/archive routes), not here.
//
// Transition rules:
//   suspend:    ACTIVE | INACTIVE      → SUSPENDED
//   blacklist:  ACTIVE | INACTIVE | SUSPENDED → BLACKLISTED
//   reactivate: SUSPENDED | BLACKLISTED → ACTIVE
import { db } from "@/lib/db";

export class LifecycleError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "LifecycleError";
  }
}

export type LifecycleAction = "suspend" | "blacklist" | "reactivate";

export interface LifecycleInput {
  contractorId: string;
  action: LifecycleAction;
  /** Required for suspend/blacklist; ignored on reactivate. */
  reason?: string | null;
  userId: string;
}

const ALLOWED_FROM: Record<LifecycleAction, string[]> = {
  suspend: ["ACTIVE", "INACTIVE"],
  blacklist: ["ACTIVE", "INACTIVE", "SUSPENDED"],
  reactivate: ["SUSPENDED", "BLACKLISTED"],
};

const TARGET: Record<LifecycleAction, string> = {
  suspend: "SUSPENDED",
  blacklist: "BLACKLISTED",
  reactivate: "ACTIVE",
};

const ACTION_LABEL: Record<LifecycleAction, string> = {
  suspend: "Suspended",
  blacklist: "Blacklisted",
  reactivate: "Reactivated",
};

export async function changeLifecycle(input: LifecycleInput) {
  const { action, contractorId, userId } = input;
  const reason = input.reason?.trim() || null;

  if ((action === "suspend" || action === "blacklist") && !reason) {
    throw new LifecycleError("A reason is required");
  }

  const contractor = await db.contractor.findUnique({
    where: { id: contractorId },
    select: { id: true, contractorName: true, status: true },
  });
  if (!contractor) throw new LifecycleError("Contractor not found", 404);
  if (!ALLOWED_FROM[action].includes(contractor.status)) {
    throw new LifecycleError(
      `Cannot ${action} a contractor with status ${contractor.status}`
    );
  }

  return db.$transaction(async (tx: any) => {
    const now = new Date();
    const updated = await tx.contractor.update({
      where: { id: contractorId },
      data: {
        status: TARGET[action],
        statusChangedById: userId,
        ...(action === "suspend"
          ? { suspendedAt: now, suspendedReason: reason }
          : {}),
        ...(action === "blacklist"
          ? { blacklistedAt: now, blacklistedReason: reason }
          : {}),
        ...(action === "reactivate"
          ? {
              suspendedAt: null,
              suspendedReason: null,
              blacklistedAt: null,
              blacklistedReason: null,
            }
          : {}),
      },
      select: {
        id: true,
        contractorName: true,
        status: true,
        suspendedAt: true,
        suspendedReason: true,
        blacklistedAt: true,
        blacklistedReason: true,
        statusChangedById: true,
        updatedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Contractor",
        entityId: contractorId,
        details: `${ACTION_LABEL[action]} contractor ${contractor.contractorName}${
          reason ? ` — ${reason}` : ""
        } (was ${contractor.status})`,
        userId,
      },
    });

    return updated;
  });
}
