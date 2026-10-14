"use client";

// Downtime tab (Phase 3): breakdowns/stoppages per machine with the
// chargeable flag (defaults from the active contract's responsibility).
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { machineryOpsApi } from "@/services/machinery-ops-api";
import type { DowntimeRecord, Machinery } from "@/types/contractor";
import { AlertOctagon, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInput(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface DowntimeForm {
  id?: string;
  start: string;
  end: string;
  reason: string;
  chargeable: string; // "AUTO" | "YES" | "NO"
  notes: string;
}

const emptyForm = (): DowntimeForm => ({
  start: toLocalInput(new Date().toISOString()),
  end: "",
  reason: "",
  chargeable: "AUTO",
  notes: "",
});

interface Props {
  machinery: Machinery;
  canCreate: boolean;
  canEdit: boolean;
}

export function DowntimeTab({ machinery, canCreate, canEdit }: Props) {
  const [records, setRecords] = useState<DowntimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<DowntimeForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DowntimeRecord | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await machineryOpsApi.listDowntime(machinery.id, { pageSize: "100" });
      setRecords(res.data);
    } catch {
      toast.error("Failed to load downtime records");
    } finally {
      setLoading(false);
    }
  }, [machinery.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (rec: DowntimeRecord) => {
    setForm({
      id: rec.id,
      start: toLocalInput(rec.start),
      end: toLocalInput(rec.end),
      reason: rec.reason,
      chargeable: rec.chargeable ? "YES" : "NO",
      notes: rec.notes ?? "",
    });
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.start || !form.reason.trim()) {
      toast.error("Start time and reason are required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        start: new Date(form.start).toISOString(),
        end: form.end ? new Date(form.end).toISOString() : null,
        reason: form.reason.trim(),
        notes: form.notes || null,
        ...(form.chargeable !== "AUTO" ? { chargeable: form.chargeable === "YES" } : {}),
      };
      if (form.id) {
        await machineryOpsApi.updateDowntime(machinery.id, form.id, payload);
        toast.success("Downtime updated");
      } else {
        await machineryOpsApi.createDowntime(machinery.id, payload);
        toast.success("Downtime recorded");
      }
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save downtime");
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await machineryOpsApi.deleteDowntime(machinery.id, deleteTarget.id);
      setDeleteTarget(null);
      toast.success("Downtime record deleted");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete record");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertOctagon className="size-4" />
          Downtime
        </CardTitle>
        {canCreate && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            Record Downtime
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <LoadingSpinner />
          </div>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No downtime recorded.</p>
        ) : (
          <div className="space-y-2">
            {records.map((rec) => (
              <div
                key={rec.id}
                className="rounded-md border p-3 flex flex-wrap items-start justify-between gap-2"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{rec.reason}</span>
                    <Badge variant={rec.chargeable ? "destructive" : "secondary"}>
                      {rec.chargeable ? "Chargeable" : "Non-chargeable"}
                    </Badge>
                    {rec.durationHours != null && (
                      <span className="text-xs text-muted-foreground">
                        {rec.durationHours}h
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(rec.start)} → {rec.end ? formatDateTime(rec.end) : "ongoing"}
                    {rec.notes ? ` — ${rec.notes}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Logged by {rec.loggedBy}</p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(rec)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(rec)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create/edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit downtime" : "Record downtime"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input
                  type="datetime-local"
                  value={form.start}
                  onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>End (empty = ongoing)</Label>
                <Input
                  type="datetime-local"
                  value={form.end}
                  onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                placeholder="e.g. hydraulic failure, tire change"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Chargeable</Label>
              <Select
                value={form.chargeable}
                onValueChange={(v) => setForm((f) => ({ ...f, chargeable: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Auto (contract responsibility)</SelectItem>
                  <SelectItem value="YES">Chargeable</SelectItem>
                  <SelectItem value="NO">Non-chargeable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
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
            <DialogTitle>Delete downtime record?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            “{deleteTarget?.reason}” will be removed permanently.
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
