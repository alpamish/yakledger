'use client';

import { Badge } from '@/components/ui/badge';
import {
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_COLORS,
  type ApprovalStatus,
} from '@/types/expense';

export function ApprovalStatusBadge({
  status,
  className,
}: {
  status?: ApprovalStatus | string | null;
  className?: string;
}) {
  if (!status) return null;
  const s = status as ApprovalStatus;
  return (
    <Badge
      variant="outline"
      className={`gap-1 ${className ?? ''}`}
      style={{
        color: APPROVAL_STATUS_COLORS[s],
        borderColor: `${APPROVAL_STATUS_COLORS[s]}40`,
        backgroundColor: `${APPROVAL_STATUS_COLORS[s]}10`,
      }}
    >
      <span
        className="size-1.5 rounded-full inline-block"
        style={{ backgroundColor: APPROVAL_STATUS_COLORS[s] }}
      />
      {APPROVAL_STATUS_LABELS[s] ?? status}
    </Badge>
  );
}
