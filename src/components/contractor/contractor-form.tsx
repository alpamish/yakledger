'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useContractorStore } from '@/hooks/use-contractor-store';
import {
  CONTRACTOR_TYPES,
  CONTRACTOR_STATUSES,
  CONTRACTOR_TYPE_LABELS,
  CONTRACTOR_STATUS_LABELS,
  MACHINERY_STATUSES,
  FUEL_TYPES,
  MACHINERY_STATUS_LABELS,
  FUEL_TYPE_LABELS,
} from '@/types/contractor';
import type { ContractorType, ContractorStatus, MachineryStatus, FuelType } from '@/types/contractor';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const machineryEntrySchema = z.object({
  machineryName: z.string().min(1, 'Name is required').max(100),
  machineryType: z.string().min(1, 'Type is required').max(100),
  plateNumber: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  status: z.enum(MACHINERY_STATUSES).default('OPERATIONAL'),
  fuelType: z.enum(FUEL_TYPES).default('DIESEL'),
  hourlyConsumptionRate: z.coerce.number().min(0, 'Must be positive').default(0),
  hourlyRate: z.coerce.number().min(0, 'Must be positive').default(0),
  dailyRate: z.coerce.number().min(0, 'Must be positive').default(0),
  monthlyRate: z.coerce.number().min(0, 'Must be positive').default(0),
  contractDaysPerMonth: z.coerce.number().int().min(1, 'Min 1').max(31, 'Max 31').default(28),
  workHoursPerDay: z.coerce.number().int().min(1, 'Min 1').max(24, 'Max 24').default(9),
  contractStartDate: z.string().optional().nullable(),
  contractEndDate: z.string().optional().nullable(),
});

const contractorFormSchema = z.object({
  contractorName: z.string().min(1, 'Contractor name is required').max(100),
  fatherName: z.string().min(1, 'Father name is required').max(100),
  companyName: z.string().optional().nullable(),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  alternativePhone: z.string().optional().nullable(),
  email: z.string().email('Invalid email format').optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  nationalId: z.string().optional().nullable(),
  contractorType: z.enum(CONTRACTOR_TYPES, { required_error: 'Contractor type is required' }),
  status: z.enum(CONTRACTOR_STATUSES, { required_error: 'Status is required' }),
  notes: z.string().optional().nullable(),
  machineryEntries: z.array(machineryEntrySchema).optional().default([]),
});

type ContractorFormValues = z.infer<typeof contractorFormSchema>;

