'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAssetStore } from '@/hooks/use-asset-store';
import { AssetTable } from './asset-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Download, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import type { Asset } from '@/types/asset';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';

export function AssetsListPage() {
  const { canCreate, canEdit, canDelete, hasPermission } = usePermissions();
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
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  const handleDownloadPDF = useCallback(async () => {
    if (!hasPermission('reports:generatePdf')) return;
    setIsPdfGenerating(true);
    try {
      const { default: AssetsListPDFDocument } = await import('@/components/pdf/assets-list-pdf-document');
      const { pdf } = await import('@react-pdf/renderer');
      const blob = await pdf(
        <AssetsListPDFDocument
          assets={assets}
          generatedAt={new Date()}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `assets-list-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Assets list PDF downloaded successfully');
    } catch (err) {
      console.error('Error generating assets list PDF:', err);
      toast.error('Failed to generate assets list PDF');
    } finally {
      setIsPdfGenerating(false);
    }
  }, [assets, hasPermission]);

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
          <div className="flex gap-2">
            {hasPermission('reports:generatePdf') && (
              <Button
                onClick={handleDownloadPDF}
                disabled={isPdfGenerating}
                variant="outline"
                className="border-emerald-600 text-emerald-600 hover:bg-emerald-50"
              >
                {isPdfGenerating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isPdfGenerating ? 'Generating...' : 'PDF'}
              </Button>
            )}
            <Button
              onClick={() => setActiveView('create')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Asset
            </Button>
          </div>
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
