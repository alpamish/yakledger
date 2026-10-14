"use client";

// Compliance tab (Phase 5): contractor lifecycle actions (suspend / blacklist /
// reactivate with required reasons), compliance status banner, contact persons,
// bank accounts (with verification), compliance documents (with expiry
// tracking), and payment authorizations (receiver + limit + validity window).
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
import {
  contractorComplianceApi,
  type AuthorizationFormData,
  type BankAccountFormData,
  type ContactFormData,
  type DocumentFormData,
  type LifecycleAction,
} from "@/services/contractor-compliance-api";
import {
  CONTRACTOR_DOCUMENT_TYPES,
  CONTRACTOR_DOCUMENT_TYPE_LABELS,
  PAYMENT_BLOCKING_DOC_TYPES,
  CONTRACTOR_STATUS_LABELS,
  CONTRACTOR_STATUS_COLORS,
  type ContractorBankAccount,
  type ContractorComplianceStatus,
  type ContractorContact,
  type ContractorDocument,
  type ContractorDocumentType,
  type ContractorStatus,
  type PaymentAuthorization,
} from "@/types/contractor";
import { format, isPast } from "date-fns";
import { toast } from "sonner";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

interface Props {
  contractorId: string;
  status: ContractorStatus;
  suspendedReason?: string | null;
  blacklistedReason?: string | null;
  canEdit: boolean;
  canAuthorize: boolean;
  canSuspend: boolean;
  /** Called after a lifecycle change so the profile can reload. */
  onLifecycleChanged: () => void;
}

const LIFECYCLE_LABEL: Record<LifecycleAction, string> = {
  suspend: "Suspend",
  blacklist: "Blacklist",
  reactivate: "Reactivate",
};

const DATE_FMT = "yyyy-MM-dd";
const toDateInput = (d?: string | null) => (d ? format(new Date(d), DATE_FMT) : "");

