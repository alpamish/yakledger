'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { Timesheet, TimesheetFormData, Machinery, MachineryRate } from '@/types/contractor';
import { timesheetsApi, contractorsApi, machineryApi } from '@/services/contractor-api';
import { AlertCircle, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const formSchema = z.object({
  contractorId: z.string().min(1, 'Contractor is required'),
  machineryId: z.string().min(1, 'Machinery is required'),
  machineryRateId: z.string().optional().nullable(),
  operatorName: z.string().optional().nullable(),
  workSite: z.string().optional().nullable(),
  date: z.string().min(1, 'Date is required'),
  startTime: z.string().optional().nullable(),
  lunchStart: z.string().optional().nullable(),
  lunchEnd: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  totalHours: z.coerce.number().min(0, 'Must be positive').default(0),
  overtimeHours: z.coerce.number().min(0, 'Must be positive').default(0),
  approvedBy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface TimesheetFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTimesheet: Timesheet | null;
  onSuccess: () => void;
}

interface ContractorOption {
  id: string;
  contractorName: string;
  fatherName: string;
  status: string;
}

export function TimesheetForm({ open, onOpenChange, editingTimesheet, onSuccess }: TimesheetFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [machineryOptions, setMachineryOptions] = useState<Pick<Machinery, 'id' | 'machineryName' | 'plateNumber'>[]>([]);
  const [machineryRates, setMachineryRates] = useState<MachineryRate[]>([]);
  const [loadingContractors, setLoadingContractors] = useState(false);
  const [contractorPopoverOpen, setContractorPopoverOpen] = useState(false);
  const [workHoursPerDay, setWorkHoursPerDay] = useState(9);

  const isEditing = !!editingTimesheet;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contractorId: '',
      machineryId: '',
      machineryRateId: '',
      operatorName: '',
      workSite: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: '07:00',
      lunchStart: '12:00',
      lunchEnd: '13:00',
      endTime: '17:00',
      totalHours: 0,
      overtimeHours: 0,
      approvedBy: '',
      notes: '',
    },
  });

  const selectedContractorId = form.watch('contractorId');

  useEffect(() => {
    if (open) {
      setLoadingContractors(true);
      contractorsApi.getList().then((res) => {
        setContractors(res.data ?? []);
      }).finally(() => setLoadingContractors(false));

      if (editingTimesheet) {
        form.reset({
          contractorId: editingTimesheet.contractorId,
          machineryId: editingTimesheet.machineryId ?? '',
          machineryRateId: editingTimesheet.machineryRateId ?? '',
          operatorName: editingTimesheet.operatorName ?? '',
          workSite: editingTimesheet.workSite ?? '',
          date: format(new Date(editingTimesheet.date), 'yyyy-MM-dd'),
          startTime: editingTimesheet.startTime ?? '',
          lunchStart: editingTimesheet.lunchStart ?? '',
          lunchEnd: editingTimesheet.lunchEnd ?? '',
          endTime: editingTimesheet.endTime ?? '',
          totalHours: editingTimesheet.totalHours,
          overtimeHours: editingTimesheet.overtimeHours,
          approvedBy: editingTimesheet.approvedBy ?? '',
          notes: editingTimesheet.notes ?? '',
        });
      } else {
        form.reset({
          contractorId: '',
          machineryId: '',
          machineryRateId: '',
          operatorName: '',
          workSite: '',
          date: format(new Date(), 'yyyy-MM-dd'),
          startTime: '07:00',
          lunchStart: '12:00',
          lunchEnd: '13:00',
          endTime: '17:00',
          totalHours: 0,
          overtimeHours: 0,
          approvedBy: '',
          notes: '',
        });
      }
    }
  }, [open, editingTimesheet, form]);

  useEffect(() => {
    if (selectedContractorId) {
      machineryApi.getAll({ assignedContractorId: selectedContractorId, pageSize: 100 }).then((res) => {
        setMachineryOptions(res.data?.data ?? []);
      }).catch(() => {
        setMachineryOptions([]);
      });
      contractorsApi.getById(selectedContractorId).then((res) => {
        setWorkHoursPerDay(res.data?.workHoursPerDay ?? 9);
      }).catch(() => {
        setWorkHoursPerDay(9);
      });
    } else {
      setMachineryOptions([]);
      setWorkHoursPerDay(9);
    }
  }, [selectedContractorId]);

  const selectedMachineryId = form.watch('machineryId');

  useEffect(() => {
    if (selectedMachineryId) {
      machineryApi.getRates(selectedMachineryId).then((res) => {
        const rates = res.data ?? [];
        setMachineryRates(rates);
        const currentRateId = form.getValues('machineryRateId');
        if (!currentRateId) {
          const defaultRate = rates.find((r) => r.isDefault);
          if (defaultRate) {
            form.setValue('machineryRateId', defaultRate.id);
          }
        }
      }).catch(() => {
        setMachineryRates([]);
      });
    } else {
      setMachineryRates([]);
      form.setValue('machineryRateId', '');
    }
  }, [selectedMachineryId, form]);

  const startTime = form.watch('startTime');
  const lunchStart = form.watch('lunchStart');
  const lunchEnd = form.watch('lunchEnd');
  const endTime = form.watch('endTime');

  useEffect(() => {
    function parseMinutes(val: string | null | undefined): number {
      if (!val) return -1;
      const [h, m] = val.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return -1;
      return h * 60 + m;
    }

    const s = parseMinutes(startTime);
    const ls = parseMinutes(lunchStart);
    const le = parseMinutes(lunchEnd);
    const e = parseMinutes(endTime);

    let total = 0;
    if (s >= 0 && ls > s) total += (ls - s) / 60;
    if (le >= 0 && e > le) total += (e - le) / 60;

    total = Math.round(total * 100) / 100;
    const ot = Math.max(0, Math.round((total - workHoursPerDay) * 100) / 100);

    form.setValue('totalHours', total);
    form.setValue('overtimeHours', ot);
  }, [startTime, lunchStart, lunchEnd, endTime, workHoursPerDay, form]);

  async function onSubmit(values: FormValues) {
    try {
      setIsSubmitting(true);
      const data: TimesheetFormData = {
        ...values,
        machineryId: values.machineryId,
        machineryRateId: values.machineryRateId || undefined,
        operatorName: values.operatorName || undefined,
        workSite: values.workSite || undefined,
        startTime: values.startTime || undefined,
        lunchStart: values.lunchStart || undefined,
        lunchEnd: values.lunchEnd || undefined,
        endTime: values.endTime || undefined,
        approvedBy: values.approvedBy || undefined,
        notes: values.notes || undefined,
      };

      if (isEditing && editingTimesheet) {
        await timesheetsApi.update(editingTimesheet.id, data);
        toast.success('Timesheet updated successfully');
      } else {
        await timesheetsApi.create(data);
        toast.success('Timesheet created successfully');
      }
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error(isEditing ? 'Failed to update timesheet' : 'Failed to create timesheet');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Timesheet' : 'Add Timesheet'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the timesheet details below.' : 'Fill in the details to add a new timesheet.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Row: Contractor + Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="contractorId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contractor *</FormLabel>
                  <Popover open={contractorPopoverOpen} onOpenChange={setContractorPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between"
                        >
                          {field.value
                            ? (contractors.find((c) => c.id === field.value)?.contractorName ?? 'Select contractor')
                            : loadingContractors
                              ? 'Loading...'
                              : 'Select contractor'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                      <Command>
                        <CommandInput placeholder="Search by name or father name..." />
                        <CommandList>
                          <CommandEmpty>No contractor found.</CommandEmpty>
                          <CommandGroup>
                            {contractors.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={`${c.contractorName} ${c.fatherName}`}
                                onSelect={() => {
                                  field.onChange(c.id);
                                  setContractorPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4 shrink-0',
                                    field.value === c.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{c.contractorName}</span>
                                  {c.fatherName && (
                                    <span className="text-xs text-muted-foreground">{c.fatherName}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {contractors.find(c => c.id === field.value)?.status === 'SUSPENDED' && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Suspended Contractor</AlertTitle>
                      <AlertDescription>
                        This contractor is suspended. Consider selecting an active contractor.
                      </AlertDescription>
                    </Alert>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row: Operator + Work Site */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="operatorName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Operator Name</FormLabel>
                  <FormControl><Input placeholder="Operator name" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="workSite" render={({ field }) => (
                <FormItem>
                  <FormLabel>Work Site</FormLabel>
                  <FormControl><Input placeholder="Work site location" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Time Section: Morning + Afternoon */}
            <div className="border-t pt-4 mt-0">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Work Hours</h3>
            </div>
            {/* Row 1: Morning Start + Morning End */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="startTime" render={({ field }) => (
                <FormItem>
                  <FormLabel>Morning Start</FormLabel>
                  <FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lunchStart" render={({ field }) => (
                <FormItem>
                  <FormLabel>Morning End</FormLabel>
                  <FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            {/* Row 2: Afternoon Start + Afternoon End */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="lunchEnd" render={({ field }) => (
                <FormItem>
                  <FormLabel>Afternoon Start</FormLabel>
                  <FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="endTime" render={({ field }) => (
                <FormItem>
                  <FormLabel>Afternoon End</FormLabel>
                  <FormControl><Input type="time" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row: Total Hours + Overtime Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="totalHours" render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Hours</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="overtimeHours" render={({ field }) => (
                <FormItem>
                  <FormLabel>Overtime Hours</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row: Machinery + Approved By */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="machineryId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Machinery *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl><SelectTrigger><SelectValue placeholder={selectedContractorId ? 'Select machinery' : 'Select contractor first'} /></SelectTrigger></FormControl>
                    <SelectContent>
                      {machineryOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.machineryName}{m.plateNumber ? ` (${m.plateNumber})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="approvedBy" render={({ field }) => (
                <FormItem>
                  <FormLabel>Approved By</FormLabel>
                  <FormControl><Input placeholder="Approver name" {...field} value={field.value ?? ''} disabled /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row: Rate Tier (only when rates exist) */}
            {machineryRates.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="machineryRateId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate Tier</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select rate tier" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {machineryRates.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.rateName} — Afs {r.monthlyRate.toLocaleString()}/mo
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div />
              </div>
            )}

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea placeholder="Additional notes..." rows={2} {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Update Timesheet' : 'Add Timesheet'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
