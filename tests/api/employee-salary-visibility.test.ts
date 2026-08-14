import { GET as getEmployees } from "@/app/api/employees/route";
import { GET as getEmployeeList } from "@/app/api/employees/list/route";
import { db } from "@/lib/db";
import { seedUsers, TEST_MANAGER } from "../helpers";

let tokens: Awaited<ReturnType<typeof seedUsers>>;
let managerEmpId: string;

beforeAll(async () => {
  tokens = await seedUsers();
  // Give the seeded (admin-owned) employee a salary so visibility can be asserted.
  await db.employee.update({
    where: { id: tokens.employee.id },
    data: { salary: 5000 },
  });
  // MANAGER only sees employees it created (no content:employees grant),
  // so create one owned by the manager to test manager salary visibility.
  const mgrEmp = await db.employee.create({
    data: {
      fullName: "Manager Owned Emp",
      fatherName: "M",
      phoneNumber: "0700000099",
      jobTitle: "Supervisor",
      department: "OPERATIONS",
      hireDate: new Date(),
      salary: 7000,
      createdBy: TEST_MANAGER.id,
    },
  });
  managerEmpId = mgrEmp.id;
});

describe("salary visibility gate", () => {
  it("includes salary for ADMIN (has employees:salary:view)", async () => {
    const res = await getEmployeeList(
      new Request("http://localhost:3000/api/employees/list", {
        headers: { Authorization: `Bearer ${tokens.adminToken}` },
      }) as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const emp = body.data.find((e: any) => e.id === tokens.employee.id);
    expect(emp).toBeDefined();
    expect("salary" in emp).toBe(true);
    expect(emp.salary).toBe(5000);
  });

  it("omits salary for USER (lacks employees:salary:view)", async () => {
    const res = await getEmployeeList(
      new Request("http://localhost:3000/api/employees/list", {
        headers: { Authorization: `Bearer ${tokens.userToken}` },
      }) as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const emp = body.data.find((e: any) => e.id === tokens.employee.id);
    expect(emp).toBeDefined();
    expect("salary" in emp).toBe(false);
  });

  it("includes salary for MANAGER on its own employee (has employees:salary:view)", async () => {
    const res = await getEmployees(
      new Request(
        `http://localhost:3000/api/employees?page=1&pageSize=50`,
        { headers: { Authorization: `Bearer ${tokens.managerToken}` } }
      ) as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const emp = body.data.data.find((e: any) => e.id === managerEmpId);
    expect(emp).toBeDefined();
    expect("salary" in emp).toBe(true);
    expect(emp.salary).toBe(7000);
  });

  it("omits salary-derived fields for USER on detail", async () => {
    const res = await getEmployees(
      new Request(`http://localhost:3000/api/employees/${tokens.employee.id}`, {
        headers: { Authorization: `Bearer ${tokens.userToken}` },
      }) as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect("salary" in body.data).toBe(false);
    expect("baseSalaryMinor" in body.data).toBe(false);
    expect("totalSalaryPaid" in body.data).toBe(false);
    expect("overtimePay" in body.data).toBe(false);
  });
});
