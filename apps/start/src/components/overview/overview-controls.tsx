import {
  OverviewFilterButton,
  OverviewFiltersButtons,
} from '@/components/overview/filters/overview-filters-buttons';
import { OverviewGameFilter } from '@/components/overview/filters/overview-game-filter';
import { OverviewInterval } from '@/components/overview/overview-interval';
import { OverviewRange } from '@/components/overview/overview-range';
import { cn } from '@/utils/cn';
import type { ReactNode } from 'react';

interface OverviewControlsProps {
  projectId: string;
  className?: string;
  rightContent?: ReactNode;
}

export function OverviewControls({
  projectId,
  className,
  rightContent,
}: OverviewControlsProps) {
  return (
    <div className={cn('col gap-2 p-4', className)}>
      <div className="flex justify-between gap-2">
        <div className="flex gap-2">
          <OverviewRange />
          <OverviewInterval />
          <OverviewGameFilter projectId={projectId} />
          <OverviewFilterButton mode="events" />
        </div>
        <div className="flex gap-2">{rightContent}</div>
      </div>
      <OverviewFiltersButtons />
    </div>
  );
}
