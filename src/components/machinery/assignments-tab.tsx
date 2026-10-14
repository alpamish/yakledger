"use client";

// Assignments tab (Phase 3): transfer history for a machine, with a
// transfer dialog and the ability to close the active assignment.
// Machinery.assignedContractorId follows the active assignment server-side.
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
import { contractorsApi } from "@/services/contractor-api";
import { contractsApi } from "@/services/contract-api";
import type { Contractor, Machinery, MachineryAssignment } from "@/types/contractor";
import type { ContractorContract } from "@/types/contract";
import { ArrowRightLeft, Calendar, Plus } from "lucide-react";
import { toast } from "sonner";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

interface Props {
  machinery: Machinery;
  canEdit: boolean;
  /** Called after a transfer/close so the parent can refresh the machine. */
  onChanged?: () => void;
}

export function AssignmentsTab({ machinery, canEdit, onChanged }: Props) {
  const [assignments, setAssignments] = useState<MachineryAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Transfer dialog
  const [transferOpen, setTransferOpen] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [contracts, setContracts] = useState<ContractorContract[]>([]);
  const [tContractor, setTContractor] = useState("");
  const [tContract, setTContract] = useState("NONE");
  const [tStart, setTStart] = useState("");
  const [tProject, setTProject] = useState("");
  const [tTransferredBy, setTTransferredBy] = useState("");
  const [tNotes, setTNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Close dialog
  const [closeTarget, setCloseTarget] = useState<MachineryAssignment | null>(null);
  const [closeDate, setCloseDate] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await machineryOpsApi.listAssignments(machinery.id);
      setAssignments(rows);
    } catch {
      toast.error("Failed to load assignments");
    } finally {
      setLoading(false);
    }
  }, [machinery.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openTransfer = async () => {
    setTContractor(machinery.assignedContractorId ?? "");
    setTContract("NONE");
    setTStart(new Date().toISOString().slice(0, 10));
    setTProject("");
    setTTransferredBy("");
    setTNotes("");
    setTransferOpen(true);
    try {
      const [cRes] = await Promise.all([contractorsApi.getList()]);
      setContractors((cRes.data ?? []) as Contractor[]);
    } catch {
      /* options stay empty; user can retry */
    }
  };

  useEffect(() => {
    if (!transferOpen || !tContractor) {
      setContracts([]);
      return;
    }
    contractsApi
      .list({ contractorId: tContractor, status: "ACTIVE" })
      .then((res) => setContracts(res.data ?? []))
      .catch(() => setContracts([]));
  }, [transferOpen, tContractor]);

  const submitTransfer = async () => {
    if (!tContractor || !tStart) {
      toast.error("Contractor and start date are required");
      return;
    }
    setBusy(true);
    try {
      const res = await machineryOpsApi.transfer(machinery.id, {
        contractorId: tContractor,
        startDate: tStart,
        contractId: tContract === "NONE" ? null : tContract,
        projectName: tProject || null,
        transferredBy: tTransferredBy || null,
        notes: tNotes || null,
      });
      setAssignments(res.assignments);
      setTransferOpen(false);
      toast.success("Machine transferred");
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  };

  const submitClose = async () => {
    if (!closeTarget || !closeDate) {
      toast.error("End date is required");
      return;
    }
    setBusy(true);
    try {
      await machineryOpsApi.updateAssignment(machinery.id, closeTarget.id, {
        endDate: closeDate,
      });
      setCloseTarget(null);
      toast.success("Assignment closed");
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to close assignment");
    } finally {
      setBusy(false);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowRightLeft className="size-4" />
          Transfer History
        </CardTitle>
        {canEdit && (
          <Button size="sm" onClick={openTransfer}>
            <Plus className="size-4 mr-1.5" />
            Transfer
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <LoadingSpinner />
          </div>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No assignments recorded yet.
          </p>
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => {
              const isActive =
                new Date(a.startDate) <= today && (!a.endDate || new Date(a.endDate) >= today);
              return (
                <div
                  key={a.id}
                  className="rounded-md border p-3 flex flex-wrap items-start justify-between gap-2"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {a.contractor?.contractorName ?? a.contractorId}
                      </span>
                      <Badge variant={isActive ? "default" : "secondary"}>
                        {isActive ? "Active" : "Ended"}
                      </Badge>
                      {a.contract && (
                        <Badge variant="outline">{a.contract.contractNumber}</Badge>
                      )}
                      {a.projectName && (
                        <span className="text-xs text-muted-foreground">· {a.projectName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="size-3" />
                      {formatDate(a.startDate)} → {a.endDate ? formatDate(a.endDate) : "present"}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Handed over by {a.transferredBy}
                      {a.notes ? ` — ${a.notes}` : ""}
                    </p>
                  </div>
                  {canEdit && isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCloseTarget(a);
                        setCloseDate(new Date().toISOString().slice(0, 10));
                      }}
                    >
                      Close
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Transfer dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Transfer machine</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Contractor</Label>
              <Select value={tContractor} onValueChange={setTContractor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select contractor" />
                </SelectTrigger>
                <SelectContent>
                  {contractors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contractorName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contract (optional)</Label>
              <Select value={tContract} onValueChange={setTContract}>
                <SelectTrigger>
                  <SelectValue placeholder="No contract" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No contract</SelectItem>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contractNumber} — {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={tStart} onChange={(e) => setTStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Handed Over By</Label>
                <Input
                  placeholder="Person handing over"
                  value={tTransferredBy}
                  onChange={(e) => setTTransferredBy(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <Input
                placeholder="Project free-text reference"
                value={tProject}
                onChange={(e) => setTProject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={tNotes}
                onChange={(e) => setTNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitTransfer} disabled={busy}>
              {busy ? "Transferring…" : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close dialog */}
      <Dialog open={!!closeTarget} onOpenChange={(open) => !open && setCloseTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Close assignment</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              The machine stays with{" "}
              {closeTarget?.contractor?.contractorName ?? "this contractor"} as the last-known
              assignment until transferred again.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitClose} disabled={busy}>
              {busy ? "Closing…" : "Close Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
