'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAssetStore } from '@/hooks/use-asset-store';
import { AssetTable } from './asset-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { Asset } from '@/types/asset';
import { usePermissions } from '@/hooks/use-permissions';

export function AssetsListPage() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const assets = useAssetStore((s) => s.assets);
  const fetchAssets = useAssetStore((s) => s.fetchAssets);
  const setActiveView = useAssetStore((s) => s.setActiveView);
  const deleteAsset = useAssetStore((s) => s.deleteAsset);
  const setViewingAssetId = useAssetStore((s) => s.setViewingAssetId);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; asset: Asset | null }>({
    open: false,
    asset: null,
  });

  const handleEdit = useCallback(
    (asset: Asset) => {
      if (!canEdit('assets')) return;
      useAssetStore.getState().setEditingAsset(asset);
      setActiveView('edit');
    },
    [setActiveView, canEdit]
  );

  const handleDelete = useCallback((asset: Asset) => {
    if (!canDelete('assets')) return;
    setDeleteConfirm({ open: true, asset });
  }, [canDelete]);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteConfirm.asset) {
      await deleteAsset(deleteConfirm.asset.id);
    }
    setDeleteConfirm({ open: false, asset: null });
  }, [deleteConfirm.asset, deleteAsset]);

  const handleView = useCallback(
    (asset: Asset) => {
      setViewingAssetId(asset.id);
      setActiveView('detail');
    },
    [setViewingAssetId, setActiveView]
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold">All Assets</h2>
          <p className="text-sm text-muted-foreground">
            View and manage all company assets
          </p>
        </div>
        {canCreate('assets') && (
          <Button
            onClick={() => setActiveView('create')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Asset
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <AssetTable
            data={assets}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onView={handleView}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) =>
          setDeleteConfirm({ open, asset: open ? deleteConfirm.asset : null })
        }
        title="Delete Asset"
        description={
          deleteConfirm.asset
            ? `Are you sure you want to delete "${deleteConfirm.asset.name}"? This action cannot be undone.`
            : 'Are you sure you want to delete this asset?'
        }
        onConfirm={handleDeleteConfirm}
        confirmText="Delete"
        variant="destructive"
      />
    </>
  );
}
