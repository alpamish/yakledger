import { POST as POST_TRANSACTION, GET as GET_TRANSACTIONS } from "@/app/api/fuel-transactions/route";
import { POST as POST_USAGE, GET as GET_USAGES } from "@/app/api/fuel-usage/route";
import { PUT as PUT_USAGE } from "@/app/api/fuel-usage/[id]/route";
import { POST as POST_ASSET, GET as GET_ASSETS } from "@/app/api/assets/route";
import { db } from "@/lib/db";
import { companyWalletService } from "@/services/company-wallet.service";
import { seedUsers, TEST_ADMIN, TEST_USER, buildRequest } from "../helpers";
import { hashPassword, generateToken } from "@/lib/auth";

let tokens: Awaited<ReturnType<typeof seedUsers>>;

beforeAll(async () => {
  tokens = await seedUsers();
});

async function createContainer(name: string, fuelType = "DIESEL") {
  return db.asset.create({
    data: {
      name,
      category: "FUEL",
      purchaseDate: new Date(),
      purchasePrice: 0,
      currentValue: 0,
      fuelType,
      createdBy: TEST_ADMIN.id,
    },
  });
}

async function createContractor(name: string) {
  return db.contractor.create({
    data: {
      contractorName: name,
      fatherName: "Father",
      phoneNumber: `07${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`,
      contractorType: "MACHINERY_CONTRACTOR",
      createdBy: TEST_ADMIN.id,
    },
  });
}

async function createMachinery(contractorId: string, name: string) {
  return db.machinery.create({
    data: {
      machineryName: name,
      machineryType: "Excavator",
      assignedContractorId: contractorId,
      fuelType: "DIESEL",
      hourlyRate: 500,
      dailyRate: 4000,
      monthlyRate: 90000,
      createdBy: TEST_ADMIN.id,
    },
  });
}

async function createWallet(initial: number) {
  const wallet = await companyWalletService.create({
    name: `Purchase Wallet ${Date.now()}`,
    type: "CASH",
    currency: "AFN",
    initialBalance: initial,
    createdBy: TEST_ADMIN.id,
  });
  return wallet!;
}

const txn = (body: Record<string, unknown>, token: string = tokens.adminToken) =>
  POST_TRANSACTION(buildRequest("/api/fuel-transactions", { token, method: "POST", body }));

