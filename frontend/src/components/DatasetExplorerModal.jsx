import { useMemo, useState } from 'react';
import { Folder, FileText, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function DatasetExplorerModal({
  open,
  datasets,
  folders = [],
  onClose,
  onSelect,
  title = 'Dataset Explorer',
  description = 'Pick a dataset for model training.',
  selectionMode = 'single',
  selectedDatasetIds = [],
  onToggleSelect,
  onConfirmSelection,
  confirmLabel = 'Use Selected',
  mode = 'dataset',
  onSelectFolder,
  currentFolderPath = '',
  miniMode = false,
}) {
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const folderStats = useMemo(() => {
    const map = new Map();
    (folders || []).forEach((folder) => {
      const folderPath = folder.path || folder.name;
      if (!folderPath) return;
      map.set(folderPath, {
        name: folderPath,
        count: Number(folder.file_count || 0),
      });
    });
    (datasets || []).forEach((dataset) => {
      const folderName = dataset.folder || 'default';
      if (!map.has(folderName)) map.set(folderName, { name: folderName, count: 1 });
    });
    return Array.from(map.values());
  }, [datasets, folders]);

  const filteredByFolder = useMemo(() => {
    if (selectedFolder === 'all') return datasets || [];
    return (datasets || []).filter((dataset) => (dataset.folder || 'default') === selectedFolder);
  }, [datasets, selectedFolder]);

  const filteredDatasets = useMemo(() => {
    if (!miniMode) return filteredByFolder;
    const query = searchTerm.trim().toLowerCase();
    if (!query) return filteredByFolder;
    return filteredByFolder.filter((dataset) => {
      const filename = String(dataset.original_filename || '').toLowerCase();
      const folderName = String(dataset.folder || 'default').toLowerCase();
      return filename.includes(query) || folderName.includes(query);
    });
  }, [filteredByFolder, miniMode, searchTerm]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className={`dataset-explorer-dialog ${miniMode ? 'dataset-explorer-dialog-mini' : ''}`}>
        <DialogHeader className={miniMode ? 'dataset-explorer-mini-header' : ''}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {miniMode ? (
            <button
              type="button"
              className="dataset-explorer-mini-close"
              onClick={onClose}
              aria-label="Close dataset explorer"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </DialogHeader>

        <div className="dataset-explorer-layout space-y-4">
          {!miniMode ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">Folders</h4>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                <button
                  type="button"
                  className={`rounded-md border p-3 text-left text-sm ${selectedFolder === 'all' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                  onClick={() => setSelectedFolder('all')}
                  style={{ color: selectedFolder === 'all' ? '#ffffff' : '#1e293b' }}
                >
                  <div className="mb-2 flex min-w-0 items-center gap-2">
                    <Folder className="h-4 w-4 shrink-0" />
                    <span className="block min-w-0 flex-1 truncate">All Files</span>
                  </div>
                  <Badge variant={selectedFolder === 'all' ? 'secondary' : 'outline'}>{(datasets || []).length}</Badge>
                </button>
                {folderStats.map((folder) => (
                  <button
                    key={folder.name}
                    type="button"
                    className={`rounded-md border p-3 text-left text-sm ${selectedFolder === folder.name ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                    onClick={() => setSelectedFolder(folder.name)}
                    title={folder.name}
                    style={{ color: selectedFolder === folder.name ? '#ffffff' : '#1e293b' }}
                  >
                    <div className="mb-2 flex min-w-0 items-center gap-2">
                      <Folder className="h-4 w-4 shrink-0" />
                      <span className="block min-w-0 flex-1 truncate">{folder.name}</span>
                    </div>
                    <Badge variant={selectedFolder === folder.name ? 'secondary' : 'outline'}>{folder.count}</Badge>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="dataset-explorer-mini-toolbar">
              <div className="dataset-explorer-mini-folder">
                <label htmlFor="dataset-explorer-folder" className="text-xs font-semibold text-slate-700">Folder</label>
                <select
                  id="dataset-explorer-folder"
                  value={selectedFolder}
                  onChange={(event) => setSelectedFolder(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                >
                  <option value="all">All folders</option>
                  {folderStats.map((folder) => (
                    <option key={`mini-folder-${folder.name}`} value={folder.name}>
                      {folder.name} ({folder.count})
                    </option>
                  ))}
                </select>
              </div>
              <div className="dataset-explorer-mini-search">
                <label htmlFor="dataset-explorer-search" className="text-xs font-semibold text-slate-700">Search</label>
                <input
                  id="dataset-explorer-search"
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Type dataset name"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                />
              </div>
            </section>
          )}

          {mode === 'folder' && !miniMode ? (
            <section className="dataset-explorer-grid overflow-hidden rounded-lg border border-slate-200">
              <div className="dataset-explorer-scroll-region overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Folder</th>
                      <th className="px-4 py-3">Datasets</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {folderStats.length ? (
                      folderStats.map((folder) => (
                        <tr key={folder.name}>
                          <td className="max-w-[440px] truncate px-4 py-3 text-slate-900" title={folder.name}>{folder.name}</td>
                          <td className="px-4 py-3 text-slate-600">{folder.count}</td>
                          <td className="px-4 py-3">
                            <Button
                              type="button"
                              size="sm"
                              variant={folder.name === currentFolderPath ? 'secondary' : 'default'}
                              disabled={folder.name === currentFolderPath}
                              onClick={() => onSelectFolder?.(folder.name)}
                            >
                              {folder.name === currentFolderPath ? 'Current Folder' : 'Select'}
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={3}>No folders available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : miniMode ? (
            <section className="dataset-explorer-grid dataset-explorer-grid-mini overflow-hidden rounded-lg border border-slate-200">
              <div className="dataset-explorer-scroll-region dataset-explorer-scroll-region-mini">
                <div className="dataset-explorer-mini-list">
                  {filteredDatasets.length ? (
                    filteredDatasets.map((ds) => (
                      <button
                        key={ds.dataset_id}
                        type="button"
                        className="dataset-explorer-mini-item"
                        onClick={() => onSelect(ds)}
                      >
                        <div className="dataset-explorer-mini-item-main">
                          <span className="inline-flex items-center gap-2 font-medium text-slate-900">
                            <FileText className="h-4 w-4 text-slate-500" />
                            <span className="truncate">{ds.original_filename}</span>
                          </span>
                          <span className="text-xs text-slate-500">{ds.folder || 'default'}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-6 text-center text-slate-500">No datasets found.</p>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section className="dataset-explorer-grid overflow-hidden rounded-lg border border-slate-200">
              <div className="dataset-explorer-scroll-region overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Dataset</th>
                      <th className="px-4 py-3">Folder</th>
                      <th className="px-4 py-3">Rows</th>
                      <th className="px-4 py-3">Columns</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredDatasets.length ? (
                      filteredDatasets.map((ds) => (
                        <tr key={ds.dataset_id}>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <span className="inline-flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-500" />
                              {ds.original_filename}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{ds.folder || 'default'}</td>
                          <td className="px-4 py-3 text-slate-600">{ds.rows}</td>
                          <td className="px-4 py-3 text-slate-600">{(ds.columns || []).length}</td>
                          <td className="px-4 py-3">
                            {selectionMode === 'multiple' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={selectedDatasetIds.includes(ds.dataset_id) ? 'default' : 'secondary'}
                                onClick={() => onToggleSelect?.(ds)}
                              >
                                {selectedDatasetIds.includes(ds.dataset_id) ? 'Selected' : 'Select'}
                              </Button>
                            ) : (
                              <Button type="button" size="sm" onClick={() => onSelect(ds)}>
                                Select
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>No datasets in this folder.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="flex justify-end gap-2">
            {selectionMode === 'multiple' ? (
              <Button
                type="button"
                onClick={() => onConfirmSelection?.()}
                disabled={!selectedDatasetIds.length}
              >
                {confirmLabel} ({selectedDatasetIds.length})
              </Button>
            ) : null}
            {!miniMode ? (
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DatasetExplorerModal;
