import { Database, FolderOpen, HardDrive, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CONNECTOR_PROVIDERS = [
  {
    id: 'postgresql',
    title: 'PostgreSQL',
    description: 'Open-source relational database',
    icon: Database,
    available: true,
  },
  {
    id: 'mysql',
    title: 'MySQL',
    description: 'MySQL-compatible servers and managed MySQL',
    icon: Database,
    available: true,
  },
  {
    id: 'mssql',
    title: 'MS SQL Server',
    description: 'Microsoft SQL Server via ODBC',
    icon: Database,
    available: true,
  },
  {
    id: 'oracle',
    title: 'Oracle',
    description: 'Oracle Database service',
    icon: Database,
    available: true,
  },
  {
    id: 'sqlite',
    title: 'SQLite',
    description: 'File-based embedded SQL database',
    icon: HardDrive,
    available: true,
  },
  {
    id: 'aws_s3',
    title: 'Amazon S3',
    description: 'Object storage connector',
    icon: FolderOpen,
    available: false,
  },
  {
    id: 'gcp_gcs',
    title: 'Google Cloud Storage',
    description: 'Object storage connector',
    icon: FolderOpen,
    available: false,
  },
  {
    id: 'azure_blob',
    title: 'Azure Blob Storage',
    description: 'Object storage connector',
    icon: FolderOpen,
    available: false,
  },
  {
    id: 'sftp',
    title: 'SFTP',
    description: 'Secure file transfer via SSH',
    icon: Server,
    available: true,
  },
];

function NewConnectorModal({ open, onClose, onSelectProvider }) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="upload-dataset-dialog" style={{ maxWidth: '980px' }}>
        <DialogHeader>
          <DialogTitle>New Connector</DialogTitle>
          <DialogDescription>Select provider to continue.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-3">
          {CONNECTOR_PROVIDERS.map((provider) => {
            const Icon = provider.icon;
            return (
              <button
                key={provider.id}
                type="button"
                className="rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => onSelectProvider?.(provider.id)}
                disabled={!provider.available}
              >
                <div className="mb-3 inline-flex rounded-md bg-slate-100 p-2 text-slate-700">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">{provider.title}</p>
                <p className="mt-1 text-xs text-slate-600">{provider.description}</p>
                {!provider.available ? (
                  <p className="mt-3 text-xs font-medium text-amber-700">Coming soon</p>
                ) : null}
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewConnectorModal;
