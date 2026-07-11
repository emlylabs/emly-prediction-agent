import { useEffect, useMemo, useState } from 'react';
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

function ConnectorIngestModal({
  open,
  onClose,
  folders = [],
  onImported,
  editingConnector = null,
  initialConnectorId = '',
  initialDriver = '',
  onConnectorChanged,
}) {
  const [connectors, setConnectors] = useState([]);
  const [loadingConnectors, setLoadingConnectors] = useState(false);
  const [savingConnector, setSavingConnector] = useState(false);
  const [discoveringTables, setDiscoveringTables] = useState(false);
  const [savingMappings, setSavingMappings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('mapping');
  const [connectorKind, setConnectorKind] = useState('sql');

  const [connectorForm, setConnectorForm] = useState({
    name: '',
    driver: 'postgresql',
    database: '',
    host: 'localhost',
    port: 5432,
    username: '',
    password: '',
    read_only: true,
    connect_timeout_seconds: 10,
    mysql_ssl_mode: 'disable',
    mysql_ssl_ca: '',
    mysql_ssl_cert: '',
    mysql_ssl_key: '',
    mysql_ssl_check_hostname: false,
  });

  const [selectedConnectorId, setSelectedConnectorId] = useState('');
  const [maxRowsPerTable, setMaxRowsPerTable] = useState(500000);
  const [tableMappings, setTableMappings] = useState([]);
  const [sftpCurrentDirectory, setSftpCurrentDirectory] = useState('');
  const [sftpForm, setSftpForm] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    private_key_path: '',
    private_key_passphrase: '',
    remote_path: '.',
    connect_timeout_seconds: 15,
    recursive: true,
    strict_host_key_check: false,
    known_hosts_path: '',
  });

  const folderOptions = useMemo(() => {
    const names = (folders || []).map((folder) => String(folder.path || folder.name || '').trim()).filter(Boolean);
    if (!names.includes('default')) names.unshift('default');
    return Array.from(new Set(names));
  }, [folders]);

  const selectedConnector = connectors.find((row) => row.connector_id === selectedConnectorId) || null;
  const showMysqlTls = connectorKind === 'sql' && connectorForm.driver === 'mysql';
  const isSftpSelected = String(selectedConnector?.connector_type || '').toLowerCase() === 'sftp';

  const loadConnectors = async () => {
    setLoadingConnectors(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/connectors`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to fetch connectors');
      const rows = body.connectors || [];
      setConnectors(rows);
      setSelectedConnectorId((prev) => prev || rows[0]?.connector_id || '');
    } catch (err) {
      setError(err.message || 'Failed to fetch connectors');
    } finally {
      setLoadingConnectors(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadConnectors().catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!initialConnectorId) return;
    setSelectedConnectorId(initialConnectorId);
    setActiveTab('mapping');
  }, [initialConnectorId, open]);

  useEffect(() => {
    if (!open) return;
    if (!initialDriver) return;
    if (editingConnector) return;
    if (initialDriver === 'sftp') {
      setConnectorKind('sftp');
    } else {
      setConnectorKind('sql');
      setConnectorForm((prev) => ({ ...prev, driver: initialDriver }));
    }
    setActiveTab('info');
  }, [editingConnector, initialDriver, open]);

  useEffect(() => {
    if (!open) return;
    if (!editingConnector) return;
    const config = editingConnector.config || {};
    const type = String(editingConnector.connector_type || '').toLowerCase();
    setSelectedConnectorId(editingConnector.connector_id || '');
    if (type === 'sftp') {
      setConnectorKind('sftp');
      setSftpForm({
        name: editingConnector.name || '',
        host: config.host || '',
        port: Number(config.port || 22),
        username: config.username || '',
        password: '',
        private_key_path: config.private_key_path || '',
        private_key_passphrase: '',
        remote_path: config.remote_path || '.',
        connect_timeout_seconds: Number(config.connect_timeout_seconds || 15),
        recursive: Boolean(config.recursive ?? true),
        strict_host_key_check: Boolean(config.strict_host_key_check || false),
        known_hosts_path: config.known_hosts_path || '',
      });
    } else {
      setConnectorKind('sql');
      setConnectorForm({
        name: editingConnector.name || '',
        driver: config.driver || 'postgresql',
        database: config.database || '',
        host: config.host || 'localhost',
        port: Number(config.port || 5432),
        username: config.username || '',
        password: '',
        read_only: Boolean(config.read_only ?? true),
        connect_timeout_seconds: Number(config.connect_timeout_seconds || 10),
        mysql_ssl_mode: config.mysql_ssl_mode || 'disable',
        mysql_ssl_ca: config.mysql_ssl_ca || '',
        mysql_ssl_cert: config.mysql_ssl_cert || '',
        mysql_ssl_key: config.mysql_ssl_key || '',
        mysql_ssl_check_hostname: Boolean(config.mysql_ssl_check_hostname || false),
      });
    }
    setActiveTab('info');
  }, [editingConnector, open]);

  useEffect(() => {
    if (!open) return;
    if (!folderOptions.length) return;
    setTableMappings((prev) => prev.map((row) => ({ ...row, folder: row.folder || folderOptions[0] })));
  }, [folderOptions, open]);

  useEffect(() => {
    if (open) return;
    setConnectorKind('sql');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!selectedConnectorId) return;
    if (activeTab !== 'mapping' && !editingConnector) return;
    const current = connectors.find((row) => row.connector_id === selectedConnectorId);
    if (!current) return;
    const type = String(current.connector_type || '').toLowerCase();
    if (type === 'sftp') setConnectorKind('sftp');
    if (type === 'sql') setConnectorKind('sql');
  }, [activeTab, connectors, editingConnector, open, selectedConnectorId]);

  const onSaveConnector = async (event) => {
    event.preventDefault();
    if (savingConnector) return;
    setSavingConnector(true);
    setError('');
    setStatusMessage('');
    try {
      const isEditing = Boolean(editingConnector?.connector_id);
      let endpoint = '';
      let payload = {};

      if (connectorKind === 'sftp') {
        endpoint = isEditing
          ? `${API_BASE}/connectors/${encodeURIComponent(editingConnector.connector_id)}/sftp`
          : `${API_BASE}/connectors/sftp`;
        payload = {
          ...sftpForm,
          port: Number(sftpForm.port || 22),
          connect_timeout_seconds: Number(sftpForm.connect_timeout_seconds || 15),
          password: sftpForm.password || null,
          private_key_path: sftpForm.private_key_path || null,
          private_key_passphrase: sftpForm.private_key_passphrase || null,
          known_hosts_path: sftpForm.known_hosts_path || null,
        };
      } else {
        endpoint = isEditing
          ? `${API_BASE}/connectors/${encodeURIComponent(editingConnector.connector_id)}/sql`
          : `${API_BASE}/connectors/sql`;
        payload = {
          ...connectorForm,
          port: connectorForm.driver === 'sqlite' ? null : Number(connectorForm.port),
          host: connectorForm.driver === 'sqlite' ? null : connectorForm.host,
          username: connectorForm.driver === 'sqlite' ? null : connectorForm.username,
          password: connectorForm.driver === 'sqlite' ? null : connectorForm.password,
          mysql_ssl_mode: connectorForm.mysql_ssl_mode,
          mysql_ssl_ca: connectorForm.mysql_ssl_ca || null,
          mysql_ssl_cert: connectorForm.mysql_ssl_cert || null,
          mysql_ssl_key: connectorForm.mysql_ssl_key || null,
          mysql_ssl_check_hostname: Boolean(connectorForm.mysql_ssl_check_hostname),
        };
      }
      const res = await fetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to save connector');
      setStatusMessage(`Connector "${body.connector?.name || payload.name}" ${isEditing ? 'updated' : 'saved'}.`);
      await loadConnectors();
      setSelectedConnectorId(body.connector?.connector_id || '');
      setTableMappings([]);
      if (onConnectorChanged) await onConnectorChanged(body.connector);
    } catch (err) {
      setError(err.message || 'Failed to save connector');
    } finally {
      setSavingConnector(false);
    }
  };

  const onDiscoverTables = async () => {
    if (!selectedConnectorId || discoveringTables) return;
    setDiscoveringTables(true);
    setError('');
    setStatusMessage('');
    try {
      const testRes = await fetch(`${API_BASE}/connectors/${encodeURIComponent(selectedConnectorId)}/test`, { method: 'POST' });
      const testBody = await testRes.json();
      if (!testRes.ok) throw new Error(testBody.detail || 'Connection test failed');

      const res = await fetch(`${API_BASE}/connectors/${encodeURIComponent(selectedConnectorId)}/tables`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to list tables');
      const mappings = (body.table_mappings || []).map((row) => ({ ...row, folder: row.folder || folderOptions[0] || 'default' }));
      setTableMappings(mappings);
      const connectorType = String((body.connector || {}).connector_type || '').toLowerCase();
      if (connectorType === 'sftp') {
        const root = mappings.find((row) => Number(row.depth || 0) === 0)?.source_table || mappings[0]?.source_table || '';
        setSftpCurrentDirectory(root);
        setStatusMessage(`Connection successful. Found ${(body.tables || []).length} director${(body.tables || []).length === 1 ? 'y' : 'ies'}.`);
      } else {
        setStatusMessage(`Connection successful. Found ${(body.tables || []).length} table(s).`);
      }
    } catch (err) {
      setError(err.message || 'Failed to discover tables');
    } finally {
      setDiscoveringTables(false);
    }
  };

  const updateMapping = (sourceTable, patch) => {
    setTableMappings((prev) => prev.map((row) => (row.source_table === sourceTable ? { ...row, ...patch } : row)));
  };

  const onSaveMappings = async () => {
    if (!selectedConnectorId || savingMappings) return;
    setSavingMappings(true);
    setError('');
    setStatusMessage('');
    try {
      const res = await fetch(`${API_BASE}/connectors/${encodeURIComponent(selectedConnectorId)}/tables`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_mappings: tableMappings }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to save table mappings');
      setStatusMessage('Table mappings saved.');
      if (body?.connector?.table_mappings) setTableMappings(body.connector.table_mappings);
    } catch (err) {
      setError(err.message || 'Failed to save table mappings');
    } finally {
      setSavingMappings(false);
    }
  };

  const onSync = async () => {
    if (!selectedConnectorId || syncing) return;
    setSyncing(true);
    setError('');
    setStatusMessage('');
    try {
      const saveRes = await fetch(`${API_BASE}/connectors/${encodeURIComponent(selectedConnectorId)}/tables`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_mappings: tableMappings }),
      });
      const saveBody = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveBody.detail || 'Failed to save table mappings');

      const res = await fetch(`${API_BASE}/connectors/${encodeURIComponent(selectedConnectorId)}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_rows_per_table: Number(maxRowsPerTable || 500000) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to sync connector tables');

      const successful = (body.results || []).filter((item) => ['created', 'updated'].includes(item.status));
      const failed = (body.results || []).filter((item) => item.status === 'failed');
      setStatusMessage(`Sync complete. ${successful.length} table(s) synced, ${failed.length} failed.`);

      const latestDataset = successful[successful.length - 1]?.dataset;
      if (latestDataset && onImported) await onImported(latestDataset);
      if (onConnectorChanged) await onConnectorChanged(body.connector);
      await onDiscoverTables();
    } catch (err) {
      setError(err.message || 'Failed to sync connector tables');
    } finally {
      setSyncing(false);
    }
  };

  const enabledCount = tableMappings.filter((row) => row.enabled).length;
  const sftpVisibleRows = useMemo(() => {
    if (!isSftpSelected) return tableMappings;
    if (!sftpCurrentDirectory) return tableMappings.filter((row) => Number(row.depth || 0) === 0);
    return tableMappings.filter((row) => String(row.parent_path || '') === String(sftpCurrentDirectory));
  }, [isSftpSelected, sftpCurrentDirectory, tableMappings]);
  const sftpDirectoryStack = useMemo(() => {
    if (!isSftpSelected || !sftpCurrentDirectory) return [];
    const byPath = new Map(tableMappings.map((row) => [String(row.source_table), row]));
    const chain = [];
    let cursor = byPath.get(String(sftpCurrentDirectory));
    while (cursor) {
      chain.unshift(cursor);
      const parent = String(cursor.parent_path || '');
      if (!parent) break;
      cursor = byPath.get(parent);
    }
    return chain;
  }, [isSftpSelected, sftpCurrentDirectory, tableMappings]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="upload-dataset-dialog connector-sync-modal" style={{ maxWidth: '1040px' }}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Connector Sync</DialogTitle>
          <DialogDescription>Configure connection details and sync selected source tables into datasets.</DialogDescription>
        </DialogHeader>

        <div className="connector-sync-body flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
          <div className="connector-tab-grid grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setActiveTab('mapping')}
              className={`connector-tab-button rounded-lg border px-4 py-3 text-left transition ${activeTab === 'mapping' ? 'is-active border-slate-900 bg-slate-900' : 'is-inactive border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
            >
              <p className="connector-tab-title text-sm font-semibold">Data Mapping & Sync</p>
              <p className="connector-tab-subtitle mt-1 text-xs">Select connector, test, map tables, sync datasets.</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`connector-tab-button rounded-lg border px-4 py-3 text-left transition ${activeTab === 'info' ? 'is-active border-slate-900 bg-slate-900' : 'is-inactive border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
            >
              <p className="connector-tab-title text-sm font-semibold">Connector Info</p>
              <p className="connector-tab-subtitle mt-1 text-xs">Create or update connector credentials and settings.</p>
            </button>
          </div>

          {activeTab === 'info' ? (
            <form className="connector-info-form space-y-4 overflow-x-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={onSaveConnector}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-900">Connection Settings</p>
                  <p className="text-xs text-slate-600">Save credentials and network details for this connector.</p>
                </div>
                <Button type="submit" disabled={savingConnector}>{savingConnector ? 'Saving...' : 'Save Connector'}</Button>
              </div>

              {connectorKind === 'sql' ? (
                <>
                  <div className="connector-info-grid grid gap-4 lg:grid-cols-2">
                    <div className="connector-panel min-w-0 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Basic</p>
                      <div className="space-y-2">
                        <Label htmlFor="connector-name">Connector Name</Label>
                        <Input id="connector-name" value={connectorForm.name} onChange={(e) => setConnectorForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="sales-warehouse" required />
                      </div>
                      <div className="connector-subgrid grid gap-3 sm:grid-cols-2">
                        <div className="min-w-0 space-y-2">
                          <Label htmlFor="connector-driver">Driver</Label>
                          <select id="connector-driver" className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20" value={connectorForm.driver} onChange={(e) => setConnectorForm((prev) => ({ ...prev, driver: e.target.value }))}>
                            <option value="postgresql">PostgreSQL</option>
                            <option value="sqlite">SQLite</option>
                            <option value="mysql">MySQL</option>
                            <option value="mssql">MS SQL Server</option>
                            <option value="oracle">Oracle</option>
                          </select>
                        </div>
                        <div className="min-w-0 space-y-2">
                          <Label htmlFor="connector-database">Database</Label>
                          <Input id="connector-database" value={connectorForm.database} onChange={(e) => setConnectorForm((prev) => ({ ...prev, database: e.target.value }))} placeholder={connectorForm.driver === 'sqlite' ? '/path/to/file.db or :memory:' : 'analytics_v1'} required />
                        </div>
                      </div>
                    </div>

                    <div className="connector-panel min-w-0 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Authentication</p>
                      {connectorForm.driver !== 'sqlite' ? (
                        <>
                          <div className="connector-subgrid grid gap-3 sm:grid-cols-2">
                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="connector-host">Host</Label>
                              <Input id="connector-host" value={connectorForm.host} onChange={(e) => setConnectorForm((prev) => ({ ...prev, host: e.target.value }))} placeholder="localhost" required />
                            </div>
                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="connector-port">Port</Label>
                              <Input id="connector-port" type="number" value={connectorForm.port} onChange={(e) => setConnectorForm((prev) => ({ ...prev, port: e.target.value }))} min={1} max={65535} required />
                            </div>
                          </div>
                          <div className="connector-subgrid grid gap-3 sm:grid-cols-2">
                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="connector-username">Username</Label>
                              <Input id="connector-username" value={connectorForm.username} onChange={(e) => setConnectorForm((prev) => ({ ...prev, username: e.target.value }))} required />
                            </div>
                            <div className="min-w-0 space-y-2">
                              <Label htmlFor="connector-password">Password</Label>
                              <Input id="connector-password" type="password" value={connectorForm.password} onChange={(e) => setConnectorForm((prev) => ({ ...prev, password: e.target.value }))} required={!editingConnector} placeholder={editingConnector ? 'Leave blank to keep existing password' : ''} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-slate-600">SQLite uses only the database file path.</p>
                      )}
                    </div>
                  </div>

                  {showMysqlTls ? (
                    <div className="connector-panel space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">MySQL TLS</p>
                      <div className="connector-tls-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="min-w-0 space-y-2">
                          <Label htmlFor="mysql-ssl-mode">SSL Mode</Label>
                          <select id="mysql-ssl-mode" className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20" value={connectorForm.mysql_ssl_mode} onChange={(e) => setConnectorForm((prev) => ({ ...prev, mysql_ssl_mode: e.target.value }))}>
                            <option value="disable">Disable</option>
                            <option value="preferred">Preferred</option>
                            <option value="required">Required</option>
                            <option value="verify_ca">Verify CA</option>
                            <option value="verify_identity">Verify Identity</option>
                          </select>
                        </div>
                        <div className="min-w-0 space-y-2">
                          <Label htmlFor="mysql-ssl-ca">CA Path</Label>
                          <Input id="mysql-ssl-ca" value={connectorForm.mysql_ssl_ca} onChange={(e) => setConnectorForm((prev) => ({ ...prev, mysql_ssl_ca: e.target.value }))} placeholder="/path/to/ca.pem" />
                        </div>
                        <div className="min-w-0 space-y-2">
                          <Label htmlFor="mysql-ssl-cert">Client Cert</Label>
                          <Input id="mysql-ssl-cert" value={connectorForm.mysql_ssl_cert} onChange={(e) => setConnectorForm((prev) => ({ ...prev, mysql_ssl_cert: e.target.value }))} placeholder="/path/to/client-cert.pem" />
                        </div>
                        <div className="min-w-0 space-y-2">
                          <Label htmlFor="mysql-ssl-key">Client Key</Label>
                          <Input id="mysql-ssl-key" value={connectorForm.mysql_ssl_key} onChange={(e) => setConnectorForm((prev) => ({ ...prev, mysql_ssl_key: e.target.value }))} placeholder="/path/to/client-key.pem" />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-6 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700" htmlFor="connector-read-only">
                      <input id="connector-read-only" type="checkbox" checked={connectorForm.read_only} onChange={(e) => setConnectorForm((prev) => ({ ...prev, read_only: e.target.checked }))} />
                      Read-only mode
                    </label>
                    {showMysqlTls ? (
                      <label className="flex items-center gap-2 text-sm text-slate-700" htmlFor="mysql-ssl-check-hostname">
                        <input id="mysql-ssl-check-hostname" type="checkbox" checked={Boolean(connectorForm.mysql_ssl_check_hostname)} onChange={(e) => setConnectorForm((prev) => ({ ...prev, mysql_ssl_check_hostname: e.target.checked }))} />
                        Check hostname
                      </label>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="connector-info-grid grid gap-4 lg:grid-cols-2">
                    <div className="connector-panel min-w-0 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Connection</p>
                      <div className="space-y-2">
                        <Label htmlFor="sftp-name">Connector Name</Label>
                        <Input id="sftp-name" value={sftpForm.name} onChange={(e) => setSftpForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="sftp-ingest" required />
                      </div>
                      <div className="connector-subgrid grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="sftp-host">Host</Label>
                          <Input id="sftp-host" value={sftpForm.host} onChange={(e) => setSftpForm((prev) => ({ ...prev, host: e.target.value }))} placeholder="sftp.example.com" required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sftp-port">Port</Label>
                          <Input id="sftp-port" type="number" min={1} max={65535} value={sftpForm.port} onChange={(e) => setSftpForm((prev) => ({ ...prev, port: e.target.value }))} required />
                        </div>
                      </div>
                      <div className="connector-subgrid grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="sftp-username">Username</Label>
                          <Input id="sftp-username" value={sftpForm.username} onChange={(e) => setSftpForm((prev) => ({ ...prev, username: e.target.value }))} required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sftp-timeout">Connect Timeout (s)</Label>
                          <Input id="sftp-timeout" type="number" min={1} max={120} value={sftpForm.connect_timeout_seconds} onChange={(e) => setSftpForm((prev) => ({ ...prev, connect_timeout_seconds: e.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sftp-remote-path">Remote Path</Label>
                        <Input id="sftp-remote-path" value={sftpForm.remote_path} onChange={(e) => setSftpForm((prev) => ({ ...prev, remote_path: e.target.value }))} placeholder="." required />
                      </div>
                    </div>

                    <div className="connector-panel min-w-0 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Authentication</p>
                      <div className="space-y-2">
                        <Label htmlFor="sftp-password">Password</Label>
                        <Input id="sftp-password" type="password" value={sftpForm.password} onChange={(e) => setSftpForm((prev) => ({ ...prev, password: e.target.value }))} placeholder={editingConnector ? 'Leave blank to keep existing password' : 'Optional if key path is set'} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sftp-key-path">Private Key Path</Label>
                        <Input id="sftp-key-path" value={sftpForm.private_key_path} onChange={(e) => setSftpForm((prev) => ({ ...prev, private_key_path: e.target.value }))} placeholder="/path/to/id_rsa" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sftp-key-passphrase">Key Passphrase</Label>
                        <Input id="sftp-key-passphrase" type="password" value={sftpForm.private_key_passphrase} onChange={(e) => setSftpForm((prev) => ({ ...prev, private_key_passphrase: e.target.value }))} placeholder={editingConnector ? 'Leave blank to keep existing passphrase' : 'Optional'} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sftp-known-hosts">Known Hosts Path</Label>
                        <Input id="sftp-known-hosts" value={sftpForm.known_hosts_path} onChange={(e) => setSftpForm((prev) => ({ ...prev, known_hosts_path: e.target.value }))} placeholder="/Users/me/.ssh/known_hosts" />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700" htmlFor="sftp-recursive">
                      <input id="sftp-recursive" type="checkbox" checked={Boolean(sftpForm.recursive)} onChange={(e) => setSftpForm((prev) => ({ ...prev, recursive: e.target.checked }))} />
                      Recursive file discovery
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700" htmlFor="sftp-strict-host-key">
                      <input id="sftp-strict-host-key" type="checkbox" checked={Boolean(sftpForm.strict_host_key_check)} onChange={(e) => setSftpForm((prev) => ({ ...prev, strict_host_key_check: e.target.checked }))} />
                      Strict host key check
                    </label>
                  </div>
                </>
              )}
            </form>
          ) : null}

          {activeTab === 'mapping' ? (
            <section className="connector-mapping-section space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="connector-mapping-toolbar flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 space-y-2 sm:min-w-[280px]">
                  <Label htmlFor="selected-connector">Connector</Label>
                  <select id="selected-connector" className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20" value={selectedConnectorId} onChange={(e) => setSelectedConnectorId(e.target.value)} disabled={loadingConnectors}>
                    <option value="">Select connector</option>
                    {connectors.map((connector) => (
                      <option key={connector.connector_id} value={connector.connector_id}>{connector.name} ({connector.config?.driver || connector.connector_type || 'connector'})</option>
                    ))}
                  </select>
                </div>
                <div className="connector-max-rows w-full max-w-[180px] space-y-2">
                  <Label htmlFor="max-rows">{isSftpSelected ? 'Max Rows / File' : 'Max Rows / Table'}</Label>
                  <Input id="max-rows" type="number" min={1} max={2000000} value={maxRowsPerTable} onChange={(e) => setMaxRowsPerTable(e.target.value)} />
                </div>
                <Button type="button" variant="secondary" onClick={onDiscoverTables} disabled={!selectedConnectorId || discoveringTables}>{discoveringTables ? 'Testing...' : 'Test & Load'}</Button>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {selectedConnector ? `Selected: ${selectedConnector.name} (${selectedConnector.config?.driver || selectedConnector.connector_type || 'connector'})` : 'Select a connector, test it, and load source objects before mapping.'}
              </div>

              {isSftpSelected ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">Directory:</span>
                    {sftpDirectoryStack.length ? (
                      sftpDirectoryStack.map((row, index) => (
                        <button
                          key={row.source_table}
                          type="button"
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                          onClick={() => setSftpCurrentDirectory(row.source_table)}
                          disabled={index === sftpDirectoryStack.length - 1}
                        >
                          {String(row.source_table).split('/').filter(Boolean).slice(-1)[0] || row.source_table}
                        </button>
                      ))
                    ) : (
                      <span>Root</span>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="connector-table-wrap max-h-[340px] overflow-x-auto overflow-y-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Sync</th>
                      <th className="px-3 py-2">{isSftpSelected ? 'Directory' : 'Source'}</th>
                      {isSftpSelected ? <th className="px-3 py-2">Files</th> : <th className="px-3 py-2">Dataset Name</th>}
                      {isSftpSelected ? <th className="px-3 py-2">Folders</th> : <th className="px-3 py-2">Folder</th>}
                      <th className="px-3 py-2">{isSftpSelected ? 'Dataset Folder' : 'Link'}</th>
                      {isSftpSelected ? <th className="px-3 py-2">Navigate</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(isSftpSelected ? sftpVisibleRows : tableMappings).length ? (isSftpSelected ? sftpVisibleRows : tableMappings).map((row) => (
                      <tr key={row.source_table}>
                        <td className="px-3 py-2"><input type="checkbox" checked={Boolean(row.enabled)} onChange={(e) => updateMapping(row.source_table, { enabled: e.target.checked })} aria-label={`Select ${row.source_table}`} /></td>
                        <td className="px-3 py-2 font-medium text-slate-900">{row.source_table}</td>
                        {isSftpSelected ? (
                          <>
                            <td className="px-3 py-2 text-slate-700">{Number(row.file_count || 0)}</td>
                            <td className="px-3 py-2 text-slate-700">{Number(row.folder_count || 0)}</td>
                            <td className="px-3 py-2">
                              <select className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20" value={row.folder || 'default'} onChange={(e) => updateMapping(row.source_table, { folder: e.target.value })}>
                                {folderOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <Button type="button" variant="secondary" onClick={() => setSftpCurrentDirectory(row.source_table)} disabled={!Number(row.folder_count || 0)}>
                                Open
                              </Button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2"><Input value={row.dataset_name || ''} onChange={(e) => updateMapping(row.source_table, { dataset_name: e.target.value })} placeholder={`${row.source_table}.csv`} /></td>
                            <td className="px-3 py-2">
                              <select className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20" value={row.folder || 'default'} onChange={(e) => updateMapping(row.source_table, { folder: e.target.value })}>
                                {folderOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600">{row.dataset_id ? `Mapped (${row.dataset_id.slice(0, 8)}...)` : 'New dataset'}</td>
                          </>
                        )}
                      </tr>
                    )) : (
                      <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={isSftpSelected ? 6 : 5}>No source objects loaded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs text-slate-600">
                  {enabledCount} {isSftpSelected ? (enabledCount === 1 ? 'directory' : 'directories') : (enabledCount === 1 ? 'table' : 'tables')} selected for sync
                </span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" onClick={onSaveMappings} disabled={!selectedConnectorId || savingMappings || !tableMappings.length}>{savingMappings ? 'Saving...' : 'Save Mappings'}</Button>
                  <Button type="button" onClick={onSync} disabled={!selectedConnectorId || syncing || !enabledCount}>{syncing ? 'Syncing...' : 'Run Sync'}</Button>
                </div>
              </div>
            </section>
          ) : null}

          {statusMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{statusMessage}</div> : null}
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConnectorIngestModal;
