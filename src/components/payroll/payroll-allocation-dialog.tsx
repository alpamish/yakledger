"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { payrollApi, type ProjectAllocation } from "@/services/payroll-api";
import { formatMinor } from "@/lib/money";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

interface EditRow {
  key: number;
  project: string;
  mode: "PERCENT" | "AMOUNT";
  value: string;
}

let rowSeq = 0;
const newKey = () => ++rowSeq;
const emptyRow = (): EditRow => ({
  key: newKey(),
  project: "",
  mode: "PERCENT",
  value: "",
});

export function PayrollAllocationDialog({
  open,
  onOpenChange,
  payrollId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payrollId: string;
  onSaved?: () => void;
}) {
  const [rows, setRows] = useState<EditRow[]>([emptyRow()]);
  const [saved, setSaved] = useState<ProjectAllocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    payrollApi
      .getAllocations(payrollId)
      .then((res) => {
        if (!active) return;
        const list = res.data ?? [];
        setSaved(list);
        setRows(
          list.length > 0
            ? list.map((a) => ({
                key: newKey(),
                project: a.project,
                mode: a.mode === "AMOUNT" ? "AMOUNT" : "PERCENT",
                value: String(a.enteredValue),
              }))
            : [emptyRow()]
        );
      })
      .catch(() => {
        if (active) setRows([emptyRow()]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, payrollId]);

  function updateRow(key: number, patch: Partial<EditRow>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  }

  async function handleSave() {
    const payload = rows
      .map((r) => ({
        project: r.project.trim(),
        mode: r.mode,
        value: parseFloat(r.value),
      }))
      .filter((r) => r.project && Number.isFinite(r.value) && r.value > 0);

    if (payload.length === 0) {
      if (saved.length === 0) {
        toast.error("Add at least one project allocation");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await payrollApi.setAllocations(payrollId, payload);
      const list = res.data ?? [];
      setSaved(list);
      setRows(
        list.length > 0
          ? list.map((a) => ({
              key: newKey(),
              project: a.project,
              mode: a.mode === "AMOUNT" ? "AMOUNT" : "PERCENT",
              value: String(a.enteredValue),
            }))
          : [emptyRow()]
      );
      toast.success(
        list.length > 0
          ? "Project allocation saved and normalized to 100%"
          : "Project allocation cleared"
      );
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save allocation");
    } finally {
      setSaving(false);
    }
  }

  const totalPercent = saved.reduce((s, a) => s + a.percentage, 0);
  const totalAmount = saved.reduce((s, a) => s + a.amountMinor, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Project Salary Allocation</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Split this payroll&apos;s gross pay across projects using percentages
          or fixed AFN amounts. Whatever is entered, the system normalizes the
          result to exactly 100%.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_120px_110px_36px] gap-2 text-xs font-medium text-muted-foreground">
            <span>Project</span>
            <span>Mode</span>
            <span>Value</span>
            <span />
          </div>
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_120px_110px_36px] gap-2">
              <Input
                placeholder="Project name"
                value={r.project}
                onChange={(e) => updateRow(r.key, { project: e.target.value })}
                disabled={loading || saving}
              />
              <Select
                value={r.mode}
                onValueChange={(v) =>
                  updateRow(r.key, { mode: v as EditRow["mode"] })
                }
                disabled={loading || saving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">%</SelectItem>
                  <SelectItem value="AMOUNT">AFN</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="0"
                step={r.mode === "PERCENT" ? "0.01" : "1"}
                value={r.value}
                onChange={(e) => updateRow(r.key, { value: e.target.value })}
                disabled={loading || saving}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={rows.length <= 1 || saving}
                onClick={() =>
                  setRows((prev) => prev.filter((x) => x.key !== r.key))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={saving}
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Project
          </Button>
        </div>

        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-muted-foreground">Current allocation</Label>
            {saved.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {totalPercent.toFixed(2)}% · {formatMinor(totalAmount)}
              </span>
            )}
          </div>
          {saved.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects assigned yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {saved.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{a.project}</span>
                  <span className="text-muted-foreground">
                    {a.percentage.toFixed(2)}% · {formatMinor(a.amountMinor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Allocation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
