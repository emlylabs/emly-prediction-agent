import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, MoreHorizontal, Send, Sparkles, UserRound } from 'lucide-react';

const API_BASE = '/emly/api/prediction';

const datasetTokenFromName = (name) => {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const stem = raw.replace(/\.[^.]+$/, '');
  return stem.replace(/\s+/g, '_');
};

const extractMentionContext = (text, caretPos) => {
  const prefix = String(text || '').slice(0, Math.max(0, Number(caretPos || 0)));
  const match = prefix.match(/(^|\s)@([A-Za-z0-9_.-]*)$/);
  if (!match) return null;
  const query = match[2] || '';
  const atIndex = prefix.length - query.length - 1;
  if (atIndex < 0) return null;
  return { query, start: atIndex, end: prefix.length };
};

function PrepareCopilotPanel({ sessionId, datasetId, datasets = [], onAfterFullRun, onAfterDryRun, onClearDryRunPreview }) {
  const [composer, setComposer] = useState('');
  const [plan, setPlan] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sampleRows, setSampleRows] = useState(200);
  const [validationErrors, setValidationErrors] = useState([]);
  const [savedPlan, setSavedPlan] = useState(null);
  const [lastInstruction, setLastInstruction] = useState('');
  const [messages, setMessages] = useState([]);
  const [mentionCtx, setMentionCtx] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [addToPlan, setAddToPlan] = useState(true);
  const endRef = useRef(null);
  const composerRef = useRef(null);
  const panelRef = useRef(null);
  const settingsRef = useRef(null);
  const [panelHeight, setPanelHeight] = useState(null);

  const hasPlan = useMemo(() => Boolean(plan && Array.isArray(plan.steps) && plan.steps.length > 0), [plan]);
  const mentionSuggestions = useMemo(() => {
    if (!mentionCtx) return [];
    const q = String(mentionCtx.query || '').toLowerCase();

    const buildFolderLabel = (dataset) => {
      const rawFolder = String(dataset?.folder || '').trim();
      const explicitPath = [
        dataset?.path,
        dataset?.dataset_path,
        dataset?.file_path,
        dataset?.full_path,
      ]
        .map((value) => String(value || '').trim())
        .find(Boolean);

      const source = rawFolder || explicitPath || '';
      const normalized = source.replace(/\\/g, '/').replace(/\/+$/, '');
      if (!normalized) return 'default';
      const parts = normalized.split('/').filter(Boolean);
      if (!parts.length) return 'default';
      const last = parts[parts.length - 1];
      return last || 'default';
    };

    return (Array.isArray(datasets) ? datasets : [])
      .map((d) => ({
        dataset_id: d?.dataset_id,
        name: String(d?.original_filename || ''),
        token: datasetTokenFromName(d?.original_filename || ''),
        path: buildFolderLabel(d),
      }))
      .filter((d) => d.name && d.token)
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.token.toLowerCase().includes(q) || d.path.toLowerCase().includes(q))
      .slice(0, 8);
  }, [datasets, mentionCtx]);

  const appendMessage = (message) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...message },
    ]);
  };

  const buildInitialMessages = () => [];

  const canonicalStep = (step) => JSON.stringify({
    operation: String(step?.operation || ''),
    params: step?.params && typeof step.params === 'object' ? step.params : {},
  });

  const mergePlans = (existingPlan, generatedPlan) => {
    const prevSteps = Array.isArray(existingPlan?.steps) ? existingPlan.steps : [];
    const nextSteps = Array.isArray(generatedPlan?.steps) ? generatedPlan.steps : [];
    if (!prevSteps.length) return generatedPlan;
    if (!nextSteps.length) return existingPlan;

    const prevCanonical = prevSteps.map(canonicalStep);
    const nextCanonical = nextSteps.map(canonicalStep);
    const startsWithPrev = prevCanonical.every((key, idx) => nextCanonical[idx] === key);
    if (startsWithPrev && nextSteps.length >= prevSteps.length) {
      return generatedPlan;
    }

    const seen = new Set(prevCanonical);
    const appended = nextSteps.filter((step) => {
      const key = canonicalStep(step);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const mergedSteps = [...prevSteps, ...appended].map((step, idx) => ({
      ...step,
      index: idx + 1,
    }));
    return {
      ...(generatedPlan || {}),
      name: generatedPlan?.name || existingPlan?.name || 'Generated Prep Plan',
      steps: mergedSteps,
    };
  };

  const clearConversation = () => {
    setComposer('');
    setPlan(null);
    setRunResult(null);
    setValidationErrors([]);
    setSavedPlan(null);
    setLastInstruction('');
    setMentionCtx(null);
    setMentionIndex(0);
    setMessages(buildInitialMessages(sessionId));
    setAddToPlan(true);
    if (onClearDryRunPreview) onClearDryRunPreview();
  };

  useEffect(() => {
    setComposer('');
    setPlan(null);
    setRunResult(null);
    setValidationErrors([]);
    setSavedPlan(null);
    setLastInstruction('');
    setMentionCtx(null);
    setMentionIndex(0);
    setMessages(buildInitialMessages(sessionId));
    setAddToPlan(true);
  }, [sessionId]);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, busy]);

  useEffect(() => {
    if (!mentionSuggestions.length) {
      setMentionIndex(0);
      return;
    }
    setMentionIndex((prev) => Math.max(0, Math.min(prev, mentionSuggestions.length - 1)));
  }, [mentionSuggestions]);

  useEffect(() => {
    let rafId = 0;
    const recomputePanelHeight = () => {
      if (!panelRef.current || typeof window === 'undefined') return;
      if (window.innerWidth <= 960) {
        setPanelHeight(null);
        return;
      }
      const rect = panelRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 0;
      const bottomGap = 12;
      const minHeight = 320;
      const available = Math.floor(viewportHeight - Math.max(0, rect.top) - bottomGap);
      setPanelHeight(Math.max(minHeight, available));
    };

    const onViewportChange = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(recomputePanelHeight);
    };

    recomputePanelHeight();
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('scroll', onViewportChange, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange);
    };
  }, []);

  useEffect(() => {
    if (!showSettingsMenu) return undefined;

    const onDocumentMouseDown = (event) => {
      if (!(event.target instanceof Element)) {
        setShowSettingsMenu(false);
        return;
      }
      if (!settingsRef.current?.contains(event.target)) {
        setShowSettingsMenu(false);
      }
    };

    const onDocumentKeyDown = (event) => {
      if (event.key === 'Escape') setShowSettingsMenu(false);
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [showSettingsMenu]);

  const submitInstruction = async (text) => {
    const instruction = String(text || '').trim();
    if (!instruction || !sessionId || busy) return;

    appendMessage({ role: 'user', type: 'text', text: instruction });
    setComposer('');
    setMentionCtx(null);
    setBusy(true);
    setSavedPlan(null);
    try {
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/copilot/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          current_plan: addToPlan ? (plan || null) : null,
          execution_error: runResult?.error || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to generate plan');

      const generatedPlan = body.plan || null;
      const effectivePlan = addToPlan ? mergePlans(plan, generatedPlan) : generatedPlan;
      setPlan(effectivePlan || null);
      setRunResult(null);
      setLastInstruction(instruction);
      const issues = Array.isArray(body.validation_errors) ? body.validation_errors : [];
      setValidationErrors(issues);

      appendMessage({
        role: 'assistant',
        type: 'query_echo',
        text: `You asked: "${instruction}"`,
      });

      const stepCount = effectivePlan?.steps?.length || 0;
      if (issues.length) {
        appendMessage({
          role: 'assistant',
          type: 'error_list',
          text: 'I generated a plan but found validation issues. Reply with corrections and I will regenerate.',
          items: issues,
          actions: [{ label: 'Regenerate', action: 'regenerate' }],
        });
      } else {
        appendMessage({
          role: 'assistant',
          type: 'plan_summary',
          text: `${addToPlan ? 'Updated' : 'Plan ready'} with ${stepCount} step(s). Run dry run on ${sampleRows} sampled rows?`,
          plan: effectivePlan,
          actions: [{ label: 'Dry Run', action: 'dry_run' }],
        });
      }
    } catch (err) {
      appendMessage({ role: 'assistant', type: 'error', text: err.message || 'Failed to generate plan' });
    } finally {
      setBusy(false);
    }
  };

  const runPlan = async (dryRun) => {
    if (!sessionId || !hasPlan || busy) return;
    setBusy(true);
    appendMessage({ role: 'assistant', type: 'status', text: dryRun ? 'Running dry run...' : 'Running full approved run...' });
    try {
      const endpoint = dryRun ? 'run-dry' : 'run-full';
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/copilot/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, sample_rows: sampleRows }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to run plan');

      setRunResult(body);
      const issues = Array.isArray(body.validation_errors) ? body.validation_errors : [];
      setValidationErrors(issues);

      if (body.success) {
        appendMessage({
          role: 'assistant',
          type: 'run_result',
          text: `${dryRun ? 'Dry run passed' : 'Full run completed'}: ${body.rows ?? '-'} rows, ${Array.isArray(body.columns) ? body.columns.length : 0} columns.`,
          run: body,
          actions: dryRun
            ? [{ label: 'Approve Full Run', action: 'full_run' }]
            : [{ label: 'Save Plan', action: 'save_plan' }],
        });
        if (!dryRun && onAfterFullRun) await onAfterFullRun();
        if (dryRun && onAfterDryRun) onAfterDryRun(body);
        if (!dryRun && onClearDryRunPreview) onClearDryRunPreview();
      } else {
        appendMessage({
          role: 'assistant',
          type: 'error',
          text: `Run failed at step ${body?.failed_step?.index || '-'} (${body?.failed_step?.operation || 'unknown'}): ${body.error || 'Unknown error'}. Reply with correction and I will regenerate.`,
        });
      }
    } catch (err) {
      appendMessage({ role: 'assistant', type: 'error', text: err.message || 'Failed to run plan' });
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async () => {
    if (!sessionId || !hasPlan || busy || !datasetId) return;
    const defaultName = plan?.name || 'Prep Plan';
    const chosen = window.prompt('Plan name', defaultName);
    if (chosen == null) return;
    const name = String(chosen).trim() || defaultName;

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/copilot/save-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          instruction: lastInstruction || composer || 'copilot_plan',
          plan,
          dry_run_result: runResult || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to save plan');
      setSavedPlan(body);
      appendMessage({
        role: 'assistant',
        type: 'success',
        text: `Plan saved: ${body.plan_id} (v${body.version})`,
        actions: [{ label: 'Dry Run Again', action: 'dry_run' }],
      });
    } catch (err) {
      appendMessage({ role: 'assistant', type: 'error', text: err.message || 'Failed to save plan' });
    } finally {
      setBusy(false);
    }
  };

  const applyMentionSuggestion = (item) => {
    if (!item || !mentionCtx) return;
    const token = `@${item.token}`;
    const before = composer.slice(0, mentionCtx.start);
    const after = composer.slice(mentionCtx.end);
    const next = `${before}${token}${after}`;
    setComposer(next);
    setMentionCtx(null);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      if (!composerRef.current) return;
      const nextPos = before.length + token.length;
      composerRef.current.focus();
      composerRef.current.setSelectionRange(nextPos, nextPos);
    });
  };

  const onMessageAction = async (action) => {
    if (busy) return;
    if (action === 'dry_run') {
      await runPlan(true);
      return;
    }
    if (action === 'full_run') {
      await runPlan(false);
      return;
    }
    if (action === 'save_plan') {
      await savePlan();
      return;
    }
    if (action === 'regenerate') {
      if (lastInstruction) {
        await submitInstruction(lastInstruction);
      }
    }
  };

  return (
    <aside
      ref={panelRef}
      className="prep-copilot-chat"
      aria-label="Preparation copilot chat"
      style={panelHeight ? { height: `${panelHeight}px`, maxHeight: `${panelHeight}px` } : undefined}
    >
      <header className="prep-chat-header">
        <div className="prep-chat-title">
          <Bot size={16} />
          <strong>AI Assist</strong>
        </div>
        <div className="prep-chat-header-actions">
          <button type="button" className="secondary prep-chat-clear-btn" onClick={clearConversation} disabled={busy}>
            Clear
          </button>
          <div className="prep-chat-settings-wrap" ref={settingsRef}>
            <button
              type="button"
              className="prep-chat-settings-trigger"
              aria-label="Copilot settings"
              aria-expanded={showSettingsMenu}
              onClick={() => setShowSettingsMenu((prev) => !prev)}
              disabled={busy}
            >
              <MoreHorizontal size={14} />
            </button>
            {showSettingsMenu ? (
              <div className="prep-chat-settings-menu">
                <label>
                  Sample rows
                  <input
                    type="number"
                    min="20"
                    max="2000"
                    value={sampleRows}
                    onChange={(e) => setSampleRows(Number(e.target.value) || 200)}
                  />
                </label>
                <label className="prep-chat-settings-check">
                  <input
                    type="checkbox"
                    checked={addToPlan}
                    onChange={(e) => setAddToPlan(Boolean(e.target.checked))}
                  />
                  Add to plan
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className={`prep-chat-thread${messages.length ? '' : ' empty'}`}>
        {!messages.length && !busy ? (
          <div className="prep-chat-empty">
            <p>Ask me to prepare data in plain English.</p>
            <span>Use <code>@dataset</code> and <code>#column</code> mentions.</span>
          </div>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className={`prep-chat-row ${message.role === 'user' ? 'user' : 'assistant'}`}>
            <div className="prep-chat-avatar" aria-hidden="true">
              {message.role === 'user' ? <UserRound size={13} /> : <Sparkles size={13} />}
            </div>
            <div className={`prep-chat-bubble ${message.type || 'text'}`}>
              <p>{message.text}</p>

              {message.type === 'error_list' && Array.isArray(message.items) ? (
                <ul className="prep-chat-list">
                  {message.items.map((item, idx) => <li key={`${message.id}-err-${idx}`}>{item}</li>)}
                </ul>
              ) : null}

              {message.type === 'plan_summary' && Array.isArray(message.plan?.steps) ? (
                <details>
                  <summary>Show generated steps</summary>
                  <ol className="prep-chat-list numbered">
                    {message.plan.steps.map((step, idx) => (
                      <li key={`${message.id}-step-${idx}`}>
                        <code>{step.operation}</code>
                        {step.description ? ` - ${step.description}` : ''}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}

              {message.type === 'run_result' && Array.isArray(message.run?.steps) ? (
                <details>
                  <summary>Show execution log</summary>
                  <ol className="prep-chat-list numbered">
                    {message.run.steps.map((step, idx) => (
                      <li key={`${message.id}-run-${idx}`}>
                        <code>{step.operation}</code> - {step.status === 'success' ? 'ok' : step.error || 'failed'}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}

              {Array.isArray(message.actions) && message.actions.length ? (
                <div className="prep-chat-next-actions">
                  {message.actions.map((item, idx) => (
                    <button
                      key={`${message.id}-action-${idx}`}
                      type="button"
                      className="prep-chat-action-btn"
                      onClick={() => onMessageAction(item.action)}
                      disabled={busy}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {busy ? (
          <div className="prep-chat-row assistant">
            <div className="prep-chat-avatar" aria-hidden="true"><Sparkles size={13} /></div>
            <div className="prep-chat-bubble status"><p>Working...</p></div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        className="prep-chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submitInstruction(composer);
        }}
      >
        <div className="prep-chat-composer-input-wrap">
          <textarea
            ref={composerRef}
            rows={2}
            value={composer}
            placeholder="Type your instruction or correction..."
            onChange={(e) => {
              const value = e.target.value;
              setComposer(value);
              setMentionCtx(extractMentionContext(value, e.target.selectionStart));
            }}
            onClick={(e) => {
              setMentionCtx(extractMentionContext(composer, e.currentTarget.selectionStart));
            }}
            onKeyDown={(e) => {
              if (!mentionCtx || !mentionSuggestions.length) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionIndex((prev) => (prev + 1) % mentionSuggestions.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                applyMentionSuggestion(mentionSuggestions[mentionIndex] || mentionSuggestions[0]);
                return;
              }
              if (e.key === 'Escape') {
                setMentionCtx(null);
              }
            }}
            disabled={!sessionId || busy}
          />
          {mentionCtx && mentionSuggestions.length ? (
            <div className="prep-chat-mention-menu" role="listbox" aria-label="Dataset suggestions">
              {mentionSuggestions.map((item, idx) => (
                <button
                  key={`${item.dataset_id || item.token}-${idx}`}
                  type="button"
                  className={`prep-chat-mention-item${idx === mentionIndex ? ' active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyMentionSuggestion(item);
                  }}
                >
                  <span className="prep-chat-mention-name">{item.name}</span>
                  <span className="prep-chat-mention-path">{item.path}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="submit" disabled={!sessionId || busy || !composer.trim()} aria-label="Send message">
          <Send size={14} />
        </button>
      </form>

      {validationErrors.length ? <p className="help">Validation issues: {validationErrors.length}. Reply with correction to regenerate.</p> : null}
      {savedPlan?.success ? <p className="success">Saved {savedPlan.plan_id} v{savedPlan.version}</p> : null}
    </aside>
  );
}

export default PrepareCopilotPanel;
