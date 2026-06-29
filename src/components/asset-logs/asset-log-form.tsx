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
import { type Asset, type AssetLog } from '@/types/asset';
import { assetsApi, assetLogApi } from '@/services/asset-api';
import { employeesApi } from '@/services/api';
import { toast } from 'sonner';
import { useAssetStore } from '@/hooks/use-asset-store';

const formSchema = z.object({
  assetId: z.string().min(1, 'Asset is required'),
  date: z.string().min(1, 'Date is required'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  operatorId: z.string().optional(),
  startOdometer: z.coerce.number().min(0).optional(),
  endOdometer: z.coerce.number().min(0).optional(),
  engineHoursStart: z.coerce.number().min(0).optional(),
  engineHoursEnd: z.coerce.number().min(0).optional(),
  fuelConsumed: z.coerce.number().min(0).optional(),
  workSite: z.string().optional(),
  project: z.string().optional(),
  conditions: z.string().optional(),
  issues: z.string().optional(),
  remarks: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AssetLogFormProps {
  onSuccess: () => void;
  log?: AssetLog | null;
}

export function AssetLogForm({ onSuccess, log }: AssetLogFormProps) {
  const [vehicles, setVehicles] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<{ id: string; fullName: string }[]>([]);
  const { setEditingLog } = useAssetStore();
  const isEdit = !!log;

  useEffect(() => {
    assetsApi.getAll({ categories: ['VEHICLE', 'MACHINERY'], pageSize: 100 }).then((res) => {
      if (res.data) setVehicles(res.data.data);
    });
    employeesApi.list().then((res) => {
      if (res.data) setEmployees(res.data);
    }).catch(() => {});
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assetId: log?.assetId || '',
      date: log ? new Date(log.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      startTime: log?.startTime || '',
      endTime: log?.endTime || '',
      operatorId: log?.operatorId || '',
      startOdometer: log?.startOdometer ?? 0,
      endOdometer: log?.endOdometer ?? 0,
      engineHoursStart: log?.engineHoursStart ?? 0,
      engineHoursEnd: log?.engineHoursEnd ?? 0,
      fuelConsumed: log?.fuelConsumed ?? 0,
      workSite: log?.workSite || '',
      project: log?.project || '',
      conditions: log?.conditions || '',
      issues: log?.issues || '',
      remarks: log?.remarks || '',
    },
  });

  const start = form.watch('startOdometer');
  const end = form.watch('endOdometer');
  const distance = start && end ? Math.max(0, end - start) : 0;

  const engStart = form.watch('engineHoursStart');
  const engEnd = form.watch('engineHoursEnd');
  const engHours = engStart && engEnd ? Math.max(0, engEnd - engStart) : 0;

  const onSubmit = async (data: FormValues) => {
    try {
      const payload = {
        assetId: data.assetId,
        date: data.date,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        operatorId: data.operatorId || undefined,
        startOdometer: data.startOdometer || undefined,
        endOdometer: data.endOdometer || undefined,
        distanceTraveled: distance || undefined,
        engineHoursStart: data.engineHoursStart || null,
        engineHoursEnd: data.engineHoursEnd || null,
        engineHoursUsed: engHours || null,
        fuelConsumed: data.fuelConsumed || undefined,
        workSite: data.workSite || undefined,
        project: data.project || undefined,
        conditions: data.conditions || null,
        issues: data.issues || null,
        remarks: data.remarks || undefined,
      };

      if (isEdit && log) {
        await assetLogApi.update(log.id, payload);
        toast.success('Log entry updated');
      } else {
        await assetLogApi.create(payload);
        toast.success('Log entry created');
      }
      setEditingLog(null);
      onSuccess();
    } catch {
      toast.error(isEdit ? 'Failed to update log entry' : 'Failed to create log entry');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="assetId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vehicle / Machinery</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select asset" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
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

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Time</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Time</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="operatorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Operator</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startOdometer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Odometer (km)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="0.1" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endOdometer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Odometer (km)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="0.1" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="engineHoursStart"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Engine Hours Start</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="0.1" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="engineHoursEnd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Engine Hours End</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="0.1" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <FormLabel className="text-sm font-medium">Distance (auto)</FormLabel>
            <p className="text-lg font-semibold text-emerald-600">{distance.toFixed(1)} km</p>
          </div>

          <div>
            <FormLabel className="text-sm font-medium">Engine Hours (auto)</FormLabel>
            <p className="text-lg font-semibold text-blue-600">{engHours.toFixed(1)} h</p>
          </div>

          <FormField
            control={form.control}
            name="fuelConsumed"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fuel Consumed (L)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="0.1" placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="workSite"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work Site</FormLabel>
                <FormControl>
                  <Input placeholder="Site name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="project"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project</FormLabel>
                <FormControl>
                  <Input placeholder="Project name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="conditions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Work Conditions</FormLabel>
              <FormControl>
                <Textarea placeholder="Weather, terrain, visibility, etc." className="min-h-[60px]" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="issues"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Issues / Incidents</FormLabel>
              <FormControl>
                <Textarea placeholder="Any mechanical issues, incidents, or notes" className="min-h-[60px]" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="remarks"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Remarks</FormLabel>
              <FormControl>
                <Textarea placeholder="Additional remarks" className="min-h-[60px]" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
          {isEdit ? 'Update Log Entry' : 'Create Log Entry'}
        </Button>
      </form>
    </Form>
  );
}
