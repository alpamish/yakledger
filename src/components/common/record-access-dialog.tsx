'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, Loader2, Trash2, Plus, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { accessApi } from '@/services/api';
import { getToken } from '@/services/api';
import type { RecordAccessGrant, RecordAccessType } from '@/types/expense';

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  USER: 'User',
  WATCHER: 'Watcher',
  TIMESHEET_USER: 'Timesheet User',
};

export function RecordAccessDialog({
  entity,
  entityId,
  entityLabel,
}: {
  entity: string;
  entityId: string;
  entityLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [grants, setGrants] = useState<RecordAccessGrant[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [accessType, setAccessType] = useState<RecordAccessType>('view');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [grantsRes, usersRes] = await Promise.all([
        accessApi.getGrants(entity, entityId),
        fetch('/api/users', {
          headers: { Authorization: `Bearer ${getToken()}` },
        }).then((r) => r.json()),
      ]);
      setGrants(grantsRes.data ?? []);
      const all = (usersRes.data ?? []) as UserOption[];
      setUsers(all.filter((u) => u.role !== 'ADMIN'));
    } catch {
      toast.error('Failed to load access data');
    } finally {
      setLoading(false);
    }
  }, [open, entity, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGrant = async () => {
    if (!selectedUserId) {
      toast.error('Select a user to share with');
      return;
    }
    setSaving(true);
    try {
      await accessApi.grant({ entity, entityId, userId: selectedUserId, accessType });
      toast.success('Access granted');
      setSelectedUserId('');
      load();
    } catch {
      toast.error('Failed to grant access');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (grantId: string) => {
    setRevokingId(grantId);
    try {
      await accessApi.revoke(grantId);
      toast.success('Access revoked');
      load();
    } catch {
      toast.error('Failed to revoke access');
    } finally {
      setRevokingId(null);
    }
  };

  const grantedUserIds = new Set(grants.map((g) => g.userId));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share {entityLabel}</DialogTitle>
          <DialogDescription>
            Grant another user access to this {entityLabel}. They will be able to view
            (or edit) it depending on the access level you choose.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {grants.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No one else has access to this {entityLabel} yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {grants.map((grant) => (
                    <div
                      key={grant.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                          {(grant.user?.name ?? '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{grant.user?.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {grant.user?.email} · {ROLE_LABELS[grant.user?.role ?? ''] ?? grant.user?.role}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={grant.accessType === 'edit' ? 'default' : 'outline'}>
                          {grant.accessType}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleRevoke(grant.id)}
                          disabled={revokingId === grant.id}
                        >
                          {revokingId === grant.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium">Grant access</p>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) => !grantedUserIds.has(u.id))
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  {users.every((u) => grantedUserIds.has(u.id)) && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      All non-admin users already have access
                    </div>
                  )}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Select value={accessType} onValueChange={(v) => setAccessType(v as RecordAccessType)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">
                      <span className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5" /> View
                      </span>
                    </SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleGrant}
                  disabled={saving || !selectedUserId}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Grant Access
                </Button>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
