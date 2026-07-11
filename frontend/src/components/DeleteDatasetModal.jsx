import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function DeleteDatasetModal({ open, dataset, datasets, onClose, onConfirm, loading }) {
  const items = (Array.isArray(datasets) && datasets.length ? datasets : dataset ? [dataset] : []).filter(Boolean);
  if (!items.length) return null;
  const isBulk = items.length > 1;
  const previewNames = items.slice(0, 5).map((item) => item.original_filename).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isBulk ? 'Delete Datasets' : 'Delete Dataset'}</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>

        {isBulk ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Are you sure you want to delete <strong>{items.length}</strong> datasets?
            </p>
            <ul className="list-disc pl-5">
              {previewNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            {items.length > previewNames.length ? (
              <p className="text-xs text-slate-500">+ {items.length - previewNames.length} more</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-700">
            Are you sure you want to delete <strong>{items[0].original_filename}</strong>?
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting...' : isBulk ? `Delete ${items.length} Datasets` : 'Delete Dataset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteDatasetModal;
