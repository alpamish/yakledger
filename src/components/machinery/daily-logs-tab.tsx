"use client";

// Daily logs tab (Phase 3): one operating record per machine per day.
// Meter jumps above the machine's threshold arrive flagged for review;
// correcting the readings recomputes the flag server-side.
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { machineryOpsApi } from "@/services/machinery-ops-api";
import type { Machinery, MachineryDailyLog } from "@/types/contractor";
import { AlertTriangle, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const num = (v: string) => (v === "" ? 0 : Number(v));

interface LogForm {
  id?: string;
  date: string;
  openingMeter: string;
  closingMeter: string;
  normalHours: string;
  overtimeHours: string;
  idleHours: string;
  breakdownHours: string;
  weather: string;
  delayReason: string;
  operator: string;
}

const emptyForm = (): LogForm => ({
  date: new Date().toISOString().slice(0, 10),
  openingMeter: "",
  closingMeter: "",
  normalHours: "0",
  overtimeHours: "0",
  idleHours: "0",
  breakdownHours: "0",
  weather: "",
  delayReason: "",
  operator: "",
});

interface Props {
  machinery: Machinery;
  canCreate: boolean;
  canEdit: boolean;
}

export function DailyLogsTab({ machinery, canCreate, canEdit }: Props) {
  const [logs, setLogs] = useState<MachineryDailyLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<LogForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MachineryDailyLog | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await machineryOpsApi.listDailyLogs(machinery.id, {
        page: String(page),
        pageSize: "50",
        ...(flaggedOnly ? { flagged: "true" } : {}),
      });
      setLogs(res.data);
      setTotal(res.total);
    } catch {
      toast.error("Failed to load daily logs");
    } finally {
      setLoading(false);
    }
  }, [machinery.id, page, flaggedOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (log: MachineryDailyLog) => {
    setForm({
      id: log.id,
      date: new Date(log.date).toISOString().slice(0, 10),
      openingMeter: String(log.openingMeter),
      closingMeter: String(log.closingMeter),
      normalHours: String(log.normalHours),
      overtimeHours: String(log.overtimeHours),
      idleHours: String(log.idleHours),
      breakdownHours: String(log.breakdownHours),
      weather: log.weather ?? "",
      delayReason: log.delayReason ?? "",
      operator: log.operator ?? "",
    });
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.date) {
      toast.error("Date is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        date: form.date,
        openingMeter: num(form.openingMeter),
        closingMeter: num(form.closingMeter),
        normalHours: num(form.normalHours),
        overtimeHours: num(form.overtimeHours),
        idleHours: num(form.idleHours),
        breakdownHours: num(form.breakdownHours),
        weather: form.weather || null,
        delayReason: form.delayReason || null,
        operator: form.operator || null,
      };
      if (form.id) {
        await machineryOpsApi.updateDailyLog(machinery.id, form.id, payload);
        toast.success("Daily log updated");
      } else {
        const created = await machineryOpsApi.createDailyLog(machinery.id, payload);
        toast.success(
          created.flagged
            ? "Daily log saved — flagged for review"
            : "Daily log saved"
        );
      }
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save daily log");
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await machineryOpsApi.deleteDailyLog(machinery.id, deleteTarget.id);
      setDeleteTarget(null);
      toast.success("Daily log deleted");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete daily log");
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <NotebookPen className="size-4" />
          Daily Operating Logs
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={flaggedOnly ? "default" : "outline"}
            onClick={() => {
              setFlaggedOnly((v) => !v);
              setPage(1);
            }}
          >
            <AlertTriangle className="size-4 mr-1.5" />
            Flagged{flaggedOnly ? ` (${total})` : ""}
          </Button>
          {canCreate && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4 mr-1.5" />
              New Log
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <LoadingSpinner />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {flaggedOnly ? "No flagged logs." : "No logs recorded yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{formatDate(log.date)}</span>
                    {log.flagged && (
                      <Badge className="bg-amber-500 text-white border-0">
                        Review: {log.flagReason ?? "flagged"}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Meter {log.openingMeter.toLocaleString()} →{" "}
                      {log.closingMeter.toLocaleString()} (+
                      {(log.closingMeter - log.openingMeter).toLocaleString()})
                    </span>
                  </div>
                  {(canEdit || canCreate) && (
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(log)}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(log)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Normal: {log.normalHours}h</span>
                  <span>Overtime: {log.overtimeHours}h</span>
                  <span>Idle: {log.idleHours}h</span>
                  <span>Breakdown: {log.breakdownHours}h</span>
                  {log.operator && <span>Operator: {log.operator}</span>}
                  {log.weather && <span>Weather: {log.weather}</span>}
                  <span className="col-span-2">Logged by {log.loggedBy}</span>
                  {log.delayReason && (
                    <span className="col-span-2">Delay: {log.delayReason}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>

      {/* Create/edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit daily log" : "New daily log"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Opening Meter</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.openingMeter}
                  onChange={(e) => setForm((f) => ({ ...f, openingMeter: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Closing Meter</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.closingMeter}
                  onChange={(e) => setForm((f) => ({ ...f, closingMeter: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {(
                [
                  ["normalHours", "Normal"],
                  ["overtimeHours", "Overtime"],
                  ["idleHours", "Idle"],
                  ["breakdownHours", "Breakdown"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label>{label} (h)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Operator</Label>
                <Input
                  value={form.operator}
                  onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Weather</Label>
                <Input
                  value={form.weather}
                  onChange={(e) => setForm((f) => ({ ...f, weather: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Delay Reason</Label>
              <Textarea
                rows={2}
                value={form.delayReason}
                onChange={(e) => setForm((f) => ({ ...f, delayReason: e.target.value }))}
              />
            </div>
            {machinery.meterJumpThreshold != null && machinery.meterJumpThreshold > 0 && (
              <p className="text-xs text-muted-foreground">
                Jumps above {machinery.meterJumpThreshold} will be flagged for review.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete daily log?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The log for {deleteTarget ? formatDate(deleteTarget.date) : ""} will be removed. This
            affects fuel-variance coverage for that day.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
