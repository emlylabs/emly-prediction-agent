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

function RenameFolderModal({ open, folder, onClose, onRenamed }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(String(folder?.displayName || folder?.name || '').trim());
    setError('');
  }, [folder, open]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!folder?.id || !name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/folders/${encodeURIComponent(folder.id)}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to rename folder');
      onRenamed?.(body.folder);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to rename folder');
    } finally {
      setSaving(false);
    }
  };

  if (!folder) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Folder</DialogTitle>
          <DialogDescription>Update this folder name.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rename-folder-input">Folder Name</Label>
            <Input
              id="rename-folder-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name"
              disabled={saving}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default RenameFolderModal;
