import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, Layers3, ShieldCheck } from 'lucide-react';
import { BarListChart, ChartContainer } from './ui/chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const API_BASE = '/emly/api/prediction';

const SEGMENT_TABS = [
  { id: 'model_building_summary', label: 'AI Summary' },
  { id: 'overview', label: 'Overview' },
  { id: 'data_quality', label: 'Data Quality' },
  { id: 'target_diagnostics', label: 'Target' },
  { id: 'feature_readiness', label: 'Features' },
  { id: 'validation_strategy', label: 'Validation' },
  { id: 'preprocessing', label: 'Preprocessing' },
];

function InsightsModal({ open, dataset, onClose }) {
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState('');
  const [missingInsights, setMissingInsights] = useState(false);
  const [insights, setInsights] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (open) setActiveTab('overview');
  }, [open, dataset?.dataset_id]);

  useEffect(() => {
    if (!open || !dataset?.dataset_id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setMissingInsights(false);
      setInsights(null);
      try {
        const res = await fetch(`${API_BASE}/datasets/${dataset.dataset_id}/insights`);
        const body = await res.json();
        if (!res.ok) {
          const detail = body.detail || 'Failed to fetch insights';
          if (res.status === 404 && String(detail).toLowerCase().includes('insights')) {
            if (!cancelled) {
              setMissingInsights(true);
              setError(detail);
            }
            return;
          }
          throw new Error(detail);
        }
        if (!cancelled) setInsights(body.insights);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to fetch insights');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, dataset?.dataset_id]);

  const onRecomputeInsights = async () => {
    if (!dataset?.dataset_id) return;
    setRecomputing(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/datasets/${dataset.dataset_id}/insights/recompute`, {
        method: 'POST',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to recompute insights');
      setInsights(body.insights || null);
      setMissingInsights(false);
      setActiveTab('overview');
    } catch (err) {
      setError(err.message || 'Failed to recompute insights');
    } finally {
      setRecomputing(false);
    }
  };

  const segments = useMemo(() => insights?.segments || {}, [insights]);
  const overview = segments.overview || {};
  const dataQuality = segments.data_quality || {};
  const targetDiagnostics = segments.target_diagnostics || {};
  const featureReadiness = segments.feature_readiness || {};
  const validationStrategy = segments.validation_strategy || {};
  const preprocessing = segments.preprocessing || {};
  const modelSummary = segments.model_building_summary || insights?.llm_summary || {};
  const semanticContext = targetDiagnostics.semantic_context || {};
  const semanticDomain = String(semanticContext.primary_domain || targetDiagnostics.profile?.semantic_domain || 'general_tabular');
  const semanticDomainLabel = semanticDomain.replace(/_/g, ' ');
  const semanticConfidencePct = Math.round(Number(semanticContext.confidence || 0) * 100);
  const semanticEvidence = Array.isArray(semanticContext.evidence_columns) ? semanticContext.evidence_columns : [];

  const tabButtonClass = (isActive) => (
    isActive
      ? 'rounded-md border border-slate-300 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white'
      : 'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50'
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="insights-modal-dialog">
        <DialogHeader>
          <DialogTitle>Dataset Insights</DialogTitle>
          <DialogDescription>{dataset?.original_filename || 'Dataset analysis'}</DialogDescription>
        </DialogHeader>

        {loading ? <p className="help">Loading saved insights...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {missingInsights ? (
          <div className="modal-actions">
            <Button type="button" onClick={onRecomputeInsights} disabled={recomputing}>
              {recomputing ? 'Recomputing...' : 'Recompute Insights'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : null}

        {insights ? (
          <div className="insights-shell">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Insight segments">
              {SEGMENT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={tabButtonClass(activeTab === tab.id)}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'model_building_summary' ? (
              <>
                <section className="insights-hero">
                  <div className="insights-hero-top">
                    <h4>{modelSummary.headline || 'Model-Building Summary'}</h4>
                    <Badge variant="outline">
                      Risk: {modelSummary.risk_level || 'unknown'}
                    </Badge>
                  </div>
                  <p className="help">
                    Source: {modelSummary.generated_by || 'n/a'} | Generated: {modelSummary.generated_at || '-'}
                  </p>
                  <p className="help">
                    Dataset semantics: {semanticDomain}
                  </p>
                  <p className="help">
                    This dataset likely represents <strong>{semanticDomainLabel}</strong>
                    {semanticConfidencePct > 0 ? ` (confidence ${semanticConfidencePct}%)` : ''}.
                    {semanticEvidence.length ? ` Evidence columns: ${semanticEvidence.slice(0, 5).join(', ')}.` : ''}
                  </p>
                  <p className="help">{modelSummary.summary || 'No summary available. Click Recompute Insights.'}</p>
                </section>

                <section>
                  <h4 className="subheading">Priority Actions</h4>
                  {(modelSummary.priority_actions || []).length ? (
                    <ul className="insight-list">
                      {(modelSummary.priority_actions || []).map((item, idx) => (
                        <li key={`msa-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="help">No priority actions generated.</p>
                  )}
                </section>
              </>
            ) : null}

            {activeTab === 'overview' ? (
              <>
                <section className="insights-hero">
                  <div className="insights-hero-top">
                    <h4>Dataset Quality Overview</h4>
                    <Badge variant="success">Score: {overview.quality_score ?? insights.quality_score}</Badge>
                  </div>
                  <p className="help">
                    Rows {overview.rows ?? insights.rows} | Columns {overview.columns ?? insights.columns} | Memory {overview.memory_mb ?? insights.memory_mb} MB
                  </p>
                  <div className="insights-kpi-grid">
                    <div className="insights-kpi-card">
                      <Database size={16} />
                      <span>Missing</span>
                      <strong>{insights.total_missing_values} ({insights.missing_pct_dataset}%)</strong>
                    </div>
                    <div className="insights-kpi-card">
                      <AlertTriangle size={16} />
                      <span>Duplicates</span>
                      <strong>{insights.duplicate_rows} ({insights.duplicate_pct}%)</strong>
                    </div>
                    <div className="insights-kpi-card">
                      <Layers3 size={16} />
                      <span>Numeric / Categorical</span>
                      <strong>{insights.numeric_columns} / {insights.categorical_columns}</strong>
                    </div>
                    <div className="insights-kpi-card">
                      <ShieldCheck size={16} />
                      <span>Status</span>
                      <strong>{(overview.issues || insights.issues || []).length ? 'Attention Needed' : 'Healthy'}</strong>
                    </div>
                  </div>
                </section>

                {(overview.issues || insights.issues || []).length ? (
                  <section className="insights-issues-block">
                    <h4>Detected Issues</h4>
                    <div className="issue-chips">
                      {(overview.issues || insights.issues || []).map((issue) => (
                        <span key={issue} className="issue-chip">{issue}</span>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section>
                  <h4 className="subheading">Modeling Recommendations</h4>
                  {(insights.recommendations || []).length ? (
                    <ul className="insight-list">
                      {(insights.recommendations || []).map((item, idx) => (
                        <li key={`rec-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="help">No special recommendations generated.</p>
                  )}
                </section>
              </>
            ) : null}

            {activeTab === 'data_quality' ? (
              <>
                <section className="chart-grid">
                  <ChartContainer title="Missing Values By Column">
                    <BarListChart
                      data={dataQuality.charts?.missing_by_column || insights.charts?.missing_by_column || []}
                      valueKey="missing_pct"
                      labelKey="column"
                      colorClass="bar-blue"
                    />
                  </ChartContainer>

                  <ChartContainer title="Std Dev By Numeric Column">
                    <BarListChart
                      data={dataQuality.charts?.std_by_numeric_column || insights.charts?.std_by_numeric_column || []}
                      valueKey="std"
                      labelKey="column"
                      colorClass="bar-green"
                    />
                  </ChartContainer>

                  <ChartContainer title="Outlier % By Numeric Column">
                    <BarListChart
                      data={dataQuality.charts?.outlier_pct_by_column || insights.charts?.outlier_pct_by_column || []}
                      valueKey="outlier_pct"
                      labelKey="column"
                      colorClass="bar-orange"
                    />
                  </ChartContainer>
                </section>

                <section>
                  <h4 className="subheading">Column Summary</h4>
                  <div className="table-wrap">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>Column</th>
                          <th>Type</th>
                          <th>Missing %</th>
                          <th>Unique</th>
                          <th>Unique %</th>
                          <th>Constant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dataQuality.column_types || insights.column_types || []).length ? (
                          (dataQuality.column_types || insights.column_types || []).slice(0, 40).map((row, idx) => (
                            <tr key={`ctype-${idx}`}>
                              <td>{row.column}</td>
                              <td>{row.dtype}</td>
                              <td>{row.missing_pct}</td>
                              <td>{row.unique}</td>
                              <td>{row.unique_ratio_pct}</td>
                              <td>{row.is_constant ? 'yes' : 'no'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6}>No column summary available.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null}

            {activeTab === 'target_diagnostics' ? (
              <>
                <section>
                  <h4 className="subheading">Suggested Target</h4>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <Badge variant="outline">Column: {targetDiagnostics.profile?.suggested_target || '-'}</Badge>
                    <Badge variant="outline">Type: {targetDiagnostics.profile?.target_type || '-'}</Badge>
                    <Badge variant="outline">Missing %: {targetDiagnostics.profile?.missing_pct ?? '-'}</Badge>
                    <Badge variant="outline">Unique: {targetDiagnostics.profile?.unique_values ?? '-'}</Badge>
                    <Badge variant="outline">Unique %: {targetDiagnostics.profile?.unique_ratio_pct ?? '-'}</Badge>
                    <Badge variant="outline">Outlier %: {targetDiagnostics.profile?.outlier_pct ?? '-'}</Badge>
                  </div>
                  <p className="help mt-2">{targetDiagnostics.profile?.distribution_note || 'Target diagnostics unavailable.'}</p>
                </section>

                <section>
                  <h4 className="subheading">Target Candidates</h4>
                  <div className="table-wrap">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>Target Candidate</th>
                          <th>Missing %</th>
                          <th>Unique</th>
                          <th>Unique %</th>
                          <th>Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(targetDiagnostics.target_candidates || insights.target_candidates || []).length ? (
                          (targetDiagnostics.target_candidates || insights.target_candidates || []).map((row, idx) => (
                            <tr key={`target-${idx}`}>
                              <td>{row.column}</td>
                              <td>{row.missing_pct}</td>
                              <td>{row.unique_values}</td>
                              <td>{row.unique_ratio_pct}</td>
                              <td>{row.variance}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5}>No target candidates available.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null}

            {activeTab === 'feature_readiness' ? (
              <>
                <section>
                  <h4 className="subheading">Trainability</h4>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <Badge variant="outline">Difficulty: {featureReadiness.trainability?.difficulty || '-'}</Badge>
                    <Badge variant="outline">Signal Strength: {featureReadiness.trainability?.proxy_signal_strength ?? '-'}</Badge>
                    <Badge variant="outline">Rows/Feature: {featureReadiness.trainability?.rows_per_feature ?? '-'}</Badge>
                    <Badge variant="outline">Overfitting Risk: {featureReadiness.trainability?.overfitting_risk || '-'}</Badge>
                  </div>
                  <p className="help mt-2">{featureReadiness.trainability?.baseline_hint || 'No baseline hint available.'}</p>
                </section>

                <section className="insights-table-grid">
                  <div>
                    <h4 className="subheading">Feature-Target Signal</h4>
                    <div className="table-wrap">
                      <table className="preview-table">
                        <thead>
                          <tr>
                            <th>Feature</th>
                            <th>Correlation</th>
                            <th>Abs Corr</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(featureReadiness.feature_target_signal || []).length ? (
                            (featureReadiness.feature_target_signal || []).slice(0, 15).map((row, idx) => (
                              <tr key={`fts-${idx}`}>
                                <td>{row.feature}</td>
                                <td>{row.correlation}</td>
                                <td>{row.abs_correlation}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3}>No feature-target signal computed.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 className="subheading">Top Correlations</h4>
                    <div className="table-wrap">
                      <table className="preview-table">
                        <thead>
                          <tr>
                            <th>Feature A</th>
                            <th>Feature B</th>
                            <th>Correlation</th>
                            <th>Abs Corr</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(featureReadiness.top_correlations || insights.top_correlations || []).length ? (
                            (featureReadiness.top_correlations || insights.top_correlations || []).slice(0, 12).map((row, idx) => (
                              <tr key={`corr-${idx}`}>
                                <td>{row.feature_a}</td>
                                <td>{row.feature_b}</td>
                                <td>{row.correlation}</td>
                                <td>{row.abs_correlation}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4}>Not enough numeric features for correlation analysis.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            {activeTab === 'validation_strategy' ? (
              <section>
                <h4 className="subheading">Validation Plan</h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Badge variant="outline">Method: {validationStrategy.recommended_method || '-'}</Badge>
                  <Badge variant="outline">Folds: {validationStrategy.folds ?? '-'}</Badge>
                  <Badge variant="outline">Test Size %: {validationStrategy.test_size_pct ?? '-'}</Badge>
                </div>
                <h4 className="subheading mt-4">Warnings</h4>
                {(validationStrategy.warnings || []).length ? (
                  <ul className="insight-list">
                    {(validationStrategy.warnings || []).map((item, idx) => (
                      <li key={`vwarn-${idx}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="help">No validation warnings for this dataset.</p>
                )}
              </section>
            ) : null}

            {activeTab === 'preprocessing' ? (
              <>
                <section>
                  <h4 className="subheading">Encoding Plan</h4>
                  <div className="table-wrap">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>Column</th>
                          <th>Strategy</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(preprocessing.encoding_plan || []).length ? (
                          (preprocessing.encoding_plan || []).slice(0, 30).map((row, idx) => (
                            <tr key={`enc-${idx}`}>
                              <td>{row.column}</td>
                              <td>{row.strategy}</td>
                              <td>{row.reason}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3}>No specific encoding plan generated.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h4 className="subheading">Scaling Candidates</h4>
                  {(preprocessing.scaling_candidates || []).length ? (
                    <div className="issue-chips">
                      {(preprocessing.scaling_candidates || []).map((col) => (
                        <span key={`scale-${col}`} className="issue-chip">{col}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="help">No scaling candidates suggested.</p>
                  )}
                </section>

                <section>
                  <h4 className="subheading">Preprocessing Recommendations</h4>
                  {(preprocessing.recommendations || []).length ? (
                    <ul className="insight-list">
                      {(preprocessing.recommendations || []).map((item, idx) => (
                        <li key={`prep-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="help">No preprocessing recommendations generated.</p>
                  )}
                </section>
              </>
            ) : null}

            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default InsightsModal;
