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
import { FUEL_TYPE_LABELS } from '@/types/contractor';
import { fuelApi } from '@/services/asset-api';
import type { FuelTransaction } from '@/types/asset';
import { toast } from 'sonner';

const transferSchema = z.object({
  sourceContainerId: z.string().min(1, 'Source container is required'),
  destinationContainerId: z.string().min(1, 'Destination container is required'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  notes: z.string().optional(),
}).refine(
  (data) => data.sourceContainerId !== data.destinationContainerId,
  { message: 'Source and destination must be different', path: ['destinationContainerId'] }
);

type TransferFormValues = z.infer<typeof transferSchema>;

interface FuelTransferFormProps {
  onSuccess: () => void;
  initialData?: FuelTransaction;
}

export function FuelTransferForm({ onSuccess, initialData }: FuelTransferFormProps) {
  const isEditing = !!initialData;
  const [containers, setContainers] = useState<{ id: string; name: string; fuelType?: string | null; balance: number; isMainContainer: boolean }[]>([]);

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      sourceContainerId: initialData?.containerId || '',
      destinationContainerId: initialData?.destinationContainerId || '',
      quantity: initialData?.quantity || 0,
      notes: initialData?.notes || '',
    },
  });

  const sourceId = form.watch('sourceContainerId');
  const source = containers.find((c) => c.id === sourceId);

  useEffect(() => {
    fuelApi.getContainers().then((res) => {
      if (res.data) setContainers(res.data);
    });
  }, []);

  const onSubmit = async (data: TransferFormValues) => {
    try {
      const payload = {
        type: 'TRANSFER' as const,
        fuelType: source?.fuelType || 'DIESEL',
        quantity: data.quantity,
        containerId: data.sourceContainerId,
        destinationContainerId: data.destinationContainerId,
        notes: data.notes || undefined,
        date: isEditing && initialData?.date ? initialData.date : new Date().toISOString(),
      };
      if (isEditing && initialData) {
        await fuelApi.update(initialData.id, payload);
        toast.success('Fuel transfer updated');
      } else {
        await fuelApi.create(payload);
        toast.success('Fuel transferred successfully');
      }
      onSuccess();
    } catch {
      toast.error(isEditing ? 'Failed to update transfer' : 'Failed to transfer fuel');
    }
  };

  const destContainers = containers.filter(
    (c) => c.id !== sourceId && (!source?.fuelType || c.fuelType === source.fuelType)
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="sourceContainerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source Container</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {containers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.balance.toFixed(1)}L{' '}
                      {c.fuelType ? FUEL_TYPE_LABELS[c.fuelType as keyof typeof FUEL_TYPE_LABELS] : ''}
                      {c.isMainContainer ? ' - Main' : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {source && (
          <p className="text-sm text-muted-foreground -mt-2">
            Available balance: <span className="font-semibold">{source.balance.toFixed(1)}L</span>
            {source.fuelType && ` (${FUEL_TYPE_LABELS[source.fuelType as keyof typeof FUEL_TYPE_LABELS]})`}
          </p>
        )}

        <FormField
          control={form.control}
          name="destinationContainerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Destination Container</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {destContainers.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">
                      No compatible containers
                    </div>
                  ) : (
                    destContainers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} (Capacity: {c.fuelCapacity ? `${c.fuelCapacity}L` : 'N/A'}
                        {c.fuelLocation ? ` - ${c.fuelLocation}` : ''})
                      </SelectItem>
                    ))
                  )}
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

        <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
          {isEditing ? 'Update Transfer' : 'Transfer Fuel'}
        </Button>
      </form>
    </Form>
  );
}
