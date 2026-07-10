import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, GripVertical, Maximize2, Minimize2, MoreVertical, Plus, Settings2, Trash2, X } from 'lucide-react';
import OilWellsMapCard from './OilWellsMapCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Area,
  AreaChart as RAreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  ComposedChart as RComposedChart,
  Funnel,
  FunnelChart as RFunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart as RLineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Pie,
  PieChart as RPieChart,
  Radar,
  RadarChart as RRadarChart,
  RadialBar,
  RadialBarChart as RRadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart as RScatterChart,
  Treemap as RTreemap,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './DashboardBuilder.css';

const API_BASE = '/emly/api/prediction';
const STORAGE_KEY = 'emly.dashboard.config.v2';
const LEGACY_STORAGE_KEY = 'emly.dashboard.widgets.v1';
const LAST_DATASET_KEY = 'emly.dashboard.last_dataset_id.v1';
const MAX_GRID_COLS = 12;
const MAX_GRID_ROWS = 6;
const GRID_SUBROWS_PER_SECTION = 4;
const PAGE_SIZE = 500;
const MAX_FETCH_ROWS = 2000;

const WIDGET_TYPES = [
  { id: 'pie', label: 'Pie Chart' },
  { id: 'timeline', label: 'Timeline Graph' },
  { id: 'bar', label: 'Bar Graph' },
  { id: 'area', label: 'Area Chart' },
  { id: 'scatter', label: 'Scatter Chart' },
  { id: 'radar', label: 'Radar Chart' },
  { id: 'radialbar', label: 'Radial Bar Chart' },
  { id: 'composed', label: 'Composed Chart' },
  { id: 'treemap', label: 'Treemap Chart' },
  { id: 'funnel', label: 'Funnel Chart' },
  { id: 'kpi', label: 'KPI Card' },
  { id: 'map', label: 'Google Map Card' },
  { id: 'section_header', label: 'Section Header' },
  { id: 'h_spacer', label: 'Horizontal Spacer' },
  { id: 'v_spacer', label: 'Vertical Spacer' },
];

const METRIC_FUNCTIONS = [
  { id: 'sum', label: 'Sum' },
  { id: 'mean', label: 'Mean' },
  { id: 'count', label: 'Count' },
  { id: 'min', label: 'Min' },
  { id: 'max', label: 'Max' },
  { id: 'median', label: 'Median' },
  { id: 'stddev', label: 'Std Dev' },
  { id: 'variance', label: 'Variance' },
  { id: 'distinct_count', label: 'Distinct Count' },
];

const typeLabel = Object.fromEntries(WIDGET_TYPES.map((item) => [item.id, item.label]));
const CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#0ea5e9', '#eab308'];
const DEFAULT_BAR_OPTIONS = {
  layout: 'horizontal',
  show_grid: true,
  grid_horizontal: true,
  grid_vertical: false,
  grid_dash: '3 3',
  show_legend: false,
  show_tooltip: true,
  show_x_axis: true,
  show_y_axis: true,
  x_tick_angle: 0,
  x_tick_font_size: 10,
  y_tick_font_size: 10,
  bar_size: '',
  bar_gap: 4,
  bar_category_gap: 16,
  min_point_size: 0,
  radius: 4,
  fill_color: { mode: 'solid', color: '#2563eb', from: '#2563eb', to: '#60a5fa', angle: 90 },
  use_palette: false,
  show_value_labels: false,
  stack_id: '',
};
const DEFAULT_KPI_OPTIONS = {
  value_color: { mode: 'solid', color: '#0f172a', from: '#0f172a', to: '#334155', angle: 90 },
  subtitle_color: { mode: 'solid', color: '#475569', from: '#475569', to: '#64748b', angle: 90 },
  trend_color: { mode: 'solid', color: '#334155', from: '#334155', to: '#64748b', angle: 90 },
  sparkline_color: { mode: 'solid', color: '#2563eb', from: '#2563eb', to: '#60a5fa', angle: 90 },
  background_fill: { mode: 'gradient', color: '#eff6ff', from: '#eff6ff', to: '#ffffff', angle: 140 },
};
const DEFAULT_PIE_OPTIONS = {
  inner_radius: 34,
  outer_radius: 74,
  cx: '50%',
  cy: '50%',
  start_angle: 90,
  end_angle: -270,
  padding_angle: 0,
  corner_radius: 0,
  min_angle: 0,
  show_tooltip: true,
  show_legend: true,
  show_labels: false,
  show_label_line: false,
  label_mode: 'percent',
  legend_layout: 'horizontal',
  legend_align: 'center',
  legend_vertical_align: 'bottom',
  stroke_color: '#ffffff',
  stroke_width: 1,
  fill_color: { mode: 'solid', color: '#2563eb', from: '#2563eb', to: '#60a5fa', angle: 90 },
  use_palette: true,
};
const DEFAULT_AREA_OPTIONS = {
  show_grid: true,
  show_tooltip: true,
  show_legend: false,
  show_x_axis: true,
  show_y_axis: true,
  curve_type: 'monotone',
  stroke_color: { mode: 'solid', color: '#2563eb', from: '#2563eb', to: '#60a5fa', angle: 90 },
  fill_color: { mode: 'solid', color: '#93c5fd', from: '#93c5fd', to: '#dbeafe', angle: 90 },
  fill_opacity: 0.7,
};
const DEFAULT_SCATTER_OPTIONS = {
  show_grid: true,
  show_tooltip: true,
  show_line: false,
  point_color: { mode: 'solid', color: '#2563eb', from: '#2563eb', to: '#60a5fa', angle: 90 },
  line_color: { mode: 'solid', color: '#1d4ed8', from: '#1d4ed8', to: '#2563eb', angle: 90 },
  point_size: 6,
};
const DEFAULT_RADAR_OPTIONS = {
  show_tooltip: true,
  show_legend: false,
  stroke_color: { mode: 'solid', color: '#2563eb', from: '#2563eb', to: '#60a5fa', angle: 90 },
  fill_color: { mode: 'solid', color: '#60a5fa', from: '#60a5fa', to: '#93c5fd', angle: 90 },
  fill_opacity: 0.6,
};
const DEFAULT_RADIALBAR_OPTIONS = {
  show_tooltip: true,
  show_legend: true,
  start_angle: 180,
  end_angle: 0,
  inner_radius: '20%',
  outer_radius: '90%',
  min_angle: 8,
  use_palette: true,
  fill_color: { mode: 'solid', color: '#2563eb', from: '#2563eb', to: '#60a5fa', angle: 90 },
};
const DEFAULT_COMPOSED_OPTIONS = {
  show_grid: true,
  show_tooltip: true,
  show_legend: true,
  show_bar: true,
  show_line: true,
  show_area: false,
  bar_color: { mode: 'solid', color: '#93c5fd', from: '#93c5fd', to: '#bfdbfe', angle: 90 },
  line_color: { mode: 'solid', color: '#1d4ed8', from: '#1d4ed8', to: '#2563eb', angle: 90 },
  area_color: { mode: 'solid', color: '#60a5fa', from: '#60a5fa', to: '#93c5fd', angle: 90 },
};
const DEFAULT_TREEMAP_OPTIONS = {
  show_tooltip: true,
  use_palette: false,
  aspect_ratio: 1.4,
  is_animation_active: true,
  animation_begin: 0,
  animation_duration: 600,
  animation_easing: 'ease',
  stroke_width: 1,
  fill_color: { mode: 'solid', color: '#60a5fa', from: '#60a5fa', to: '#93c5fd', angle: 90 },
  stroke_color: '#ffffff',
};
const DEFAULT_FUNNEL_OPTIONS = {
  show_tooltip: true,
  show_labels: true,
  use_palette: true,
  fill_color: { mode: 'solid', color: '#2563eb', from: '#2563eb', to: '#60a5fa', angle: 90 },
  stroke_color: '#ffffff',
};
const DEFAULT_MAP_OPTIONS = {
  map_type_id: 'terrain',
  zoom: 5,
  min_zoom: 2,
  max_zoom: 20,
  tilt: 0,
  heading: 0,
  auto_fit_bounds: true,
  center_lat: 31.9686,
  center_lng: -99.9018,
  gesture_handling: 'auto',
  draggable: true,
  scrollwheel: true,
  disable_default_ui: false,
  zoom_control: true,
  map_type_control: true,
  street_view_control: false,
  fullscreen_control: true,
  show_labels: false,
  max_render_points: 1200,
  marker_size: 28,
  marker_shape: 'oil_rig',
  use_advanced_markers: true,
};
const DEFAULT_SECTION_HEADER_OPTIONS = {
  text_color: '#0f172a',
  background_color: '#f8fafc',
  font_size: 24,
  font_weight: 700,
  text_align: 'left',
  padding_x: 12,
  padding_y: 10,
  border_radius: 8,
};
const DEFAULT_HORIZONTAL_SPACER_OPTIONS = {
  color: '#cbd5e1',
  thickness: 2,
  style: 'solid',
  inset: 0,
};
const DEFAULT_VERTICAL_SPACER_OPTIONS = {
  color: '#cbd5e1',
  thickness: 2,
  style: 'solid',
  inset: 8,
};
const EXTENDED_CHART_TYPES = ['area', 'scatter', 'radar', 'radialbar', 'composed', 'treemap', 'funnel'];
const EXTENDED_OPTIONS_KEY_BY_TYPE = {
  area: 'area_options',
  scatter: 'scatter_options',
  radar: 'radar_options',
  radialbar: 'radialbar_options',
  composed: 'composed_options',
  treemap: 'treemap_options',
  funnel: 'funnel_options',
};
const EXTENDED_DEFAULT_OPTIONS_BY_TYPE = {
  area: DEFAULT_AREA_OPTIONS,
  scatter: DEFAULT_SCATTER_OPTIONS,
  radar: DEFAULT_RADAR_OPTIONS,
  radialbar: DEFAULT_RADIALBAR_OPTIONS,
  composed: DEFAULT_COMPOSED_OPTIONS,
  treemap: DEFAULT_TREEMAP_OPTIONS,
  funnel: DEFAULT_FUNNEL_OPTIONS,
};

const defaultConfigByType = {
  pie: {
    dataset_id: '',
    dimensions: [],
    metric: '',
    metric_function: 'sum',
    pie_top_n: 12,
    pie_options: { ...DEFAULT_PIE_OPTIONS },
    labels: 'A,B,C',
    values: '34,42,24',
  },
  timeline: {
    dataset_id: '',
    dimensions: [],
    metric: '',
    metric_function: 'sum',
    granularity: 'none',
    points: 'Jan,10\nFeb,18\nMar,13\nApr,27',
  },
  bar: {
    dataset_id: '',
    dimensions: [],
    metric: '',
    metric_function: 'sum',
    bar_top_n: 12,
    bar_options: { ...DEFAULT_BAR_OPTIONS },
  },
  area: {
    dataset_id: '',
    dimensions: [],
    metric: '',
    metric_function: 'sum',
    chart_top_n: 12,
    area_options: { ...DEFAULT_AREA_OPTIONS },
  },
  scatter: {
    dataset_id: '',
    dimensions: [],
    metric: '',
    metric_function: 'sum',
    chart_top_n: 12,
    scatter_options: { ...DEFAULT_SCATTER_OPTIONS },
  },
  radar: {
    dataset_id: '',
    dimensions: [],
    metric: '',
    metric_function: 'sum',
    chart_top_n: 12,
    radar_options: { ...DEFAULT_RADAR_OPTIONS },
  },
  radialbar: {
    dataset_id: '',
    dimensions: [],
    metric: '',
    metric_function: 'sum',
    chart_top_n: 12,
    radialbar_options: { ...DEFAULT_RADIALBAR_OPTIONS },
  },
  composed: {
    dataset_id: '',
    dimensions: [],
    metric: '',
    metric_function: 'sum',
    chart_top_n: 12,
    composed_options: { ...DEFAULT_COMPOSED_OPTIONS },
  },
  treemap: {
    dataset_id: '',
    dimensions: [],
    treemap_hierarchy_dimensions: [],
    metric: '',
    metric_function: 'sum',
    chart_top_n: 12,
    treemap_options: { ...DEFAULT_TREEMAP_OPTIONS },
  },
  funnel: {
    dataset_id: '',
    dimensions: [],
    metric: '',
    metric_function: 'sum',
    chart_top_n: 12,
    funnel_options: { ...DEFAULT_FUNNEL_OPTIONS },
  },
  kpi: {
    dataset_id: '',
    dimensions: [],
    metric: '',
    metric_function: 'sum',
    value: '12,450',
    subtitle: 'Current Period',
    trend: '+8.2%',
    trend_points: 'Jan,100\nFeb,115\nMar,108\nApr,124',
    kpi_options: { ...DEFAULT_KPI_OPTIONS },
  },
  map: {
    dataset_id: '',
    latitude_column: '',
    longitude_column: '',
    map_options: { ...DEFAULT_MAP_OPTIONS },
  },
  section_header: {
    header_text: 'Section Title',
    section_header_options: { ...DEFAULT_SECTION_HEADER_OPTIONS },
  },
  h_spacer: {
    horizontal_spacer_options: { ...DEFAULT_HORIZONTAL_SPACER_OPTIONS },
  },
  v_spacer: {
    vertical_spacer_options: { ...DEFAULT_VERTICAL_SPACER_OPTIONS },
  },
};

function clamp(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsvList(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumericCsv(raw) {
  return parseCsvList(raw)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function parseTimelinePoints(raw) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, value] = line.split(',').map((item) => item.trim());
      return {
        label: label || '',
        value: Number(value),
      };
    })
    .filter((point) => point.label && Number.isFinite(point.value));
}

function normalizeColorSetting(raw, fallback = '#2563eb') {
  if (raw && typeof raw === 'object') {
    const mode = raw.mode === 'gradient' ? 'gradient' : 'solid';
    const base = String(raw.color || fallback);
    return {
      mode,
      color: base,
      from: String(raw.from || base || fallback),
      to: String(raw.to || fallback),
      angle: Number.isFinite(Number(raw.angle)) ? Number(raw.angle) : 90,
    };
  }
  const base = String(raw || fallback);
  return {
    mode: 'solid',
    color: base,
    from: base,
    to: fallback,
    angle: 90,
  };
}

function colorSettingToColor(raw, fallback = '#2563eb') {
  const setting = normalizeColorSetting(raw, fallback);
  return setting.mode === 'gradient' ? setting.from : setting.color;
}

function colorSettingToBackground(raw, fallback = '#ffffff') {
  const setting = normalizeColorSetting(raw, fallback);
  if (setting.mode === 'gradient') {
    return `linear-gradient(${setting.angle}deg, ${setting.from} 0%, ${setting.to} 100%)`;
  }
  return setting.color;
}

function getAutoLatColumn(columns) {
  const ranked = (columns || []).map((name) => ({
    name,
    low: String(name || '').trim().toLowerCase(),
  }));

  const exact = ranked.find((c) => c.low === 'latitude' || c.low === 'lat');
  if (exact) return exact.name;

  const contains = ranked.find((c) => c.low.includes('latitude') || c.low.includes('lat'));
  return contains?.name || '';
}

function getAutoLonColumn(columns) {
  const ranked = (columns || []).map((name) => ({
    name,
    low: String(name || '').trim().toLowerCase(),
  }));

  const exact = ranked.find((c) => c.low === 'longitude' || c.low === 'lon' || c.low === 'lng' || c.low === 'long');
  if (exact) return exact.name;

  const contains = ranked.find((c) => (
    c.low.includes('longitude') || c.low.includes('lon') || c.low.includes('lng') || c.low.includes('long')
  ));
  return contains?.name || '';
}

function toTimelineBucket(raw, granularity) {
  const text = String(raw ?? '').trim();
  if (!text) return 'Unknown';
  if (granularity === 'none') return text;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  if (granularity === 'day') {
    return date.toISOString().slice(0, 10);
  }
  if (granularity === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'year') {
    return `${date.getFullYear()}`;
  }

  return text;
}

