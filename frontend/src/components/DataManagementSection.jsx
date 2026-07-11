import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, Download, Eye, Folder, FolderOpen, MoreHorizontal, Pencil, Sparkles, Trash2, Upload } from 'lucide-react';
import UploadDatasetModal from './UploadDatasetModal';
import ConnectorIngestModal from './ConnectorIngestModal';
import NewConnectorModal from './NewConnectorModal';
import CreateFolderModal from './CreateFolderModal';
import DeleteDatasetModal from './DeleteDatasetModal';
import DeleteFolderModal from './DeleteFolderModal';
import DataPreparationScreen from './DataPreparationScreen';
import InsightsModal from './InsightsModal';
import SchemaModal from './SchemaModal';
import DatasetExplorerModal from './DatasetExplorerModal';
import RenameFolderModal from './RenameFolderModal';
import RenameDatasetModal from './RenameDatasetModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const API_BASE = '/emly/api/prediction';
const FOLDER_LABEL_MAX = 18;

function truncateLabel(value, max = FOLDER_LABEL_MAX) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}\u2026`;
}

function formatDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function DataManagementSection({
  datasets,
  folders,
  onDataChanged,
  onUploadModalOpenChange,
  onPrepareDataset,
  prepareDataset,
  onClosePrepare,
  uploadQueueItems,
  uploadQueueRunning,
  uploadQueueOverallProgress,
  onStartUploads,
  onPauseUploads,
  onResumeUploads,
  latestUploadedDataset,
}) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showConnectorModal, setShowConnectorModal] = useState(false);
  const [showNewConnectorModal, setShowNewConnectorModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteFolderModal, setShowDeleteFolderModal] = useState(false);
  const [showRenameFolderModal, setShowRenameFolderModal] = useState(false);
  const [showRenameDatasetModal, setShowRenameDatasetModal] = useState(false);
  const [showInsightsModal, setShowInsightsModal] = useState(false);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);

  const [insightTarget, setInsightTarget] = useState(null);
  const [schemaTarget, setSchemaTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState(null);
  const [renameDatasetTarget, setRenameDatasetTarget] = useState(null);
  const [deleteTargets, setDeleteTargets] = useState([]);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);

  const [deleting, setDeleting] = useState(false);
  const [movingDatasetId, setMovingDatasetId] = useState(null);
  const [deletingFolderId, setDeletingFolderId] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuDatasetId, setOpenMenuDatasetId] = useState(null);
  const [openMenuPosition, setOpenMenuPosition] = useState(null);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);
  const [latestConnectorDataset, setLatestConnectorDataset] = useState(null);
  const [managementTab, setManagementTab] = useState('datasets');
  const [connectors, setConnectors] = useState([]);
  const [loadingConnectors, setLoadingConnectors] = useState(false);
  const [connectorActionBusyId, setConnectorActionBusyId] = useState(null);
  const [connectorError, setConnectorError] = useState('');
  const [editingConnector, setEditingConnector] = useState(null);
  const [connectorModalInitialId, setConnectorModalInitialId] = useState('');
  const [connectorModalInitialDriver, setConnectorModalInitialDriver] = useState('');
  const [openConnectorMenuId, setOpenConnectorMenuId] = useState(null);
  const [openConnectorMenuPosition, setOpenConnectorMenuPosition] = useState(null);
  const [prepPlans, setPrepPlans] = useState([]);
  const [loadingPrepPlans, setLoadingPrepPlans] = useState(false);
  const [prepPlansError, setPrepPlansError] = useState('');
  const [showPlanViewModal, setShowPlanViewModal] = useState(false);
  const [viewingPlanId, setViewingPlanId] = useState('');
  const [planDetail, setPlanDetail] = useState(null);
  const [loadingPlanDetail, setLoadingPlanDetail] = useState(false);
  const [planDetailError, setPlanDetailError] = useState('');
  const [planActionBusyId, setPlanActionBusyId] = useState('');
  const [openPlanMenuId, setOpenPlanMenuId] = useState(null);
  const [openPlanMenuPosition, setOpenPlanMenuPosition] = useState(null);

  const closeKebabMenu = () => {
    setOpenMenuDatasetId(null);
    setOpenMenuPosition(null);
  };

  const getMenuPosition = (triggerElement) => {
    const rect = triggerElement.getBoundingClientRect();
    const menuWidth = 172;
    const estimatedMenuHeight = 292;
    const viewportPadding = 8;

    let left = rect.right - menuWidth;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - menuWidth - viewportPadding));

    let top = rect.bottom + 6;
    if (top + estimatedMenuHeight > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, rect.top - estimatedMenuHeight - 6);
    }
    return { top, left };
  };

  useEffect(() => {
    onUploadModalOpenChange?.(showUploadModal);
  }, [onUploadModalOpenChange, showUploadModal]);

  useEffect(() => {
    if (!openMenuDatasetId) return undefined;

    const onDocumentMouseDown = (event) => {
      if (!(event.target instanceof Element)) {
        closeKebabMenu();
        return;
      }
      if (!event.target.closest('.kebab-menu') && !event.target.closest('.kebab-dropdown-floating')) {
        closeKebabMenu();
      }
    };

    const onDocumentKeyDown = (event) => {
      if (event.key === 'Escape') closeKebabMenu();
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [openMenuDatasetId]);

  useEffect(() => {
    if (!openConnectorMenuId) return undefined;

    const onDocumentMouseDown = (event) => {
      if (!(event.target instanceof Element)) {
        setOpenConnectorMenuId(null);
        setOpenConnectorMenuPosition(null);
        return;
      }
      if (!event.target.closest('.kebab-menu') && !event.target.closest('.kebab-dropdown-floating')) {
        setOpenConnectorMenuId(null);
        setOpenConnectorMenuPosition(null);
      }
    };

    const onDocumentKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenConnectorMenuId(null);
        setOpenConnectorMenuPosition(null);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [openConnectorMenuId]);

  useEffect(() => {
    if (!openPlanMenuId) return undefined;

    const onDocumentMouseDown = (event) => {
      if (!(event.target instanceof Element)) {
        setOpenPlanMenuId(null);
        setOpenPlanMenuPosition(null);
        return;
      }
      if (!event.target.closest('.kebab-menu') && !event.target.closest('.kebab-dropdown-floating')) {
        setOpenPlanMenuId(null);
        setOpenPlanMenuPosition(null);
      }
    };

    const onDocumentKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenPlanMenuId(null);
        setOpenPlanMenuPosition(null);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [openPlanMenuId]);

  useEffect(() => {
    if (!openConnectorMenuId) return undefined;

    const onViewportChange = () => {
      setOpenConnectorMenuId(null);
      setOpenConnectorMenuPosition(null);
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [openConnectorMenuId]);

  useEffect(() => {
    if (!openPlanMenuId) return undefined;

    const onViewportChange = () => {
      setOpenPlanMenuId(null);
      setOpenPlanMenuPosition(null);
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [openPlanMenuId]);

  useEffect(() => {
    if (!openMenuDatasetId) return undefined;

    const onViewportChange = () => {
      closeKebabMenu();
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [openMenuDatasetId]);

  const folderStats = useMemo(() => {
    const map = new Map();
    (folders || []).forEach((folder) => {
      const folderPath = folder.path || folder.name;
      if (!folderPath) return;
      map.set(folderPath, {
        id: folder.id || null,
        name: folderPath,
        displayName: folder.display_name || folderPath,
        count: Number(folder.file_count || 0),
        canDelete: Boolean(folder.id) && folderPath !== 'default',
      });
    });
    (datasets || []).forEach((dataset) => {
      const folderName = dataset.folder || 'default';
      if (!map.has(folderName)) {
        map.set(folderName, {
          id: null,
          name: folderName,
          displayName: folderName,
          count: 1,
          canDelete: false,
        });
      }
    });
    return Array.from(map.values());
  }, [folders, datasets]);

  const filteredDatasets = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const byFolder = selectedFolder === 'all'
      ? (datasets || [])
      : (datasets || []).filter((dataset) => (dataset.folder || 'default') === selectedFolder);

    if (!normalizedSearch) return byFolder;
    return byFolder.filter((dataset) => {
      const filename = String(dataset?.original_filename || '').toLowerCase();
      const folderName = String(dataset?.folder || 'default').toLowerCase();
      const columns = (dataset?.columns || []).map((col) => String(col || '').toLowerCase()).join(' ');
      return filename.includes(normalizedSearch) || folderName.includes(normalizedSearch) || columns.includes(normalizedSearch);
    });
  }, [datasets, searchQuery, selectedFolder]);

  const selectedIdSet = useMemo(() => new Set(selectedDatasetIds), [selectedDatasetIds]);
  const selectedCount = selectedDatasetIds.length;
  const allFilteredSelected = filteredDatasets.length > 0 && filteredDatasets.every((ds) => selectedIdSet.has(ds.dataset_id));

  useEffect(() => {
    const validIds = new Set((datasets || []).map((dataset) => dataset.dataset_id));
    setSelectedDatasetIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [datasets]);

  const onFolderCreated = async () => {
    await onDataChanged();
  };

  const onRequestRenameFolder = (folder) => {
    if (!folder?.id || deletingFolderId) return;
    setRenameFolderTarget(folder);
    setShowRenameFolderModal(true);
  };

  const onRequestDeleteFolder = (folder) => {
    if (!folder?.id || deletingFolderId) return;
    setDeleteFolderTarget(folder);
    setShowDeleteFolderModal(true);
  };

  const onConfirmDeleteFolder = async () => {
    const folder = deleteFolderTarget;
    if (!folder?.id || deletingFolderId) return;

    setDeletingFolderId(folder.id);
    try {
      const res = await fetch(`${API_BASE}/folders/${encodeURIComponent(folder.id)}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to delete folder');
      if (selectedFolder === folder.name) setSelectedFolder('all');
      setShowDeleteFolderModal(false);
      setDeleteFolderTarget(null);
      await onDataChanged();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingFolderId(null);
    }
  };

  const onOpenDelete = (dataset) => {
    closeKebabMenu();
    setDeleteTargets(dataset ? [dataset] : []);
    setShowDeleteModal(true);
  };

  const onOpenDeleteSelected = () => {
    const targets = (datasets || []).filter((dataset) => selectedIdSet.has(dataset.dataset_id));
    if (!targets.length) return;
    setDeleteTargets(targets);
    setShowDeleteModal(true);
  };

  const onOpenInsights = (dataset) => {
    closeKebabMenu();
    setInsightTarget(dataset);
    setShowInsightsModal(true);
  };

  const onOpenSchema = (dataset) => {
    closeKebabMenu();
    setSchemaTarget(dataset);
    setShowSchemaModal(true);
  };

  const onOpenMove = (dataset) => {
    closeKebabMenu();
    setMoveTarget(dataset || null);
    setShowMoveModal(Boolean(dataset));
  };

  const onOpenRenameDataset = (dataset) => {
    closeKebabMenu();
    setRenameDatasetTarget(dataset || null);
    setShowRenameDatasetModal(Boolean(dataset));
  };

  const onDownloadDataset = (dataset) => {
    if (!dataset?.dataset_id) return;
    closeKebabMenu();
    const link = document.createElement('a');
    link.href = `${API_BASE}/datasets/${encodeURIComponent(dataset.dataset_id)}/download`;
    link.setAttribute('download', dataset.original_filename || 'dataset');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const onConfirmDelete = async () => {
    const targetIds = deleteTargets.map((dataset) => dataset?.dataset_id).filter(Boolean);
    if (!targetIds.length) return;

    setDeleting(true);
    try {
      if (targetIds.length === 1) {
        const res = await fetch(`${API_BASE}/datasets/${targetIds[0]}`, { method: 'DELETE' });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || 'Failed to delete dataset');
      } else {
        const res = await fetch(`${API_BASE}/datasets/delete-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_ids: targetIds }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || 'Failed to delete datasets');
      }

      setShowDeleteModal(false);
      setDeleteTargets([]);
      const deletedIdSet = new Set(targetIds);
      setSelectedDatasetIds((prev) => prev.filter((id) => !deletedIdSet.has(id)));
      await onDataChanged();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const onMoveDatasetToFolder = async (folderPath) => {
    const target = moveTarget;
    if (!target?.dataset_id || !folderPath) return;
    setMovingDatasetId(target.dataset_id);
    try {
      const res = await fetch(`${API_BASE}/datasets/${encodeURIComponent(target.dataset_id)}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folderPath }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to move dataset');
      setShowMoveModal(false);
      setMoveTarget(null);
      await onDataChanged();
    } catch (err) {
      console.error(err);
    } finally {
      setMovingDatasetId(null);
    }
  };

  const onToggleDatasetSelection = (datasetId, checked) => {
    if (!datasetId) return;
    setSelectedDatasetIds((prev) => {
      if (checked) {
        if (prev.includes(datasetId)) return prev;
        return [...prev, datasetId];
      }
      return prev.filter((id) => id !== datasetId);
    });
  };

  const onToggleSelectAllFiltered = (checked) => {
    if (!filteredDatasets.length) return;
    const filteredIds = filteredDatasets.map((dataset) => dataset.dataset_id);
    setSelectedDatasetIds((prev) => {
      const next = new Set(prev);
      if (checked) filteredIds.forEach((id) => next.add(id));
      else filteredIds.forEach((id) => next.delete(id));
      return Array.from(next);
    });
  };

  const fetchConnectors = async () => {
    setLoadingConnectors(true);
    setConnectorError('');
    try {
      const res = await fetch(`${API_BASE}/connectors`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to load connectors');
      setConnectors(body.connectors || []);
    } catch (err) {
      setConnectorError(err.message || 'Failed to load connectors');
    } finally {
      setLoadingConnectors(false);
    }
  };

  useEffect(() => {
    if (managementTab !== 'connectors' && !showConnectorModal) return;
    fetchConnectors().catch(() => {});
  }, [managementTab, showConnectorModal]);

  const fetchPrepPlans = async () => {
    setLoadingPrepPlans(true);
    setPrepPlansError('');
    try {
      const res = await fetch(`${API_BASE}/prepare/copilot/plans`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to load preparation plans');
      setPrepPlans(Array.isArray(body.plans) ? body.plans : []);
    } catch (err) {
      setPrepPlansError(err.message || 'Failed to load preparation plans');
    } finally {
      setLoadingPrepPlans(false);
    }
  };

  useEffect(() => {
    if (managementTab !== 'prep_plans') return;
    fetchPrepPlans().catch(() => {});
  }, [managementTab]);

  const onViewPrepPlan = async (plan) => {
    const planId = String(plan?.plan_id || '').trim();
    if (!planId) return;
    setShowPlanViewModal(true);
    setViewingPlanId(planId);
    setPlanDetail(null);
    setPlanDetailError('');
    setLoadingPlanDetail(true);
    try {
      const res = await fetch(`${API_BASE}/prepare/copilot/plans/${encodeURIComponent(planId)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to load plan details');
      setPlanDetail(body.plan || null);
    } catch (err) {
      setPlanDetailError(err.message || 'Failed to load plan details');
    } finally {
      setLoadingPlanDetail(false);
    }
  };

  const onEditPrepPlan = async (plan) => {
    const planId = String(plan?.plan_id || '').trim();
    if (!planId) return;
    setOpenPlanMenuId(null);
    setOpenPlanMenuPosition(null);
    const currentName = String(plan?.name || 'Prep Plan').trim() || 'Prep Plan';
    const nextNameInput = window.prompt('Plan name', currentName);
    if (nextNameInput == null) return;
    const nextName = String(nextNameInput || '').trim();
    if (!nextName || nextName === currentName) return;

    setPlanActionBusyId(planId);
    setPrepPlansError('');
    try {
      const res = await fetch(`${API_BASE}/prepare/copilot/plans/${encodeURIComponent(planId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to update plan');
      setPrepPlans((prev) => prev.map((item) => {
        if (String(item?.plan_id || '') !== planId) return item;
        return { ...item, name: body.name || nextName, updated_at: body.updated_at || item.updated_at };
      }));
      if (viewingPlanId === planId && planDetail) {
        setPlanDetail((prev) => (prev ? { ...prev, name: body.name || nextName } : prev));
      }
    } catch (err) {
      setPrepPlansError(err.message || 'Failed to update plan');
    } finally {
      setPlanActionBusyId('');
    }
  };

  const onDeletePrepPlan = async (plan) => {
    const planId = String(plan?.plan_id || '').trim();
    if (!planId) return;
    setOpenPlanMenuId(null);
    setOpenPlanMenuPosition(null);
    const confirmed = window.confirm(`Delete plan "${plan?.name || planId}"?`);
    if (!confirmed) return;

    setPlanActionBusyId(planId);
    setPrepPlansError('');
    try {
      const res = await fetch(`${API_BASE}/prepare/copilot/plans/${encodeURIComponent(planId)}`, {
        method: 'DELETE',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to delete plan');
      setPrepPlans((prev) => prev.filter((item) => String(item?.plan_id || '') !== planId));
      if (viewingPlanId === planId) {
        setShowPlanViewModal(false);
        setViewingPlanId('');
        setPlanDetail(null);
        setPlanDetailError('');
      }
    } catch (err) {
      setPrepPlansError(err.message || 'Failed to delete plan');
    } finally {
      setPlanActionBusyId('');
    }
  };

  const viewedPlanVersions = useMemo(
    () => (Array.isArray(planDetail?.versions) ? planDetail.versions : []),
    [planDetail]
  );
  const viewedPlanLatest = useMemo(
    () => (viewedPlanVersions.length ? viewedPlanVersions[viewedPlanVersions.length - 1] : null),
    [viewedPlanVersions]
  );
  const viewedPlanSteps = useMemo(
    () => (Array.isArray(viewedPlanLatest?.plan?.steps) ? viewedPlanLatest.plan.steps : []),
    [viewedPlanLatest]
  );

  const onDeleteConnector = async (connector) => {
    if (!connector?.connector_id) return;
    const confirmed = window.confirm(`Delete connector \"${connector.name}\"?`);
    if (!confirmed) return;

    setConnectorActionBusyId(connector.connector_id);
    setConnectorError('');
    try {
      const res = await fetch(`${API_BASE}/connectors/${encodeURIComponent(connector.connector_id)}`, {
        method: 'DELETE',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to delete connector');
      await fetchConnectors();
    } catch (err) {
      setConnectorError(err.message || 'Failed to delete connector');
    } finally {
      setConnectorActionBusyId(null);
    }
  };

  const onEditConnector = (connector) => {
    setEditingConnector(connector || null);
    setConnectorModalInitialId(connector?.connector_id || '');
    setConnectorModalInitialDriver('');
    setShowConnectorModal(true);
  };

  if (prepareDataset) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardDescription className="text-slate-600">
              Active: <span className="font-semibold text-slate-900">{prepareDataset?.original_filename}</span> ({prepareDataset?.rows} rows, {(prepareDataset?.columns || []).length} columns)
            </CardDescription>
            <Button type="button" variant="secondary" onClick={onClosePrepare}>Back to Datasets</Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataPreparationScreen
            datasets={datasets}
            folders={folders}
            selectedDataset={prepareDataset}
            onSaved={async () => {
              await onDataChanged();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="data-management-card">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Data Management</CardTitle>
            <CardDescription>Manage datasets and connectors</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {managementTab === 'datasets' ? (
              <>
                <Button type="button" onClick={() => setShowUploadModal(true)}><Upload className="h-4 w-4" />New Upload</Button>
                <Button type="button" variant="secondary" onClick={() => setShowFolderModal(true)}><FolderOpen className="h-4 w-4" />New Folder</Button>
              </>
            ) : managementTab === 'connectors' ? (
              <Button type="button" onClick={() => { setShowNewConnectorModal(true); }}><Database className="h-4 w-4" />New Connector</Button>
            ) : (
              <Button type="button" variant="secondary" onClick={() => { fetchPrepPlans().catch(() => {}); }} disabled={loadingPrepPlans}>
                {loadingPrepPlans ? 'Refreshing...' : 'Refresh Plans'}
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant={managementTab === 'datasets' ? 'default' : 'secondary'} onClick={() => setManagementTab('datasets')}>
            Datasets
          </Button>
          <Button type="button" size="sm" variant={managementTab === 'connectors' ? 'default' : 'secondary'} onClick={() => setManagementTab('connectors')}>
            Connectors
          </Button>
          <Button type="button" size="sm" variant={managementTab === 'prep_plans' ? 'default' : 'secondary'} onClick={() => setManagementTab('prep_plans')}>
            Preparation Plans
          </Button>
        </div>
        {latestUploadedDataset ? (
          <p className="text-sm text-emerald-700">
            Uploaded {latestUploadedDataset.original_filename} ({latestUploadedDataset.rows} rows, {latestUploadedDataset.columns.length} columns)
          </p>
        ) : null}
        {latestConnectorDataset ? (
          <p className="text-sm text-blue-700">
            Imported from connector: {latestConnectorDataset.original_filename} ({latestConnectorDataset.rows} rows, {(latestConnectorDataset.columns || []).length} columns)
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6 data-management-card-content">
        {managementTab === 'datasets' ? (
          <>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Folders</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              className={`rounded-lg border p-3 text-left transition hover:bg-slate-50 ${selectedFolder === 'all' ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-900'}`}
              onClick={() => setSelectedFolder('all')}
            >
              <div className="mb-2 flex items-center gap-2"><Folder className="h-4 w-4" /><span className="text-sm font-medium">All Files</span></div>
              <Badge variant={selectedFolder === 'all' ? 'secondary' : 'outline'}>{datasets.length}</Badge>
            </button>

            {folderStats.map((folder) => (
              <div
                key={folder.name}
                className={`rounded-lg border p-3 transition ${selectedFolder === folder.name ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'}`}
                style={{ position: 'relative', minHeight: '110px' }}
              >
                {folder.canDelete ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      display: 'flex',
                      gap: '0.35rem',
                      zIndex: 2,
                    }}
                  >
                    <button
                      type="button"
                      aria-label={`Rename folder ${folder.name}`}
                      disabled={deletingFolderId === folder.id}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRequestRenameFolder(folder);
                      }}
                      style={{
                        width: '1.6rem',
                        height: '1.6rem',
                        borderRadius: '0.375rem',
                        border: selectedFolder === folder.name ? '1px solid rgba(255,255,255,0.22)' : '1px solid #e2e8f0',
                        background: selectedFolder === folder.name ? 'rgba(255,255,255,0.12)' : '#f8fafc',
                        color: selectedFolder === folder.name ? '#e2e8f0' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        cursor: deletingFolderId === folder.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Pencil style={{ width: '1rem', height: '1rem' }} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete folder ${folder.name}`}
                      disabled={deletingFolderId === folder.id}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRequestDeleteFolder(folder);
                      }}
                      style={{
                        width: '1.6rem',
                        height: '1.6rem',
                        borderRadius: '0.375rem',
                        border: selectedFolder === folder.name ? '1px solid rgba(255,255,255,0.22)' : '1px solid #fecdd3',
                        background: selectedFolder === folder.name ? 'rgba(255,255,255,0.12)' : '#fff1f2',
                        color: selectedFolder === folder.name ? '#fda4af' : '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        cursor: deletingFolderId === folder.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Trash2 style={{ width: '1rem', height: '1rem' }} />
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="min-w-0 w-full bg-transparent p-0 text-left text-inherit hover:bg-transparent"
                  style={{ color: 'inherit', paddingRight: folder.canDelete ? '4.4rem' : undefined, paddingTop: '0.15rem' }}
                  onClick={() => setSelectedFolder(folder.name)}
                  title={folder.displayName}
                >
                  <div className="flex items-center"><Folder className="h-4 w-4 shrink-0" /></div>
                  <div className="mt-2 min-w-0"><span className="block truncate text-sm font-medium">{truncateLabel(folder.displayName)}</span></div>
                  <div className="mt-3"><Badge variant={selectedFolder === folder.name ? 'secondary' : 'outline'}>{folder.count}</Badge></div>
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 dataset-list-section">
          <div className="flex items-center justify-between gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900" title={selectedFolder === 'all' ? 'Files' : `Files / ${selectedFolder}`}>
              Files {selectedFolder === 'all' ? '' : `/ ${selectedFolder}`}
            </h3>
            {selectedCount ? (
              <Button type="button" variant="destructive" size="sm" onClick={onOpenDeleteSelected}><Trash2 className="h-3.5 w-3.5" />Delete Selected ({selectedCount})</Button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search datasets..."
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
              aria-label="Search datasets"
            />
            {searchQuery ? <Button type="button" variant="secondary" size="sm" onClick={() => setSearchQuery('')}>Clear</Button> : null}
          </div>

          <div className="dataset-table-frame rounded-lg border border-slate-200">
            <div className="dataset-table-scroll overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3"><input type="checkbox" aria-label="Select all datasets in current view" checked={allFilteredSelected} onChange={(event) => onToggleSelectAllFiltered(event.target.checked)} /></th>
                    <th className="px-4 py-3">Name</th>
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
                        <td className="px-4 py-3"><input type="checkbox" aria-label={`Select dataset ${ds.original_filename}`} checked={selectedIdSet.has(ds.dataset_id)} onChange={(event) => onToggleDatasetSelection(ds.dataset_id, event.target.checked)} /></td>
                        <td className="px-4 py-3 font-medium text-slate-900">{ds.original_filename}</td>
                        <td className="max-w-[240px] truncate px-4 py-3 text-slate-600" title={ds.folder || 'default'}>{ds.folder || 'default'}</td>
                        <td className="px-4 py-3 text-slate-600">{ds.rows}</td>
                        <td className="px-4 py-3 text-slate-600">{(ds.columns || []).length}</td>
                        <td className="px-4 py-3">
                          <div className="row-actions">
                            <Button type="button" size="sm" variant="secondary" onClick={() => onPrepareDataset?.(ds)}><Eye className="h-3.5 w-3.5" />Open</Button>
                            <div className="kebab-menu">
                              <button
                                type="button"
                                className="kebab-trigger"
                                aria-label="More actions"
                                aria-expanded={openMenuDatasetId === ds.dataset_id}
                                onClick={(event) => {
                                  if (openMenuDatasetId === ds.dataset_id) {
                                    closeKebabMenu();
                                    return;
                                  }
                                  setOpenMenuDatasetId(ds.dataset_id);
                                  setOpenMenuPosition(getMenuPosition(event.currentTarget));
                                }}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                              {openMenuDatasetId === ds.dataset_id && openMenuPosition
                                ? createPortal(
                                  <div
                                    className="kebab-dropdown kebab-dropdown-floating"
                                    style={{
                                      position: 'fixed',
                                      top: `${openMenuPosition.top}px`,
                                      left: `${openMenuPosition.left}px`,
                                      right: 'auto',
                                      zIndex: 1300,
                                    }}
                                  >
                                    <Button type="button" variant="ghost" onClick={() => onDownloadDataset(ds)}><Download className="h-3.5 w-3.5" />Download</Button>
                                    <Button type="button" variant="ghost" onClick={() => onOpenInsights(ds)}><Sparkles className="h-3.5 w-3.5" />Insights</Button>
                                    <Button type="button" variant="ghost" onClick={() => onOpenSchema(ds)}><Eye className="h-3.5 w-3.5" />Schema</Button>
                                    <Button type="button" variant="ghost" onClick={() => onOpenRenameDataset(ds)}><Pencil className="h-3.5 w-3.5" />Rename</Button>
                                    <Button type="button" variant="ghost" onClick={() => onOpenMove(ds)}><FolderOpen className="h-3.5 w-3.5" />Move</Button>
                                    <Button type="button" variant="destructive" onClick={() => onOpenDelete(ds)}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
                                  </div>,
                                  document.body
                                )
                                : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={6}>No files in this view.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
          </>
        ) : managementTab === 'connectors' ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Connectors</h3>
            <div className="rounded-lg border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Connector Type</th>
                      <th className="px-4 py-3">Datasets</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {loadingConnectors ? (
                      <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={4}>Loading connectors...</td></tr>
                    ) : connectors.length ? (
                      connectors.map((connector) => {
                        const mappingCount = (connector.table_mappings || []).filter((row) => row?.enabled).length;
                        const connectorId = connector.connector_id;
                        const isBusy = connectorActionBusyId === connectorId;
                        const connectorType = String(connector.connector_type || '').toLowerCase();
                        const connectorTypeLabel = connectorType === 'sql'
                          ? 'SQL'
                          : connectorType === 'sftp'
                            ? 'SFTP'
                            : (connectorType || '-').toUpperCase();
                        return (
                          <tr key={connectorId}>
                            <td className="px-4 py-3 font-medium text-slate-900">{connector.name}</td>
                            <td className="px-4 py-3 text-slate-600">{connectorTypeLabel}</td>
                            <td className="px-4 py-3 text-slate-600">{mappingCount}</td>
                            <td className="px-4 py-3">
                              <div className="kebab-menu">
                                <button
                                  type="button"
                                  className="kebab-trigger"
                                  aria-label="Connector actions"
                                  aria-expanded={openConnectorMenuId === connectorId}
                                  disabled={isBusy}
                                  onClick={(event) => {
                                    if (openConnectorMenuId === connectorId) {
                                      setOpenConnectorMenuId(null);
                                      setOpenConnectorMenuPosition(null);
                                      return;
                                    }
                                    setOpenConnectorMenuId(connectorId);
                                    setOpenConnectorMenuPosition(getMenuPosition(event.currentTarget));
                                  }}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                                {openConnectorMenuId === connectorId && openConnectorMenuPosition
                                  ? createPortal(
                                    <div
                                      className="kebab-dropdown kebab-dropdown-floating"
                                      style={{
                                        position: 'fixed',
                                        top: `${openConnectorMenuPosition.top}px`,
                                        left: `${openConnectorMenuPosition.left}px`,
                                        right: 'auto',
                                        zIndex: 1300,
                                      }}
                                    >
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => {
                                          onEditConnector(connector);
                                          setOpenConnectorMenuId(null);
                                          setOpenConnectorMenuPosition(null);
                                        }}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />Edit
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => {
                                          setEditingConnector(null);
                                          setConnectorModalInitialId(connectorId);
                                          setConnectorModalInitialDriver('');
                                          setShowConnectorModal(true);
                                          setOpenConnectorMenuId(null);
                                          setOpenConnectorMenuPosition(null);
                                        }}
                                      >
                                        <Database className="h-3.5 w-3.5" />Sync
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        onClick={() => {
                                          onDeleteConnector(connector);
                                          setOpenConnectorMenuId(null);
                                          setOpenConnectorMenuPosition(null);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />Delete
                                      </Button>
                                    </div>,
                                    document.body
                                  )
                                  : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={4}>No connectors yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {connectorError ? <p className="text-sm text-red-600">{connectorError}</p> : null}
          </section>
        ) : (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Preparation Plans</h3>
            <div className="rounded-lg border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Plan Name</th>
                      <th className="px-4 py-3">Dataset</th>
                      <th className="px-4 py-3">Version</th>
                      <th className="px-4 py-3">Updated</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {loadingPrepPlans ? (
                      <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={6}>Loading preparation plans...</td></tr>
                    ) : prepPlans.length ? (
                      prepPlans.map((plan, index) => (
                        <tr key={`${String(plan.plan_id || plan.name || 'plan')}-${String(plan.latest_version || '')}-${index}`}>
                          <td className="px-4 py-3 font-medium text-slate-900">{plan.name || plan.plan_id || '-'}</td>
                          <td className="px-4 py-3 text-slate-600">{plan.dataset_name || plan.dataset_id || '-'}</td>
                          <td className="px-4 py-3 text-slate-600">v{plan.latest_version ?? '-'}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDateTime(plan.updated_at)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDateTime(plan.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="kebab-menu">
                              <button
                                type="button"
                                className="kebab-trigger"
                                aria-label="Plan actions"
                                aria-expanded={openPlanMenuId === plan.plan_id}
                                disabled={planActionBusyId === String(plan.plan_id || '')}
                                onClick={(event) => {
                                  const planId = String(plan.plan_id || '');
                                  if (openPlanMenuId === planId) {
                                    setOpenPlanMenuId(null);
                                    setOpenPlanMenuPosition(null);
                                    return;
                                  }
                                  setOpenPlanMenuId(planId);
                                  setOpenPlanMenuPosition(getMenuPosition(event.currentTarget));
                                }}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                              {openPlanMenuId === plan.plan_id && openPlanMenuPosition
                                ? createPortal(
                                  <div
                                    className="kebab-dropdown kebab-dropdown-floating"
                                    style={{
                                      position: 'fixed',
                                      top: `${openPlanMenuPosition.top}px`,
                                      left: `${openPlanMenuPosition.left}px`,
                                      right: 'auto',
                                      zIndex: 1300,
                                    }}
                                  >
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={() => {
                                        setOpenPlanMenuId(null);
                                        setOpenPlanMenuPosition(null);
                                        onViewPrepPlan(plan).catch(() => {});
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5" />View
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      onClick={() => {
                                        onEditPrepPlan(plan).catch(() => {});
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />Edit
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      onClick={() => {
                                        onDeletePrepPlan(plan).catch(() => {});
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />Delete
                                    </Button>
                                  </div>,
                                  document.body
                                )
                                : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={6}>No preparation plans yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {prepPlansError ? <p className="text-sm text-red-600">{prepPlansError}</p> : null}
          </section>
        )}
      </CardContent>

      <UploadDatasetModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        folders={folders}
        queueItems={uploadQueueItems}
        queueRunning={uploadQueueRunning}
        queueOverallProgress={uploadQueueOverallProgress}
        onStartUploads={onStartUploads}
        onPauseUploads={onPauseUploads}
        onResumeUploads={onResumeUploads}
      />

      <CreateFolderModal open={showFolderModal} onClose={() => setShowFolderModal(false)} onCreated={onFolderCreated} />
      <NewConnectorModal
        open={showNewConnectorModal}
        onClose={() => setShowNewConnectorModal(false)}
        onSelectProvider={(provider) => {
          const supportedProviders = new Set(['postgresql', 'mysql', 'mssql', 'oracle', 'sqlite', 'sftp']);
          if (!supportedProviders.has(provider)) return;
          setShowNewConnectorModal(false);
          setEditingConnector(null);
          setConnectorModalInitialId('');
          setConnectorModalInitialDriver(provider);
          setShowConnectorModal(true);
        }}
      />
      <ConnectorIngestModal
        open={showConnectorModal}
        onClose={() => {
          setShowConnectorModal(false);
          setEditingConnector(null);
          setConnectorModalInitialId('');
          setConnectorModalInitialDriver('');
        }}
        folders={folders}
        editingConnector={editingConnector}
        initialConnectorId={connectorModalInitialId}
        initialDriver={connectorModalInitialDriver}
        onImported={async (dataset) => {
          setLatestConnectorDataset(dataset || null);
          setShowConnectorModal(false);
          setEditingConnector(null);
          setConnectorModalInitialId('');
          setConnectorModalInitialDriver('');
          await onDataChanged();
          await fetchConnectors();
        }}
        onConnectorChanged={async () => {
          await fetchConnectors();
        }}
      />

      <DeleteDatasetModal
        open={showDeleteModal}
        dataset={deleteTargets.length === 1 ? deleteTargets[0] : null}
        datasets={deleteTargets}
        onClose={() => {
          if (deleting) return;
          setShowDeleteModal(false);
          setDeleteTargets([]);
        }}
        onConfirm={onConfirmDelete}
        loading={deleting}
      />

      <DeleteFolderModal
        open={showDeleteFolderModal}
        folder={deleteFolderTarget}
        onClose={() => {
          if (deletingFolderId) return;
          setShowDeleteFolderModal(false);
          setDeleteFolderTarget(null);
        }}
        onConfirm={onConfirmDeleteFolder}
        loading={Boolean(deletingFolderId)}
      />

      <RenameFolderModal
        open={showRenameFolderModal}
        folder={renameFolderTarget}
        onClose={() => {
          if (deletingFolderId) return;
          setShowRenameFolderModal(false);
          setRenameFolderTarget(null);
        }}
        onRenamed={async (updatedFolder) => {
          if (updatedFolder?.path && selectedFolder === renameFolderTarget?.name) {
            setSelectedFolder(updatedFolder.path);
          }
          setShowRenameFolderModal(false);
          setRenameFolderTarget(null);
          await onDataChanged();
        }}
      />

      <RenameDatasetModal
        open={showRenameDatasetModal}
        dataset={renameDatasetTarget}
        onClose={() => {
          setShowRenameDatasetModal(false);
          setRenameDatasetTarget(null);
        }}
        onRenamed={async () => {
          setShowRenameDatasetModal(false);
          setRenameDatasetTarget(null);
          await onDataChanged();
        }}
      />

      <InsightsModal
        open={showInsightsModal}
        dataset={insightTarget}
        onClose={() => {
          setShowInsightsModal(false);
          setInsightTarget(null);
        }}
      />

      <SchemaModal
        open={showSchemaModal}
        dataset={schemaTarget}
        onClose={() => {
          setShowSchemaModal(false);
          setSchemaTarget(null);
        }}
      />

      <DatasetExplorerModal
        open={showMoveModal}
        mode="folder"
        folders={folders}
        datasets={datasets}
        currentFolderPath={moveTarget?.folder || 'default'}
        title="Move Dataset"
        description={moveTarget ? `Select destination folder for ${moveTarget.original_filename}.` : 'Select destination folder.'}
        onClose={() => {
          if (movingDatasetId) return;
          setShowMoveModal(false);
          setMoveTarget(null);
        }}
        onSelectFolder={onMoveDatasetToFolder}
      />

      <Dialog
        open={showPlanViewModal}
        onOpenChange={(next) => {
          if (next) return;
          setShowPlanViewModal(false);
          setViewingPlanId('');
          setPlanDetail(null);
          setPlanDetailError('');
          setLoadingPlanDetail(false);
        }}
      >
        <DialogContent className="schema-modal-dialog">
          <DialogHeader>
            <DialogTitle>Preparation Plan</DialogTitle>
            <DialogDescription>{planDetail?.name || viewingPlanId || 'Plan details'}</DialogDescription>
          </DialogHeader>

          {loadingPlanDetail ? <p className="help">Loading plan details...</p> : null}
          {planDetailError ? <p className="error">{planDetailError}</p> : null}

          {!loadingPlanDetail && !planDetailError && viewedPlanLatest ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Badge variant="outline">Plan ID: {planDetail.plan_id || '-'}</Badge>
                <Badge variant="outline">Version: v{viewedPlanLatest.version ?? planDetail.latest_version ?? '-'}</Badge>
                <Badge variant="outline">Dataset: {viewedPlanLatest.dataset_name || viewedPlanLatest.dataset_id || '-'}</Badge>
              </div>

              {String(viewedPlanLatest.instruction || '').trim() ? (
                <section className="space-y-1 rounded-lg border border-slate-200 p-3">
                  <h4 className="text-sm font-semibold text-slate-900">Instruction</h4>
                  <p className="text-sm text-slate-700">{String(viewedPlanLatest.instruction || '').trim()}</p>
                </section>
              ) : null}

              <section className="space-y-2 rounded-lg border border-slate-200 p-3">
                <h4 className="text-sm font-semibold text-slate-900">Steps ({viewedPlanSteps.length})</h4>
                {viewedPlanSteps.length ? (
                  <ol className="list-decimal space-y-2 pl-5 text-sm">
                    {viewedPlanSteps.map((step, idx) => (
                      <li key={`${String(step?.operation || 'step')}-${idx}`} className="space-y-1">
                        <div className="font-medium text-slate-900">{String(step?.operation || 'operation')}</div>
                        {String(step?.description || '').trim() ? (
                          <p className="text-slate-700">{String(step.description).trim()}</p>
                        ) : null}
                        {step?.params && typeof step.params === 'object' ? (
                          <pre className="max-h-40 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                            <code>{JSON.stringify(step.params, null, 2)}</code>
                          </pre>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-500">No steps available in this plan version.</p>
                )}
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default DataManagementSection;