describe("/api/fuel-transactions — fuel purchase → expense (pay now / unpaid)", () => {
  it("PURCHASE with createExpense + payNow wallet → linked FUEL expense + wallet deduction", async () => {
    const a = await createContainer("Exp Tank", "DIESEL");
    const wallet = await createWallet(100000);

    const res = await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 1000,
      unitPrice: 60,
      totalCost: 60000,
      supplier: "Fuel Supplier Co",
      containerId: a.id,
      createExpense: true,
      paymentMethod: "CASH",
      paidBy: "Manager",
      payNow: true,
      walletId: wallet.id,
    });
    expect(res.status).toBe(201);
    const body = await res.json();

    const expense = await db.expense.findFirst({ where: { fuelTransactionId: body.data.id } });
    expect(expense).not.toBeNull();
    expect(expense!.category).toBe("FUEL");
    expect(expense!.amount).toBe(60000);
    expect(expense!.paidTo).toBe("Fuel Supplier Co");
    expect(expense!.approvalStatus).toBe("APPROVED");
    expect(expense!.walletId).toBe(wallet.id);

    const refreshed = await db.wallet.findUnique({ where: { id: wallet.id } });
    expect(refreshed!.balance).toBe(40000);

    const txns = await db.walletTransaction.findMany({ where: { walletId: wallet.id, type: "EXPENSE" } });
    expect(txns).toHaveLength(1);
    expect(txns[0].expenseId).toBe(expense!.id);
  });

  it("PURCHASE with createExpense but unpaid (no wallet) → expense recorded, no wallet deduction", async () => {
    const a = await createContainer("Unpaid Tank", "DIESEL");
    const res = await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 100,
      unitPrice: 60,
      totalCost: 6000,
      supplier: "Unpaid Supplier",
      containerId: a.id,
      createExpense: true,
      paymentMethod: "CASH",
    });
    expect(res.status).toBe(201);
    const body = await res.json();

    const expense = await db.expense.findFirst({ where: { fuelTransactionId: body.data.id } });
    expect(expense).not.toBeNull();
    expect(expense!.amount).toBe(6000);
    expect(expense!.walletId).toBeNull();
    expect(expense!.approvalStatus).toBe("APPROVED");

    const walletTxns = await db.walletTransaction.findMany({ where: { expenseId: expense!.id } });
    expect(walletTxns).toHaveLength(0);
  });

  it("PURCHASE without createExpense → no expense is created", async () => {
    const a = await createContainer("NoExp Tank", "DIESEL");
    const res = await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 50,
      unitPrice: 60,
      totalCost: 3000,
      containerId: a.id,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const expense = await db.expense.findFirst({ where: { fuelTransactionId: body.data.id } });
    expect(expense).toBeNull();
  });

  it("PURCHASE with createExpense but missing paymentMethod → 400", async () => {
    const a = await createContainer("NoPay Tank", "DIESEL");
    const res = await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 100,
      unitPrice: 60,
      totalCost: 6000,
      containerId: a.id,
      createExpense: true,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/payment method/i);
  });

  it("createExpense on a non-PURCHASE transaction → 400", async () => {
    const a = await createContainer("TransferOnly Tank", "DIESEL");
    const b = await createContainer("TransferOnly Dest", "DIESEL");
    await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 100,
      unitPrice: 60,
      totalCost: 6000,
      containerId: a.id,
    });
    const res = await txn({
      type: "TRANSFER",
      fuelType: "DIESEL",
      quantity: 10,
      containerId: a.id,
      destinationContainerId: b.id,
      createExpense: true,
      paymentMethod: "CASH",
    });
    expect(res.status).toBe(400);
  });

  it("createExpense without expenses:create permission → 403", async () => {
    const noExpenseUser = await db.user.create({
      data: {
        id: "u_noexp_api",
        email: "noexp@api.test",
        name: "No Expense User",
        password: await hashPassword("noexp-pw"),
        role: "USER",
      },
    });
    const perm = await db.permission.upsert({
      where: { name: "expenses:create" },
      update: {},
      create: { name: "expenses:create", label: "Create Expenses", module: "expenses" },
    });
    await db.userPermission.create({
      data: { userId: noExpenseUser.id, permissionId: perm.id, granted: false },
    });
    const token = generateToken({ userId: noExpenseUser.id, email: noExpenseUser.email, role: noExpenseUser.role });

    const a = await createContainer("NoPerm Tank", "DIESEL");
    const res = await txn(
      {
        type: "PURCHASE",
        fuelType: "DIESEL",
        quantity: 100,
        unitPrice: 60,
        totalCost: 6000,
        containerId: a.id,
        createExpense: true,
        paymentMethod: "CASH",
      },
      token
    );
    expect(res.status).toBe(403);
  });
});

