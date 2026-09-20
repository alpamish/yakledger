"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { payrollApi } from "@/services/payroll-api";
import { walletApi } from "@/services/wallet-api";
import { formatMinor } from "@/lib/money";
import { toast } from "sonner";

interface Wallet {
  id: string;
  name: string;
  balance: number;
  currency?: string;
}

const generateFormSchema = z.object({
  periodStart: z.string().min(1, "Period start is required"),
  periodEnd: z.string().min(1, "Period end is required"),
  allowances: z.number().min(0, "Must be non-negative"),
  bonuses: z.number().min(0, "Must be non-negative"),
  deductions: z.number().min(0, "Must be non-negative"),
  walletId: z.string(),
  deductExpenses: z.boolean(),
  workDays: z.number().int().min(1).max(31).optional(),
});

type GenerateFormValues = z.infer<typeof generateFormSchema>;

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: iso(start), periodEnd: iso(end) };
}

export function PayrollGenerateDialog({
  open,
  onOpenChange,
  employeeIds,
  scopeLabel,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to generate for all active employees. */
  employeeIds?: string[];
  scopeLabel?: string;
  onGenerated: () => void;
}) {
  const defaults = currentMonthRange();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [saving, setSaving] = useState(false);

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateFormSchema) as Resolver<GenerateFormValues>,
    defaultValues: {
      periodStart: defaults.periodStart,
      periodEnd: defaults.periodEnd,
      allowances: 0,
      bonuses: 0,
      deductions: 0,
      walletId: "",
      deductExpenses: true,
      workDays: undefined,
    },
  });

  useEffect(() => {
    if (open) {
      const d = currentMonthRange();
      form.reset({
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        allowances: 0,
        bonuses: 0,
        deductions: 0,
        walletId: "",
        deductExpenses: true,
        workDays: undefined,
      });
      walletApi
        .list()
        .then((res) => setWallets(res.data ?? []))
        .catch(() => setWallets([]));
    }
  }, [open, form]);

  async function submit(values: GenerateFormValues) {
    if (values.periodEnd < values.periodStart) {
      form.setError("periodEnd", { message: "Period end must be on or after period start" });
      return;
    }
    setSaving(true);
    try {
      const res = await payrollApi.generate({
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
        ...(employeeIds ? { employeeIds } : {}),
        ...(values.allowances ? { allowancesMinor: values.allowances } : {}),
        ...(values.bonuses ? { bonusesMinor: values.bonuses } : {}),
        ...(values.deductions ? { deductionsMinor: values.deductions } : {}),
        ...(values.walletId ? { walletId: values.walletId } : {}),
        deductExpenses: values.deductExpenses,
        ...(values.workDays ? { workDays: values.workDays } : {}),
      });
      const errors: string[] = res.data?.errors ?? [];
      const skipped: number = res.data?.skipped ?? 0;
      if (errors.length > 0) {
        toast.warning(
          `Generated ${res.data?.generated ?? 0} record(s). ${skipped > 0 ? `${skipped} skipped. ` : ""}Errors: ${errors.join("; ")}`
        );
      } else if (skipped > 0) {
        toast.success(
          res.message || `Generated ${res.data?.generated ?? 0} record(s), ${skipped} already existed`
        );
      } else {
        toast.success(
          res.message || `Generated ${res.data?.generated ?? 0} payroll record(s)`
        );
      }
      onOpenChange(false);
      onGenerated();
    } catch (e: any) {
      toast.error(e?.message || "Generate failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Payroll</DialogTitle>
          <DialogDescription>
            {scopeLabel
              ? `Generate a draft payroll for ${scopeLabel}.`
              : "Generate a draft payroll for all active employees."}{" "}
            Drafts are only paid out once approved.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="periodStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period Start</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="periodEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period End</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="allowances"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allowances (AFN)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bonuses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bonuses (AFN)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deductions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deductions (AFN)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="workDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Work Days (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      placeholder="Auto-calculate from hire date"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === "" ? undefined : parseInt(val, 10));
                      }}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Leave empty to auto-calculate from employee hire date. Salary will be pro-rated.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="walletId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pay from Wallet</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Cash / no wallet" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {wallets.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          No wallets configured
                        </SelectItem>
                      ) : (
                        wallets.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} — {formatMinor(w.balance, w.currency)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="deductExpenses">Deduct Employee Expenses</Label>
                <p className="text-xs text-muted-foreground">
                  Include employee-paid company expenses in the debt calculation
                </p>
              </div>
              <Switch
                id="deductExpenses"
                checked={form.watch("deductExpenses")}
                onCheckedChange={(checked) => form.setValue("deductExpenses", checked)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={saving}
              >
                {saving ? "Generating..." : "Generate Draft"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
