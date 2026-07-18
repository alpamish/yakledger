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
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
} from '@/types/contractor';
import type { FuelUsage, FuelUsageFormData, Machinery } from '@/types/contractor';
import { fuelUsageApi, contractorsApi, machineryApi } from '@/services/contractor-api';
import { fuelApi } from '@/services/asset-api';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

const formSchema = z.object({
  contractorId: z.string().min(1, 'Contractor is required'),
  machineryId: z.string().min(1, 'Machinery is required'),
  fuelType: z.enum(FUEL_TYPES, { message: 'Fuel type is required' }),
  quantity: z.coerce.number().min(0.01, 'Quantity must be greater than 0'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be positive'),
  totalCost: z.coerce.number().min(0, 'Total cost must be positive'),
  date: z.string().min(1, 'Date is required'),
  fuelStation: z.string().optional().nullable(),
  containerId: z.string().optional(),
  notes: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface FuelUsageFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingFuelUsage: FuelUsage | null;
  onSuccess: () => void;
}

interface ContractorOption {
  id: string;
  contractorName: string;
}

export function FuelUsageForm({ open, onOpenChange, editingFuelUsage, onSuccess }: FuelUsageFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [containers, setContainers] = useState<{ id: string; name: string; fuelType?: string | null }[]>([]);
  const [machineryOptions, setMachineryOptions] = useState<Pick<Machinery, 'id' | 'machineryName' | 'plateNumber'>[]>([]);
  const [loadingContractors, setLoadingContractors] = useState(false);
  const [contractorPopoverOpen, setContractorPopoverOpen] = useState(false);

  const isEditing = !!editingFuelUsage;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      contractorId: '',
      machineryId: '',
      fuelType: 'DIESEL',
      quantity: 0,
      unitPrice: 0,
      totalCost: 0,
      date: format(new Date(), 'yyyy-MM-dd'),
      fuelStation: '',
      containerId: '',
      notes: '',
    },
  });

  const selectedContractorId = form.watch('contractorId');
  const selectedFuelType = form.watch('fuelType');
  const quantity = form.watch('quantity');
  const unitPrice = form.watch('unitPrice');
  const [loadingUnitPrice, setLoadingUnitPrice] = useState(false);

  useEffect(() => {
    const total = quantity * unitPrice;
    form.setValue('totalCost', Math.round(total * 100) / 100);
  }, [quantity, unitPrice, form]);

  useEffect(() => {
    if (open) {
      setLoadingContractors(true);
      Promise.all([
        contractorsApi.getList(),
        fuelApi.getContainers(),
      ]).then(([contrRes, contRes]) => {
        setContractors(contrRes.data ?? []);
        if (contRes.data) setContainers((contRes.data as unknown as Array<{ id: string; name: string; isMainContainer: boolean; fuelType?: string }>).filter((c) => !c.isMainContainer).map((c) => ({ id: c.id, name: c.name, fuelType: c.fuelType })));
      }).finally(() => setLoadingContractors(false));

      if (editingFuelUsage) {
        form.reset({
          contractorId: editingFuelUsage.contractorId,
          machineryId: editingFuelUsage.machineryId ?? '',
          fuelType: editingFuelUsage.fuelType,
          quantity: editingFuelUsage.quantity,
          unitPrice: editingFuelUsage.unitPrice,
          totalCost: editingFuelUsage.totalCost,
          date: format(new Date(editingFuelUsage.date), 'yyyy-MM-dd'),
          fuelStation: editingFuelUsage.fuelStation ?? '',
          containerId: '',
          notes: editingFuelUsage.notes ?? '',
        });
      } else {
        form.reset({
          contractorId: '',
          machineryId: '',
          fuelType: 'DIESEL',
          quantity: 0,
          unitPrice: 0,
          totalCost: 0,
          date: format(new Date(), 'yyyy-MM-dd'),
          fuelStation: '',
          containerId: '',
          notes: '',
        });
      }
    }
  }, [open, editingFuelUsage, form]);

  useEffect(() => {
    if (selectedContractorId) {
      machineryApi.getAll({ assignedContractorId: selectedContractorId, pageSize: 100, statuses: ['OPERATIONAL', 'UNDER_MAINTENANCE'] }).then((res) => {
        setMachineryOptions(res.data?.data ?? []);
      }).catch(() => {
        setMachineryOptions([]);
      });
    } else {
      setMachineryOptions([]);
    }
  }, [selectedContractorId]);

  useEffect(() => {
    if (!isEditing && selectedFuelType) {
      setLoadingUnitPrice(true);
      fuelApi.getAvgUnitPrice(selectedFuelType).then((res) => {
        if (res.data?.avgUnitPrice && res.data.avgUnitPrice > 0) {
          form.setValue('unitPrice', Math.round(res.data.avgUnitPrice * 100) / 100);
        }
      }).catch(() => {}).finally(() => setLoadingUnitPrice(false));
    }
  }, [selectedFuelType, isEditing, form]);

  async function onSubmit(values: FormValues) {
    try {
      setIsSubmitting(true);
      const data: FuelUsageFormData = {
        ...values,
        fuelStation: values.fuelStation || undefined,
        containerId: values.containerId || undefined,
        notes: values.notes || undefined,
      };

      if (isEditing && editingFuelUsage) {
        await fuelUsageApi.update(editingFuelUsage.id, data);
        toast.success('Fuel usage updated successfully');
        onSuccess();
        onOpenChange(false);
      } else {
        await fuelUsageApi.create(data);
        toast.success('Fuel usage added — keep going or close when done');
        onSuccess();
        form.reset({
          contractorId: values.contractorId,
          machineryId: values.machineryId,
          fuelType: values.fuelType,
          quantity: 0,
          unitPrice: values.unitPrice,
          totalCost: 0,
          date: format(new Date(), 'yyyy-MM-dd'),
          fuelStation: values.fuelStation ?? '',
          containerId: '',
          notes: '',
        });
      }
    } catch {
      toast.error(isEditing ? 'Failed to update fuel usage' : 'Failed to create fuel usage');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Fuel Usage' : 'Add Fuel Usage'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the fuel usage details below.' : 'Fill in the details to add a new fuel usage record.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Row: Contractor + Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="contractorId" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Contractor *</FormLabel>
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
                    <PopoverContent className="w-[90vw] sm:w-[400px] p-0">
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
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row: Fuel Type + Fuel Station */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <FormField control={form.control} name="fuelStation" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fuel Station</FormLabel>
                  <FormControl><Input placeholder="Station name" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row: Source Container (optional) */}
            <div className="grid grid-cols-1 gap-4">
              <FormField control={form.control} name="containerId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Source Container (optional)</FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === 'none' ? '' : v)} value={field.value || 'none'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select container to deduct from stock" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No container (standalone record)</SelectItem>
                      {containers.map((c, idx) => (
                        <SelectItem key={c.id || `container-${idx}`} value={c.id}>
                          {c.name}{c.fuelType ? ` (${FUEL_TYPE_LABELS[c.fuelType as keyof typeof FUEL_TYPE_LABELS] || c.fuelType})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">If selected, fuel will be deducted from this container&apos;s stock</p>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row: Quantity + Unit Price */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="quantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity (Liters) *</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="unitPrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit Price (Afs/L) *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Afs</span>
                      <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-7" {...field} />
                      {loadingUnitPrice && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Row: Total Cost (read-only-like) + Machinery */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="totalCost" render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Cost (auto-calc)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Afs</span>
                      <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-7" {...field} readOnly />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Auto-calculated from quantity × unit price</p>
                  <FormMessage />
                </FormItem>
              )} />
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
            </div>

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
                {isEditing ? 'Update Fuel Usage' : 'Add Fuel Usage'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
