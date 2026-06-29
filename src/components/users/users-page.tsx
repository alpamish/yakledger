"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Users,
  Plus,
  Loader2,
  Shield,
  ShieldCheck,
  ShieldOff,
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { usePermissions } from "@/hooks/use-permissions";
import type { Role } from "@/types/expense";
import { ROLES, ROLE_LABELS } from "@/types/expense";

interface PermissionItem {
  id: string;
  name: string;
  label: string;
  description: string | null;
  module: string;
  granted: boolean | null;
}

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar: string | null;
  createdAt: string;
  updatedAt: string;
  userPermissions?: { id: string; permission: { name: string }; granted: boolean }[];
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  expenses: "Expenses",
  employees: "Employees",
  contractors: "Contractors",
  timesheets: "Timesheets",
  fuelUsage: "Fuel Usage",
  machinery: "Machinery",
  assets: "Assets",
  cashAdvance: "Cash & Advances",
  reports: "Reports",
  settings: "Settings",
  users: "Users",
};

function getRoleColor(role: string): string {
  switch (role) {
    case "ADMIN": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "MANAGER": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "WATCHER": return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
    case "TIMESHEET_USER": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    default: return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  }
}

export function UsersPage() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [permUser, setPermUser] = useState<UserItem | null>(null);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Create form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("USER");
  const [creating, setCreating] = useState(false);

  // Edit form
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<Role>("USER");
  const [editPassword, setEditPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const body = await res.json();
        setUsers(body.data ?? []);
      }
    } catch {
      toast.error("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const resetCreateForm = () => {
    setNewName("");
    setNewEmail("");
    setNewPassword("");
    setNewRole("USER");
  };

  const handleCreate = async () => {
    if (!newName || !newEmail || !newPassword) {
      toast.error("Please fill all fields");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: newRole }),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success(body.message ?? "User created");
        setCreateOpen(false);
        resetCreateForm();
        fetchUsers();
      } else {
        toast.error(body.error ?? "Failed to create user");
      }
    } catch {
      toast.error("Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (user: UserItem) => {
    setEditUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditPassword("");
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = { name: editName, email: editEmail, role: editRole };
      if (editPassword) data.password = editPassword;

      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success(body.message ?? "User updated");
        setEditUser(null);
        fetchUsers();
      } else {
        toast.error(body.error ?? "Failed to update user");
      }
    } catch {
      toast.error("Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: UserItem) => {
    if (!confirm(`Are you sure you want to delete ${user.name}?`)) return;
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const body = await res.json();
      if (res.ok) {
        toast.success(body.message ?? "User deleted");
        fetchUsers();
      } else {
        toast.error(body.error ?? "Failed to delete user");
      }
    } catch {
      toast.error("Failed to delete user");
    }
  };

  const openPermissions = async (user: UserItem) => {
    setPermUser(user);
    setLoadingPerms(true);
    try {
      const res = await fetch(`/api/users/${user.id}/permissions`);
      if (res.ok) {
        const body = await res.json();
        setPermissions(body.data ?? []);
      }
    } catch {
      toast.error("Failed to load permissions");
    } finally {
      setLoadingPerms(false);
    }
  };

  const togglePermission = async (perm: PermissionItem) => {
    if (!permUser) return;
    let newGranted: boolean;
    let method = "PUT";
    let body: Record<string, unknown>;

    if (perm.granted === null) {
      newGranted = false;
      body = { permissionName: perm.name, granted: false };
    } else if (perm.granted === true) {
      newGranted = false;
      body = { permissionName: perm.name, granted: false };
    } else {
      newGranted = true;
      body = { permissionName: perm.name, granted: true };
    }

    setPermissions((prev) =>
      prev.map((p) => (p.id === perm.id ? { ...p, granted: newGranted } : p))
    );

    try {
      const res = await fetch(`/api/users/${permUser.id}/permissions`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setPermissions((prev) =>
          prev.map((p) => (p.id === perm.id ? { ...p, granted: perm.granted } : p))
        );
        const err = await res.json();
        toast.error(err.error ?? "Failed to update permission");
      }
    } catch {
      setPermissions((prev) =>
        prev.map((p) => (p.id === perm.id ? { ...p, granted: perm.granted } : p))
      );
      toast.error("Failed to update permission");
    }
  };

  const toggleModule = (module: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  const modules = [...new Set(permissions.map((p) => p.module))];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage users, roles, and permissions
          </p>
        </div>
        {canCreate("users") && (
          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create User</DialogTitle>
                <DialogDescription>Add a new user to the system</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" type="email" />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" type="password" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Users</CardTitle>
          <CardDescription>{users.length} user(s) registered</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No users found
                  </TableCell>
                </TableRow>
              )}
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge className={getRoleColor(user.role)} variant="secondary">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {canEdit("users") && (
                          <DropdownMenuItem onClick={() => openEdit(user)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openPermissions(user)}>
                          <Shield className="mr-2 h-4 w-4" />
                          Permissions
                        </DropdownMenuItem>
                        {canDelete("users") && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDelete(user)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details and role</DialogDescription>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" />
              </div>
              <div className="space-y-2">
                <Label>New Password (leave blank to keep current)</Label>
                <Input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} type="password" placeholder="Leave blank to keep" />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as Role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!permUser} onOpenChange={(open) => { if (!open) setPermUser(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Permissions for {permUser?.name}
            </DialogTitle>
            <DialogDescription>
              Configure granular permissions. Green = granted, Red = denied, Gray = inherits role default.
              Click to cycle through states.
            </DialogDescription>
          </DialogHeader>
          {loadingPerms ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-2 py-2">
                {modules.map((module) => (
                  <div key={module} className="border rounded-lg">
                    <button
                      onClick={() => toggleModule(module)}
                      className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-muted/50 text-left font-medium text-sm"
                    >
                      <span>{MODULE_LABELS[module] ?? module}</span>
                      {expandedModules.has(module) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    {expandedModules.has(module) && (
                      <div className="px-4 pb-2 space-y-1">
                        {permissions
                          .filter((p) => p.module === module)
                          .map((perm) => (
                            <button
                              key={perm.id}
                              onClick={() => togglePermission(perm)}
                              className="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-muted/50 text-sm"
                            >
                              {perm.granted === true ? (
                                <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                              ) : perm.granted === false ? (
                                <ShieldOff className="h-4 w-4 text-red-500 shrink-0" />
                              ) : (
                                <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <span className="flex-1 text-left">{perm.label}</span>
                              <code className="text-xs text-muted-foreground">{perm.name}</code>
                              {perm.granted === true && (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1.5 py-0">Granted</Badge>
                              )}
                              {perm.granted === false && (
                                <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5 py-0">Denied</Badge>
                              )}
                              {perm.granted === null && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Default</Badge>
                              )}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
