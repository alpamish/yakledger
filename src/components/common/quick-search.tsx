'use client';

import { useEffect, useState, useCallback } from 'react';
import { HardHat, Users } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { contractorsApi } from '@/services/contractor-api';
import { employeesApi } from '@/services/employee-api';
import { useContractorStore } from '@/hooks/use-contractor-store';
import { useEmployeeStore } from '@/hooks/use-employee-store';
import type { Contractor } from '@/types/contractor';
import type { Employee } from '@/types/employee';
import type { NavSection } from '@/components/layout/sidebar-nav';

interface QuickSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSectionChange: (section: NavSection) => void;
}

export function QuickSearch({ open, onOpenChange, onSectionChange }: QuickSearchProps) {
  const [contractors, setContractors] = useState<
    Pick<Contractor, 'id' | 'contractorName' | 'contractorType' | 'status'>[]
  >([]);
  const [employees, setEmployees] = useState<
    Pick<Employee, 'id' | 'fullName' | 'jobTitle' | 'department'>[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      Promise.all([
        contractorsApi.getList().then((r) => setContractors(r.data ?? [])),
        employeesApi.getList().then((r) => setEmployees(r.data ?? [])),
      ]).finally(() => setLoading(false));
    }
  }, [open]);

  const handleSelect = useCallback(
    (type: 'contractor' | 'employee', item: Record<string, unknown>) => {
      onOpenChange(false);

      if (type === 'contractor') {
        useContractorStore.setState({
          selectedContractor: item as unknown as Contractor,
          isLoading: true,
        });
        useContractorStore.getState().fetchContractorProfile(item.id as string);
        onSectionChange('contractors');
      } else {
        useEmployeeStore.setState({
          selectedEmployee: item as unknown as Employee,
          isLoading: true,
        });
        useEmployeeStore.getState().fetchEmployeeProfile(item.id as string);
        onSectionChange('employees');
      }
    },
    [onOpenChange, onSectionChange]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Quick Search" description="Search contractors and employees">
      <CommandInput placeholder="Search contractors and employees..." />
      <CommandList>
        <CommandEmpty>{loading ? 'Loading...' : 'No results found.'}</CommandEmpty>
        {contractors.length > 0 && (
          <CommandGroup heading="Contractors">
            {contractors.map((c) => (
              <CommandItem
                key={`c-${c.id}`}
                value={`${c.contractorName} ${c.contractorType ?? ''} ${c.status ?? ''}`}
                onSelect={() => handleSelect('contractor', c as unknown as Record<string, unknown>)}
              >
                <HardHat className="size-4" />
                <span>{c.contractorName}</span>
                {c.contractorType && (
                  <span className="text-xs text-muted-foreground ml-auto">{c.contractorType.replace(/_/g, ' ')}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {employees.length > 0 && (
          <CommandGroup heading="Employees">
            {employees.map((e) => (
              <CommandItem
                key={`e-${e.id}`}
                value={`${e.fullName} ${e.jobTitle ?? ''} ${e.department ?? ''}`}
                onSelect={() => handleSelect('employee', e as unknown as Record<string, unknown>)}
              >
                <Users className="size-4" />
                <span>{e.fullName}</span>
                {e.jobTitle && (
                  <span className="text-xs text-muted-foreground ml-auto">{e.jobTitle}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
