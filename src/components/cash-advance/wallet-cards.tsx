'use client';

import * as React from 'react';
import { Wallet, TrendingDown, TrendingUp, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cashAdvanceApi } from '@/services/api';
import type { EmployeeCashAccount } from '@/types/expense';

interface WalletCardsProps {
  onSelectEmployee?: (employeeId: string) => void;
}

export function WalletCards({ onSelectEmployee }: WalletCardsProps) {
  const [accounts, setAccounts] = React.useState<EmployeeCashAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadWallets();
  }, []);

  async function loadWallets() {
    try {
      setLoading(true);
      const res = await cashAdvanceApi.getEmployeeWallets();
      if (res.success && res.data) {
        setAccounts(res.data);
      }
    } catch (err) {
      setError('Failed to load wallets');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">{error}</CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No employee wallets found. Issue a cash advance to create one.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {accounts.map((acc) => {
        const employee = acc.employee;
        const balance = acc.currentBalance;
        const isPositive = balance >= 0;

        return (
          <Card
              key={acc.id}
              className={`${isPositive ? 'border-emerald-500/30' : 'border-red-500/30'} cursor-pointer transition-shadow hover:shadow-md`}
              onClick={() => onSelectEmployee?.(acc.employeeId)}
            >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {employee?.fullName ?? 'Unknown Employee'}
              </CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {balance.toLocaleString()} AFN
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                {isPositive ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span>{isPositive ? 'Remaining balance' : 'Overdrawn'}</span>
                <Badge variant={isPositive ? 'default' : 'destructive'} className="ml-auto text-[10px]">
                  {employee?.department ?? ''}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
