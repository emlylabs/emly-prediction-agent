import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const num = value / (1024 ** exp);
  return `${num.toFixed(num >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
}

const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls', '.json', '.zip']);

function getFileExtension(filename) {
  const name = String(filename || '').trim();
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex < 0) return '';
  return name.slice(dotIndex).toLowerCase();
}

function UploadDatasetModal({
  open,
  onClose,
  folders = [],
  queueItems = [],
  queueRunning = false,
  queueOverallProgress = 0,
  onStartUploads,
  onPauseUploads,
  onResumeUploads,
}) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('default');
  const [error, setError] = useState('');

  const hasResumable = useMemo(
    () => queueItems.some((item) => ['failed', 'paused'].includes(item.status)),
    [queueItems],
  );

  const onUploadAll = async (e) => {
    e.preventDefault();
    if (!selectedFiles.length || queueRunning || !onStartUploads) return;
    setError('');
    try {
      const started = await onStartUploads(selectedFiles, selectedFolder || 'default');
      if (!started) {
        setError('No files started.');
        return;
      }
      setSelectedFiles([]);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to start uploads');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="upload-dataset-dialog">
        <DialogHeader>
          <DialogTitle>Upload Datasets</DialogTitle>
          <DialogDescription>Upload continues in background. Track progress from the status window.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onUploadAll} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-folder">Folder</Label>
            <select
              id="upload-folder"
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              disabled={queueRunning}
            >
              {folders.length ? (
                folders.map((folder) => (
                  <option key={folder.name} value={folder.name}>
                    {folder.name}
                  </option>
                ))
              ) : (
                <option value="default">default</option>
              )}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataset-file">Dataset Files</Label>
            <Input
              id="dataset-file"
              type="file"
              accept=".csv,.xlsx,.xls,.json,.zip"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                const allowed = files.filter((file) => ALLOWED_UPLOAD_EXTENSIONS.has(getFileExtension(file?.name)));
                const skippedCount = files.length - allowed.length;
                setSelectedFiles(allowed);
                if (skippedCount > 0) {
                  setError(`${skippedCount} file(s) ignored. Allowed formats: CSV, Excel, JSON, ZIP.`);
                } else {
                  setError('');
                }
              }}
              disabled={queueRunning}
            />
            <p className="text-xs text-slate-500">
              {selectedFiles.length ? `${selectedFiles.length} file(s) selected` : 'No files selected'}
            </p>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 p-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Queue progress</span>
              <span>{queueOverallProgress}%</span>
            </div>
            <Progress value={queueOverallProgress} />
          </div>

          {queueItems.length ? (
            <div className="upload-dataset-file-list space-y-3">
              {queueItems.map((item) => (
                <div key={item.localId} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-slate-900">{item.filename}</p>
                    <p className="text-xs text-slate-600">{item.status}</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {item.message} ({formatBytes(item.uploadedBytes)} / {formatBytes(item.totalBytes)})
                  </p>
                  <Progress value={item.progress || 0} />
                  {item.error ? <p className="mt-1 text-xs text-red-600">{item.error}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button type="button" variant="secondary" onClick={onPauseUploads} disabled={!queueRunning}>
              Pause
            </Button>
            <Button type="button" variant="secondary" onClick={onResumeUploads} disabled={queueRunning || !hasResumable}>
              Resume
            </Button>
            <Button type="submit" disabled={!selectedFiles.length || queueRunning}>
              {queueRunning ? 'Uploading...' : 'Start Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default UploadDatasetModal;
