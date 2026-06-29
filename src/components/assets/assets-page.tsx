'use client';

import { useEffect } from 'react';
import { useAssetStore } from '@/hooks/use-asset-store';
import { AssetsListPage } from './assets-list-page';
import { AssetFormPage } from './asset-form-page';
import { AssetDetailPage } from './asset-detail-page';
import { FuelPage } from '../fuel/fuel-page';
import { MaintenancePage } from '../maintenance/maintenance-page';
import { AssetLogsPage } from '../asset-logs/asset-logs-page';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, Fuel, Wrench, ClipboardList } from 'lucide-react';

export function AssetsPage() {
  const activeView = useAssetStore((s) => s.activeView);
  const setActiveView = useAssetStore((s) => s.setActiveView);

  useEffect(() => {
    useAssetStore.getState().fetchAssets();
    useAssetStore.getState().fetchFuelStock();
  }, []);

  if (activeView === 'create' || activeView === 'edit') {
    return <AssetFormPage />;
  }

  if (activeView === 'detail') {
    return <AssetDetailPage />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Assets
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage company assets, fuel stock, maintenance, and usage logs
          </p>
        </div>
      </div>

      <Tabs defaultValue="assets" className="w-full">
        <TabsList>
          <TabsTrigger value="assets" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            All Assets
          </TabsTrigger>
          <TabsTrigger value="fuel" className="flex items-center gap-2">
            <Fuel className="h-4 w-4" />
            Fuel Stock
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Maintenance
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Usage Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-6">
          <AssetsListPage />
        </TabsContent>

        <TabsContent value="fuel" className="mt-6">
          <FuelPage />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-6">
          <MaintenancePage />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <AssetLogsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
