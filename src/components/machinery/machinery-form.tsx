'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  MACHINERY_STATUSES,
  FUEL_TYPES,
  MACHINERY_STATUS_LABELS,
  FUEL_TYPE_LABELS,
} from '@/types/contractor';
import type { MachineryFormData, MachineryStatus, FuelType } from '@/types/contractor';
import { useMachineryStore } from '@/hooks/use-machinery-store';
import { contractorsApi } from '@/services/contractor-api';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const formSchema = z.object({
  machineryName: z.string().min(1, 'Machinery name is required').max(100),
  machineryType: z.string().min(1, 'Machinery type is required').max(100),
  plateNumber: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  status: z.enum(MACHINERY_STATUSES, { required_error: 'Status is required' }),
  assignedContractorId: z.string().min(1, 'Contractor is required'),
  fuelType: z.enum(FUEL_TYPES, { required_error: 'Fuel type is required' }),
  hourlyConsumptionRate: z.coerce.number().min(0, 'Must be positive').default(0),
  hourlyRate: z.coerce.number().min(0, 'Must be positive').default(0),
  dailyRate: z.coerce.number().min(0, 'Must be positive').default(0),
  monthlyRate: z.coerce.number().min(0, 'Must be positive').default(0),
  contractDaysPerMonth: z.coerce.number().int().min(1, 'Min 1').max(31, 'Max 31').default(28),
  workHoursPerDay: z.coerce.number().int().min(1, 'Min 1').max(24, 'Max 24').default(9),
  contractStartDate: z.string().optional().nullable(),
  contractEndDate: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface ContractorOption {
  id: string;
  contractorName: string;
}

export function MachineryForm() {
  const isFormOpen = useMachineryStore((s) => s.isFormOpen);
  const editingMachinery = useMachineryStore((s) => s.editingMachinery);
  const isLoading = useMachineryStore((s) => s.isLoading);
  const closeForm = useMachineryStore((s) => s.closeForm);
  const createMachinery = useMachineryStore((s) => s.createMachinery);
  const updateMachinery = useMachineryStore((s) => s.updateMachinery);

  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [loadingContractors, setLoadingContractors] = useState(false);
  const [contractorPopoverOpen, setContractorPopoverOpen] = useState(false);

  const isEditing = !!editingMachinery;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      machineryName: '',
      machineryType: '',
      plateNumber: '',
      model: '',
      driverName: '',
      status: 'OPERATIONAL',
      assignedContractorId: '',
      fuelType: 'DIESEL',
      hourlyConsumptionRate: 0,
      hourlyRate: 0,
      dailyRate: 0,
      monthlyRate: 0,
      contractDaysPerMonth: 28,
      workHoursPerDay: 9,
      contractStartDate: '',
      contractEndDate: '',
    },
  });

  useEffect(() => {
    if (isFormOpen) {
      setLoadingContractors(true);
      contractorsApi.getList().then((res) => {
        setContractors(res.data ?? []);
      }).finally(() => setLoadingContractors(false));

      if (editingMachinery) {
        form.reset({
          machineryName: editingMachinery.machineryName,
          machineryType: editingMachinery.machineryType,
          plateNumber: editingMachinery.plateNumber ?? '',
          model: editingMachinery.model ?? '',
          driverName: editingMachinery.driverName ?? '',
          status: editingMachinery.status,
          assignedContractorId: editingMachinery.assignedContractorId,
          fuelType: editingMachinery.fuelType,
          hourlyConsumptionRate: editingMachinery.hourlyConsumptionRate,
          hourlyRate: editingMachinery.hourlyRate,
          dailyRate: editingMachinery.dailyRate,
          monthlyRate: editingMachinery.monthlyRate,
          contractDaysPerMonth: editingMachinery.contractDaysPerMonth ?? 28,
          workHoursPerDay: editingMachinery.workHoursPerDay ?? 9,
          contractStartDate: editingMachinery.contractStartDate ?? '',
          contractEndDate: editingMachinery.contractEndDate ?? '',
        });
      } else {
        form.reset({
          machineryName: '',
          machineryType: '',
          plateNumber: '',
          model: '',
          driverName: '',
          status: 'OPERATIONAL',
          assignedContractorId: '',
          fuelType: 'DIESEL',
          hourlyConsumptionRate: 0,
          hourlyRate: 0,
          dailyRate: 0,
          monthlyRate: 0,
          contractDaysPerMonth: 28,
          workHoursPerDay: 9,
          contractStartDate: '',
          contractEndDate: '',
        });
      }
    }
  }, [isFormOpen, editingMachinery, form]);

  const monthlyRate = form.watch('monthlyRate');
  const contractDays = form.watch('contractDaysPerMonth');
  const workHours = form.watch('workHoursPerDay');

  useEffect(() => {
    if (monthlyRate > 0 && contractDays > 0) {
      const daily = monthlyRate / contractDays;
      const hrs = workHours > 0 ? workHours : 9;
      const hourly = daily / hrs;
      form.setValue('dailyRate', Math.round(daily * 100) / 100);
      form.setValue('hourlyRate', Math.round(hourly * 100) / 100);
    }
  }, [monthlyRate, contractDays, workHours, form]);

  async function onSubmit(values: FormValues) {
    try {
      const data: MachineryFormData = {
        ...values,
        plateNumber: values.plateNumber || undefined,
        model: values.model || undefined,
        driverName: values.driverName || undefined,
        contractStartDate: values.contractStartDate || undefined,
        contractEndDate: values.contractEndDate || undefined,
      };

      if (isEditing && editingMachinery) {
        await updateMachinery(editingMachinery.id, data);
        toast.success('Machinery updated successfully');
      } else {
        await createMachinery(data);
        toast.success('Machinery created successfully');
      }
    } catch {
      toast.error(isEditing ? 'Failed to update machinery' : 'Failed to create machinery');
    }
  }

  return (
    <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Machinery' : 'Add Machinery'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the machinery details below.' : 'Fill in the details to add new machinery.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Basic Info */}
            <div className="border-t pt-4 mt-0">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Basic Information</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="machineryName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Machinery Name *</FormLabel>
                  <FormControl><Input placeholder="e.g., Excavator X200" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="machineryType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Machinery Type *</FormLabel>
                  <FormControl><Input placeholder="e.g., Excavator, Crane" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="plateNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Plate Number</FormLabel>
                  <FormControl><Input placeholder="e.g., KAB-1234" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="model" render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl><Input placeholder="e.g., 2023, CAT 320" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="driverName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Driver Name</FormLabel>
                  <FormControl><Input placeholder="Full name of the driver" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Status & Fuel */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Status & Fuel</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {MACHINERY_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{MACHINERY_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="fuelType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fuel Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select fuel type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {FUEL_TYPES.map((f) => (
                        <SelectItem key={f} value={f}>{FUEL_TYPE_LABELS[f]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="hourlyConsumptionRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fuel Consumption (L/hr)</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Contractor Assignment */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Assignment</h3>
            </div>

            <FormField control={form.control} name="assignedContractorId" render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Assigned Contractor *</FormLabel>
                <Popover open={contractorPopoverOpen} onOpenChange={setContractorPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {field.value
                        ? contractors.find((c) => c.id === field.value)?.contractorName ?? 'Select contractor'
                        : 'Search contractor...'}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="Search contractor..." />
                      <CommandList>
                        <CommandEmpty>No contractor found.</CommandEmpty>
                        {loadingContractors ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : (
                          contractors.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.contractorName}
                              onSelect={() => {
                                field.onChange(c.id);
                                setContractorPopoverOpen(false);
                              }}
                            >
                              <Check
                                className="mr-2 h-4 w-4"
                                style={{ opacity: field.value === c.id ? 1 : 0 }}
                              />
                              {c.contractorName}
                            </CommandItem>
                          ))
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )} />

            {/* Rates & Contract */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Rates & Contract</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="hourlyRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hourly Rate</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Afs</span>
                      <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-7" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="dailyRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Daily Rate</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Afs</span>
                      <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-7" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="monthlyRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Monthly Rate</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Afs</span>
                      <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-7" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="contractStartDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contract Start Date</FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="contractEndDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contract End Date</FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="contractDaysPerMonth" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contract Days Per Month</FormLabel>
                  <FormControl><Input type="number" step="1" min="1" max="31" {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">Default: 28 days</p>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="workHoursPerDay" render={({ field }) => (
                <FormItem>
                  <FormLabel>Work Hours Per Day</FormLabel>
                  <FormControl><Input type="number" step="1" min="1" max="24" {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">Default: 9 hours. Used for overtime & rate calc.</p>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={closeForm} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Update Machinery' : 'Add Machinery'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
