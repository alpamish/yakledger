'use client';

import * as React from 'react';

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { SidebarNav, type NavSection } from './sidebar-nav';
import { Header } from './header';
import { Footer } from './footer';
import { QuickSearch } from '@/components/common/quick-search';

interface AppShellProps {
  children: React.ReactNode;
  activeSection?: NavSection;
  onSectionChange?: (section: NavSection) => void;
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
}

export function AppShell({
  children,
  activeSection = 'dashboard',
  onSectionChange,
  userName = 'Demo User',
  userEmail = 'demo@yakhshiledger.com',
  onLogout,
}: AppShellProps) {
  const [currentSection, setCurrentSection] = React.useState<NavSection>(activeSection);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const handleSectionChange = React.useCallback(
    (section: NavSection) => {
      setCurrentSection(section);
      onSectionChange?.(section);
    },
    [onSectionChange]
  );

  return (
    <SidebarProvider defaultOpen>
      {/* Sidebar Navigation */}
      <SidebarNav
        activeSection={currentSection}
        onSectionChange={handleSectionChange}
        userName={userName}
        userEmail={userEmail}
      />

      {/* Main Content Area */}
      <SidebarInset className="flex min-h-screen flex-col">
        {/* Header */}
        <Header
          activeSection={currentSection}
          userName={userName}
          userEmail={userEmail}
          onLogout={onLogout}
          onSearchOpen={() => setSearchOpen(true)}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {typeof children === 'function'
            ? (children as (section: NavSection) => React.ReactNode)(currentSection)
            : children}
        </main>

        {/* Footer */}
        <Footer />
      </SidebarInset>

      {/* Quick Search Dialog */}
      <QuickSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSectionChange={handleSectionChange}
      />
    </SidebarProvider>
  );
}
