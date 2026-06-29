'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FUEL_TYPES, FUEL_TYPE_LABELS } from '@/types/contractor';
import { fuelApi } from '@/services/asset-api';
import type { FuelTransaction } from '@/types/asset';
import { toast } from 'sonner';

const purchaseSchema = z.object({
  fuelType: z.string().min(1, 'Fuel type is required'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unitPrice: z.coerce.number().min(0).optional(),
  totalCost: z.coerce.number().min(0).optional(),
  supplier: z.string().optional(),
  containerId: z.string().min(1, 'Destination container is required'),
  notes: z.string().optional(),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

interface FuelPurchaseFormProps {
  onSuccess: () => void;
  initialData?: FuelTransaction;
}

export function FuelPurchaseForm({ onSuccess, initialData }: FuelPurchaseFormProps) {
  const [containers, setContainers] = useState<{ id: string; name: string; fuelType?: string | null }[]>([]);
  const isEditing = !!initialData;

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      fuelType: initialData?.fuelType || 'DIESEL',
      quantity: initialData?.quantity || 0,
      unitPrice: initialData?.unitPrice || 0,
      supplier: initialData?.supplier || '',
      containerId: initialData?.containerId || '',
      notes: initialData?.notes || '',
    },
  });

  useEffect(() => {
    fuelApi.getContainers().then((res) => {
      if (res.data) {
        const mainContainers = res.data.filter((c) => c.isMainContainer);
        const secondary = res.data.filter((c) => !c.isMainContainer);
        setContainers([...mainContainers, ...secondary]);
        if (mainContainers.length === 1) form.setValue('containerId', mainContainers[0].id);
      }
    });
  }, [form]);

  const totalCost = form.watch('quantity') * (form.watch('unitPrice') || 0);
  const selectedContainerId = form.watch('containerId');
  const selectedContainer = containers.find((c) => c.id === selectedContainerId);

  useEffect(() => {
    if (selectedContainer?.fuelType) {
      form.setValue('fuelType', selectedContainer.fuelType);
    }
  }, [selectedContainerId, selectedContainer?.fuelType, form]);

  const onSubmit = async (data: PurchaseFormValues) => {
    try {
      const payload = {
        type: 'PURCHASE' as const,
        fuelType: data.fuelType,
        quantity: data.quantity,
        unitPrice: data.unitPrice || 0,
        totalCost: data.totalCost || totalCost,
        supplier: data.supplier || undefined,
        containerId: data.containerId,
        notes: data.notes || undefined,
        date: isEditing && initialData?.date ? initialData.date : new Date().toISOString(),
      };
      if (isEditing && initialData) {
        await fuelApi.update(initialData.id, payload);
        toast.success('Fuel purchase updated');
      } else {
        await fuelApi.create(payload);
        toast.success('Fuel purchase recorded');
      }
      onSuccess();
    } catch {
      toast.error(isEditing ? 'Failed to update purchase' : 'Failed to record purchase');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="containerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Destination Container</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select container" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {containers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.fuelType ? `(${FUEL_TYPE_LABELS[c.fuelType as keyof typeof FUEL_TYPE_LABELS] || c.fuelType})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fuelType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fuel Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={!!selectedContainer?.fuelType}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select fuel type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {FUEL_TYPES.map((ft) => (
                    <SelectItem key={ft} value={ft}>
                      {FUEL_TYPE_LABELS[ft]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity (Liters)</FormLabel>
              <FormControl>
                <Input type="number" min="0" step="0.1" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="unitPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unit Price (per Liter)</FormLabel>
              <FormControl>
                <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <FormLabel className="text-sm font-medium">Total Cost (calculated)</FormLabel>
          <p className="text-lg font-semibold text-emerald-600">Afs {totalCost.toFixed(2)}</p>
        </div>

        <FormField
          control={form.control}
          name="supplier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Supplier</FormLabel>
              <FormControl>
                <Input placeholder="Supplier name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional notes" className="min-h-[60px]" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
          {isEditing ? 'Update Purchase' : 'Record Purchase'}
        </Button>
      </form>
    </Form>
  );
}
