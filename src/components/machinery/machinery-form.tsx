'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
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
import type { MachineryFormData, MachineryStatus, FuelType, MachineryRate, MachineryRateFormData, Machinery } from '@/types/contractor';
import { useMachineryStore } from '@/hooks/use-machinery-store';
import { contractorsApi, machineryApi } from '@/services/contractor-api';
import { Check, ChevronDown, Loader2, Plus, Pencil, Trash2, Upload, X, ImageIcon, RotateCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { rotateCanvas } from '@/lib/image-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const formSchema = z.object({
  machineryName: z.string().min(1, 'Machinery name is required').max(100),
  machineryType: z.string().min(1, 'Machinery type is required').max(100),
  plateNumber: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  driverFatherName: z.string().optional().nullable(),
  driverPhoneNumber: z.string().optional().nullable(),
  driverNationalId: z.string().optional().nullable(),
  status: z.enum(MACHINERY_STATUSES, { message: 'Status is required' }),
  assignedContractorId: z.string().min(1, 'Contractor is required'),
  fuelType: z.enum(FUEL_TYPES, { message: 'Fuel type is required' }),
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

  const [machineryRates, setMachineryRates] = useState<MachineryRate[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<MachineryRate | null>(null);
  const [deletingRateId, setDeletingRateId] = useState<string | null>(null);

  const isEditing = !!editingMachinery;

  const [isUploadingFront, setIsUploadingFront] = useState(false);
  const [isUploadingBack, setIsUploadingBack] = useState(false);
  const [showIdImageDialog, setShowIdImageDialog] = useState(false);
  const [idImageSide, setIdImageSide] = useState<'front' | 'back'>('front');
  const [pendingIdImageFile, setPendingIdImageFile] = useState<File | null>(null);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [idImageToRemove, setIdImageToRemove] = useState<'front' | 'back' | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState('');
  const [previewImageAlt, setPreviewImageAlt] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      machineryName: '',
      machineryType: '',
      plateNumber: '',
      model: '',
      driverName: '',
      driverFatherName: '',
      driverPhoneNumber: '',
      driverNationalId: '',
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
          driverFatherName: editingMachinery.driverFatherName ?? '',
          driverPhoneNumber: editingMachinery.driverPhoneNumber ?? '',
          driverNationalId: editingMachinery.driverNationalId ?? '',
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
          driverFatherName: '',
          driverPhoneNumber: '',
          driverNationalId: '',
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
  useEffect(() => {
    if (isFormOpen && editingMachinery) {
      setLoadingRates(true);
      machineryApi.getRates(editingMachinery.id).then((res) => {
        setMachineryRates(res.data ?? []);
      }).finally(() => setLoadingRates(false));
    } else if (isFormOpen) {
      setMachineryRates([]);
    }
  }, [isFormOpen, editingMachinery]);

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
        driverFatherName: values.driverFatherName || undefined,
        driverPhoneNumber: values.driverPhoneNumber || undefined,
        driverNationalId: values.driverNationalId || undefined,
        contractStartDate: values.contractStartDate || undefined,
        contractEndDate: values.contractEndDate || undefined,
      };

      if (isEditing && editingMachinery) {
        await updateMachinery(editingMachinery.id, data);
        toast.success('Machinery updated successfully');
      } else {
        const created = await createMachinery(data);
        if (created) {
          toast.success('Machinery created! Upload driver ID documents below.');
        } else {
          toast.success('Machinery created successfully');
        }
      }
    } catch (error) {
      const fallback = isEditing ? 'Failed to update machinery' : 'Failed to create machinery';
      toast.error(error instanceof Error && error.message ? error.message : fallback);
    }
  }

  const [rateFormData, setRateFormData] = useState<MachineryRateFormData>({
    rateName: '',
    monthlyRate: 0,
    dailyRate: 0,
    hourlyRate: 0,
    contractDaysPerMonth: 28,
    workHoursPerDay: 9,
    isDefault: false,
  });

  function openAddRate() {
    setEditingRate(null);
    setRateFormData({
      rateName: '',
      monthlyRate: 0,
      dailyRate: 0,
      hourlyRate: 0,
      contractDaysPerMonth: 28,
      workHoursPerDay: 9,
      isDefault: machineryRates.length === 0,
    });
    setRateDialogOpen(true);
  }

  function openEditRate(rate: MachineryRate) {
    setEditingRate(rate);
    setRateFormData({
      rateName: rate.rateName,
      monthlyRate: rate.monthlyRate,
      dailyRate: rate.dailyRate,
      hourlyRate: rate.hourlyRate,
      contractDaysPerMonth: rate.contractDaysPerMonth,
      workHoursPerDay: rate.workHoursPerDay,
      isDefault: rate.isDefault,
    });
    setRateDialogOpen(true);
  }

  const rateFormMonthlyRate = rateFormData.monthlyRate;
  const rateFormContractDays = rateFormData.contractDaysPerMonth;
  const rateFormWorkHours = rateFormData.workHoursPerDay;

  useEffect(() => {
    if (rateFormMonthlyRate > 0 && rateFormContractDays > 0) {
      const daily = rateFormMonthlyRate / rateFormContractDays;
      const hrs = rateFormWorkHours > 0 ? rateFormWorkHours : 9;
      const hourly = daily / hrs;
      setRateFormData((prev) => ({
        ...prev,
        dailyRate: Math.round(daily * 100) / 100,
        hourlyRate: Math.round(hourly * 100) / 100,
      }));
    }
  }, [rateFormMonthlyRate, rateFormContractDays, rateFormWorkHours]);

  async function handleSaveRate() {
    if (!rateFormData.rateName.trim()) {
      toast.error('Rate name is required');
      return;
    }
    if (!editingMachinery) {
      toast.error('Save the machinery first, then add rate tiers');
      return;
    }
    try {
      if (editingRate) {
        await machineryApi.updateRate(editingMachinery.id, editingRate.id, rateFormData);
        toast.success('Rate updated');
      } else {
        await machineryApi.createRate(editingMachinery.id, rateFormData);
        toast.success('Rate created');
      }
      setRateDialogOpen(false);
      // Reload rates
      const res = await machineryApi.getRates(editingMachinery.id);
      setMachineryRates(res.data ?? []);
    } catch {
      toast.error('Failed to save rate');
    }
  }

  async function handleDeleteRate(rateId: string) {
    if (!editingMachinery) return;
    setDeletingRateId(rateId);
    try {
      await machineryApi.deleteRate(editingMachinery.id, rateId);
      toast.success('Rate deleted');
      const res = await machineryApi.getRates(editingMachinery.id);
      setMachineryRates(res.data ?? []);
    } catch {
      toast.error('Failed to delete rate');
    } finally {
      setDeletingRateId(null);
    }
  }

  const m: Machinery | null = editingMachinery;

  const handleIdImageSelect = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingIdImageFile(file);
    setIdImageSide(side);
    setPreviewRotation(0);
    setShowIdImageDialog(true);
  };

  const rotatePreview = (direction: 'left' | 'right') => {
    setPreviewRotation((prev) => {
      const delta = direction === 'left' ? -90 : 90;
      return (prev + delta + 360) % 360;
    });
  };

  const uploadPendingIdImage = async () => {
    if (!pendingIdImageFile || !m?.id) return;

    const side = idImageSide;
    const fileToUpload = await rotateCanvas(pendingIdImageFile, previewRotation);

    if (side === 'front') {
      setIsUploadingFront(true);
    } else {
      setIsUploadingBack(true);
    }

    try {
      const formData = new FormData();
      formData.append(side, fileToUpload);
      formData.append('machineryId', m.id);

      const res = await machineryApi.uploadDriverIdImage(m.id, formData);

      if (res.data) {
        const imagePath = side === 'front' ? res.data.front : res.data.back;
        if (imagePath) {
          const updates = side === 'front'
            ? { driverIdImageFront: imagePath }
            : { driverIdImageBack: imagePath };
          await machineryApi.update(m.id, updates);
          toast.success(`${side === 'front' ? 'Front' : 'Back'} ID image uploaded successfully`);
          // Refresh the editing machinery to pick up the new image paths
          const refreshed = await machineryApi.getById(m.id);
          if (refreshed.data) {
            useMachineryStore.setState({ editingMachinery: refreshed.data });
          }
        }
      } else {
        toast.error(res.error || 'Failed to upload image');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      if (side === 'front') {
        setIsUploadingFront(false);
      } else {
        setIsUploadingBack(false);
      }
      setShowIdImageDialog(false);
      setPendingIdImageFile(null);
      setPreviewRotation(0);
    }
  };

  const handleRemoveIdImage = async (side: 'front' | 'back') => {
    if (!m?.id) return;
    setIdImageToRemove(side);
    try {
      const updates = side === 'front'
        ? { driverIdImageFront: null }
        : { driverIdImageBack: null };
      await machineryApi.update(m.id, updates);
      toast.success(`${side === 'front' ? 'Front' : 'Back'} ID image removed`);
      const refreshed = await machineryApi.getById(m.id);
      if (refreshed.data) {
        useMachineryStore.setState({ editingMachinery: refreshed.data });
      }
    } catch {
      toast.error('Failed to remove image');
    } finally {
      setIdImageToRemove(null);
    }
  };

  const openImagePreview = (src: string, alt: string) => {
    setPreviewImageSrc(src);
    setPreviewImageAlt(alt);
    setShowImagePreview(true);
  };

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
              <FormField control={form.control} name="driverFatherName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Driver's Father Name</FormLabel>
                  <FormControl><Input placeholder="e.g., Mohammad" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="driverPhoneNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Driver's Phone Number</FormLabel>
                  <FormControl><Input placeholder="e.g., 0700123456" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="driverNationalId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Driver's ID Number</FormLabel>
                  <FormControl><Input placeholder="e.g., 12345678" {...field} value={field.value ?? ''} /></FormControl>
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

            {/* Rate Tiers */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Rate Tiers</h3>
            </div>

            {isEditing && editingMachinery ? (
              <>
                {loadingRates ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : machineryRates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rate tiers defined yet.</p>
                ) : (
                  <div className="space-y-2">
                    {machineryRates.map((rate) => (
                      <div key={rate.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{rate.rateName}</span>
                            {rate.isDefault && (
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Default</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Monthly: Afs {rate.monthlyRate.toLocaleString()} | Daily: Afs {rate.dailyRate.toLocaleString()} | Hourly: Afs {rate.hourlyRate.toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRate(rate)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => handleDeleteRate(rate.id)} disabled={deletingRateId === rate.id}>
                            {deletingRateId === rate.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" onClick={openAddRate} className="mt-2">
                  <Plus className="h-4 w-4 mr-1" /> Add Rate Tier
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Save this machinery first, then you can add rate tiers.</p>
            )}

            {/* Rate Tier Form Dialog */}
            <Dialog open={rateDialogOpen} onOpenChange={setRateDialogOpen}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>{editingRate ? 'Edit Rate Tier' : 'Add Rate Tier'}</DialogTitle>
                  <DialogDescription>Configure a rate tier for this machinery.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <label className="text-sm font-medium">Rate Name *</label>
                    <Input
                      placeholder="e.g., Hard Cutting, Soft Cutting"
                      className="mt-1"
                      value={rateFormData.rateName}
                      onChange={(e) => setRateFormData((prev) => ({ ...prev, rateName: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Monthly Rate</label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Afs</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="pl-7"
                          value={rateFormData.monthlyRate}
                          onChange={(e) => setRateFormData((prev) => ({ ...prev, monthlyRate: parseFloat(e.target.value) || 0 }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Contract Days/Month</label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={rateFormData.contractDaysPerMonth}
                        onChange={(e) => setRateFormData((prev) => ({ ...prev, contractDaysPerMonth: parseInt(e.target.value) || 28 }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Work Hours/Day</label>
                      <Input
                        type="number"
                        min="1"
                        max="24"
                        value={rateFormData.workHoursPerDay}
                        onChange={(e) => setRateFormData((prev) => ({ ...prev, workHoursPerDay: parseInt(e.target.value) || 9 }))}
                      />
                    </div>
                    <div />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Daily Rate (calc)</label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Afs</span>
                        <Input type="number" className="pl-7" value={rateFormData.dailyRate.toFixed(2)} readOnly disabled />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Hourly Rate (calc)</label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Afs</span>
                        <Input type="number" className="pl-7" value={rateFormData.hourlyRate.toFixed(2)} readOnly disabled />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">&nbsp;</label>
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rateFormData.isDefault}
                          onChange={(e) => setRateFormData((prev) => ({ ...prev, isDefault: e.target.checked }))}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">Set as default</span>
                      </label>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setRateDialogOpen(false)}>Cancel</Button>
                  <Button type="button" onClick={handleSaveRate} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {editingRate ? 'Update Rate' : 'Add Rate'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

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

            {/* Driver ID Documents */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Driver ID Documents</h3>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImageIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Driver's National ID
                </CardTitle>
                <CardDescription>Upload front and back of the driver's national ID</CardDescription>
              </CardHeader>
              <CardContent>
                {m?.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Front Image */}
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm font-medium">Front Side</p>
                      {m.driverIdImageFront ? (
                        <div className="relative w-full">
                          <img
                            src={m.driverIdImageFront}
                            alt="ID Front"
                            className="w-full h-48 rounded-lg border object-contain bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); openImagePreview(m.driverIdImageFront!, 'Front ID'); }}
                            title="Click to preview full image"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => { setIdImageSide('front'); setShowIdImageDialog(true); }}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Update Front
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => handleRemoveIdImage('front')}
                            disabled={idImageToRemove === 'front'}
                          >
                            {idImageToRemove === 'front' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4 mr-2" />
                            )}
                            Remove Front
                          </Button>
                        </div>
                      ) : (
                        <label
                          htmlFor="driver-id-front-upload"
                          className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          {isUploadingFront ? (
                            <>
                              <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mb-2" />
                              <span className="text-sm text-muted-foreground">Uploading...</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                              <span className="text-sm text-muted-foreground">Click to upload</span>
                              <span className="text-xs text-muted-foreground mt-1">JPEG, PNG (max 10MB)</span>
                            </>
                          )}
                        </label>
                      )}
                    </div>

                    {/* Back Image */}
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm font-medium">Back Side</p>
                      {m.driverIdImageBack ? (
                        <div className="relative w-full">
                          <img
                            src={m.driverIdImageBack}
                            alt="ID Back"
                            className="w-full h-48 rounded-lg border object-contain bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); openImagePreview(m.driverIdImageBack!, 'Back ID'); }}
                            title="Click to preview full image"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => { setIdImageSide('back'); setShowIdImageDialog(true); }}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Update Back
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => handleRemoveIdImage('back')}
                            disabled={idImageToRemove === 'back'}
                          >
                            {idImageToRemove === 'back' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4 mr-2" />
                            )}
                            Remove Back
                          </Button>
                        </div>
                      ) : (
                        <label
                          htmlFor="driver-id-back-upload"
                          className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          {isUploadingBack ? (
                            <>
                              <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mb-2" />
                              <span className="text-sm text-muted-foreground">Uploading...</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                              <span className="text-sm text-muted-foreground">Click to upload</span>
                              <span className="text-xs text-muted-foreground mt-1">JPEG, PNG (max 10MB)</span>
                            </>
                          )}
                        </label>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Save the machinery first to enable driver ID document upload.</p>
                )}
              </CardContent>
            </Card>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={closeForm} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Update Machinery' : 'Add Machinery'}
              </Button>
              {isEditing && (
                <Button type="button" variant="outline" onClick={closeForm} disabled={isLoading}>
                  Done
                </Button>
              )}
            </DialogFooter>
           </form>
         </Form>

         {/* Hidden file inputs for driver ID image upload */}
         <input
           key={pendingIdImageFile ? 'driver-front-has-file' : 'driver-front-no-file'}
           type="file"
           accept="image/jpeg,image/png"
           className="hidden"
           id="driver-id-front-upload"
           onChange={(e) => handleIdImageSelect(e, 'front')}
         />
         <input
           key={pendingIdImageFile ? 'driver-back-has-file' : 'driver-back-no-file'}
           type="file"
           accept="image/jpeg,image/png"
           className="hidden"
           id="driver-id-back-upload"
           onChange={(e) => handleIdImageSelect(e, 'back')}
         />

         {/* Driver ID Image Upload Dialog */}
         <Dialog open={showIdImageDialog} onOpenChange={(open) => {
           setShowIdImageDialog(open);
           if (!open) {
             setPendingIdImageFile(null);
             setPreviewRotation(0);
           }
         }}>
           <DialogContent className="sm:max-w-[500px]">
             <DialogHeader>
               <DialogTitle>Upload Driver ID Image - {idImageSide === 'front' ? 'Front' : 'Back'}</DialogTitle>
               <DialogDescription>
                 Upload a JPEG or PNG image of the driver's ID {idImageSide} side (max 10MB). Adjust rotation if needed.
               </DialogDescription>
             </DialogHeader>
             <div className="space-y-4 py-4">
               {!pendingIdImageFile ? (
                 <label
                   htmlFor={`driver-id-${idImageSide}-upload`}
                   className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                 >
                   <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                   <span className="text-sm text-muted-foreground">Click to select image</span>
                   <span className="text-xs text-muted-foreground mt-1">JPEG, PNG (max 10MB)</span>
                 </label>
               ) : (
                 <div className="flex flex-col items-center gap-3">
                   <div className="relative w-full h-48 rounded-lg border bg-muted overflow-hidden flex items-center justify-center">
                     <img
                       src={URL.createObjectURL(pendingIdImageFile)}
                       alt="Preview"
                       className="max-w-full max-h-full object-contain transition-transform duration-200"
                       style={{ transform: `rotate(${previewRotation}deg)` }}
                     />
                   </div>
                   <div className="flex items-center gap-2">
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => rotatePreview('left')}
                       disabled={idImageSide === 'front' ? isUploadingFront : isUploadingBack}
                     >
                       <RotateCcw className="h-4 w-4 mr-1" />
                       Rotate Left
                     </Button>
                     <span className="text-xs text-muted-foreground w-12 text-center">{previewRotation}°</span>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => rotatePreview('right')}
                       disabled={idImageSide === 'front' ? isUploadingFront : isUploadingBack}
                     >
                       <RotateCw className="h-4 w-4 mr-1" />
                       Rotate Right
                     </Button>
                   </div>
                   <label
                     htmlFor={`driver-id-${idImageSide}-upload`}
                     className="text-xs text-emerald-600 cursor-pointer hover:underline"
                   >
                     Choose a different image
                   </label>
                 </div>
               )}
             </div>
             <DialogFooter className="gap-2">
               <Button variant="outline" onClick={() => { setShowIdImageDialog(false); setPendingIdImageFile(null); setPreviewRotation(0); }}>
                 Cancel
               </Button>
               <Button
                 onClick={uploadPendingIdImage}
                 disabled={!pendingIdImageFile || (idImageSide === 'front' ? isUploadingFront : isUploadingBack)}
                 className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
               >
                 {(idImageSide === 'front' ? isUploadingFront : isUploadingBack) ? (
                   <Loader2 className="h-4 w-4 animate-spin" />
                 ) : (
                   <Upload className="h-4 w-4" />
                 )}
                 Upload Image
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>

         {/* Full Image Preview Dialog */}
         <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
           <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none">
           <DialogTitle className="sr-only">{previewImageAlt} Preview</DialogTitle>
           <div className="relative flex items-center justify-center w-full h-full">
             <img
               src={previewImageSrc}
               alt={previewImageAlt}
               className="max-w-full max-h-full rounded-lg"
             />
           </div>
         </DialogContent>
         </Dialog>
       </DialogContent>
     </Dialog>
   );
}
