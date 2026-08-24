/**
 * Fuel stock helpers.
 *
 * Container balances are derived from `FuelTransaction` rows (there is no
 * stored balance). These helpers centralize that computation so the stock
 * endpoint, containers endpoint, dashboard, and the create/update routes all
 * agree, and provide validation so a container can never be over-drawn into
 * negative stock.
 */
import type { Prisma } from "@prisma/client";

type FuelClient = Pick<Prisma.TransactionClient, "fuelTransaction" | "asset">;

/** Compute the current balance of a container by replaying its transactions. */
export async function getContainerBalance(
  client: FuelClient,
  containerId: string,
  fuelType?: string | null,
  excludeTransactionId?: string
): Promise<number> {
  const transactions = await client.fuelTransaction.findMany({
    where: {
      OR: [{ containerId }, { destinationContainerId: containerId }],
      ...(excludeTransactionId ? { id: { not: excludeTransactionId } } : {}),
    },
    select: {
      type: true,
      containerId: true,
      destinationContainerId: true,
      quantity: true,
      fuelType: true,
    },
  });

  let balance = 0;
  for (const t of transactions) {
    if (fuelType && t.fuelType !== fuelType) continue;
    if (t.type === "PURCHASE" && t.containerId === containerId) {
      balance += t.quantity;
    } else if (t.type === "TRANSFER" && t.destinationContainerId === containerId) {
      balance += t.quantity;
    } else if (t.type === "TRANSFER" && t.containerId === containerId) {
      balance -= t.quantity;
    } else if (t.type === "ISSUE" && t.containerId === containerId) {
      balance -= t.quantity;
    }
  }
  return balance;
}

export async function getContainerFuelType(
  client: FuelClient,
  containerId: string
): Promise<string | null> {
  const container = await client.asset.findUnique({
    where: { id: containerId },
    select: { fuelType: true },
  });
  return container?.fuelType ?? null;
}

/**
 * Ensure the requested fuelType matches the container's configured fuelType
 * (only enforced when the container declares one). Throws
 * `InsufficientStockError` on mismatch so callers share one 400 path.
 */
export async function ensureContainerFuelTypeMatches(
  client: FuelClient,
  containerId: string | null | undefined,
  fuelType?: string | null
): Promise<void> {
  if (!containerId || !fuelType) return;
  const containerFuelType = await getContainerFuelType(client, containerId);
  if (containerFuelType && containerFuelType !== fuelType) {
    throw new InsufficientStockError(
      `Container holds ${containerFuelType} fuel, but ${fuelType} was requested`
    );
  }
}

/** Error thrown when a container does not have enough fuel for an issue/transfer. */
export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

/**
 * Ensure a container can absorb a withdrawal of `quantity` liters without going
 * negative. Throws `InsufficientStockError` when it cannot. `excludeTransactionId`
 * can be used when validating an edit of a transaction that already draws on the
 * container, so its previous draw is not counted against the new quantity.
 */
export async function ensureSufficientStock(
  client: FuelClient,
  containerId: string | null | undefined,
  quantity: number,
  fuelType?: string | null,
  excludeTransactionId?: string
): Promise<void> {
  if (!containerId || quantity <= 0) return;
  const balance = await getContainerBalance(client, containerId, fuelType, excludeTransactionId);
  if (balance + 1e-6 < quantity) {
    throw new InsufficientStockError(
      `Insufficient fuel in container — available ${balance.toFixed(2)}L, requested ${quantity}L`
    );
  }
}
