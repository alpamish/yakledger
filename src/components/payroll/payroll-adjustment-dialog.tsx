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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { payrollApi } from "@/services/payroll-api";
import { employeesApi } from "@/services/api";
import type { EmployeeListItem } from "@/types/expense";
import {
  PAYROLL_ADJUSTMENT_DIRECTIONS,
  PAYROLL_ADJUSTMENT_DIRECTION_LABELS,
  PAYROLL_ADJUSTMENT_KINDS,
  PAYROLL_ADJUSTMENT_KIND_LABELS,
} from "@/lib/payroll-status";
import { toast } from "sonner";

// `amount` is AFN — the API converts to minor units (PDF §1 "Payroll
// Adjustments"). A reason is always required; the direction only applies to
// kind OTHER, the PREVIOUS_* kinds imply their sign.
const adjustmentFormSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  kind: z.enum(PAYROLL_ADJUSTMENT_KINDS),
  direction: z.enum(PAYROLL_ADJUSTMENT_DIRECTIONS),
  amount: z.number().positive("Amount must be greater than zero"),
  reason: z.string().trim().min(1, "A reason is required"),
  note: z.string().optional(),
});

type AdjustmentFormValues = z.infer<typeof adjustmentFormSchema>;

export function PayrollAdjustmentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [saving, setSaving] = useState(false);

  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentFormSchema) as Resolver<AdjustmentFormValues>,
    defaultValues: {
      employeeId: "",
      kind: "OTHER",
      direction: "DEDUCTION",
      amount: 0,
      reason: "",
      note: "",
    },
  });

  const kind = form.watch("kind");

  useEffect(() => {
    if (!open) return;
    form.reset({
      employeeId: "",
      kind: "OTHER",
      direction: "DEDUCTION",
      amount: 0,
      reason: "",
      note: "",
    });
    employeesApi
      .list()
      .then((res) => {
        if (res.success) setEmployees(res.data ?? []);
      })
      .catch(() => {
        // handled by the submit path
      });
  }, [open, form]);

  async function onSubmit(values: AdjustmentFormValues) {
    setSaving(true);
    try {
      await payrollApi.createAdjustment({
        employeeId: values.employeeId,
        kind: values.kind,
        direction: values.kind === "OTHER" ? values.direction : undefined,
        amount: values.amount,
        reason: values.reason,
        ...(values.note ? { note: values.note } : {}),
      });
      toast.success("Adjustment created — open payrolls updated");
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create adjustment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Payroll Adjustment</DialogTitle>
          <DialogDescription>
            Applies additively to gross pay on the next approval: a deduction
            lowers this period&apos;s pay, an earning raises it. A reason is
            required.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="employeeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYROLL_ADJUSTMENT_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {PAYROLL_ADJUSTMENT_KIND_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {kind === "OTHER" && (
              <FormField
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Direction</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYROLL_ADJUSTMENT_DIRECTIONS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {PAYROLL_ADJUSTMENT_DIRECTION_LABELS[d]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (AFN)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseFloat(e.target.value) || 0)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Why this adjustment is needed"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Internal note" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? "Saving…" : "Create Adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
