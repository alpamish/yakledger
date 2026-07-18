'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAssetStore } from '@/hooks/use-asset-store';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Eye, Pencil, Trash2, Search, ArrowUpDown } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ASSET_CATEGORY_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_STATUS_COLORS,
  type Asset,
} from '@/types/asset';
import { formatCurrency } from '@/lib/utils';

interface AssetTableProps {
  data: Asset[];
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  onView: (asset: Asset) => void;
}

export function AssetTable({ data, onEdit, onDelete, onView }: AssetTableProps) {
  const { canEdit, canDelete } = usePermissions();
  const filters = useAssetStore((s) => s.assetFilters);
  const pagination = useAssetStore((s) => s.assetPagination);
  const sorting = useAssetStore((s) => s.assetSorting);
  const setAssetFilters = useAssetStore((s) => s.setAssetFilters);
  const setAssetPage = useAssetStore((s) => s.setAssetPage);
  const setAssetSorting = useAssetStore((s) => s.setAssetSorting);
  const isLoading = useAssetStore((s) => s.isLoading);

  const [searchValue, setSearchValue] = useState(filters.search || '');

  const handleSearch = useCallback(
    (value: string) => {
      setSearchValue(value);
      const timer = setTimeout(() => {
        setAssetFilters({ search: value || undefined });
        useAssetStore.getState().fetchAssets();
      }, 300);
      return () => clearTimeout(timer);
    },
    [setAssetFilters]
  );

  const handleCategoryFilter = useCallback(
    (value: string) => {
      setAssetFilters({ categories: value ? [value as never] : undefined });
      setTimeout(() => useAssetStore.getState().fetchAssets(), 0);
    },
    [setAssetFilters]
  );

  const handleStatusFilter = useCallback(
    (value: string) => {
      setAssetFilters({ statuses: value ? [value as never] : undefined });
      setTimeout(() => useAssetStore.getState().fetchAssets(), 0);
    },
    [setAssetFilters]
  );

  const handleSort = useCallback(
    (column: string) => {
      const newOrder = sorting.sortBy === column && sorting.sortOrder === 'asc' ? 'desc' : 'asc';
      setAssetSorting(column, newOrder);
      setTimeout(() => useAssetStore.getState().fetchAssets(), 0);
    },
    [sorting, setAssetSorting]
  );

  const totalPages = pagination.totalPages;
  const currentPage = pagination.page;

  const getStatusBadge = (status: string) => {
    const color = ASSET_STATUS_COLORS[status as keyof typeof ASSET_STATUS_COLORS] || '#78716c';
    return (
      <Badge
        variant="outline"
        className="border-0"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {ASSET_STATUS_LABELS[status as keyof typeof ASSET_STATUS_LABELS] || status}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={filters.categories?.[0] || ''}
          onValueChange={handleCategoryFilter}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(ASSET_CATEGORY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.statuses?.[0] || ''}
          onValueChange={handleStatusFilter}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(ASSET_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3" onClick={() => handleSort('name')}>
                  Name <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3" onClick={() => handleSort('purchasePrice')}>
                  Purchase Price <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Current Value</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No assets found
                </TableCell>
              </TableRow>
            ) : (
              data.map((asset) => (
                <TableRow key={asset.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onView(asset)}>
                  <TableCell className="font-medium">{asset.name}</TableCell>
                  <TableCell>{ASSET_CATEGORY_LABELS[asset.category] || asset.category}</TableCell>
                  <TableCell>{getStatusBadge(asset.status)}</TableCell>
                  <TableCell>{formatCurrency(asset.purchasePrice)}</TableCell>
                  <TableCell>{formatCurrency(asset.currentValue)}</TableCell>
                  <TableCell>{asset.assignedTo?.fullName || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => onView(asset)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canEdit('assets') && (
                        <Button variant="ghost" size="icon" onClick={() => onEdit(asset)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete('assets') && (
                        <Button variant="ghost" size="icon" onClick={() => onDelete(asset)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => {
                  if (currentPage > 1) {
                    setAssetPage(currentPage - 1);
                    setTimeout(() => useAssetStore.getState().fetchAssets(), 0);
                  }
                }}
                className={currentPage <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
              .map((p, idx, arr) => (
                <PaginationItem key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1">...</span>}
                  <PaginationLink
                    isActive={p === currentPage}
                    onClick={() => {
                      setAssetPage(p);
                      setTimeout(() => useAssetStore.getState().fetchAssets(), 0);
                    }}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => {
                  if (currentPage < totalPages) {
                    setAssetPage(currentPage + 1);
                    setTimeout(() => useAssetStore.getState().fetchAssets(), 0);
                  }
                }}
                className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
