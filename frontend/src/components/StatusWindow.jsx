import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const num = value / (1024 ** exp);
  return `${num.toFixed(num >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
}

function StatusWindow({
  title,
  items = [],
  overallProgress = 0,
  running = false,
  onPause,
  onResume,
  onClearCompleted,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const activeCount = useMemo(
    () => items.filter((item) => ['queued', 'initializing', 'uploading', 'processing'].includes(item.status)).length,
    [items],
  );
  const resumableCount = useMemo(
    () => items.filter((item) => ['failed', 'paused'].includes(item.status)).length,
    [items],
  );

  if (!items.length) return null;

  return (
    <aside className="status-window" aria-live="polite">
      <header className="status-window-header">
        <div>
          <p className="status-window-title">{title}</p>
          <p className="status-window-subtitle">
            {activeCount ? `${activeCount} active` : 'Idle'} {resumableCount ? ` • ${resumableCount} needs attention` : ''}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => setCollapsed((prev) => !prev)} aria-label={collapsed ? 'Expand status window' : 'Collapse status window'}>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </header>

      {!collapsed ? (
        <div className="status-window-body">
          <div className="status-window-overall">
            <div className="status-window-overall-labels">
              <span>Overall</span>
              <span>{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} />
          </div>

          <div className="status-window-list">
            {items.map((item) => (
              <div key={item.localId || item.id} className="status-window-item">
                <div className="status-window-item-top">
                  <p className="status-window-item-title" title={item.filename || item.title}>{item.filename || item.title || 'Task'}</p>
                  <span className="status-window-item-state">{item.status}</span>
                </div>
                <p className="status-window-item-message">
                  {item.message} ({formatBytes(item.uploadedBytes)} / {formatBytes(item.totalBytes)})
                </p>
                <Progress value={Number(item.progress || 0)} />
                {item.error ? <p className="status-window-item-error">{item.error}</p> : null}
              </div>
            ))}
          </div>

          <div className="status-window-actions">
            <Button type="button" size="sm" variant="secondary" onClick={onPause} disabled={!running}>
              Pause
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onResume} disabled={running || !resumableCount}>
              Resume
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClearCompleted} disabled={running}>
              Clear Completed
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export default StatusWindow;
