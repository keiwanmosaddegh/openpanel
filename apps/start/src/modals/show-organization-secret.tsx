import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';

import CopyInput from '../components/forms/copy-input';

type Props = {
  open: boolean;
  onClose: () => void;
  secret: string;
};

export function ShowOrganizationSecret({ open, onClose, secret }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Organization Secret Generated</DialogTitle>
          <DialogDescription>
            Save this secret securely. You won't be able to see it again.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <CopyInput label="Organization Secret" value={secret} />
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important!</AlertTitle>
            <AlertDescription>
              This secret will only be shown once. Store it securely - you cannot
              retrieve it later. Use this secret with any project ID in this
              organization for server-side tracking.
            </AlertDescription>
          </Alert>
          <Alert>
            <AlertTitle>How to use</AlertTitle>
            <AlertDescription>
              Initialize the SDK with your project ID as clientId and this secret as
              clientSecret:
              <pre className="mt-2 rounded bg-muted p-2 text-xs">
                {`new OpenPanel({
  clientId: 'your-project-id',
  clientSecret: '${secret.slice(0, 10)}...'
})`}
              </pre>
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}
