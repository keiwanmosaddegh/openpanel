import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { ModalContent, ModalHeader } from '@/modals/Modal/Container';
import type { IGetTopGenericInput } from '@openpanel/db';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { OVERVIEW_COLUMNS_NAME } from './overview-constants';
import { OverviewWidgetTableGeneric } from './overview-widget-table';
import { useOverviewOptions } from './useOverviewOptions';

interface OverviewTopGamesModalProps {
  projectId: string;
  column: IGetTopGenericInput['column'];
}

export default function OverviewTopGamesModal({
  projectId,
  column,
}: OverviewTopGamesModalProps) {
  const [filters, setFilter] = useEventQueryFilters();
  const { startDate, endDate, range } = useOverviewOptions();
  const trpc = useTRPC();
  const query = useInfiniteQuery(
    trpc.overview.topGeneric.infiniteQueryOptions(
      {
        projectId,
        filters: [
          ...filters,
          {
            name: 'name',
            operator: 'is',
            value: ['level_started'],
          },
        ],
        startDate,
        endDate,
        range,
        limit: 50,
        column,
      },
      {
        getNextPageParam: (lastPage, pages) => {
          if (lastPage.length === 0) {
            return null;
          }

          return pages.length + 1;
        },
      },
    ),
  );

  const data = query.data?.pages.flat() || [];
  const isEmpty = !query.hasNextPage && !query.isFetching;

  const columnName = OVERVIEW_COLUMNS_NAME[column];

  return (
    <ModalContent>
      <ModalHeader title="Top Games" />
      <ScrollArea className="-mx-6 px-2">
        <OverviewWidgetTableGeneric
          data={data}
          column={{
            name: columnName,
            render(item) {
              return (
                <div className="row items-center gap-2 min-w-0 relative">
                  <SerieIcon name={item.name} />
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
        <div className="row center-center p-4 pb-0">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => query.fetchNextPage()}
            disabled={isEmpty}
          >
            Load more
          </Button>
        </div>
      </ScrollArea>
    </ModalContent>
  );
}
