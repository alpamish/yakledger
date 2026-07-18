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
import { Loader2 } from 'lucide-react';
import { FUEL_TYPES, FUEL_TYPE_LABELS } from '@/types/contractor';
import { assetsApi, fuelApi } from '@/services/asset-api';
import { contractorsApi, machineryApi } from '@/services/contractor-api';
import { toast } from 'sonner';
import type { Asset, FuelTransaction } from '@/types/asset';
import type { Machinery } from '@/types/contractor';

const issueSchema = z.object({
  fuelType: z.string().min(1, 'Fuel type is required'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  containerId: z.string().min(1, 'Source container is required'),
  assetId: z.string().optional(),
  contractorId: z.string().optional(),
  machineryId: z.string().optional(),
  issuedToName: z.string().optional(),
  notes: z.string().optional(),
});

type IssueFormValues = z.infer<typeof issueSchema>;

interface FuelIssueFormProps {
  onSuccess: () => void;
  initialData?: FuelTransaction;
}

export function FuelIssueForm({ onSuccess, initialData }: FuelIssueFormProps) {
  const isEditing = !!initialData;
  const [containers, setContainers] = useState<{ id: string; name: string; fuelType?: string | null; fuelLocation?: string | null }[]>([]);
  const [vehicles, setVehicles] = useState<Asset[]>([]);
  const [contractors, setContractors] = useState<{ id: string; contractorName: string }[]>([]);
  const [machineryList, setMachineryList] = useState<Machinery[]>([]);
  const [loadingContractors, setLoadingContractors] = useState(true);
  const [loadingMachinery, setLoadingMachinery] = useState(false);

  const form = useForm<IssueFormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: {
      fuelType: initialData?.fuelType || 'DIESEL',
      quantity: initialData?.quantity || 0,
      containerId: initialData?.containerId || '',
      assetId: initialData?.assetId || '',
      contractorId: initialData?.contractorId || '',
      machineryId: initialData?.machineryId || '',
      issuedToName: initialData?.issuedToName || '',
      notes: initialData?.notes || '',
    },
  });

  const selectedContainerId = form.watch('containerId');
  const selectedContractorId = form.watch('contractorId');
  const selectedContainer = containers.find((c) => c.id === selectedContainerId);

  useEffect(() => {
    Promise.all([
      fuelApi.getContainers(),
      assetsApi.getAll({ categories: ['VEHICLE', 'MACHINERY'], pageSize: 100 }),
      contractorsApi.getList('ACTIVE'),
    ]).then(([contRes, vehRes, contrRes]) => {
      if (contRes.data) setContainers(contRes.data.filter((c) => !c.isMainContainer));
      if (vehRes.data) setVehicles(vehRes.data.data);
      if (contrRes.data) setContractors(contrRes.data);
    }).catch(() => {}).finally(() => setLoadingContractors(false));
  }, []);

  useEffect(() => {
    if (selectedContainer?.fuelType) {
      form.setValue('fuelType', selectedContainer.fuelType);
    }
  }, [selectedContainerId, selectedContainer?.fuelType, form]);

  useEffect(() => {
    if (selectedContractorId) {
      setLoadingMachinery(true);
      setMachineryList([]);
      form.setValue('machineryId', '');
      machineryApi.getAll({ assignedContractorId: selectedContractorId, pageSize: 100, statuses: ['OPERATIONAL', 'UNDER_MAINTENANCE'] }).then((res) => {
        if (res.data) setMachineryList(res.data.data);
      }).catch(() => {}).finally(() => setLoadingMachinery(false));
    } else {
      setMachineryList([]);
      form.setValue('machineryId', '');
    }
  }, [selectedContractorId, form]);

  const onSubmit = async (data: IssueFormValues) => {
    try {
      const payload = {
        type: 'ISSUE' as const,
        fuelType: data.fuelType,
        quantity: data.quantity,
        containerId: data.containerId,
        assetId: data.assetId || undefined,
        contractorId: data.contractorId || undefined,
        machineryId: data.machineryId || undefined,
        issuedToName: data.issuedToName || undefined,
        notes: data.notes || undefined,
        date: isEditing && initialData?.date ? initialData.date : new Date().toISOString(),
      };
      if (isEditing && initialData) {
        await fuelApi.update(initialData.id, payload);
        toast.success('Fuel issue updated');
      } else {
        await fuelApi.create(payload);
        toast.success('Fuel issued successfully');
      }
      onSuccess();
    } catch {
      toast.error(isEditing ? 'Failed to update issue' : 'Failed to issue fuel');
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
              <FormLabel>Source Container</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select container" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {containers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.fuelLocation ? ` (${c.fuelLocation})` : ''}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            name="issuedToName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Issued To (Person)</FormLabel>
                <FormControl>
                  <Input placeholder="Driver/operator name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="assetId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vehicle / Machinery (optional)</FormLabel>
              <Select onValueChange={(v) => field.onChange(v === 'none' ? '' : v)} value={field.value || 'none'}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select asset" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">No asset</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} {v.plateNumber ? `(${v.plateNumber})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <p className="text-sm font-medium text-muted-foreground">
            Link to Contractor Machinery (optional)
          </p>

          <FormField
            control={form.control}
            name="contractorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contractor</FormLabel>
                <Select onValueChange={(v) => field.onChange(v === 'none' ? '' : v)} value={field.value || 'none'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingContractors ? 'Loading contractors...' : 'Select contractor'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No contractor</SelectItem>
                    {loadingContractors ? (
                      <div className="flex items-center justify-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : (
                      contractors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.contractorName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {selectedContractorId && (
            <FormField
              control={form.control}
              name="machineryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Machinery</FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === 'none' ? '' : v)} value={field.value || 'none'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={loadingMachinery ? 'Loading machinery...' : 'Select machinery'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No machinery</SelectItem>
                      {loadingMachinery ? (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : machineryList.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">
                          No machinery assigned
                        </div>
                      ) : (
                        machineryList.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.machineryName} {m.plateNumber ? `(${m.plateNumber})` : ''}
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
        </div>

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
          {isEditing ? 'Update Issue' : 'Issue Fuel'}
        </Button>
      </form>
    </Form>
  );
}
