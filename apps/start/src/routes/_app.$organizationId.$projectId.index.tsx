import { LiveCounter } from '@/components/overview/live-counter';
import { OverviewControls } from '@/components/overview/overview-controls';
import { OverviewGrid } from '@/components/overview/overview-grid';
import { OverviewShare } from '@/components/overview/overview-share';
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
      <OverviewControls
        projectId={projectId}
        rightContent={
          <>
            <LiveCounter projectId={projectId} />
            <OverviewShare projectId={projectId} />
          </>
        }
      />
      <OverviewGrid projectId={projectId} />
    </div>
  );
}
