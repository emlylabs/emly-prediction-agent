import { useEffect, useMemo, useState } from 'react';
import { Copy, FileJson, Table } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function SchemaModal({ open, dataset, onClose }) {
  const [copyState, setCopyState] = useState('');
  const [activeView, setActiveView] = useState('human');

  useEffect(() => {
    if (!open) return;
    setActiveView('human');
    setCopyState('');
  }, [open, dataset?.dataset_id]);

  const schemaRows = useMemo(() => {
    const raw = Array.isArray(dataset?.schema) ? dataset.schema : [];
    if (raw.length) {
      return raw.map((col, idx) => ({
        index: idx + 1,
        name: String(col?.name || ''),
        detected_dtype: String(col?.detected_dtype || ''),
        semantic_type: String(col?.semantic_type || ''),
        storage_name: String(col?.storage_name || ''),
      }));
    }
    const fallbackColumns = Array.isArray(dataset?.columns) ? dataset.columns : [];
    return fallbackColumns.map((name, idx) => ({
      index: idx + 1,
      name: String(name || ''),
      detected_dtype: '',
      semantic_type: '',
      storage_name: '',
    }));
  }, [dataset]);

  const schemaJson = useMemo(
    () => JSON.stringify(Array.isArray(dataset?.schema) ? dataset.schema : [], null, 2),
    [dataset]
  );

  const schemaHumanText = useMemo(() => {
    const header = ['#', 'Column', 'Detected Type', 'Semantic Type', 'Storage Name'].join('\t');
    const rows = schemaRows.map((row) => [
      String(row.index),
      row.name || '-',
      row.detected_dtype || '-',
      row.semantic_type || '-',
      row.storage_name || '-',
    ].join('\t'));
    return [header, ...rows].join('\n');
  }, [schemaRows]);

  const copyToClipboard = async (label, value) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const el = document.createElement('textarea');
        el.value = value;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        el.remove();
      }
      setCopyState(`${label} copied`);
    } catch (err) {
      setCopyState(`Failed to copy ${label.toLowerCase()}`);
    }
    window.setTimeout(() => setCopyState(''), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="schema-modal-dialog">
        <DialogHeader>
          <DialogTitle>Dataset Schema</DialogTitle>
          <DialogDescription>
            {dataset?.original_filename || 'Dataset'} | {(schemaRows || []).length} columns
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex items-center gap-2">
          <Button type="button" size="sm" variant={activeView === 'human' ? 'default' : 'secondary'} onClick={() => setActiveView('human')}>
            <Table className="h-3.5 w-3.5" />
            Human Readable
          </Button>
          <Button type="button" size="sm" variant={activeView === 'json' ? 'default' : 'secondary'} onClick={() => setActiveView('json')}>
            <FileJson className="h-3.5 w-3.5" />
            Raw JSON
          </Button>
          <Badge variant="outline">{schemaRows.length} fields</Badge>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeView === 'human' ? (
            <section className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Table className="h-4 w-4" />
                  Human Readable
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => copyToClipboard('Human readable schema', schemaHumanText)}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
              <div className="max-h-[56vh] overflow-auto rounded-md border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Column</th>
                      <th className="px-3 py-2 text-left">Detected Type</th>
                      <th className="px-3 py-2 text-left">Semantic Type</th>
                      <th className="px-3 py-2 text-left">Storage Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {schemaRows.length ? (
                      schemaRows.map((row) => (
                        <tr key={`${row.index}-${row.name}`}>
                          <td className="px-3 py-2 text-slate-500">{row.index}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{row.name || '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.detected_dtype || '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.semantic_type || '-'}</td>
                          <td className="px-3 py-2 text-slate-600">{row.storage_name || '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>No schema columns available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileJson className="h-4 w-4" />
                  Raw JSON
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => copyToClipboard('Schema JSON', schemaJson)}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
              <pre className="max-h-[56vh] overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
                <code>{schemaJson}</code>
              </pre>
            </section>
          )}

          {copyState ? <p className="mt-2 text-xs text-emerald-700">{copyState}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SchemaModal;
