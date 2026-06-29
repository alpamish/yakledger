'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAssetStore } from '@/hooks/use-asset-store';
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
import { Loader2, ChevronDown, Check } from 'lucide-react';
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
import { ASSET_CATEGORIES, ASSET_STATUSES, ASSET_CATEGORY_LABELS, ASSET_STATUS_LABELS } from '@/types/asset';
import { FUEL_TYPES, FUEL_TYPE_LABELS } from '@/types/contractor';
import { Checkbox } from '@/components/ui/checkbox';
import { employeesApi } from '@/services/api';

const assetFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.enum(ASSET_CATEGORIES as unknown as [string, ...string[]]),
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  purchasePrice: z.coerce.number().min(0, 'Price must be non-negative'),
  currentValue: z.coerce.number().min(0, 'Value must be non-negative'),
  quantity: z.coerce.number().int().min(1).default(1),
  serialNumber: z.string().optional(),
  plateNumber: z.string().optional(),
  assignedToId: z.string().optional(),
  status: z.enum(ASSET_STATUSES as unknown as [string, ...string[]]).default('ACTIVE'),
  notes: z.string().optional(),
  fuelType: z.string().optional(),
  fuelCapacity: z.coerce.number().min(0).optional(),
  fuelLocation: z.string().optional(),
  isMainContainer: z.boolean().optional(),
});

export type AssetFormValues = z.infer<typeof assetFormSchema>;

interface AssetFormProps {
  defaultValues?: Partial<AssetFormValues>;
  onSubmit: (data: AssetFormValues) => Promise<void>;
  isSubmitting: boolean;
}

interface EmployeeOption {
  id: string;
  fullName: string;
  jobTitle: string;
}

const PLATE_CATEGORIES = new Set(['VEHICLE', 'MACHINERY']);
const SERIAL_CATEGORIES = new Set(['LAPTOP', 'ELECTRONICS', 'MACHINERY']);
const FUEL_CATEGORY = 'FUEL';
const UNASSIGNED = 'unassigned';

export function AssetForm({ defaultValues, onSubmit, isSubmitting }: AssetFormProps) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [employeePopoverOpen, setEmployeePopoverOpen] = useState(false);
  const isEditing = !!defaultValues;
  const prevCategory = useRef<string | undefined>(undefined);
  const prevPurchasePrice = useRef<number>(0);

  useEffect(() => {
    employeesApi.list().then((res) => {
      if (res.data) setEmployees(res.data);
    }).catch(() => {}).finally(() => setLoadingEmployees(false));
  }, []);

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      name: '',
      category: 'OTHER' as never,
      purchaseDate: new Date().toISOString().split('T')[0],
      purchasePrice: 0,
      currentValue: 0,
      quantity: 1,
      fuelType: undefined,
      fuelCapacity: undefined,
      fuelLocation: '',
      isMainContainer: false,
      status: 'ACTIVE' as never,
      ...defaultValues,
    },
  });

  const category = form.watch('category');
  const purchasePrice = form.watch('purchasePrice');

  // Auto-populate currentValue from purchasePrice for new assets
  useEffect(() => {
    if (!isEditing) {
      const currentVal = form.getValues('currentValue');
      const prevPrice = prevPurchasePrice.current;
      if (currentVal === prevPrice || currentVal === 0) {
        form.setValue('currentValue', purchasePrice);
      }
    }
    prevPurchasePrice.current = purchasePrice;
  }, [purchasePrice, isEditing, form]);

  // Clear conditional fields when their category is deselected
  useEffect(() => {
    if (prevCategory.current !== undefined && prevCategory.current !== category) {
      if (PLATE_CATEGORIES.has(prevCategory.current) && !PLATE_CATEGORIES.has(category)) {
        form.setValue('plateNumber', '');
      }
      if (SERIAL_CATEGORIES.has(prevCategory.current) && !SERIAL_CATEGORIES.has(category)) {
        form.setValue('serialNumber', '');
      }
    }
    prevCategory.current = category;
  }, [category, form]);

  const handleAssignedToChange = (value: string) => {
    form.setValue('assignedToId', value === UNASSIGNED ? '' : value);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Asset Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter asset name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ASSET_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {ASSET_CATEGORY_LABELS[cat]}
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
            name="purchaseDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Purchase Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ASSET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ASSET_STATUS_LABELS[s]}
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
            name="purchasePrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Purchase Price (AFN)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currentValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Value (AFN)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity</FormLabel>
                <FormControl>
                  <Input type="number" min="1" step="1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="assignedToId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Assigned To</FormLabel>
                <Popover open={employeePopoverOpen} onOpenChange={setEmployeePopoverOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        {field.value
                          ? employees.find((e) => e.id === field.value)?.fullName ?? 'Select employee'
                          : 'Search employee...'}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="Search employee..." />
                      <CommandList>
                        <CommandEmpty>No employee found.</CommandEmpty>
                        <CommandItem
                          value={UNASSIGNED}
                          onSelect={() => {
                            handleAssignedToChange(UNASSIGNED);
                            setEmployeePopoverOpen(false);
                          }}
                        >
                          <Check
                            className="mr-2 h-4 w-4"
                            style={{ opacity: !field.value ? 1 : 0 }}
                          />
                          Not Assigned
                        </CommandItem>
                        {loadingEmployees ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : employees.length === 0 ? (
                          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                            No employees found
                          </div>
                        ) : (
                          employees.map((emp) => (
                            <CommandItem
                              key={emp.id}
                              value={emp.id}
                              onSelect={() => {
                                handleAssignedToChange(emp.id);
                                setEmployeePopoverOpen(false);
                              }}
                            >
                              <Check
                                className="mr-2 h-4 w-4"
                                style={{ opacity: field.value === emp.id ? 1 : 0 }}
                              />
                              {emp.fullName} — {emp.jobTitle}
                            </CommandItem>
                          ))
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {PLATE_CATEGORIES.has(category) && (
            <FormField
              control={form.control}
              name="plateNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plate Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter plate number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {SERIAL_CATEGORIES.has(category) && (
            <FormField
              control={form.control}
              name="serialNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Serial Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter serial number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Fuel container fields */}
          {category === FUEL_CATEGORY && (
            <>
              <FormField
                control={form.control}
                name="fuelType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuel Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
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
                name="fuelCapacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity (Liters)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="100" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fuelLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location / Site</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Main yard, Site B" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isMainContainer"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Main Container</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Main bulk storage container (typically large, centrally located)
                      </p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea placeholder="Additional notes about this asset" className="min-h-[80px]" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => useAssetStore.getState().setActiveView('list')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {isSubmitting ? 'Saving...' : isEditing ? 'Update Asset' : 'Create Asset'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
