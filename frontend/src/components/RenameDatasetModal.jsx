import { useEffect, useState } from 'react';
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

const API_BASE = '/emly/api/prediction';

function RenameDatasetModal({ open, dataset, onClose, onRenamed }) {
  const [filename, setFilename] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFilename(String(dataset?.original_filename || '').trim());
    setError('');
  }, [dataset, open]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!dataset?.dataset_id || !filename.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(dataset.dataset_id)}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: filename.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to rename dataset');
      onRenamed?.(body.dataset);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to rename dataset');
    } finally {
      setSaving(false);
    }
  };

  if (!dataset) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Dataset</DialogTitle>
          <DialogDescription>Update this dataset filename.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rename-dataset-input">Filename</Label>
            <Input
              id="rename-dataset-input"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="dataset.csv"
              disabled={saving}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!filename.trim() || saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default RenameDatasetModal;
