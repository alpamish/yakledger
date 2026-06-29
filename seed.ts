import { db } from "./src/lib/db";
import { hashPassword } from "./src/lib/auth";
import { Category, PaymentMethod } from "@prisma/client";

async function seed() {
  // Create demo user
  const hashedPassword = await hashPassword("demo123");

  const user = await db.user.upsert({
    where: { email: "demo@yakhshiledger.com" },
    update: {},
    create: {
      email: "demo@yakhshiledger.com",
      name: "Demo User",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  console.log("Created demo user:", user.email);

  // Create sample employees
  const sampleEmployees = [
    { fullName: "Ahmad Rahimi", fatherName: "Mohammad Rahimi", gender: "male", phoneNumber: "+93 700 111 222", email: "ahmad@company.com", jobTitle: "Site Engineer", department: "ENGINEERING" as const, employmentType: "FULL_TIME" as const, salary: 4500, hireDate: new Date("2023-03-15"), status: "ACTIVE" as const, emergencyContactName: "Mohammad Rahimi", emergencyContactPhone: "+93 700 333 444" },
    { fullName: "Fatima Noori", fatherName: "Abdul Noori", gender: "female", phoneNumber: "+93 700 555 666", email: "fatima@company.com", jobTitle: "Finance Officer", department: "FINANCE" as const, employmentType: "FULL_TIME" as const, salary: 3800, hireDate: new Date("2023-06-01"), status: "ACTIVE" as const, emergencyContactName: "Abdul Noori", emergencyContactPhone: "+93 700 777 888" },
    { fullName: "Omar Karimi", fatherName: "Hassan Karimi", gender: "male", phoneNumber: "+93 700 999 000", email: "omar@company.com", jobTitle: "Operations Manager", department: "OPERATIONS" as const, employmentType: "FULL_TIME" as const, salary: 5200, hireDate: new Date("2022-01-10"), status: "ACTIVE" as const, emergencyContactName: "Hassan Karimi", emergencyContactPhone: "+93 700 111 333" },
    { fullName: "Sara Ahmadi", fatherName: "Jamil Ahmadi", gender: "female", phoneNumber: "+93 700 222 444", email: "sara@company.com", jobTitle: "HR Coordinator", department: "ADMINISTRATION" as const, employmentType: "FULL_TIME" as const, salary: 3200, hireDate: new Date("2023-09-20"), status: "ACTIVE" as const, emergencyContactName: "Jamil Ahmadi", emergencyContactPhone: "+93 700 555 777" },
    { fullName: "Yousuf Mohammadi", fatherName: "Ghulam Mohammadi", gender: "male", phoneNumber: "+93 700 666 888", jobTitle: "Crane Operator", department: "MACHINERY_TEAM" as const, employmentType: "FULL_TIME" as const, salary: 3500, hireDate: new Date("2023-11-01"), status: "ACTIVE" as const, emergencyContactName: "Ghulam Mohammadi", emergencyContactPhone: "+93 700 999 111" },
    { fullName: "Ali Rezai", fatherName: "Wahid Rezai", gender: "male", phoneNumber: "+93 700 333 555", jobTitle: "Security Guard", department: "SECURITY" as const, employmentType: "FULL_TIME" as const, salary: 2200, hireDate: new Date("2024-01-15"), status: "ACTIVE" as const, emergencyContactName: "Wahid Rezai", emergencyContactPhone: "+93 700 444 666" },
    { fullName: "Habib Qaderi", fatherName: "Nasir Qaderi", gender: "male", phoneNumber: "+93 700 777 999", jobTitle: "Logistics Coordinator", department: "LOGISTICS" as const, employmentType: "FULL_TIME" as const, salary: 3600, hireDate: new Date("2023-07-10"), status: "ACTIVE" as const, emergencyContactName: "Nasir Qaderi", emergencyContactPhone: "+93 700 888 000" },
    { fullName: "Maryam Stanikzai", fatherName: "Tariq Stanikzai", gender: "female", phoneNumber: "+93 700 111 555", email: "maryam@company.com", jobTitle: "Project Accountant", department: "FINANCE" as const, employmentType: "CONTRACT" as const, salary: 4000, hireDate: new Date("2024-03-01"), status: "ACTIVE" as const, emergencyContactName: "Tariq Stanikzai", emergencyContactPhone: "+93 700 222 666" },
    { fullName: "Farid Hotak", fatherName: "Shir Hotak", gender: "male", phoneNumber: "+93 700 333 777", jobTitle: "Excavator Operator", department: "MACHINERY_TEAM" as const, employmentType: "FULL_TIME" as const, salary: 3400, hireDate: new Date("2024-02-01"), status: "ACTIVE" as const, emergencyContactName: "Shir Hotak", emergencyContactPhone: "+93 700 444 888" },
    { fullName: "Zainab Hussaini", fatherName: "Ismail Hussaini", gender: "female", phoneNumber: "+93 700 555 999", email: "zainab@company.com", jobTitle: "Executive Assistant", department: "ADMINISTRATION" as const, employmentType: "PART_TIME" as const, salary: 2400, hireDate: new Date("2024-06-15"), status: "ACTIVE" as const, emergencyContactName: "Ismail Hussaini", emergencyContactPhone: "+93 700 666 000" },
    { fullName: "Hamid Nazari", fatherName: "Daud Nazari", gender: "male", phoneNumber: "+93 700 777 111", jobTitle: "Surveyor", department: "ENGINEERING" as const, employmentType: "CONTRACT" as const, salary: 3800, hireDate: new Date("2024-04-10"), status: "INACTIVE" as const, emergencyContactName: "Daud Nazari", emergencyContactPhone: "+93 700 888 222" },
    { fullName: "Rashid Alizada", fatherName: "Bashir Alizada", gender: "male", phoneNumber: "+93 700 999 333", jobTitle: "Driver", department: "LOGISTICS" as const, employmentType: "FULL_TIME" as const, salary: 2000, hireDate: new Date("2023-12-01"), status: "TERMINATED" as const, emergencyContactName: "Bashir Alizada", emergencyContactPhone: "+93 700 000 444" },
  ];

  const createdEmployees: { id: string; fullName: string }[] = [];
  for (const emp of sampleEmployees) {
    const employee = await db.employee.create({
      data: {
        ...emp,
        address: "Kabul, Afghanistan",
        nationalId: "TZN-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
        createdBy: user.id,
      },
    });
    createdEmployees.push({ id: employee.id, fullName: employee.fullName });
  }

  console.log("Created " + createdEmployees.length + " sample employees");

  // Get some employee IDs for linking
  const ahmad = createdEmployees.find((e) => e.fullName === "Ahmad Rahimi");
  const fatima = createdEmployees.find((e) => e.fullName === "Fatima Noori");
  const omar = createdEmployees.find((e) => e.fullName === "Omar Karimi");
  const habib = createdEmployees.find((e) => e.fullName === "Habib Qaderi");

  // ─── Create sample contractors ─────────────────────────────────────────
  const sampleContractors = [
    { contractorName: "Gul Khan Machinery", fatherName: "Abdul Khan", companyName: "Khan Heavy Equipment", phoneNumber: "+93 700 100 200", alternativePhone: "+93 700 100 201", email: "gulkhan@equipment.com", address: "Industrial Area, Kabul", nationalId: "TZN-GK001", contractorType: "MACHINERY_CONTRACTOR" as const, status: "ACTIVE" as const, notes: "Primary excavator contractor for Site A" },
    { contractorName: "Noor Transport", fatherName: "Mohammad Noor", companyName: "Noor Logistics LLC", phoneNumber: "+93 700 200 300", alternativePhone: "+93 700 200 301", email: "noor@transport.com", address: "Airport Road, Kabul", nationalId: "TZN-NT002", contractorType: "TRANSPORTATION_CONTRACTOR" as const, status: "ACTIVE" as const, notes: "Material and equipment transportation" },
    { contractorName: "Bashir Labor Co.", fatherName: "Haji Bashir", phoneNumber: "+93 700 300 400", address: "District 5, Kabul", nationalId: "TZN-BL003", contractorType: "LABOR_CONTRACTOR" as const, status: "ACTIVE" as const, notes: "General labor supply for construction sites" },
    { contractorName: "Afghan Cement Supply", fatherName: "Daud Shah", companyName: "Afghan Building Materials", phoneNumber: "+93 700 400 500", email: "info@afghancement.com", address: "Pol-e-Charkhi, Kabul", nationalId: "TZN-AC004", contractorType: "MATERIAL_SUPPLIER" as const, status: "ACTIVE" as const, notes: "Cement, sand, gravel supplier" },
    { contractorName: "Rahim Crane Services", fatherName: "Zmarai Rahim", companyName: "Rahim Heavy Lift", phoneNumber: "+93 700 500 600", alternativePhone: "+93 700 500 601", address: "Macrorayan, Kabul", nationalId: "TZN-RC005", contractorType: "MACHINERY_CONTRACTOR" as const, status: "ACTIVE" as const, notes: "Crane services for high-rise construction" },
    { contractorName: "Hamza Equipment Rental", fatherName: "Hamzaullah", phoneNumber: "+93 700 600 700", address: "Charahi Qamber, Kabul", nationalId: "TZN-HE006", contractorType: "MACHINERY_CONTRACTOR" as const, status: "INACTIVE" as const, notes: "Seasonal contractor - winter break" },
    { contractorName: "Kabul Steel Traders", fatherName: "Nasrullah", companyName: "Kabul Steel House", phoneNumber: "+93 700 700 800", email: "steel@kabultraders.com", address: "Jade Maiwand, Kabul", nationalId: "TZN-KS007", contractorType: "MATERIAL_SUPPLIER" as const, status: "SUSPENDED" as const, notes: "Suspended due to quality concerns - pending review" },
    { contractorName: "Sadiq General Transport", fatherName: "Sadiqullah", phoneNumber: "+93 700 800 900", address: "Karte-e-Seh, Kabul", nationalId: "TZN-SG008", contractorType: "TRANSPORTATION_CONTRACTOR" as const, status: "ACTIVE" as const },
  ];

  const createdContractors: { id: string; contractorName: string }[] = [];
  for (const con of sampleContractors) {
    const contractor = await db.contractor.create({
      data: {
        ...con,
        createdBy: user.id,
      },
    });
    createdContractors.push({ id: contractor.id, contractorName: contractor.contractorName });
  }

  console.log("Created " + createdContractors.length + " sample contractors");

  // Get contractor IDs for linking
  const gulKhan = createdContractors.find((c) => c.contractorName === "Gul Khan Machinery");
  const noorTransport = createdContractors.find((c) => c.contractorName === "Noor Transport");
  const bashirLabor = createdContractors.find((c) => c.contractorName === "Bashir Labor Co.");
  const afghanCement = createdContractors.find((c) => c.contractorName === "Afghan Cement Supply");
  const rahimCrane = createdContractors.find((c) => c.contractorName === "Rahim Crane Services");
  const sadiqTransport = createdContractors.find((c) => c.contractorName === "Sadiq General Transport");

  // ─── Create sample machinery ──────────────────────────────────────────
  if (!gulKhan || !noorTransport || !rahimCrane || !sadiqTransport) {
    throw new Error("Required contractors not found for machinery assignment");
  }

  const sampleMachinery = [
    { machineryName: "CAT 320 Excavator", machineryType: "Excavator", plateNumber: "KBL-EX-001", model: "CAT 320F", status: "OPERATIONAL" as const, fuelType: "DIESEL" as const, hourlyConsumptionRate: 18, assignedContractorId: gulKhan.id },
    { machineryName: "Volvo A30 Dump Truck", machineryType: "Dump Truck", plateNumber: "KBL-DT-002", model: "Volvo A30G", status: "OPERATIONAL" as const, fuelType: "DIESEL" as const, hourlyConsumptionRate: 22, assignedContractorId: noorTransport.id },
    { machineryName: "Liebherr Tower Crane", machineryType: "Tower Crane", plateNumber: "KBL-CR-005", model: "Liebherr 280 EC-H", status: "OPERATIONAL" as const, fuelType: "DIESEL" as const, hourlyConsumptionRate: 25, assignedContractorId: rahimCrane.id },
    { machineryName: "CAT D8 Bulldozer", machineryType: "Bulldozer", plateNumber: "KBL-BD-006", model: "CAT D8T", status: "UNDER_MAINTENANCE" as const, fuelType: "DIESEL" as const, hourlyConsumptionRate: 30, assignedContractorId: gulKhan.id },
    { machineryName: "JCB 3CX Backhoe", machineryType: "Backhoe Loader", plateNumber: "KBL-BH-010", model: "JCB 3CX", status: "OPERATIONAL" as const, fuelType: "DIESEL" as const, hourlyConsumptionRate: 12, assignedContractorId: gulKhan.id },
    { machineryName: "Toyota Hilux Site Vehicle", machineryType: "Pickup Truck", plateNumber: "KBL-PK-011", model: "Toyota Hilux 2023", status: "OPERATIONAL" as const, fuelType: "GASOLINE" as const, hourlyConsumptionRate: 6, assignedContractorId: sadiqTransport.id },
    { machineryName: "Man Diesel Generator 500KVA", machineryType: "Generator", plateNumber: "KBL-GEN-012", model: "Man D0836", status: "OPERATIONAL" as const, fuelType: "DIESEL" as const, hourlyConsumptionRate: 40, assignedContractorId: gulKhan.id },
    { machineryName: "Isuzu Flatbed Truck", machineryType: "Flatbed Truck", plateNumber: "KBL-FB-008", model: "Isuzu FTR 600", status: "OPERATIONAL" as const, fuelType: "DIESEL" as const, hourlyConsumptionRate: 16, assignedContractorId: sadiqTransport.id },
  ];

  const createdMachinery: { id: string; machineryName: string }[] = [];
  for (const m of sampleMachinery) {
    const machine = await db.machinery.create({
      data: {
        ...m,
        createdBy: user.id,
      },
    });
    createdMachinery.push({ id: machine.id, machineryName: machine.machineryName });
  }

  console.log("Created " + createdMachinery.length + " sample machinery");

  // Get machinery IDs
  const excavator = createdMachinery.find((m) => m.machineryName === "CAT 320 Excavator");
  const dumpTruck = createdMachinery.find((m) => m.machineryName === "Volvo A30 Dump Truck");
  const towerCrane = createdMachinery.find((m) => m.machineryName === "Liebherr Tower Crane");
  const generator = createdMachinery.find((m) => m.machineryName === "Man Diesel Generator 500KVA");
  const flatbedTruck = createdMachinery.find((m) => m.machineryName === "Isuzu Flatbed Truck");
  const hilux = createdMachinery.find((m) => m.machineryName === "Toyota Hilux Site Vehicle");

  // ─── Create sample expenses (some linked to contractors) ──────────────
  const sampleExpenses = [
    { title: "Diesel Fuel Purchase", category: "FUEL" as Category, amount: 450.00, paymentMethod: "CASH" as PaymentMethod, paidTo: "Shell Gas Station", paidBy: ahmad?.fullName ?? "John Smith", paidById: ahmad?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2024-12-01") },
    { title: "Excavator Service - Dec", category: "MACHINERY" as Category, amount: 15000.00, paymentMethod: "BANK_TRANSFER" as PaymentMethod, paidTo: gulKhan?.contractorName ?? "Gul Khan Machinery", paidBy: omar?.fullName ?? "Operations Team", paidById: omar?.id ?? null, paidToId: null, paidToContractorId: gulKhan?.id ?? null, expenseDate: new Date("2024-12-01") },
    { title: "Site Worker Salary - Dec", category: "SALARY" as Category, amount: 3500.00, paymentMethod: "BANK_TRANSFER" as PaymentMethod, paidTo: fatima?.fullName ?? "HR Department", paidBy: fatima?.fullName ?? "HR Department", paidById: fatima?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2024-12-01") },
    { title: "Excavator Repair", category: "MAINTENANCE" as Category, amount: 1200.00, paymentMethod: "CHECK" as PaymentMethod, paidTo: "Heavy Parts Co.", paidBy: omar?.fullName ?? "Operations Team", paidById: omar?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2024-12-03") },
    { title: "Transport Service - Dec", category: "TRANSPORTATION" as Category, amount: 12000.00, paymentMethod: "BANK_TRANSFER" as PaymentMethod, paidTo: noorTransport?.contractorName ?? "Noor Transport", paidBy: habib?.fullName ?? "Logistics Team", paidById: habib?.id ?? null, paidToId: null, paidToContractorId: noorTransport?.id ?? null, expenseDate: new Date("2024-12-05") },
    { title: "Labor Supply - Dec", category: "SALARY" as Category, amount: 3000.00, paymentMethod: "CASH" as PaymentMethod, paidTo: bashirLabor?.contractorName ?? "Bashir Labor Co.", paidBy: omar?.fullName ?? "Operations Team", paidById: omar?.id ?? null, paidToId: null, paidToContractorId: bashirLabor?.id ?? null, expenseDate: new Date("2024-12-05") },
    { title: "Cement - 200 Bags", category: "MATERIALS" as Category, amount: 3400.00, paymentMethod: "CHECK" as PaymentMethod, paidTo: afghanCement?.contractorName ?? "Afghan Cement Supply", paidBy: "Procurement Team", paidById: null, paidToId: null, paidToContractorId: afghanCement?.id ?? null, expenseDate: new Date("2024-12-10") },
    { title: "Crane Service - Dec", category: "MACHINERY" as Category, amount: 22000.00, paymentMethod: "BANK_TRANSFER" as PaymentMethod, paidTo: rahimCrane?.contractorName ?? "Rahim Crane Services", paidBy: omar?.fullName ?? "Operations Team", paidById: omar?.id ?? null, paidToId: null, paidToContractorId: rahimCrane?.id ?? null, expenseDate: new Date("2024-12-06") },
    { title: "Caterpillar Transport", category: "MACHINERY_TRANSPORTATION" as Category, amount: 1500.00, paymentMethod: "BANK_TRANSFER" as PaymentMethod, paidTo: "Heavy Haul Co.", paidBy: habib?.fullName ?? "Logistics Team", paidById: habib?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2024-12-07") },
    { title: "Lunch for Team", category: "FOOD" as Category, amount: 120.00, paymentMethod: "CASH" as PaymentMethod, paidTo: "City Restaurant", paidBy: ahmad?.fullName ?? "John Smith", paidById: ahmad?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2024-12-08") },
    { title: "Scaffolding Rental", category: "EQUIPMENT_RENTAL" as Category, amount: 800.00, paymentMethod: "CREDIT_CARD" as PaymentMethod, paidTo: "RentAll Equipment", paidBy: omar?.fullName ?? "Operations Team", paidById: omar?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2024-12-12") },
    { title: "Printer Paper & Ink", category: "OFFICE_EXPENSE" as Category, amount: 95.00, paymentMethod: "DEBIT_CARD" as PaymentMethod, paidTo: "Office Depot", paidBy: "Admin Team", paidById: null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2024-12-13") },
    { title: "Gasoline for Generator", category: "FUEL" as Category, amount: 320.00, paymentMethod: "CASH" as PaymentMethod, paidTo: "Petrol Station", paidBy: ahmad?.fullName ?? "John Smith", paidById: ahmad?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2025-01-02") },
    { title: "Engineer Salary - Jan", category: "SALARY" as Category, amount: 4200.00, paymentMethod: "BANK_TRANSFER" as PaymentMethod, paidTo: ahmad?.fullName ?? "Sarah Williams", paidBy: fatima?.fullName ?? "HR Department", paidById: fatima?.id ?? null, paidToId: ahmad?.id ?? null, paidToContractorId: null, expenseDate: new Date("2025-01-01") },
    { title: "Excavator Service - Jan", category: "MACHINERY" as Category, amount: 15000.00, paymentMethod: "BANK_TRANSFER" as PaymentMethod, paidTo: gulKhan?.contractorName ?? "Gul Khan Machinery", paidBy: omar?.fullName ?? "Operations Team", paidById: omar?.id ?? null, paidToId: null, paidToContractorId: gulKhan?.id ?? null, expenseDate: new Date("2025-01-01") },
    { title: "Transport Service - Jan", category: "TRANSPORTATION" as Category, amount: 10000.00, paymentMethod: "BANK_TRANSFER" as PaymentMethod, paidTo: sadiqTransport?.contractorName ?? "Sadiq General Transport", paidBy: habib?.fullName ?? "Logistics Team", paidById: habib?.id ?? null, paidToId: null, paidToContractorId: sadiqTransport?.id ?? null, expenseDate: new Date("2025-01-05") },
    { title: "Crane Service - Jan", category: "MACHINERY" as Category, amount: 19800.00, paymentMethod: "CHECK" as PaymentMethod, paidTo: rahimCrane?.contractorName ?? "Rahim Crane Services", paidBy: omar?.fullName ?? "Operations Team", paidById: omar?.id ?? null, paidToId: null, paidToContractorId: rahimCrane?.id ?? null, expenseDate: new Date("2025-01-06") },
    { title: "Bulldozer Service", category: "MAINTENANCE" as Category, amount: 950.00, paymentMethod: "CHECK" as PaymentMethod, paidTo: "MachineCare Ltd.", paidBy: omar?.fullName ?? "Operations Team", paidById: omar?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2025-01-05") },
    { title: "Labor Supply - Jan", category: "SALARY" as Category, amount: 3000.00, paymentMethod: "CASH" as PaymentMethod, paidTo: bashirLabor?.contractorName ?? "Bashir Labor Co.", paidBy: omar?.fullName ?? "Operations Team", paidById: omar?.id ?? null, paidToId: null, paidToContractorId: bashirLabor?.id ?? null, expenseDate: new Date("2025-01-10") },
    { title: "Site Vehicle Fuel", category: "FUEL" as Category, amount: 560.00, paymentMethod: "CREDIT_CARD" as PaymentMethod, paidTo: "Total Gas Station", paidBy: ahmad?.fullName ?? "John Smith", paidById: ahmad?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2025-01-08") },
    { title: "Steel Bars - 500kg", category: "MATERIALS" as Category, amount: 2800.00, paymentMethod: "BANK_TRANSFER" as PaymentMethod, paidTo: "SteelTraders Inc.", paidBy: "Procurement Team", paidById: null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2025-01-10") },
    { title: "Forklift Rental", category: "EQUIPMENT_RENTAL" as Category, amount: 1100.00, paymentMethod: "CHECK" as PaymentMethod, paidTo: "LiftPro Rentals", paidBy: habib?.fullName ?? "Logistics Team", paidById: habib?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2025-01-12") },
    { title: "Safety Helmets x20", category: "MISCELLANEOUS" as Category, amount: 450.00, paymentMethod: "DEBIT_CARD" as PaymentMethod, paidTo: "SafetyFirst Gear", paidBy: "Admin Team", paidById: null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2025-01-15") },
    { title: "Cement - 300 Bags Jan", category: "MATERIALS" as Category, amount: 5100.00, paymentMethod: "CHECK" as PaymentMethod, paidTo: afghanCement?.contractorName ?? "Afghan Cement Supply", paidBy: "Procurement Team", paidById: null, paidToId: null, paidToContractorId: afghanCement?.id ?? null, expenseDate: new Date("2025-01-20") },
    { title: "Excavator Service - Feb", category: "MACHINERY" as Category, amount: 15000.00, paymentMethod: "BANK_TRANSFER" as PaymentMethod, paidTo: gulKhan?.contractorName ?? "Gul Khan Machinery", paidBy: omar?.fullName ?? "Operations Team", paidById: omar?.id ?? null, paidToId: null, paidToContractorId: gulKhan?.id ?? null, expenseDate: new Date("2025-02-01") },
    { title: "Generator Fuel - Feb", category: "FUEL" as Category, amount: 400.00, paymentMethod: "CASH" as PaymentMethod, paidTo: "Fuel Depot", paidBy: ahmad?.fullName ?? "John Smith", paidById: ahmad?.id ?? null, paidToId: null, paidToContractorId: null, expenseDate: new Date("2025-02-15") },
  ];

  for (const expense of sampleExpenses) {
    await db.expense.create({
      data: {
        title: expense.title,
        category: expense.category,
        amount: expense.amount,
        paymentMethod: expense.paymentMethod,
        paidTo: expense.paidTo,
        paidBy: expense.paidBy,
        paidById: expense.paidById,
        paidToId: expense.paidToId,
        paidToContractorId: expense.paidToContractorId,
        expenseDate: expense.expenseDate,
        description: expense.title + " - regular payment",
        createdBy: user.id,
        currency: "AFN",
        tags: "project-alpha",
      },
    });
  }

  console.log("Created " + sampleExpenses.length + " sample expenses");

  // ─── Create sample timesheets ─────────────────────────────────────────
  const sampleTimesheets = [
    { contractorId: gulKhan?.id ?? "", machineryId: excavator?.id ?? null, operatorName: "Farid Hotak", workSite: "Site A - Main Building", date: new Date("2025-01-06"), startTime: "07:00", endTime: "17:00", totalHours: 10, overtimeHours: 0, approvedAt: new Date("2025-01-06"), notes: "Foundation excavation" },
    { contractorId: gulKhan?.id ?? "", machineryId: excavator?.id ?? null, operatorName: "Farid Hotak", workSite: "Site A - Main Building", date: new Date("2025-01-07"), startTime: "07:00", endTime: "18:30", totalHours: 11.5, overtimeHours: 1.5, approvedAt: new Date("2025-01-07"), notes: "Trenching work - overtime for completion" },
    { contractorId: gulKhan?.id ?? "", machineryId: excavator?.id ?? null, operatorName: "Farid Hotak", workSite: "Site A - Main Building", date: new Date("2025-01-08"), startTime: "07:00", endTime: "17:00", totalHours: 10, overtimeHours: 0, approvedAt: new Date("2025-01-08") },
    { contractorId: gulKhan?.id ?? "", machineryId: excavator?.id ?? null, operatorName: "Farid Hotak", workSite: "Site A - Main Building", date: new Date("2025-01-09"), startTime: "07:00", endTime: "17:00", totalHours: 10, overtimeHours: 0, approvedAt: new Date("2025-01-09") },
    { contractorId: gulKhan?.id ?? "", machineryId: excavator?.id ?? null, operatorName: "Farid Hotak", workSite: "Site A - Main Building", date: new Date("2025-01-10"), startTime: "07:00", endTime: "19:00", totalHours: 12, overtimeHours: 2, approvedAt: new Date("2025-01-10"), notes: "Emergency excavation - underground pipe" },
    { contractorId: noorTransport?.id ?? "", machineryId: dumpTruck?.id ?? null, operatorName: "Habib Qaderi", workSite: "Site A to Quarry", date: new Date("2025-01-06"), startTime: "06:00", endTime: "16:00", totalHours: 10, overtimeHours: 0, approvedAt: new Date("2025-01-06"), notes: "Material delivery - sand and gravel" },
    { contractorId: noorTransport?.id ?? "", machineryId: dumpTruck?.id ?? null, operatorName: "Habib Qaderi", workSite: "Site A to Quarry", date: new Date("2025-01-07"), startTime: "06:00", endTime: "17:00", totalHours: 11, overtimeHours: 1, approvedAt: new Date("2025-01-07"), notes: "Extra delivery requested" },
    { contractorId: noorTransport?.id ?? "", machineryId: dumpTruck?.id ?? null, operatorName: "Habib Qaderi", workSite: "Site B - Warehouse", date: new Date("2025-01-08"), startTime: "06:00", endTime: "16:00", totalHours: 10, overtimeHours: 0, approvedAt: new Date("2025-01-08") },
    { contractorId: rahimCrane?.id ?? "", machineryId: towerCrane?.id ?? null, operatorName: "Yousuf Mohammadi", workSite: "Site A - Tower Section", date: new Date("2025-01-06"), startTime: "07:00", endTime: "17:00", totalHours: 10, overtimeHours: 0, approvedAt: new Date("2025-01-06") },
    { contractorId: rahimCrane?.id ?? "", machineryId: towerCrane?.id ?? null, operatorName: "Yousuf Mohammadi", workSite: "Site A - Tower Section", date: new Date("2025-01-07"), startTime: "07:00", endTime: "18:00", totalHours: 11, overtimeHours: 1, approvedAt: new Date("2025-01-07"), notes: "Steel beam lifting - extended hours" },
    { contractorId: rahimCrane?.id ?? "", machineryId: towerCrane?.id ?? null, operatorName: "Yousuf Mohammadi", workSite: "Site A - Tower Section", date: new Date("2025-01-08"), startTime: "07:00", endTime: "17:00", totalHours: 10, overtimeHours: 0, approvedAt: new Date("2025-01-08") },
    { contractorId: bashirLabor?.id ?? "", operatorName: "Day Labor Team", workSite: "Site A - General", date: new Date("2025-01-06"), startTime: "07:00", endTime: "16:00", totalHours: 9, overtimeHours: 0, approvedAt: new Date("2025-01-06"), notes: "General construction support - 15 workers" },
    { contractorId: bashirLabor?.id ?? "", operatorName: "Day Labor Team", workSite: "Site A - General", date: new Date("2025-01-07"), startTime: "07:00", endTime: "17:00", totalHours: 10, overtimeHours: 1, approvedAt: new Date("2025-01-07"), notes: "Concrete pouring support - 20 workers" },
    { contractorId: sadiqTransport?.id ?? "", machineryId: flatbedTruck?.id ?? null, operatorName: "Rashid Driver", workSite: "Warehouse to Site A", date: new Date("2025-01-10"), startTime: "08:00", endTime: "16:00", totalHours: 8, overtimeHours: 0, approvedAt: new Date("2025-01-10") },
    { contractorId: sadiqTransport?.id ?? "", machineryId: hilux?.id ?? null, operatorName: "Rashid Driver", workSite: "City deliveries", date: new Date("2025-01-11"), startTime: "08:00", endTime: "17:00", totalHours: 9, overtimeHours: 0, approvedAt: new Date("2025-01-11") },
  ].filter(t => t.contractorId); // Only create if contractor exists

  // Set approvedBy to user.id for all timesheets
  for (const ts of sampleTimesheets) {
    ts.approvedBy = user.id;
  }

  for (const ts of sampleTimesheets) {
    await db.timesheet.create({
      data: {
        ...ts,
        machineryId: ts.machineryId || null,
        createdBy: user.id,
      },
    });
  }

  console.log("Created " + sampleTimesheets.length + " sample timesheets");

  // ─── Create sample fuel usage ─────────────────────────────────────────
  const sampleFuelUsages = [
    { contractorId: gulKhan?.id ?? "", machineryId: excavator?.id ?? null, fuelType: "DIESEL" as const, quantity: 180, unitPrice: 1.15, totalCost: 207.00, date: new Date("2025-01-06"), fuelStation: "Kabul Fuel Depot", notes: "Daily refuel - excavator" },
    { contractorId: gulKhan?.id ?? "", machineryId: excavator?.id ?? null, fuelType: "DIESEL" as const, quantity: 200, unitPrice: 1.15, totalCost: 230.00, date: new Date("2025-01-07"), fuelStation: "Kabul Fuel Depot", notes: "Full day + overtime" },
    { contractorId: noorTransport?.id ?? "", machineryId: dumpTruck?.id ?? null, fuelType: "DIESEL" as const, quantity: 150, unitPrice: 1.15, totalCost: 172.50, date: new Date("2025-01-06"), fuelStation: "Shell Kabul", notes: "Round trip to quarry" },
    { contractorId: noorTransport?.id ?? "", machineryId: dumpTruck?.id ?? null, fuelType: "DIESEL" as const, quantity: 160, unitPrice: 1.15, totalCost: 184.00, date: new Date("2025-01-07"), fuelStation: "Shell Kabul", notes: "Extra delivery trip" },
    { contractorId: rahimCrane?.id ?? "", machineryId: towerCrane?.id ?? null, fuelType: "DIESEL" as const, quantity: 250, unitPrice: 1.15, totalCost: 287.50, date: new Date("2025-01-06"), fuelStation: "Kabul Fuel Depot", notes: "Crane daily operation" },
    { contractorId: rahimCrane?.id ?? "", machineryId: towerCrane?.id ?? null, fuelType: "DIESEL" as const, quantity: 280, unitPrice: 1.15, totalCost: 322.00, date: new Date("2025-01-07"), fuelStation: "Kabul Fuel Depot", notes: "Extended hours - steel lifting" },
    { contractorId: sadiqTransport?.id ?? "", machineryId: flatbedTruck?.id ?? null, fuelType: "DIESEL" as const, quantity: 80, unitPrice: 1.15, totalCost: 92.00, date: new Date("2025-01-10"), fuelStation: "Total Station", notes: "Equipment transport" },
    { contractorId: sadiqTransport?.id ?? "", machineryId: hilux?.id ?? null, fuelType: "GASOLINE" as const, quantity: 45, unitPrice: 1.05, totalCost: 47.25, date: new Date("2025-01-11"), fuelStation: "Total Station", notes: "City delivery runs" },
  ].filter(f => f.contractorId);

  for (const fu of sampleFuelUsages) {
    await db.fuelUsage.create({
      data: {
        ...fu,
        machineryId: fu.machineryId || null,
        createdBy: user.id,
      },
    });
  }

  console.log("Created " + sampleFuelUsages.length + " sample fuel usage records");

  // Create default app settings
  await db.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      companyName: "YakhshiLedger",
      address: "Kabul, Afghanistan",
      phone: "+93 700 000 000",
      email: "info@yakhshiledger.com",
    },
  });

  console.log("Created default app settings");

  console.log("Seed complete!");
}

seed()
  .catch(console.error)
  .finally(() => db.$disconnect());
