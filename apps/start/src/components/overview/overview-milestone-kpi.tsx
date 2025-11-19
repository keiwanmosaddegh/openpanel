import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { Widget, WidgetBody } from '../widget';
import { WidgetHead } from './overview-widget';
import { OverviewMetricCard } from './overview-metric-card';
import { useOverviewOptions } from './useOverviewOptions';

export interface OverviewMilestoneKPIProps {
  projectId: string;
}

const MILESTONES = [
  { day: 1, label: 'Day 1 Retention' },
  { day: 3, label: 'Day 3 Retention' },
  { day: 7, label: 'Day 7 Retention' },
  { day: 30, label: 'Day 30 Retention' },
] as const;

export default function OverviewMilestoneKPI({
  projectId,
}: OverviewMilestoneKPIProps) {
  const { range, startDate, endDate, interval } = useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const trpc = useTRPC();

  const query = useQuery(
    trpc.chart.chart.queryOptions(
      {
        projectId,
        startDate,
        endDate,
        events: [
          {
            segment: 'event',
            filters: [
              ...filters,
              {
                id: 'days_filter',
                name: 'properties.days_since_first_visit',
                operator: 'is',
                value: ['0', '1', '3', '7', '30'],
              },
            ],
            id: 'A',
            name: 'session_started',
          },
        ],
        breakdowns: [
          {
            id: 'A',
            name: 'properties.days_since_first_visit',
          },
        ],
        chartType: 'bar',
        interval,
        range,
        previous: false,
        metric: 'sum',
      },
      {
        placeholderData: keepPreviousData,
        staleTime: 1000 * 60 * 1,
      },
    ),
  );

  // Calculate retention percentages
  const retentionData = useMemo(() => {
    if (!query.data?.series || query.data.series.length === 0) {
      return null;
    }

    // Find D0 baseline count (total new users)
    const d0Serie = query.data.series.find((s) => s.names[0] === '0');
    const d0Count = d0Serie?.metrics.sum ?? 0;

    if (d0Count === 0) {
      return null;
    }

    // Calculate retention % for each milestone
    return MILESTONES.map((milestone) => {
      const serie = query.data!.series.find(
        (s) => s.names[0] === String(milestone.day),
      );
      const count = serie?.metrics.sum ?? 0;
      const percentage = (count / d0Count) * 100;

      return {
        day: milestone.day,
        label: milestone.label,
        percentage,
        count,
      };
    });
  }, [query.data]);

  return (
    <Widget className="col-span-6">
      <WidgetHead>
        <div className="title">Retention Milestones</div>
      </WidgetHead>
      <WidgetBody>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {MILESTONES.map((milestone, index) => {
            const data = retentionData?.[index];
            const isLoading = query.isLoading;

            return (
              <OverviewMetricCard
                key={milestone.day}
                id={`milestone-d${milestone.day}`}
                label={milestone.label}
                metric={{
                  current: data?.percentage ?? 0,
                }}
                unit="%"
                data={[]}
                isLoading={isLoading}
                inverted={false}
              />
            );
          })}
        </div>
      </WidgetBody>
    </Widget>
  );
}