export function ContractorComplianceTab({
  contractorId,
  status,
  suspendedReason,
  blacklistedReason,
  canEdit,
  canAuthorize,
  canSuspend,
  onLifecycleChanged,
}: Props) {
  const [compliance, setCompliance] = useState<ContractorComplianceStatus | null>(null);
  const [contacts, setContacts] = useState<ContractorContact[]>([]);
  const [bankAccounts, setBankAccounts] = useState<ContractorBankAccount[]>([]);
  const [documents, setDocuments] = useState<ContractorDocument[]>([]);
  const [authorizations, setAuthorizations] = useState<PaymentAuthorization[]>([]);
  const [loading, setLoading] = useState(true);

  // Lifecycle dialog
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  // Contact dialog (create/edit)
  const [contactTarget, setContactTarget] = useState<ContractorContact | "new" | null>(null);
  const [contactForm, setContactForm] = useState<ContactFormData>({
    name: "",
    phone: "",
    role: "",
    email: "",
    isPrimary: false,
    notes: "",
  });
  const [contactBusy, setContactBusy] = useState(false);

  // Bank account dialog (create/edit)
  const [accountTarget, setAccountTarget] = useState<ContractorBankAccount | "new" | null>(null);
  const [accountForm, setAccountForm] = useState<BankAccountFormData>({
    accountName: "",
    accountNumber: "",
    bankName: "",
    branch: "",
    isDefault: false,
    notes: "",
  });
  const [accountBusy, setAccountBusy] = useState(false);

  // Document dialog (create/edit)
  const [docTarget, setDocTarget] = useState<ContractorDocument | "new" | null>(null);
  const [docForm, setDocForm] = useState<DocumentFormData>({
    docType: "NATIONAL_ID",
    title: "",
    documentNumber: "",
    issueDate: "",
    expiryDate: "",
    fileUrl: "",
    notes: "",
  });
  const [docBusy, setDocBusy] = useState(false);

  // Authorization dialog (create)
  const [authOpen, setAuthOpen] = useState(false);
  const [authForm, setAuthForm] = useState<AuthorizationFormData>({
    contractorId,
    receiverName: "",
    validFrom: format(new Date(), DATE_FMT),
    validTo: "",
    maxAmount: null,
    notes: "",
  });
  const [authBusy, setAuthBusy] = useState(false);

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<PaymentAuthorization | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeBusy, setRevokeBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [comp, cons, accts, docs, auths] = await Promise.all([
        contractorComplianceApi.getCompliance(contractorId),
        contractorComplianceApi.listContacts(contractorId),
        contractorComplianceApi.listBankAccounts(contractorId),
        contractorComplianceApi.listDocuments(contractorId),
        contractorComplianceApi.listAuthorizations({ contractorId, pageSize: "100" }),
      ]);
      setCompliance(comp);
      setContacts(cons);
      setBankAccounts(accts);
      setDocuments(docs);
      setAuthorizations(auths.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  }, [contractorId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Lifecycle ───────────────────────────────────────────────────────────

  const canSuspendNow = status === "ACTIVE" || status === "INACTIVE";
  const canBlacklistNow = status === "ACTIVE" || status === "INACTIVE" || status === "SUSPENDED";
  const canReactivateNow = status === "SUSPENDED" || status === "BLACKLISTED";

  const submitLifecycle = async () => {
    if (!lifecycleAction) return;
    const needsReason = lifecycleAction !== "reactivate";
    if (needsReason && !lifecycleReason.trim()) {
      toast.error("A reason is required");
      return;
    }
    try {
      setLifecycleBusy(true);
      await contractorComplianceApi.lifecycle(contractorId, {
        action: lifecycleAction,
        reason: lifecycleReason.trim() || null,
      });
      toast.success(`${LIFECYCLE_LABEL[lifecycleAction]}d contractor`);
      setLifecycleAction(null);
      setLifecycleReason("");
      load();
      onLifecycleChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lifecycle action failed");
    } finally {
      setLifecycleBusy(false);
    }
  };

  // ── Contacts ────────────────────────────────────────────────────────────

  const openContact = (target: ContractorContact | "new") => {
    setContactTarget(target);
    setContactForm(
      target === "new"
        ? { name: "", phone: "", role: "", email: "", isPrimary: false, notes: "" }
        : {
            name: target.name,
            phone: target.phone,
            role: target.role ?? "",
            email: target.email ?? "",
            isPrimary: target.isPrimary,
            notes: target.notes ?? "",
          }
    );
  };

  const submitContact = async () => {
    if (!contactTarget) return;
    if (!contactForm.name.trim() || !contactForm.phone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    try {
      setContactBusy(true);
      const body = {
        ...contactForm,
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim(),
        role: contactForm.role?.trim() || null,
        email: contactForm.email?.trim() || null,
        notes: contactForm.notes?.trim() || null,
      };
      if (contactTarget === "new") {
        await contractorComplianceApi.createContact(contractorId, body);
        toast.success("Contact added");
      } else {
        await contractorComplianceApi.updateContact(contractorId, contactTarget.id, body);
        toast.success("Contact updated");
      }
      setContactTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Saving contact failed");
    } finally {
      setContactBusy(false);
    }
  };

  const deleteContact = async (contact: ContractorContact) => {
    try {
      await contractorComplianceApi.deleteContact(contractorId, contact.id);
      toast.success("Contact removed");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Removing contact failed");
    }
  };

  // ── Bank accounts ───────────────────────────────────────────────────────

  const openAccount = (target: ContractorBankAccount | "new") => {
    setAccountTarget(target);
    setAccountForm(
      target === "new"
        ? { accountName: "", accountNumber: "", bankName: "", branch: "", isDefault: false, notes: "" }
        : {
            accountName: target.accountName,
            accountNumber: target.accountNumber,
            bankName: target.bankName,
            branch: target.branch ?? "",
            isDefault: target.isDefault,
            notes: target.notes ?? "",
          }
    );
  };

  const submitAccount = async () => {
    if (!accountTarget) return;
    if (
      !accountForm.accountName.trim() ||
      !accountForm.accountNumber.trim() ||
      !accountForm.bankName.trim()
    ) {
      toast.error("Account name, number, and bank are required");
      return;
    }
    try {
      setAccountBusy(true);
      const body = {
        ...accountForm,
        accountName: accountForm.accountName.trim(),
        accountNumber: accountForm.accountNumber.trim(),
        bankName: accountForm.bankName.trim(),
        branch: accountForm.branch?.trim() || null,
        notes: accountForm.notes?.trim() || null,
      };
      if (accountTarget === "new") {
        await contractorComplianceApi.createBankAccount(contractorId, body);
        toast.success("Bank account added");
      } else {
        await contractorComplianceApi.updateBankAccount(contractorId, accountTarget.id, body);
        toast.success("Bank account updated");
      }
      setAccountTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Saving bank account failed");
    } finally {
      setAccountBusy(false);
    }
  };

  const deleteAccount = async (account: ContractorBankAccount) => {
    try {
      await contractorComplianceApi.deleteBankAccount(contractorId, account.id);
      toast.success("Bank account removed");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Removing bank account failed");
    }
  };

  const toggleVerify = async (account: ContractorBankAccount) => {
    try {
      await contractorComplianceApi.verifyBankAccount(
        contractorId,
        account.id,
        !account.isVerified
      );
      toast.success(
        account.isVerified ? "Bank account unverified" : "Bank account verified"
      );
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    }
  };

  // ── Documents ───────────────────────────────────────────────────────────

  const openDoc = (target: ContractorDocument | "new") => {
    setDocTarget(target);
    setDocForm(
      target === "new"
        ? {
            docType: "NATIONAL_ID",
            title: "",
            documentNumber: "",
            issueDate: "",
            expiryDate: "",
            fileUrl: "",
            notes: "",
          }
        : {
            docType: target.docType,
            title: target.title,
            documentNumber: target.documentNumber ?? "",
            issueDate: toDateInput(target.issueDate),
            expiryDate: toDateInput(target.expiryDate),
            fileUrl: target.fileUrl ?? "",
            notes: target.notes ?? "",
          }
    );
  };

  const submitDoc = async () => {
    if (!docTarget) return;
    if (!docForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    try {
      setDocBusy(true);
      const body = {
        ...docForm,
        title: docForm.title.trim(),
        documentNumber: docForm.documentNumber?.trim() || null,
        issueDate: docForm.issueDate || null,
        expiryDate: docForm.expiryDate || null,
        fileUrl: docForm.fileUrl?.trim() || null,
        notes: docForm.notes?.trim() || null,
      };
      if (docTarget === "new") {
        await contractorComplianceApi.createDocument(contractorId, body);
        toast.success("Document added");
      } else {
        await contractorComplianceApi.updateDocument(contractorId, docTarget.id, body);
        toast.success("Document updated");
      }
      setDocTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Saving document failed");
    } finally {
      setDocBusy(false);
    }
  };

  const deleteDoc = async (doc: ContractorDocument) => {
    try {
      await contractorComplianceApi.deleteDocument(contractorId, doc.id);
      toast.success("Document removed");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Removing document failed");
    }
  };

  // ── Authorizations ──────────────────────────────────────────────────────

  const submitAuth = async () => {
    if (!authForm.receiverName.trim()) {
      toast.error("Receiver name is required");
      return;
    }
    if (!authForm.validFrom) {
      toast.error("Valid-from date is required");
      return;
    }
    try {
      setAuthBusy(true);
      const auth = await contractorComplianceApi.createAuthorization({
        ...authForm,
        contractorId,
        receiverName: authForm.receiverName.trim(),
        validTo: authForm.validTo || null,
        maxAmount:
          authForm.maxAmount != null && !isNaN(authForm.maxAmount) ? authForm.maxAmount : null,
        notes: authForm.notes?.trim() || null,
      });
      toast.success(`Authorization ${auth.authorizationNumber} created`);
      setAuthOpen(false);
      setAuthForm({
        contractorId,
        receiverName: "",
        validFrom: format(new Date(), DATE_FMT),
        validTo: "",
        maxAmount: null,
        notes: "",
      });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Creating authorization failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const revokeAuth = async () => {
    if (!revokeTarget) return;
    try {
      setRevokeBusy(true);
      await contractorComplianceApi.revokeAuthorization(
        revokeTarget.id,
        revokeReason.trim() || null
      );
      toast.success(`Authorization ${revokeTarget.authorizationNumber} revoked`);
      setRevokeTarget(null);
      setRevokeReason("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoking authorization failed");
    } finally {
      setRevokeBusy(false);
    }
  };

  const isAuthLive = (a: PaymentAuthorization) => {
    if (a.revokedAt) return false;
    const now = new Date();
    if (new Date(a.validFrom) > now) return false;
    return !a.validTo || new Date(a.validTo) >= now;
  };

  const docExpired = (d: ContractorDocument) =>
    d.expiryDate ? isPast(new Date(d.expiryDate)) : false;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* ── Lifecycle & status banner ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              Lifecycle &amp; Compliance Status
              <Badge
                variant="outline"
                style={{
                  color: CONTRACTOR_STATUS_COLORS[status],
                  borderColor: CONTRACTOR_STATUS_COLORS[status],
                }}
              >
                {CONTRACTOR_STATUS_LABELS[status]}
              </Badge>
            </span>
            {canSuspend && (
              <span className="flex gap-2">
                {canReactivateNow && (
                  <Button size="sm" variant="outline" onClick={() => setLifecycleAction("reactivate")}>
                    Reactivate
                  </Button>
                )}
                {canSuspendNow && (
                  <Button size="sm" variant="outline" onClick={() => setLifecycleAction("suspend")}>
                    Suspend
                  </Button>
                )}
                {canBlacklistNow && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setLifecycleAction("blacklist")}
                  >
                    Blacklist
                  </Button>
                )}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {compliance?.paymentsBlocked && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <strong>Payments blocked:</strong> {compliance.blockedReason}
            </div>
          )}
          {status === "SUSPENDED" && suspendedReason && (
            <p className="text-sm text-muted-foreground">Reason: {suspendedReason}</p>
          )}
          {status === "BLACKLISTED" && blacklistedReason && (
            <p className="text-sm text-muted-foreground">Reason: {blacklistedReason}</p>
          )}
          {compliance && compliance.expiringBlockingDocs.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <strong>Expiring soon:</strong>{" "}
              {compliance.expiringBlockingDocs
                .map((d) => `${d.title} (${d.daysUntilExpiry}d)`)
                .join(", ")}
            </div>
          )}
          {compliance && compliance.unverifiedBankAccounts > 0 && (
            <p className="text-sm text-muted-foreground">
              {compliance.unverifiedBankAccounts} unverified bank account(s) — verify before
              bank-transfer payments.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Contacts ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Contact Persons
            {canEdit && (
              <Button size="sm" onClick={() => openContact("new")}>
                Add Contact
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contact persons recorded.</p>
          ) : (
            <div className="space-y-2">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{c.name}</span>
                    {c.isPrimary && (
                      <Badge variant="secondary" className="ml-2">
                        Primary
                      </Badge>
                    )}
                    {c.role && <span className="ml-2 text-muted-foreground">— {c.role}</span>}
                    <p className="text-muted-foreground">
                      {c.phone}
                      {c.email ? ` · ${c.email}` : ""}
                    </p>
                  </div>
                  {canEdit && (
                    <span className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openContact(c)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteContact(c)}>
                        Delete
                      </Button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Bank accounts ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Bank Accounts
            {canEdit && (
              <Button size="sm" onClick={() => openAccount("new")}>
                Add Account
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bankAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bank accounts recorded.</p>
          ) : (
            <div className="space-y-2">
              {bankAccounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{a.accountName}</span>
                    {a.isDefault && (
                      <Badge variant="secondary" className="ml-2">
                        Default
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="ml-2"
                      style={{
                        color: a.isVerified ? "#10b981" : "#f59e0b",
                        borderColor: a.isVerified ? "#10b981" : "#f59e0b",
                      }}
                    >
                      {a.isVerified ? "Verified" : "Unverified"}
                    </Badge>
                    <p className="text-muted-foreground">
                      {a.bankName}
                      {a.branch ? ` · ${a.branch}` : ""} · {a.accountNumber}
                    </p>
                  </div>
                  <span className="flex gap-2">
                    {canAuthorize && (
                      <Button size="sm" variant="ghost" onClick={() => toggleVerify(a)}>
                        {a.isVerified ? "Unverify" : "Verify"}
                      </Button>
                    )}
                    {canEdit && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => openAccount(a)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteAccount(a)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Documents ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Compliance Documents
            {canEdit && (
              <Button size="sm" onClick={() => openDoc("new")}>
                Add Document
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents recorded — payments are not blocked by document expiry.
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((d) => {
                const expired = docExpired(d);
                const blocking = PAYMENT_BLOCKING_DOC_TYPES.includes(
                  d.docType as ContractorDocumentType
                );
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-md border p-3 text-sm"
                  >
                    <div>
                      <span className="font-medium">{d.title}</span>
                      <Badge variant="outline" className="ml-2">
                        {CONTRACTOR_DOCUMENT_TYPE_LABELS[d.docType] ?? d.docType}
                      </Badge>
                      {expired && (
                        <Badge
                          variant="outline"
                          className="ml-2"
                          style={{ color: "#ef4444", borderColor: "#ef4444" }}
                        >
                          Expired{blocking ? " — blocks payments" : ""}
                        </Badge>
                      )}
                      <p className="text-muted-foreground">
                        {d.documentNumber ? `#${d.documentNumber} · ` : ""}
                        {d.issueDate ? `issued ${format(new Date(d.issueDate), DATE_FMT)}` : ""}
                        {d.expiryDate
                          ? `${d.issueDate ? " · " : ""}expires ${format(new Date(d.expiryDate), DATE_FMT)}`
                          : ""}
                      </p>
                    </div>
                    {canEdit && (
                      <span className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openDoc(d)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteDoc(d)}>
                          Delete
                        </Button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Payment authorizations ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Payment Authorizations
            {canAuthorize && (
              <Button size="sm" onClick={() => setAuthOpen(true)}>
                New Authorization
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {authorizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No authorizations — payments follow the standard flow.
            </p>
          ) : (
            <div className="space-y-2">
              {authorizations.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{a.authorizationNumber}</span>
                    <Badge
                      variant="outline"
                      className="ml-2"
                      style={{
                        color: a.revokedAt ? "#64748b" : isAuthLive(a) ? "#10b981" : "#f59e0b",
                        borderColor: a.revokedAt
                          ? "#64748b"
                          : isAuthLive(a)
                            ? "#10b981"
                            : "#f59e0b",
                      }}
                    >
                      {a.revokedAt
                        ? "Revoked"
                        : isAuthLive(a)
                          ? "Active"
                          : new Date(a.validFrom) > new Date()
                            ? "Not yet valid"
                            : "Expired"}
                    </Badge>
                    <p className="text-muted-foreground">
                      Receiver: {a.receiverName} · {fmtMoney(a.maxAmount ?? 0)}
                      {a.maxAmount == null ? " (no limit)" : " AFN limit"} ·{" "}
                      {format(new Date(a.validFrom), DATE_FMT)}
                      {a.validTo ? ` → ${format(new Date(a.validTo), DATE_FMT)}` : " → open-ended"}
                    </p>
                  </div>
                  {canAuthorize && !a.revokedAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRevokeTarget(a);
                        setRevokeReason("");
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Lifecycle dialog ──────────────────────────────────────── */}
      <Dialog
        open={lifecycleAction !== null}
        onOpenChange={(open) => !open && setLifecycleAction(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {lifecycleAction ? `${LIFECYCLE_LABEL[lifecycleAction]} Contractor` : ""}
            </DialogTitle>
          </DialogHeader>
          {lifecycleAction && lifecycleAction !== "reactivate" ? (
            <div className="space-y-2">
              <Label htmlFor="lifecycle-reason">Reason (required)</Label>
              <Textarea
                id="lifecycle-reason"
                value={lifecycleReason}
                onChange={(e) => setLifecycleReason(e.target.value)}
                placeholder="Why is this contractor being suspended/blacklisted?"
                rows={3}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Reactivating restores payments and clears suspension/blacklist records.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLifecycleAction(null)}>
              Cancel
            </Button>
            <Button onClick={submitLifecycle} disabled={lifecycleBusy}>
              {lifecycleBusy ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contact dialog ────────────────────────────────────────── */}
      <Dialog open={contactTarget !== null} onOpenChange={(open) => !open && setContactTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{contactTarget === "new" ? "Add Contact" : "Edit Contact"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Input
                value={contactForm.role ?? ""}
                onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                placeholder="e.g. Site manager"
              />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={contactForm.email ?? ""}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={contactForm.isPrimary ?? false}
                onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
              />
              Primary contact
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitContact} disabled={contactBusy}>
              {contactBusy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bank account dialog ───────────────────────────────────── */}
      <Dialog
        open={accountTarget !== null}
        onOpenChange={(open) => !open && setAccountTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {accountTarget === "new" ? "Add Bank Account" : "Edit Bank Account"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Account Name</Label>
              <Input
                value={accountForm.accountName}
                onChange={(e) => setAccountForm({ ...accountForm, accountName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Account Number</Label>
              <Input
                value={accountForm.accountNumber}
                onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Bank</Label>
              <Input
                value={accountForm.bankName}
                onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Branch</Label>
              <Input
                value={accountForm.branch ?? ""}
                onChange={(e) => setAccountForm({ ...accountForm, branch: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={accountForm.isDefault ?? false}
                onChange={(e) => setAccountForm({ ...accountForm, isDefault: e.target.checked })}
              />
              Default account
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitAccount} disabled={accountBusy}>
              {accountBusy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Document dialog ───────────────────────────────────────── */}
      <Dialog open={docTarget !== null} onOpenChange={(open) => !open && setDocTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{docTarget === "new" ? "Add Document" : "Edit Document"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={docForm.docType}
                onValueChange={(v) => setDocForm({ ...docForm, docType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACTOR_DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CONTRACTOR_DOCUMENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {PAYMENT_BLOCKING_DOC_TYPES.includes(docForm.docType as ContractorDocumentType) && (
                <p className="text-xs text-amber-600">
                  An expired {CONTRACTOR_DOCUMENT_TYPE_LABELS[docForm.docType as ContractorDocumentType]}{" "}
                  blocks payments until renewed.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={docForm.title}
                onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Document Number</Label>
              <Input
                value={docForm.documentNumber ?? ""}
                onChange={(e) => setDocForm({ ...docForm, documentNumber: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Issue Date</Label>
                <Input
                  type="date"
                  value={docForm.issueDate ?? ""}
                  onChange={(e) => setDocForm({ ...docForm, issueDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={docForm.expiryDate ?? ""}
                  onChange={(e) => setDocForm({ ...docForm, expiryDate: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitDoc} disabled={docBusy}>
              {docBusy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Authorization dialog ──────────────────────────────────── */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Payment Authorization</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Receiver Name</Label>
              <Input
                value={authForm.receiverName}
                onChange={(e) => setAuthForm({ ...authForm, receiverName: e.target.value })}
                placeholder="Person authorized to receive payments"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valid From</Label>
                <Input
                  type="date"
                  value={authForm.validFrom}
                  onChange={(e) => setAuthForm({ ...authForm, validFrom: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Valid To</Label>
                <Input
                  type="date"
                  value={authForm.validTo ?? ""}
                  onChange={(e) => setAuthForm({ ...authForm, validTo: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Max Amount (AFN, optional)</Label>
              <Input
                type="number"
                min={0}
                value={authForm.maxAmount ?? ""}
                onChange={(e) =>
                  setAuthForm({
                    ...authForm,
                    maxAmount: e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
                placeholder="No limit"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAuth} disabled={authBusy}>
              {authBusy ? "Saving..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revoke dialog ─────────────────────────────────────────── */}
      <Dialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Revoke {revokeTarget?.authorizationNumber ?? "Authorization"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              rows={2}
              placeholder="Optional — recorded in the audit log"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={revokeAuth} disabled={revokeBusy}>
              {revokeBusy ? "Revoking..." : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