describe("/api/fuel-transactions — ISSUE billable flag", () => {
  it("ISSUE to contractor with billable=true → FuelUsage.billable true", async () => {
    const a = await createContainer("Bill Tank", "DIESEL");
    await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 100,
      unitPrice: 60,
      totalCost: 6000,
      containerId: a.id,
    });
    const contractor = await createContractor("Bill Co");
    const machinery = await createMachinery(contractor.id, "Bill Dozer");

    const res = await txn({
      type: "ISSUE",
      fuelType: "DIESEL",
      quantity: 40,
      unitPrice: 60,
      totalCost: 2400,
      containerId: a.id,
      contractorId: contractor.id,
      machineryId: machinery.id,
      billable: true,
    });
    expect(res.status).toBe(201);
    const body = await res.json();

    const usage = await db.fuelUsage.findFirst({ where: { fuelTransactionId: body.data.id } });
    expect(usage).not.toBeNull();
    expect(usage!.billable).toBe(true);
  });

  it("ISSUE to contractor with billable=false → FuelUsage.billable false", async () => {
    const a = await createContainer("NonBill Tank", "DIESEL");
    await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 100,
      unitPrice: 60,
      totalCost: 6000,
      containerId: a.id,
    });
    const contractor = await createContractor("NonBill Co");
    const machinery = await createMachinery(contractor.id, "NonBill Dozer");

    const res = await txn({
      type: "ISSUE",
      fuelType: "DIESEL",
      quantity: 40,
      unitPrice: 60,
      totalCost: 2400,
      containerId: a.id,
      contractorId: contractor.id,
      machineryId: machinery.id,
    });
    expect(res.status).toBe(201);
    const body = await res.json();

    const usage = await db.fuelUsage.findFirst({ where: { fuelTransactionId: body.data.id } });
    expect(usage!.billable).toBe(false);
  });

  it("GET /api/fuel-usage surfaces the billable flag", async () => {
    const a = await createContainer("GetBill Tank", "DIESEL");
    await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 100,
      unitPrice: 60,
      totalCost: 6000,
      containerId: a.id,
    });
    const contractor = await createContractor("GetBill Co");
    const machinery = await createMachinery(contractor.id, "GetBill Dozer");
    await txn({
      type: "ISSUE",
      fuelType: "DIESEL",
      quantity: 40,
      unitPrice: 60,
      totalCost: 2400,
      containerId: a.id,
      contractorId: contractor.id,
      machineryId: machinery.id,
      billable: true,
    });

    const res = await GET_USAGES(buildRequest("/api/fuel-usage", { token: tokens.adminToken }));
    const body = await res.json();
    const billable = body.data.data.find((u: { billable: boolean }) => u.billable === true);
    expect(billable).toBeDefined();
  });

  it("PUT /api/fuel-usage toggles the billable flag", async () => {
    const a = await createContainer("ToggleBill Tank", "DIESEL");
    await txn({
      type: "PURCHASE",
      fuelType: "DIESEL",
      quantity: 100,
      unitPrice: 60,
      totalCost: 6000,
      containerId: a.id,
    });
    const contractor = await createContractor("ToggleBill Co");
    const machinery = await createMachinery(contractor.id, "ToggleBill Dozer");

    const created = await (await POST_USAGE(
      buildRequest("/api/fuel-usage", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          contractorId: contractor.id,
          machineryId: machinery.id,
          fuelType: "DIESEL",
          quantity: 10,
          unitPrice: 60,
          totalCost: 600,
          date: new Date().toISOString(),
          billable: false,
          containerId: a.id,
        },
      })
    )).json();

    expect(created.data.billable).toBe(false);

    const updated = await PUT_USAGE(
      buildRequest(`/api/fuel-usage/${created.data.id}`, {
        token: tokens.adminToken,
        method: "PUT",
        body: { billable: true },
      }),
      { params: Promise.resolve({ id: created.data.id }) }
    );
    expect(updated.status).toBe(200);
    const ubody = await updated.json();
    expect(ubody.data.billable).toBe(true);
  });
});

