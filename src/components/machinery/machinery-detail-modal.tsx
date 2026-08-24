'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Truck,
  User,
  Calendar,
  Phone,
  CreditCard,
  ImageIcon,
} from 'lucide-react';
import {
  MACHINERY_STATUS_LABELS,
  FUEL_TYPE_LABELS,
} from '@/types/contractor';
import type { Machinery, MachineryStatus, FuelType } from '@/types/contractor';

interface MachineryDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machinery: Machinery | null;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <p className="font-medium">{children}</p>
    </div>
  );
}

export function MachineryDetailModal({ open, onOpenChange, machinery }: MachineryDetailModalProps) {
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);

  if (!machinery) return null;

  const statusColor =
    machinery.status === 'OPERATIONAL'
      ? 'bg-emerald-500'
      : machinery.status === 'UNDER_MAINTENANCE'
        ? 'bg-amber-500'
        : 'bg-rose-500';

  const hasDriver =
    machinery.driverName ||
    machinery.driverFatherName ||
    machinery.driverPhoneNumber ||
    machinery.driverNationalId ||
    machinery.driverIdImageFront ||
    machinery.driverIdImageBack;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Truck className="size-5 text-emerald-600 shrink-0" />
                  {machinery.machineryName}
                </DialogTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge className={`text-white border-0 text-xs ${statusColor}`}>
                    {MACHINERY_STATUS_LABELS[machinery.status as MachineryStatus] ?? machinery.status}
                  </Badge>
                  <span className="text-muted-foreground">·</span>
                  <span>{machinery.machineryType}</span>
                  {machinery.plateNumber && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-mono">{machinery.plateNumber}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 overflow-scroll">
            <div className="space-y-6 pr-4">
              {/* Machinery Info */}
              <div className="space-y-3">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Truck className="size-3.5" />
                  Machinery Details
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  <InfoItem label="Model">{machinery.model || '—'}</InfoItem>
                  <InfoItem label="Fuel Type">
                    {FUEL_TYPE_LABELS[machinery.fuelType as FuelType] ?? machinery.fuelType}
                  </InfoItem>
                  <InfoItem label="Fuel Consumption">
                    {machinery.hourlyConsumptionRate.toLocaleString()} L/hr
                  </InfoItem>
                  <InfoItem label="Contractor">
                    {machinery.assignedContractor?.contractorName || '—'}
                  </InfoItem>
                  <InfoItem label="Contract Start">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5 text-muted-foreground" />
                      {formatDate(machinery.contractStartDate)}
                    </span>
                  </InfoItem>
                  <InfoItem label="Contract End">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5 text-muted-foreground" />
                      {formatDate(machinery.contractEndDate)}
                    </span>
                  </InfoItem>
                  <InfoItem label="Hours / Day">{machinery.workHoursPerDay}</InfoItem>
                  <InfoItem label="Days / Month">{machinery.contractDaysPerMonth}</InfoItem>
                  <InfoItem label="Recorded Timesheets">
                    {machinery._count?.timesheets ?? 0}
                  </InfoItem>
                  <InfoItem label="Fuel Usages">
                    {machinery._count?.fuelUsages ?? 0}
                  </InfoItem>
                  <InfoItem label="Created">{formatDate(machinery.createdAt)}</InfoItem>
                </div>

                <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Rates (Afs)
                  </span>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground block">Hourly</span>
                      <span className="font-semibold tabular-nums">{machinery.hourlyRate.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Daily</span>
                      <span className="font-semibold tabular-nums">{machinery.dailyRate.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Monthly</span>
                      <span className="font-semibold tabular-nums">{machinery.monthlyRate.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Driver Info */}
              <div className="space-y-3">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <User className="size-3.5" />
                  Driver Details
                </span>
                {hasDriver ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                      <InfoItem label="Name">{machinery.driverName || '—'}</InfoItem>
                      <InfoItem label="Father's Name">{machinery.driverFatherName || '—'}</InfoItem>
                      <InfoItem label="Phone">
                        {machinery.driverPhoneNumber ? (
                          <span className="flex items-center gap-1">
                            <Phone className="size-3.5 text-muted-foreground" />
                            {machinery.driverPhoneNumber}
                          </span>
                        ) : (
                          '—'
                        )}
                      </InfoItem>
                      <InfoItem label="National ID">
                        {machinery.driverNationalId ? (
                          <span className="flex items-center gap-1">
                            <CreditCard className="size-3.5 text-muted-foreground" />
                            <span className="font-mono">{machinery.driverNationalId}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </InfoItem>
                    </div>
                    {(machinery.driverIdImageFront || machinery.driverIdImageBack) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {machinery.driverIdImageFront && (
                          <div className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">ID Front</span>
                            <img
                              src={machinery.driverIdImageFront}
                              alt="Driver ID Front"
                              className="w-full h-40 rounded-lg border object-contain bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setPreview({ src: machinery.driverIdImageFront!, alt: 'Driver ID Front' })}
                              title="Click to preview full image"
                            />
                          </div>
                        )}
                        {machinery.driverIdImageBack && (
                          <div className="space-y-1.5">
                            <span className="text-xs font-medium text-muted-foreground">ID Back</span>
                            <img
                              src={machinery.driverIdImageBack}
                              alt="Driver ID Back"
                              className="w-full h-40 rounded-lg border object-contain bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setPreview({ src: machinery.driverIdImageBack!, alt: 'Driver ID Back' })}
                              title="Click to preview full image"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ImageIcon className="size-4" />
                    No driver assigned
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Image Preview */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none">
          <DialogTitle className="sr-only">{preview?.alt ?? 'Preview'}</DialogTitle>
          {preview && (
            <div className="relative flex items-center justify-center w-full h-full">
              <img src={preview.src} alt={preview.alt} className="max-w-full max-h-full rounded-lg" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}