import { describe, it, expect, beforeAll } from "vitest";
import { GET } from "@/app/api/wallets/transactions/route";
import { seedUsers, buildRequest } from "../helpers";
import { companyWalletService } from "@/services/company-wallet.service";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let walletA: any;
let walletB: any;

beforeAll(async () => {
  tokens = await seedUsers();
  walletA = await companyWalletService.create({
    name: "Tx Wallet A",
    createdBy: tokens.admin.id,
  });
  walletB = await companyWalletService.create({
    name: "Tx Wallet B",
    createdBy: tokens.admin.id,
  });
  await companyWalletService.fund(walletA.id, 1000, tokens.admin.id, "seed A");
  await companyWalletService.fund(walletA.id, 2000, tokens.admin.id, "seed A 2");
  await companyWalletService.adjust(walletA.id, -500, tokens.admin.id, "adjust A");
  await companyWalletService.fund(walletB.id, 3000, tokens.admin.id, "seed B");
});

describe("GET /api/wallets/transactions", () => {
  it("lists transactions with pagination", async () => {
    const res = await GET(
      buildRequest("/api/wallets/transactions?page=1&pageSize=2", {
        token: tokens.adminToken,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.total).toBe(4);
    expect(json.data.data.length).toBe(2);
    expect(json.data.totalPages).toBe(2);
    expect(json.data.data[0].wallet).toBeTruthy();
  });

  it("filters by walletId", async () => {
    const res = await GET(
      buildRequest(`/api/wallets/transactions?walletId=${walletB.id}`, {
        token: tokens.adminToken,
      })
    );
    const json = await res.json();
    expect(json.data.total).toBe(1);
    expect(json.data.data[0].wallet.id).toBe(walletB.id);
  });

  it("filters by type", async () => {
    const res = await GET(
      buildRequest(`/api/wallets/transactions?walletId=${walletA.id}&type=ADJUSTMENT`, {
        token: tokens.adminToken,
      })
    );
    const json = await res.json();
    expect(json.data.total).toBe(1);
    expect(json.data.data[0].type).toBe("ADJUSTMENT");
  });

  it("filters by date range", async () => {
    const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await GET(
      buildRequest(`/api/wallets/transactions?from=${from}&to=${to}`, {
        token: tokens.adminToken,
      })
    );
    const json = await res.json();
    expect(json.data.total).toBe(4);
  });

  it("USER can view wallet transactions (wallets:view via expense dependency)", async () => {
    const res = await GET(
      buildRequest("/api/wallets/transactions", { token: tokens.userToken })
    );
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await GET(
      buildRequest("/api/wallets/transactions", { token: "invalid-token" })
    );
    expect(res.status).toBe(401);
  });
});
