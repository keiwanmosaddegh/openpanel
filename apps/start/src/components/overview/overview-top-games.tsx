import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useQuery } from '@tanstack/react-query';

import { NOT_SET_VALUE } from '@openpanel/constants';

import { SerieIcon } from '../report-chart/common/serie-icon';
import { Widget, WidgetBody } from '../widget';
import { OVERVIEW_COLUMNS_NAME } from './overview-constants';
import OverviewDetailsButton from './overview-details-button';
import { WidgetFooter, WidgetHead } from './overview-widget';
import {
  OverviewWidgetTableGeneric,
  OverviewWidgetTableLoading,
} from './overview-widget-table';
import { useOverviewOptions } from './useOverviewOptions';

interface OverviewTopGamesProps {
  projectId: string;
}

export default function OverviewTopGames({
  projectId,
}: OverviewTopGamesProps) {
  const { range, startDate, endDate } = useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const trpc = useTRPC();

  const column = 'properties.game_id' as const;

  const query = useQuery(
    trpc.overview.topGeneric.queryOptions({
      projectId,
      range,
      filters: [
        ...filters,
        {
          name: 'name',
          operator: 'is',
          value: ['level_started'],
        },
      ],
      column,
      startDate,
      endDate,
    }),
  );

  return (
    <Widget className="col-span-6 md:col-span-3">
      <WidgetHead>
        <div className="title">Top Games</div>
      </WidgetHead>
      <WidgetBody className="p-0">
        {query.isLoading ? (
          <OverviewWidgetTableLoading />
        ) : (
          <OverviewWidgetTableGeneric
            data={query.data ?? []}
            column={{
              name: OVERVIEW_COLUMNS_NAME[column],
              render(item) {
                return (
                  <div className="row items-center gap-2 min-w-0 relative">
                    <SerieIcon name={item.name || NOT_SET_VALUE} />
                    <button
                      type="button"
                      className="truncate"
                      onClick={() => {
                        setFilter(column, item.name);
                      }}
                    >
                      {item.name || 'Not set'}
                    </button>
                  </div>
                );
              },
            }}
          />
        )}
      </WidgetBody>
      <WidgetFooter>
        <OverviewDetailsButton
          onClick={() =>
            pushModal('OverviewTopGamesModal', {
              projectId,
              column,
            })
          }
        />
      </WidgetFooter>
    </Widget>
  );
}
