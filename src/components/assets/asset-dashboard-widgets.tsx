'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Fuel, Wrench, DollarSign, TrendingDown } from 'lucide-react';
import { assetsApi, fuelApi, maintenanceApi } from '@/services/asset-api';
import type { AssetDashboardStats, FuelStock, FuelContainerStock } from '@/types/asset';
import { ASSET_CATEGORY_LABELS, ASSET_CATEGORY_COLORS } from '@/types/asset';
import { FUEL_TYPE_LABELS, FUEL_TYPE_COLORS } from '@/types/contractor';

export function AssetDashboardWidgets() {
  const [stats, setStats] = useState<AssetDashboardStats | null>(null);
  const [fuelStock, setFuelStock] = useState<FuelStock[]>([]);
  const [containerStock, setContainerStock] = useState<FuelContainerStock[]>([]);

  useEffect(() => {
    assetsApi.getDashboard().then((res) => {
      if (res.data) setStats(res.data);
    });
    fuelApi.getStock().then((res) => {
      if (res.data) {
        setFuelStock(res.data.stock);
        setContainerStock(res.data.containerStock);
      }
    });
  }, []);

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Assets */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
            <Package className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalAssets}</p>
            <p className="text-xs text-muted-foreground">
              Value: ${stats.totalAssetValue.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        {/* Fuel Stock */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Fuel Stock</CardTitle>
            <Fuel className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {fuelStock.reduce((sum, s) => sum + s.balance, 0).toFixed(0)} L
            </p>
            <p className="text-xs text-muted-foreground">Across {fuelStock.length} fuel types</p>
          </CardContent>
        </Card>

        {/* Under Maintenance */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Under Maintenance</CardTitle>
            <Wrench className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.underMaintenanceCount}</p>
            <p className="text-xs text-muted-foreground">
              {stats.underMaintenanceCount > 0 ? 'Assets need attention' : 'All assets operational'}
            </p>
          </CardContent>
        </Card>

        {/* Monthly Maintenance Cost */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Maintenance</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${stats.monthlyMaintenanceCost[stats.monthlyMaintenanceCost.length - 1]?.cost.toLocaleString() || '0'}
            </p>
            <p className="text-xs text-muted-foreground">Current month</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assets by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.assetsByCategory.map((item) => {
                const color = ASSET_CATEGORY_COLORS[item.category as keyof typeof ASSET_CATEGORY_COLORS] || '#78716c';
                const percentage = stats.totalAssets > 0 ? (item._count / stats.totalAssets) * 100 : 0;
                return (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{ASSET_CATEGORY_LABELS[item.category as keyof typeof ASSET_CATEGORY_LABELS] || item.category}</span>
                      <span className="font-medium">{item._count}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percentage}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Fuel Stock Detail */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Fuel Stock Detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {containerStock.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">PER CONTAINER</p>
                <div className="space-y-3">
                  {containerStock.map((c) => {
                    const color = FUEL_TYPE_COLORS[c.fuelType as keyof typeof FUEL_TYPE_COLORS] || '#78716c';
                    const maxBalance = Math.max(...containerStock.map((x) => x.balance), 1);
                    const percentage = (c.balance / maxBalance) * 100;
                    return (
                      <div key={c.containerId} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            {c.containerName}
                            {c.isMainContainer && <span className="text-[10px] text-muted-foreground">(Main)</span>}
                          </span>
                          <span className="font-medium">{c.balance.toFixed(1)} L</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(percentage, 2)}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {fuelStock.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">BY FUEL TYPE</p>
                {fuelStock.map((s) => {
                  const color = FUEL_TYPE_COLORS[s.fuelType as keyof typeof FUEL_TYPE_COLORS] || '#78716c';
                  const maxBalance = Math.max(...fuelStock.map((x) => x.balance), 1);
                  const percentage = (s.balance / maxBalance) * 100;
                  return (
                    <div key={s.fuelType} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          {FUEL_TYPE_LABELS[s.fuelType as keyof typeof FUEL_TYPE_LABELS] || s.fuelType}
                        </span>
                        <span className="font-medium">{s.balance.toFixed(1)} L</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.max(percentage, 2)}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {containerStock.length === 0 && fuelStock.length === 0 && (
              <p className="text-muted-foreground text-sm">No fuel stock recorded</p>
            )}
          </CardContent>
        </Card>

        {/* Monthly Maintenance Cost Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly Maintenance Cost</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.monthlyMaintenanceCost.length === 0 ? (
              <p className="text-muted-foreground text-sm">No maintenance data</p>
            ) : (
              <div className="space-y-2">
                {stats.monthlyMaintenanceCost.map((item) => {
                  const maxCost = Math.max(...stats.monthlyMaintenanceCost.map((x) => x.cost), 1);
                  const percentage = (item.cost / maxCost) * 100;
                  return (
                    <div key={item.month} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-xs">{item.month}</span>
                        <span className="font-medium text-xs">${item.cost.toLocaleString()}</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.max(percentage, 1)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Fuel Consumption */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly Fuel Consumption</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.monthlyFuelConsumption.length === 0 ? (
              <p className="text-muted-foreground text-sm">No fuel consumption data</p>
            ) : (
              <div className="space-y-2">
                {stats.monthlyFuelConsumption.map((item) => {
                  const maxQty = Math.max(...stats.monthlyFuelConsumption.map((x) => x.quantity), 1);
                  const percentage = (item.quantity / maxQty) * 100;
                  return (
                    <div key={item.month} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-xs">{item.month}</span>
                        <span className="font-medium text-xs">{item.quantity.toFixed(0)} L</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all"
                          style={{ width: `${Math.max(percentage, 1)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
