import { ReportChart } from '@/components/report-chart';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';

import type { IChartType } from '@openpanel/validation';

import { Widget, WidgetBody } from '../widget';
import { WidgetFooter, WidgetHead } from './overview-widget';
import { useOverviewOptions } from './useOverviewOptions';

export interface OverviewDecayCurveProps {
  projectId: string;
}

export default function OverviewDecayCurve({
  projectId,
}: OverviewDecayCurveProps) {
  const { interval, range, previous, startDate, endDate } =
    useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const chartType: IChartType = 'bar';

  return (
    <>
      <Widget className="col-span-6 md:col-span-3">
        <WidgetHead>
          <div className="title">Retention</div>
        </WidgetHead>
        <WidgetBody className="p-3">
          <ReportChart
            options={{ hideID: true, columns: ['Days Since First Visit', 'Count'] }}
            report={{
              limit: 30,
              projectId,
              startDate,
              endDate,
              events: [
                {
                  segment: 'event',
                  filters: [...filters],
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
              chartType,
              lineType: 'monotone',
              interval: interval,
              name: 'Retention',
              range: range,
              previous: false,
              metric: 'sum',
            }}
          />
        </WidgetBody>
        <WidgetFooter>
          <div className="text-xs text-muted-foreground px-2">
            Shows session distribution by days since first visit (last 7 days)
          </div>
        </WidgetFooter>
      </Widget>
    </>
  );
}
