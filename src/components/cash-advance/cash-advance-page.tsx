'use client';

import * as React from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { WalletCards } from './wallet-cards';
import { AdvanceForm } from './advance-form';
import { ReturnForm } from './return-form';
import { TransferForm } from './transfer-form';
import { LedgerView } from './ledger-view';
import { TransactionsList } from './transactions-list';
import { EmployeeWalletDetail } from './employee-wallet-detail';
import { usePermissions } from '@/hooks/use-permissions';

export function CashAdvancePage() {
  const { canCreate } = usePermissions();
  const [activeTab, setActiveTab] = React.useState('wallets');
  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<string | null>(null);

  return (
    <div className="space-y-6 font-vazirmatn">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="wallets">Employee Wallets</TabsTrigger>
          {canCreate('cashAdvance') && <TabsTrigger value="transfer">Transfer</TabsTrigger>}
          {canCreate('cashAdvance') && <TabsTrigger value="issue">Issue Advance</TabsTrigger>}
          {canCreate('cashAdvance') && <TabsTrigger value="return">Record Return</TabsTrigger>}
          <TabsTrigger value="transactions">All Transactions</TabsTrigger>
          <TabsTrigger value="ledger">Employee Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="wallets" className="space-y-4">
          {selectedEmployeeId ? (
            <EmployeeWalletDetail
              employeeId={selectedEmployeeId}
              onBack={() => setSelectedEmployeeId(null)}
            />
          ) : (
            <WalletCards
              onSelectEmployee={(id) => setSelectedEmployeeId(id)}
            />
          )}
        </TabsContent>

        {canCreate('cashAdvance') && (
          <TabsContent value="transfer">
            <TransferForm onSuccess={() => setActiveTab('wallets')} />
          </TabsContent>
        )}

        {canCreate('cashAdvance') && (
          <TabsContent value="issue">
            <AdvanceForm onSuccess={() => setActiveTab('wallets')} />
          </TabsContent>
        )}

        {canCreate('cashAdvance') && (
          <TabsContent value="return">
            <ReturnForm onSuccess={() => setActiveTab('wallets')} />
          </TabsContent>
        )}

        <TabsContent value="transactions">
          <TransactionsList />
        </TabsContent>

        <TabsContent value="ledger">
          <LedgerView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
