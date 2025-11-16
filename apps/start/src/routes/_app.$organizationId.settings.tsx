import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createOrganizationTitle } from '@/utils/title';
import { zEditOrganization } from '@openpanel/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ShowOrganizationSecret } from '@/modals/show-organization-secret';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Key } from 'lucide-react';

const validator = zEditOrganization;

type IForm = z.infer<typeof validator>;

export const Route = createFileRoute('/_app/$organizationId/settings')({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createOrganizationTitle(PAGE_TITLES.SETTINGS),
        },
      ],
    };
  },
});

function Component() {
  const { organizationId } = Route.useParams();
  const trpc = useTRPC();
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState('');

  const {
    data: organization,
    isLoading,
    refetch,
  } = useQuery(
    trpc.organization.get.queryOptions({
      organizationId,
    }),
  );

  if (isLoading) {
    return <FullPageLoadingState />;
  }

  if (!organization) {
    return <FullPageEmptyState title="Organization not found" />;
  }

  const { register, handleSubmit, formState, reset, control } = useForm<IForm>({
    defaultValues: {
      id: organization.id,
      name: organization.name,
      timezone: organization.timezone ?? undefined,
    },
  });

  const mutation = useMutation(
    trpc.organization.update.mutationOptions({
      onSuccess(res) {
        toast('Organization updated', {
          description: 'Your organization has been updated.',
        });
        reset({
          ...res,
          timezone: res.timezone!,
        });
        refetch();
      },
      onError: handleError,
    }),
  );

  const generateSecretMutation = useMutation(
    trpc.organization.generateSecret.mutationOptions({
      onSuccess(res) {
        setGeneratedSecret(res.secret);
        setShowSecretModal(true);
        refetch();
      },
      onError: handleError,
    }),
  );

  const regenerateSecretMutation = useMutation(
    trpc.organization.regenerateSecret.mutationOptions({
      onSuccess(res) {
        setGeneratedSecret(res.secret);
        setShowSecretModal(true);
        refetch();
      },
      onError: handleError,
    }),
  );

  return (
    <div className="container p-8">
      <PageHeader
        title="Workspace settings"
        description="Manage your workspace settings here"
        className="mb-8"
      />

      <div className="space-y-6">
        <form
          onSubmit={handleSubmit((values) => {
            mutation.mutate(values);
          })}
        >
          <Widget>
            <WidgetHead className="flex items-center justify-between">
              <span className="title">Details</span>
            </WidgetHead>
            <WidgetBody className="gap-4 col">
              <InputWithLabel
                className="flex-1"
                label="Name"
                {...register('name')}
                defaultValue={organization?.name}
              />
              <Controller
                name="timezone"
                control={control}
                render={({ field }) => (
                  <WithLabel label="Timezone">
                    <Combobox
                      placeholder="Select timezone"
                      items={Intl.supportedValuesOf('timeZone').map((item) => ({
                        value: item,
                        label: item,
                      }))}
                      value={field.value}
                      onChange={field.onChange}
                      className="w-full"
                    />
                  </WithLabel>
                )}
              />
              <Button
                size="sm"
                type="submit"
                disabled={!formState.isDirty}
                className="self-end"
              >
                Save
              </Button>
            </WidgetBody>
          </Widget>
        </form>

        <Widget>
          <WidgetHead className="flex items-center justify-between">
            <span className="title">Organization Secret</span>
          </WidgetHead>
          <WidgetBody className="gap-4 col">
            <p className="text-sm text-muted-foreground">
              Use an organization secret for server-side tracking across all projects.
              Set your project ID as clientId and the organization secret as clientSecret.
            </p>

            {organization.secret ? (
              <>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <code className="text-sm">sec_********************</code>
                </div>
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Regenerating the secret will immediately invalidate the old one.
                    Update all your server-side integrations before regenerating.
                  </AlertDescription>
                </Alert>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => regenerateSecretMutation.mutate({ organizationId })}
                  disabled={regenerateSecretMutation.isPending}
                  className="self-start"
                >
                  {regenerateSecretMutation.isPending
                    ? 'Regenerating...'
                    : 'Regenerate Secret'}
                </Button>
              </>
            ) : (
              <>
                <Alert>
                  <AlertDescription>
                    No organization secret has been generated yet. Generate one to enable
                    server-side tracking across all projects.
                  </AlertDescription>
                </Alert>
                <Button
                  size="sm"
                  onClick={() => generateSecretMutation.mutate({ organizationId })}
                  disabled={generateSecretMutation.isPending}
                  className="self-start"
                >
                  {generateSecretMutation.isPending
                    ? 'Generating...'
                    : 'Generate Secret'}
                </Button>
              </>
            )}
          </WidgetBody>
        </Widget>
      </div>

      <ShowOrganizationSecret
        open={showSecretModal}
        onClose={() => setShowSecretModal(false)}
        secret={generatedSecret}
      />
    </div>
  );
}
