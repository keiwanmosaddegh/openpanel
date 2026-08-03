import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useSurfaceValues } from '@/hooks/use-surface-values';

/**
 * fork: scopes the overview to one or more surfaces — which of the publisher's
 * products an embed ran inside.
 *
 * Multi-select rather than a fixed Web/App toggle, because `embed_surface`
 * values are free-form and host-declared (puzzlr ADR-0008) and this dashboard
 * must not assume a taxonomy: a tenant may run `game_app` + `news_app` +
 * `news_web` alongside the `web`/`app`/`embed` system fallback. Selecting
 * several composes the grouping at query time, so "both my app surfaces" is
 * expressible without the dashboard knowing what those words mean.
 *
 * Emits the synthetic `surface` filter, resolved through the session (not the
 * row) by SURFACE_FILTER in overview.service.ts.
 */
export const SURFACE_FILTER = 'surface';

export function SurfaceFilter() {
  const { projectId } = useAppParams();
  const [filters, setFilter, , removeFilter] = useEventQueryFilters();
  const surfaces = useSurfaceValues(projectId);
  const selected = filters.find((f) => f.name === SURFACE_FILTER)?.value ?? [];

  // Hidden on a project with nothing to compare — and on shared dashboards,
  // where the values query is unavailable and returns an empty list.
  if (surfaces.length < 2) {
    return null;
  }

  return (
    <ComboboxAdvanced
      items={surfaces.map((surface) => ({ value: surface, label: surface }))}
      onChange={(next) => {
        const values = next.filter(
          (v): v is string => typeof v === 'string' && v !== '',
        );
        if (values.length === 0) {
          removeFilter(SURFACE_FILTER);
        } else {
          setFilter(SURFACE_FILTER, values, 'is');
        }
      }}
      placeholder="All surfaces"
      value={selected}
    />
  );
}
