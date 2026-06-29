"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { format, addDays, getDaysInMonth } from "date-fns";
import { machineryApi, timesheetsApi, fuelUsageApi } from "@/services/contractor-api";
import { settingsApi, type AppSettings } from "@/services/settings-api";
import type { Machinery, Timesheet, FuelUsage, DailyEntry, FuelEntry } from "@/types/contractor";
import { FUEL_TYPE_LABELS, type FuelType } from "@/types/contractor";
import type { TimesheetPageSelection } from "@/types/contractor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatShamsi, addShamsiDays, getShamsiMonthName, toShamsiYear, toShamsiMonth, toShamsiDay,
  getShamsiMonthDays,
} from "@/lib/shamsi";
import { Printer, Loader2, ArrowLeft, RotateCcw, FileText, Calendar } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatFarsi(date: Date, useShamsi?: boolean): string {
  if (useShamsi) {
    return `${String(toShamsiDay(date)).padStart(2, "0")}/${String(toShamsiMonth(date) + 1).padStart(2, "0")}/${toShamsiYear(date)}`;
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function farsiNum(n: number): string {
  const digits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(n).replace(/\d/g, (d) => digits[+d]);
}

function getMonthFarsiName(m: number, useShamsi?: boolean): string {
  if (useShamsi) return getShamsiMonthName(m - 1);
  const names = [
    "", "جنوری", "فبروری", "مارچ", "اپریل", "می", "جون",
    "جولای", "اگست", "سپتمبر", "اکتوبر", "نومبر", "دسمبر",
  ];
  return names[m] || "";
}

// ─── Print Styles ────────────────────────────────────────────────────────────

const PRINT_STYLES = `
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: "Noto Kufi Arabic", Arial, sans-serif; color: #263238; margin: 0; padding: 10px; }
    .page { width: 100%; min-height: 280mm; padding: 8px; page-break-after: always; }
    .machinery-label { text-align: center; font-weight: bold; font-size: 12px; margin-bottom: 4px; padding: 4px; background: #f3f4f6; border: 1px solid #d5dde8; border-radius: 4px; }
    .header { text-align: center; margin-bottom: 10px; }
    .header h1 { margin: 0; color: #334155; font-size: 22px; }
    .month { color: #607d8b; margin-top: 4px; font-size: 14px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; border: 1px solid #d5dde8; border-radius: 8px; overflow: hidden; margin-bottom: 5px; }
    .info-cell { padding: 2px 4px; font-size: 10px; border-left: 1px solid #d5dde8; }
    .info-cell:last-child { border-left: none; }
    .info-label { font-weight: 600; margin-left: 4px; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #ebbe5c; color: #263238; padding: 2px; font-size: 10px; text-align: center; border: 1px solid gray; }
    td { border: 1px solid gray; text-align: center; }
    .section-title { background: #f3f4f6; color: #263238; padding: 6px; border-radius: 6px; border: 1px solid #d5dde8; margin: 10px 0; text-align: center; font-size: 13px; }
    .sign { display: flex; gap: 20px; margin-top: 12px; }
    .sign div { flex: 1; border-top: 1px solid #777; padding-top: 6px; text-align: center; font-size: 11px; }
    .summary-table { border-collapse: collapse; width: 100%; font-size: 11px; font-weight: bold; margin-top: 8px; }
    .summary-table td { border: 1px solid #192636; padding: 5px; text-align: center; }
    .summary-table td:first-child { text-align: right; }
`;

// ─── Page 1 HTML Generator (Timesheet) ─────────────────────────────────────

function generatePage1Html(
  entries: DailyEntry[],
  machinery: { machineryType?: string | null; driverName?: string | null; plateNumber?: string | null } | null,
  contractorName: string,
  companyName: string,
  month: string,
  totalHours: number,
  useShamsi?: boolean,
  emptyMode?: boolean,
  machineryLabel?: string,
): string {
  const [year, monthNum] = month.split("-").map(Number);
  const dateObj = new Date(year, monthNum - 1, 1);
  const monthFarsi = useShamsi
    ? `${getShamsiMonthName(toShamsiMonth(dateObj))} ${toShamsiYear(dateObj)}`
    : `${getMonthFarsiName(monthNum)} ${year}`;

  const tableRows = entries
    .map(
      (e) => `
<tr>
  <td style="width:5%;padding:2.5px;border:1px solid #5f6265;text-align:center;font-size:10px">${e.day}</td>
  <td style="width:13%;padding:2.5px;border:1px solid #5f6265;text-align:center;font-size:10px">${e.farsiDate}</td>
  <td style="width:13%;padding:2.5px;border:1px solid #5f6265;text-align:center;font-size:10px">${e.startTime}</td>
  <td style="width:13%;padding:2.5px;border:1px solid #5f6265;text-align:center;font-size:10px">${e.lunchStart}</td>
  <td style="width:13%;padding:2.5px;border:1px solid #5f6265;text-align:center;font-size:10px">${e.lunchEnd}</td>
  <td style="width:13%;padding:2.5px;border:1px solid #5f6265;text-align:center;font-size:10px">${e.endTime}</td>
  <td style="width:8%;padding:2.5px;border:1px solid #5f6265;text-align:center;font-size:10px">${e.totalHours || ""}</td>
  <td style="width:10%;padding:2.5px;border:1px solid #5f6265;text-align:center;font-size:10px">${e.overtimeHours || ""}</td>
  <td style="width:14%;padding:2.5px;border:1px solid #5f6265;text-align:center;font-size:10px">${e.notes}</td>
</tr>`,
    )
    .join("");

  return `<div class="page" style="padding-top: 25px;">
    ${machineryLabel ? `<div class="machinery-label">${machineryLabel}</div>` : ""}
    <div class="header">
      <h1>${companyName || "تایم شیت ماشینری"}</h1>
      <div class="month" style="position:absolute;">${monthFarsi}</div>
      <div class="month" style="background:yellow;">پروژه اعمار سرک قیصار-لامان</div>
    </div>
    <div class="info-grid">
      <div class="info-cell"><span class="info-label">قرارداد کننده:</span><span>${contractorName || ""}</span></div>
      <div class="info-cell"><span class="info-label">نوع ماشین:</span><span>${machinery?.machineryType || ""}</span></div>
      <div class="info-cell"><span class="info-label">راننده:</span><span>${machinery?.driverName || ""}</span></div>
      <div class="info-cell"><span class="info-label">نمبر پلیت:</span><span>${machinery?.plateNumber || ""}</span></div>
    </div>
    <table>
      <tr>
        <th style="background:white;border:none"></th>
        <th style="background:white;border:none"></th>
        <th colspan="2" style="background:#f3f4f6;color:black;font-weight:bold;border:1px solid gray; border-bottom: none;font-size:7px">ساعت کار قبل از ظهر</th>
        <th colspan="2" style="background:#f3f4f6;color:black;font-weight:bold;border:1px solid gray;border-bottom: none;font-size:7px">ساعت کار بعد از ظهر</th>
        <th style="background:white;border:none"></th>
        <th style="background:white;border:none"></th>
        <th style="background:white;border:none"></th>
      </tr>
      <tr>
        <th>#</th><th>تاریخ</th><th>شروع</th><th>ختم</th><th>شروع</th><th>ختم</th><th>مجموعه</th><th>اضافه کاری</th><th>ملاحظات</th>
      </tr>
      ${tableRows}
    </table>
    <table class="summary-table">
      <tr>
        <td>مجموع کار یک ماهه به ساعت: ${emptyMode ? "_______________" : totalHours.toFixed(1)}</td>
        <td>قیمت کار در فی ساعت: _______________</td>
        <td>قیمت مجموعی: _______________</td>
      </tr>
    </table>
    <div class="sign">
      <div>امضاء راننده</div>
      <div>امضاء مسئول</div>
      <div>تاریخ</div>
    </div>
  </div>`;
}

// ─── Page 2 HTML Generator (Payments & Fuel) ──────────────────────────────

function generatePage2Html(
  fuelEntries: FuelEntry[],
): string {
  const fuelRows = fuelEntries
    .map(
      (f) => `
<tr>
  <td style="width:5%;padding:5px;border:1px solid #192636;text-align:center;font-size:10px">${f.index}</td>
  <td style="width:22%;padding:5px;border:1px solid #192636;text-align:center;font-size:10px">${f.date}</td>
  <td style="width:20%;padding:5px;border:1px solid #192636;text-align:center;font-size:10px">${f.fuelType}</td>
  <td style="width:15%;padding:5px;border:1px solid #192636;text-align:center;font-size:10px">${f.liters || ""}</td>
  <td style="width:20%;padding:5px;border:1px solid #192636;text-align:center;font-size:10px">${f.amount || ""}</td>
  <td style="width:15%;padding:5px;border:1px solid #192636;text-align:center;font-size:10px">${f.notes}</td>
</tr>`,
    )
    .join("");

  return `<div class="page">
    <div class="header"><h1>ثبت پرداخت و سوخت</h1></div>
    <div class="section-title">پرداخت‌ها</div>
    <table>
      <tr><th style="width:5%;">#</th><th style="width:17%">تاریخ</th><th style="width: 35%">شرح</th><th style="width: 15%">مبلغ</th><th style="width: 18%">پرداخت کننده</th><th style="15%">امضاء</th></tr>
      ${Array.from({ length: 10 }, (_, i) => `<tr><td style="padding:5px">${i + 1}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}
    </table>
    <div class="section-title">ثبت سوخت</div>
    <table>
      <tr><th>#</th><th>تاریخ</th><th>نوع سوخت</th><th>لیتر</th><th>مبلغ</th><th>ملاحظات</th></tr>
      ${fuelRows || Array.from({ length: 10 }, (_, i) => `<tr><td style="padding:5px">${i + 1}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}
    </table>
    <div style="display:flex;justify-content:space-between;padding:8px 0;margin-top:10px">
      <div style="width:23%;border:1px solid #ccc;padding:5px;border-radius:5px;text-align:center">
        <div style="font-size:10px;margin-bottom:4px">امضاء مدیر مالی</div>
        <div style="border-bottom:1px solid #94a3b8;height:24px"></div>
      </div>
      <div style="width:23%;border:1px solid #ccc;padding:5px;border-radius:5px;text-align:center">
        <div style="font-size:10px;margin-bottom:4px">امضاء مدیر ماشینری</div>
        <div style="border-bottom:1px solid #94a3b8;height:24px"></div>
      </div>
      <div style="width:23%;border:1px solid #ccc;padding:5px;border-radius:5px;text-align:center">
        <div style="font-size:10px;margin-bottom:4px">امضاء مدیر توزیع تیل</div>
        <div style="border-bottom:1px solid #94a3b8;height:24px"></div>
      </div>
      <div style="width:23%;border:1px solid #ccc;padding:5px;border-radius:5px;text-align:center">
        <div style="font-size:10px;margin-bottom:4px">چک لیست راننده</div>
        <div style="border-bottom:1px solid #94a3b8;height:24px"></div>
      </div>
    </div>
  </div>`;
}

// ─── Document HTML Shell ─────────────────────────────────────────────────

function generateDocumentHtml(
  pagesHtml: string[],
  title: string,
): string {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  ${pagesHtml.join("\n")}
</body>
</html>`;
}

// ─── Single Machinery Page Set Generator ──────────────────────────────────

function generateSingleMachineryHtml(
  entries: DailyEntry[],
  fuelEntries: FuelEntry[],
  machinery: Machinery | null,
  contractorName: string,
  companyName: string,
  month: string,
  totalHours: number,
  useShamsi?: boolean,
  emptyMode?: boolean,
  pageSelection?: TimesheetPageSelection,
  machineryLabel?: string,
): string {
  const pages: string[] = [];
  if (pageSelection === "front" || pageSelection === "both") {
    pages.push(generatePage1Html(entries, machinery, contractorName, companyName, month, totalHours, useShamsi, emptyMode, machineryLabel));
  }
  if (pageSelection === "back" || pageSelection === "both") {
    pages.push(generatePage2Html(fuelEntries));
  }
  return pages.join("");
}

// ─── Machinery Print Data ──────────────────────────────────────────────────

interface MachineryPrintData {
  machinery: Machinery;
  contractorName: string;
  dailyEntries: DailyEntry[];
  fuelEntries: FuelEntry[];
  totalHours: number;
}

// ─── Entry Computation Helpers ──────────────────────────────────────────────

function computeDailyEntries(
  timesheets: Timesheet[],
  daysInMonth: number,
  year: number,
  monthNum: number,
  autoFillDates: boolean,
  startDate: string,
  useShamsi: boolean,
): DailyEntry[] {
  const timesheetMap = new Map<string, Timesheet>();
  for (const ts of timesheets) {
    const key = format(new Date(ts.date), "yyyy-MM-dd");
    timesheetMap.set(key, ts);
  }
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const useAutoFill = autoFillDates && startDate;
    const dateObj = useAutoFill
      ? (useShamsi ? addShamsiDays(new Date(startDate), i) : addDays(new Date(startDate), i))
      : new Date(year, monthNum - 1, day);
    const dateStr = format(dateObj, "yyyy-MM-dd");
    const ts = timesheetMap.get(dateStr);
    return {
      day, dateStr,
      farsiDate: formatFarsi(dateObj, useShamsi),
      startTime: ts?.startTime ?? "",
      lunchStart: ts?.lunchStart ?? "",
      lunchEnd: ts?.lunchEnd ?? "",
      endTime: ts?.endTime ?? "",
      totalHours: ts?.totalHours ?? 0,
      overtimeHours: ts?.overtimeHours ?? 0,
      notes: ts?.notes ?? "",
    };
  });
}

function computeFuelEntries(fuelUsages: FuelUsage[], useShamsi: boolean): FuelEntry[] {
  return fuelUsages.map((f, i) => ({
    index: i + 1,
    date: formatFarsi(new Date(f.date), useShamsi),
    fuelType: FUEL_TYPE_LABELS[f.fuelType as FuelType] ?? f.fuelType,
    liters: f.quantity,
    amount: f.totalCost,
    notes: f.notes ?? "",
  }));
}

// ─── Component ──────────────────────────────────────────────────────────────

interface MachineryTimesheetTemplateProps {
  onBack?: () => void;
  initialMachineryIds?: string[];
}

export function MachineryTimesheetTemplate({ onBack, initialMachineryIds }: MachineryTimesheetTemplateProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [selectedMachineryIds, setSelectedMachineryIds] = useState<string[]>(initialMachineryIds ?? []);
  const [step, setStep] = useState<"config" | "preview">("config");
  const [pageSelection, setPageSelection] = useState<TimesheetPageSelection>("both");

  const [machineryMap, setMachineryMap] = useState<Map<string, Machinery>>(new Map());
  const [machineryResults, setMachineryResults] = useState<Map<string, MachineryPrintData>>(new Map());
  const [firstMachineryId, setFirstMachineryId] = useState("");
  const [companySettings, setCompanySettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [useShamsi, setUseShamsi] = useState(false);
  const [autoFillDates, setAutoFillDates] = useState(false);
  const [startDate, setStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [emptyMode, setEmptyMode] = useState(false);
  const [showEmptyDates, setShowEmptyDates] = useState(true);

  useEffect(() => {
    Promise.all([
      machineryApi.getAll({ pageSize: 1000 }),
      settingsApi.get(),
    ])
      .then(([machRes, settingsRes]) => {
        if (machRes.data?.data) {
          const map = new Map<string, Machinery>();
          for (const m of machRes.data.data) {
            map.set(m.id, m);
          }
          setMachineryMap(map);
        }
        if (settingsRes.data) setCompanySettings(settingsRes.data);
      })
      .catch(() => toast.error("Failed to load data"))
      .finally(() => setIsLoading(false));
  }, []);

  const machineryList = useMemo(
    () => Array.from(machineryMap.values()),
    [machineryMap],
  );

  const handleToggleMachinery = useCallback((id: string) => {
    setSelectedMachineryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleSelectAllMachinery = useCallback(() => {
    setSelectedMachineryIds(machineryList.map((m) => m.id));
  }, [machineryList]);

  const handleDeselectAllMachinery = useCallback(() => {
    setSelectedMachineryIds([]);
  }, []);

  const allSelected = selectedMachineryIds.length === machineryList.length && machineryList.length > 0;

  const [year, monthNum] = useMemo(() => {
    const parts = selectedMonth.split("-").map(Number);
    return [parts[0], parts[1]];
  }, [selectedMonth]);

  const daysInMonth = useMemo(
    () => useShamsi ? getShamsiMonthDays(year, monthNum - 1) : getDaysInMonth(new Date(year, monthNum - 1)),
    [year, monthNum, useShamsi],
  );

  const handleGenerate = useCallback(async () => {
    if (selectedMachineryIds.length === 0) {
      toast.error("Please select at least one machinery");
      return;
    }
    setIsGenerating(true);
    try {
      const useAutoFill = autoFillDates && startDate;
      const dateFrom = useAutoFill
        ? startDate
        : format(new Date(year, monthNum - 1, 1), "yyyy-MM-dd");
      const dateTo = useAutoFill
        ? format(addDays(new Date(startDate), daysInMonth - 1), "yyyy-MM-dd")
        : format(new Date(year, monthNum - 1, daysInMonth), "yyyy-MM-dd");

      const results = new Map<string, MachineryPrintData>();

      for (const mid of selectedMachineryIds) {
        const m = machineryMap.get(mid);
        if (!m) continue;

        const [tsRes, fuelRes] = await Promise.all([
          timesheetsApi.getAll({ machineryId: mid, dateFrom, dateTo, pageSize: 50 }),
          fuelUsageApi.getAll({ machineryId: mid, dateFrom, dateTo, pageSize: 50 }),
        ]);

        const ts = tsRes.data?.data ?? [];
        const fu = fuelRes.data?.data ?? [];

        results.set(mid, {
          machinery: m,
          contractorName: m.assignedContractor?.contractorName ?? "",
          dailyEntries: computeDailyEntries(ts, daysInMonth, year, monthNum, autoFillDates, startDate, useShamsi),
          fuelEntries: computeFuelEntries(fu, useShamsi),
          totalHours: ts.reduce((s, t) => s + t.totalHours, 0),
        });
      }

      setMachineryResults(results);
      setFirstMachineryId(selectedMachineryIds[0]);
      setStep("preview");
    } catch {
      toast.error("Failed to fetch timesheet data");
    } finally {
      setIsGenerating(false);
    }
  }, [selectedMachineryIds, year, monthNum, daysInMonth, autoFillDates, startDate, useShamsi, machineryMap]);

  const firstData = useMemo(
    () => machineryResults.get(firstMachineryId),
    [machineryResults, firstMachineryId],
  );

  const handlePrint = useCallback(() => {
    const pagesHtml: string[] = [];
    const companyName = companySettings?.companyName || "YakhshiLedger";
    let idx = 0;
    for (const [mid, data] of machineryResults) {
      const m = machineryMap.get(mid);
      const label = selectedMachineryIds.length > 1
        ? `${m?.machineryName || ""}${m?.plateNumber ? ` (${m.plateNumber})` : ""}`
        : undefined;
      pagesHtml.push(generateSingleMachineryHtml(
        data.dailyEntries, data.fuelEntries, data.machinery, data.contractorName,
        companyName, selectedMonth, data.totalHours, useShamsi, false,
        pageSelection, label,
      ));
      idx++;
    }
    const title = `تایم شیت ماشینری - ${selectedMonth}`;
    const html = generateDocumentHtml(pagesHtml, title);
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) { toast.error("Please allow popups to print"); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 800);
  }, [machineryResults, machineryMap, selectedMachineryIds, companySettings, selectedMonth, useShamsi, pageSelection]);

  const handlePrintEmpty = useCallback(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const emptyEntries: DailyEntry[] = Array.from({ length: 31 }, (_, i) => {
      const day = i + 1;
      const useAutoFill = autoFillDates && startDate;
      const rowDate = useAutoFill
        ? (useShamsi ? addShamsiDays(new Date(startDate), i) : addDays(new Date(startDate), i))
        : new Date(y, m - 1, day);
      return {
        day, dateStr: "",
        farsiDate: showEmptyDates ? formatFarsi(rowDate, useShamsi) : "",
        startTime: "", lunchStart: "", lunchEnd: "", endTime: "",
        totalHours: 0, overtimeHours: 0, notes: "",
      };
    });
    const emptyFuelEntries: FuelEntry[] = Array.from({ length: 10 }, (_, i) => ({
      index: i + 1, date: "", fuelType: "", liters: 0, amount: 0, notes: "",
    }));
    const companyName = companySettings?.companyName || "YakhshiLedger";
    const html = generateDocumentHtml(
      [generateSingleMachineryHtml(
        emptyEntries, emptyFuelEntries, null, "",
        companyName, selectedMonth, 0, useShamsi, true,
        pageSelection, undefined,
      )],
      `تایم شیت خالی - ${selectedMonth}`,
    );
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) { toast.error("Please allow popups to print"); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 800);
  }, [selectedMonth, useShamsi, showEmptyDates, companySettings, pageSelection, autoFillDates, startDate]);

  const handleReset = useCallback(() => {
    setStep("config");
    setMachineryResults(new Map());
    setFirstMachineryId("");
  }, []);

  const monthFarsiName = useMemo(() => {
    const useAutoFill = autoFillDates && startDate;
    if (useAutoFill) {
      const sd = new Date(startDate);
      return useShamsi
        ? `${getShamsiMonthName(toShamsiMonth(sd))} ${toShamsiYear(sd)}`
        : `${getMonthFarsiName(sd.getMonth() + 1)} ${sd.getFullYear()}`;
    }
    const dateObj = new Date(year, monthNum - 1, 1);
    return useShamsi
      ? `${getShamsiMonthName(toShamsiMonth(dateObj))} ${toShamsiYear(dateObj)}`
      : `${getMonthFarsiName(monthNum)} ${year}`;
  }, [monthNum, year, useShamsi, autoFillDates, startDate]);

  // ─── Config View ────────────────────────────────────────────────────────

  if (step === "config") {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-500" />
              تایم شیت ماشینری
            </h2>
            <p className="text-sm text-muted-foreground">
              فرم قابل چاپ ماهوار برای ثبت ساعت کار ماشینری
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">تنظیمات فرم</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={useShamsi}
                onClick={() => setUseShamsi((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                  useShamsi ? "bg-gray-700" : "bg-input"
                }`}
              >
                <span
                  className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                    useShamsi ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <Label className="cursor-pointer flex items-center gap-1.5 text-sm">
                <Calendar className="h-4 w-4 text-gray-500" />
                تاریخ شمسی
              </Label>
            </div>

            <div className="space-y-2">
              <Label>ماه</Label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto-fill-dates"
                  checked={autoFillDates}
                  onChange={(e) => setAutoFillDates(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                />
                <Label htmlFor="auto-fill-dates" className="cursor-pointer text-sm">
                  تاریخ خودکار
                </Label>
              </div>
              {autoFillDates && (
                <div className="pr-6">
                  <Label htmlFor="start-date" className="text-xs text-muted-foreground">
                    تاریخ شروع
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 mt-1"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>ماشین‌ها</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllMachinery}
                    className="text-xs text-gray-600 hover:text-gray-900 underline"
                  >
                    انتخاب همه
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllMachinery}
                    className="text-xs text-gray-600 hover:text-gray-900 underline"
                  >
                    پاک کردن
                  </button>
                </div>
              </div>
              <div className="border border-gray-300 rounded-md max-h-48 overflow-y-auto">
                {isLoading ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">در حال بارگذاری...</div>
                ) : machineryList.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">ماشینی یافت نشد</div>
                ) : (
                  machineryList.map((m) => (
                    <label
                      key={m.id}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-b border-gray-100 last:border-b-0 hover:bg-gray-50 ${
                        selectedMachineryIds.includes(m.id) ? "bg-gray-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMachineryIds.includes(m.id)}
                        onChange={() => handleToggleMachinery(m.id)}
                        className="h-4 w-4 rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                      />
                      <span>
                        {m.machineryName}
                        {m.plateNumber ? ` (${m.plateNumber})` : ""}
                        {m.driverName ? ` - ${m.driverName}` : ""}
                      </span>
                    </label>
                  ))
                )}
              </div>
              {selectedMachineryIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedMachineryIds.length} ماشین انتخاب شد
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>صفحات چاپ</Label>
              <div className="flex gap-3">
                {(["both", "front", "back"] as const).map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="page-selection"
                      value={opt}
                      checked={pageSelection === opt}
                      onChange={() => setPageSelection(opt)}
                      className="h-3.5 w-3.5 text-gray-600 focus:ring-gray-500"
                    />
                    {opt === "both" ? "هر دو صفحه" : opt === "front" ? "صفحه اول (تایم شیت)" : "صفحه دوم (پرداخت و سوخت)"}
                  </label>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || selectedMachineryIds.length === 0}
              className="w-full bg-gray-700 hover:bg-gray-800 text-white"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  در حال بارگذاری...
                </>
              ) : (
                "پیش‌نمایش فرم"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">فرم خالی</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="empty-mode"
                checked={emptyMode}
                onChange={(e) => setEmptyMode(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-600 focus:ring-gray-500"
              />
              <Label htmlFor="empty-mode" className="cursor-pointer text-sm">
                فرم خالی (بدون اطلاعات)
              </Label>
            </div>
            {emptyMode && (
              <>
                <div className="flex items-center gap-2 pr-6">
                  <input
                    type="checkbox"
                    id="show-empty-dates"
                    checked={showEmptyDates}
                    onChange={(e) => setShowEmptyDates(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                  />
                  <Label htmlFor="show-empty-dates" className="cursor-pointer text-sm">
                    نمایش تاریخ
                  </Label>
                </div>
                <Button
                  onClick={handlePrintEmpty}
                  className="w-full bg-gray-700 hover:bg-gray-800 text-white"
                >
                  <Printer className="ml-2 h-4 w-4" />
                  پرینت فرم خالی
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Preview View ──────────────────────────────────────────────────────

  const previewData = firstData;
  const previewCount = machineryResults.size;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-bold">
            تایم شیت ماشینری - {monthFarsiName}
          </h2>
          <div className="flex items-center gap-3 mr-2">
            {previewCount > 1 && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                نمایش ۱ از {previewCount} ماشین
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                id="pv-auto-fill"
                checked={autoFillDates}
                onChange={(e) => setAutoFillDates(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-gray-600 focus:ring-gray-500"
              />
              <label htmlFor="pv-auto-fill" className="text-xs text-muted-foreground cursor-pointer">
                خودکار
              </label>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                role="switch"
                aria-checked={useShamsi}
                onClick={() => setUseShamsi((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                  useShamsi ? "bg-gray-700" : "bg-input"
                }`}
              >
                <span
                  className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                    useShamsi ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-xs text-muted-foreground">شمسی</span>
            </div>
          </div>
        </div>
        <Button onClick={handlePrint} className="bg-gray-700 hover:bg-gray-800 text-white">
          <Printer className="ml-2 h-4 w-4" />
          پرینت
        </Button>
      </div>

      <div id="timesheet-preview" className="print-area">
        <style>{`
          @media print {
            body { margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .print-area { display: block !important; }
            [data-sidebar], .sidebar, header, footer { display: none !important; }
            @page { size: A4 portrait; margin: 10mm; }
          }
        `}</style>

        {(pageSelection === "front" || pageSelection === "both") && previewData && (
          <div className="bg-white rounded-lg border p-3 mb-4 print:mb-0 print:rounded-none print:border-none print:p-2" style={{ minHeight: "280mm" }}>
            {previewCount > 1 && (
              <div className="text-center text-xs text-gray-500 mb-2 bg-gray-50 py-1 rounded">
                {previewData.machinery.machineryName}
                {previewData.machinery.plateNumber ? ` (${previewData.machinery.plateNumber})` : ""}
              </div>
            )}
            <div className="text-center mb-3">
              <h1 className="text-xl font-bold text-gray-800 m-0">
                {companySettings?.companyName || "تایم شیت ماشینری"}
              </h1>
              <div className="text-sm text-gray-500 mt-1">{monthFarsiName}</div>
            </div>
            <div className="grid grid-cols-4 border border-gray-300 rounded-lg overflow-hidden mb-3 text-sm">
              <div className="p-2 border-l border-gray-300">
                <span className="font-semibold ml-1">قرارداد کننده:</span>
                <span className="border-b border-gray-400 inline-block min-w-[60px]">{previewData.contractorName}</span>
              </div>
              <div className="p-2 border-l border-gray-300">
                <span className="font-semibold ml-1">نوع ماشین:</span>
                <span className="border-b border-gray-400 inline-block min-w-[60px]">{previewData.machinery.machineryType ?? ""}</span>
              </div>
              <div className="p-2 border-l border-gray-300">
                <span className="font-semibold ml-1">راننده:</span>
                <span className="border-b border-gray-400 inline-block min-w-[60px]">{previewData.machinery.driverName ?? ""}</span>
              </div>
              <div className="p-2">
                <span className="font-semibold ml-1">نمبر پلیت:</span>
                <span className="border-b border-gray-400 inline-block min-w-[60px]">{previewData.machinery.plateNumber ?? ""}</span>
              </div>
            </div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="bg-white border-none p-0" colSpan={2}></th>
                  <th colSpan={2} className="bg-white text-black font-bold border-none text-[9px] p-1">ساعت کار قبل از ظهر</th>
                  <th colSpan={2} className="bg-white text-black font-bold border-none text-[9px] p-1">ساعت کار بعد از ظهر</th>
                  <th className="bg-white border-none p-0" colSpan={3}></th>
                </tr>
                <tr>
                  <th className="bg-gray-100 border border-gray-300 p-1.5 text-[10px]">#</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5 text-[10px]">تاریخ</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5 text-[10px]">شروع</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5 text-[10px]">ختم</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5 text-[10px]">شروع</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5 text-[10px]">ختم</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5 text-[10px]">ساعت</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5 text-[10px]">اضافی</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5 text-[10px]">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {previewData.dailyEntries.map((e) => (
                  <tr key={e.day}>
                    <td className="border border-gray-800 p-1 text-center text-[10px] w-[5%]">{farsiNum(e.day)}</td>
                    <td className="border border-gray-800 p-1 text-center text-[10px] w-[13%]">{e.farsiDate}</td>
                    <td className="border border-gray-800 p-1 text-center text-[10px] w-[13%]">{e.startTime}</td>
                    <td className="border border-gray-800 p-1 text-center text-[10px] w-[13%]">{e.lunchStart}</td>
                    <td className="border border-gray-800 p-1 text-center text-[10px] w-[13%]">{e.lunchEnd}</td>
                    <td className="border border-gray-800 p-1 text-center text-[10px] w-[13%]">{e.endTime}</td>
                    <td className="border border-gray-800 p-1 text-center text-[10px] w-[8%]">{e.totalHours ? farsiNum(Math.round(e.totalHours * 10) / 10) : ""}</td>
                    <td className="border border-gray-800 p-1 text-center text-[10px] w-[10%]">{e.overtimeHours ? farsiNum(Math.round(e.overtimeHours * 10) / 10) : ""}</td>
                    <td className="border border-gray-800 p-1 text-center text-[10px] w-[14%]">{e.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full border-collapse text-xs font-bold mt-2">
              <tbody>
                <tr>
                  <td className="border border-gray-800 p-1.5 text-right">
                    مجموع کار یک ماهه به ساعت: {farsiNum(Math.round(previewData.totalHours * 10) / 10)}
                  </td>
                  <td className="border border-gray-800 p-1.5 text-right">قیمت کار در فی ساعت: _______________</td>
                  <td className="border border-gray-800 p-1.5 text-right">قیمت مجموعی: _______________</td>
                </tr>
              </tbody>
            </table>
            <div className="flex gap-5 mt-4">
              {["امضاء راننده", "امضاء مسئول", "تاریخ"].map((s) => (
                <div key={s} className="flex-1 border-t border-gray-500 pt-2 text-center text-sm">{s}</div>
              ))}
            </div>
          </div>
        )}

        {(pageSelection === "back" || pageSelection === "both") && previewData && (
          <div className="bg-white rounded-lg border p-3 print:mb-0 print:rounded-none print:border-none print:p-2 print:break-before-page" style={{ minHeight: "280mm" }}>
            <div className="text-center mb-3">
              <h1 className="text-lg font-bold text-gray-800 m-0">ثبت پرداخت و سوخت</h1>
            </div>
            <div className="bg-gray-100 text-gray-800 border border-gray-300 p-2 rounded-lg text-center text-sm mb-3">پرداخت‌ها</div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">#</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">تاریخ</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">شرح</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">مبلغ</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">پرداخت شده توسط</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">امضاء</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }, (_, i) => (
                  <tr key={i}>
                    <td className="border border-gray-800 p-2 text-center text-[10px]">{farsiNum(i + 1)}</td>
                    <td className="border border-gray-800 p-2 text-center text-[10px]"></td>
                    <td className="border border-gray-800 p-2 text-center text-[10px]"></td>
                    <td className="border border-gray-800 p-2 text-center text-[10px]"></td>
                    <td className="border border-gray-800 p-2 text-center text-[10px]"></td>
                    <td className="border border-gray-800 p-2 text-center text-[10px]"></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bg-gray-100 text-gray-800 border border-gray-300 p-2 rounded-lg text-center text-sm mb-3 mt-4">ثبت سوخت</div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">#</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">تاریخ</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">نوع سوخت</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">لیتر</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">مبلغ</th>
                  <th className="bg-gray-100 border border-gray-300 p-1.5">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {previewData.fuelEntries.length > 0 ? (
                  previewData.fuelEntries.map((f) => (
                    <tr key={f.index}>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]">{farsiNum(f.index)}</td>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]">{f.date}</td>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]">{f.fuelType}</td>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]">{f.liters ? farsiNum(Math.round(f.liters * 100) / 100) : ""}</td>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]">{f.amount ? farsiNum(Math.round(f.amount)) : ""}</td>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]">{f.notes}</td>
                    </tr>
                  ))
                ) : (
                  Array.from({ length: 10 }, (_, i) => (
                    <tr key={i}>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]">{farsiNum(i + 1)}</td>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]"></td>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]"></td>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]"></td>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]"></td>
                      <td className="border border-gray-800 p-1.5 text-center text-[10px]"></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="flex justify-between gap-3 mt-4">
              <div className="flex-1 border border-gray-300 rounded p-2 text-center">
                <div className="text-xs mb-1">امضاء مدیر مالی</div>
                <div className="border-b border-gray-400 h-6"></div>
              </div>
              <div className="flex-1 border border-gray-300 rounded p-2 text-center">
                <div className="text-xs mb-1">امضاء مدیر ماشینری</div>
                <div className="border-b border-gray-400 h-6"></div>
              </div>
              <div className="flex-1 border border-gray-300 rounded p-2 text-center">
                <div className="text-xs mb-1">امضاء مدیر توزیع تیل</div>
                <div className="border-b border-gray-400 h-6"></div>
              </div>
              <div className="flex-1 border border-gray-300 rounded p-2 text-center">
                <div className="text-xs mb-1">چک لیست راننده</div>
                <div className="border-b border-gray-400 h-6"></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
