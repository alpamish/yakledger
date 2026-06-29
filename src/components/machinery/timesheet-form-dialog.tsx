"use client";

import { useState, useEffect, useCallback } from "react";
import { pdf } from "@react-pdf/renderer";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { FileDown, Loader2, FileText, Calendar } from "lucide-react";
import { toast } from "sonner";
import { settingsApi } from "@/services/settings-api";
import type { Machinery, Contractor } from "@/types/contractor";
import MachineryTimesheetForm, {
  type TimesheetFormMode,
  type TimesheetFormPeriod,
  type TimesheetFormMonthlyLayout,
} from "@/components/pdf/machinery-timesheet-form";

interface TimesheetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machinery?: Machinery | null;
  contractor?: Contractor | null;
}

export function TimesheetFormDialog({
  open,
  onOpenChange,
  machinery,
  contractor,
}: TimesheetFormDialogProps) {
  const [mode, setMode] = useState<TimesheetFormMode>("hybrid");
  const [period, setPeriod] = useState<TimesheetFormPeriod>("weekly");
  const [monthlyLayout, setMonthlyLayout] = useState<TimesheetFormMonthlyLayout>("single");
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [autoFillDates, setAutoFillDates] = useState(false);
  const [startDate, setStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [useShamsi, setUseShamsi] = useState(false);
  const [companyName, setCompanyName] = useState("YakhshiLedger");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyAddress, setCompanyAddress] = useState<string | null>(null);
  const [companyPhone, setCompanyPhone] = useState<string | null>(null);
  const [companyEmail, setCompanyEmail] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      settingsApi.get().then((res) => {
        if (res.data) {
          setCompanyName(res.data.companyName || "YakhshiLedger");
          setCompanyLogo(res.data.companyLogo ?? null);
          setCompanyAddress(res.data.address ?? null);
          setCompanyPhone(res.data.phone ?? null);
          setCompanyEmail(res.data.email ?? null);
        }
      }).catch(() => {});
    }
  }, [open]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const blob = await pdf(
        <MachineryTimesheetForm
          machinery={machinery}
          contractor={contractor}
          companyName={companyName}
          companyLogo={companyLogo}
          companyAddress={companyAddress}
          companyPhone={companyPhone}
          companyEmail={companyEmail}
          mode={mode}
          period={period}
          monthlyLayout={monthlyLayout}
          month={period === "monthly" ? month : undefined}
          autoFillDates={autoFillDates}
          startDate={autoFillDates ? startDate : undefined}
          useShamsi={useShamsi}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const machineryName = machinery?.machineryName?.replace(/\s+/g, "-").toLowerCase() || "timesheet";
      link.href = url;
      link.download = `timesheet-form-${machineryName}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Timesheet form downloaded");
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to generate timesheet form:", err);
      toast.error("Failed to generate timesheet form");
    } finally {
      setIsGenerating(false);
    }
  }, [machinery, contractor, companyName, companyLogo, companyAddress, companyPhone, companyEmail, mode, period, monthlyLayout, month, autoFillDates, startDate, useShamsi, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-emerald-600" />
            Generate Timesheet Form
          </DialogTitle>
          <DialogDescription>
            Configure the timesheet form template for the machinery operator.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Fill Mode</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as TimesheetFormMode)} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="prefill" id="mode-prefill" />
                <Label htmlFor="mode-prefill" className="cursor-pointer">
                  Pre-fill all machinery info
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="hybrid" id="mode-hybrid" />
                <Label htmlFor="mode-hybrid" className="cursor-pointer">
                  Pre-fill company + driver + plate only
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="blank" id="mode-blank" />
                <Label htmlFor="mode-blank" className="cursor-pointer">
                  Fully blank form
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Period</Label>
            <RadioGroup value={period} onValueChange={(v) => setPeriod(v as TimesheetFormPeriod)} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="weekly" id="period-weekly" />
                <Label htmlFor="period-weekly" className="cursor-pointer">
                  Weekly (8 rows)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="biweekly" id="period-biweekly" />
                <Label htmlFor="period-biweekly" className="cursor-pointer">
                  Biweekly (14 rows)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="monthly" id="period-monthly" />
                <Label htmlFor="period-monthly" className="cursor-pointer">
                  Monthly
                </Label>
              </div>
            </RadioGroup>
          </div>

          {period === "monthly" && (
            <div className="space-y-2">
              <Label>Monthly Layout</Label>
              <RadioGroup value={monthlyLayout} onValueChange={(v) => setMonthlyLayout(v as TimesheetFormMonthlyLayout)} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="single" id="layout-single" />
                  <Label htmlFor="layout-single" className="cursor-pointer">
                    Single page (31 rows, compact)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="multi" id="layout-multi" />
                  <Label htmlFor="layout-multi" className="cursor-pointer">
                    Multi-page (12 rows per page, spacious)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {period === "monthly" && (
            <div className="space-y-2">
              <Label htmlFor="month-picker">Month</Label>
              <Input
                id="month-picker"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="auto-fill-dates"
                checked={autoFillDates}
                onCheckedChange={(v) => setAutoFillDates(v === true)}
              />
              <Label htmlFor="auto-fill-dates" className="cursor-pointer">
                Auto-fill dates in rows
              </Label>
            </div>
            {autoFillDates && (
              <div className="pl-6">
                <Label htmlFor="start-date" className="text-xs text-muted-foreground">
                  Start date
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

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={useShamsi}
              onClick={() => setUseShamsi((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                useShamsi ? "bg-emerald-600" : "bg-input"
              }`}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                  useShamsi ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <Label className="cursor-pointer flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-emerald-600" />
              Shamsi Date
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : (
              <FileDown className="size-4 mr-1.5" />
            )}
            {isGenerating ? "Generating..." : "Download PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
