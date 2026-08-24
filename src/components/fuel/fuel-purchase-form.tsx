'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
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
import { walletApi } from '@/services/wallet-api';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@/types/expense';
import { Checkbox } from '@/components/ui/checkbox';
import type { FuelTransaction, FuelContainer } from '@/types/asset';
import { toast } from 'sonner';

const purchaseSchema = z.object({
  fuelType: z.string().min(1, 'Fuel type is required'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unitPrice: z.coerce.number().min(0).optional(),
  totalCost: z.coerce.number().min(0).optional(),
  supplier: z.string().optional(),
  containerId: z.string().min(1, 'Destination container is required'),
  notes: z.string().optional(),
  createExpense: z.boolean().optional().default(false),
  paymentMethod: z.string().optional(),
  paidBy: z.string().optional(),
  payNow: z.boolean().optional().default(false),
  walletId: z.string().optional(),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

interface FuelPurchaseFormProps {
  onSuccess: () => void;
  initialData?: FuelTransaction;
}

export function FuelPurchaseForm({ onSuccess, initialData }: FuelPurchaseFormProps) {
  const [containers, setContainers] = useState<FuelContainer[]>([]);
  const [wallets, setWallets] = useState<{ id: string; name: string; balance: number; currency: string }[]>([]);
  const isEditing = !!initialData;

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema) as Resolver<PurchaseFormValues>,
    defaultValues: {
      fuelType: initialData?.fuelType || 'DIESEL',
      quantity: initialData?.quantity || 0,
      unitPrice: initialData?.unitPrice || 0,
      supplier: initialData?.supplier || '',
      containerId: initialData?.containerId || '',
      notes: initialData?.notes || '',
      createExpense: false,
      paymentMethod: 'CASH',
      paidBy: '',
      payNow: false,
      walletId: '',
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

  useEffect(() => {
    walletApi.list().then((res) => {
      if (res.data) setWallets(res.data);
    }).catch(() => {});
  }, []);

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
        createExpense: data.createExpense,
        paymentMethod: data.createExpense ? data.paymentMethod : undefined,
        paidBy: data.createExpense ? data.paidBy || undefined : undefined,
        payNow: data.createExpense ? data.payNow : undefined,
        walletId: data.createExpense && data.payNow ? data.walletId || undefined : undefined,
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

        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <FormField
            control={form.control}
            name="createExpense"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isEditing}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Record this purchase as an expense</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Adds the purchase to the expenses ledger. Only approved expenses count toward balances.
                  </p>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.watch('createExpense') && (
            <>
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m]}
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
                name="paidBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paid By</FormLabel>
                    <FormControl>
                      <Input placeholder="Who paid (defaults to current user)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payNow"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Pay now from wallet</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Leave unchecked to record as unpaid (pay later).
                      </p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch('payNow') && (
                <FormField
                  control={form.control}
                  name="walletId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Wallet</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select wallet" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {wallets.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              No wallets found
                            </div>
                          ) : (
                            wallets.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                {w.name} ({w.balance.toLocaleString()} {w.currency})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </>
          )}
        </div>

        <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
          {isEditing ? 'Update Purchase' : 'Record Purchase'}
        </Button>
      </form>
    </Form>
  );
}
