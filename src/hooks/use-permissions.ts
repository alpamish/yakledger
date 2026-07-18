'use client';

import { useCallback } from "react";
import { useExpenseStore } from "./use-expense-store";
import type { Module, PermissionAction } from "@/types/expense";

export function usePermissions() {
  const user = useExpenseStore((s) => s.user);
  const userPermissions = useExpenseStore((s) => s.userPermissions);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      if (user.role === "ADMIN") return true;
      if (userPermissions["*"]) return true;
      return userPermissions[permission] === true;
    },
    [user, userPermissions]
  );

  const can = useCallback(
    (module: Module, action: PermissionAction): boolean => {
      return hasPermission(`${module}:${action}`);
    },
    [hasPermission]
  );

  const canView = useCallback((module: Module): boolean => can(module, "view"), [can]);
  const canCreate = useCallback((module: Module): boolean => can(module, "create"), [can]);
  const canEdit = useCallback((module: Module): boolean => can(module, "edit"), [can]);
  const canDelete = useCallback((module: Module): boolean => can(module, "delete"), [can]);
  const canApprove = useCallback((module: Module): boolean => can(module, "approve"), [can]);
  const canManagePermissions = useCallback((module: Module): boolean => can(module, "managePermissions"), [can]);

  return { hasPermission, can, canView, canCreate, canEdit, canDelete, canApprove, canManagePermissions };
}
