'use client';

import * as React from 'react';
import {
  LayoutDashboard,
  Receipt,
  BarChart3,
  Users,
  HardHat,
  HandCoins,
  Clock,
  Fuel,
  Truck,
  Settings,
  Package,
  UserCog,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { usePermissions } from '@/hooks/use-permissions';
import Image from 'next/image';

export type NavSection = 'dashboard' | 'expenses' | 'employees' | 'contractors' | 'timesheets' | 'fuelUsage' | 'machinery' | 'reports' | 'cashAdvance' | 'settings' | 'assets' | 'users';

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: string;
}

const allNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view' },
  { id: 'expenses', label: 'Expenses', icon: Receipt, permission: 'expenses:view' },
  { id: 'employees', label: 'Employees', icon: Users, permission: 'employees:view' },
  { id: 'contractors', label: 'Contractors', icon: HardHat, permission: 'contractors:view' },
  { id: 'timesheets', label: 'Timesheets', icon: Clock, permission: 'timesheets:view' },
  { id: 'fuelUsage', label: 'Fuel Usage', icon: Fuel, permission: 'fuelUsage:view' },
  { id: 'machinery', label: 'Machinery', icon: Truck, permission: 'machinery:view' },
  { id: 'assets', label: 'Assets', icon: Package, permission: 'assets:view' },
  { id: 'cashAdvance', label: 'Cash & Advances', icon: HandCoins, permission: 'cashAdvance:view' },
  { id: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports:view' },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'settings:view' },
  { id: 'users', label: 'Users', icon: UserCog, permission: 'users:view' },
];

interface SidebarNavProps {
  activeSection: NavSection;
  onSectionChange: (section: NavSection) => void;
  userName?: string;
  userEmail?: string;
}

export function SidebarNav({
  activeSection,
  onSectionChange,
  userName = 'Demo User',
  userEmail = 'demo@yakhshiledger.com',
}: SidebarNavProps) {
  const { hasPermission } = usePermissions();
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const navItems = React.useMemo(
    () => allNavItems.filter((item) => hasPermission(item.permission)),
    [hasPermission]
  );

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      {/* Header - App Logo */}
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="hover:bg-sidebar-accent"
              tooltip="YakhshiLedger"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <Image  
                    src="/icon.png"
                    alt="Yakhshi Ledger"
                    className="h-full w-full object-contain"
                    width={32}
                    height={32}
                  />
                
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold text-sidebar-foreground">
                  YakhshiLedger
                </span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  Track & Manage
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeSection === item.id}
                    onClick={() => onSectionChange(item.id)}
                    tooltip={item.label}
                    className={
                      activeSection === item.id
                        ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 hover:text-emerald-400 font-medium'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    }
                  >
                    <item.icon
                      className={
                        activeSection === item.id
                          ? 'text-emerald-400'
                          : 'text-sidebar-foreground/50'
                      }
                    />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      {/* Footer - User Info */}
      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="hover:bg-sidebar-accent"
              tooltip={userName}
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-emerald-600/30 text-emerald-400 text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-sidebar-foreground">
                  {userName}
                </span>
                <span className="truncate text-xs text-sidebar-foreground/50">
                  {userEmail}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
