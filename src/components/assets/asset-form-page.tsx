'use client';

import { useAssetStore } from '@/hooks/use-asset-store';
import { AssetForm, type AssetFormValues } from './asset-form';
import { ArrowLeft, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import type { AssetFormData } from '@/types/asset';

export function AssetFormPage() {
  const activeView = useAssetStore((s) => s.activeView);
  const editingAsset = useAssetStore((s) => s.editingAsset);
  const setActiveView = useAssetStore((s) => s.setActiveView);
  const createAsset = useAssetStore((s) => s.createAsset);
  const updateAsset = useAssetStore((s) => s.updateAsset);
  const isLoading = useAssetStore((s) => s.isLoading);

  const isEditing = activeView === 'edit' && editingAsset;

  const handleSubmit = async (data: AssetFormValues) => {
    try {
      if (isEditing && editingAsset) {
        await updateAsset(editingAsset.id, data as AssetFormData);
        toast.success('Asset updated successfully');
      } else {
        await createAsset(data as AssetFormData);
        toast.success('Asset created successfully');
      }
    } catch {
      toast.error(isEditing ? 'Failed to update asset' : 'Failed to create asset');
    }
  };

  const defaultValues = editingAsset
    ? {
        name: editingAsset.name,
        category: editingAsset.category,
        purchaseDate: editingAsset.purchaseDate?.split('T')[0] || '',
        purchasePrice: editingAsset.purchasePrice,
        currentValue: editingAsset.currentValue,
        quantity: editingAsset.quantity,
        serialNumber: editingAsset.serialNumber || '',
        plateNumber: editingAsset.plateNumber || '',
        assignedToId: editingAsset.assignedToId || '',
        status: editingAsset.status,
        notes: editingAsset.notes || '',
        fuelType: editingAsset.fuelType || undefined,
        fuelCapacity: editingAsset.fuelCapacity ?? undefined,
        fuelLocation: editingAsset.fuelLocation || '',
        isMainContainer: editingAsset.isMainContainer ?? false,
      }
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setActiveView('list')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            {isEditing ? 'Edit Asset' : 'Create Asset'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditing ? 'Update asset information' : 'Add a new company asset'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Details' : 'Asset Details'}</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetForm
            key={isEditing ? editingAsset.id : 'create'}
            defaultValues={defaultValues}
            onSubmit={handleSubmit}
            isSubmitting={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
