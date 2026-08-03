import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

/**
 * The surfaces this project actually emits, newest-seen first.
 *
 * `embed_surface` values are free-form and host-declared (puzzlr ADR-0008): the
 * host sets `data-embed-surface` to its own vocabulary (`news_web`, `game_app`,
 * …) and the client falls back to the system-resolved `web` | `app` | `embed`
 * only when the attribute is absent. So the option list cannot be hardcoded and
 * must never be bucketed — it is read per project.
 *
 * Backed by `event_property_values_mv`, which already indexes distinct property
 * values per project, so this costs no new materialization.
 *
 * NOTE: `chart.values` is a protectedProcedure and returns nothing in the
 * public-share context. Callers must degrade to hiding the control rather than
 * rendering an empty one.
 */
export function useSurfaceValues(projectId: string) {
  const trpc = useTRPC();
  const { data } = useQuery(
    trpc.chart.values.queryOptions(
      { projectId, event: '*', property: 'properties.embed_surface' },
      { staleTime: 1000 * 60 * 60, enabled: !!projectId },
    ),
  );
  // '' is the pre-ADR-0008 "not set" state, never a selectable surface.
  return (data?.values ?? []).filter(Boolean);
}
