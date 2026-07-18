'use client';

import { useEffect, useState } from 'react';
import { useAssetStore } from '@/hooks/use-asset-store';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Package, Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  ASSET_CATEGORY_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_STATUS_COLORS,
  type Asset,
} from '@/types/asset';
import { assetsApi, maintenanceApi, assetLogApi, fuelApi } from '@/services/asset-api';
import type { MaintenanceRecord, AssetLog, FuelTransaction } from '@/types/asset';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { formatCurrency } from '@/lib/utils';

export function AssetDetailPage() {
  const viewingAssetId = useAssetStore((s) => s.viewingAssetId);
  const setActiveView = useAssetStore((s) => s.setActiveView);
  const setEditingAsset = useAssetStore((s) => s.setEditingAsset);
  const deleteAsset = useAssetStore((s) => s.deleteAsset);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [logs, setLogs] = useState<AssetLog[]>([]);
  const [fuelIssues, setFuelIssues] = useState<FuelTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { canEdit, canDelete } = usePermissions();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!viewingAssetId) return;
    setLoading(true);
    Promise.all([
      assetsApi.getById(viewingAssetId),
      maintenanceApi.getAll({ assetId: viewingAssetId, pageSize: 50 }),
      assetLogApi.getAll({ assetId: viewingAssetId, pageSize: 20 }),
      fuelApi.getAll({ assetId: viewingAssetId, type: 'ISSUE', pageSize: 20 }),
    ])
      .then(([assetRes, maintRes, logRes, fuelRes]) => {
        if (assetRes.data) setAsset(assetRes.data as Asset);
        if (maintRes.data) setMaintenance(maintRes.data.data);
        if (logRes.data) setLogs(logRes.data.data);
        if (fuelRes.data) setFuelIssues(fuelRes.data.data);
      })
      .finally(() => setLoading(false));
  }, [viewingAssetId]);

  const handleEdit = () => {
    if (asset) {
      setEditingAsset(asset);
      setActiveView('edit');
    }
  };

  const handleDelete = async () => {
    if (!asset) return;
    try {
      await deleteAsset(asset.id);
      toast.success('Asset deleted');
      setActiveView('list');
    } catch {
      toast.error('Failed to delete asset');
    }
    setDeleteConfirm(false);
  };

  if (loading || !asset) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const statusColor = ASSET_STATUS_COLORS[asset.status as keyof typeof ASSET_STATUS_COLORS] || '#78716c';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setActiveView('list')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Package className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              {asset.name}
            </h1>
            <p className="text-muted-foreground mt-1">
              {ASSET_CATEGORY_LABELS[asset.category]} &middot; Qty: {asset.quantity}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit('assets') && (
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
          {canDelete('assets') && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant="outline"
              className="border-0 text-base"
              style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
            >
              {ASSET_STATUS_LABELS[asset.status] || asset.status}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Purchase Price</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(asset.purchasePrice)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(asset.currentValue)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Purchase Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{new Date(asset.purchaseDate).toLocaleDateString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assigned To</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{asset.assignedTo?.fullName || 'Not assigned'}</p>
            {asset.assignedTo && (
              <p className="text-sm text-muted-foreground">{asset.assignedTo.jobTitle}</p>
            )}
          </CardContent>
        </Card>
        {asset.plateNumber && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Plate Number</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono">{asset.plateNumber}</p>
            </CardContent>
          </Card>
        )}
        {asset.serialNumber && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Serial Number</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono">{asset.serialNumber}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {asset.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{asset.notes}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="maintenance">
        <TabsList>
          <TabsTrigger value="maintenance">Maintenance ({maintenance.length})</TabsTrigger>
          <TabsTrigger value="logs">Usage Logs ({logs.length})</TabsTrigger>
          <TabsTrigger value="fuel">Fuel Issued ({fuelIssues.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance" className="mt-4">
          {maintenance.length === 0 ? (
            <p className="text-muted-foreground py-4">No maintenance records</p>
          ) : (
            <div className="space-y-3">
              {maintenance.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-medium">{r.serviceType}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(r.serviceDate).toLocaleDateString()}
                        {r.vendor && ` - ${r.vendor}`}
                      </p>
                      {r.nextServiceDate && (
                        <p className="text-xs text-amber-500">
                          Next service: {new Date(r.nextServiceDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <p className="font-semibold">{formatCurrency(r.cost)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          {logs.length === 0 ? (
            <p className="text-muted-foreground py-4">No usage logs</p>
          ) : (
            <div className="space-y-3">
              {logs.map((l) => (
                <Card key={l.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between">
                      <div>
                        <p className="font-medium">{new Date(l.date).toLocaleDateString()}</p>
                        <p className="text-sm text-muted-foreground">
                          Operator: {l.operator?.fullName || 'N/A'}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        {l.startOdometer !== null && (
                          <p>Odometer: {l.startOdometer} - {l.endOdometer} km</p>
                        )}
                        {l.distanceTraveled !== null && (
                          <p>Distance: {l.distanceTraveled} km</p>
                        )}
                        {l.fuelConsumed !== null && (
                          <p>Fuel: {l.fuelConsumed} L</p>
                        )}
                      </div>
                    </div>
                    {l.workSite && <p className="text-xs text-muted-foreground mt-1">Site: {l.workSite}</p>}
                    {l.remarks && <p className="text-xs text-muted-foreground">{l.remarks}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="fuel" className="mt-4">
          {fuelIssues.length === 0 ? (
            <p className="text-muted-foreground py-4">No fuel issued to this asset</p>
          ) : (
            <div className="space-y-3">
              {fuelIssues.map((f) => (
                <Card key={f.id}>
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-medium">{f.fuelType}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(f.date).toLocaleDateString()}
                        {f.issuedToName && ` - ${f.issuedToName}`}
                      </p>
                    </div>
                    <p className="font-semibold">{f.quantity} L</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title="Delete Asset"
        description={`Are you sure you want to delete "${asset.name}"? This will also remove all associated maintenance records, logs, and fuel transactions.`}
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
}
