import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { Gamepad2 } from 'lucide-react';
import { useOverviewOptions } from '../useOverviewOptions';
import { Combobox } from '@/components/ui/combobox';

interface OverviewGameFilterProps {
  projectId: string;
}

export function OverviewGameFilter({ projectId }: OverviewGameFilterProps) {
  const { range, startDate, endDate } = useOverviewOptions();
  const [filters, setFilter] = useEventQueryFilters();
  const trpc = useTRPC();

  const column = 'properties.game_id' as const;

  const query = useQuery(
    trpc.overview.topGeneric.queryOptions({
      projectId,
      range,
      filters: [
        ...filters.filter((f) => f.name !== column), // Exclude current game filter to see all options
        {
          name: 'name',
          operator: 'is',
          value: ['level_started'], // Filter by level_started to get games
        },
      ],
      column,
      startDate,
      endDate,
      limit: 100, // Fetch enough games
    }),
  );

  const currentFilter = filters.find((f) => f.name === column);
  const value = currentFilter?.value[0] ?? null;

  const items =
    query.data?.map((item) => ({
      value: item.name,
      label: item.name,
    })) ?? [];

  // If current value is not in the list (e.g. from URL), add it
  if (value && !items.find((item) => item.value === value)) {
    items.push({ value, label: value });
  }

  return (
    <Combobox
      placeholder="All Games"
      items={items}
      value={value}
      onChange={(val) => {
        setFilter(column, val);
      }}
      icon={Gamepad2}
      searchable
      className="w-[200px]"
    />
  );
}
