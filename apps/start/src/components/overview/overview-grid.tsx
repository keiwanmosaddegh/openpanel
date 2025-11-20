import OverviewDecayCurve from '@/components/overview/overview-decay-curve';
import OverviewHealthMonitor from '@/components/overview/overview-health-monitor';
import OverviewMetrics from '@/components/overview/overview-metrics';
import OverviewMilestoneKPI from '@/components/overview/overview-milestone-kpi';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGames from '@/components/overview/overview-top-games';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import { cn } from '@/utils/cn';

interface OverviewGridProps {
  projectId: string;
  className?: string;
}

export function OverviewGrid({ projectId, className }: OverviewGridProps) {
  return (
    <div className={cn('grid grid-cols-6 gap-4 p-4 pt-0', className)}>
      <OverviewMetrics projectId={projectId} />
      <OverviewDecayCurve projectId={projectId} />
      <OverviewHealthMonitor projectId={projectId} />
      <OverviewMilestoneKPI projectId={projectId} />
      <OverviewTopGames projectId={projectId} />
      <OverviewTopDevices projectId={projectId} />
      <OverviewTopEvents projectId={projectId} />
      <OverviewTopGeo projectId={projectId} />
    </div>
  );
}
