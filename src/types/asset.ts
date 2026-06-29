export const ASSET_CATEGORIES = [
  'VEHICLE',
  'FUEL',
  'FURNITURE',
  'LAPTOP',
  'ELECTRONICS',
  'MACHINERY',
  'OFFICE_EQUIPMENT',
  'OTHER',
] as const;

export const ASSET_STATUSES = [
  'ACTIVE',
  'IN_USE',
  'UNDER_REPAIR',
  'SOLD',
  'LOST',
] as const;

export const FUEL_TRANSACTION_TYPES = ['PURCHASE', 'TRANSFER', 'ISSUE'] as const;

export const MAINTENANCE_TYPES = [
  'ROUTINE',
  'REPAIR',
  'INSPECTION',
  'TIRE_REPLACEMENT',
  'OIL_CHANGE',
  'BATTERY',
  'OTHER',
] as const;

export const LOG_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type FuelTransactionType = (typeof FUEL_TRANSACTION_TYPES)[number];
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];
export type LogStatus = (typeof LOG_STATUSES)[number];

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  purchaseDate: string;
  purchasePrice: number;
  currentValue: number;
  quantity: number;
  serialNumber?: string | null;
  plateNumber?: string | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; fullName: string; jobTitle: string } | null;
  status: AssetStatus;
  notes?: string | null;
  images?: string | null;
  fuelType?: string | null;
  fuelCapacity?: number | null;
  fuelLocation?: string | null;
  isMainContainer?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    maintenanceRecords: number;
    assetLogs: number;
    fuelTransactions: number;
  };
}

export interface AssetFormData {
  name: string;
  category: AssetCategory;
  purchaseDate: string;
  purchasePrice: number;
  currentValue: number;
  quantity?: number;
  serialNumber?: string;
  plateNumber?: string;
  assignedToId?: string;
  status?: AssetStatus;
  notes?: string;
  images?: string;
  fuelType?: string;
  fuelCapacity?: number;
  fuelLocation?: string;
  isMainContainer?: boolean;
}