export function ContractorForm() {
  const isFormOpen = useContractorStore((s) => s.isFormOpen);
  const editingContractor = useContractorStore((s) => s.editingContractor);
  const isLoading = useContractorStore((s) => s.isLoading);
  const closeForm = useContractorStore((s) => s.closeForm);
  const createContractor = useContractorStore((s) => s.createContractor);
  const updateContractor = useContractorStore((s) => s.updateContractor);

  const isEditing = !!editingContractor;

  const form = useForm<ContractorFormValues>({
    resolver: zodResolver(contractorFormSchema),
    defaultValues: {
      contractorName: '',
      fatherName: '',
      companyName: '',
      phoneNumber: '',
      alternativePhone: '',
      email: '',
      address: '',
      nationalId: '',
      contractorType: undefined,
      status: 'ACTIVE',
      notes: '',
      machineryEntries: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'machineryEntries',
  });

  useEffect(() => {
    if (isFormOpen) {
      if (editingContractor) {
        form.reset({
          contractorName: editingContractor.contractorName,
          fatherName: editingContractor.fatherName,
          companyName: editingContractor.companyName ?? '',
          phoneNumber: editingContractor.phoneNumber,
          alternativePhone: editingContractor.alternativePhone ?? '',
          email: editingContractor.email ?? '',
          address: editingContractor.address ?? '',
          nationalId: editingContractor.nationalId ?? '',
          contractorType: editingContractor.contractorType as ContractorType,
          status: editingContractor.status as ContractorStatus,
          notes: editingContractor.notes ?? '',
          machineryEntries: (editingContractor.machinery ?? []).map((m) => ({
            machineryName: m.machineryName,
            machineryType: m.machineryType,
            plateNumber: m.plateNumber ?? '',
            model: m.model ?? '',
            driverName: m.driverName ?? '',
            status: m.status as MachineryStatus,
            fuelType: m.fuelType as FuelType,
            hourlyConsumptionRate: m.hourlyConsumptionRate,
            hourlyRate: m.hourlyRate,
            dailyRate: m.dailyRate,
            monthlyRate: m.monthlyRate,
            contractDaysPerMonth: m.contractDaysPerMonth ?? 28,
            workHoursPerDay: m.workHoursPerDay ?? 9,
            contractStartDate: m.contractStartDate ?? '',
            contractEndDate: m.contractEndDate ?? '',
          })),
        });
      } else {
        form.reset({
          contractorName: '',
          fatherName: '',
          companyName: '',
          phoneNumber: '',
          alternativePhone: '',
          email: '',
          address: '',
          nationalId: '',
          contractorType: undefined,
          status: 'ACTIVE',
          notes: '',
          machineryEntries: [],
        });
      }
    }
  }, [isFormOpen, editingContractor, form]);

  function addMachinery() {
    append({
      machineryName: '',
      machineryType: '',
      plateNumber: '',
      model: '',
      driverName: '',
      status: 'OPERATIONAL',
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

  async function onSubmit(values: ContractorFormValues) {
    try {
      const data = {
        contractorName: values.contractorName,
        fatherName: values.fatherName,
        companyName: values.companyName || undefined,
        phoneNumber: values.phoneNumber,
        alternativePhone: values.alternativePhone || undefined,
        email: values.email || undefined,
        address: values.address || undefined,
        nationalId: values.nationalId || undefined,
        contractorType: values.contractorType,
        status: values.status,
        notes: values.notes || undefined,
        machinery: (values.machineryEntries ?? []).filter((m) => m.machineryName).map((m) => ({
          machineryName: m.machineryName,
          machineryType: m.machineryType,
          plateNumber: m.plateNumber || undefined,
          model: m.model || undefined,
          driverName: m.driverName || undefined,
          status: m.status,
          fuelType: m.fuelType,
          hourlyConsumptionRate: m.hourlyConsumptionRate,
          hourlyRate: m.hourlyRate,
          dailyRate: m.dailyRate,
          monthlyRate: m.monthlyRate,
          contractDaysPerMonth: m.contractDaysPerMonth,
          workHoursPerDay: m.workHoursPerDay,
          contractStartDate: m.contractStartDate || undefined,
          contractEndDate: m.contractEndDate || undefined,
        })),
      };

      if (isEditing && editingContractor) {
        await updateContractor(editingContractor.id, data as any);
        toast.success('Contractor updated successfully');
      } else {
        await createContractor(data as any);
        toast.success('Contractor created successfully');
      }
    } catch {
      toast.error(isEditing ? 'Failed to update contractor' : 'Failed to create contractor');
    }
  }

  return (
    <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Contractor' : 'Add Contractor'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the contractor details and machinery below.'
              : 'Fill in the details to add a new contractor.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Personal Information */}
            <div className="border-t pt-4 mt-0">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Personal Information</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="contractorName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contractor Name *</FormLabel>
                  <FormControl><Input placeholder="Enter contractor name" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="fatherName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Father Name *</FormLabel>
                  <FormControl><Input placeholder="Enter father name" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="companyName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl><Input placeholder="Enter company name" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="nationalId" render={({ field }) => (
                <FormItem>
                  <FormLabel>National ID</FormLabel>
                  <FormControl><Input placeholder="Enter national ID" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number *</FormLabel>
                  <FormControl><Input placeholder="e.g., +93 700 000 000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="alternativePhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Alternative Phone</FormLabel>
                  <FormControl><Input placeholder="Alternative phone number" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="email@example.com" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl><Input placeholder="Enter address" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Contractor Type + Status */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Contractor Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="contractorType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contractor Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select contractor type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {CONTRACTOR_TYPES.map((t) => (<SelectItem key={t} value={t}>{CONTRACTOR_TYPE_LABELS[t]}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {CONTRACTOR_STATUSES.map((s) => (<SelectItem key={s} value={s}>{CONTRACTOR_STATUS_LABELS[s]}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea placeholder="Additional notes..." rows={2} {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Machinery Section */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Machinery ({fields.length})
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={addMachinery} className="h-8">
                  <Plus className="h-4 w-4 mr-1" /> Add Machinery
                </Button>
              </div>
            </div>

            {fields.map((field, index) => (
              <MachineryEntry
                key={field.id}
                form={form}
                index={index}
                onRemove={() => remove(index)}
              />
            ))}

            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
                No machinery added yet. Click "Add Machinery" above to add equipment for this contractor.
              </p>
            )}

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={closeForm} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Update Contractor' : 'Add Contractor'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function MachineryEntry({
  form,
  index,
  onRemove,
}: {
  form: ReturnType<typeof useForm<ContractorFormValues>>;
  index: number;
  onRemove: () => void;
}) {
  const monthlyRate = form.watch(`machineryEntries.${index}.monthlyRate`);
  const contractDays = form.watch(`machineryEntries.${index}.contractDaysPerMonth`);
  const workHours = form.watch(`machineryEntries.${index}.workHoursPerDay`);

  useEffect(() => {
    if (monthlyRate > 0 && contractDays > 0) {
      const daily = monthlyRate / contractDays;
      const hrs = workHours > 0 ? workHours : 9;
      const hourly = daily / hrs;
      form.setValue(`machineryEntries.${index}.dailyRate`, Math.round(daily * 100) / 100);
      form.setValue(`machineryEntries.${index}.hourlyRate`, Math.round(hourly * 100) / 100);
    }
  }, [monthlyRate, contractDays, workHours, form, index]);

  return (
    <div className="border rounded-lg p-4 space-y-3 relative">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Machinery #{index + 1}</h4>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField control={form.control} name={`machineryEntries.${index}.machineryName`} render={({ field }) => (
          <FormItem>
            <FormLabel>Machinery Name *</FormLabel>
            <FormControl><Input placeholder="e.g., Excavator X200" {...field} value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name={`machineryEntries.${index}.machineryType`} render={({ field }) => (
          <FormItem>
            <FormLabel>Machinery Type *</FormLabel>
            <FormControl><Input placeholder="e.g., Excavator, Crane" {...field} value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField control={form.control} name={`machineryEntries.${index}.plateNumber`} render={({ field }) => (
          <FormItem>
            <FormLabel>Plate Number</FormLabel>
            <FormControl><Input placeholder="e.g., KAB-1234" {...field} value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name={`machineryEntries.${index}.model`} render={({ field }) => (
          <FormItem>
            <FormLabel>Model</FormLabel>
            <FormControl><Input placeholder="e.g., CAT 320" {...field} value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name={`machineryEntries.${index}.driverName`} render={({ field }) => (
          <FormItem>
            <FormLabel>Driver Name</FormLabel>
            <FormControl><Input placeholder="Driver full name" {...field} value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField control={form.control} name={`machineryEntries.${index}.hourlyRate`} render={({ field }) => (
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
        <FormField control={form.control} name={`machineryEntries.${index}.dailyRate`} render={({ field }) => (
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
        <FormField control={form.control} name={`machineryEntries.${index}.monthlyRate`} render={({ field }) => (
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField control={form.control} name={`machineryEntries.${index}.contractStartDate`} render={({ field }) => (
          <FormItem>
            <FormLabel>Contract Start Date</FormLabel>
            <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name={`machineryEntries.${index}.contractEndDate`} render={({ field }) => (
          <FormItem>
            <FormLabel>Contract End Date</FormLabel>
            <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField control={form.control} name={`machineryEntries.${index}.contractDaysPerMonth`} render={({ field }) => (
          <FormItem>
            <FormLabel>Contract Days/Month</FormLabel>
            <FormControl><Input type="number" step="1" min="1" max="31" {...field} /></FormControl>
            <p className="text-xs text-muted-foreground">Default: 28 days</p>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name={`machineryEntries.${index}.workHoursPerDay`} render={({ field }) => (
          <FormItem>
            <FormLabel>Work Hours/Day</FormLabel>
            <FormControl><Input type="number" step="1" min="1" max="24" {...field} /></FormControl>
            <p className="text-xs text-muted-foreground">Default: 9 hours. Used for rate calc.</p>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField control={form.control} name={`machineryEntries.${index}.status`} render={({ field }) => (
          <FormItem>
            <FormLabel>Status</FormLabel>
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
        <FormField control={form.control} name={`machineryEntries.${index}.fuelType`} render={({ field }) => (
          <FormItem>
            <FormLabel>Fuel Type</FormLabel>
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
        <FormField control={form.control} name={`machineryEntries.${index}.hourlyConsumptionRate`} render={({ field }) => (
          <FormItem>
            <FormLabel>Fuel Consumption (L/hr)</FormLabel>
            <FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
    </div>
  );
}
