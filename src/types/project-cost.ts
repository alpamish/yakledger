export interface ProjectCostDetail {
  name: string;
  paid: number;
  unpaid: number;
  total: number;
}

export interface ProjectCostExpenses {
  total: number;
}

export interface ProjectCostMachinery {
  paid: number;
  unpaid: number;
  total: number;
}

export interface ProjectCostEmployeeSalaries {
  paid: number;
  unpaid: number;
  total: number;
}

export interface ProjectCostContractorPayments {
  paid: number;
  remaining: number;
  total: number;
}

export interface ProjectCostFuel {
  total: number;
  byFuelType: { fuelType: string; total: number }[];
}

export interface ProjectCostAssetPurchases {
  total: number;
}

export interface ProjectCostCashAdvances {
  total: number;
  remaining: number;
}

export interface ProjectCostWalletTransfers {
  total: number;
}

export interface ProjectCostDetails {
  employeeSalaries?: ProjectCostDetail[];
  machinery?: ProjectCostDetail[];
  contractorPayments?: ProjectCostDetail[];
  cashAdvances?: ProjectCostDetail[];
  fuelCost?: ProjectCostDetail[];
}

export interface CostMonthlyTrend {
  month: string;
  expenses: number;
  fuelCost: number;
  machineryCost: number;
  contractorCost: number;
}

export interface ExpenseBreakdownItem {
  category: string;
  amount: number;
  color: string;
  count: number;
}

export interface ProjectCostChartData {
  name: string;
  value: number;
  color: string;
}

export interface ProjectCostData {
  expenses: ProjectCostExpenses;
  machinery: ProjectCostMachinery;
  employeeSalaries: ProjectCostEmployeeSalaries;
  contractorPayments: ProjectCostContractorPayments;
  fuelCost: ProjectCostFuel;
  assetPurchases: ProjectCostAssetPurchases;
  cashAdvances: ProjectCostCashAdvances;
  walletTransfers: ProjectCostWalletTransfers;
  details: ProjectCostDetails;
  monthlyTrend: CostMonthlyTrend[];
  byCategory: ProjectCostChartData[];
  expenseBreakdown: ExpenseBreakdownItem[];
  lastUpdated: string;
}

export interface ProjectCostResponse {
  success: boolean;
  data?: ProjectCostData;
  error?: string;
}

export const PROJECT_COST_COLORS: Record<string, string> = {
  expenses: '#3b82f6',
  machinery: '#8b5cf6',
  employeeSalaries: '#10b981',
  contractorPayments: '#f59e0b',
  fuelCost: '#ef4444',
  assetPurchases: '#ec4899',
  cashAdvances: '#06b6d4',
  walletTransfers: '#78716c',
};

export const FUEL_TYPE_LABELS: Record<string, string> = {
  DIESEL: 'Diesel',
  GASOLINE: 'Petrol',
  LPG: 'LPG',
  CNG: 'CNG',
  OTHER: 'Other',
};

export function fuelTypeLabel(type: string): string {
  return FUEL_TYPE_LABELS[type] ?? type;
}
