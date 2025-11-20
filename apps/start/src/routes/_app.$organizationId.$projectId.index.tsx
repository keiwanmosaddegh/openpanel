import {
  OverviewFilterButton,
  OverviewFiltersButtons,
} from '@/components/overview/filters/overview-filters-buttons';
import { OverviewGameFilter } from '@/components/overview/filters/overview-game-filter';
import { LiveCounter } from '@/components/overview/live-counter';
import { OverviewInterval } from '@/components/overview/overview-interval';
import OverviewMetrics from '@/components/overview/overview-metrics';
import { OverviewRange } from '@/components/overview/overview-range';
import { OverviewShare } from '@/components/overview/overview-share';
import OverviewDecayCurve from '@/components/overview/overview-decay-curve';
import OverviewHealthMonitor from '@/components/overview/overview-health-monitor';
import OverviewMilestoneKPI from '@/components/overview/overview-milestone-kpi';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopGames from '@/components/overview/overview-top-games';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/$organizationId/$projectId/')({
  component: ProjectDashboard,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.DASHBOARD),
        },
      ],
    };
  },
});

function ProjectDashboard() {
  const { projectId } = Route.useParams();
  return (
    <div>
      <div className="col gap-2 p-4">
        <div className="flex justify-between gap-2">
          <div className="flex gap-2">
            <OverviewRange />
            <OverviewInterval />
            <OverviewGameFilter projectId={projectId} />
            <OverviewFilterButton mode="events" />
          </div>
          <div className="flex gap-2">
            <LiveCounter projectId={projectId} />
            <OverviewShare projectId={projectId} />
          </div>
        </div>
        <OverviewFiltersButtons />
      </div>
      <div className="grid grid-cols-6 gap-4 p-4 pt-0">
        <OverviewMetrics projectId={projectId} />
        <OverviewDecayCurve projectId={projectId} />
        <OverviewHealthMonitor projectId={projectId} />
        <OverviewMilestoneKPI projectId={projectId} />
        <OverviewTopGames projectId={projectId} />
        <OverviewTopDevices projectId={projectId} />
        <OverviewTopEvents projectId={projectId} />
        <OverviewTopGeo projectId={projectId} />
      </div>
    </div>
  );
}