function reduceBucket(items, metricFunction) {
  if (!items.length) return 0;
  const numericValues = items.map((item) => item.numeric).filter((value) => value != null);
  if (metricFunction === 'count') return items.length;
  if (metricFunction === 'distinct_count') {
    return new Set(items.map((item) => String(item.raw ?? '').trim()).filter(Boolean)).size;
  }
  if (!numericValues.length) return 0;
  if (metricFunction === 'sum') return numericValues.reduce((sum, value) => sum + value, 0);
  if (metricFunction === 'mean') return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  if (metricFunction === 'min') return Math.min(...numericValues);
  if (metricFunction === 'max') return Math.max(...numericValues);
  if (metricFunction === 'median') {
    const sorted = [...numericValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  if (metricFunction === 'variance' || metricFunction === 'stddev') {
    const mean = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    const variance = numericValues.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / numericValues.length;
    return metricFunction === 'variance' ? variance : Math.sqrt(variance);
  }
  return numericValues.reduce((sum, value) => sum + value, 0);
}

function aggregateByDimension(rows, { dimensions, metric, metricFunction, granularity = 'none' }) {
  const usableDimensions = Array.isArray(dimensions) ? dimensions.filter(Boolean) : [];
  if (!usableDimensions.length) return [];

  const buckets = new Map();
  rows.forEach((row) => {
    const label = usableDimensions.map((dimension, idx) => {
      const raw = row?.[dimension];
      if (idx === 0 && granularity !== 'none') return toTimelineBucket(raw, granularity);
      return String(raw ?? 'Unknown').trim() || 'Unknown';
    }).join(' | ');

    const rawMetric = metric ? row?.[metric] : 1;
    const numeric = metric ? toNumber(rawMetric) : 1;
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push({ numeric, raw: rawMetric });
  });

  return Array.from(buckets.entries()).map(([label, items]) => ({
    label,
    value: reduceBucket(items, metricFunction),
  }));
}

function buildTreemapHierarchy(rows, { hierarchyDimensions, metric, metricFunction, topN = 12 }) {
  const dims = Array.isArray(hierarchyDimensions) ? hierarchyDimensions.filter(Boolean) : [];
  if (!dims.length) return [];

  const groupRows = (items, level, parentPath = []) => {
    const dim = dims[level];
    const groups = new Map();
    items.forEach((row) => {
      const key = String(row?.[dim] ?? 'Unknown').trim() || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    const nodes = Array.from(groups.entries()).map(([name, groupedRows]) => {
      const currentPath = [...parentPath, name];
      if (level === dims.length - 1) {
        const metricItems = groupedRows.map((row) => {
          const rawMetric = metric ? row?.[metric] : 1;
          const numeric = metric ? toNumber(rawMetric) : 1;
          return { numeric, raw: rawMetric };
        });
        const size = reduceBucket(metricItems, metricFunction || 'sum');
        return {
          name,
          size: Number(size) || 0,
          path: currentPath,
          level: level + 1,
        };
      }

      const children = groupRows(groupedRows, level + 1, currentPath);
      const size = children.reduce((sum, child) => sum + (Number(child.size) || 0), 0);
      return {
        name,
        children,
        size,
        path: currentPath,
        level: level + 1,
      };
    });

    return nodes.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
  };

  return groupRows(rows, 0, []).slice(0, Math.max(1, Number(topN) || 12));
}

function serializeWidget(widget) {
  const normalizedType = WIDGET_TYPES.some((item) => item.id === widget?.type) ? widget.type : 'kpi';
  const incomingConfig = typeof widget?.config === 'object' && widget?.config ? widget.config : {};
  const normalizedDimensions = Array.isArray(incomingConfig.dimensions)
    ? incomingConfig.dimensions.filter(Boolean)
    : incomingConfig.dimension
      ? [String(incomingConfig.dimension)]
      : [];
  const normalizedTreemapHierarchy = Array.isArray(incomingConfig.treemap_hierarchy_dimensions)
    ? incomingConfig.treemap_hierarchy_dimensions.filter(Boolean)
    : (normalizedType === 'treemap' ? normalizedDimensions : []);
  const normalizedMetricFunction = incomingConfig.metric_function || incomingConfig.aggregation || 'sum';
  const normalizedBarOptions = {
    ...DEFAULT_BAR_OPTIONS,
    ...(incomingConfig.bar_options || {}),
  };
  const normalizedPieOptions = {
    ...DEFAULT_PIE_OPTIONS,
    ...(incomingConfig.pie_options || {}),
  };
  const normalizedAreaOptions = { ...DEFAULT_AREA_OPTIONS, ...(incomingConfig.area_options || {}) };
  const normalizedScatterOptions = { ...DEFAULT_SCATTER_OPTIONS, ...(incomingConfig.scatter_options || {}) };
  const normalizedRadarOptions = { ...DEFAULT_RADAR_OPTIONS, ...(incomingConfig.radar_options || {}) };
  const normalizedRadialBarOptions = { ...DEFAULT_RADIALBAR_OPTIONS, ...(incomingConfig.radialbar_options || {}) };
  const normalizedComposedOptions = { ...DEFAULT_COMPOSED_OPTIONS, ...(incomingConfig.composed_options || {}) };
  const normalizedTreemapOptions = { ...DEFAULT_TREEMAP_OPTIONS, ...(incomingConfig.treemap_options || {}) };
  const normalizedFunnelOptions = { ...DEFAULT_FUNNEL_OPTIONS, ...(incomingConfig.funnel_options || {}) };
  const normalizedMapOptions = { ...DEFAULT_MAP_OPTIONS, ...(incomingConfig.map_options || {}) };
  const normalizedSectionHeaderOptions = { ...DEFAULT_SECTION_HEADER_OPTIONS, ...(incomingConfig.section_header_options || {}) };
  const normalizedHorizontalSpacerOptions = { ...DEFAULT_HORIZONTAL_SPACER_OPTIONS, ...(incomingConfig.horizontal_spacer_options || {}) };
  const normalizedVerticalSpacerOptions = { ...DEFAULT_VERTICAL_SPACER_OPTIONS, ...(incomingConfig.vertical_spacer_options || {}) };

  return {
    id: String(widget?.id || ''),
    type: normalizedType,
    title: normalizedType === 'section_header' ? '' : String(widget?.title || 'Untitled Widget'),
    w: normalizedType === 'section_header' ? MAX_GRID_COLS : clamp(widget?.w, 1, MAX_GRID_COLS),
    h: normalizedType === 'section_header' ? 1 : clamp(widget?.h, 1, MAX_GRID_ROWS),
    config: {
      ...defaultConfigByType[normalizedType],
      ...incomingConfig,
      dimensions: normalizedDimensions,
      treemap_hierarchy_dimensions: normalizedTreemapHierarchy,
      metric_function: normalizedMetricFunction,
      bar_options: normalizedType === 'bar' ? normalizedBarOptions : incomingConfig.bar_options,
      pie_options: normalizedType === 'pie' ? normalizedPieOptions : incomingConfig.pie_options,
      area_options: normalizedType === 'area' ? normalizedAreaOptions : incomingConfig.area_options,
      scatter_options: normalizedType === 'scatter' ? normalizedScatterOptions : incomingConfig.scatter_options,
      radar_options: normalizedType === 'radar' ? normalizedRadarOptions : incomingConfig.radar_options,
      radialbar_options: normalizedType === 'radialbar' ? normalizedRadialBarOptions : incomingConfig.radialbar_options,
      composed_options: normalizedType === 'composed' ? normalizedComposedOptions : incomingConfig.composed_options,
      treemap_options: normalizedType === 'treemap' ? normalizedTreemapOptions : incomingConfig.treemap_options,
      funnel_options: normalizedType === 'funnel' ? normalizedFunnelOptions : incomingConfig.funnel_options,
      section_header_options: normalizedType === 'section_header' ? normalizedSectionHeaderOptions : incomingConfig.section_header_options,
      horizontal_spacer_options: normalizedType === 'h_spacer' ? normalizedHorizontalSpacerOptions : incomingConfig.horizontal_spacer_options,
      vertical_spacer_options: normalizedType === 'v_spacer' ? normalizedVerticalSpacerOptions : incomingConfig.vertical_spacer_options,
      map_options: normalizedType === 'map' ? normalizedMapOptions : incomingConfig.map_options,
    },
  };
}

function DonutChart({ labels, values, options = DEFAULT_PIE_OPTIONS }) {
  const chartData = labels.map((label, idx) => ({
    name: label,
    value: Number(values[idx] || 0),
  }));
  const finalOptions = { ...DEFAULT_PIE_OPTIONS, ...(options || {}) };
  const fillSetting = normalizeColorSetting(finalOptions.fill_color, '#2563eb');
  const usePalette = Boolean(finalOptions.use_palette);
  const useGradient = fillSetting.mode === 'gradient' && !usePalette;
  const gradientId = `db-pie-fill-gradient-${String(fillSetting.from + fillSetting.to).replace(/[^a-zA-Z0-9]/g, '')}`;
  const pieFill = useGradient ? `url(#${gradientId})` : colorSettingToColor(fillSetting, '#2563eb');
  const legendFallbackColor = colorSettingToColor(fillSetting, '#2563eb');
  const numericInner = Number(finalOptions.inner_radius);
  const numericOuter = Number(finalOptions.outer_radius);
  const numericStrokeWidth = Number(finalOptions.stroke_width);
  const numericPadding = Number(finalOptions.padding_angle);
  const numericCorner = Number(finalOptions.corner_radius);
  const numericMinAngle = Number(finalOptions.min_angle);
  const labelMode = finalOptions.label_mode || 'percent';
  const legendLayout = finalOptions.legend_layout || 'horizontal';
  const legendAlign = finalOptions.legend_align || 'center';
  const legendStyle = {
    justifyContent: legendLayout === 'horizontal'
      ? (legendAlign === 'left' ? 'flex-start' : legendAlign === 'right' ? 'flex-end' : 'center')
      : 'flex-start',
    textAlign: legendAlign === 'left' ? 'left' : legendAlign === 'right' ? 'right' : 'center',
    alignItems: legendLayout === 'horizontal'
      ? 'center'
      : (legendAlign === 'left' ? 'flex-start' : legendAlign === 'right' ? 'flex-end' : 'center'),
  };

  const labelFormatter = (payload) => {
    if (labelMode === 'name') return payload?.name || '';
    if (labelMode === 'value') return Number(payload?.value || 0).toFixed(2);
    if (labelMode === 'name_value') return `${payload?.name || ''}: ${Number(payload?.value || 0).toFixed(2)}`;
    const pct = Number(payload?.percent || 0) * 100;
    return `${pct.toFixed(1)}%`;
  };

  return (
    <div className="db-chart-frame db-pie-frame" aria-label="Pie chart">
      <div className="db-pie-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <RPieChart>
            {useGradient ? (
              <defs>
                <linearGradient id={gradientId} gradientTransform={`rotate(${fillSetting.angle})`}>
                  <stop offset="0%" stopColor={fillSetting.from} />
                  <stop offset="100%" stopColor={fillSetting.to} />
                </linearGradient>
              </defs>
            ) : null}
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx={finalOptions.cx || '50%'}
              cy={finalOptions.cy || '50%'}
              outerRadius={Number.isFinite(numericOuter) ? numericOuter : 74}
              innerRadius={Number.isFinite(numericInner) ? numericInner : 34}
              startAngle={Number(finalOptions.start_angle)}
              endAngle={Number(finalOptions.end_angle)}
              paddingAngle={Number.isFinite(numericPadding) ? numericPadding : 0}
              cornerRadius={Number.isFinite(numericCorner) ? numericCorner : 0}
              minAngle={Number.isFinite(numericMinAngle) ? numericMinAngle : 0}
              stroke={finalOptions.stroke_color || '#ffffff'}
              strokeWidth={Number.isFinite(numericStrokeWidth) ? numericStrokeWidth : 1}
              label={Boolean(finalOptions.show_labels) ? labelFormatter : false}
              labelLine={Boolean(finalOptions.show_label_line)}
            >
              {chartData.map((entry, idx) => (
                <Cell
                  key={`cell-${entry.name}-${idx}`}
                  fill={usePalette ? CHART_COLORS[idx % CHART_COLORS.length] : pieFill}
                />
              ))}
            </Pie>
            {finalOptions.show_tooltip ? (
              <Tooltip formatter={(value) => Number(value).toFixed(2)} />
            ) : null}
          </RPieChart>
        </ResponsiveContainer>
      </div>
      {finalOptions.show_legend ? (
        <div className="db-pie-legend" style={legendStyle}>
          <div className={legendLayout === 'vertical' ? 'db-legend db-legend--vertical' : 'db-legend db-legend--horizontal'}>
            {chartData.map((entry, idx) => (
              <div key={`legend-${entry.name}-${idx}`} className="db-legend-row">
                <span
                  className="db-legend-color"
                  style={{ backgroundColor: usePalette ? CHART_COLORS[idx % CHART_COLORS.length] : legendFallbackColor }}
                />
                <span className="db-legend-label" title={entry.name}>{entry.name}</span>
                <span className="db-legend-value">{Number(entry.value || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LineChart({ points }) {
  const chartData = points.map((item) => ({
    label: item.label,
    value: Number(item.value || 0),
  }));
  return (
    <div className="db-chart-frame" aria-label="Timeline graph">
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value) => Number(value).toFixed(2)} />
          <Line type="monotone" dataKey="value" stroke="#2563eb" dot={false} strokeWidth={2} />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarChart({ data, options = DEFAULT_BAR_OPTIONS }) {
  const chartData = (data || []).map((row) => ({
    label: row.label,
    value: Number(row.value || 0),
  }));
  const finalOptions = { ...DEFAULT_BAR_OPTIONS, ...(options || {}) };
  const isVerticalLayout = finalOptions.layout === 'vertical';
  const numericBarSize = Number(finalOptions.bar_size);
  const numericBarGap = Number(finalOptions.bar_gap);
  const numericCategoryGap = Number(finalOptions.bar_category_gap);
  const numericMinPoint = Number(finalOptions.min_point_size);
  const numericRadius = Number(finalOptions.radius);
  const fillSetting = normalizeColorSetting(finalOptions.fill_color, '#2563eb');
  const isGradientFill = fillSetting.mode === 'gradient' && !finalOptions.use_palette;
  const fillColor = isGradientFill ? `url(#db-bar-fill-gradient-${String(fillSetting.from + fillSetting.to).replace(/[^a-zA-Z0-9]/g, '')})` : colorSettingToColor(fillSetting, '#2563eb');
  const gradientId = `db-bar-fill-gradient-${String(fillSetting.from + fillSetting.to).replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div className="db-chart-frame" aria-label="Bar graph">
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart
          data={chartData}
          layout={finalOptions.layout}
          margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
          barGap={Number.isFinite(numericBarGap) ? numericBarGap : 4}
          barCategoryGap={Number.isFinite(numericCategoryGap) ? numericCategoryGap : 16}
        >
          {isGradientFill ? (
            <defs>
              <linearGradient id={gradientId} gradientTransform={`rotate(${fillSetting.angle})`}>
                <stop offset="0%" stopColor={fillSetting.from} />
                <stop offset="100%" stopColor={fillSetting.to} />
              </linearGradient>
            </defs>
          ) : null}
          {finalOptions.show_grid ? (
            <CartesianGrid
              strokeDasharray={finalOptions.grid_dash || '3 3'}
              horizontal={Boolean(finalOptions.grid_horizontal)}
              vertical={Boolean(finalOptions.grid_vertical)}
            />
          ) : null}

          {finalOptions.show_x_axis ? (
            <XAxis
              type={isVerticalLayout ? 'number' : 'category'}
              dataKey={isVerticalLayout ? undefined : 'label'}
              tick={{ fontSize: Number(finalOptions.x_tick_font_size) || 10 }}
              angle={Number(finalOptions.x_tick_angle) || 0}
            />
          ) : null}

          {finalOptions.show_y_axis ? (
            <YAxis
              type={isVerticalLayout ? 'category' : 'number'}
              dataKey={isVerticalLayout ? 'label' : undefined}
              tick={{ fontSize: Number(finalOptions.y_tick_font_size) || 10 }}
            />
          ) : null}

          {finalOptions.show_tooltip ? (
            <Tooltip formatter={(value) => Number(value).toFixed(2)} />
          ) : null}

          {finalOptions.show_legend ? <Legend /> : null}

          <Bar
            dataKey="value"
            fill={fillColor}
            radius={isVerticalLayout ? [0, numericRadius || 4, numericRadius || 4, 0] : [numericRadius || 4, numericRadius || 4, 0, 0]}
            barSize={Number.isFinite(numericBarSize) && numericBarSize > 0 ? numericBarSize : undefined}
            minPointSize={Number.isFinite(numericMinPoint) ? Math.max(0, numericMinPoint) : 0}
            stackId={finalOptions.stack_id ? String(finalOptions.stack_id) : undefined}
          >
            {finalOptions.use_palette ? chartData.map((entry, idx) => (
              <Cell key={`bar-cell-${entry.label}-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
            )) : null}
            {finalOptions.show_value_labels ? (
              <LabelList
                dataKey="value"
                position={isVerticalLayout ? 'right' : 'top'}
                formatter={(value) => Number(value).toFixed(2)}
              />
            ) : null}
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({ value, subtitle, trend, options = DEFAULT_KPI_OPTIONS }) {
  const points = Array.isArray(trend?.points) ? trend.points.filter((p) => Number.isFinite(Number(p?.value))) : [];
  const chartData = points.map((point) => ({ label: point.label, value: Number(point.value || 0) }));
  const finalOptions = { ...DEFAULT_KPI_OPTIONS, ...(options || {}) };
  const legacyBackground = finalOptions.background_start || finalOptions.background_end
    ? `linear-gradient(140deg, ${finalOptions.background_start || '#eff6ff'} 0%, ${finalOptions.background_end || '#ffffff'} 70%)`
    : null;
  const backgroundCss = legacyBackground || colorSettingToBackground(finalOptions.background_fill, '#eff6ff');
  const valueColor = colorSettingToColor(finalOptions.value_color, '#0f172a');
  const subtitleColor = colorSettingToColor(finalOptions.subtitle_color, '#475569');
  const trendColor = colorSettingToColor(finalOptions.trend_color, '#334155');
  const sparklineColor = colorSettingToColor(finalOptions.sparkline_color, '#2563eb');

  return (
    <div
      className="db-kpi-box"
      style={{
        background: backgroundCss,
      }}
    >
      <p className="db-kpi-value" style={{ color: valueColor }}>{value || '-'}</p>
      <p className="db-kpi-subtitle" style={{ color: subtitleColor }}>{subtitle || 'Metric'}</p>
      {points.length > 1 ? (
        <div className="db-kpi-sparkline" aria-label="KPI trend">
          <ResponsiveContainer width="100%" height={64}>
            <RLineChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 8 }}>
              <Tooltip formatter={(val) => Number(val).toFixed(2)} />
              <Line type="monotone" dataKey="value" stroke={sparklineColor} strokeWidth={2.2} dot={false} />
            </RLineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="db-viz-empty">No trend series configured.</p>
      )}
      <Badge variant="outline" className="db-kpi-badge" style={{ color: trendColor }}>{trend?.label || 'n/a'}</Badge>
    </div>
  );
}

function AreaGraph({ data, options = DEFAULT_AREA_OPTIONS }) {
  const chartData = (data || []).map((row) => ({ label: row.label, value: Number(row.value || 0) }));
  const finalOptions = { ...DEFAULT_AREA_OPTIONS, ...(options || {}) };
  const strokeColor = colorSettingToColor(finalOptions.stroke_color, '#2563eb');
  const fillColor = colorSettingToColor(finalOptions.fill_color, '#93c5fd');
  return (
    <div className="db-chart-frame" aria-label="Area chart">
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          {finalOptions.show_grid ? <CartesianGrid strokeDasharray="3 3" /> : null}
          {finalOptions.show_x_axis ? <XAxis dataKey="label" tick={{ fontSize: 10 }} /> : null}
          {finalOptions.show_y_axis ? <YAxis tick={{ fontSize: 10 }} /> : null}
          {finalOptions.show_tooltip ? <Tooltip formatter={(value) => Number(value).toFixed(2)} /> : null}
          {finalOptions.show_legend ? <Legend /> : null}
          <Area
            type={finalOptions.curve_type || 'monotone'}
            dataKey="value"
            stroke={strokeColor}
            fill={fillColor}
            fillOpacity={Number(finalOptions.fill_opacity) || 0.7}
          />
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScatterGraph({ data, options = DEFAULT_SCATTER_OPTIONS }) {
  const chartData = (data || []).map((row, idx) => ({ x: idx + 1, y: Number(row.value || 0), label: row.label }));
  const finalOptions = { ...DEFAULT_SCATTER_OPTIONS, ...(options || {}) };
  const pointColor = colorSettingToColor(finalOptions.point_color, '#2563eb');
  const lineColor = colorSettingToColor(finalOptions.line_color, '#1d4ed8');
  return (
    <div className="db-chart-frame" aria-label="Scatter chart">
      <ResponsiveContainer width="100%" height="100%">
        <RScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          {finalOptions.show_grid ? <CartesianGrid strokeDasharray="3 3" /> : null}
          <XAxis dataKey="x" type="number" tick={{ fontSize: 10 }} name="Index" />
          <YAxis dataKey="y" type="number" tick={{ fontSize: 10 }} name="Value" />
          {finalOptions.show_tooltip ? (
            <Tooltip formatter={(value) => Number(value).toFixed(2)} labelFormatter={(label) => `Point ${label}`} />
          ) : null}
          <Scatter
            data={chartData}
            fill={pointColor}
            line={Boolean(finalOptions.show_line)}
            lineType="joint"
            lineJointType="monotoneX"
            stroke={lineColor}
            shape="circle"
          />
        </RScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function RadarGraph({ data, options = DEFAULT_RADAR_OPTIONS }) {
  const chartData = (data || []).map((row) => ({ subject: row.label, value: Number(row.value || 0) }));
  const finalOptions = { ...DEFAULT_RADAR_OPTIONS, ...(options || {}) };
  const strokeColor = colorSettingToColor(finalOptions.stroke_color, '#2563eb');
  const fillColor = colorSettingToColor(finalOptions.fill_color, '#60a5fa');
  return (
    <div className="db-chart-frame" aria-label="Radar chart">
      <ResponsiveContainer width="100%" height="100%">
        <RRadarChart data={chartData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
          <PolarRadiusAxis tick={{ fontSize: 10 }} />
          <Radar dataKey="value" stroke={strokeColor} fill={fillColor} fillOpacity={Number(finalOptions.fill_opacity) || 0.6} />
          {finalOptions.show_tooltip ? <Tooltip formatter={(value) => Number(value).toFixed(2)} /> : null}
          {finalOptions.show_legend ? <Legend /> : null}
        </RRadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RadialBarGraph({ data, options = DEFAULT_RADIALBAR_OPTIONS }) {
  const finalOptions = { ...DEFAULT_RADIALBAR_OPTIONS, ...(options || {}) };
  const fallbackFill = colorSettingToColor(finalOptions.fill_color, '#2563eb');
  const chartData = (data || []).map((row, idx) => ({
    name: row.label,
    value: Number(row.value || 0),
    fill: finalOptions.use_palette ? CHART_COLORS[idx % CHART_COLORS.length] : fallbackFill,
  }));
  return (
    <div className="db-chart-frame" aria-label="Radial bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <RRadialBarChart
          innerRadius={finalOptions.inner_radius || '20%'}
          outerRadius={finalOptions.outer_radius || '90%'}
          data={chartData}
          startAngle={Number(finalOptions.start_angle)}
          endAngle={Number(finalOptions.end_angle)}
        >
          <RadialBar minAngle={Number(finalOptions.min_angle) || 0} dataKey="value" background />
          {finalOptions.show_legend ? <Legend iconSize={8} layout="vertical" verticalAlign="middle" align="right" /> : null}
          {finalOptions.show_tooltip ? <Tooltip formatter={(value) => Number(value).toFixed(2)} /> : null}
        </RRadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComposedGraph({ data, options = DEFAULT_COMPOSED_OPTIONS }) {
  const chartData = (data || []).map((row) => ({ label: row.label, value: Number(row.value || 0) }));
  const finalOptions = { ...DEFAULT_COMPOSED_OPTIONS, ...(options || {}) };
  const barColor = colorSettingToColor(finalOptions.bar_color, '#93c5fd');
  const lineColor = colorSettingToColor(finalOptions.line_color, '#1d4ed8');
  const areaColor = colorSettingToColor(finalOptions.area_color, '#60a5fa');
  return (
    <div className="db-chart-frame" aria-label="Composed chart">
      <ResponsiveContainer width="100%" height="100%">
        <RComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          {finalOptions.show_grid ? <CartesianGrid strokeDasharray="3 3" /> : null}
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          {finalOptions.show_tooltip ? <Tooltip formatter={(value) => Number(value).toFixed(2)} /> : null}
          {finalOptions.show_legend ? <Legend /> : null}
          {finalOptions.show_bar ? <Bar dataKey="value" barSize={16} fill={barColor} /> : null}
          {finalOptions.show_line ? <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2} dot={false} /> : null}
          {finalOptions.show_area ? <Area type="monotone" dataKey="value" fill={areaColor} stroke={areaColor} fillOpacity={0.3} /> : null}
        </RComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function TreemapNodeContent({
  depth,
  x,
  y,
  width,
  height,
  index,
  name,
  value,
  payload,
  colors,
  baseFill,
  strokeColor,
  strokeWidth,
}) {
  if (width <= 1 || height <= 1) return null;

  const paletteColor = colors[index % colors.length] || baseFill;
  const hasChildren = Array.isArray(payload?.children) && payload.children.length > 0;
  const isTopLevel = depth === 1;
  const isLeaf = !hasChildren;
  const fill = paletteColor;
  const opacity = isTopLevel ? 0.34 : isLeaf ? 0.9 : 0.62;
  const canShowLeafLabel = isLeaf && width > 96 && height > 40;
  const safeName = String(name || 'Unknown');
  const maxChars = Math.max(6, Math.floor((width - 10) / 6.4));
  const clippedName = safeName.length > maxChars ? `${safeName.slice(0, maxChars - 1)}…` : safeName;
  const clipId = `tree-clip-${depth}-${index}-${Math.round(x)}-${Math.round(y)}-${Math.round(width)}-${Math.round(height)}`;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={y} width={width} height={height} />
        </clipPath>
      </defs>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill,
          fillOpacity: opacity,
          stroke: strokeColor,
          strokeWidth,
        }}
      />
      {canShowLeafLabel && isLeaf ? (
        <text
          x={x + 6}
          y={y + 14}
          fill="#0f172a"
          stroke="none"
          paintOrder="fill"
          fontSize={10}
          fontWeight={650}
          clipPath={`url(#${clipId})`}
        >
          {clippedName}
        </text>
      ) : null}
    </g>
  );
}

function TreemapTooltip({ active, payload, metricLabel }) {
  if (!active || !payload?.length) return null;
  const node = payload?.[0]?.payload || {};
  const path = Array.isArray(node.path) ? node.path : [String(node.name || 'Unknown')];
  const value = Number(node.size || 0);
  return (
    <div className="db-tree-tooltip">
      <p className="db-tree-tooltip-title">{node.name || 'Node'}</p>
      {path.map((segment, idx) => (
        <p key={`tree-tip-level-${idx}`} className="db-tree-tooltip-row">
          {`Level ${idx + 1}: ${segment}`}
        </p>
      ))}
      <p className="db-tree-tooltip-metric">{`${metricLabel}: ${Number.isFinite(value) ? value.toFixed(2) : '-'}`}</p>
    </div>
  );
}

function TreemapGraph({ data, options = DEFAULT_TREEMAP_OPTIONS, metricLabel = 'Metric' }) {
  const finalOptions = { ...DEFAULT_TREEMAP_OPTIONS, ...(options || {}) };
  const fillColor = colorSettingToColor(finalOptions.fill_color, '#60a5fa');
  const strokeColor = finalOptions.stroke_color || '#ffffff';
  const strokeWidth = Math.max(0, Number(finalOptions.stroke_width) || 1);
  const chartData = (data || []).map((row) => {
    if (row && typeof row === 'object' && 'name' in row) return row;
    return { name: row.label, size: Number(row.value || 0) };
  });
  return (
    <div className="db-chart-frame" aria-label="Treemap chart">
      <ResponsiveContainer width="100%" height="100%">
        <RTreemap
          data={chartData}
          dataKey="size"
          aspectRatio={Number(finalOptions.aspect_ratio) || 1.4}
          isAnimationActive={Boolean(finalOptions.is_animation_active)}
          animationBegin={Number(finalOptions.animation_begin) || 0}
          animationDuration={Number(finalOptions.animation_duration) || 600}
          animationEasing={finalOptions.animation_easing || 'ease'}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill={fillColor}
          content={(nodeProps) => (
            <TreemapNodeContent
              {...nodeProps}
              colors={finalOptions.use_palette ? CHART_COLORS : [fillColor]}
              baseFill={fillColor}
              strokeColor={strokeColor}
              strokeWidth={strokeWidth}
            />
          )}
        >
          {finalOptions.show_tooltip ? <Tooltip content={<TreemapTooltip metricLabel={metricLabel} />} /> : null}
          {finalOptions.use_palette ? chartData.map((entry, idx) => (
            <Cell
              key={`treemap-cell-${entry.name}-${idx}`}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          )) : null}
        </RTreemap>
      </ResponsiveContainer>
    </div>
  );
}

function FunnelGraph({ data, options = DEFAULT_FUNNEL_OPTIONS }) {
  const finalOptions = { ...DEFAULT_FUNNEL_OPTIONS, ...(options || {}) };
  const fillColor = colorSettingToColor(finalOptions.fill_color, '#2563eb');
  const chartData = (data || []).map((row) => ({ name: row.label, value: Number(row.value || 0) }));
  return (
    <div className="db-chart-frame" aria-label="Funnel chart">
      <ResponsiveContainer width="100%" height="100%">
        <RFunnelChart>
          {finalOptions.show_tooltip ? <Tooltip formatter={(value) => Number(value).toFixed(2)} /> : null}
          <Funnel dataKey="value" data={chartData} isAnimationActive fill={fillColor} stroke={finalOptions.stroke_color || '#ffffff'}>
            {finalOptions.use_palette ? chartData.map((entry, idx) => (
              <Cell key={`funnel-cell-${entry.name}-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
            )) : null}
            {finalOptions.show_labels ? <LabelList position="right" fill="#334155" stroke="none" dataKey="name" /> : null}
          </Funnel>
        </RFunnelChart>
      </ResponsiveContainer>
    </div>
  );
}

function SectionHeaderWidget({ text, options = DEFAULT_SECTION_HEADER_OPTIONS }) {
  const finalOptions = { ...DEFAULT_SECTION_HEADER_OPTIONS, ...(options || {}) };
  return (
    <div
      className="db-section-header-widget"
      style={{
        color: finalOptions.text_color || '#0f172a',
        background: finalOptions.background_color || '#f8fafc',
        fontSize: `${Math.max(12, Number(finalOptions.font_size) || 24)}px`,
        fontWeight: Math.max(400, Number(finalOptions.font_weight) || 700),
        textAlign: finalOptions.text_align || 'left',
        padding: `${Math.max(0, Number(finalOptions.padding_y) || 10)}px ${Math.max(0, Number(finalOptions.padding_x) || 12)}px`,
        borderRadius: `${Math.max(0, Number(finalOptions.border_radius) || 8)}px`,
      }}
    >
      {text || 'Section Title'}
    </div>
  );
}

function HorizontalSpacerWidget({ options = DEFAULT_HORIZONTAL_SPACER_OPTIONS }) {
  const finalOptions = { ...DEFAULT_HORIZONTAL_SPACER_OPTIONS, ...(options || {}) };
  return (
    <div className="db-spacer-wrap db-spacer-wrap-horizontal">
      <div
        className="db-spacer-line db-spacer-line-horizontal"
        style={{
          borderTopColor: finalOptions.color || '#cbd5e1',
          borderTopStyle: finalOptions.style || 'solid',
          borderTopWidth: `${Math.max(1, Number(finalOptions.thickness) || 2)}px`,
          marginLeft: `${Math.max(0, Number(finalOptions.inset) || 0)}px`,
          marginRight: `${Math.max(0, Number(finalOptions.inset) || 0)}px`,
        }}
      />
    </div>
  );
}

function VerticalSpacerWidget({ options = DEFAULT_VERTICAL_SPACER_OPTIONS }) {
  const finalOptions = { ...DEFAULT_VERTICAL_SPACER_OPTIONS, ...(options || {}) };
  return (
    <div className="db-spacer-wrap db-spacer-wrap-vertical">
      <div
        className="db-spacer-line db-spacer-line-vertical"
        style={{
          borderLeftColor: finalOptions.color || '#cbd5e1',
          borderLeftStyle: finalOptions.style || 'solid',
          borderLeftWidth: `${Math.max(1, Number(finalOptions.thickness) || 2)}px`,
          marginTop: `${Math.max(0, Number(finalOptions.inset) || 8)}px`,
          marginBottom: `${Math.max(0, Number(finalOptions.inset) || 8)}px`,
        }}
      />
    </div>
  );
}

function WidgetBody({ widget, datasets, rowsByDataset, loadByDataset }) {
  const config = widget.config || {};
  const datasetId = config.dataset_id || '';
  const rows = rowsByDataset[datasetId] || [];
  const loadState = loadByDataset[datasetId] || { loading: false, error: '' };
  const useDatasetMode = datasetId && (
    widget.type === 'kpi'
    || widget.type === 'map'
    || (config.dimensions || []).length
    || (widget.type === 'treemap' && (config.treemap_hierarchy_dimensions || []).length)
  );

  if (widget.type === 'map') {
    const filteredDatasets = datasetId ? (datasets || []).filter((d) => String(d.dataset_id) === String(datasetId)) : datasets;
    return (
      <OilWellsMapCard
        datasets={filteredDatasets}
        selectedDatasetId={datasetId}
        latitudeColumn={config.latitude_column || ''}
        longitudeColumn={config.longitude_column || ''}
        mapOptions={config.map_options || DEFAULT_MAP_OPTIONS}
      />
    );
  }

  if (useDatasetMode) {
    if (loadState.loading) return <p className="db-viz-empty">Loading dataset rows...</p>;
    if (loadState.error) return <p className="db-viz-empty">{loadState.error}</p>;

    if (widget.type === 'kpi') {
      const metricValues = rows
        .map((row) => toNumber(row?.[config.metric]))
        .filter((value) => value != null);

      const value = config.metric_function === 'count'
        ? rows.length
        : reduceBucket(metricValues.map((v) => ({ numeric: v, raw: v })), config.metric_function || 'sum');

      const trendSeries = (config.dimensions || []).length
        ? aggregateByDimension(rows, {
          dimensions: [config.dimensions[0]],
          metric: config.metric,
          metricFunction: config.metric_function || 'sum',
          granularity: 'none',
        }).sort((a, b) => String(a.label).localeCompare(String(b.label))).slice(0, 24)
        : [];

      return (
        <KpiCard
          value={Number.isFinite(value) ? Number(value).toFixed(2) : '-'}
          subtitle={config.subtitle || `${config.metric_function || 'sum'} of ${config.metric || 'rows'}`}
          trend={{
            label: config.trend || 'dataset metric',
            points: trendSeries,
          }}
          options={config.kpi_options || DEFAULT_KPI_OPTIONS}
        />
      );
    }

    if (widget.type === 'treemap') {
      const hierarchyData = buildTreemapHierarchy(rows, {
        hierarchyDimensions: config.treemap_hierarchy_dimensions || config.dimensions || [],
        metric: config.metric,
        metricFunction: config.metric_function || 'sum',
        topN: Number(config.chart_top_n) || 12,
      });
      if (!hierarchyData.length) {
        return <p className="db-viz-empty">Treemap needs hierarchy dimensions and metric.</p>;
      }
      const metricLabel = `${config.metric_function || 'sum'} of ${config.metric || 'value'}`;
      return <TreemapGraph data={hierarchyData} options={config.treemap_options || DEFAULT_TREEMAP_OPTIONS} metricLabel={metricLabel} />;
    }

    const aggregated = aggregateByDimension(rows, {
      dimensions: config.dimensions,
      metric: config.metric,
      metricFunction: config.metric_function || 'sum',
      granularity: widget.type === 'timeline' ? (config.granularity || 'none') : 'none',
    });

    if (!aggregated.length) {
      return <p className="db-viz-empty">No chart data for selected dataset/dimension/metric settings.</p>;
    }

    if (widget.type === 'timeline') {
      const timelinePoints = [...aggregated]
        .sort((a, b) => String(a.label).localeCompare(String(b.label)))
        .slice(0, 24);
      return <LineChart points={timelinePoints} />;
    }

    const chartRows = [...aggregated]
      .sort((a, b) => b.value - a.value)
      .slice(0, widget.type === 'bar'
        ? Math.max(1, Number(config.bar_top_n) || 12)
        : widget.type === 'pie'
          ? Math.max(1, Number(config.pie_top_n) || 12)
          : ['area', 'scatter', 'radar', 'radialbar', 'composed', 'treemap', 'funnel'].includes(widget.type)
            ? Math.max(1, Number(config.chart_top_n) || 12)
          : 12);

    if (widget.type === 'pie') {
      return <DonutChart labels={chartRows.map((r) => r.label)} values={chartRows.map((r) => r.value)} options={config.pie_options || DEFAULT_PIE_OPTIONS} />;
    }

    if (widget.type === 'bar') {
      return <BarChart data={chartRows} options={config.bar_options || DEFAULT_BAR_OPTIONS} />;
    }
    if (widget.type === 'area') {
      return <AreaGraph data={chartRows} options={config.area_options || DEFAULT_AREA_OPTIONS} />;
    }
    if (widget.type === 'scatter') {
      return <ScatterGraph data={chartRows} options={config.scatter_options || DEFAULT_SCATTER_OPTIONS} />;
    }
    if (widget.type === 'radar') {
      return <RadarGraph data={chartRows} options={config.radar_options || DEFAULT_RADAR_OPTIONS} />;
    }
    if (widget.type === 'radialbar') {
      return <RadialBarGraph data={chartRows} options={config.radialbar_options || DEFAULT_RADIALBAR_OPTIONS} />;
    }
    if (widget.type === 'composed') {
      return <ComposedGraph data={chartRows} options={config.composed_options || DEFAULT_COMPOSED_OPTIONS} />;
    }
    if (widget.type === 'funnel') {
      return <FunnelGraph data={chartRows} options={config.funnel_options || DEFAULT_FUNNEL_OPTIONS} />;
    }
  }

  if (widget.type === 'pie') {
    const labels = parseCsvList(config.labels);
    const values = parseNumericCsv(config.values);
    if (!labels.length || !values.length) return <p className="db-viz-empty">Set dataset settings for pie chart.</p>;
    const minLength = Math.min(labels.length, values.length);
    return <DonutChart labels={labels.slice(0, minLength)} values={values.slice(0, minLength)} options={config.pie_options || DEFAULT_PIE_OPTIONS} />;
  }

  if (widget.type === 'timeline') {
    const points = parseTimelinePoints(config.points);
    if (!points.length) return <p className="db-viz-empty">Set dataset settings or manual timeline points in widget settings.</p>;
    return <LineChart points={points} />;
  }

  if (widget.type === 'bar') {
    return <p className="db-viz-empty">Bar graph requires dataset, dimensions, and metric settings.</p>;
  }
  if (['area', 'scatter', 'radar', 'radialbar', 'composed', 'treemap', 'funnel'].includes(widget.type)) {
    return <p className="db-viz-empty">This chart requires dataset, dimensions, and metric settings.</p>;
  }

  if (widget.type === 'kpi') {
    return (
      <KpiCard
        value={config.value}
        subtitle={config.subtitle}
        trend={{
          label: config.trend,
          points: parseTimelinePoints(config.trend_points || ''),
        }}
        options={config.kpi_options || DEFAULT_KPI_OPTIONS}
      />
    );
  }

  if (widget.type === 'section_header') {
    return (
      <SectionHeaderWidget
        text={config.header_text || ''}
        options={config.section_header_options || DEFAULT_SECTION_HEADER_OPTIONS}
      />
    );
  }

  if (widget.type === 'h_spacer') {
    return <HorizontalSpacerWidget options={config.horizontal_spacer_options || DEFAULT_HORIZONTAL_SPACER_OPTIONS} />;
  }

  if (widget.type === 'v_spacer') {
    return <VerticalSpacerWidget options={config.vertical_spacer_options || DEFAULT_VERTICAL_SPACER_OPTIONS} />;
  }

  return <p className="db-viz-empty">Unknown widget type.</p>;
}

function InlineDatasetMenu({ datasets, onPick }) {
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const menuRef = useRef(null);

  const folderStats = useMemo(() => {
    const counts = new Map();
    (datasets || []).forEach((dataset) => {
      const folderName = dataset.folder || 'default';
      counts.set(folderName, (counts.get(folderName) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [datasets]);

  const filteredDatasets = useMemo(() => {
    const byFolder = selectedFolder === 'all'
      ? (datasets || [])
      : (datasets || []).filter((dataset) => (dataset.folder || 'default') === selectedFolder);
    const query = searchTerm.trim().toLowerCase();
    if (!query) return byFolder;
    return byFolder.filter((dataset) => {
      const filename = String(dataset.original_filename || '').toLowerCase();
      const folderName = String(dataset.folder || 'default').toLowerCase();
      return filename.includes(query) || folderName.includes(query);
    });
  }, [datasets, selectedFolder, searchTerm]);

  return (
    <div className="db-dataset-menu-wrap">
      <details ref={menuRef} className="db-dataset-menu">
        <summary className="db-dataset-menu-trigger">Choose From Data Explorer</summary>
        <div className="db-dataset-menu-panel">
          <div className="db-dataset-menu-controls">
            <select
              className="db-input"
              value={selectedFolder}
              onChange={(event) => setSelectedFolder(event.target.value)}
            >
              <option value="all">All folders</option>
              {folderStats.map((folder) => (
                <option key={`dataset-folder-${folder.name}`} value={folder.name}>
                  {folder.name} ({folder.count})
                </option>
              ))}
            </select>
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search dataset"
            />
          </div>
          <div className="db-dataset-menu-list">
            {filteredDatasets.length ? filteredDatasets.map((dataset) => (
              <button
                key={`dataset-pick-${dataset.dataset_id}`}
                type="button"
                className="db-dataset-menu-item"
                onClick={() => {
                  onPick(dataset);
                  if (menuRef.current) menuRef.current.open = false;
                }}
                title={dataset.original_filename}
              >
                <span className="db-dataset-menu-name">{dataset.original_filename}</span>
                <span className="db-dataset-menu-folder">{dataset.folder || 'default'}</span>
              </button>
            )) : (
              <p className="db-viz-empty">No datasets found.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

function ColorGradientInput({ idBase, label, value, onChange }) {
  const setting = normalizeColorSetting(value, '#2563eb');
  return (
    <div className="space-y-2">
      <Label htmlFor={`${idBase}-mode`}>{label}</Label>
      <div className="db-color-field">
        <select
          id={`${idBase}-mode`}
          className="db-input"
          value={setting.mode}
          onChange={(e) => onChange({ ...setting, mode: e.target.value === 'gradient' ? 'gradient' : 'solid' })}
        >
          <option value="solid">Solid</option>
          <option value="gradient">Gradient</option>
        </select>
        {setting.mode === 'solid' ? (
          <div className="db-color-row">
            <Input
              id={`${idBase}-solid`}
              type="color"
              value={setting.color}
              onChange={(e) => onChange({ ...setting, color: e.target.value, from: e.target.value })}
            />
            <Input
              value={setting.color}
              onChange={(e) => onChange({ ...setting, color: e.target.value, from: e.target.value })}
              placeholder="#2563eb"
            />
          </div>
        ) : (
          <div className="db-gradient-grid">
            <div className="db-color-row">
              <Input
                id={`${idBase}-from`}
                type="color"
                value={setting.from}
                onChange={(e) => onChange({ ...setting, from: e.target.value })}
              />
              <Input
                value={setting.from}
                onChange={(e) => onChange({ ...setting, from: e.target.value })}
                placeholder="#2563eb"
              />
            </div>
            <div className="db-color-row">
              <Input
                id={`${idBase}-to`}
                type="color"
                value={setting.to}
                onChange={(e) => onChange({ ...setting, to: e.target.value })}
              />
              <Input
                value={setting.to}
                onChange={(e) => onChange({ ...setting, to: e.target.value })}
                placeholder="#60a5fa"
              />
            </div>
            <Input
              id={`${idBase}-angle`}
              type="number"
              value={setting.angle}
              onChange={(e) => onChange({ ...setting, angle: Number(e.target.value) || 90 })}
              placeholder="Angle"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function extractDataConfig(type, config) {
  const current = config || {};
  const base = { dataset_id: current.dataset_id || '' };
  if (type === 'map') {
    return {
      ...base,
      latitude_column: current.latitude_column || '',
      longitude_column: current.longitude_column || '',
    };
  }
  return {
    ...base,
    dimensions: Array.isArray(current.dimensions) ? current.dimensions : [],
    ...(type === 'treemap'
      ? { treemap_hierarchy_dimensions: Array.isArray(current.treemap_hierarchy_dimensions) ? current.treemap_hierarchy_dimensions : [] }
      : {}),
    metric: current.metric || '',
    metric_function: current.metric_function || 'sum',
    ...(type === 'bar' ? { bar_top_n: Number(current.bar_top_n) || defaultConfigByType.bar.bar_top_n } : {}),
    ...(type === 'pie' ? { pie_top_n: Number(current.pie_top_n) || defaultConfigByType.pie.pie_top_n } : {}),
    ...(['area', 'scatter', 'radar', 'radialbar', 'composed', 'treemap', 'funnel'].includes(type)
      ? { chart_top_n: Number(current.chart_top_n) || 12 }
      : {}),
    ...(type === 'timeline' ? { granularity: current.granularity || 'none' } : {}),
  };
}

function DashboardWidgetModal({ open, onOpenChange, mode, draft, setDraft, onSubmit, datasets, onRememberDataset }) {
  const [barSettingsTab, setBarSettingsTab] = useState('basic');
  const [kpiSettingsTab, setKpiSettingsTab] = useState('basic');
  const [pieSettingsTab, setPieSettingsTab] = useState('basic');
  const [timelineSettingsTab, setTimelineSettingsTab] = useState('basic');
  const [mapSettingsTab, setMapSettingsTab] = useState('basic');
  const [extendedSettingsTab, setExtendedSettingsTab] = useState('basic');
  const [hierarchyCandidate, setHierarchyCandidate] = useState('');
  useEffect(() => {
    if (draft?.type !== 'bar') setBarSettingsTab('basic');
    if (draft?.type !== 'kpi') setKpiSettingsTab('basic');
    if (draft?.type !== 'pie') setPieSettingsTab('basic');
    if (draft?.type !== 'timeline') setTimelineSettingsTab('basic');
    if (draft?.type !== 'map') setMapSettingsTab('basic');
    if (!EXTENDED_CHART_TYPES.includes(draft?.type)) setExtendedSettingsTab('basic');
    if (draft?.type !== 'treemap') setHierarchyCandidate('');
  }, [draft?.type]);
  if (!draft) return null;

  const selectedDataset = (datasets || []).find((dataset) => String(dataset.dataset_id) === String(draft.config?.dataset_id || '')) || null;
  const columns = selectedDataset?.columns || [];

  const onTypeChange = (value) => {
    setDraft((prev) => ({
      ...prev,
      type: value,
      title: value === 'section_header' ? '' : prev?.title,
      w: value === 'section_header' ? MAX_GRID_COLS : prev?.w,
      h: value === 'section_header' ? 1 : prev?.h,
      config: {
        ...defaultConfigByType[value],
        dataset_id: prev?.config?.dataset_id || '',
      },
    }));
  };

  const onConfigChange = (key, value) => {
    setDraft((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }));
  };
  const onBarOptionChange = (key, value) => {
    setDraft((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        bar_options: {
          ...DEFAULT_BAR_OPTIONS,
          ...(prev.config?.bar_options || {}),
          [key]: value,
        },
      },
    }));
  };
  const onKpiOptionChange = (key, value) => {
    setDraft((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        kpi_options: {
          ...DEFAULT_KPI_OPTIONS,
          ...(prev.config?.kpi_options || {}),
          [key]: value,
        },
      },
    }));
  };
  const onExtendedOptionChange = (key, value) => {
    const optionKey = EXTENDED_OPTIONS_KEY_BY_TYPE[draft.type];
    const defaults = EXTENDED_DEFAULT_OPTIONS_BY_TYPE[draft.type];
    if (!optionKey || !defaults) return;
    setDraft((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        [optionKey]: {
          ...defaults,
          ...(prev.config?.[optionKey] || {}),
          [key]: value,
        },
      },
    }));
  };
  const onPieOptionChange = (key, value) => {
    setDraft((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        pie_options: {
          ...DEFAULT_PIE_OPTIONS,
          ...(prev.config?.pie_options || {}),
          [key]: value,
        },
      },
    }));
  };
  const onSectionHeaderOptionChange = (key, value) => {
    setDraft((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        section_header_options: {
          ...DEFAULT_SECTION_HEADER_OPTIONS,
          ...(prev.config?.section_header_options || {}),
          [key]: value,
        },
      },
    }));
  };
  const onHorizontalSpacerOptionChange = (key, value) => {
    setDraft((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        horizontal_spacer_options: {
          ...DEFAULT_HORIZONTAL_SPACER_OPTIONS,
          ...(prev.config?.horizontal_spacer_options || {}),
          [key]: value,
        },
      },
    }));
  };
  const onVerticalSpacerOptionChange = (key, value) => {
    setDraft((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        vertical_spacer_options: {
          ...DEFAULT_VERTICAL_SPACER_OPTIONS,
          ...(prev.config?.vertical_spacer_options || {}),
          [key]: value,
        },
      },
    }));
  };
  const onMapOptionChange = (key, value) => {
    setDraft((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        map_options: {
          ...DEFAULT_MAP_OPTIONS,
          ...(prev.config?.map_options || {}),
          [key]: value,
        },
      },
    }));
  };
  const switchBarTab = (tab) => {
    setBarSettingsTab(tab);
    if (draft.type === 'bar' && tab === 'basic') {
      onConfigChange('bar_options', { ...DEFAULT_BAR_OPTIONS });
    }
  };

  const onToggleDimension = (column) => {
    const current = Array.isArray(draft.config?.dimensions) ? draft.config.dimensions : [];
    const next = current.includes(column)
      ? current.filter((item) => item !== column)
      : [...current, column];
    onConfigChange('dimensions', next);
  };
  const onToggleTreemapHierarchyDimension = (column) => {
    const current = Array.isArray(draft.config?.treemap_hierarchy_dimensions) ? draft.config.treemap_hierarchy_dimensions : [];
    const next = current.includes(column)
      ? current.filter((item) => item !== column)
      : [...current, column];
    onConfigChange('treemap_hierarchy_dimensions', next);
    onConfigChange('dimensions', next);
  };
  const onAddTreemapHierarchyDimension = (column) => {
    if (!column) return;
    const current = Array.isArray(draft.config?.treemap_hierarchy_dimensions) ? draft.config.treemap_hierarchy_dimensions : [];
    if (current.includes(column)) return;
    const next = [...current, column];
    onConfigChange('treemap_hierarchy_dimensions', next);
    onConfigChange('dimensions', next);
    setHierarchyCandidate('');
  };
  const onMoveTreemapHierarchyDimension = (index, direction) => {
    const current = Array.isArray(draft.config?.treemap_hierarchy_dimensions) ? [...draft.config.treemap_hierarchy_dimensions] : [];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) return;
    const temp = current[index];
    current[index] = current[nextIndex];
    current[nextIndex] = temp;
    onConfigChange('treemap_hierarchy_dimensions', current);
    onConfigChange('dimensions', current);
  };
  const onRemoveTreemapHierarchyDimension = (column) => {
    const current = Array.isArray(draft.config?.treemap_hierarchy_dimensions) ? draft.config.treemap_hierarchy_dimensions : [];
    const next = current.filter((item) => item !== column);
    onConfigChange('treemap_hierarchy_dimensions', next);
    onConfigChange('dimensions', next);
  };

  const applySelectedDataset = (dataset) => {
    const columnsFromDataset = dataset?.columns || [];
    onConfigChange('dataset_id', String(dataset.dataset_id));
    if (draft.type === 'map') {
      onConfigChange('latitude_column', getAutoLatColumn(columnsFromDataset));
      onConfigChange('longitude_column', getAutoLonColumn(columnsFromDataset));
    } else if (draft.type === 'treemap') {
      const hierarchyDefaults = columnsFromDataset.length ? [columnsFromDataset[0]] : [];
      onConfigChange('treemap_hierarchy_dimensions', hierarchyDefaults);
      onConfigChange('dimensions', hierarchyDefaults);
      onConfigChange('metric', columnsFromDataset[1] || columnsFromDataset[0] || '');
    } else {
      onConfigChange('dimensions', columnsFromDataset.length ? [columnsFromDataset[0]] : []);
      onConfigChange('metric', columnsFromDataset[1] || columnsFromDataset[0] || '');
    }
    if (typeof onRememberDataset === 'function') {
      onRememberDataset(String(dataset.dataset_id));
    }
  };

  const onResetNonDataConfig = () => {
    setDraft((prev) => {
      const preserved = extractDataConfig(prev.type, prev.config);
      return {
        ...prev,
        w: 2,
        h: 1,
        config: {
          ...defaultConfigByType[prev.type],
          ...preserved,
        },
      };
    });
  };

  const barOptions = { ...DEFAULT_BAR_OPTIONS, ...(draft.config?.bar_options || {}) };
  const kpiOptions = { ...DEFAULT_KPI_OPTIONS, ...(draft.config?.kpi_options || {}) };
  const pieOptions = { ...DEFAULT_PIE_OPTIONS, ...(draft.config?.pie_options || {}) };
  const sectionHeaderOptions = { ...DEFAULT_SECTION_HEADER_OPTIONS, ...(draft.config?.section_header_options || {}) };
  const horizontalSpacerOptions = { ...DEFAULT_HORIZONTAL_SPACER_OPTIONS, ...(draft.config?.horizontal_spacer_options || {}) };
  const verticalSpacerOptions = { ...DEFAULT_VERTICAL_SPACER_OPTIONS, ...(draft.config?.vertical_spacer_options || {}) };
  const mapOptions = { ...DEFAULT_MAP_OPTIONS, ...(draft.config?.map_options || {}) };
  const isSimpleWidgetType = ['section_header', 'h_spacer', 'v_spacer'].includes(draft.type);
  const extendedOptionKey = EXTENDED_OPTIONS_KEY_BY_TYPE[draft.type];
  const extendedOptions = extendedOptionKey
    ? {
      ...(EXTENDED_DEFAULT_OPTIONS_BY_TYPE[draft.type] || {}),
      ...(draft.config?.[extendedOptionKey] || {}),
    }
    : {};
  const treemapHierarchy = Array.isArray(draft.config?.treemap_hierarchy_dimensions) ? draft.config.treemap_hierarchy_dimensions : [];
  const availableHierarchyColumns = columns.filter((col) => !treemapHierarchy.includes(col));

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="db-card-settings-modal">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit Widget' : 'Add Widget'}</DialogTitle>
          <DialogDescription>
            Configure dataset, dimensions, metrics, and graph parameters before adding to dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="db-settings-actions">
          <Button type="button" variant="outline" onClick={onResetNonDataConfig}>
            Reset to Default
          </Button>
        </div>

        {draft.type === 'bar' || draft.type === 'kpi' || draft.type === 'pie' || draft.type === 'timeline' || draft.type === 'map' || EXTENDED_CHART_TYPES.includes(draft.type) ? (
          <div className="db-tabs-row">
            <button
              type="button"
              className={`db-tab-btn ${
                draft.type === 'bar'
                  ? (barSettingsTab === 'basic' ? 'active' : '')
                  : draft.type === 'kpi'
                    ? (kpiSettingsTab === 'basic' ? 'active' : '')
                    : draft.type === 'pie'
                      ? (pieSettingsTab === 'basic' ? 'active' : '')
                    : draft.type === 'timeline'
                        ? (timelineSettingsTab === 'basic' ? 'active' : '')
                        : EXTENDED_CHART_TYPES.includes(draft.type)
                          ? (extendedSettingsTab === 'basic' ? 'active' : '')
                        : (mapSettingsTab === 'basic' ? 'active' : '')
              }`}
              onClick={() => {
                if (draft.type === 'bar') {
                  switchBarTab('basic');
                } else if (draft.type === 'kpi') {
                  setKpiSettingsTab('basic');
                } else if (draft.type === 'pie') {
                  setPieSettingsTab('basic');
                } else if (draft.type === 'timeline') {
                  setTimelineSettingsTab('basic');
                } else if (EXTENDED_CHART_TYPES.includes(draft.type)) {
                  setExtendedSettingsTab('basic');
                } else {
                  setMapSettingsTab('basic');
                }
              }}
            >
              Basic
            </button>
            <button
              type="button"
              className={`db-tab-btn ${
                draft.type === 'bar'
                  ? (barSettingsTab === 'advanced' ? 'active' : '')
                  : draft.type === 'kpi'
                    ? (kpiSettingsTab === 'advanced' ? 'active' : '')
                    : draft.type === 'pie'
                      ? (pieSettingsTab === 'advanced' ? 'active' : '')
                    : draft.type === 'timeline'
                        ? (timelineSettingsTab === 'advanced' ? 'active' : '')
                        : EXTENDED_CHART_TYPES.includes(draft.type)
                          ? (extendedSettingsTab === 'advanced' ? 'active' : '')
                        : (mapSettingsTab === 'advanced' ? 'active' : '')
              }`}
              onClick={() => {
                if (draft.type === 'bar') {
                  setBarSettingsTab('advanced');
                } else if (draft.type === 'kpi') {
                  setKpiSettingsTab('advanced');
                } else if (draft.type === 'pie') {
                  setPieSettingsTab('advanced');
                } else if (draft.type === 'timeline') {
                  setTimelineSettingsTab('advanced');
                } else if (EXTENDED_CHART_TYPES.includes(draft.type)) {
                  setExtendedSettingsTab('advanced');
                } else {
                  setMapSettingsTab('advanced');
                }
              }}
            >
              Advanced
            </button>
          </div>
        ) : null}

        <div className="db-modal-scroll">
        {(
          (draft.type === 'bar' && barSettingsTab === 'basic')
          || (draft.type === 'kpi' && kpiSettingsTab === 'basic')
          || (draft.type === 'pie' && pieSettingsTab === 'basic')
          || (draft.type === 'timeline' && timelineSettingsTab === 'basic')
          || (draft.type === 'map' && mapSettingsTab === 'basic')
          || (EXTENDED_CHART_TYPES.includes(draft.type) && extendedSettingsTab === 'basic')
          || (draft.type !== 'bar' && draft.type !== 'kpi' && draft.type !== 'pie' && draft.type !== 'timeline' && draft.type !== 'map' && !EXTENDED_CHART_TYPES.includes(draft.type))
        ) ? (
        <div className="db-modal-grid">
          <div className="space-y-2">
            <Label htmlFor="widget-type">Widget Type</Label>
            <select
              id="widget-type"
              className="db-input"
              value={draft.type}
              onChange={(e) => onTypeChange(e.target.value)}
            >
              {WIDGET_TYPES.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </div>

          {draft.type === 'section_header' ? null : (
            <div className="space-y-2">
              <Label htmlFor="widget-title">Title</Label>
              <Input
                id="widget-title"
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Widget title"
              />
            </div>
          )}

          {draft.type !== 'bar' && draft.type !== 'kpi' && draft.type !== 'pie' && draft.type !== 'timeline' && draft.type !== 'map' && !EXTENDED_CHART_TYPES.includes(draft.type) ? (
            <>
              {draft.type === 'section_header' ? null : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="widget-w">Width (sections)</Label>
                    <Input
                      id="widget-w"
                      type="number"
                      min="1"
                      max={String(MAX_GRID_COLS)}
                      value={draft.w}
                      onChange={(e) => setDraft((prev) => ({ ...prev, w: clamp(e.target.value, 1, MAX_GRID_COLS) }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="widget-h">Height (sections)</Label>
                    <Input
                      id="widget-h"
                      type="number"
                      min="1"
                      max={String(MAX_GRID_ROWS)}
                      value={draft.h}
                      onChange={(e) => setDraft((prev) => ({ ...prev, h: clamp(e.target.value, 1, MAX_GRID_ROWS) }))}
                    />
                  </div>
                </>
              )}

              {isSimpleWidgetType ? null : (
                <div className="space-y-2">
                  <Label>Dataset</Label>
                  <div className="db-dataset-picker">
                    <InlineDatasetMenu datasets={datasets} onPick={applySelectedDataset} />
                    <div className="db-dataset-pill">
                      {selectedDataset ? selectedDataset.original_filename : 'None (manual mode)'}
                    </div>
                    {selectedDataset ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          onConfigChange('dataset_id', '');
                          onConfigChange('dimensions', []);
                          onConfigChange('metric', '');
                          onConfigChange('latitude_column', '');
                          onConfigChange('longitude_column', '');
                        }}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}

              {draft.type === 'section_header' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="section-header-text">Section Title</Label>
                    <Input
                      id="section-header-text"
                      value={draft.config?.header_text || ''}
                      onChange={(e) => onConfigChange('header_text', e.target.value)}
                      placeholder="Section Title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="section-header-align">Text Align</Label>
                    <select
                      id="section-header-align"
                      className="db-input"
                      value={sectionHeaderOptions.text_align || 'left'}
                      onChange={(e) => onSectionHeaderOptionChange('text_align', e.target.value)}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="section-header-font-size">Font Size</Label>
                    <Input
                      id="section-header-font-size"
                      type="number"
                      min="12"
                      value={sectionHeaderOptions.font_size}
                      onChange={(e) => onSectionHeaderOptionChange('font_size', Math.max(12, Number(e.target.value) || 24))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="section-header-font-weight">Font Weight</Label>
                    <Input
                      id="section-header-font-weight"
                      type="number"
                      min="400"
                      max="900"
                      step="100"
                      value={sectionHeaderOptions.font_weight}
                      onChange={(e) => onSectionHeaderOptionChange('font_weight', Math.max(400, Math.min(900, Number(e.target.value) || 700)))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="section-header-text-color">Text Color</Label>
                    <Input
                      id="section-header-text-color"
                      type="color"
                      value={sectionHeaderOptions.text_color || '#0f172a'}
                      onChange={(e) => onSectionHeaderOptionChange('text_color', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="section-header-bg-color">Background Color</Label>
                    <Input
                      id="section-header-bg-color"
                      type="color"
                      value={sectionHeaderOptions.background_color || '#f8fafc'}
                      onChange={(e) => onSectionHeaderOptionChange('background_color', e.target.value)}
                    />
                  </div>
                </>
              ) : null}

              {draft.type === 'h_spacer' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="h-spacer-color">Color</Label>
                    <Input
                      id="h-spacer-color"
                      type="color"
                      value={horizontalSpacerOptions.color || '#cbd5e1'}
                      onChange={(e) => onHorizontalSpacerOptionChange('color', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="h-spacer-thickness">Thickness (px)</Label>
                    <Input
                      id="h-spacer-thickness"
                      type="number"
                      min="1"
                      value={horizontalSpacerOptions.thickness}
                      onChange={(e) => onHorizontalSpacerOptionChange('thickness', Math.max(1, Number(e.target.value) || 2))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="h-spacer-style">Line Style</Label>
                    <select
                      id="h-spacer-style"
                      className="db-input"
                      value={horizontalSpacerOptions.style || 'solid'}
                      onChange={(e) => onHorizontalSpacerOptionChange('style', e.target.value)}
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                    </select>
                  </div>
                </>
              ) : null}

              {draft.type === 'v_spacer' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="v-spacer-color">Color</Label>
                    <Input
                      id="v-spacer-color"
                      type="color"
                      value={verticalSpacerOptions.color || '#cbd5e1'}
                      onChange={(e) => onVerticalSpacerOptionChange('color', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="v-spacer-thickness">Thickness (px)</Label>
                    <Input
                      id="v-spacer-thickness"
                      type="number"
                      min="1"
                      value={verticalSpacerOptions.thickness}
                      onChange={(e) => onVerticalSpacerOptionChange('thickness', Math.max(1, Number(e.target.value) || 2))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="v-spacer-style">Line Style</Label>
                    <select
                      id="v-spacer-style"
                      className="db-input"
                      value={verticalSpacerOptions.style || 'solid'}
                      onChange={(e) => onVerticalSpacerOptionChange('style', e.target.value)}
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="dotted">Dotted</option>
                    </select>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>
        ) : null}

        {draft.type !== 'map' && draft.type !== 'bar' && draft.type !== 'kpi' && draft.type !== 'pie' && draft.type !== 'timeline' && !EXTENDED_CHART_TYPES.includes(draft.type) && !isSimpleWidgetType ? (
          <div className="db-modal-advanced">
            <div className="space-y-2">
              <Label>Dimensions (Multi-select)</Label>
              <div className="db-multi-grid">
                {columns.length ? columns.map((col) => {
                  const selected = (draft.config?.dimensions || []).includes(col);
                  return (
                    <button
                      key={`dim-${col}`}
                      type="button"
                      className={`db-multi-item ${selected ? 'selected' : ''}`}
                      onClick={() => onToggleDimension(col)}
                    >
                      {col}
                    </button>
                  );
                }) : (
                  <p className="db-viz-empty">Pick a dataset first.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="widget-metric">Metric</Label>
              <select
                id="widget-metric"
                className="db-input"
                value={draft.config?.metric || ''}
                onChange={(e) => onConfigChange('metric', e.target.value)}
              >
                <option value="">Select metric</option>
                {columns.map((col) => (
                  <option key={`met-${col}`} value={col}>{col}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="widget-agg">Metric Function</Label>
              <select
                id="widget-agg"
                className="db-input"
                value={draft.config?.metric_function || 'sum'}
                onChange={(e) => onConfigChange('metric_function', e.target.value)}
              >
                {METRIC_FUNCTIONS.map((agg) => (
                  <option key={agg.id} value={agg.id}>{agg.label}</option>
                ))}
              </select>
            </div>

            {draft.type === 'timeline' ? (
              <div className="space-y-2">
                <Label htmlFor="widget-granularity">Time Granularity</Label>
                <select
                  id="widget-granularity"
                  className="db-input"
                  value={draft.config?.granularity || 'none'}
                  onChange={(e) => onConfigChange('granularity', e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="day">Day</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </div>
            ) : null}
          </div>
        ) : null}

        {draft.type === 'pie' ? (
          <div className="space-y-3">
            {pieSettingsTab === 'basic' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Data Mapping</h4>
                  <div className="db-group-grid db-group-grid--three">
                    <div className="space-y-2 db-span-full">
                      <Label>Dataset</Label>
                      <div className="db-dataset-picker">
                        <InlineDatasetMenu datasets={datasets} onPick={applySelectedDataset} />
                        <div className="db-dataset-pill">
                          {selectedDataset ? selectedDataset.original_filename : 'None selected'}
                        </div>
                        {selectedDataset ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              onConfigChange('dataset_id', '');
                              onConfigChange('dimensions', []);
                              onConfigChange('treemap_hierarchy_dimensions', []);
                              onConfigChange('metric', '');
                            }}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-basic-dimensions">Choose Dimension</Label>
                      <details className="db-check-dropdown">
                        <summary className="db-check-dropdown-trigger">
                          {(Array.isArray(draft.config?.dimensions) && draft.config.dimensions.length)
                            ? `${draft.config.dimensions.length} selected`
                            : 'Select dimensions'}
                        </summary>
                        <div className="db-check-dropdown-menu">
                          {columns.length ? columns.map((col) => {
                            const checked = (draft.config?.dimensions || []).includes(col);
                            return (
                              <label key={`pie-basic-dim-opt-${col}`} className="db-check-option">
                                <input type="checkbox" checked={checked} onChange={() => onToggleDimension(col)} />
                                <span>{col}</span>
                              </label>
                            );
                          }) : (
                            <p className="db-viz-empty">Pick a dataset first.</p>
                          )}
                        </div>
                      </details>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-basic-metric">Choose Metric</Label>
                      <select
                        id="pie-basic-metric"
                        className="db-input"
                        value={draft.config?.metric || ''}
                        onChange={(e) => onConfigChange('metric', e.target.value)}
                      >
                        <option value="">Select metric</option>
                        {columns.map((col) => (
                          <option key={`pie-basic-met-${col}`} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-basic-metric-function">Choose Metric Function</Label>
                      <select
                        id="pie-basic-metric-function"
                        className="db-input"
                        value={draft.config?.metric_function || 'sum'}
                        onChange={(e) => onConfigChange('metric_function', e.target.value)}
                      >
                        {METRIC_FUNCTIONS.map((agg) => (
                          <option key={`pie-basic-fn-${agg.id}`} value={agg.id}>{agg.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 db-span-full">
                      <Label htmlFor="pie-basic-topn">Top N Categories</Label>
                      <Input
                        id="pie-basic-topn"
                        type="number"
                        min="1"
                        max="200"
                        value={draft.config?.pie_top_n ?? 12}
                        onChange={(e) => onConfigChange('pie_top_n', Math.max(1, Number(e.target.value) || 12))}
                      />
                    </div>
                  </div>
                </section>
                <section className="db-field-group">
                  <h4>Layout</h4>
                  <div className="db-group-grid">
                    <div className="space-y-2">
                      <Label htmlFor="pie-basic-w">Width (sections)</Label>
                      <Input
                        id="pie-basic-w"
                        type="number"
                        min="1"
                        max={String(MAX_GRID_COLS)}
                        value={draft.w}
                        onChange={(e) => setDraft((prev) => ({ ...prev, w: clamp(e.target.value, 1, MAX_GRID_COLS) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-basic-h">Height (sections)</Label>
                      <Input
                        id="pie-basic-h"
                        type="number"
                        min="1"
                        max={String(MAX_GRID_ROWS)}
                        value={draft.h}
                        onChange={(e) => setDraft((prev) => ({ ...prev, h: clamp(e.target.value, 1, MAX_GRID_ROWS) }))}
                      />
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
            {pieSettingsTab === 'advanced' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Geometry & Angles</h4>
                  <div className="db-group-grid">
                    <div className="space-y-2">
                      <Label htmlFor="pie-inner-radius">Inner Radius</Label>
                      <Input id="pie-inner-radius" type="number" value={pieOptions.inner_radius} onChange={(e) => onPieOptionChange('inner_radius', Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-outer-radius">Outer Radius</Label>
                      <Input id="pie-outer-radius" type="number" value={pieOptions.outer_radius} onChange={(e) => onPieOptionChange('outer_radius', Number(e.target.value) || 74)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-start-angle">Start Angle</Label>
                      <Input id="pie-start-angle" type="number" value={pieOptions.start_angle} onChange={(e) => onPieOptionChange('start_angle', Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-end-angle">End Angle</Label>
                      <Input id="pie-end-angle" type="number" value={pieOptions.end_angle} onChange={(e) => onPieOptionChange('end_angle', Number(e.target.value) || 360)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-padding-angle">Padding Angle</Label>
                      <Input id="pie-padding-angle" type="number" value={pieOptions.padding_angle} onChange={(e) => onPieOptionChange('padding_angle', Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-corner-radius">Corner Radius</Label>
                      <Input id="pie-corner-radius" type="number" value={pieOptions.corner_radius} onChange={(e) => onPieOptionChange('corner_radius', Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-min-angle">Min Slice Angle</Label>
                      <Input id="pie-min-angle" type="number" value={pieOptions.min_angle} onChange={(e) => onPieOptionChange('min_angle', Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-cx">Center X (e.g. 50%)</Label>
                      <Input id="pie-cx" value={pieOptions.cx} onChange={(e) => onPieOptionChange('cx', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-cy">Center Y (e.g. 50%)</Label>
                      <Input id="pie-cy" value={pieOptions.cy} onChange={(e) => onPieOptionChange('cy', e.target.value)} />
                    </div>
                  </div>
                </section>
                <section className="db-field-group">
                  <h4>Labels, Legend & Tooltip</h4>
                  <div className="db-group-grid">
                    <label className="check">
                      <input type="checkbox" checked={Boolean(pieOptions.show_tooltip)} onChange={(e) => onPieOptionChange('show_tooltip', e.target.checked)} />
                      Show Tooltip
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={Boolean(pieOptions.show_legend)} onChange={(e) => onPieOptionChange('show_legend', e.target.checked)} />
                      Show Legend
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={Boolean(pieOptions.show_labels)} onChange={(e) => onPieOptionChange('show_labels', e.target.checked)} />
                      Show Labels
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={Boolean(pieOptions.show_label_line)} onChange={(e) => onPieOptionChange('show_label_line', e.target.checked)} />
                      Show Label Lines
                    </label>
                    <div className="space-y-2">
                      <Label htmlFor="pie-label-mode">Label Mode</Label>
                      <select id="pie-label-mode" className="db-input" value={pieOptions.label_mode} onChange={(e) => onPieOptionChange('label_mode', e.target.value)}>
                        <option value="percent">Percent</option>
                        <option value="value">Value</option>
                        <option value="name">Name</option>
                        <option value="name_value">Name + Value</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-legend-layout">Legend Layout</Label>
                      <select id="pie-legend-layout" className="db-input" value={pieOptions.legend_layout} onChange={(e) => onPieOptionChange('legend_layout', e.target.value)}>
                        <option value="horizontal">Horizontal</option>
                        <option value="vertical">Vertical</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-legend-align">Legend Align</Label>
                      <select id="pie-legend-align" className="db-input" value={pieOptions.legend_align} onChange={(e) => onPieOptionChange('legend_align', e.target.value)}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-legend-vertical-align">Legend Vertical Align</Label>
                      <select id="pie-legend-vertical-align" className="db-input" value={pieOptions.legend_vertical_align} onChange={(e) => onPieOptionChange('legend_vertical_align', e.target.value)}>
                        <option value="top">Top</option>
                        <option value="middle">Middle</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </div>
                  </div>
                </section>
                <section className="db-field-group">
                  <h4>Colors & Stroke</h4>
                  <div className="db-group-grid">
                    <ColorGradientInput
                      idBase="pie-fill-color"
                      label="Slice Fill"
                      value={pieOptions.fill_color}
                      onChange={(next) => onPieOptionChange('fill_color', next)}
                    />
                    <label className="check">
                      <input type="checkbox" checked={Boolean(pieOptions.use_palette)} onChange={(e) => onPieOptionChange('use_palette', e.target.checked)} />
                      Use Palette (per slice)
                    </label>
                    <div className="space-y-2">
                      <Label htmlFor="pie-stroke-color">Stroke Color</Label>
                      <Input id="pie-stroke-color" type="color" value={pieOptions.stroke_color} onChange={(e) => onPieOptionChange('stroke_color', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pie-stroke-width">Stroke Width</Label>
                      <Input id="pie-stroke-width" type="number" min="0" value={pieOptions.stroke_width} onChange={(e) => onPieOptionChange('stroke_width', Math.max(0, Number(e.target.value) || 0))} />
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        ) : null}

        {draft.type === 'bar' ? (
          <div className="space-y-3">
            {barSettingsTab === 'basic' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Data Mapping</h4>
                  <div className="db-group-grid db-group-grid--three">
                    <div className="space-y-2 db-span-full">
                      <Label>Dataset</Label>
                      <div className="db-dataset-picker">
                        <InlineDatasetMenu datasets={datasets} onPick={applySelectedDataset} />
                        <div className="db-dataset-pill">
                          {selectedDataset ? selectedDataset.original_filename : 'None selected'}
                        </div>
                        {selectedDataset ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              onConfigChange('dataset_id', '');
                              onConfigChange('dimensions', []);
                              onConfigChange('metric', '');
                            }}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-basic-dimensions">Choose Dimension</Label>
                      <details className="db-check-dropdown">
                        <summary className="db-check-dropdown-trigger">
                          {(Array.isArray(draft.config?.dimensions) && draft.config.dimensions.length)
                            ? `${draft.config.dimensions.length} selected`
                            : 'Select dimensions'}
                        </summary>
                        <div className="db-check-dropdown-menu">
                          {columns.length ? columns.map((col) => {
                            const checked = (draft.config?.dimensions || []).includes(col);
                            return (
                              <label key={`bar-basic-dim-opt-${col}`} className="db-check-option">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => onToggleDimension(col)}
                                />
                                <span>{col}</span>
                              </label>
                            );
                          }) : (
                            <p className="db-viz-empty">Pick a dataset first.</p>
                          )}
                        </div>
                      </details>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-basic-metric">Choose Metric</Label>
                      <select
                        id="bar-basic-metric"
                        className="db-input"
                        value={draft.config?.metric || ''}
                        onChange={(e) => onConfigChange('metric', e.target.value)}
                      >
                        <option value="">Select metric</option>
                        {columns.map((col) => (
                          <option key={`bar-basic-met-${col}`} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-basic-metric-function">Choose Metric Function</Label>
                      <select
                        id="bar-basic-metric-function"
                        className="db-input"
                        value={draft.config?.metric_function || 'sum'}
                        onChange={(e) => onConfigChange('metric_function', e.target.value)}
                      >
                        {METRIC_FUNCTIONS.map((agg) => (
                          <option key={`bar-basic-fn-${agg.id}`} value={agg.id}>{agg.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 db-span-full">
                      <Label htmlFor="bar-basic-topn">Top N Categories</Label>
                      <Input
                        id="bar-basic-topn"
                        type="number"
                        min="1"
                        max="200"
                        value={draft.config?.bar_top_n ?? 12}
                        onChange={(e) => onConfigChange('bar_top_n', Math.max(1, Number(e.target.value) || 12))}
                      />
                    </div>
                  </div>
                </section>

                <section className="db-field-group">
                  <h4>Layout</h4>
                  <div className="db-group-grid">
                    <div className="space-y-2">
                      <Label htmlFor="bar-basic-w">Width (sections)</Label>
                      <Input
                        id="bar-basic-w"
                        type="number"
                        min="1"
                        max={String(MAX_GRID_COLS)}
                        value={draft.w}
                        onChange={(e) => setDraft((prev) => ({ ...prev, w: clamp(e.target.value, 1, MAX_GRID_COLS) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-basic-h">Height (sections)</Label>
                      <Input
                        id="bar-basic-h"
                        type="number"
                        min="1"
                        max={String(MAX_GRID_ROWS)}
                        value={draft.h}
                        onChange={(e) => setDraft((prev) => ({ ...prev, h: clamp(e.target.value, 1, MAX_GRID_ROWS) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-basic-layout">Orientation</Label>
                      <select
                        id="bar-basic-layout"
                        className="db-input"
                        value={barOptions.layout}
                        onChange={(e) => onBarOptionChange('layout', e.target.value)}
                      >
                        <option value="horizontal">Vertical Bars</option>
                        <option value="vertical">Horizontal Bars</option>
                      </select>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {barSettingsTab === 'advanced' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Axes & Grid</h4>
                  <div className="db-group-grid">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(barOptions.show_x_axis)}
                        onChange={(e) => onBarOptionChange('show_x_axis', e.target.checked)}
                      />
                      Show X Axis
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(barOptions.show_y_axis)}
                        onChange={(e) => onBarOptionChange('show_y_axis', e.target.checked)}
                      />
                      Show Y Axis
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(barOptions.grid_horizontal)}
                        onChange={(e) => onBarOptionChange('grid_horizontal', e.target.checked)}
                      />
                      Horizontal Grid Lines
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(barOptions.grid_vertical)}
                        onChange={(e) => onBarOptionChange('grid_vertical', e.target.checked)}
                      />
                      Vertical Grid Lines
                    </label>
                    <div className="space-y-2">
                      <Label htmlFor="bar-grid-dash">Grid Dash Pattern</Label>
                      <Input
                        id="bar-grid-dash"
                        value={barOptions.grid_dash}
                        onChange={(e) => onBarOptionChange('grid_dash', e.target.value)}
                        placeholder="3 3"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-x-angle">X Tick Angle</Label>
                      <Input
                        id="bar-x-angle"
                        type="number"
                        value={barOptions.x_tick_angle}
                        onChange={(e) => onBarOptionChange('x_tick_angle', Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-x-size">X Tick Font Size</Label>
                      <Input
                        id="bar-x-size"
                        type="number"
                        value={barOptions.x_tick_font_size}
                        onChange={(e) => onBarOptionChange('x_tick_font_size', Number(e.target.value) || 10)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-y-size">Y Tick Font Size</Label>
                      <Input
                        id="bar-y-size"
                        type="number"
                        value={barOptions.y_tick_font_size}
                        onChange={(e) => onBarOptionChange('y_tick_font_size', Number(e.target.value) || 10)}
                      />
                    </div>
                  </div>
                </section>

                <section className="db-field-group">
                  <h4>Bars & Spacing</h4>
                  <div className="db-group-grid">
                    <ColorGradientInput
                      idBase="bar-fill-color"
                      label="Bar Color"
                      value={barOptions.fill_color}
                      onChange={(next) => onBarOptionChange('fill_color', next)}
                    />
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(barOptions.use_palette)}
                        onChange={(e) => onBarOptionChange('use_palette', e.target.checked)}
                      />
                      Use Palette (per bar color)
                    </label>
                    <div className="space-y-2">
                      <Label htmlFor="bar-radius">Bar Radius</Label>
                      <Input
                        id="bar-radius"
                        type="number"
                        value={barOptions.radius}
                        onChange={(e) => onBarOptionChange('radius', Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-size">Bar Size (px, optional)</Label>
                      <Input
                        id="bar-size"
                        type="number"
                        value={barOptions.bar_size}
                        onChange={(e) => onBarOptionChange('bar_size', e.target.value)}
                        placeholder="auto"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-gap">Bar Gap</Label>
                      <Input
                        id="bar-gap"
                        type="number"
                        value={barOptions.bar_gap}
                        onChange={(e) => onBarOptionChange('bar_gap', Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-category-gap">Category Gap</Label>
                      <Input
                        id="bar-category-gap"
                        type="number"
                        value={barOptions.bar_category_gap}
                        onChange={(e) => onBarOptionChange('bar_category_gap', Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-min-point">Min Point Size</Label>
                      <Input
                        id="bar-min-point"
                        type="number"
                        value={barOptions.min_point_size}
                        onChange={(e) => onBarOptionChange('min_point_size', Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bar-stack-id">Stack ID (optional)</Label>
                      <Input
                        id="bar-stack-id"
                        value={barOptions.stack_id}
                        onChange={(e) => onBarOptionChange('stack_id', e.target.value)}
                        placeholder="stack-1"
                      />
                    </div>
                  </div>
                </section>

                <section className="db-field-group">
                  <h4>Overlays</h4>
                  <div className="db-group-grid">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(barOptions.show_tooltip)}
                        onChange={(e) => onBarOptionChange('show_tooltip', e.target.checked)}
                      />
                      Show Tooltip
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(barOptions.show_legend)}
                        onChange={(e) => onBarOptionChange('show_legend', e.target.checked)}
                      />
                      Show Legend
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(barOptions.show_value_labels)}
                        onChange={(e) => onBarOptionChange('show_value_labels', e.target.checked)}
                      />
                      Show Value Labels
                    </label>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        ) : null}

        {EXTENDED_CHART_TYPES.includes(draft.type) ? (
          <div className="space-y-3">
            {extendedSettingsTab === 'basic' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Data Mapping</h4>
                  <div className="db-group-grid db-group-grid--three">
                    <div className="space-y-2 db-span-full">
                      <Label>Dataset</Label>
                      <div className="db-dataset-picker">
                        <InlineDatasetMenu datasets={datasets} onPick={applySelectedDataset} />
                        <div className="db-dataset-pill">
                          {selectedDataset ? selectedDataset.original_filename : 'None selected'}
                        </div>
                        {selectedDataset ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              onConfigChange('dataset_id', '');
                              onConfigChange('dimensions', []);
                              onConfigChange('metric', '');
                            }}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{draft.type === 'treemap' ? 'Hierarchy Dimensions (ordered)' : 'Choose Dimension'}</Label>
                      {draft.type === 'treemap' ? (
                        <div className="db-hierarchy-editor">
                          <div className="db-hierarchy-list">
                            {treemapHierarchy.length ? treemapHierarchy.map((col, idx) => (
                              <div key={`tree-level-${col}`} className="db-hierarchy-item">
                                <span className="db-hierarchy-label">{`Level ${idx + 1}: ${col}`}</span>
                                <div className="db-hierarchy-actions">
                                  <button type="button" className="db-hierarchy-btn" onClick={() => onMoveTreemapHierarchyDimension(idx, -1)} disabled={idx === 0}>Up</button>
                                  <button type="button" className="db-hierarchy-btn" onClick={() => onMoveTreemapHierarchyDimension(idx, 1)} disabled={idx === treemapHierarchy.length - 1}>Down</button>
                                  <button type="button" className="db-hierarchy-btn danger" onClick={() => onRemoveTreemapHierarchyDimension(col)}>Remove</button>
                                </div>
                              </div>
                            )) : <p className="db-viz-empty">Add hierarchy levels for parent-child grouping.</p>}
                          </div>
                          <div className="db-hierarchy-add">
                            <select
                              className="db-input"
                              value={hierarchyCandidate}
                              onChange={(e) => setHierarchyCandidate(e.target.value)}
                            >
                              <option value="">Select level column</option>
                              {availableHierarchyColumns.map((col) => (
                                <option key={`tree-level-col-${col}`} value={col}>{col}</option>
                              ))}
                            </select>
                            <Button type="button" variant="secondary" onClick={() => onAddTreemapHierarchyDimension(hierarchyCandidate)} disabled={!hierarchyCandidate}>Add Level</Button>
                          </div>
                        </div>
                      ) : (
                        <details className="db-check-dropdown">
                          <summary className="db-check-dropdown-trigger">
                            {(Array.isArray(draft.config?.dimensions) && draft.config.dimensions.length)
                              ? `${draft.config.dimensions.length} selected`
                              : 'Select dimensions'}
                          </summary>
                          <div className="db-check-dropdown-menu">
                            {columns.length ? columns.map((col) => {
                              const checked = (draft.config?.dimensions || []).includes(col);
                              return (
                                <label key={`ext-dim-opt-${col}`} className="db-check-option">
                                  <input type="checkbox" checked={checked} onChange={() => onToggleDimension(col)} />
                                  <span>{col}</span>
                                </label>
                              );
                            }) : <p className="db-viz-empty">Pick a dataset first.</p>}
                          </div>
                        </details>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ext-basic-metric">Choose Metric</Label>
                      <select
                        id="ext-basic-metric"
                        className="db-input"
                        value={draft.config?.metric || ''}
                        onChange={(e) => onConfigChange('metric', e.target.value)}
                      >
                        <option value="">Select metric</option>
                        {columns.map((col) => (
                          <option key={`ext-basic-met-${col}`} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ext-basic-metric-function">Choose Metric Function</Label>
                      <select
                        id="ext-basic-metric-function"
                        className="db-input"
                        value={draft.config?.metric_function || 'sum'}
                        onChange={(e) => onConfigChange('metric_function', e.target.value)}
                      >
                        {METRIC_FUNCTIONS.map((agg) => (
                          <option key={`ext-basic-fn-${agg.id}`} value={agg.id}>{agg.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 db-span-full">
                      <Label htmlFor="ext-basic-topn">Top N Categories</Label>
                      <Input
                        id="ext-basic-topn"
                        type="number"
                        min="1"
                        max="200"
                        value={draft.config?.chart_top_n ?? 12}
                        onChange={(e) => onConfigChange('chart_top_n', Math.max(1, Number(e.target.value) || 12))}
                      />
                    </div>
                  </div>
                </section>
                <section className="db-field-group">
                  <h4>Layout</h4>
                  <div className="db-group-grid">
                    <div className="space-y-2">
                      <Label htmlFor="ext-basic-w">Width (sections)</Label>
                      <Input id="ext-basic-w" type="number" min="1" max={String(MAX_GRID_COLS)} value={draft.w} onChange={(e) => setDraft((prev) => ({ ...prev, w: clamp(e.target.value, 1, MAX_GRID_COLS) }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ext-basic-h">Height (sections)</Label>
                      <Input id="ext-basic-h" type="number" min="1" max={String(MAX_GRID_ROWS)} value={draft.h} onChange={(e) => setDraft((prev) => ({ ...prev, h: clamp(e.target.value, 1, MAX_GRID_ROWS) }))} />
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {extendedSettingsTab === 'advanced' ? (
              <div className="db-modal-advanced">
                {draft.type === 'area' ? (
                  <section className="db-field-group">
                    <h4>Area Params</h4>
                    <div className="db-group-grid">
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_grid)} onChange={(e) => onExtendedOptionChange('show_grid', e.target.checked)} />Show Grid</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_tooltip)} onChange={(e) => onExtendedOptionChange('show_tooltip', e.target.checked)} />Show Tooltip</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_legend)} onChange={(e) => onExtendedOptionChange('show_legend', e.target.checked)} />Show Legend</label>
                      <div className="space-y-2"><Label htmlFor="ext-area-curve">Curve</Label><select id="ext-area-curve" className="db-input" value={extendedOptions.curve_type || 'monotone'} onChange={(e) => onExtendedOptionChange('curve_type', e.target.value)}><option value="monotone">Monotone</option><option value="linear">Linear</option><option value="step">Step</option><option value="basis">Basis</option></select></div>
                      <div className="space-y-2"><Label htmlFor="ext-area-opacity">Fill Opacity</Label><Input id="ext-area-opacity" type="number" step="0.1" min="0" max="1" value={extendedOptions.fill_opacity ?? 0.7} onChange={(e) => onExtendedOptionChange('fill_opacity', Number(e.target.value) || 0)} /></div>
                      <ColorGradientInput idBase="ext-area-stroke" label="Stroke Color" value={extendedOptions.stroke_color} onChange={(next) => onExtendedOptionChange('stroke_color', next)} />
                      <ColorGradientInput idBase="ext-area-fill" label="Fill Color" value={extendedOptions.fill_color} onChange={(next) => onExtendedOptionChange('fill_color', next)} />
                    </div>
                  </section>
                ) : null}
                {draft.type === 'scatter' ? (
                  <section className="db-field-group">
                    <h4>Scatter Params</h4>
                    <div className="db-group-grid">
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_grid)} onChange={(e) => onExtendedOptionChange('show_grid', e.target.checked)} />Show Grid</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_tooltip)} onChange={(e) => onExtendedOptionChange('show_tooltip', e.target.checked)} />Show Tooltip</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_line)} onChange={(e) => onExtendedOptionChange('show_line', e.target.checked)} />Show Connecting Line</label>
                      <div className="space-y-2"><Label htmlFor="ext-scatter-size">Point Size</Label><Input id="ext-scatter-size" type="number" min="2" max="24" value={extendedOptions.point_size ?? 6} onChange={(e) => onExtendedOptionChange('point_size', Number(e.target.value) || 6)} /></div>
                      <ColorGradientInput idBase="ext-scatter-point" label="Point Color" value={extendedOptions.point_color} onChange={(next) => onExtendedOptionChange('point_color', next)} />
                      <ColorGradientInput idBase="ext-scatter-line" label="Line Color" value={extendedOptions.line_color} onChange={(next) => onExtendedOptionChange('line_color', next)} />
                    </div>
                  </section>
                ) : null}
                {draft.type === 'radar' ? (
                  <section className="db-field-group">
                    <h4>Radar Params</h4>
                    <div className="db-group-grid">
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_tooltip)} onChange={(e) => onExtendedOptionChange('show_tooltip', e.target.checked)} />Show Tooltip</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_legend)} onChange={(e) => onExtendedOptionChange('show_legend', e.target.checked)} />Show Legend</label>
                      <div className="space-y-2"><Label htmlFor="ext-radar-opacity">Fill Opacity</Label><Input id="ext-radar-opacity" type="number" step="0.1" min="0" max="1" value={extendedOptions.fill_opacity ?? 0.6} onChange={(e) => onExtendedOptionChange('fill_opacity', Number(e.target.value) || 0)} /></div>
                      <ColorGradientInput idBase="ext-radar-stroke" label="Stroke Color" value={extendedOptions.stroke_color} onChange={(next) => onExtendedOptionChange('stroke_color', next)} />
                      <ColorGradientInput idBase="ext-radar-fill" label="Fill Color" value={extendedOptions.fill_color} onChange={(next) => onExtendedOptionChange('fill_color', next)} />
                    </div>
                  </section>
                ) : null}
                {draft.type === 'radialbar' ? (
                  <section className="db-field-group">
                    <h4>Radial Bar Params</h4>
                    <div className="db-group-grid">
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_tooltip)} onChange={(e) => onExtendedOptionChange('show_tooltip', e.target.checked)} />Show Tooltip</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_legend)} onChange={(e) => onExtendedOptionChange('show_legend', e.target.checked)} />Show Legend</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.use_palette)} onChange={(e) => onExtendedOptionChange('use_palette', e.target.checked)} />Use Palette</label>
                      <div className="space-y-2"><Label htmlFor="ext-rb-start">Start Angle</Label><Input id="ext-rb-start" type="number" value={extendedOptions.start_angle ?? 180} onChange={(e) => onExtendedOptionChange('start_angle', Number(e.target.value) || 0)} /></div>
                      <div className="space-y-2"><Label htmlFor="ext-rb-end">End Angle</Label><Input id="ext-rb-end" type="number" value={extendedOptions.end_angle ?? 0} onChange={(e) => onExtendedOptionChange('end_angle', Number(e.target.value) || 0)} /></div>
                      <div className="space-y-2"><Label htmlFor="ext-rb-inner">Inner Radius</Label><Input id="ext-rb-inner" value={extendedOptions.inner_radius || '20%'} onChange={(e) => onExtendedOptionChange('inner_radius', e.target.value)} /></div>
                      <div className="space-y-2"><Label htmlFor="ext-rb-outer">Outer Radius</Label><Input id="ext-rb-outer" value={extendedOptions.outer_radius || '90%'} onChange={(e) => onExtendedOptionChange('outer_radius', e.target.value)} /></div>
                      <ColorGradientInput idBase="ext-rb-fill" label="Bar Color" value={extendedOptions.fill_color} onChange={(next) => onExtendedOptionChange('fill_color', next)} />
                    </div>
                  </section>
                ) : null}
                {draft.type === 'composed' ? (
                  <section className="db-field-group">
                    <h4>Composed Params</h4>
                    <div className="db-group-grid">
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_grid)} onChange={(e) => onExtendedOptionChange('show_grid', e.target.checked)} />Show Grid</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_tooltip)} onChange={(e) => onExtendedOptionChange('show_tooltip', e.target.checked)} />Show Tooltip</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_legend)} onChange={(e) => onExtendedOptionChange('show_legend', e.target.checked)} />Show Legend</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_bar)} onChange={(e) => onExtendedOptionChange('show_bar', e.target.checked)} />Show Bar</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_line)} onChange={(e) => onExtendedOptionChange('show_line', e.target.checked)} />Show Line</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_area)} onChange={(e) => onExtendedOptionChange('show_area', e.target.checked)} />Show Area</label>
                      <ColorGradientInput idBase="ext-comp-bar" label="Bar Color" value={extendedOptions.bar_color} onChange={(next) => onExtendedOptionChange('bar_color', next)} />
                      <ColorGradientInput idBase="ext-comp-line" label="Line Color" value={extendedOptions.line_color} onChange={(next) => onExtendedOptionChange('line_color', next)} />
                      <ColorGradientInput idBase="ext-comp-area" label="Area Color" value={extendedOptions.area_color} onChange={(next) => onExtendedOptionChange('area_color', next)} />
                    </div>
                  </section>
                ) : null}
                {draft.type === 'treemap' ? (
                  <section className="db-field-group">
                    <h4>Treemap Params</h4>
                    <div className="db-group-grid">
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_tooltip)} onChange={(e) => onExtendedOptionChange('show_tooltip', e.target.checked)} />Show Tooltip</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.use_palette)} onChange={(e) => onExtendedOptionChange('use_palette', e.target.checked)} />Use Palette</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.is_animation_active)} onChange={(e) => onExtendedOptionChange('is_animation_active', e.target.checked)} />Animate</label>
                      <div className="space-y-2">
                        <Label htmlFor="ext-tree-aspect">Aspect Ratio</Label>
                        <Input
                          id="ext-tree-aspect"
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={extendedOptions.aspect_ratio ?? 1.4}
                          onChange={(e) => onExtendedOptionChange('aspect_ratio', Number(e.target.value) || 1.4)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ext-tree-anim-begin">Animation Begin (ms)</Label>
                        <Input
                          id="ext-tree-anim-begin"
                          type="number"
                          min="0"
                          value={extendedOptions.animation_begin ?? 0}
                          onChange={(e) => onExtendedOptionChange('animation_begin', Math.max(0, Number(e.target.value) || 0))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ext-tree-anim-duration">Animation Duration (ms)</Label>
                        <Input
                          id="ext-tree-anim-duration"
                          type="number"
                          min="0"
                          value={extendedOptions.animation_duration ?? 600}
                          onChange={(e) => onExtendedOptionChange('animation_duration', Math.max(0, Number(e.target.value) || 0))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ext-tree-anim-easing">Animation Easing</Label>
                        <select
                          id="ext-tree-anim-easing"
                          className="db-input"
                          value={extendedOptions.animation_easing || 'ease'}
                          onChange={(e) => onExtendedOptionChange('animation_easing', e.target.value)}
                        >
                          <option value="ease">Ease</option>
                          <option value="ease-in">Ease In</option>
                          <option value="ease-out">Ease Out</option>
                          <option value="ease-in-out">Ease In Out</option>
                          <option value="linear">Linear</option>
                        </select>
                      </div>
                      <ColorGradientInput idBase="ext-tree-fill" label="Node Fill" value={extendedOptions.fill_color} onChange={(next) => onExtendedOptionChange('fill_color', next)} />
                      <div className="space-y-2"><Label htmlFor="ext-tree-stroke">Stroke Color</Label><Input id="ext-tree-stroke" type="color" value={extendedOptions.stroke_color || '#ffffff'} onChange={(e) => onExtendedOptionChange('stroke_color', e.target.value)} /></div>
                      <div className="space-y-2">
                        <Label htmlFor="ext-tree-stroke-width">Stroke Width</Label>
                        <Input
                          id="ext-tree-stroke-width"
                          type="number"
                          min="0"
                          value={extendedOptions.stroke_width ?? 1}
                          onChange={(e) => onExtendedOptionChange('stroke_width', Math.max(0, Number(e.target.value) || 0))}
                        />
                      </div>
                    </div>
                  </section>
                ) : null}
                {draft.type === 'funnel' ? (
                  <section className="db-field-group">
                    <h4>Funnel Params</h4>
                    <div className="db-group-grid">
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_tooltip)} onChange={(e) => onExtendedOptionChange('show_tooltip', e.target.checked)} />Show Tooltip</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.show_labels)} onChange={(e) => onExtendedOptionChange('show_labels', e.target.checked)} />Show Labels</label>
                      <label className="check"><input type="checkbox" checked={Boolean(extendedOptions.use_palette)} onChange={(e) => onExtendedOptionChange('use_palette', e.target.checked)} />Use Palette</label>
                      <ColorGradientInput idBase="ext-funnel-fill" label="Funnel Fill" value={extendedOptions.fill_color} onChange={(next) => onExtendedOptionChange('fill_color', next)} />
                      <div className="space-y-2"><Label htmlFor="ext-funnel-stroke">Stroke Color</Label><Input id="ext-funnel-stroke" type="color" value={extendedOptions.stroke_color || '#ffffff'} onChange={(e) => onExtendedOptionChange('stroke_color', e.target.value)} /></div>
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {draft.type === 'timeline' ? (
          <div className="space-y-3">
            {timelineSettingsTab === 'basic' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Data Mapping</h4>
                  <div className="db-group-grid db-group-grid--three">
                    <div className="space-y-2 db-span-full">
                      <Label>Dataset</Label>
                      <div className="db-dataset-picker">
                        <InlineDatasetMenu datasets={datasets} onPick={applySelectedDataset} />
                        <div className="db-dataset-pill">
                          {selectedDataset ? selectedDataset.original_filename : 'None selected'}
                        </div>
                        {selectedDataset ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              onConfigChange('dataset_id', '');
                              onConfigChange('dimensions', []);
                              onConfigChange('metric', '');
                            }}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timeline-basic-dimensions">Choose Dimension</Label>
                      <details className="db-check-dropdown">
                        <summary className="db-check-dropdown-trigger">
                          {(Array.isArray(draft.config?.dimensions) && draft.config.dimensions.length)
                            ? `${draft.config.dimensions.length} selected`
                            : 'Select dimensions'}
                        </summary>
                        <div className="db-check-dropdown-menu">
                          {columns.length ? columns.map((col) => {
                            const checked = (draft.config?.dimensions || []).includes(col);
                            return (
                              <label key={`timeline-basic-dim-opt-${col}`} className="db-check-option">
                                <input type="checkbox" checked={checked} onChange={() => onToggleDimension(col)} />
                                <span>{col}</span>
                              </label>
                            );
                          }) : (
                            <p className="db-viz-empty">Pick a dataset first.</p>
                          )}
                        </div>
                      </details>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timeline-basic-metric">Choose Metric</Label>
                      <select
                        id="timeline-basic-metric"
                        className="db-input"
                        value={draft.config?.metric || ''}
                        onChange={(e) => onConfigChange('metric', e.target.value)}
                      >
                        <option value="">Select metric</option>
                        {columns.map((col) => (
                          <option key={`timeline-basic-met-${col}`} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timeline-basic-metric-function">Choose Metric Function</Label>
                      <select
                        id="timeline-basic-metric-function"
                        className="db-input"
                        value={draft.config?.metric_function || 'sum'}
                        onChange={(e) => onConfigChange('metric_function', e.target.value)}
                      >
                        {METRIC_FUNCTIONS.map((agg) => (
                          <option key={`timeline-basic-fn-${agg.id}`} value={agg.id}>{agg.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 db-span-full">
                      <Label htmlFor="timeline-basic-granularity">Time Granularity</Label>
                      <select
                        id="timeline-basic-granularity"
                        className="db-input"
                        value={draft.config?.granularity || 'none'}
                        onChange={(e) => onConfigChange('granularity', e.target.value)}
                      >
                        <option value="none">None</option>
                        <option value="day">Day</option>
                        <option value="month">Month</option>
                        <option value="year">Year</option>
                      </select>
                    </div>
                  </div>
                </section>
                <section className="db-field-group">
                  <h4>Layout</h4>
                  <div className="db-group-grid">
                    <div className="space-y-2">
                      <Label htmlFor="timeline-basic-w">Width (sections)</Label>
                      <Input
                        id="timeline-basic-w"
                        type="number"
                        min="1"
                        max={String(MAX_GRID_COLS)}
                        value={draft.w}
                        onChange={(e) => setDraft((prev) => ({ ...prev, w: clamp(e.target.value, 1, MAX_GRID_COLS) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timeline-basic-h">Height (sections)</Label>
                      <Input
                        id="timeline-basic-h"
                        type="number"
                        min="1"
                        max={String(MAX_GRID_ROWS)}
                        value={draft.h}
                        onChange={(e) => setDraft((prev) => ({ ...prev, h: clamp(e.target.value, 1, MAX_GRID_ROWS) }))}
                      />
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {timelineSettingsTab === 'advanced' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Fallback Data</h4>
                  <div className="db-group-grid">
                    <div className="space-y-2 db-span-full">
                      <Label htmlFor="widget-points">Manual Points (fallback: label,value)</Label>
                      <textarea
                        id="widget-points"
                        className="db-textarea"
                        rows={6}
                        value={draft.config?.points || ''}
                        onChange={(e) => onConfigChange('points', e.target.value)}
                        placeholder={'Jan,10\\nFeb,18\\nMar,22'}
                      />
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        ) : null}

        {draft.type === 'kpi' ? (
          <div className="space-y-3">
            {kpiSettingsTab === 'basic' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Data Mapping</h4>
                  <div className="db-group-grid db-group-grid--three">
                    <div className="space-y-2 db-span-full">
                      <Label>Dataset</Label>
                      <div className="db-dataset-picker">
                        <InlineDatasetMenu datasets={datasets} onPick={applySelectedDataset} />
                        <div className="db-dataset-pill">
                          {selectedDataset ? selectedDataset.original_filename : 'None selected'}
                        </div>
                        {selectedDataset ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              onConfigChange('dataset_id', '');
                              onConfigChange('dimensions', []);
                              onConfigChange('metric', '');
                            }}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kpi-basic-dimensions">Choose Dimension</Label>
                      <details className="db-check-dropdown">
                        <summary className="db-check-dropdown-trigger">
                          {(Array.isArray(draft.config?.dimensions) && draft.config.dimensions.length)
                            ? `${draft.config.dimensions.length} selected`
                            : 'Select dimensions'}
                        </summary>
                        <div className="db-check-dropdown-menu">
                          {columns.length ? columns.map((col) => {
                            const checked = (draft.config?.dimensions || []).includes(col);
                            return (
                              <label key={`kpi-basic-dim-opt-${col}`} className="db-check-option">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => onToggleDimension(col)}
                                />
                                <span>{col}</span>
                              </label>
                            );
                          }) : (
                            <p className="db-viz-empty">Pick a dataset first.</p>
                          )}
                        </div>
                      </details>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kpi-basic-metric">Choose Metric</Label>
                      <select
                        id="kpi-basic-metric"
                        className="db-input"
                        value={draft.config?.metric || ''}
                        onChange={(e) => onConfigChange('metric', e.target.value)}
                      >
                        <option value="">Select metric</option>
                        {columns.map((col) => (
                          <option key={`kpi-basic-met-${col}`} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kpi-basic-metric-function">Choose Metric Function</Label>
                      <select
                        id="kpi-basic-metric-function"
                        className="db-input"
                        value={draft.config?.metric_function || 'sum'}
                        onChange={(e) => onConfigChange('metric_function', e.target.value)}
                      >
                        {METRIC_FUNCTIONS.map((agg) => (
                          <option key={`kpi-basic-fn-${agg.id}`} value={agg.id}>{agg.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                <section className="db-field-group">
                  <h4>Layout</h4>
                  <div className="db-group-grid">
                    <div className="space-y-2">
                      <Label htmlFor="kpi-basic-w">Width (sections)</Label>
                      <Input
                        id="kpi-basic-w"
                        type="number"
                        min="1"
                        max={String(MAX_GRID_COLS)}
                        value={draft.w}
                        onChange={(e) => setDraft((prev) => ({ ...prev, w: clamp(e.target.value, 1, MAX_GRID_COLS) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kpi-basic-h">Height (sections)</Label>
                      <Input
                        id="kpi-basic-h"
                        type="number"
                        min="1"
                        max={String(MAX_GRID_ROWS)}
                        value={draft.h}
                        onChange={(e) => setDraft((prev) => ({ ...prev, h: clamp(e.target.value, 1, MAX_GRID_ROWS) }))}
                      />
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {kpiSettingsTab === 'advanced' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Display & Trend</h4>
                  <div className="db-group-grid">
                    <div className="space-y-2">
                      <Label htmlFor="widget-subtitle">Subtitle</Label>
                      <Input
                        id="widget-subtitle"
                        value={draft.config?.subtitle || ''}
                        onChange={(e) => onConfigChange('subtitle', e.target.value)}
                        placeholder="Current Period"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="widget-trend">Trend Label</Label>
                      <Input
                        id="widget-trend"
                        value={draft.config?.trend || ''}
                        onChange={(e) => onConfigChange('trend', e.target.value)}
                        placeholder="+8.2%"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="widget-value">Manual Value (fallback)</Label>
                      <Input
                        id="widget-value"
                        value={draft.config?.value || ''}
                        onChange={(e) => onConfigChange('value', e.target.value)}
                        placeholder="12,450"
                      />
                    </div>
                  </div>
                </section>
                <section className="db-field-group">
                  <h4>Colors</h4>
                  <div className="db-group-grid">
                    <ColorGradientInput
                      idBase="kpi-color-value"
                      label="Value Color"
                      value={kpiOptions.value_color}
                      onChange={(next) => onKpiOptionChange('value_color', next)}
                    />
                    <ColorGradientInput
                      idBase="kpi-color-subtitle"
                      label="Subtitle Color"
                      value={kpiOptions.subtitle_color}
                      onChange={(next) => onKpiOptionChange('subtitle_color', next)}
                    />
                    <ColorGradientInput
                      idBase="kpi-color-trend"
                      label="Trend Color"
                      value={kpiOptions.trend_color}
                      onChange={(next) => onKpiOptionChange('trend_color', next)}
                    />
                    <ColorGradientInput
                      idBase="kpi-color-sparkline"
                      label="Sparkline Color"
                      value={kpiOptions.sparkline_color}
                      onChange={(next) => onKpiOptionChange('sparkline_color', next)}
                    />
                    <ColorGradientInput
                      idBase="kpi-color-bg"
                      label="Background"
                      value={kpiOptions.background_fill}
                      onChange={(next) => onKpiOptionChange('background_fill', next)}
                    />
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        ) : null}

        {draft.type === 'map' ? (
          <div className="space-y-3">
            {mapSettingsTab === 'basic' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Data Mapping</h4>
                  <div className="db-group-grid">
                    <div className="space-y-2 db-span-full">
                      <Label>Dataset</Label>
                      <div className="db-dataset-picker">
                        <InlineDatasetMenu datasets={datasets} onPick={applySelectedDataset} />
                        <div className="db-dataset-pill">
                          {selectedDataset ? selectedDataset.original_filename : 'None selected'}
                        </div>
                        {selectedDataset ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              onConfigChange('dataset_id', '');
                              onConfigChange('latitude_column', '');
                              onConfigChange('longitude_column', '');
                            }}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="widget-map-lat">Latitude Column</Label>
                      <select
                        id="widget-map-lat"
                        className="db-input"
                        value={draft.config?.latitude_column || ''}
                        onChange={(e) => onConfigChange('latitude_column', e.target.value)}
                      >
                        <option value="">Auto</option>
                        {columns.map((col) => (
                          <option key={`map-lat-${col}`} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="widget-map-lon">Longitude Column</Label>
                      <select
                        id="widget-map-lon"
                        className="db-input"
                        value={draft.config?.longitude_column || ''}
                        onChange={(e) => onConfigChange('longitude_column', e.target.value)}
                      >
                        <option value="">Auto</option>
                        {columns.map((col) => (
                          <option key={`map-lon-${col}`} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>
                <section className="db-field-group">
                  <h4>Layout</h4>
                  <div className="db-group-grid">
                    <div className="space-y-2">
                      <Label htmlFor="map-basic-w">Width (sections)</Label>
                      <Input
                        id="map-basic-w"
                        type="number"
                        min="1"
                        max={String(MAX_GRID_COLS)}
                        value={draft.w}
                        onChange={(e) => setDraft((prev) => ({ ...prev, w: clamp(e.target.value, 1, MAX_GRID_COLS) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="map-basic-h">Height (sections)</Label>
                      <Input
                        id="map-basic-h"
                        type="number"
                        min="1"
                        max={String(MAX_GRID_ROWS)}
                        value={draft.h}
                        onChange={(e) => setDraft((prev) => ({ ...prev, h: clamp(e.target.value, 1, MAX_GRID_ROWS) }))}
                      />
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
            {mapSettingsTab === 'advanced' ? (
              <div className="db-modal-advanced">
                <section className="db-field-group">
                  <h4>Map View</h4>
                  <div className="db-group-grid db-group-grid--three">
                    <div className="space-y-2">
                      <Label htmlFor="map-type-id">Map Type</Label>
                      <select id="map-type-id" className="db-input" value={mapOptions.map_type_id || 'terrain'} onChange={(e) => onMapOptionChange('map_type_id', e.target.value)}>
                        <option value="roadmap">Roadmap</option>
                        <option value="terrain">Terrain</option>
                        <option value="satellite">Satellite</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="map-zoom">Zoom</Label>
                      <Input id="map-zoom" type="number" min="0" max="22" value={mapOptions.zoom ?? 5} onChange={(e) => onMapOptionChange('zoom', Math.max(0, Math.min(22, Number(e.target.value) || 0)))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="map-min-zoom">Min Zoom</Label>
                      <Input id="map-min-zoom" type="number" min="0" max="22" value={mapOptions.min_zoom ?? 2} onChange={(e) => onMapOptionChange('min_zoom', Math.max(0, Math.min(22, Number(e.target.value) || 0)))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="map-max-zoom">Max Zoom</Label>
                      <Input id="map-max-zoom" type="number" min="0" max="22" value={mapOptions.max_zoom ?? 20} onChange={(e) => onMapOptionChange('max_zoom', Math.max(0, Math.min(22, Number(e.target.value) || 0)))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="map-tilt">Tilt</Label>
                      <Input id="map-tilt" type="number" min="0" max="67.5" step="0.5" value={mapOptions.tilt ?? 0} onChange={(e) => onMapOptionChange('tilt', Math.max(0, Number(e.target.value) || 0))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="map-heading">Heading</Label>
                      <Input id="map-heading" type="number" min="0" max="360" value={mapOptions.heading ?? 0} onChange={(e) => onMapOptionChange('heading', Math.max(0, Math.min(360, Number(e.target.value) || 0)))} />
                    </div>
                  </div>
                </section>
                <section className="db-field-group">
                  <h4>Center & Bounds</h4>
                  <div className="db-group-grid db-group-grid--three">
                    <label className="check">
                      <input type="checkbox" checked={Boolean(mapOptions.auto_fit_bounds)} onChange={(e) => onMapOptionChange('auto_fit_bounds', e.target.checked)} />
                      Auto-fit bounds to points
                    </label>
                    <div className="space-y-2">
                      <Label htmlFor="map-center-lat">Center Lat</Label>
                      <Input id="map-center-lat" type="number" step="0.000001" value={mapOptions.center_lat ?? 31.9686} onChange={(e) => onMapOptionChange('center_lat', Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="map-center-lng">Center Lng</Label>
                      <Input id="map-center-lng" type="number" step="0.000001" value={mapOptions.center_lng ?? -99.9018} onChange={(e) => onMapOptionChange('center_lng', Number(e.target.value) || 0)} />
                    </div>
                  </div>
                </section>
                <section className="db-field-group">
                  <h4>Interaction & Controls</h4>
                  <div className="db-group-grid db-group-grid--three">
                    <div className="space-y-2">
                      <Label htmlFor="map-gesture">Gesture Handling</Label>
                      <select id="map-gesture" className="db-input" value={mapOptions.gesture_handling || 'auto'} onChange={(e) => onMapOptionChange('gesture_handling', e.target.value)}>
                        <option value="auto">Auto</option>
                        <option value="greedy">Greedy</option>
                        <option value="cooperative">Cooperative</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                    <label className="check"><input type="checkbox" checked={Boolean(mapOptions.draggable)} onChange={(e) => onMapOptionChange('draggable', e.target.checked)} />Draggable</label>
                    <label className="check"><input type="checkbox" checked={Boolean(mapOptions.scrollwheel)} onChange={(e) => onMapOptionChange('scrollwheel', e.target.checked)} />Scroll Wheel Zoom</label>
                    <label className="check"><input type="checkbox" checked={Boolean(mapOptions.disable_default_ui)} onChange={(e) => onMapOptionChange('disable_default_ui', e.target.checked)} />Disable Default UI</label>
                    <label className="check"><input type="checkbox" checked={Boolean(mapOptions.zoom_control)} onChange={(e) => onMapOptionChange('zoom_control', e.target.checked)} />Zoom Control</label>
                    <label className="check"><input type="checkbox" checked={Boolean(mapOptions.map_type_control)} onChange={(e) => onMapOptionChange('map_type_control', e.target.checked)} />Map Type Control</label>
                    <label className="check"><input type="checkbox" checked={Boolean(mapOptions.street_view_control)} onChange={(e) => onMapOptionChange('street_view_control', e.target.checked)} />Street View Control</label>
                    <label className="check"><input type="checkbox" checked={Boolean(mapOptions.fullscreen_control)} onChange={(e) => onMapOptionChange('fullscreen_control', e.target.checked)} />Fullscreen Control</label>
                    <label className="check"><input type="checkbox" checked={Boolean(mapOptions.show_labels)} onChange={(e) => onMapOptionChange('show_labels', e.target.checked)} />Show Base Labels</label>
                  </div>
                </section>
                <section className="db-field-group">
                  <h4>Markers & Rendering</h4>
                  <div className="db-group-grid db-group-grid--three">
                    <div className="space-y-2">
                      <Label htmlFor="map-marker-shape">Marker Shape</Label>
                      <select
                        id="map-marker-shape"
                        className="db-input"
                        value={mapOptions.marker_shape || 'oil_rig'}
                        onChange={(e) => onMapOptionChange('marker_shape', e.target.value)}
                      >
                        <option value="oil_rig">Oil Rig</option>
                        <option value="pin">Pin</option>
                        <option value="circle">Circle</option>
                        <option value="square">Square</option>
                        <option value="diamond">Diamond</option>
                        <option value="triangle">Triangle</option>
                        <option value="star">Star</option>
                        <option value="car">Car</option>
                        <option value="human">Human</option>
                        <option value="truck">Truck</option>
                        <option value="home">Home</option>
                        <option value="hospital">Hospital</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="map-max-points">Max Render Points</Label>
                      <Input id="map-max-points" type="number" min="1" max="10000" value={mapOptions.max_render_points ?? 1200} onChange={(e) => onMapOptionChange('max_render_points', Math.max(1, Number(e.target.value) || 1))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="map-marker-size">Marker Size (px)</Label>
                      <Input id="map-marker-size" type="number" min="8" max="64" value={mapOptions.marker_size ?? 28} onChange={(e) => onMapOptionChange('marker_size', Math.max(8, Math.min(64, Number(e.target.value) || 28)))} />
                    </div>
                    <label className="check"><input type="checkbox" checked={Boolean(mapOptions.use_advanced_markers)} onChange={(e) => onMapOptionChange('use_advanced_markers', e.target.checked)} />Use Advanced Markers (needs Map ID)</label>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={onSubmit}>{mode === 'edit' ? 'Save Changes' : 'Add Widget'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function buildNewDraft(type = 'pie', lastDatasetId = '') {
  const baseConfig = { ...defaultConfigByType[type] };
  if (lastDatasetId && type !== 'section_header' && type !== 'h_spacer' && type !== 'v_spacer') {
    baseConfig.dataset_id = String(lastDatasetId);
  }
  return {
    id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title: type === 'section_header' ? '' : `${typeLabel[type] || 'Widget'}`,
    w: type === 'section_header' ? MAX_GRID_COLS : 2,
    h: 1,
    config: baseConfig,
  };
}

function buildNewDashboard(title = 'Dashboard 1') {
  return {
    id: `dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    widgets: [],
  };
}

function serializeDashboard(raw, index = 0) {
  const widgets = Array.isArray(raw?.widgets) ? raw.widgets.map(serializeWidget) : [];
  const fallback = `Dashboard ${index + 1}`;
  return {
    id: String(raw?.id || `dashboard-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`),
    title: String(raw?.title || fallback),
    widgets,
  };
}

function normalizeStoredDashboardState(raw) {
  if (Array.isArray(raw)) {
    const single = serializeDashboard({ title: 'Dashboard 1', widgets: raw }, 0);
    return {
      activeDashboardId: single.id,
      dashboards: [single],
    };
  }

  if (raw && typeof raw === 'object' && Array.isArray(raw.dashboards)) {
    const dashboards = raw.dashboards.map((item, index) => serializeDashboard(item, index)).filter(Boolean);
    if (!dashboards.length) {
      const fallback = buildNewDashboard('Dashboard 1');
      return { activeDashboardId: fallback.id, dashboards: [fallback] };
    }
    const activeDashboardId = dashboards.some((d) => d.id === raw.activeDashboardId)
      ? raw.activeDashboardId
      : dashboards[0].id;
    return { activeDashboardId, dashboards };
  }

  if (raw && typeof raw === 'object' && Array.isArray(raw.widgets)) {
    const single = serializeDashboard(raw, 0);
    return {
      activeDashboardId: single.id,
      dashboards: [single],
    };
  }

  const fallback = buildNewDashboard('Dashboard 1');
  return {
    activeDashboardId: fallback.id,
    dashboards: [fallback],
  };
}

function DashboardBuilder({ datasets, dashboardId: propDashboardId, onBack }) {
  const [dashboardState, setDashboardState] = useState(() => {
    const fallback = buildNewDashboard('Dashboard 1');
    return {
      activeDashboardId: fallback.id,
      dashboards: [fallback],
    };
  });

  const [draggingWidgetId, setDraggingWidgetId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [draftWidget, setDraftWidget] = useState(null);
  const [rowsByDataset, setRowsByDataset] = useState({});
  const [loadByDataset, setLoadByDataset] = useState({});
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteType, setConfirmDeleteType] = useState('');
  const [confirmDeleteTargetId, setConfirmDeleteTargetId] = useState('');
  const [confirmDeleteLabel, setConfirmDeleteLabel] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastDatasetId, setLastDatasetId] = useState(() => {
    try {
      return localStorage.getItem(LAST_DATASET_KEY) || '';
    } catch {
      return '';
    }
  });
  const [editingDashboardId, setEditingDashboardId] = useState('');
  const [editingDashboardTitle, setEditingDashboardTitle] = useState('');
  const [draggingDashboardId, setDraggingDashboardId] = useState('');
  const dashboardCardRef = useRef(null);

  const buildDraftWithRememberedDataset = (type = 'pie') => {
    const nextDraft = buildNewDraft(type, lastDatasetId);
    const remembered = (datasets || []).find((dataset) => String(dataset.dataset_id) === String(lastDatasetId || ''));
    if (!remembered) return nextDraft;

    const columnsFromDataset = remembered.columns || [];
    if (type === 'map') {
      nextDraft.config.latitude_column = getAutoLatColumn(columnsFromDataset);
      nextDraft.config.longitude_column = getAutoLonColumn(columnsFromDataset);
      return nextDraft;
    }
    if (type === 'treemap') {
      const hierarchyDefaults = columnsFromDataset.length ? [columnsFromDataset[0]] : [];
      nextDraft.config.treemap_hierarchy_dimensions = hierarchyDefaults;
      nextDraft.config.dimensions = hierarchyDefaults;
      nextDraft.config.metric = columnsFromDataset[1] || columnsFromDataset[0] || '';
      return nextDraft;
    }
    if (type !== 'section_header' && type !== 'h_spacer' && type !== 'v_spacer') {
      nextDraft.config.dimensions = columnsFromDataset.length ? [columnsFromDataset[0]] : [];
      nextDraft.config.metric = columnsFromDataset[1] || columnsFromDataset[0] || '';
    }
    return nextDraft;
  };

  useEffect(() => {
    const loadDashboards = async () => {
      try {
        const res = await fetch(`${API_BASE}/dashboards`);
        const data = await res.json();

        if (data.success && data.dashboards && data.dashboards.length > 0) {
          // API has dashboards - use them
          let activeId = data.dashboards.find((d) => d.is_active)?.id || data.dashboards[0].id;
          // If a specific dashboardId was passed via prop, use that
          if (propDashboardId) {
            activeId = propDashboardId;
          }
          const fromApi = {
            activeDashboardId: activeId,
            dashboards: data.dashboards.map((d) => ({
              id: d.id,
              title: d.name,
              ...d.config,
            })),
          };
          setDashboardState(fromApi);
          return;
        }

        // 2. API empty - try localStorage (legacy migration source)
        const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!saved) {
          // Both empty - if propDashboardId was passed but no data found, go back
          if (propDashboardId && onBack) {
            onBack();
            return;
          }
          const fallback = buildNewDashboard('Dashboard 1');
          setDashboardState({ activeDashboardId: fallback.id, dashboards: [fallback] });
          return;
        }

        // 3. Migrate from localStorage to API
        const parsed = JSON.parse(saved);
        const normalized = normalizeStoredDashboardState(parsed);
        const migrateRes = await fetch(`${API_BASE}/dashboards/migrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dashboards: normalized.dashboards,
            active_dashboard_id: normalized.activeDashboardId,
          }),
        });
        const migrateData = await migrateRes.json();

        if (migrateData.success && migrateData.migrated && migrateData.migrated.length > 0) {
          let activeId = migrateData.migrated.find((d) => d.is_active)?.id || migrateData.migrated[0].id;
          if (propDashboardId) {
            activeId = propDashboardId;
          }
          const migrated = {
            activeDashboardId: activeId,
            dashboards: migrateData.migrated.map((d) => ({
              id: d.id,
              title: d.name,
              ...d.config,
            })),
          };
          setDashboardState(migrated);
        } else {
          setDashboardState(normalizeStoredDashboardState(parsed));
        }
      } catch {
        try {
          const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
          if (saved) {
            setDashboardState(normalizeStoredDashboardState(JSON.parse(saved)));
          } else if (propDashboardId && onBack) {
            onBack();
            return;
          } else {
            const fallback = buildNewDashboard('Dashboard 1');
            setDashboardState({ activeDashboardId: fallback.id, dashboards: [fallback] });
          }
        } catch {
          if (propDashboardId && onBack) {
            onBack();
            return;
          }
          const fallback = buildNewDashboard('Dashboard 1');
          setDashboardState({ activeDashboardId: fallback.id, dashboards: [fallback] });
        }
      }
    };

    loadDashboards();
  }, [propDashboardId]);

  // Debounced save to API + localStorage backup
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Save to localStorage as backup
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboardState));

      // Save each dashboard to API
      const saveDashboard = async (dash) => {
        try {
          await fetch(`${API_BASE}/dashboards/${dash.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: dash.title, config: dash }),
          });
        } catch (e) {
          console.warn('Failed to save dashboard to API:', e);
        }
      };

      dashboards.forEach(saveDashboard);
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [dashboardState]);

  const dashboards = dashboardState.dashboards;
  const activeDashboard = useMemo(
    () => dashboards.find((dashboard) => dashboard.id === dashboardState.activeDashboardId) || dashboards[0] || null,
    [dashboards, dashboardState.activeDashboardId]
  );
  const widgets = activeDashboard?.widgets || [];

  const setWidgets = (updater) => {
    setDashboardState((prev) => ({
      ...prev,
      dashboards: prev.dashboards.map((dashboard) => {
        if (dashboard.id !== prev.activeDashboardId) return dashboard;
        const previousWidgets = Array.isArray(dashboard.widgets) ? dashboard.widgets : [];
        const nextWidgets = typeof updater === 'function' ? updater(previousWidgets) : updater;
        return { ...dashboard, widgets: Array.isArray(nextWidgets) ? nextWidgets : previousWidgets };
      }),
    }));
  };

  const beginEditDashboardTitle = (dashboardId, title) => {
    setEditingDashboardId(dashboardId);
    setEditingDashboardTitle(title || '');
  };

  const commitEditDashboardTitle = () => {
    if (!editingDashboardId) return;
    const nextTitle = (editingDashboardTitle || '').trim() || 'Untitled Dashboard';
    setDashboardState((prev) => ({
      ...prev,
      dashboards: prev.dashboards.map((dashboard) => (
        dashboard.id === editingDashboardId ? { ...dashboard, title: nextTitle } : dashboard
      )),
    }));
    setEditingDashboardId('');
    setEditingDashboardTitle('');
  };

  const cancelEditDashboardTitle = () => {
    setEditingDashboardId('');
    setEditingDashboardTitle('');
  };

  const createDashboardTab = () => {
    const nextIndex = dashboards.length + 1;
    const nextDashboard = buildNewDashboard(`Dashboard ${nextIndex}`);
    setDashboardState((prev) => {
      return {
        dashboards: [...prev.dashboards, nextDashboard],
        activeDashboardId: nextDashboard.id,
      };
    });
    beginEditDashboardTitle(nextDashboard.id, nextDashboard.title);
  };

  const removeDashboardTab = (dashboardId) => {
    setDashboardState((prev) => {
      if (prev.dashboards.length <= 1) return prev;
      const dashboardsWithout = prev.dashboards.filter((dashboard) => dashboard.id !== dashboardId);
      const nextActive = prev.activeDashboardId === dashboardId ? dashboardsWithout[0]?.id : prev.activeDashboardId;
      return {
        dashboards: dashboardsWithout,
        activeDashboardId: nextActive || dashboardsWithout[0]?.id || '',
      };
    });
  };

  const requestRemoveDashboardTab = (dashboardId, title) => {
    setConfirmDeleteType('dashboard');
    setConfirmDeleteTargetId(dashboardId);
    setConfirmDeleteLabel(title || 'this tab');
    setConfirmDeleteOpen(true);
  };

  useEffect(() => {
    const onDocumentPointerDown = (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.db-kebab-menu')) return;
      document.querySelectorAll('.db-kebab-menu[open]').forEach((node) => {
        node.open = false;
      });
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === dashboardCardRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const chartDatasetIds = useMemo(() => {
    const ids = widgets
      .filter((widget) => widget.type !== 'map')
      .map((widget) => String(widget.config?.dataset_id || '').trim())
      .filter(Boolean);
    return Array.from(new Set(ids));
  }, [widgets]);

  useEffect(() => {
    const missing = chartDatasetIds.filter((datasetId) => {
      const state = loadByDataset[datasetId];
      return !state || (!state.loading && !state.loaded);
    });

    if (!missing.length) return;

    missing.forEach((datasetId) => {
      const loadRows = async () => {
        setLoadByDataset((prev) => ({ ...prev, [datasetId]: { loading: true, loaded: false, error: '' } }));
        try {
          const startRes = await fetch(`${API_BASE}/prepare/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset_id: datasetId }),
          });
          const startBody = await startRes.json();
          if (!startRes.ok) throw new Error(startBody.detail || 'Failed to open dataset');

          const sessionId = startBody.session_id;
          const totalRows = Number(startBody.total_rows || 0);
          let offset = 0;
          let allRows = [];

          while (offset < MAX_FETCH_ROWS) {
            const tableRes = await fetch(`${API_BASE}/prepare/${sessionId}/table?limit=${PAGE_SIZE}&offset=${offset}`);
            const tableBody = await tableRes.json();
            if (!tableRes.ok) throw new Error(tableBody.detail || 'Failed to fetch dataset rows');

            const pageRows = Array.isArray(tableBody.rows) ? tableBody.rows : [];
            allRows = allRows.concat(pageRows);
            offset += pageRows.length;

            if (!pageRows.length) break;
            if (pageRows.length < PAGE_SIZE) break;
            if (totalRows && offset >= totalRows) break;
          }

          setRowsByDataset((prev) => ({ ...prev, [datasetId]: allRows }));
          setLoadByDataset((prev) => ({ ...prev, [datasetId]: { loading: false, loaded: true, error: '' } }));
        } catch (err) {
          setLoadByDataset((prev) => ({
            ...prev,
            [datasetId]: { loading: false, loaded: false, error: err.message || 'Failed to load dataset' },
          }));
        }
      };

      loadRows().catch(() => {});
    });
  }, [chartDatasetIds, loadByDataset]);

  const openCreateModal = () => {
    setModalMode('create');
    setDraftWidget(buildDraftWithRememberedDataset('pie'));
    setModalOpen(true);
  };

  const openEditModal = (widgetId) => {
    const target = widgets.find((item) => item.id === widgetId);
    if (!target) return;
    setModalMode('edit');
    setDraftWidget({ ...target, config: { ...(target.config || {}) } });
    setModalOpen(true);
  };

  const saveModal = () => {
    if (!draftWidget) return;
    const serialized = serializeWidget(draftWidget);
    rememberDatasetId(serialized?.config?.dataset_id);

    if (modalMode === 'edit') {
      setWidgets((prev) => prev.map((item) => (item.id === serialized.id ? serialized : item)));
    } else {
      setWidgets((prev) => [...prev, serialized]);
    }

    setModalOpen(false);
    setDraftWidget(null);
  };

  const removeWidget = (widgetId) => {
    setWidgets((prev) => prev.filter((widget) => widget.id !== widgetId));
  };

  const requestRemoveWidget = (widgetId, title) => {
    setConfirmDeleteType('widget');
    setConfirmDeleteTargetId(widgetId);
    setConfirmDeleteLabel(title || 'this chart');
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (confirmDeleteType === 'dashboard') {
      // Delete from API immediately, then remove from local state
      fetch(`${API_BASE}/dashboards/${confirmDeleteTargetId}`, { method: 'DELETE' }).catch((e) => {
        console.warn('Failed to delete dashboard from API:', e);
      });
      removeDashboardTab(confirmDeleteTargetId);
    } else if (confirmDeleteType === 'widget') {
      removeWidget(confirmDeleteTargetId);
    }
    setConfirmDeleteOpen(false);
    setConfirmDeleteType('');
    setConfirmDeleteTargetId('');
    setConfirmDeleteLabel('');
  };

  const copyWidget = (widgetId) => {
    setWidgets((prev) => {
      const sourceIndex = prev.findIndex((widget) => widget.id === widgetId);
      if (sourceIndex < 0) return prev;
      const source = prev[sourceIndex];
      const duplicate = serializeWidget({
        ...source,
        id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: source.type === 'section_header' ? '' : `${source.title} (Copy)`,
        config: { ...(source.config || {}) },
      });
      const next = [...prev];
      next.splice(sourceIndex + 1, 0, duplicate);
      return next;
    });
  };

  const moveWidgetToDashboard = (widgetId, targetDashboardId) => {
    setDashboardState((prev) => {
      if (!targetDashboardId) return prev;
      if (!prev.dashboards.some((dashboard) => dashboard.id === targetDashboardId)) return prev;

      let widgetToMove = null;
      const dashboardsWithoutWidget = prev.dashboards.map((dashboard) => {
        const existingWidgets = Array.isArray(dashboard.widgets) ? dashboard.widgets : [];
        const hit = existingWidgets.find((widget) => widget.id === widgetId);
        if (hit) widgetToMove = hit;
        return {
          ...dashboard,
          widgets: existingWidgets.filter((widget) => widget.id !== widgetId),
        };
      });

      if (!widgetToMove) return prev;

      return {
        ...prev,
        dashboards: dashboardsWithoutWidget.map((dashboard) => (
          dashboard.id === targetDashboardId
            ? { ...dashboard, widgets: [...dashboard.widgets, widgetToMove] }
            : dashboard
        )),
      };
    });
  };

  const onDragStart = (widgetId) => {
    setDraggingWidgetId(widgetId);
  };

  const onDropOnWidget = (targetWidgetId) => {
    if (!draggingWidgetId || draggingWidgetId === targetWidgetId) return;

    setWidgets((prev) => {
      const next = [...prev];
      const fromIndex = next.findIndex((item) => item.id === draggingWidgetId);
      const toIndex = next.findIndex((item) => item.id === targetWidgetId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [dragged] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, dragged);
      return next;
    });

    setDraggingWidgetId('');
  };

  const onDragEnd = () => {
    setDraggingWidgetId('');
  };

  const onDashboardTabDragStart = (dashboardId) => {
    setDraggingDashboardId(dashboardId);
  };

  const onDashboardTabDrop = (targetDashboardId) => {
    if (!draggingDashboardId || draggingDashboardId === targetDashboardId) return;
    setDashboardState((prev) => {
      const next = [...prev.dashboards];
      const fromIndex = next.findIndex((item) => item.id === draggingDashboardId);
      const toIndex = next.findIndex((item) => item.id === targetDashboardId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [dragged] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, dragged);
      return { ...prev, dashboards: next };
    });
    setDraggingDashboardId('');
  };

  const onDashboardTabDragEnd = () => {
    setDraggingDashboardId('');
  };

  function rememberDatasetId(datasetId) {
    const next = String(datasetId || '').trim();
    if (!next) return;
    setLastDatasetId(next);
    try {
      localStorage.setItem(LAST_DATASET_KEY, next);
    } catch {
      // ignore storage failures
    }
  }

  const toggleFullscreen = async () => {
    const target = dashboardCardRef.current;
    if (!target) return;
    try {
      if (document.fullscreenElement === target) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
        return;
      }
      if (!document.fullscreenElement) {
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        } else if (target.webkitRequestFullscreen) {
          target.webkitRequestFullscreen();
        }
      }
    } catch {
      // no-op when fullscreen is blocked by browser policies
    }
  };

  return (
    <div ref={dashboardCardRef} className={isFullscreen ? 'db-dashboard-fullscreen' : ''}>
    <Card>
      <CardContent>
        <div className="db-dashboard-toolbar">
          <div className="db-dashboard-row">
            {onBack ? (
              <button
                type="button"
                className="db-back-btn"
                onClick={onBack}
                title="Back to dashboards"
                aria-label="Back to dashboards"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
            ) : null}
            <div className="db-dashboard-tabs" role="tablist" aria-label="Dashboard tabs">
              {dashboards.map((dashboard) => {
                const isActive = dashboard.id === activeDashboard?.id;
                const isEditing = dashboard.id === editingDashboardId;
                return (
                  <div
                    key={dashboard.id}
                    className={`db-dashboard-tab-wrap ${isActive ? 'active' : ''} ${draggingDashboardId === dashboard.id ? 'dragging' : ''}`}
                    draggable={Boolean(isEditMode && !isEditing)}
                    onDragStart={() => {
                      if (!isEditMode || isEditing) return;
                      onDashboardTabDragStart(dashboard.id);
                    }}
                    onDragOver={(e) => {
                      if (!isEditMode || !draggingDashboardId) return;
                      e.preventDefault();
                    }}
                    onDrop={() => {
                      if (!isEditMode || !draggingDashboardId) return;
                      onDashboardTabDrop(dashboard.id);
                    }}
                    onDragEnd={onDashboardTabDragEnd}
                  >
                    {isEditing ? (
                      <Input
                        className="db-dashboard-tab-input"
                        value={editingDashboardTitle}
                        autoFocus
                        onChange={(e) => setEditingDashboardTitle(e.target.value)}
                        onBlur={commitEditDashboardTitle}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEditDashboardTitle();
                          if (e.key === 'Escape') cancelEditDashboardTitle();
                        }}
                      />
                    ) : (
                    <button
                      type="button"
                      className={`db-dashboard-tab ${isActive ? 'active' : ''}`}
                      onClick={() => setDashboardState((prev) => ({ ...prev, activeDashboardId: dashboard.id }))}
                      onDoubleClick={() => {
                        if (!isEditMode) return;
                        beginEditDashboardTitle(dashboard.id, dashboard.title);
                      }}
                    >
                      {dashboard.title || 'Untitled'}
                    </button>
                  )}
                  {isEditMode && dashboards.length > 1 ? (
                    <button
                      type="button"
                      className="db-dashboard-tab-close"
                      aria-label={`Delete ${dashboard.title || 'dashboard'} tab`}
                      onClick={() => requestRemoveDashboardTab(dashboard.id, dashboard.title)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            </div>
            <div className="db-header-actions">
              {isEditMode ? (
                <>
                  <Button type="button" onClick={openCreateModal}>
                    <Plus className="h-4 w-4" />
                    Add Graph
                  </Button>
                  <Button type="button" variant="outline" onClick={createDashboardTab}>
                    <Plus className="h-3.5 w-3.5" />
                    Add Tab
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditMode(false);
                      setDraggingWidgetId('');
                      cancelEditDashboardTitle();
                    }}
                  >
                    Close Edit Mode
                  </Button>
                </>
              ) : null}
              <Button type="button" variant="outline" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
              {!isEditMode ? (
              <details className="db-kebab-menu db-dashboard-kebab-menu">
                <summary className="db-kebab-trigger" aria-label="Dashboard actions">
                  <MoreVertical className="h-3.5 w-3.5" />
                </summary>
                <div className="db-kebab-panel">
                  <button
                    type="button"
                    className="db-kebab-item"
                    onClick={(event) => {
                      setIsEditMode(true);
                      setDraggingWidgetId('');
                      const details = event.currentTarget.closest('details');
                      if (details) details.open = false;
                    }}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </div>
              </details>
              ) : null}
            </div>
          </div>
        </div>

        {widgets.length ? (
          <div className="dashboard-grid-six">
            {widgets.map((widget) => (
              <section
                key={widget.id}
                className={`db-widget ${widget.type === 'section_header' ? 'db-widget--content-fit' : ''} ${draggingWidgetId === widget.id ? 'dragging' : ''}`}
                style={{
                  gridColumn: widget.type === 'section_header'
                    ? `span ${MAX_GRID_COLS}`
                    : `span ${clamp(widget.w, 1, MAX_GRID_COLS)}`,
                  gridRow: widget.type === 'section_header'
                    ? 'auto'
                    : `span ${clamp(widget.h, 1, MAX_GRID_ROWS) * GRID_SUBROWS_PER_SECTION}`,
                }}
                draggable={isEditMode}
                onDragStart={() => {
                  if (!isEditMode) return;
                  onDragStart(widget.id);
                }}
                onDragOver={(e) => {
                  if (!isEditMode) return;
                  e.preventDefault();
                }}
                onDrop={() => {
                  if (!isEditMode) return;
                  onDropOnWidget(widget.id);
                }}
                onDragEnd={() => {
                  if (!isEditMode) return;
                  onDragEnd();
                }}
              >
                <div className="db-widget-body">
                  <header className="db-widget-header">
                    <div className="db-widget-header-left">
                      {isEditMode ? <GripVertical className="h-4 w-4 text-slate-400 db-drag-handle" /> : null}
                      {widget.type === 'section_header' ? null : <h4>{widget.title}</h4>}
                    </div>

                    <div className="db-widget-actions">
                      {isEditMode ? (
                      <details className="db-kebab-menu">
                        <summary className="db-kebab-trigger" aria-label="Widget actions">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </summary>
                        <div className="db-kebab-panel">
                          <button
                            type="button"
                            className="db-kebab-item"
                            onClick={(event) => {
                              copyWidget(widget.id);
                              const details = event.currentTarget.closest('details');
                              if (details) details.open = false;
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </button>
                          <button
                            type="button"
                            className="db-kebab-item"
                            onClick={(event) => {
                              openEditModal(widget.id);
                              const details = event.currentTarget.closest('details');
                              if (details) details.open = false;
                            }}
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            className="db-kebab-item danger"
                            onClick={(event) => {
                              requestRemoveWidget(widget.id, widget.title);
                              const details = event.currentTarget.closest('details');
                              if (details) details.open = false;
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                          {dashboards.length > 1 ? (
                            <>
                              <div className="db-kebab-divider" />
                              <p className="db-kebab-label">Move To</p>
                              {dashboards
                                .filter((dashboard) => dashboard.id !== activeDashboard?.id)
                                .map((dashboard) => (
                                  <button
                                    key={`move-widget-${widget.id}-to-${dashboard.id}`}
                                    type="button"
                                    className="db-kebab-item"
                                    onClick={(event) => {
                                      moveWidgetToDashboard(widget.id, dashboard.id);
                                      const details = event.currentTarget.closest('details');
                                      if (details) details.open = false;
                                    }}
                                  >
                                    {dashboard.title || 'Untitled'}
                                  </button>
                                ))}
                            </>
                          ) : null}
                        </div>
                      </details>
                      ) : null}
                    </div>
                  </header>
                  <div className="db-widget-content">
                    <WidgetBody
                      widget={widget}
                      datasets={datasets}
                      rowsByDataset={rowsByDataset}
                      loadByDataset={loadByDataset}
                    />
                  </div>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="db-empty">
            <p>No dashboard widgets yet.</p>
            <p>Use Add Graph to create pie, timeline, bar, KPI, or map widgets.</p>
          </div>
        )}
      </CardContent>

      <DashboardWidgetModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setDraftWidget(null);
        }}
        mode={modalMode}
        draft={draftWidget}
        setDraft={setDraftWidget}
        onSubmit={saveModal}
        datasets={datasets}
        onRememberDataset={rememberDatasetId}
      />

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Warning</DialogTitle>
            <DialogDescription>
              You are about to delete this {confirmDeleteType === 'dashboard' ? 'tab' : 'chart'}: "{confirmDeleteLabel}".
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmDeleteOpen(false);
                setConfirmDeleteType('');
                setConfirmDeleteTargetId('');
                setConfirmDeleteLabel('');
              }}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
    </div>
  );
}

export default DashboardBuilder;