describe("/api/assets — asset purchase → expense", () => {
  it("POST asset with createExpense + payNow wallet → linked expense + wallet deduction", async () => {
    const wallet = await createWallet(500000);
    const res = await POST_ASSET(
      buildRequest("/api/assets", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          name: "Excavator 7",
          category: "MACHINERY",
          purchaseDate: new Date().toISOString().split("T")[0],
          purchasePrice: 200000,
          currentValue: 200000,
          createExpense: true,
          paymentMethod: "BANK_TRANSFER",
          paidTo: "Machinery Vendor",
          paidBy: "Manager",
          payNow: true,
          walletId: wallet.id,
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();

    const expense = await db.expense.findFirst({ where: { assetId: body.data.id } });
    expect(expense).not.toBeNull();
    expect(expense!.category).toBe("MACHINERY");
    expect(expense!.amount).toBe(200000);
    expect(expense!.paidTo).toBe("Machinery Vendor");
    expect(expense!.walletId).toBe(wallet.id);

    const refreshed = await db.wallet.findUnique({ where: { id: wallet.id } });
    expect(refreshed!.balance).toBe(300000);
  });

  it("POST asset without createExpense → no expense", async () => {
    const res = await POST_ASSET(
      buildRequest("/api/assets", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          name: "Laptop 1",
          category: "LAPTOP",
          purchaseDate: new Date().toISOString().split("T")[0],
          purchasePrice: 30000,
          currentValue: 30000,
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const expense = await db.expense.findFirst({ where: { assetId: body.data.id } });
    expect(expense).toBeNull();
  });

  it("POST asset with createExpense but missing paymentMethod → 400", async () => {
    const res = await POST_ASSET(
      buildRequest("/api/assets", {
        token: tokens.adminToken,
        method: "POST",
        body: {
          name: "Gen 1",
          category: "OTHER",
          purchaseDate: new Date().toISOString().split("T")[0],
          purchasePrice: 5000,
          currentValue: 5000,
          createExpense: true,
        },
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("list APIs return the linked expense", () => {
  it("GET /api/fuel-transactions returns the linked expense on a PURCHASE with createExpense", async () => {
    const a = await createContainer("LinkedExp Tank", "DIESEL");
    const wallet = await createWallet(100000);
    const created = await (
      await txn({
        type: "PURCHASE",
        fuelType: "DIESEL",
        quantity: 200,
        unitPrice: 60,
        totalCost: 12000,
        supplier: "Linked Exp Co",
        containerId: a.id,
        createExpense: true,
        paymentMethod: "CASH",
        payNow: true,
        walletId: wallet.id,
      })
    ).json();

    const res = await GET_TRANSACTIONS(
      buildRequest("/api/fuel-transactions", { token: tokens.adminToken })
    );
    const body = await res.json();
    const row = body.data.data.find((t: { id: string }) => t.id === created.data.id);
    expect(row).toBeDefined();
    expect(row.expenses).toHaveLength(1);
    expect(row.expenses[0].id).toBeTruthy();
    expect(row.expenses[0].walletId).toBe(wallet.id);
    expect(row.expenses[0].approvalStatus).toBe("APPROVED");
  });

  it("GET /api/fuel-transactions returns no expenses when createExpense not set", async () => {
    const a = await createContainer("NoLinked Tank", "DIESEL");
    const created = await (
      await txn({
        type: "PURCHASE",
        fuelType: "DIESEL",
        quantity: 50,
        unitPrice: 60,
        totalCost: 3000,
        containerId: a.id,
      })
    ).json();

    const res = await GET_TRANSACTIONS(
      buildRequest("/api/fuel-transactions", { token: tokens.adminToken })
    );
    const body = await res.json();
    const row = body.data.data.find((t: { id: string }) => t.id === created.data.id);
    expect(row).toBeDefined();
    expect(row.expenses ?? []).toHaveLength(0);
  });

  it("GET /api/assets returns the linked expense on an asset with createExpense", async () => {
    const wallet = await createWallet(500000);
    const created = await (
      await POST_ASSET(
        buildRequest("/api/assets", {
          token: tokens.adminToken,
          method: "POST",
          body: {
            name: "Linked Exp Excavator",
            category: "MACHINERY",
            purchaseDate: new Date().toISOString().split("T")[0],
            purchasePrice: 150000,
            currentValue: 150000,
            createExpense: true,
            paymentMethod: "BANK_TRANSFER",
            payNow: true,
            walletId: wallet.id,
          },
        })
      )
    ).json();

    const res = await GET_ASSETS(
      buildRequest("/api/assets", { token: tokens.adminToken })
    );
    const body = await res.json();
    const row = body.data.data.find((a: { id: string }) => a.id === created.data.id);
    expect(row).toBeDefined();
    expect(row.expenses).toHaveLength(1);
    expect(row.expenses[0].walletId).toBe(wallet.id);
  });

  it("GET /api/assets returns no expenses when createExpense not set", async () => {
    const created = await (
      await POST_ASSET(
        buildRequest("/api/assets", {
          token: tokens.adminToken,
          method: "POST",
          body: {
            name: "No Linked Laptop",
            category: "LAPTOP",
            purchaseDate: new Date().toISOString().split("T")[0],
            purchasePrice: 25000,
            currentValue: 25000,
          },
        })
      )
    ).json();

    const res = await GET_ASSETS(
      buildRequest("/api/assets", { token: tokens.adminToken })
    );
    const body = await res.json();
    const row = body.data.data.find((a: { id: string }) => a.id === created.data.id);
    expect(row).toBeDefined();
    expect(row.expenses ?? []).toHaveLength(0);
  });
});
