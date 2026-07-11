import { useEffect, useState } from 'react';
import { BarChart3, Database, LayoutDashboard, Plus, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import DashboardBuilder from './DashboardBuilder';

const API_BASE = '/emly/api/prediction';

export default function DashboardGallery({ datasets = [] }) {
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeDashboardId, setActiveDashboardId] = useState(null);

  const fetchDashboards = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/dashboards`);
      const data = await res.json();
      if (data.success) {
        setDashboards(data.dashboards || []);
        const active = (data.dashboards || []).find((d) => d.is_active);
        if (active && !activeDashboardId) {
          setActiveDashboardId(active.id);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboards();
  }, []);

  if (activeDashboardId) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b">
          <Button variant="ghost" size="sm" onClick={() => setActiveDashboardId(null)}>
            Back to Gallery
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <DashboardBuilder />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboards</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Create and manage your data dashboards
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchDashboards} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors border-dashed"
          onClick={() => setActiveDashboardId('new')}
        >
          <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Plus className="h-10 w-10 mb-2" />
            <span className="text-sm font-medium">New Dashboard</span>
          </CardContent>
        </Card>

        {dashboards.map((d) => (
          <Card
            key={d.id}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setActiveDashboardId(d.id)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  {d.name || 'Dashboard'}
                </CardTitle>
                {d.is_active && <Badge variant="secondary">Active</Badge>}
              </div>
              <CardDescription>
                {d.config?.widgets?.length || 0} widget{(d.config?.widgets?.length || 0) !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  {datasets.length} dataset{datasets.length !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" />
                  Updated {d.updated_on ? new Date(d.updated_on).toLocaleDateString() : '—'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
