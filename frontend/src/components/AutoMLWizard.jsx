import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft, BrainCircuit, CheckCircle2, ChevronDown, ChevronUp, Clock, Cpu, Database,
  History, Loader2, Play, Search, Sparkles, Target, Trophy, X, Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { marked } from 'marked';

const API_BASE = '/emly/api/prediction';

const MODE_DESCRIPTIONS = {
  Explain: 'Quick exploration — 1 model per algorithm, full explanations',
  Perform: 'Production-ready — ~13 models per algorithm, balanced speed/quality',
  Compete: 'Maximum performance — ~22 models per algorithm, stacking + ensembles',
};

function formatTimeAgo(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatDuration(startIso, endIso) {
  if (!startIso) return '';
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date();
  const diffSec = Math.floor((end - start) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  if (diffMin < 60) return `${diffMin}m ${sec}s`;
  const diffHr = Math.floor(diffMin / 60);
  const min = diffMin % 60;
  return `${diffHr}h ${min}m`;
}

export default function AutoMLWizard({ datasets, onTrainingComplete }) {
  const [step, setStep] = useState(1);

  // Step 1
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [userInstruction, setUserInstruction] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState('');

  // Step 2
  const [config, setConfig] = useState(null);
  const [timeBudget, setTimeBudget] = useState(5);
  const [recommendation, setRecommendation] = useState(null);
  const [recommending, setRecommending] = useState(false);
  const [recommendError, setRecommendError] = useState('');

  // Step 3
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelReport, setModelReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const pollRef = useRef(null);

  const selectedDataset = datasets.find((d) => d.dataset_id === selectedDatasetId) || null;

  // Editable target & features (initialized from config when it changes)
  const [editableTarget, setEditableTarget] = useState('');
  const [editableFeatures, setEditableFeatures] = useState([]);
  const [showFeaturePicker, setShowFeaturePicker] = useState(false);
  const [featureSearch, setFeatureSearch] = useState('');

  const allColumns = useMemo(() => {
    if (!selectedDataset?.columns?.length) return [];
    return selectedDataset.columns;
  }, [selectedDataset]);

  // Sync editable state when config changes
  useEffect(() => {
    if (config) {
      setEditableTarget(config.target_column || '');
      setEditableFeatures(config.feature_columns || []);
    }
  }, [config]);

  const effectiveConfig = useMemo(() => {
    if (!config) return null;
    return { ...config, target_column: editableTarget, feature_columns: editableFeatures };
  }, [config, editableTarget, editableFeatures]);

  // ── Past runs state ─────────────────────────────────────────────
  const [pastJobs, setPastJobs] = useState([]);
  const [loadingPastJobs, setLoadingPastJobs] = useState(false);
  const [viewingPastJob, setViewingPastJob] = useState(null);
  const [viewingPastProgress, setViewingPastProgress] = useState(null);
  const [viewingPastModel, setViewingPastModel] = useState(null);
  const [viewingPastModelReport, setViewingPastModelReport] = useState(null);
  const [loadingPastModelReport, setLoadingPastModelReport] = useState(false);

  const fetchPastJobs = useCallback(async () => {
    setLoadingPastJobs(true);
    try {
      const res = await fetch(`${API_BASE}/automl/jobs`);
      const data = await res.json();
      if (res.ok) setPastJobs(data.jobs || []);
    } catch { /* ignore */ }
    finally { setLoadingPastJobs(false); }
  }, []);

  useEffect(() => {
    fetchPastJobs();
  }, [fetchPastJobs]);

  // Refresh past jobs when returning to step 1
  useEffect(() => {
    if (step === 1) fetchPastJobs();
  }, [step, fetchPastJobs]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── Step 1: Detect problem type ──────────────────────────────────

  const handleDetect = async () => {
    if (!selectedDatasetId || !userInstruction.trim()) return;
    setDetecting(true);
    setDetectError('');
    try {
      const res = await fetch(`${API_BASE}/automl/detect-problem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: selectedDatasetId, user_instruction: userInstruction.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Detection failed');
      setConfig(data);
      setStep(2);
      initialSyncDone.current = false;
      handleRecommend(data, timeBudget);
    } catch (err) {
      setDetectError(err.message);
    } finally {
      setDetecting(false);
    }
  };

  // ── Step 2: Get algorithm recommendation ─────────────────────────

  const handleRecommend = async (cfg, budget) => {
    if (!cfg) return;
    setRecommending(true);
    setRecommendError('');
    try {
      const res = await fetch(`${API_BASE}/automl/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: selectedDatasetId,
          problem_type: cfg.problem_type,
          target_column: cfg.target_column,
          feature_columns: cfg.feature_columns,
          time_budget_minutes: budget,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Recommendation failed');
      setRecommendation(data);
    } catch (err) {
      setRecommendError(err.message);
    } finally {
      setRecommending(false);
    }
  };

  const handleTimeBudgetChange = (val) => {
    setTimeBudget(val);
    if (effectiveConfig) handleRecommend(effectiveConfig, val);
  };

  const handleTargetChange = (newTarget) => {
    setEditableTarget(newTarget);
    setEditableFeatures((prev) => prev.filter((c) => c !== newTarget));
  };

  const handleToggleFeature = (col) => {
    if (col === editableTarget) return;
    setEditableFeatures((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const handleSelectAllFeatures = () => {
    setEditableFeatures(allColumns.filter((c) => c !== editableTarget));
  };

  const handleDeselectAllFeatures = () => {
    setEditableFeatures([]);
  };

  // Re-recommend when target/features change (debounced), skip initial sync
  const featureChangeTimer = useRef(null);
  const initialSyncDone = useRef(false);
  useEffect(() => {
    if (!config || !editableTarget) return;
    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      return;
    }
    if (featureChangeTimer.current) clearTimeout(featureChangeTimer.current);
    featureChangeTimer.current = setTimeout(() => {
      handleRecommend(effectiveConfig, timeBudget);
    }, 600);
    return () => { if (featureChangeTimer.current) clearTimeout(featureChangeTimer.current); };
  }, [editableTarget, editableFeatures]);

  // ── Step 3: Start training ───────────────────────────────────────

  const handleStartTraining = async () => {
    if (!effectiveConfig || !recommendation) return;
    try {
      const res = await fetch(`${API_BASE}/automl/train/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: selectedDatasetId,
          problem_type: effectiveConfig.problem_type,
          target_column: editableTarget,
          feature_columns: editableFeatures,
          mode: recommendation.mode,
          algorithms: recommendation.algorithms,
          time_budget_minutes: timeBudget,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Training start failed');
      setJobId(data.job_id);
      setStep(3);
      startPolling(data.job_id);
    } catch (err) {
      alert(err.message);
    }
  };

  const startPolling = (jid) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/automl/train/${jid}/progress`);
        const data = await res.json();
        setProgress(data);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (data.status === 'completed' && onTrainingComplete) {
            onTrainingComplete();
          }
        }
      } catch { /* ignore */ }
    }, 3000);
  };

  const handleViewModel = async (modelName, forPastJob = false) => {
    const currentJobId = forPastJob ? viewingPastJob?.job_id : jobId;
    if (!currentJobId || !modelName) return;

    if (forPastJob) {
      if (viewingPastModel === modelName) {
        setViewingPastModel(null);
        setViewingPastModelReport(null);
        return;
      }
      setViewingPastModel(modelName);
      setLoadingPastModelReport(true);
      setViewingPastModelReport(null);
      try {
        const res = await fetch(`${API_BASE}/automl/train/${currentJobId}/model/${encodeURIComponent(modelName)}/report`);
        if (!res.ok) { setViewingPastModelReport(null); return; }
        const data = await res.json();
        setViewingPastModelReport(data);
      } catch { setViewingPastModelReport(null); }
      finally { setLoadingPastModelReport(false); }
      return;
    }

    if (selectedModel === modelName) {
      setSelectedModel(null);
      setModelReport(null);
      return;
    }
    setSelectedModel(modelName);
    setLoadingReport(true);
    setModelReport(null);
    try {
      const res = await fetch(reportUrl(modelName));
      if (!res.ok) {
        setModelReport(null);
        return;
      }
      const data = await res.json();
      setModelReport(data);
    } catch {
      setModelReport(null);
    } finally {
      setLoadingReport(false);
    }
  };

  const visualUrl = (jid, modelName, filename) =>
    `${API_BASE}/automl/train/${jid}/model/${encodeURIComponent(modelName)}/visual/${encodeURIComponent(filename)}`;

  const reportUrl = (modelName) =>
    `${API_BASE}/automl/train/${jobId}/model/${encodeURIComponent(modelName)}/report`;

  // ── View past job details ────────────────────────────────────────

  const handleViewPastJob = async (job) => {
    setViewingPastJob(job);
    setViewingPastProgress(null);
    setViewingPastModel(null);
    setViewingPastModelReport(null);
    try {
      const res = await fetch(`${API_BASE}/automl/train/${job.job_id}/progress`);
      if (res.ok) {
        const data = await res.json();
        setViewingPastProgress(data);
      }
    } catch { /* ignore */ }
  };

  const handleClosePastJob = () => {
    setViewingPastJob(null);
    setViewingPastProgress(null);
    setViewingPastModel(null);
    setViewingPastModelReport(null);
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedDatasetId('');
    setUserInstruction('');
    setConfig(null);
    setRecommendation(null);
    setJobId(null);
    setProgress(null);
    setSelectedModel(null);
    setModelReport(null);
    handleClosePastJob();
    initialSyncDone.current = false;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      {!viewingPastJob && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {['Describe', 'Review & Configure', 'Training'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                step > i + 1 ? 'bg-green-500 text-white'
                  : step === i + 1 ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {step > i + 1 ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={step === i + 1 ? 'text-foreground font-medium' : ''}>{label}</span>
              {i < 2 && <div className="w-8 h-px bg-gray-300" />}
            </div>
          ))}
        </div>
      )}

      {/* ── Viewing Past Job Detail ──────────────────────────────── */}
      {viewingPastJob && (
        <PastJobDetailView
          job={viewingPastJob}
          progress={viewingPastProgress}
          datasets={datasets}
          selectedModel={viewingPastModel}
          modelReport={viewingPastModelReport}
          loadingReport={loadingPastModelReport}
          onViewModel={(name) => handleViewModel(name, true)}
          onClose={handleClosePastJob}
          visualUrl={visualUrl}
          marked={marked}
        />
      )}

      {/* ── Step 1: Describe ─────────────────────────────────────── */}
      {step === 1 && !viewingPastJob && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-blue-500" />
                What do you want to predict?
              </CardTitle>
              <CardDescription>
                Select a dataset and describe your goal. The AI will analyze your data and determine the best approach.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Dataset</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                >
                  <option value="">Select a dataset...</option>
                  {datasets.map((d) => (
                    <option key={d.dataset_id} value={d.dataset_id}>
                      {d.original_filename} ({d.rows} rows, {d.columns_count} cols)
                    </option>
                  ))}
                </select>
                {selectedDataset && (
                  <div className="flex gap-2 flex-wrap mt-1">
                    <Badge variant="outline">{selectedDataset.rows} rows</Badge>
                    <Badge variant="outline">{selectedDataset.columns_count} columns</Badge>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>What do you want to predict or analyze?</Label>
                <Input
                  placeholder='e.g. "Predict house prices" or "Classify customers as churn or not"'
                  value={userInstruction}
                  onChange={(e) => setUserInstruction(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDetect()}
                />
              </div>

              {detectError && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{detectError}</div>
              )}

              <Button onClick={handleDetect} disabled={!selectedDatasetId || !userInstruction.trim() || detecting} className="w-full">
                {detecting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing your dataset...</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" />Analyze Dataset</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* ── Previous Training Runs ─────────────────────────────── */}
          {pastJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-purple-500" />
                  Previous Training Runs
                </CardTitle>
                <CardDescription>
                  Click a run to view its leaderboard, model details, and visuals.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Status</th>
                          <th className="text-left px-3 py-2 font-medium">Dataset</th>
                          <th className="text-left px-3 py-2 font-medium">Target</th>
                          <th className="text-left px-3 py-2 font-medium">Mode</th>
                          <th className="text-right px-3 py-2 font-medium">Models</th>
                          <th className="text-left px-3 py-2 font-medium">Best Model</th>
                          <th className="text-left px-3 py-2 font-medium">When</th>
                          <th className="text-center px-3 py-2 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pastJobs.map((job) => (
                          <tr
                            key={job.job_id}
                            className="border-t hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => handleViewPastJob(job)}
                          >
                            <td className="px-3 py-2">
                              <Badge variant={
                                job.status === 'completed' ? 'default'
                                  : job.status === 'failed' ? 'destructive'
                                  : job.status === 'running' ? 'secondary'
                                  : 'outline'
                              } className="text-xs">
                                {job.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                {job.status === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                {job.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs max-w-[140px] truncate" title={job.dataset_name || job.dataset_id}>
                              {job.dataset_name || (job.dataset_id ? `${job.dataset_id.slice(0, 8)}...` : '-')}
                            </td>
                            <td className="px-3 py-2 font-medium text-xs">{job.target_column || '-'}</td>
                            <td className="px-3 py-2 text-xs">
                              {job.mode && <Badge variant="outline" className="text-xs">{job.mode}</Badge>}
                            </td>
                            <td className="px-3 py-2 text-right text-xs">{job.completed_models_count}</td>
                            <td className="px-3 py-2 text-xs">
                              {job.best_model ? (
                                <span className="text-green-700 font-medium">{job.best_model}</span>
                              ) : '-'}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {formatTimeAgo(job.started_at)}
                              {job.started_at && (
                                <span className="block text-[10px]">
                                  {formatDuration(job.started_at, job.finished_at)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {loadingPastJobs && (
                  <div className="flex items-center justify-center py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading runs...
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Step 2: Review & Configure ───────────────────────────── */}
      {step === 2 && config && !viewingPastJob && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-500" />
              Problem Analysis
            </CardTitle>
            <CardDescription>
              The AI analyzed your dataset. Review the configuration below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* AI message */}
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                <span>{config.message}</span>
              </div>
            </div>

            {/* Problem type badge */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Problem Type:</span>
              <Badge className={config.problem_type === 'classification' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}>
                {config.problem_type === 'classification' ? 'Classification' : 'Regression'}
              </Badge>
            </div>

            {/* Editable Target Column */}
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />
                Target Column
              </Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editableTarget}
                onChange={(e) => handleTargetChange(e.target.value)}
              >
                <option value="">Select target column...</option>
                {allColumns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              {editableTarget && (
                <p className="text-xs text-muted-foreground">
                  The model will predict values for <strong>{editableTarget}</strong>.
                </p>
              )}
            </div>

            {/* Editable Feature Columns */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">
                  Features ({editableFeatures.length} / {allColumns.filter((c) => c !== editableTarget).length})
                </Label>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleSelectAllFeatures}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleDeselectAllFeatures}>
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setShowFeaturePicker((v) => !v)}
                  >
                    {showFeaturePicker ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showFeaturePicker ? 'Hide' : 'Edit'}
                  </Button>
                </div>
              </div>

              {/* Selected features preview (compact) */}
              {!showFeaturePicker && (
                <div className="flex flex-wrap gap-1">
                  {editableFeatures.slice(0, 10).map((c) => (
                    <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                  {editableFeatures.length > 10 && (
                    <Badge variant="outline" className="text-xs">+{editableFeatures.length - 10} more</Badge>
                  )}
                  {editableFeatures.length === 0 && (
                    <span className="text-xs text-red-500">No features selected</span>
                  )}
                </div>
              )}

              {/* Feature picker (expanded) */}
              {showFeaturePicker && (
                <div className="rounded-md border bg-background">
                  <div className="p-2 border-b">
                    <Input
                      placeholder="Search columns..."
                      value={featureSearch}
                      onChange={(e) => setFeatureSearch(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                    {allColumns
                      .filter((c) => c !== editableTarget)
                      .filter((c) => !featureSearch || c.toLowerCase().includes(featureSearch.toLowerCase()))
                      .map((col) => {
                        const checked = editableFeatures.includes(col);
                        return (
                          <label
                            key={col}
                            className={`flex items-center gap-2 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
                              checked ? 'bg-blue-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => handleToggleFeature(col)}
                            />
                            <span className={checked ? 'font-medium' : 'text-muted-foreground'}>{col}</span>
                          </label>
                        );
                      })}
                    {allColumns.filter((c) => c !== editableTarget).filter((c) => !featureSearch || c.toLowerCase().includes(featureSearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">No columns match your search.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {config.dataset_summary && (
              <div className="flex gap-3 flex-wrap">
                {config.dataset_summary.quality_score != null && (
                  <Badge variant="outline">Quality: {config.dataset_summary.quality_score}/100</Badge>
                )}
                {config.dataset_summary.difficulty && (
                  <Badge variant="outline">Difficulty: {config.dataset_summary.difficulty}</Badge>
                )}
              </div>
            )}

            {/* Time budget */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time Budget
              </Label>
              <div className="flex gap-2">
                {[2, 5, 15, 30, 60].map((min) => (
                  <button
                    key={min}
                    type="button"
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      timeBudget === min
                        ? 'bg-blue-100 border-blue-400 text-blue-800 font-medium'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                    onClick={() => handleTimeBudgetChange(min)}
                  >
                    {min < 60 ? `${min}m` : `${min / 60}h`}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                More time usually means more models tried and better results, but this is a maximum budget, not a guaranteed runtime.
              </p>
            </div>

            {/* Algorithm recommendation */}
            {recommendation && (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-purple-500" />
                  <span className="font-medium">Training Plan</span>
                  <Badge className="bg-purple-100 text-purple-800">{recommendation.mode} Mode</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{recommendation.message}</p>
                <div className="space-y-2">
                  {(recommendation.algorithm_details || []).map((algo) => (
                    <div key={algo.name} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium">{algo.name}</span>
                        <span className="text-muted-foreground ml-2">{algo.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {recommending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />Updating plan...
                  </div>
                )}
              </div>
            )}

            {recommendError && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{recommendError}</div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleStartTraining} className="flex-1" disabled={!recommendation || recommending || !editableTarget || editableFeatures.length === 0}>
                <Play className="mr-2 h-4 w-4" />
                Start Training ({timeBudget < 60 ? `${timeBudget} minutes` : `${timeBudget / 60} hour${timeBudget > 60 ? 's' : ''}`})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Live Training Monitor ────────────────────────── */}
      {step === 3 && progress && !viewingPastJob && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {progress.status === 'completed' ? (
                <><Trophy className="h-5 w-5 text-yellow-500" />Training Complete</>
              ) : progress.status === 'failed' ? (
                <><span className="text-red-500">Training Failed</span></>
              ) : (
                <><Loader2 className="h-5 w-5 text-blue-500 animate-spin" />Training in Progress</>
              )}
            </CardTitle>
            <CardDescription>
              {progress.status === 'running' && progress.current_step
                ? `Current step: ${progress.current_step}`
                : progress.status === 'completed'
                ? `${progress.completed_models?.length || 0} models trained. Click a model to see details.`
                : progress.status === 'failed'
                ? progress.error || 'Training failed.'
                : 'Starting MLJAR AutoML...'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step progress */}
            {progress.status === 'running' && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span className="font-medium">{progress.current_step || 'Initializing...'}</span>
                <span className="text-muted-foreground ml-auto">
                  {progress.completed_models?.length || 0} models trained
                </span>
              </div>
            )}

            {/* Completed models table */}
            {progress.completed_models?.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Model</th>
                        <th className="text-right px-3 py-2 font-medium">Metric</th>
                        <th className="text-right px-3 py-2 font-medium">Time</th>
                        <th className="text-center px-3 py-2 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progress.completed_models.map((m, i) => {
                        const isBest = progress.best_model === m.name;
                        const isSelected = selectedModel === m.name;
                        return (
                          <tr key={m.name} className={`border-t cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50' : isBest ? 'bg-green-50' : 'hover:bg-gray-50'
                          }`} onClick={() => handleViewModel(m.name)}>
                            <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-1.5">
                              <span className={isBest ? 'font-bold text-green-700' : ''}>{m.name}</span>
                              {isBest && <Trophy className="inline h-3 w-3 ml-1 text-yellow-500" />}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {typeof m.metric === 'number' ? m.metric.toFixed(4) : m.metric}
                            </td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">
                              {m.train_time?.toFixed(1)}s
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                                {isSelected ? 'Hide' : 'View'}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Model detail panel with visuals */}
            {selectedModel && (
              <div className="rounded-lg border bg-gray-50/50">
                <div className="px-4 py-3 border-b bg-white rounded-t-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{selectedModel}</span>
                    {progress.best_model === selectedModel && (
                      <Badge className="bg-green-100 text-green-800">Best Model</Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedModel(null); setModelReport(null); }}>
                    Close
                  </Button>
                </div>

                <div className="p-4 space-y-4">
                  {modelReport?.visuals?.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {modelReport.visuals.map((v) => (
                        <div key={v.filename} className="rounded-lg border bg-white overflow-hidden">
                          <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium">
                            {v.title}
                          </div>
                          <div className="p-2">
                            {v.type === 'svg' ? (
                              <object
                                data={visualUrl(jobId, selectedModel, v.filename)}
                                type="image/svg+xml"
                                className="w-full h-auto"
                                style={{ maxHeight: '400px' }}
                              >
                                <img src={visualUrl(jobId, selectedModel, v.filename)} alt={v.title} className="w-full" />
                              </object>
                            ) : (
                              <img
                                src={visualUrl(jobId, selectedModel, v.filename)}
                                alt={v.title}
                                className="w-full h-auto rounded"
                                style={{ maxHeight: '400px', objectFit: 'contain' }}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {loadingReport && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
                      <span className="text-sm text-muted-foreground">Loading model report...</span>
                    </div>
                  )}

                  {modelReport?.readme && (
                    <div className="rounded-lg border bg-white">
                      <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium">
                        Detailed Report
                      </div>
                      <div
                        className="p-4 prose prose-sm max-w-none overflow-auto max-h-96"
                        dangerouslySetInnerHTML={{ __html: marked(modelReport.readme) }}
                      />
                    </div>
                  )}

                  {!modelReport?.visuals?.length && !loadingReport && (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No visuals available for this model.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Leaderboard (if available) */}
            {progress.leaderboard?.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 font-medium text-sm flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  Final Leaderboard
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {Object.keys(progress.leaderboard[0]).slice(0, 6).map((key) => (
                          <th key={key} className="text-left px-3 py-2 font-medium text-xs">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {progress.leaderboard.map((row, i) => (
                        <tr key={i} className={`border-t ${i === 0 ? 'bg-green-50 font-medium' : ''}`}>
                          {Object.values(row).slice(0, 6).map((val, j) => (
                            <td key={j} className="px-3 py-1.5 text-xs">{String(val)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Best model visuals (completed state, no model selected) */}
            {progress.status === 'completed' && !selectedModel && progress.best_model_visuals?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  Best Model: {progress.best_model}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {progress.best_model_visuals.map((v) => (
                    <div key={v.filename} className="rounded-lg border bg-white overflow-hidden">
                      <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium">
                        {v.title}
                      </div>
                      <div className="p-2">
                        <img
                          src={visualUrl(jobId, progress.best_model, v.filename)}
                          alt={v.title}
                          className="w-full h-auto rounded"
                          style={{ maxHeight: '350px', objectFit: 'contain' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Model registered for predictions */}
            {progress.status === 'completed' && progress.registered_model_id && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
                <div className="flex items-center gap-2 font-medium mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Model Ready for Predictions
                </div>
                <p>
                  Best model <strong>{progress.best_model}</strong> is registered and ready to use.
                  Model ID: <code className="bg-green-100 px-1 rounded text-xs">{progress.registered_model_id}</code>
                </p>
                <p className="mt-1 text-xs text-green-600">
                  Go to "Test Model" tab and select this AutoML model to run predictions.
                </p>
              </div>
            )}

            {/* Best model report (completed state) */}
            {progress.status === 'completed' && progress.best_model_report && !selectedModel && (
              <div className="rounded-lg border">
                <div className="px-3 py-2 bg-gray-50 font-medium text-sm flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  Full Leaderboard Report
                </div>
                <div
                  className="p-4 prose prose-sm max-w-none overflow-auto max-h-96"
                  dangerouslySetInnerHTML={{ __html: marked(progress.best_model_report) }}
                />
              </div>
            )}

            {/* Waiting state */}
            {progress.status === 'running' && progress.completed_models?.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Training models... Results will appear here as each model completes.</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={resetWizard}>
                Start New Analysis
              </Button>
              {progress.status === 'completed' && (
                <Button variant="outline" onClick={() => handleViewModel(progress.best_model)}>
                  <Trophy className="mr-2 h-4 w-4" />
                  View Best Model Details
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


// ── Past Job Detail View (reusable for viewing any completed/failed job) ──

function PastJobDetailView({ job, progress, datasets, selectedModel, modelReport, loadingReport, onViewModel, onClose, visualUrl, marked }) {
  const dataset = datasets.find((d) => d.dataset_id === job.dataset_id);
  const p = progress || {};

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              {p.status === 'completed' ? (
                <><Trophy className="h-5 w-5 text-yellow-500" />Training Results</>
              ) : p.status === 'failed' ? (
                <><span className="text-red-500">Failed Training</span></>
              ) : (
                <><History className="h-5 w-5 text-purple-500" />Training Run</>
              )}
            </CardTitle>
            <Badge variant={p.status === 'completed' ? 'default' : p.status === 'failed' ? 'destructive' : 'secondary'}>
              {p.status || job.status}
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        </div>
        <CardDescription>
          Run <code className="text-xs">{job.job_id.slice(0, 8)}</code>
          {dataset && <> on <strong>{dataset.original_filename}</strong></>}
          {job.target_column && <> — Target: <strong>{job.target_column}</strong></>}
          {job.mode && <> — Mode: <strong>{job.mode}</strong></>}
          {job.started_at && <> — {formatDuration(job.started_at, job.finished_at)}</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!progress && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
            <span className="text-sm text-muted-foreground">Loading run details...</span>
          </div>
        )}

        {progress && p.error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{p.error}</div>
        )}

        {/* Completed models table */}
        {p.completed_models?.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Model</th>
                    <th className="text-right px-3 py-2 font-medium">Metric</th>
                    <th className="text-right px-3 py-2 font-medium">Time</th>
                    <th className="text-center px-3 py-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {p.completed_models.map((m, i) => {
                    const isBest = p.best_model === m.name;
                    const isSelected = selectedModel === m.name;
                    return (
                      <tr key={m.name} className={`border-t cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50' : isBest ? 'bg-green-50' : 'hover:bg-gray-50'
                      }`} onClick={() => onViewModel(m.name)}>
                        <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          <span className={isBest ? 'font-bold text-green-700' : ''}>{m.name}</span>
                          {isBest && <Trophy className="inline h-3 w-3 ml-1 text-yellow-500" />}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">
                          {typeof m.metric === 'number' ? m.metric.toFixed(4) : m.metric}
                        </td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">
                          {m.train_time?.toFixed(1)}s
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                            {isSelected ? 'Hide' : 'View'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Model detail panel */}
        {selectedModel && (
          <div className="rounded-lg border bg-gray-50/50">
            <div className="px-4 py-3 border-b bg-white rounded-t-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{selectedModel}</span>
                {p.best_model === selectedModel && (
                  <Badge className="bg-green-100 text-green-800">Best Model</Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => onViewModel(selectedModel)}>
                Close
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {modelReport?.visuals?.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {modelReport.visuals.map((v) => (
                    <div key={v.filename} className="rounded-lg border bg-white overflow-hidden">
                      <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium">{v.title}</div>
                      <div className="p-2">
                        {v.type === 'svg' ? (
                          <object
                            data={visualUrl(job.job_id, selectedModel, v.filename)}
                            type="image/svg+xml"
                            className="w-full h-auto"
                            style={{ maxHeight: '400px' }}
                          >
                            <img src={visualUrl(job.job_id, selectedModel, v.filename)} alt={v.title} className="w-full" />
                          </object>
                        ) : (
                          <img
                            src={visualUrl(job.job_id, selectedModel, v.filename)}
                            alt={v.title}
                            className="w-full h-auto rounded"
                            style={{ maxHeight: '400px', objectFit: 'contain' }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {loadingReport && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
                  <span className="text-sm text-muted-foreground">Loading model report...</span>
                </div>
              )}
              {modelReport?.readme && (
                <div className="rounded-lg border bg-white">
                  <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium">Detailed Report</div>
                  <div
                    className="p-4 prose prose-sm max-w-none overflow-auto max-h-96"
                    dangerouslySetInnerHTML={{ __html: marked(modelReport.readme) }}
                  />
                </div>
              )}
              {!modelReport?.visuals?.length && !loadingReport && (
                <div className="text-sm text-muted-foreground text-center py-4">No visuals available for this model.</div>
              )}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {p.leaderboard?.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 font-medium text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Final Leaderboard
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {Object.keys(p.leaderboard[0]).slice(0, 6).map((key) => (
                      <th key={key} className="text-left px-3 py-2 font-medium text-xs">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.leaderboard.map((row, i) => (
                    <tr key={i} className={`border-t ${i === 0 ? 'bg-green-50 font-medium' : ''}`}>
                      {Object.values(row).slice(0, 6).map((val, j) => (
                        <td key={j} className="px-3 py-1.5 text-xs">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Best model visuals */}
        {p.status === 'completed' && !selectedModel && p.best_model_visuals?.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Best Model: {p.best_model}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {p.best_model_visuals.map((v) => (
                <div key={v.filename} className="rounded-lg border bg-white overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium">{v.title}</div>
                  <div className="p-2">
                    <img
                      src={visualUrl(job.job_id, p.best_model, v.filename)}
                      alt={v.title}
                      className="w-full h-auto rounded"
                      style={{ maxHeight: '350px', objectFit: 'contain' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Best model report */}
        {p.status === 'completed' && p.best_model_report && !selectedModel && (
          <div className="rounded-lg border">
            <div className="px-3 py-2 bg-gray-50 font-medium text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Full Leaderboard Report
            </div>
            <div
              className="p-4 prose prose-sm max-w-none overflow-auto max-h-96"
              dangerouslySetInnerHTML={{ __html: marked(p.best_model_report) }}
            />
          </div>
        )}

        {/* Registered model info */}
        {p.status === 'completed' && p.registered_model_id && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
            <div className="flex items-center gap-2 font-medium mb-1">
              <CheckCircle2 className="h-4 w-4" />
              Model Registered
            </div>
            <p>
              Best model <strong>{p.best_model}</strong> — Model ID: <code className="bg-green-100 px-1 rounded text-xs">{p.registered_model_id}</code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
