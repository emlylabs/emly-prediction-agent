import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, ChevronLeft, ChevronRight, Database, FileCode2, FileText, GitCompareArrows, LayoutDashboard, MoreHorizontal, PlayCircle, Sparkles, Trash2 } from 'lucide-react';
import { marked } from 'marked';
import './App.css';
import AutoMLWizard from './components/AutoMLWizard';
import DataManagementSection from './components/DataManagementSection';
import DatasetExplorerModal from './components/DatasetExplorerModal';
import DashboardGallery from './components/DashboardGallery';
import StatusWindow from './components/StatusWindow';
import { ChartContainer } from './components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useUploadQueue } from '@/lib/useUploadQueue';

const API_BASE = '/emly/api/prediction';
const MAX_TEST_ROWS = 1000;

function App() {
  const [activeScreen, setActiveScreen] = useState('dashboard');
  const [algorithms, setAlgorithms] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [models, setModels] = useState([]);
  const [folders, setFolders] = useState([]);
  const [showDatasetExplorer, setShowDatasetExplorer] = useState(false);
  const [showTestDatasetExplorer, setShowTestDatasetExplorer] = useState(false);
  const [prepareDataset, setPrepareDataset] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [modelTab, setModelTab] = useState('list');
  const [activeModelId, setActiveModelId] = useState('');
  const [showActivateModelModal, setShowActivateModelModal] = useState(false);
  const [pendingActiveModel, setPendingActiveModel] = useState(null);
  const [showDeleteModelModal, setShowDeleteModelModal] = useState(false);
  const [pendingDeleteModel, setPendingDeleteModel] = useState(null);
  const [deletingModel, setDeletingModel] = useState(false);
  const [showModelReportModal, setShowModelReportModal] = useState(false);
  const [modelReport, setModelReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareLeftModelId, setCompareLeftModelId] = useState('');
  const [compareRightModelId, setCompareRightModelId] = useState('');
  const [latestUploadedDataset, setLatestUploadedDataset] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const [trainForm, setTrainForm] = useState({
    dataset_id: '',
    target_column: '',
    feature_columns: [],
    algorithm: 'linear_regression',
    algorithm_params: {},
    test_size: 0.2,
    random_state: 42,
    use_cross_validation: false,
    cross_validation_folds: 5,
  });
  const [trainJob, setTrainJob] = useState(null);
  const [trainError, setTrainError] = useState('');
  const [training, setTraining] = useState(false);

  const [inferForm, setInferForm] = useState({
    model_id: '',
  });
  const [inferResult, setInferResult] = useState(null);
  const [inferError, setInferError] = useState('');
  const [inferring, setInferring] = useState(false);
  const [inferRunMode, setInferRunMode] = useState('batch');
  const [selectedTestDatasets, setSelectedTestDatasets] = useState([]);
  const [testExamples, setTestExamples] = useState([]);
  const [fileInferResults, setFileInferResults] = useState([]);
  const [oneByOneIndex, setOneByOneIndex] = useState(0);
  const [inferExampleForm, setInferExampleForm] = useState({});
  const [categoricalOptions, setCategoricalOptions] = useState({});

  const selectedDataset = useMemo(
    () => datasets.find((d) => d.dataset_id === trainForm.dataset_id) || null,
    [datasets, trainForm.dataset_id]
  );

  const selectedAlgorithm = useMemo(
    () => algorithms.find((a) => a.id === trainForm.algorithm) || null,
    [algorithms, trainForm.algorithm]
  );

  const selectedModel = useMemo(
    () => models.find((m) => m.model_id === inferForm.model_id) || null,
    [models, inferForm.model_id]
  );
  const activeModel = useMemo(() => {
    const flagged = models.find((m) => m.is_active);
    if (flagged) return flagged;
    return models.find((m) => m.model_id === activeModelId) || null;
  }, [models, activeModelId]);
  const selectedTestDatasetIds = useMemo(
    () => selectedTestDatasets.map((ds) => ds.dataset_id),
    [selectedTestDatasets]
  );
  const estimatedExampleCount = useMemo(
    () => selectedTestDatasets.reduce((sum, ds) => sum + Math.min(Number(ds.rows) || 0, MAX_TEST_ROWS), 0),
    [selectedTestDatasets]
  );

  const fetchAll = async () => {
    const [algoRes, dsRes, modelRes, folderRes] = await Promise.all([
      fetch(`${API_BASE}/algorithms`),
      fetch(`${API_BASE}/datasets`),
      fetch(`${API_BASE}/models`),
      fetch(`${API_BASE}/folders`),
    ]);

    const [algoJson, dsJson, modelJson, folderJson] = await Promise.all([
      algoRes.json(),
      dsRes.json(),
      modelRes.json(),
      folderRes.json(),
    ]);

    setAlgorithms(algoJson.algorithms || []);
    setDatasets(dsJson.datasets || []);
    const incomingModels = modelJson.models || [];
    setModels(incomingModels);
    setFolders(folderJson.folders || []);

    const activeFromApi = incomingModels.find((m) => m.is_active)?.model_id || '';
    if (activeFromApi && activeFromApi !== activeModelId) {
      setActiveModelId(activeFromApi);
    }

    if (!trainForm.dataset_id && dsJson.datasets?.length) {
      const firstDataset = dsJson.datasets[0];
      setTrainForm((prev) => ({
        ...prev,
        dataset_id: firstDataset.dataset_id,
        target_column: firstDataset.columns?.[0] || '',
      }));
    }

    if (!inferForm.model_id && incomingModels.length) {
      setInferForm((prev) => ({
        ...prev,
        model_id: activeFromApi || incomingModels[0].model_id,
      }));
    }
  };

  const setActiveModel = async (modelId) => {
    try {
      const res = await fetch(`${API_BASE}/models/${modelId}/activate`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to activate model');
      setActiveModelId(modelId);
      setInferForm((prev) => ({ ...prev, model_id: modelId }));
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  const onRequestActivateModel = (model) => {
    setPendingActiveModel(model);
    setShowActivateModelModal(true);
  };

  const onConfirmActivateModel = async () => {
    if (!pendingActiveModel?.model_id) return;
    await setActiveModel(pendingActiveModel.model_id);
    setShowActivateModelModal(false);
    setPendingActiveModel(null);
  };

  const onRequestDeleteModel = (model) => {
    setPendingDeleteModel(model);
    setShowDeleteModelModal(true);
  };

  const onConfirmDeleteModel = async () => {
    if (!pendingDeleteModel?.model_id || deletingModel) return;
    setDeletingModel(true);
    try {
      const res = await fetch(`${API_BASE}/models/${pendingDeleteModel.model_id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to delete model');
      setShowDeleteModelModal(false);
      setPendingDeleteModel(null);
      await fetchAll();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingModel(false);
    }
  };

  const onOpenModelReport = async (modelId) => {
    if (!modelId) return;
    setShowModelReportModal(true);
    setReportLoading(true);
    setReportError('');
    setModelReport(null);
    try {
      const res = await fetch(`${API_BASE}/models/${modelId}/report`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to load model report');
      setModelReport(body.report || null);
    } catch (err) {
      setReportError(err.message || 'Failed to load model report');
    } finally {
      setReportLoading(false);
    }
  };

  const onOpenCompareModels = (leftModelId) => {
    const fallbackRight = (models.find((m) => m.model_id !== leftModelId) || {}).model_id || '';
    setCompareLeftModelId(leftModelId);
    setCompareRightModelId(fallbackRight);
    setShowCompareModal(true);
  };

  const formatAccuracy = (model) => {
    const raw = model?.accuracy_score ?? model?.metrics?.accuracy ?? model?.metrics?.r2;
    if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return '-';
    return Number(raw).toFixed(4);
  };

  const formatCreatedAt = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString();
  };

  useEffect(() => {
    fetchAll().catch(() => {});
  }, []);

  useEffect(() => {
    if (!models.length) {
      if (activeModelId) setActiveModelId('');
      return;
    }
    const activeFromApi = models.find((m) => m.is_active)?.model_id;
    if (activeFromApi && activeFromApi !== activeModelId) {
      setActiveModelId(activeFromApi);
      setInferForm((prev) => ({ ...prev, model_id: activeFromApi }));
      return;
    }
    if (!activeFromApi && models[0]?.model_id) {
      setActiveModel(models[0].model_id);
    }
  }, [models, activeModelId]);

  useEffect(() => {
    if (!selectedDataset) return;
    const columns = selectedDataset.columns || [];
    const targetStillValid = columns.includes(trainForm.target_column);
    const features = columns.filter((c) => c !== trainForm.target_column);
    setTrainForm((prev) => ({
      ...prev,
      target_column: targetStillValid ? prev.target_column : columns[0] || '',
      feature_columns: prev.feature_columns.length ? prev.feature_columns : features,
    }));
  }, [selectedDataset]);

  useEffect(() => {
    if (!training || !trainJob?.job_id) return;
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/train/status/${trainJob.job_id}`);
        const body = await res.json();
        setTrainJob(body);
        if (body.status === 'completed' || body.status === 'failed') {
          setTraining(false);
          clearInterval(intervalId);
          fetchAll().catch(() => {});
        }
      } catch {
        setTraining(false);
        clearInterval(intervalId);
      }
    }, 1200);
    return () => clearInterval(intervalId);
  }, [training, trainJob?.job_id]);

  useEffect(() => {
    const columns = selectedModel?.feature_columns || [];
    if (!columns.length) {
      setInferExampleForm({});
      return;
    }
    setInferExampleForm((prev) => {
      const next = {};
      columns.forEach((col) => {
        next[col] = prev[col] ?? '';
      });
      return next;
    });
  }, [selectedModel]);

  const onDatasetReady = (dataset) => {
    setTrainForm((prev) => ({
      ...prev,
      dataset_id: dataset.dataset_id,
      target_column: dataset.columns?.[0] || '',
      feature_columns: dataset.columns?.slice(1) || [],
    }));
  };

  const uploadQueue = useUploadQueue({
    onUploadCompleted: async (dataset) => {
      setLatestUploadedDataset(dataset);
      onDatasetReady(dataset);
      await fetchAll();
    },
  });

  const onPrepareDataset = (dataset) => {
    setPrepareDataset(dataset);
    setActiveScreen('data');
  };

  const onTrainingDatasetSelected = (dataset) => {
    onDatasetReady(dataset);
    setShowDatasetExplorer(false);
  };

  const onToggleTestDataset = (dataset) => {
    setTestExamples([]);
    setFileInferResults([]);
    setOneByOneIndex(0);
    setSelectedTestDatasets((prev) => {
      const exists = prev.some((item) => item.dataset_id === dataset.dataset_id);
      if (exists) return prev.filter((item) => item.dataset_id !== dataset.dataset_id);
      return [...prev, dataset];
    });
  };

  const onConfirmTestDatasetSelection = () => {
    setShowTestDatasetExplorer(false);
    setFileInferResults([]);
    setTestExamples([]);
    setOneByOneIndex(0);
    setInferError('');
  };

  const onToggleFeature = (column) => {
    setTrainForm((prev) => {
      const exists = prev.feature_columns.includes(column);
      return {
        ...prev,
        feature_columns: exists
          ? prev.feature_columns.filter((c) => c !== column)
          : [...prev.feature_columns, column],
      };
    });
  };

  const onParamChange = (param, rawValue) => {
    const parseValue = () => {
      if (param.type === 'int') return Number.parseInt(rawValue, 10);
      if (param.type === 'float') return Number.parseFloat(rawValue);
      if (param.type === 'bool') return rawValue === 'true';
      if (param.type === 'int_optional') return rawValue === '' ? null : Number.parseInt(rawValue, 10);
      return rawValue;
    };

    setTrainForm((prev) => ({
      ...prev,
      algorithm_params: {
        ...prev.algorithm_params,
        [param.name]: parseValue(),
      },
    }));
  };

  const onStartTraining = async (e) => {
    e.preventDefault();
    setTrainError('');
    setTrainJob(null);
    setTraining(true);
    try {
      const payload = {
        ...trainForm,
        feature_columns: trainForm.feature_columns.filter((c) => c !== trainForm.target_column),
      };
      const res = await fetch(`${API_BASE}/train/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Training failed to start');
      setTrainJob(body);
    } catch (err) {
      setTraining(false);
      setTrainError(err.message || 'Training failed');
    }
  };

  const applyModelExample = () => {
    if (!selectedModel?.feature_columns?.length) return;
    const row = {};
    selectedModel.feature_columns.forEach((col) => {
      row[col] = 0;
    });
    setInferExampleForm(row);
  };

  const runInferenceRows = async (rows) => {
    if (!inferForm.model_id) throw new Error('Select a model first.');
    const res = await fetch(`${API_BASE}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: inferForm.model_id,
        rows,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || 'Inference failed');
    return body;
  };

  const loadDatasetRows = async (dataset) => {
    const startRes = await fetch(`${API_BASE}/prepare/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_id: dataset.dataset_id }),
    });
    const startBody = await startRes.json();
    if (!startRes.ok) throw new Error(startBody.detail || 'Failed to open dataset');

    const sessionId = startBody.session_id;
    const totalRows = Number(startBody.total_rows || 0);
    const pageSize = 500;
    let offset = 0;
    let rows = [];

    while (rows.length < MAX_TEST_ROWS) {
      const tableRes = await fetch(`${API_BASE}/prepare/${sessionId}/table?limit=${pageSize}&offset=${offset}`);
      const tableBody = await tableRes.json();
      if (!tableRes.ok) throw new Error(tableBody.detail || 'Failed to fetch dataset rows');

      const pageRows = Array.isArray(tableBody.rows) ? tableBody.rows : [];
      rows = rows.concat(pageRows);
      offset += pageRows.length;

      if (!pageRows.length) break;
      if (pageRows.length < pageSize) break;
      if (totalRows && offset >= totalRows) break;
      if (rows.length >= MAX_TEST_ROWS) break;
    }

    if (!rows.length) throw new Error('Dataset has no rows to test');
    return rows.slice(0, MAX_TEST_ROWS);
  };

  const buildCategoricalOptions = async () => {
    const columns = selectedModel?.feature_columns || [];
    if (!columns.length || !selectedTestDatasets.length) {
      setCategoricalOptions({});
      return;
    }

    const freqByColumn = {};
    columns.forEach((col) => {
      freqByColumn[col] = new Map();
    });

    for (const dataset of selectedTestDatasets) {
      const rows = await loadDatasetRows(dataset);
      rows.forEach((row) => {
        columns.forEach((col) => {
          const raw = row?.[col];
          if (raw === null || raw === undefined || raw === '') return;
          const asText = String(raw).trim();
          if (!asText.length) return;
          const asNumber = Number(asText);
          // Categorical candidates are non-numeric text/boolean-like values.
          const isCategorical = asText.toLowerCase() === 'true' || asText.toLowerCase() === 'false' || !Number.isFinite(asNumber);
          if (!isCategorical) return;
          freqByColumn[col].set(asText, (freqByColumn[col].get(asText) || 0) + 1);
        });
      });
    }

    const nextOptions = {};
    columns.forEach((col) => {
      const ranked = Array.from(freqByColumn[col].entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 100)
        .map(([value]) => value);
      if (ranked.length) {
        nextOptions[col] = ranked;
      }
    });
    setCategoricalOptions(nextOptions);
  };

  const loadAllExamples = async () => {
    if (!selectedTestDatasets.length) {
      throw new Error('Choose at least one dataset from Data Explorer first.');
    }
    const all = [];
    for (const dataset of selectedTestDatasets) {
      const rows = await loadDatasetRows(dataset);
      rows.forEach((row, idx) => {
        all.push({
          dataset_id: dataset.dataset_id,
          file_name: dataset.original_filename || dataset.dataset_id,
          example_index: idx + 1,
          row,
        });
      });
    }
    return all;
  };

  const onRunBatchTestFiles = async () => {
    setInferring(true);
    setInferError('');
    setInferResult(null);
    setFileInferResults([]);
    try {
      const examples = await loadAllExamples();
      setTestExamples(examples);
      const output = await runInferenceRows(examples.map((item) => item.row));
      const predictions = Array.isArray(output.predictions) ? output.predictions : [];
      const results = examples.map((example, idx) => ({
        dataset_id: example.dataset_id,
        file_name: example.file_name,
        example_index: example.example_index,
        row_count: 1,
        predictions: [predictions[idx]],
      }));
      setFileInferResults(results);
      setOneByOneIndex(0);
    } catch (err) {
      setInferError(err.message || 'Batch example inference failed');
    } finally {
      setInferring(false);
    }
  };

  const onRunNextTestFile = async () => {
    setInferring(true);
    setInferError('');
    setInferResult(null);
    try {
      const examples = testExamples.length ? testExamples : await loadAllExamples();
      if (!testExamples.length) setTestExamples(examples);
      if (oneByOneIndex >= examples.length) return;

      const current = examples[oneByOneIndex];
      setInferExampleForm(current.row || {});
      const output = await runInferenceRows([current.row]);
      const prediction = Array.isArray(output.predictions) ? output.predictions[0] : null;
      setFileInferResults([
        {
          dataset_id: current.dataset_id,
          file_name: current.file_name,
          example_index: current.example_index,
          row_count: 1,
          predictions: [prediction],
        },
      ]);
      setOneByOneIndex((idx) => idx + 1);
    } catch (err) {
      setInferError(err.message || 'Example inference failed');
    } finally {
      setInferring(false);
    }
  };

  const normalizeFormValue = (value) => {
    const text = String(value ?? '').trim();
    if (!text.length) return '';
    const lowered = text.toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return numeric;
    return text;
  };

  const onRunFormInference = async () => {
    if (!selectedModel?.feature_columns?.length) {
      setInferError('Selected model has no feature columns.');
      return;
    }
    setInferring(true);
    setInferError('');
    setInferResult(null);
    setFileInferResults([]);
    try {
      const row = {};
      selectedModel.feature_columns.forEach((col) => {
        row[col] = normalizeFormValue(inferExampleForm[col]);
      });
      const body = await runInferenceRows([row]);
      setInferResult(body);
    } catch (err) {
      setInferError(err.message || 'Inference failed');
    } finally {
      setInferring(false);
    }
  };

  const clearInferForm = () => {
    const columns = selectedModel?.feature_columns || [];
    const cleared = {};
    columns.forEach((col) => {
      cleared[col] = '';
    });
    setInferExampleForm(cleared);
  };

  useEffect(() => {
    if (inferRunMode !== 'form') return;
    buildCategoricalOptions().catch(() => {
      setCategoricalOptions({});
    });
  }, [inferRunMode, selectedModel?.model_id, selectedTestDatasets]);

  const buildLossCurvePath = (points, width = 320, height = 170, pad = 16) => {
    if (!points?.length) return '';
    const values = points.map((p) => Number(p.value));
    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    const yRange = maxY - minY || 1;
    const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
    return points
      .map((p, idx) => {
        const x = pad + idx * stepX;
        const y = height - pad - ((Number(p.value) - minY) / yRange) * (height - pad * 2);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  };

  const buildResidualScatter = (points, width = 320, height = 170, pad = 20) => {
    if (!points?.length) return { circles: [], zeroY: height / 2 };
    const preds = points.map((p) => Number(p.predicted));
    const residuals = points.map((p) => Number(p.residual));
    const minX = Math.min(...preds);
    const maxX = Math.max(...preds);
    const minY = Math.min(...residuals);
    const maxY = Math.max(...residuals);
    const xRange = maxX - minX || 1;
    const yRange = maxY - minY || 1;
    const circles = points.map((p) => {
      const x = pad + ((Number(p.predicted) - minX) / xRange) * (width - pad * 2);
      const y = height - pad - ((Number(p.residual) - minY) / yRange) * (height - pad * 2);
      return { x, y };
    });
    const zeroY = height - pad - ((0 - minY) / yRange) * (height - pad * 2);
    return { circles, zeroY };
  };

  const buildXYScatter = (points, xKey, yKey, width = 340, height = 190, pad = 24) => {
    if (!points?.length) return { circles: [], minX: 0, maxX: 1, minY: 0, maxY: 1 };
    const xVals = points.map((p) => Number(p[xKey]));
    const yVals = points.map((p) => Number(p[yKey]));
    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals);
    const minY = Math.min(...yVals);
    const maxY = Math.max(...yVals);
    const xRange = maxX - minX || 1;
    const yRange = maxY - minY || 1;
    const circles = points.map((p) => ({
      x: pad + ((Number(p[xKey]) - minX) / xRange) * (width - pad * 2),
      y: height - pad - ((Number(p[yKey]) - minY) / yRange) * (height - pad * 2),
    }));
    return { circles, minX, maxX, minY, maxY };
  };

  const toNumberOrNull = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const metricWinner = (leftValue, rightValue, direction = 'higher') => {
    const left = toNumberOrNull(leftValue);
    const right = toNumberOrNull(rightValue);
    if (left == null || right == null) return 'n/a';
    if (Math.abs(left - right) < 1e-12) return 'tie';
    if (direction === 'lower') {
      return left < right ? 'left' : 'right';
    }
    return left > right ? 'left' : 'right';
  };

  return (
    <>
      <main className="app-shell">
      <div className={`app-layout-grid ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className="app-sidebar">
          <div className="app-sidebar-header">
            {!isSidebarCollapsed ? (
              <div className="space-y-1">
                <h1 className="text-xl font-semibold text-slate-900">Predictive App</h1>
                <p className="text-sm text-slate-500">shadcn-based ML workflow</p>
              </div>
            ) : (
              <div />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="app-collapse-toggle"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              title={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-label={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          <div className="app-nav-list">
            <Button
              type="button"
              variant={activeScreen === 'dashboard' ? 'default' : 'secondary'}
              className="app-nav-btn"
              onClick={() => setActiveScreen('dashboard')}
              title="Dashboard"
              aria-label="Dashboard"
            >
              <LayoutDashboard className="h-4 w-4" />
              {!isSidebarCollapsed ? 'Dashboard' : null}
            </Button>
            <Button
              type="button"
              variant={activeScreen === 'data' ? 'default' : 'secondary'}
              className="app-nav-btn"
              onClick={() => setActiveScreen('data')}
              title="Data Management"
              aria-label="Data Management"
            >
              <Database className="h-4 w-4" />
              {!isSidebarCollapsed ? 'Data Management' : null}
            </Button>
            <Button
              type="button"
              variant={activeScreen === 'models' ? 'default' : 'secondary'}
              className="app-nav-btn"
              onClick={() => setActiveScreen('models')}
              title="Models"
              aria-label="Models"
            >
              <BrainCircuit className="h-4 w-4" />
              {!isSidebarCollapsed ? 'Models' : null}
            </Button>
          </div>

        </aside>

        <section className="app-main-content space-y-4">
          {activeScreen === 'dashboard' ? (
            <DashboardGallery datasets={datasets} />
          ) : null}

          {activeScreen === 'data' ? (
            <DataManagementSection
              datasets={datasets}
              folders={folders}
              onDataChanged={fetchAll}
              onUploadModalOpenChange={setUploadModalOpen}
              onPrepareDataset={onPrepareDataset}
              prepareDataset={prepareDataset}
              onClosePrepare={() => setPrepareDataset(null)}
              uploadQueueItems={uploadQueue.items}
              uploadQueueRunning={uploadQueue.running}
              uploadQueueOverallProgress={uploadQueue.overallProgress}
              onStartUploads={uploadQueue.startUploads}
              onPauseUploads={uploadQueue.pauseAll}
              onResumeUploads={uploadQueue.resumeFailedOrPaused}
              latestUploadedDataset={latestUploadedDataset}
            />
          ) : null}

          {activeScreen === 'models' ? (
            <Card>
              <CardHeader>
                <CardTitle>Models</CardTitle>
                <CardDescription>Browse trained models, train a new one, or test predictions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="model-tabs" role="tablist" aria-label="Models tabs">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modelTab === 'list'}
                    className={`model-tab ${modelTab === 'list' ? 'active' : ''}`}
                    onClick={() => setModelTab('list')}
                  >
                    Model List
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modelTab === 'train'}
                    className={`model-tab ${modelTab === 'train' ? 'active' : ''}`}
                    onClick={() => setModelTab('train')}
                  >
                    Train New Model
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modelTab === 'test'}
                    className={`model-tab ${modelTab === 'test' ? 'active' : ''}`}
                    onClick={() => setModelTab('test')}
                  >
                    Test Model
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={modelTab === 'automl'}
                      className={`model-tab ${modelTab === 'automl' ? 'active' : ''}`}
                      onClick={() => setModelTab('automl')}
                    >
                      AutoML
                    </button>
                </div>

                {modelTab === 'list' ? (
                  <div className="space-y-4">
                    {activeModel ? (
                      <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Active Model</p>
                            <h3 className="mt-1 text-lg font-semibold text-slate-900">{activeModel.algorithm_label}</h3>
                            <p className="mt-1 text-xs text-slate-600">
                              ID: {activeModel.model_id} | Created: {formatCreatedAt(activeModel.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="success">Accuracy: {formatAccuracy(activeModel)}</Badge>
                            <Button type="button" size="sm" variant="secondary" onClick={() => setModelTab('test')}>
                              Test Active Model
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                            <p className="text-xs text-slate-500">Target Column</p>
                            <p className="text-sm font-medium text-slate-900">{activeModel.target_column || '-'}</p>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                            <p className="text-xs text-slate-500">Feature Count</p>
                            <p className="text-sm font-medium text-slate-900">{(activeModel.feature_columns || []).length}</p>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                            <p className="text-xs text-slate-500">Train/Test Rows</p>
                            <p className="text-sm font-medium text-slate-900">
                              {activeModel.metrics?.train_rows ?? '-'} / {activeModel.metrics?.test_rows ?? '-'}
                            </p>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                            <p className="text-xs text-slate-500">Metrics</p>
                            <p className="text-sm font-medium text-slate-900">
                              R2 {activeModel.metrics?.r2 != null ? Number(activeModel.metrics.r2).toFixed(4) : '-'} | MAE {activeModel.metrics?.mae != null ? Number(activeModel.metrics.mae).toFixed(4) : '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Model ID</th>
                              <th className="px-4 py-3">Algorithm</th>
                              <th className="px-4 py-3">Target</th>
                              <th className="px-4 py-3">Accuracy Score</th>
                              <th className="px-4 py-3">Creation Date</th>
                              <th className="px-4 py-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {models.length ? (
                              models.map((model) => (
                                <tr key={model.model_id}>
                                  <td className="px-4 py-3 font-medium text-slate-900">{model.model_id}</td>
                                  <td className="px-4 py-3 text-slate-600">{model.algorithm_label}</td>
                                  <td className="px-4 py-3 text-slate-600">{model.target_column || '-'}</td>
                                  <td className="px-4 py-3 text-slate-600">{formatAccuracy(model)}</td>
                                  <td className="px-4 py-3 text-slate-600">{formatCreatedAt(model.created_at)}</td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      {model.is_active ? <Badge variant="success">Active</Badge> : null}
                                      <Button type="button" size="sm" variant="secondary" onClick={() => onOpenModelReport(model.model_id)}>
                                        <FileText className="h-3.5 w-3.5" />
                                        Report
                                      </Button>
                                      <details className="kebab-menu">
                                        <summary className="kebab-trigger" aria-label="Model actions">
                                          <MoreHorizontal className="h-4 w-4" />
                                        </summary>
                                        <div className="kebab-dropdown">
                                          <Button type="button" variant="ghost" onClick={() => onOpenCompareModels(model.model_id)}>
                                            <GitCompareArrows className="h-3.5 w-3.5" />
                                            Compare
                                          </Button>
                                          {!model.is_active ? (
                                            <Button type="button" variant="ghost" onClick={() => onRequestActivateModel(model)}>
                                              Make Active
                                            </Button>
                                          ) : null}
                                          <Button type="button" variant="destructive" onClick={() => onRequestDeleteModel(model)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                            Delete
                                          </Button>
                                        </div>
                                      </details>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>No models trained yet.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : null}

                {modelTab === 'train' ? (
                  <>
                    <form onSubmit={onStartTraining} className="space-y-5">
                      <div className="space-y-2">
                        <Label>Dataset</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="secondary" onClick={() => setShowDatasetExplorer(true)}>
                            <FileCode2 className="h-4 w-4" />
                            Choose Dataset
                          </Button>
                          <Badge variant="outline">
                            {selectedDataset
                              ? `${selectedDataset.original_filename} (${selectedDataset.rows} rows)`
                              : 'No dataset selected'}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="target-column">Target Column</Label>
                        <select
                          id="target-column"
                          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                          value={trainForm.target_column}
                          onChange={(e) => setTrainForm((prev) => ({ ...prev, target_column: e.target.value }))}
                          required
                        >
                          <option value="">Select target column</option>
                          {(selectedDataset?.columns || []).map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label>Feature Columns</Label>
                        <details className="checkbox-multiselect">
                          <summary>
                            Select feature columns ({trainForm.feature_columns.length} selected)
                          </summary>
                          <div className="checkbox-multiselect-list">
                            {(selectedDataset?.columns || [])
                              .filter((col) => col !== trainForm.target_column)
                              .map((col) => (
                                <label key={col} className="check">
                                  <input
                                    type="checkbox"
                                    checked={trainForm.feature_columns.includes(col)}
                                    onChange={() => onToggleFeature(col)}
                                  />
                                  {col}
                                </label>
                              ))}
                          </div>
                        </details>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="algorithm">Algorithm</Label>
                        <select
                          id="algorithm"
                          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                          value={trainForm.algorithm}
                          onChange={(e) =>
                            setTrainForm((prev) => ({
                              ...prev,
                              algorithm: e.target.value,
                              algorithm_params: {},
                            }))
                          }
                          required
                        >
                          {algorithms.map((algo) => (
                            <option key={algo.id} value={algo.id}>
                              {algo.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label>Algorithm Parameters</Label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(selectedAlgorithm?.params || []).map((param) => (
                            <div key={param.name} className="space-y-2">
                              <Label>{param.name}</Label>
                              {param.type === 'bool' ? (
                                <select
                                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                                  value={String(trainForm.algorithm_params[param.name] ?? param.default)}
                                  onChange={(e) => onParamChange(param, e.target.value)}
                                >
                                  <option value="true">True</option>
                                  <option value="false">False</option>
                                </select>
                              ) : (
                                <Input
                                  type="text"
                                  value={
                                    trainForm.algorithm_params[param.name] ??
                                    (param.default === null ? '' : String(param.default))
                                  }
                                  onChange={(e) => onParamChange(param, e.target.value)}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="train-split">Train Split (0.5 to 0.9)</Label>
                          <Input
                            id="train-split"
                            type="number"
                            min="0.5"
                            max="0.9"
                            step="0.05"
                            value={(1 - Number(trainForm.test_size || 0)).toFixed(2)}
                            onChange={(e) => {
                              const trainSplit = Number(e.target.value);
                              const nextTestSize = Math.max(0.1, Math.min(0.5, Number((1 - trainSplit).toFixed(2))));
                              setTrainForm((prev) => ({ ...prev, test_size: nextTestSize }));
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="test-size">Test Split (0.1 to 0.5)</Label>
                          <Input
                            id="test-size"
                            type="number"
                            min="0.1"
                            max="0.5"
                            step="0.05"
                            value={trainForm.test_size}
                            onChange={(e) => setTrainForm((prev) => ({ ...prev, test_size: Number(e.target.value) }))}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="random-state">Random State</Label>
                          <Input
                            id="random-state"
                            type="number"
                            value={trainForm.random_state}
                            onChange={(e) => setTrainForm((prev) => ({ ...prev, random_state: Number(e.target.value) }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="cv-folds">Cross Validation Folds</Label>
                          <Input
                            id="cv-folds"
                            type="number"
                            min="2"
                            max="10"
                            value={trainForm.cross_validation_folds}
                            disabled={!trainForm.use_cross_validation}
                            onChange={(e) =>
                              setTrainForm((prev) => ({
                                ...prev,
                                cross_validation_folds: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>

                      <label className="check">
                        <input
                          type="checkbox"
                          checked={trainForm.use_cross_validation}
                          onChange={(e) =>
                            setTrainForm((prev) => ({
                              ...prev,
                              use_cross_validation: e.target.checked,
                            }))
                          }
                        />
                        Enable Cross Validation
                      </label>

                      <Button type="submit" disabled={training}>
                        <PlayCircle className="h-4 w-4" />
                        {training ? 'Training...' : 'Start Training'}
                      </Button>
                    </form>

                    {trainError ? <p className="mt-3 text-sm text-red-600">{trainError}</p> : null}
                    {trainJob ? (
                      <div className="mt-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm text-slate-700">
                          Status: <strong>{trainJob.status}</strong> ({trainJob.progress}%)
                        </p>
                        <p className="text-sm text-slate-600">{trainJob.message}</p>
                        <Progress value={Math.min(100, Math.max(0, trainJob.progress || 0))} />
                        {trainJob.result?.metrics ? (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <Badge variant="outline">Model: {trainJob.result.algorithm_label}</Badge>
                          <Badge variant="outline">R2: {trainJob.result.metrics.r2.toFixed(4)}</Badge>
                          <Badge variant="outline">MAE: {trainJob.result.metrics.mae.toFixed(4)}</Badge>
                          <Badge variant="outline">RMSE: {trainJob.result.metrics.rmse.toFixed(4)}</Badge>
                          {trainJob.result.metrics.cv_mean_r2 != null ? (
                            <Badge variant="outline">
                              CV ({trainJob.result.metrics.cv_folds}): {Number(trainJob.result.metrics.cv_mean_r2).toFixed(4)}
                            </Badge>
                          ) : null}
                        </div>
                        ) : null}
                        {trainJob.result?.diagnostics ? (
                          <div className="grid gap-3 lg:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <p className="mb-2 text-sm font-semibold text-slate-900">Loss Curve</p>
                              {(trainJob.result.diagnostics.loss_curve || []).length ? (
                                <svg viewBox="0 0 320 170" className="w-full">
                                  <path
                                    d={buildLossCurvePath(trainJob.result.diagnostics.loss_curve)}
                                    fill="none"
                                    stroke="#2563eb"
                                    strokeWidth="2"
                                  />
                                </svg>
                              ) : (
                                <p className="text-xs text-slate-500">Loss curve not available for this algorithm.</p>
                              )}
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <p className="mb-2 text-sm font-semibold text-slate-900">Residual Plot</p>
                              {(trainJob.result.diagnostics.residual_points || []).length ? (
                                <svg viewBox="0 0 320 170" className="w-full">
                                  <line
                                    x1="20"
                                    x2="300"
                                    y1={buildResidualScatter(trainJob.result.diagnostics.residual_points).zeroY}
                                    y2={buildResidualScatter(trainJob.result.diagnostics.residual_points).zeroY}
                                    stroke="#cbd5e1"
                                    strokeDasharray="4 4"
                                  />
                                  {buildResidualScatter(trainJob.result.diagnostics.residual_points).circles.map((pt, idx) => (
                                    <circle key={`res-${idx}`} cx={pt.x} cy={pt.y} r="2.5" fill="#16a34a" opacity="0.8" />
                                  ))}
                                </svg>
                              ) : (
                                <p className="text-xs text-slate-500">Residual plot not available.</p>
                              )}
                            </div>
                          </div>
                        ) : null}
                        {trainJob.error ? <p className="text-sm text-red-600">{trainJob.error}</p> : null}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {modelTab === 'test' ? (
                  <>
                    <form className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="model-id">Model</Label>
                      <select
                          id="model-id"
                          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                          value={inferForm.model_id}
                          onChange={(e) => setInferForm((prev) => ({ ...prev, model_id: e.target.value }))}
                          required
                      >
                        <option value="">Select model</option>
                        {models.map((model) => (
                          <option key={model.model_id} value={model.model_id}>
                            {model.algorithm_label} ({model.model_id.slice(0, 8)})
                          </option>
                        ))}
                      </select>
                      {activeModelId ? (
                        <p className="text-xs text-slate-500">Active model: {activeModelId}</p>
                      ) : null}
                    </div>

                      <div className="space-y-2">
                        <Label>Test Datasets</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="secondary" onClick={() => setShowTestDatasetExplorer(true)}>
                            <FileCode2 className="h-4 w-4" />
                            Choose From Data Explorer
                          </Button>
                          <Badge variant="outline">
                            {selectedTestDatasets.length
                              ? `${selectedTestDatasets.length} dataset(s) selected`
                              : 'No test dataset selected'}
                          </Badge>
                          {selectedTestDatasets.length ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setSelectedTestDatasets([]);
                                setFileInferResults([]);
                                setOneByOneIndex(0);
                              }}
                            >
                              Clear
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="run-mode">Test Dataset Mode</Label>
                        <select
                          id="run-mode"
                          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                          value={inferRunMode}
                          onChange={(e) => setInferRunMode(e.target.value)}
                        >
                          <option value="batch">Batch (run all selected examples)</option>
                          <option value="one_by_one">One by one (run next example)</option>
                          <option value="form">Form (enter one example)</option>
                        </select>
                      </div>

                      {inferRunMode !== 'form' ? (
                        <div className="flex flex-wrap gap-2">
                          {inferRunMode === 'batch' ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={inferring || !selectedTestDatasets.length}
                              onClick={onRunBatchTestFiles}
                            >
                              {inferring ? 'Testing Examples...' : 'Run Batch Examples'}
                            </Button>
                          ) : (
                            <>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={inferring || !selectedTestDatasets.length || oneByOneIndex >= (testExamples.length || estimatedExampleCount)}
                              onClick={onRunNextTestFile}
                            >
                              {inferring ? 'Testing Example...' : 'Run Next Example'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setTestExamples([]);
                                setOneByOneIndex(0);
                                setFileInferResults([]);
                              }}
                            >
                              Reset Sequence
                            </Button>
                            </>
                          )}
                        </div>
                      ) : null}

                      {inferRunMode === 'one_by_one' && (testExamples.length || estimatedExampleCount) ? (
                        <p className="text-xs text-slate-500">
                          Step {Math.min(oneByOneIndex + 1, Math.max(testExamples.length || estimatedExampleCount, 1))} of {testExamples.length || estimatedExampleCount}
                        </p>
                      ) : null}

                      {inferRunMode !== 'form' && selectedTestDatasets.length ? (
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                          {selectedTestDatasets.map((dataset) => (
                            <p key={dataset.dataset_id}>
                              {dataset.original_filename} ({dataset.rows} rows)
                            </p>
                          ))}
                        </div>
                      ) : null}

                      {inferRunMode === 'form' || inferRunMode === 'one_by_one' ? (
                        <div className="space-y-3 border-t border-slate-200 pt-4">
                          <p className="text-sm font-medium text-slate-900">
                            {inferRunMode === 'one_by_one' ? 'Current Example Values' : 'Example Input Form'}
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {(selectedModel?.feature_columns || []).map((col) => (
                              <div key={col} className="space-y-1">
                                <Label htmlFor={`form-col-${col}`}>{col}</Label>
                                {categoricalOptions[col]?.length ? (
                                  <select
                                    id={`form-col-${col}`}
                                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                                    value={String(inferExampleForm[col] ?? '')}
                                    onChange={(e) =>
                                      setInferExampleForm((prev) => ({
                                        ...prev,
                                        [col]: e.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">Select value</option>
                                    {categoricalOptions[col].map((value) => (
                                      <option key={`${col}-${value}`} value={value}>
                                        {value}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <Input
                                    id={`form-col-${col}`}
                                    type="text"
                                    value={inferExampleForm[col] ?? ''}
                                    onChange={(e) =>
                                      setInferExampleForm((prev) => ({
                                        ...prev,
                                        [col]: e.target.value,
                                      }))
                                    }
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" onClick={clearInferForm}>
                              Clear Form
                            </Button>
                            <Button type="button" onClick={onRunFormInference} disabled={inferring}>
                              <Sparkles className="h-4 w-4" />
                              {inferring ? 'Predicting...' : 'Predict From Form'}
                            </Button>
                            {inferRunMode === 'form' ? (
                              <>
                              <Button type="button" variant="secondary" onClick={applyModelExample}>
                                Fill Example Row
                              </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </form>

                    {selectedModel?.feature_columns?.length ? (
                      <p className="mt-3 text-sm text-slate-500">Required columns: {selectedModel.feature_columns.join(', ')}</p>
                    ) : null}
                    {inferError ? <p className="mt-3 text-sm text-red-600">{inferError}</p> : null}
                    {fileInferResults.length ? (
                      <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-900">Example Test Results</p>
                        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Dataset</th>
                                <th className="px-3 py-2">Example</th>
                                <th className="px-3 py-2">Prediction</th>
                                <th className="px-3 py-2">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {fileInferResults.map((result) => (
                                <tr key={`${result.dataset_id}-${result.example_index ?? 0}`}>
                                  <td className="px-3 py-2 text-slate-700">{result.file_name}</td>
                                  <td className="px-3 py-2 text-slate-700">#{result.example_index ?? '-'}</td>
                                  <td className="px-3 py-2 text-slate-900 font-medium">
                                    {result.error ? '-' : String(result.predictions?.[0] ?? '-')}
                                  </td>
                                  <td className={`px-3 py-2 ${result.error ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {result.error || 'Success'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                    {inferResult ? (
                      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <p className="mb-2 text-sm font-semibold text-slate-900">Prediction Results</p>
                        <div className="rounded-md border border-slate-200 bg-white p-3">
                          <p className="text-xs text-slate-500">Total Predictions</p>
                          <p className="text-lg font-semibold text-slate-900">
                            {(inferResult.predictions || []).length}
                          </p>
                        </div>
                        {(inferResult.predictions || []).length ? (
                          <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                  <th className="px-3 py-2">Index</th>
                                  <th className="px-3 py-2">Prediction</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(inferResult.predictions || []).map((value, idx) => (
                                  <tr key={`pred-${idx}`}>
                                    <td className="px-3 py-2 text-slate-700">{idx + 1}</td>
                                    <td className="px-3 py-2 text-slate-900 font-medium">{String(value)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {modelTab === 'automl' ? (
                  <AutoMLWizard
                    datasets={datasets}
                    onTrainingComplete={() => {
                      fetchAll();
                    }}
                  />
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>

      <DatasetExplorerModal
        open={showDatasetExplorer}
        datasets={datasets}
        onClose={() => setShowDatasetExplorer(false)}
        onSelect={onTrainingDatasetSelected}
      />
      <DatasetExplorerModal
        open={showTestDatasetExplorer}
        datasets={datasets}
        onClose={() => setShowTestDatasetExplorer(false)}
        onSelect={() => {}}
        title="Test Dataset Explorer"
        description="Choose one or more datasets for model testing."
        selectionMode="multiple"
        selectedDatasetIds={selectedTestDatasetIds}
        onToggleSelect={onToggleTestDataset}
        onConfirmSelection={onConfirmTestDatasetSelection}
        confirmLabel="Use Selected Datasets"
      />

      <Dialog open={showActivateModelModal} onOpenChange={setShowActivateModelModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Active Model</DialogTitle>
            <DialogDescription>
              This will make <strong>{pendingActiveModel?.algorithm_label || 'this model'}</strong> the main model for any further processing.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Model ID: <span className="font-medium text-slate-900">{pendingActiveModel?.model_id || '-'}</span>
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowActivateModelModal(false);
                setPendingActiveModel(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onConfirmActivateModel}>
              Set Active
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteModelModal} onOpenChange={setShowDeleteModelModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Model</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{pendingDeleteModel?.algorithm_label || 'the selected model'}</strong> and its saved artifacts.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Model ID: <span className="font-medium text-slate-900">{pendingDeleteModel?.model_id || '-'}</span>
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (deletingModel) return;
                setShowDeleteModelModal(false);
                setPendingDeleteModel(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirmDeleteModel} disabled={deletingModel}>
              {deletingModel ? 'Deleting...' : 'Delete Model'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModelReportModal} onOpenChange={setShowModelReportModal}>
        <DialogContent className="insights-modal-dialog">
          <DialogHeader>
            <DialogTitle>Model Report</DialogTitle>
            <DialogDescription>
              Comprehensive model diagnostics and evaluation summary.
            </DialogDescription>
          </DialogHeader>

          {reportLoading ? <p className="help">Preparing report...</p> : null}
          {reportError ? <p className="error">{reportError}</p> : null}

          {modelReport ? (
            <div className="insights-shell">
              <section className="insights-hero">
                <div className="insights-hero-top">
                  <h4>{modelReport.algorithm_label || 'Model'}</h4>
                  <Badge variant="success">Model ID: {modelReport.model_id}</Badge>
                </div>
                <p className="help">
                  Evaluation: {modelReport.evaluation_method || '-'} | Created: {formatCreatedAt(modelReport.created_at)}
                </p>
                <p className="help">Target: {modelReport.target_column || '-'} | Features: {(modelReport.feature_columns || []).length}</p>
              </section>

              {/* ── Metrics: conditional by problem type ─────────────────── */}
              <section>
                <h4 className="subheading">All Metrics</h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {modelReport.problem_type === 'classification' ? (
                    <>
                      <Badge variant="outline">Accuracy: {modelReport.metrics?.accuracy != null ? Number(modelReport.metrics.accuracy).toFixed(4) : '-'}</Badge>
                      <Badge variant="outline">F1 (Macro): {modelReport.metrics?.f1_macro != null ? Number(modelReport.metrics.f1_macro).toFixed(4) : '-'}</Badge>
                      <Badge variant="outline">Precision (Macro): {modelReport.metrics?.precision_macro != null ? Number(modelReport.metrics.precision_macro).toFixed(4) : '-'}</Badge>
                      <Badge variant="outline">Recall (Macro): {modelReport.metrics?.recall_macro != null ? Number(modelReport.metrics.recall_macro).toFixed(4) : '-'}</Badge>
                      {modelReport.metrics?.cv_mean_accuracy != null && <Badge variant="outline">CV Mean Acc: {Number(modelReport.metrics.cv_mean_accuracy).toFixed(4)}</Badge>}
                      {modelReport.metrics?.cv_std_accuracy != null && <Badge variant="outline">CV Std Acc: ±{Number(modelReport.metrics.cv_std_accuracy).toFixed(4)}</Badge>}
                    </>
                  ) : modelReport.problem_type === 'clustering' ? (
                    <>
                      <Badge variant="outline">N Clusters: {modelReport.metrics?.n_clusters ?? '-'}</Badge>
                      <Badge variant="outline">Silhouette: {modelReport.metrics?.silhouette_score != null ? Number(modelReport.metrics.silhouette_score).toFixed(4) : '-'}</Badge>
                      <Badge variant="outline">Davies-Bouldin: {modelReport.metrics?.davies_bouldin_score != null ? Number(modelReport.metrics.davies_bouldin_score).toFixed(4) : '-'}</Badge>
                      <Badge variant="outline">Inertia: {modelReport.metrics?.inertia != null ? Number(modelReport.metrics.inertia).toFixed(2) : '-'}</Badge>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline">R2: {modelReport.metrics?.r2 != null ? Number(modelReport.metrics.r2).toFixed(4) : '-'}</Badge>
                      <Badge variant="outline">Adjusted R2: {modelReport.metrics?.adjusted_r2 != null ? Number(modelReport.metrics.adjusted_r2).toFixed(4) : '-'}</Badge>
                      <Badge variant="outline">MAE: {modelReport.metrics?.mae != null ? Number(modelReport.metrics.mae).toFixed(4) : '-'}</Badge>
                      <Badge variant="outline">MSE: {modelReport.metrics?.mse != null ? Number(modelReport.metrics.mse).toFixed(4) : '-'}</Badge>
                      <Badge variant="outline">RMSE: {modelReport.metrics?.rmse != null ? Number(modelReport.metrics.rmse).toFixed(4) : '-'}</Badge>
                      <Badge variant="outline">MAPE: {modelReport.metrics?.mape != null ? `${Number(modelReport.metrics.mape).toFixed(2)}%` : '-'}</Badge>
                    </>
                  )}
                </div>
              </section>

              {/* ── Metric explanations ─────────────────────────────────────── */}
              <section>
                <h4 className="subheading">Metric Explanations</h4>
                <div className="table-wrap">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Why It Matters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(modelReport.metric_explanations || []).map((row, idx) => (
                        <tr key={`mexp-${idx}`}>
                          <td>{row.metric}</td>
                          <td>{row.why_it_matters}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ── Business meaning ───────────────────────────────────────── */}
              {modelReport.business_meaning ? (
                <section>
                  <h4 className="subheading">Business Meaning</h4>
                  <p className="help">{modelReport.business_meaning}</p>
                </section>
              ) : null}

              {/* ── Important features ─────────────────────────────────────── */}
              <section>
                <h4 className="subheading">Important Features</h4>
                <div className="table-wrap">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Feature</th>
                        <th>Importance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(modelReport.important_features || []).filter((row) => Number(row?.importance || 0) > 0).length ? (
                        (modelReport.important_features || [])
                          .filter((row) => Number(row?.importance || 0) > 0)
                          .map((row, idx) => (
                          <tr key={`feat-${idx}`}>
                            <td>{row.feature}</td>
                            <td>{row.importance != null ? Number(row.importance).toFixed(6) : '-'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2}>No feature importance values above 0 for this model.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ── Regression diagnostics ─────────────────────────────────── */}
              {modelReport.problem_type === 'regression' ? (
                <>
                  <section className="chart-grid">
                    <ChartContainer title="Actual vs Predicted">
                      {(() => {
                        const points = modelReport.diagnostics?.actual_vs_predicted_points || [];
                        const scatter = buildXYScatter(points, 'actual', 'predicted');
                        const minLine = Math.min(scatter.minX, scatter.minY);
                        const maxLine = Math.max(scatter.maxX, scatter.maxY);
                        const lineScatter = buildXYScatter([{ x: minLine, y: minLine }, { x: maxLine, y: maxLine }], 'x', 'y');
                        return points.length ? (
                          <svg viewBox="0 0 340 190" className="w-full">
                            <line
                              x1={lineScatter.circles[0]?.x || 24}
                              y1={lineScatter.circles[0]?.y || 166}
                              x2={lineScatter.circles[1]?.x || 316}
                              y2={lineScatter.circles[1]?.y || 24}
                              stroke="#cbd5e1"
                              strokeDasharray="4 4"
                            />
                            {scatter.circles.map((pt, idx) => (
                              <circle key={`avp-${idx}`} cx={pt.x} cy={pt.y} r="2.5" fill="#2563eb" opacity="0.8" />
                            ))}
                          </svg>
                        ) : (
                          <p className="help">Actual vs predicted data unavailable.</p>
                        );
                      })()}
                    </ChartContainer>

                    <ChartContainer title="Residual Plot">
                      {(() => {
                        const points = modelReport.diagnostics?.residual_points || [];
                        const scatter = buildResidualScatter(points, 340, 190, 24);
                        return points.length ? (
                          <svg viewBox="0 0 340 190" className="w-full">
                            <line x1="24" x2="316" y1={scatter.zeroY} y2={scatter.zeroY} stroke="#cbd5e1" strokeDasharray="4 4" />
                            {scatter.circles.map((pt, idx) => (
                              <circle key={`resplot-${idx}`} cx={pt.x} cy={pt.y} r="2.5" fill="#16a34a" opacity="0.8" />
                            ))}
                          </svg>
                        ) : (
                          <p className="help">Residual data unavailable.</p>
                        );
                      })()}
                    </ChartContainer>

                    <ChartContainer title="QQ Plot">
                      {(() => {
                        const points = modelReport.diagnostics?.qq_plot_points || [];
                        const scatter = buildXYScatter(points, 'theoretical', 'sample');
                        const minLine = Math.min(scatter.minX, scatter.minY);
                        const maxLine = Math.max(scatter.maxX, scatter.maxY);
                        const lineScatter = buildXYScatter([{ x: minLine, y: minLine }, { x: maxLine, y: maxLine }], 'x', 'y');
                        return points.length ? (
                          <svg viewBox="0 0 340 190" className="w-full">
                            <line
                              x1={lineScatter.circles[0]?.x || 24}
                              y1={lineScatter.circles[0]?.y || 166}
                              x2={lineScatter.circles[1]?.x || 316}
                              y2={lineScatter.circles[1]?.y || 24}
                              stroke="#cbd5e1"
                              strokeDasharray="4 4"
                            />
                            {scatter.circles.map((pt, idx) => (
                              <circle key={`qq-${idx}`} cx={pt.x} cy={pt.y} r="2.5" fill="#7c3aed" opacity="0.8" />
                            ))}
                          </svg>
                        ) : (
                          <p className="help">QQ plot data unavailable.</p>
                        );
                      })()}
                    </ChartContainer>
                  </section>

                  <section>
                    <h4 className="subheading">VIF Table</h4>
                    <div className="table-wrap">
                      <table className="preview-table">
                        <thead>
                          <tr>
                            <th>Feature</th>
                            <th>VIF</th>
                            <th>Tolerance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(modelReport.vif_table || []).length ? (
                            modelReport.vif_table.map((row, idx) => (
                              <tr key={`vif-${idx}`}>
                                <td>{row.feature}</td>
                                <td>{row.vif != null ? Number(row.vif).toFixed(4) : 'inf'}</td>
                                <td>{row.tolerance != null ? Number(row.tolerance).toFixed(6) : '-'}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3}>VIF table unavailable (needs multiple numeric features).</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              ) : null}

              {/* ── Classification: Confusion Matrix ────────────────────────── */}
              {modelReport.problem_type === 'classification' && modelReport.diagnostics?.confusion_matrix?.length ? (
                <section>
                  <h4 className="subheading">Confusion Matrix</h4>
                  <div className="table-wrap">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th></th>
                          {(modelReport.diagnostics.confusion_matrix[0] || []).map((_, ci) => (
                            <th key={`cmh-${ci}`}>Pred {ci}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {modelReport.diagnostics.confusion_matrix.map((row, ri) => (
                          <tr key={`cmr-${ri}`}>
                            <td className="font-semibold">Actual {ri}</td>
                            {row.map((val, ci) => (
                              <td key={`cmc-${ri}-${ci}`} className={ri === ci ? 'bg-emerald-50 font-semibold' : ''}>{val}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {/* ── Clustering: Loss Curve ──────────────────────────────────── */}
              {modelReport.problem_type === 'clustering' && modelReport.diagnostics?.loss_curve?.length ? (
                <section className="chart-grid">
                  <ChartContainer title="Loss Curve">
                    {(() => {
                      const points = modelReport.diagnostics.loss_curve;
                      const scatter = buildXYScatter(points, 'iter', 'loss');
                      return points.length ? (
                        <svg viewBox="0 0 340 190" className="w-full">
                          {scatter.circles.map((pt, idx) => (
                            <circle key={`lc-${idx}`} cx={pt.x} cy={pt.y} r="2" fill="#f59e0b" opacity="0.8" />
                          ))}
                        </svg>
                      ) : (
                        <p className="help">Loss curve data unavailable.</p>
                      );
                    })()}
                  </ChartContainer>
                </section>
              ) : null}

              {/* ── AutoML: MLJAR Visuals ────────────────────────────────────── */}
              {modelReport.automl_visuals?.length ? (
                <section>
                  <h4 className="subheading">AutoML Model Visuals</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    {modelReport.automl_visuals.map((v) => (
                      <div key={v.filename} className="rounded-lg border bg-white overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium">
                          {v.title}
                        </div>
                        <div className="p-2">
                          <img
                            src={v.data_uri}
                            alt={v.title}
                            className="w-full h-auto rounded"
                            style={{ maxHeight: '350px', objectFit: 'contain' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* ── AutoML: MLJAR Detailed Report ───────────────────────────── */}
              {modelReport.automl_readme ? (
                <section>
                  <h4 className="subheading">AutoML Detailed Report</h4>
                  <div className="rounded-lg border bg-white">
                    <div
                      className="p-4 prose prose-sm max-w-none overflow-auto max-h-96"
                      dangerouslySetInnerHTML={{ __html: marked(modelReport.automl_readme) }}
                    />
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setShowModelReportModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCompareModal} onOpenChange={setShowCompareModal}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Compare Models</DialogTitle>
            <DialogDescription>
              Left model is fixed from selection. Choose a model on the right to compare.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Left Model</p>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm text-slate-900">
                {compareLeftModelId || '-'}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="compare-right-model">Right Model</Label>
              <select
                id="compare-right-model"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                value={compareRightModelId}
                onChange={(e) => setCompareRightModelId(e.target.value)}
              >
                <option value="">Select model</option>
                {models
                  .filter((m) => m.model_id !== compareLeftModelId)
                  .map((m) => (
                    <option key={m.model_id} value={m.model_id}>
                      {m.algorithm_label} ({m.model_id.slice(0, 8)})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {(() => {
            const leftModel = models.find((m) => m.model_id === compareLeftModelId) || null;
            const rightModel = models.find((m) => m.model_id === compareRightModelId) || null;
            if (!leftModel || !rightModel) {
              return <p className="text-sm text-slate-500">Select both models to view comparison.</p>;
            }

            const problemType = leftModel.problem_type || 'regression';
            let rows = [];

            if (problemType === 'classification') {
              rows = [
                {
                  label: 'Accuracy',
                  left: leftModel.metrics?.accuracy != null ? Number(leftModel.metrics.accuracy).toFixed(4) : '-',
                  right: rightModel.metrics?.accuracy != null ? Number(rightModel.metrics.accuracy).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.accuracy, rightModel.metrics?.accuracy, 'higher'),
                },
                {
                  label: 'F1 (Macro)',
                  left: leftModel.metrics?.f1_macro != null ? Number(leftModel.metrics.f1_macro).toFixed(4) : '-',
                  right: rightModel.metrics?.f1_macro != null ? Number(rightModel.metrics.f1_macro).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.f1_macro, rightModel.metrics?.f1_macro, 'higher'),
                },
                {
                  label: 'Precision (Macro)',
                  left: leftModel.metrics?.precision_macro != null ? Number(leftModel.metrics.precision_macro).toFixed(4) : '-',
                  right: rightModel.metrics?.precision_macro != null ? Number(rightModel.metrics.precision_macro).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.precision_macro, rightModel.metrics?.precision_macro, 'higher'),
                },
                {
                  label: 'Recall (Macro)',
                  left: leftModel.metrics?.recall_macro != null ? Number(leftModel.metrics.recall_macro).toFixed(4) : '-',
                  right: rightModel.metrics?.recall_macro != null ? Number(rightModel.metrics.recall_macro).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.recall_macro, rightModel.metrics?.recall_macro, 'higher'),
                },
              ];
            } else if (problemType === 'clustering') {
              rows = [
                {
                  label: 'N Clusters',
                  left: leftModel.metrics?.n_clusters ?? '-',
                  right: rightModel.metrics?.n_clusters ?? '-',
                  winner: '-',
                },
                {
                  label: 'Silhouette Score',
                  left: leftModel.metrics?.silhouette_score != null ? Number(leftModel.metrics.silhouette_score).toFixed(4) : '-',
                  right: rightModel.metrics?.silhouette_score != null ? Number(rightModel.metrics.silhouette_score).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.silhouette_score, rightModel.metrics?.silhouette_score, 'higher'),
                },
                {
                  label: 'Davies-Bouldin',
                  left: leftModel.metrics?.davies_bouldin_score != null ? Number(leftModel.metrics.davies_bouldin_score).toFixed(4) : '-',
                  right: rightModel.metrics?.davies_bouldin_score != null ? Number(rightModel.metrics.davies_bouldin_score).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.davies_bouldin_score, rightModel.metrics?.davies_bouldin_score, 'lower'),
                },
                {
                  label: 'Inertia',
                  left: leftModel.metrics?.inertia != null ? Number(leftModel.metrics.inertia).toFixed(2) : '-',
                  right: rightModel.metrics?.inertia != null ? Number(rightModel.metrics.inertia).toFixed(2) : '-',
                  winner: metricWinner(leftModel.metrics?.inertia, rightModel.metrics?.inertia, 'lower'),
                },
              ];
            } else {
              rows = [
                {
                  label: 'R2',
                  left: leftModel.metrics?.r2 != null ? Number(leftModel.metrics.r2).toFixed(4) : '-',
                  right: rightModel.metrics?.r2 != null ? Number(rightModel.metrics.r2).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.r2, rightModel.metrics?.r2, 'higher'),
                },
                {
                  label: 'Adjusted R2',
                  left: leftModel.metrics?.adjusted_r2 != null ? Number(leftModel.metrics.adjusted_r2).toFixed(4) : '-',
                  right: rightModel.metrics?.adjusted_r2 != null ? Number(rightModel.metrics.adjusted_r2).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.adjusted_r2, rightModel.metrics?.adjusted_r2, 'higher'),
                },
                {
                  label: 'MAE',
                  left: leftModel.metrics?.mae != null ? Number(leftModel.metrics.mae).toFixed(4) : '-',
                  right: rightModel.metrics?.mae != null ? Number(rightModel.metrics.mae).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.mae, rightModel.metrics?.mae, 'lower'),
                },
                {
                  label: 'MSE',
                  left: leftModel.metrics?.mse != null ? Number(leftModel.metrics.mse).toFixed(4) : '-',
                  right: rightModel.metrics?.mse != null ? Number(rightModel.metrics.mse).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.mse, rightModel.metrics?.mse, 'lower'),
                },
                {
                  label: 'RMSE',
                  left: leftModel.metrics?.rmse != null ? Number(leftModel.metrics.rmse).toFixed(4) : '-',
                  right: rightModel.metrics?.rmse != null ? Number(rightModel.metrics.rmse).toFixed(4) : '-',
                  winner: metricWinner(leftModel.metrics?.rmse, rightModel.metrics?.rmse, 'lower'),
                },
                {
                  label: 'MAPE',
                  left: leftModel.metrics?.mape != null ? `${Number(leftModel.metrics.mape).toFixed(2)}%` : '-',
                  right: rightModel.metrics?.mape != null ? `${Number(rightModel.metrics.mape).toFixed(2)}%` : '-',
                  winner: metricWinner(leftModel.metrics?.mape, rightModel.metrics?.mape, 'lower'),
                },
              ];
            }

            const leftWins = rows.filter((r) => r.winner === 'left').length;
            const rightWins = rows.filter((r) => r.winner === 'right').length;

            return (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div
                    className="rounded-lg border p-3"
                    style={{ background: leftWins >= rightWins ? '#ecfdf5' : '#f8fafc', borderColor: leftWins >= rightWins ? '#86efac' : '#e2e8f0' }}
                  >
                    <p className="text-xs text-slate-500">Left Model Score</p>
                    <p className="text-lg font-semibold text-slate-900">{leftWins} wins</p>
                    <p className="text-xs text-slate-600">{leftModel.algorithm_label}</p>
                  </div>
                  <div
                    className="rounded-lg border p-3"
                    style={{ background: rightWins > leftWins ? '#ecfdf5' : '#f8fafc', borderColor: rightWins > leftWins ? '#86efac' : '#e2e8f0' }}
                  >
                    <p className="text-xs text-slate-500">Right Model Score</p>
                    <p className="text-lg font-semibold text-slate-900">{rightWins} wins</p>
                    <p className="text-xs text-slate-600">{rightModel.algorithm_label}</p>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Left Model</th>
                        <th>Right Model</th>
                        <th>Better</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={`cmp-${idx}`}>
                          <td>{row.label}</td>
                          <td style={{ background: row.winner === 'left' ? '#ecfdf5' : 'transparent' }}>{row.left}</td>
                          <td style={{ background: row.winner === 'right' ? '#ecfdf5' : 'transparent' }}>{row.right}</td>
                          <td>
                            {row.winner === 'left' ? 'Left' : row.winner === 'right' ? 'Right' : row.winner === 'tie' ? 'Tie' : '-'}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td>Algorithm</td>
                        <td>{leftModel.algorithm_label}</td>
                        <td>{rightModel.algorithm_label}</td>
                        <td>-</td>
                      </tr>
                      <tr>
                        <td>Target Column</td>
                        <td>{leftModel.target_column || '-'}</td>
                        <td>{rightModel.target_column || '-'}</td>
                        <td>-</td>
                      </tr>
                      <tr>
                        <td>Creation Date</td>
                        <td>{formatCreatedAt(leftModel.created_at)}</td>
                        <td>{formatCreatedAt(rightModel.created_at)}</td>
                        <td>-</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setShowCompareModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </main>
      {!uploadModalOpen ? (
        <StatusWindow
          title="Upload Status"
          items={uploadQueue.items}
          overallProgress={uploadQueue.overallProgress}
          running={uploadQueue.running}
          onPause={uploadQueue.pauseAll}
          onResume={uploadQueue.resumeFailedOrPaused}
          onClearCompleted={uploadQueue.clearCompleted}
        />
      ) : null}
    </>
  );
}

export default App;