export interface AssetFilters {
  search?: string;
  categories?: AssetCategory[];
  statuses?: AssetStatus[];
  assignedToId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface FuelTransaction {
  id: string;
  type: FuelTransactionType;
  fuelType: string;
  quantity: number;
  unitPrice?: number | null;
  totalCost?: number | null;
  supplier?: string | null;
  assetId?: string | null;
  asset?: { id: string; name: string; category: string } | null;
  containerId?: string | null;
  container?: { id: string; name: string; fuelLocation?: string | null; isMainContainer?: boolean } | null;
  destinationContainerId?: string | null;
  destinationContainer?: { id: string; name: string; fuelLocation?: string | null } | null;
  contractorId?: string | null;
  contractor?: { id: string; contractorName: string } | null;
  machineryId?: string | null;
  machinery?: { id: string; machineryName: string; plateNumber?: string | null } | null;
  issuedToName?: string | null;
  notes?: string | null;
  date: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FuelTransactionFilters {
  type?: string;
  fuelType?: string;
  assetId?: string;
  containerId?: string;
  contractorId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}

export interface FuelTransactionFormData {
  type: FuelTransactionType;
  fuelType: string;
  quantity: number;
  unitPrice?: number;
  totalCost?: number;
  supplier?: string;
  assetId?: string;
  containerId?: string;
  destinationContainerId?: string;
  contractorId?: string;
  machineryId?: string;
  issuedToName?: string;
  notes?: string;
  date?: string;
}

export interface FuelStock {
  fuelType: string;
  totalPurchased: number;
  totalIssued: number;
  balance: number;
}

export interface FuelContainerStock {
  containerId: string;
  containerName: string;
  fuelLocation?: string | null;
  isMainContainer: boolean;
  fuelType: string;
  fuelCapacity?: number | null;
  totalPurchased: number;
  totalTransferredIn: number;
  totalTransferredOut: number;
  totalIssued: number;
  balance: number;
  usagePercent: number;
}

export interface MaintenanceRecord {
  id: string;
  assetId: string;
  asset?: { id: string; name: string; category: string; plateNumber?: string | null } | null;
  serviceDate: string;
  serviceType: MaintenanceType;
  cost: number;
  description?: string | null;
  vendor?: string | null;
  nextServiceDate?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceRecordFormData {
  assetId: string;
  serviceDate: string;
  serviceType: MaintenanceType;
  cost: number;
  description?: string;
  vendor?: string;
  nextServiceDate?: string;
  notes?: string;
}

export interface AssetLog {
  id: string;
  assetId: string;
  asset?: { id: string; name: string; category: string; plateNumber?: string | null } | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  operatorId?: string | null;
  operator?: { id: string; fullName: string } | null;
  startOdometer?: number | null;
  endOdometer?: number | null;
  distanceTraveled?: number | null;
  engineHoursStart?: number | null;
  engineHoursEnd?: number | null;
  engineHoursUsed?: number | null;
  fuelConsumed?: number | null;
  workSite?: string | null;
  project?: string | null;
  conditions?: string | null;
  issues?: string | null;
  status: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  remarks?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetLogFormData {
  assetId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  operatorId?: string;
  startOdometer?: number;
  endOdometer?: number;
  distanceTraveled?: number;
  engineHoursStart?: number;
  engineHoursEnd?: number;
  engineHoursUsed?: number;
  fuelConsumed?: number;
  workSite?: string;
  project?: string;
  conditions?: string;
  issues?: string;
  status?: string;
  remarks?: string;
}

export interface AssetLogStats {
  totalLogs: number;
  totalDistance: number;
  totalFuelConsumed: number;
  totalEngineHours: number;
  avgFuelEfficiency: number;
  monthlyDistance: { month: string; distance: number }[];
  assetSummary: { assetId: string; assetName: string; totalDistance: number; totalFuel: number; totalHours: number; logCount: number }[];
}

export interface AssetDashboardStats {
  totalAssets: number;
  assetsByCategory: { category: string; count: number }[];
  assetsByStatus: { status: string; count: number }[];
  fuelStock: FuelStock[];
  underMaintenanceCount: number;
  monthlyMaintenanceCost: { month: string; cost: number }[];
  monthlyFuelConsumption: { month: string; quantity: number }[];
  totalAssetValue: number;
}

export interface FuelMachineryCategorySummary {
  machineryType: string;
  machineryCount: number;
  totalQty: number;
  totalCost: number;
}

export interface AllMachineryFuelUsage {
  machineryId: string;
  machineryName: string;
  machineryType: string;
  plateNumber: string | null;
  contractorName: string;
  status: string;
  totalQty: number;
  totalCost: number;
}

export interface FuelFinancialSummary {
  totalPurchasedQty: number;
  totalPurchasedCost: number;
  totalIssuedQty: number;
  totalIssuedCost: number;
  remainingQty: number;
  remainingValue: number;
  avgUnitPrice: number;
  byMachinery: {
    machineryId: string;
    machineryName: string;
    machineryType: string;
    contractorName: string;
    plateNumber: string | null;
    totalQty: number;
    totalCost: number;
    issues: FuelTransaction[];
  }[];
  byMachineryCategory: FuelMachineryCategorySummary[];
  allMachineryUsage: AllMachineryFuelUsage[];
  purchaseTransactions: FuelTransaction[];
  allTransactions: FuelTransaction[];
}

// Label mappings
export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  VEHICLE: 'Vehicle',
  FUEL: 'Fuel',
  FURNITURE: 'Furniture',
  LAPTOP: 'Laptop',
  ELECTRONICS: 'Electronics',
  MACHINERY: 'Machinery',
  OFFICE_EQUIPMENT: 'Office Equipment',
  OTHER: 'Other',
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  ACTIVE: 'Active',
  IN_USE: 'In Use',
  UNDER_REPAIR: 'Under Repair',
  SOLD: 'Sold',
  LOST: 'Lost',
};

export const FUEL_TRANSACTION_TYPE_LABELS: Record<FuelTransactionType, string> = {
  PURCHASE: 'Purchase',
  TRANSFER: 'Transfer',
  ISSUE: 'Issue',
};

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  ROUTINE: 'Routine',
  REPAIR: 'Repair',
  INSPECTION: 'Inspection',
  TIRE_REPLACEMENT: 'Tire Replacement',
  OIL_CHANGE: 'Oil Change',
  BATTERY: 'Battery',
  OTHER: 'Other',
};

export const LOG_STATUS_LABELS: Record<LogStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const LOG_STATUS_COLORS: Record<LogStatus, string> = {
  PENDING: '#f59e0b',
  APPROVED: '#10b981',
  REJECTED: '#ef4444',
};

export const ASSET_CATEGORY_COLORS: Record<AssetCategory, string> = {
  VEHICLE: '#8b5cf6',
  FUEL: '#f59e0b',
  FURNITURE: '#10b981',
  LAPTOP: '#3b82f6',
  ELECTRONICS: '#ec4899',
  MACHINERY: '#ef4444',
  OFFICE_EQUIPMENT: '#6366f1',
  OTHER: '#78716c',
};

export const ASSET_STATUS_COLORS: Record<AssetStatus, string> = {
  ACTIVE: '#10b981',
  IN_USE: '#3b82f6',
  UNDER_REPAIR: '#f59e0b',
  SOLD: '#ef4444',
  LOST: '#78716c',
};
