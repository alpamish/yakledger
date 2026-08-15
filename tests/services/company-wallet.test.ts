import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { companyWalletService } from "@/services/company-wallet.service";

async function makeUser(role: string, email: string) {
  return db.user.create({ data: { email, name: email, password: "x", role } });
}

describe("Company wallet service", () => {
  let user: any;

  beforeEach(async () => {
    user = await makeUser("MANAGER", `wallet-svc-${Date.now()}-${Math.random()}@t.co`);
  });

  it("creates a wallet and seeds its balance from the initial amount", async () => {
    const wallet = await companyWalletService.create({
      name: "Main Bank",
      type: "BANK",
      currency: "AFN",
      initialBalance: 50000,
      createdBy: user.id,
    });
    expect(wallet.name).toBe("Main Bank");
    expect(wallet.balance).toBe(50000);
    expect(wallet.isActive).toBe(true);
  });

  it("keeps the balance derived from the transaction ledger", async () => {
    const wallet = await companyWalletService.create({
      name: "Cash",
      currency: "AFN",
      initialBalance: 10000,
      createdBy: user.id,
    });
    await companyWalletService.fund(wallet.id, 5000, user.id, "top up");
    await companyWalletService.adjust(wallet.id, -2000, user.id, "correction");
    await companyWalletService.recomputeBalance(wallet.id);

    const after = await companyWalletService.get(wallet.id);
    expect(after!.balance).toBe(13000);
  });

  it("transfers money between wallets", async () => {
    const a = await companyWalletService.create({
      name: "A",
      currency: "AFN",
      initialBalance: 10000,
      createdBy: user.id,
    });
    const b = await companyWalletService.create({
      name: "B",
      currency: "AFN",
      initialBalance: 0,
      createdBy: user.id,
    });

    await companyWalletService.transfer(a.id, b.id, 4000, user.id, "move");

    expect((await companyWalletService.get(a.id))!.balance).toBe(6000);
    expect((await companyWalletService.get(b.id))!.balance).toBe(4000);
  });

  it("rejects a transfer that exceeds the source balance", async () => {
    const a = await companyWalletService.create({
      name: "A",
      currency: "AFN",
      initialBalance: 100,
      createdBy: user.id,
    });
    const b = await companyWalletService.create({
      name: "B",
      currency: "AFN",
      initialBalance: 0,
      createdBy: user.id,
    });

    await expect(
      companyWalletService.transfer(a.id, b.id, 1000, user.id, "nope")
    ).rejects.toThrow(/Insufficient balance/);
  });

  it("lists only active wallets in listActive", async () => {
    const a = await companyWalletService.create({
      name: "A",
      currency: "AFN",
      createdBy: user.id,
    });
    const b = await companyWalletService.create({
      name: "B",
      currency: "AFN",
      createdBy: user.id,
    });
    await companyWalletService.setActive(b.id, false);

    const active = await companyWalletService.listActive();
    const ids = active.map((w) => w.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
  });
});