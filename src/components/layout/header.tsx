'use client';

import * as React from 'react';
import { Moon, Sun, User, Settings, LogOut, Search } from 'lucide-react';
import { useTheme } from 'next-themes';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

import type { NavSection } from './sidebar-nav';

interface HeaderProps {
  activeSection: NavSection;
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
  onSearchOpen?: () => void;
}

const sectionTitles: Record<NavSection, string> = {
  dashboard: 'Dashboard',
  expenses: 'Expenses',
  employees: 'Employees',
  contractors: 'Contractors',
  timesheets: 'Timesheets',
  fuelUsage: 'Fuel Usage',
  machinery: 'Machinery',
  cashAdvance: 'Cash & Advances',
  reports: 'Reports',
  settings: 'Settings',
};

export function Header({
  activeSection,
  userName = 'Demo User',
  userEmail = 'demo@yakhshiledger.com',
  onLogout,
  onSearchOpen,
}: HeaderProps) {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4 transition-colors">
      {/* Sidebar trigger (desktop) / Mobile menu trigger */}
      <SidebarTrigger className="-ml-1" />

      <Separator orientation="vertical" className="mr-2 h-4" />

      {/* Page title */}
      <h1 className="text-base font-semibold text-foreground">
        {sectionTitles[activeSection]}
      </h1>

      {/* Search */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onSearchOpen}
        className="text-muted-foreground hover:text-foreground gap-1.5"
        aria-label="Search"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline text-xs">Search...</span>
        <kbd className="hidden md:inline-flex text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">⌘K</kbd>
      </Button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label="Toggle theme"
        className="text-muted-foreground hover:text-foreground"
      >
        {mounted ? (
          theme === 'dark' ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )
        ) : (
          <Sun className="size-4" />
        )}
      </Button>

      {/* User avatar dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-8 w-8 rounded-full"
            aria-label="User menu"
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{userName}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {userEmail}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <User className="mr-2 size-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 size-4" />
              Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onLogout}>
            <LogOut className="mr-2 size-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
