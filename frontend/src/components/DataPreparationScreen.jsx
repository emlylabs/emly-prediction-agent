import { useEffect, useMemo, useRef, useState } from 'react';
import DataEditor, { GridCellKind } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { History, Redo2, Save, Undo2 } from 'lucide-react';
import DatasetExplorerModal from './DatasetExplorerModal';

const API_BASE = '/emly/api/prediction';
const PREP_PAGE_SIZE = 100;
const PREFETCH_BUFFER_ROWS = 50;
const APPLY_FUNCTION_OPTIONS = [
  { value: 'fill_missing', label: 'Fill Missing' },
  { value: 'drop_missing_rows', label: 'Drop Missing Rows' },
  { value: 'drop_duplicates', label: 'Drop Duplicates' },
  { value: 'delete_rows_condition', label: 'Delete Rows by Condition' },
  { value: 'sort_rows', label: 'Sort Rows' },
  { value: 'replace_values', label: 'Replace Values' },
  { value: 'split_column', label: 'Split Column' },
  { value: 'merge_columns', label: 'Merge Columns' },
  { value: 'derive_column', label: 'Custom Formula Column' },
  { value: 'group_aggregate', label: 'Group & Aggregate' },
  { value: 'trim_whitespace', label: 'Trim Whitespace' },
  { value: 'cast_column', label: 'Cast Column Type' },
  { value: 'bin_numeric_categories', label: 'Numeric to Categories' },
  { value: 'auto_binning', label: 'Auto Binning' },
  { value: 'unit_convert', label: 'Unit Conversion' },
  { value: 'min_max_scaling', label: 'Min-Max Scaling' },
  { value: 'max_absolute_scaling', label: 'Max Absolute Scaling' },
  { value: 'mean_normalization', label: 'Mean Normalization' },
  { value: 'unit_vector_scaling', label: 'Unit Vector Scaling' },
  { value: 'decimal_scaling', label: 'Decimal Scaling' },
  { value: 'z_score_scaling', label: 'Z-Score Scaling' },
  { value: 'robust_scaling', label: 'Robust Scaling' },
  { value: 'log_scaling', label: 'Log Scaling' },
  { value: 'quantile_transform', label: 'Quantile Transform' },
  { value: 'rename_column', label: 'Rename Column' },
  { value: 'delete_columns', label: 'Delete Columns' },
  { value: 'clip_values', label: 'Clip Numeric Values' },
  { value: 'remove_outliers_iqr', label: 'Handle Outliers' },
  { value: 'encode_categorical', label: 'Encode Categorical' },
  { value: 'normalize_text_case', label: 'Normalize Text Case' },
  { value: 'extract_date_part', label: 'Extract Date Part' },
  { value: 'date_diff_days', label: 'Date Difference (Days)' },
  { value: 'datetime_floor', label: 'Floor Datetime' },
  { value: 'shift_column', label: 'Shift Column' },
  { value: 'cyclical_encoding', label: 'Cyclical Encoding' },
  { value: 'significant_lags_kendall', label: 'Significant Lags (Kendall)' },
  { value: 'rolling_window_stats_nested', label: 'Nested Rolling Stats' },
  { value: 'math_add_scalar', label: 'Add Scalar' },
  { value: 'math_subtract_scalar', label: 'Subtract Scalar' },
  { value: 'math_multiply_scalar', label: 'Multiply by Scalar' },
  { value: 'math_divide_scalar', label: 'Divide by Scalar' },
  { value: 'math_power_scalar', label: 'Power by Scalar' },
  { value: 'math_abs', label: 'Absolute (abs)' },
  { value: 'math_sqrt', label: 'Square Root (sqrt)' },
  { value: 'math_log', label: 'Natural Log (log)' },
  { value: 'math_log10', label: 'Log10' },
  { value: 'math_exp', label: 'Exponent (exp)' },
  { value: 'math_round', label: 'Round' },
  { value: 'math_floor', label: 'Floor' },
  { value: 'math_ceil', label: 'Ceiling' },
  { value: 'math_negate', label: 'Negate' },
  { value: 'math_add_columns', label: 'Add Columns' },
  { value: 'math_subtract_columns', label: 'Subtract Columns' },
  { value: 'math_multiply_columns', label: 'Multiply Columns' },
  { value: 'math_divide_columns', label: 'Divide Columns' },
  { value: 'merge_datasets', label: 'Merge Datasets' },
  { value: 'stats_zscore', label: 'Z-Score' },
  { value: 'stats_percentile_rank', label: 'Percentile Rank' },
  { value: 'stats_rolling_mean', label: 'Rolling Mean' },
  { value: 'stats_variance', label: 'Variance' },
  { value: 'stats_std', label: 'Std Dev' },
];
const COLUMN_MENU_FUNCTIONS = [
  { value: 'fill_missing', label: 'Fill Missing', appliesTo: ['any'] },
  { value: 'sort_rows', label: 'Sort Rows', appliesTo: ['any'] },
  { value: 'delete_rows_condition', label: 'Delete Rows by Condition', appliesTo: ['any'] },
  { value: 'replace_values', label: 'Replace Values', appliesTo: ['any'] },
  { value: 'split_column', label: 'Split Column', appliesTo: ['text'] },
  { value: 'trim_whitespace', label: 'Trim Whitespace', appliesTo: ['text'] },
  { value: 'cast_column', label: 'Cast Column Type', appliesTo: ['any'] },
  { value: 'bin_numeric_categories', label: 'Numeric to Categories', appliesTo: ['numeric'] },
  { value: 'auto_binning', label: 'Auto Binning', appliesTo: ['numeric'] },
  { value: 'unit_convert', label: 'Unit Conversion', appliesTo: ['numeric'] },
  { value: 'min_max_scaling', label: 'Min-Max Scaling', appliesTo: ['numeric'] },
  { value: 'max_absolute_scaling', label: 'Max Absolute Scaling', appliesTo: ['numeric'] },
  { value: 'mean_normalization', label: 'Mean Normalization', appliesTo: ['numeric'] },
  { value: 'unit_vector_scaling', label: 'Unit Vector Scaling', appliesTo: ['numeric'] },
  { value: 'decimal_scaling', label: 'Decimal Scaling', appliesTo: ['numeric'] },
  { value: 'z_score_scaling', label: 'Z-Score Scaling', appliesTo: ['numeric'] },
  { value: 'robust_scaling', label: 'Robust Scaling', appliesTo: ['numeric'] },
  { value: 'log_scaling', label: 'Log Scaling', appliesTo: ['numeric'] },
  { value: 'quantile_transform', label: 'Quantile Transform', appliesTo: ['numeric'] },
  { value: 'rename_column', label: 'Rename Column', appliesTo: ['any'] },
  { value: 'clip_values', label: 'Clip Numeric Values', appliesTo: ['numeric'] },
  { value: 'remove_outliers_iqr', label: 'Handle Outliers', appliesTo: ['numeric'] },
  { value: 'encode_categorical', label: 'Encode Categorical', appliesTo: ['text', 'boolean'] },
  { value: 'normalize_text_case', label: 'Normalize Text Case', appliesTo: ['text'] },
  { value: 'extract_date_part', label: 'Extract Date Part', appliesTo: ['datetime'] },
  { value: 'date_diff_days', label: 'Date Difference (Days)', appliesTo: ['datetime'] },
  { value: 'datetime_floor', label: 'Floor Datetime', appliesTo: ['datetime'] },
  { value: 'shift_column', label: 'Shift Column', appliesTo: ['any'] },
  { value: 'cyclical_encoding', label: 'Cyclical Encoding', appliesTo: ['numeric', 'datetime'] },
  { value: 'significant_lags_kendall', label: 'Significant Lags (Kendall)', appliesTo: ['numeric'] },
  { value: 'rolling_window_stats_nested', label: 'Nested Rolling Stats', appliesTo: ['numeric'] },
  { value: 'math_add_scalar', label: 'Add Scalar', appliesTo: ['numeric'] },
  { value: 'math_subtract_scalar', label: 'Subtract Scalar', appliesTo: ['numeric'] },
  { value: 'math_multiply_scalar', label: 'Multiply by Scalar', appliesTo: ['numeric'] },
  { value: 'math_divide_scalar', label: 'Divide by Scalar', appliesTo: ['numeric'] },
  { value: 'math_power_scalar', label: 'Power by Scalar', appliesTo: ['numeric'] },
  { value: 'math_abs', label: 'Absolute (abs)', appliesTo: ['numeric'] },
  { value: 'math_sqrt', label: 'Square Root (sqrt)', appliesTo: ['numeric'] },
  { value: 'math_log', label: 'Natural Log (log)', appliesTo: ['numeric'] },
  { value: 'math_log10', label: 'Log10', appliesTo: ['numeric'] },
  { value: 'math_exp', label: 'Exponent (exp)', appliesTo: ['numeric'] },
  { value: 'math_round', label: 'Round', appliesTo: ['numeric'] },
  { value: 'math_floor', label: 'Floor', appliesTo: ['numeric'] },
  { value: 'math_ceil', label: 'Ceiling', appliesTo: ['numeric'] },
  { value: 'math_negate', label: 'Negate', appliesTo: ['numeric'] },
  { value: 'stats_zscore', label: 'Z-Score', appliesTo: ['numeric'] },
  { value: 'stats_percentile_rank', label: 'Percentile Rank', appliesTo: ['numeric'] },
  { value: 'stats_rolling_mean', label: 'Rolling Mean', appliesTo: ['numeric'] },
  { value: 'stats_variance', label: 'Variance', appliesTo: ['numeric'] },
  { value: 'stats_std', label: 'Std Dev', appliesTo: ['numeric'] },
];
const MATH_SCALAR_OPS = {
  math_add_scalar: 'add',
  math_subtract_scalar: 'subtract',
  math_multiply_scalar: 'multiply',
  math_divide_scalar: 'divide',
  math_power_scalar: 'power',
};
const MATH_UNARY_OPS = {
  math_abs: 'abs',
  math_sqrt: 'sqrt',
  math_log: 'log',
  math_log10: 'log10',
  math_exp: 'exp',
  math_round: 'round',
  math_floor: 'floor',
  math_ceil: 'ceil',
  math_negate: 'negate',
};
const MATH_BETWEEN_COLUMNS_OPS = {
  math_add_columns: 'add',
  math_subtract_columns: 'subtract',
  math_multiply_columns: 'multiply',
  math_divide_columns: 'divide',
};
const formatCheckpointTimestamp = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};
const MATH_SINGLE_COLUMN_OPS = [...Object.keys(MATH_SCALAR_OPS), ...Object.keys(MATH_UNARY_OPS)];
const MATH_BETWEEN_COLUMN_KEYS = Object.keys(MATH_BETWEEN_COLUMNS_OPS);
const MATH_SCALAR_KEYS = Object.keys(MATH_SCALAR_OPS);
const MATH_UNARY_KEYS = Object.keys(MATH_UNARY_OPS);
const ROLLING_STATS_OPTIONS = ['mean', 'std', 'kurt', 'min', 'max', 'median', 'var', 'skew', 'slope'];
const APPLY_FUNCTION_GROUPS = [
  { label: 'Core', values: ['fill_missing', 'drop_missing_rows', 'drop_duplicates', 'delete_rows_condition', 'sort_rows', 'replace_values', 'split_column', 'merge_columns', 'derive_column', 'group_aggregate', 'trim_whitespace', 'cast_column', 'bin_numeric_categories', 'unit_convert', 'rename_column', 'delete_columns', 'clip_values', 'remove_outliers_iqr', 'encode_categorical', 'normalize_text_case', 'extract_date_part', 'date_diff_days', 'datetime_floor', 'merge_datasets'] },
  { label: 'Binning', values: ['auto_binning'] },
  { label: 'Temporal', values: ['shift_column', 'cyclical_encoding', 'significant_lags_kendall', 'rolling_window_stats_nested'] },
  { label: 'Normalization', values: ['min_max_scaling', 'max_absolute_scaling', 'mean_normalization', 'unit_vector_scaling', 'decimal_scaling'] },
  { label: 'Standardization', values: ['z_score_scaling', 'robust_scaling'] },
  { label: 'Non-Linear', values: ['log_scaling', 'quantile_transform'] },
  { label: 'Math', values: [...Object.keys(MATH_SCALAR_OPS), ...Object.keys(MATH_UNARY_OPS), ...Object.keys(MATH_BETWEEN_COLUMNS_OPS)] },
  { label: 'Stats', values: ['stats_zscore', 'stats_percentile_rank', 'stats_rolling_mean', 'stats_variance', 'stats_std'] },
];
const UNIT_CONVERSION_OPTIONS = {
  length: [
    { value: 'mm', label: 'Millimeter (mm)' },
    { value: 'cm', label: 'Centimeter (cm)' },
    { value: 'm', label: 'Meter (m)' },
    { value: 'km', label: 'Kilometer (km)' },
    { value: 'in', label: 'Inch (in)' },
    { value: 'ft', label: 'Foot (ft)' },
    { value: 'yd', label: 'Yard (yd)' },
    { value: 'mi', label: 'Mile (mi)' },
    { value: 'nmi', label: 'Nautical Mile (nmi)' },
  ],
  mass: [
    { value: 'mg', label: 'Milligram (mg)' },
    { value: 'g', label: 'Gram (g)' },
    { value: 'kg', label: 'Kilogram (kg)' },
    { value: 't', label: 'Metric Ton (t)' },
    { value: 'lb', label: 'Pound (lb)' },
    { value: 'oz', label: 'Ounce (oz)' },
    { value: 'stone', label: 'Stone' },
  ],
  temperature: [
    { value: 'c', label: 'Celsius (C)' },
    { value: 'f', label: 'Fahrenheit (F)' },
    { value: 'k', label: 'Kelvin (K)' },
  ],
  time: [
    { value: 'ms', label: 'Millisecond (ms)' },
    { value: 's', label: 'Second (s)' },
    { value: 'min', label: 'Minute (min)' },
    { value: 'h', label: 'Hour (h)' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
  ],
  volume: [
    { value: 'ml', label: 'Milliliter (ml)' },
    { value: 'l', label: 'Liter (L)' },
    { value: 'm3', label: 'Cubic Meter (m3)' },
    { value: 'tsp_us', label: 'US Teaspoon' },
    { value: 'tbsp_us', label: 'US Tablespoon' },
    { value: 'floz_us', label: 'US Fluid Ounce' },
    { value: 'cup_us', label: 'US Cup' },
    { value: 'pt_us', label: 'US Pint' },
    { value: 'qt_us', label: 'US Quart' },
    { value: 'gal_us', label: 'US Gallon' },
    { value: 'gal_imp', label: 'Imperial Gallon' },
  ],
  area: [
    { value: 'mm2', label: 'Square Millimeter (mm2)' },
    { value: 'cm2', label: 'Square Centimeter (cm2)' },
    { value: 'm2', label: 'Square Meter (m2)' },
    { value: 'km2', label: 'Square Kilometer (km2)' },
    { value: 'in2', label: 'Square Inch (in2)' },
    { value: 'ft2', label: 'Square Foot (ft2)' },
    { value: 'yd2', label: 'Square Yard (yd2)' },
    { value: 'acre', label: 'Acre' },
    { value: 'ha', label: 'Hectare' },
    { value: 'mi2', label: 'Square Mile (mi2)' },
  ],
  speed: [
    { value: 'mps', label: 'Meter/Second (m/s)' },
    { value: 'kmh', label: 'Kilometer/Hour (km/h)' },
    { value: 'mph', label: 'Mile/Hour (mph)' },
    { value: 'knot', label: 'Knot' },
    { value: 'fps', label: 'Foot/Second (ft/s)' },
  ],
  pressure: [
    { value: 'pa', label: 'Pascal (Pa)' },
    { value: 'kpa', label: 'Kilopascal (kPa)' },
    { value: 'mpa', label: 'Megapascal (MPa)' },
    { value: 'bar', label: 'Bar' },
    { value: 'mbar', label: 'Millibar (mbar)' },
    { value: 'psi', label: 'PSI' },
    { value: 'mmhg', label: 'mmHg' },
    { value: 'inhg', label: 'inHg' },
    { value: 'atm', label: 'Atmosphere (atm)' },
  ],
  energy: [
    { value: 'j', label: 'Joule (J)' },
    { value: 'kj', label: 'Kilojoule (kJ)' },
    { value: 'cal', label: 'Calorie (cal)' },
    { value: 'kcal', label: 'Kilocalorie (kcal)' },
    { value: 'wh', label: 'Watt-hour (Wh)' },
    { value: 'kwh', label: 'Kilowatt-hour (kWh)' },
    { value: 'btu', label: 'BTU' },
  ],
};
const FUNCTION_DOCS = {
  fill_missing: { summary: 'Fill null/empty values using a strategy like constant, mean, median, mode, forward, or backward fill.', keywords: ['null', 'na', 'impute', 'missing'] },
  drop_missing_rows: { summary: 'Remove rows that contain missing values, for any selected column set or only when all are missing.', keywords: ['null', 'na', 'remove rows'] },
  drop_duplicates: { summary: 'Remove duplicate rows using all columns or a selected subset of columns.', keywords: ['deduplicate', 'unique', 'distinct'] },
  delete_rows_condition: { summary: 'Delete rows where a selected column matches a condition such as equals, contains, range comparisons, or null checks.', keywords: ['delete rows', 'filter rows', 'condition'] },
  sort_rows: { summary: 'Sort dataset rows by the selected column in ascending or descending order.', keywords: ['order', 'ascending', 'descending'] },
  replace_values: { summary: 'Find and replace matching values in a column or across all columns, with optional regex and case sensitivity.', keywords: ['substitute', 'regex', 'find and replace'] },
  split_column: { summary: 'Split one text column into multiple columns using a delimiter and optional max split.', keywords: ['delimiter', 'tokenize', 'parse'] },
  merge_columns: { summary: 'Combine multiple columns into a single column with a configurable separator.', keywords: ['concat', 'combine', 'join text'] },
  derive_column: { summary: 'Create a new column using a custom pandas expression based on existing columns.', keywords: ['formula', 'expression', 'calculated field'] },
  group_aggregate: { summary: 'Group rows by selected columns and compute aggregate metrics like count, sum, mean, or max.', keywords: ['group by', 'aggregation', 'summarize'] },
  trim_whitespace: { summary: 'Remove leading and trailing spaces from text values.', keywords: ['strip', 'spaces', 'cleanup text'] },
  cast_column: { summary: 'Convert a column to another data type such as numeric, string, datetime, or boolean.', keywords: ['type conversion', 'dtype', 'convert'] },
  bin_numeric_categories: { summary: 'Convert numeric values into named categories using custom ranges (for example, 0-3:toddler).', keywords: ['binning', 'bucketing', 'categorization', 'age groups'] },
  auto_binning: { summary: 'Automatically bin numeric data using equal-width, equal-frequency, k-means, Jenks natural breaks, decision tree, ChiMerge, MDLP, or domain thresholds.', keywords: ['auto binning', 'discretization', 'jenks', 'chimerge', 'mdlp', 'decision tree'] },
  unit_convert: { summary: 'Convert numeric values between units (length, mass, temperature, area, volume, speed, pressure, energy, and time).', keywords: ['unit conversion', 'measurement', 'temperature', 'metric', 'imperial'] },
  min_max_scaling: { summary: 'Scale values using (x - min) / (max - min) to map them into [0, 1].', keywords: ['normalization', 'range scaling', '0-1'] },
  max_absolute_scaling: { summary: 'Scale values by dividing each value by the maximum absolute value.', keywords: ['normalization', 'max abs', 'sparse-safe'] },
  mean_normalization: { summary: 'Center and scale using (x - mean) / (max - min).', keywords: ['normalization', 'mean centered', 'range'] },
  unit_vector_scaling: { summary: 'Scale column values so the column vector has unit L2 norm.', keywords: ['normalization', 'unit norm', 'cosine similarity'] },
  decimal_scaling: { summary: 'Scale values by moving the decimal point: x / 10^j based on max absolute value.', keywords: ['normalization', 'decimal scaling'] },
  z_score_scaling: { summary: 'Standardize values using (x - mean) / std.', keywords: ['standardization', 'z-score', 'gaussian'] },
  robust_scaling: { summary: 'Standardize using robust statistics: (x - median) / IQR.', keywords: ['standardization', 'robust', 'outliers'] },
  log_scaling: { summary: 'Apply logarithmic transform to reduce skew and heavy tails.', keywords: ['non-linear', 'log transform', 'skew'] },
  quantile_transform: { summary: 'Map values to a target distribution (uniform or normal) using quantiles.', keywords: ['non-parametric', 'quantile', 'distribution mapping'] },
  rename_column: { summary: 'Rename the selected column while keeping its data unchanged.', keywords: ['column name', 'alias'] },
  delete_columns: { summary: 'Delete multiple selected columns in one operation.', keywords: ['drop columns', 'remove columns', 'schema cleanup'] },
  clip_values: { summary: 'Limit numeric values to min/max bounds by clipping out-of-range values.', keywords: ['cap', 'bounds', 'winsorize'] },
  remove_outliers_iqr: { summary: 'Handle outliers using Box Plot (IQR) or Z-Score method by dropping outlier rows or clipping to calculated bounds.', keywords: ['outlier', 'iqr', 'box plot', 'z-score', 'anomaly'] },
  encode_categorical: { summary: 'Encode categorical values using label encoding or one-hot encoding.', keywords: ['categorical', 'dummy', 'label encoding'] },
  normalize_text_case: { summary: 'Normalize text letter case to lower, upper, or title case.', keywords: ['uppercase', 'lowercase', 'title'] },
  extract_date_part: { summary: 'Extract a date component (year, month, week, day, hour, etc.) into a new column.', keywords: ['datetime', 'year', 'month', 'feature extraction'] },
  date_diff_days: { summary: 'Compute day difference between a date column and a reference date or another date column.', keywords: ['datediff', 'days between', 'duration'] },
  datetime_floor: { summary: 'Floor datetime values to a coarser granularity such as day, week, month, hour, or minute.', keywords: ['truncate time', 'bucket', 'round down date'] },
  shift_column: { summary: 'Shift column values up or down by a number of rows to create lead/lag style features.', keywords: ['shift', 'lead', 'lag', 'row offset'] },
  cyclical_encoding: { summary: 'Encode cyclical features into sine/cosine pairs (for example hour of day or day of week).', keywords: ['time encoding', 'sine', 'cosine', 'cyclical'] },
  significant_lags_kendall: { summary: 'Automatically discover statistically significant lag steps using Kendall’s tau, then create lagged feature columns.', keywords: ['lag features', 'kendall tau', 'temporal dependencies'] },
  rolling_window_stats_nested: { summary: 'Create nested rolling-window statistics (mean, std, kurtosis, etc.) across multiple window sizes.', keywords: ['rolling window', 'moving stats', 'short-term', 'long-term'] },
  math_add_scalar: { summary: 'Add a constant scalar value to each value in the selected numeric column.', keywords: ['plus', 'offset', 'increment'] },
  math_subtract_scalar: { summary: 'Subtract a constant scalar value from each value in the selected numeric column.', keywords: ['minus', 'decrement'] },
  math_multiply_scalar: { summary: 'Multiply each value in the selected numeric column by a scalar.', keywords: ['scale', 'factor', 'product'] },
  math_divide_scalar: { summary: 'Divide each value in the selected numeric column by a scalar.', keywords: ['ratio', 'normalize'] },
  math_power_scalar: { summary: 'Raise each value in the selected numeric column to a scalar power.', keywords: ['exponent', 'power'] },
  math_abs: { summary: 'Convert values in the selected numeric column to their absolute values.', keywords: ['absolute', 'magnitude', 'positive'] },
  math_sqrt: { summary: 'Apply square root to values in the selected numeric column.', keywords: ['root', 'sqrt'] },
  math_log: { summary: 'Apply natural logarithm (ln) to values in the selected numeric column.', keywords: ['ln', 'logarithm'] },
  math_log10: { summary: 'Apply base-10 logarithm to values in the selected numeric column.', keywords: ['log10', 'decadic log'] },
  math_exp: { summary: 'Apply exponential (e^x) to values in the selected numeric column.', keywords: ['exponent', 'e power'] },
  math_round: { summary: 'Round values in the selected numeric column to a specified number of decimals.', keywords: ['precision', 'decimals', 'rounding'] },
  math_floor: { summary: 'Round numeric values down to the nearest lower integer.', keywords: ['round down', 'integer'] },
  math_ceil: { summary: 'Round numeric values up to the nearest higher integer.', keywords: ['ceiling', 'round up', 'integer'] },
  math_negate: { summary: 'Multiply values by -1 to invert sign in the selected numeric column.', keywords: ['negative', 'sign flip'] },
  math_add_columns: { summary: 'Create a new column by adding two numeric columns row-by-row.', keywords: ['column arithmetic', 'sum columns'] },
  math_subtract_columns: { summary: 'Create a new column by subtracting one numeric column from another row-by-row.', keywords: ['difference', 'column arithmetic'] },
  math_multiply_columns: { summary: 'Create a new column by multiplying two numeric columns row-by-row.', keywords: ['product', 'column arithmetic'] },
  math_divide_columns: { summary: 'Create a new column by dividing one numeric column by another row-by-row.', keywords: ['ratio', 'column arithmetic'] },
  merge_datasets: { summary: 'Combine the active dataset with another dataset using append or key-based joins.', keywords: ['append', 'join', 'merge'] },
  stats_zscore: { summary: 'Create a z-score standardized column using (value - mean) / std.', keywords: ['standardize', 'normalization', 'z score'] },
  stats_percentile_rank: { summary: 'Create a percentile-rank column showing each value’s relative standing from 0 to 1.', keywords: ['percentile', 'rank', 'distribution'] },
  stats_rolling_mean: { summary: 'Create a rolling mean column using a sliding window over the selected numeric column.', keywords: ['moving average', 'window', 'smoothing'] },
  stats_variance: { summary: 'Create a column containing the variance statistic for the selected numeric column.', keywords: ['dispersion', 'spread'] },
  stats_std: { summary: 'Create a column containing the standard deviation statistic for the selected numeric column.', keywords: ['std', 'dispersion', 'spread'] },
  stats_mean: { summary: 'Create a column containing the mean (average) of the selected numeric column.', keywords: ['average', 'central tendency'] },
  stats_median: { summary: 'Create a column containing the median (50th percentile) of the selected numeric column.', keywords: ['p50', 'central tendency'] },
  stats_mode: { summary: 'Create a column containing the most frequent value in the selected column.', keywords: ['most frequent', 'mode value'] },
  stats_min: { summary: 'Create a column containing the minimum value of the selected numeric column.', keywords: ['smallest', 'lower bound'] },
  stats_max: { summary: 'Create a column containing the maximum value of the selected numeric column.', keywords: ['largest', 'upper bound'] },
  stats_sum: { summary: 'Create a column containing the sum of all values in the selected numeric column.', keywords: ['total', 'sum'] },
};
const DOCUMENTED_OPERATION_LABELS = Object.fromEntries(APPLY_FUNCTION_OPTIONS.map((item) => [item.value, item.label]));

const getFunctionParameters = (op) => {
  if (op === 'fill_missing') return [
    { name: 'column', required: false, description: 'Target column. Leave empty to apply to all compatible columns.' },
    { name: 'strategy', required: true, description: 'Fill strategy: value, mean, median, mode, ffill, bfill.' },
    { name: 'value', required: false, description: 'Used only when strategy is "value".' },
  ];
  if (op === 'drop_missing_rows') return [
    { name: 'subset', required: false, description: 'Columns to check for missing values.' },
    { name: 'how', required: true, description: 'Rule: any or all missing values in subset.' },
  ];
  if (op === 'drop_duplicates') return [
    { name: 'subset', required: false, description: 'Columns used to determine duplicates.' },
  ];
  if (op === 'sort_rows') return [
    { name: 'column', required: true, description: 'Column used for sorting.' },
    { name: 'ascending', required: true, description: 'Sort direction: true (asc) or false (desc).' },
  ];
  if (op === 'delete_rows_condition') return [
    { name: 'column', required: true, description: 'Column used for matching rows to delete.' },
    { name: 'condition', required: true, description: 'Match operator: eq, ne, gt, gte, lt, lte, contains, starts_with, ends_with, is_null, is_not_null.' },
    { name: 'value', required: false, description: 'Condition value (not required for is_null/is_not_null).' },
    { name: 'case_sensitive', required: false, description: 'For text operators, control case-sensitive matching.' },
  ];
  if (op === 'replace_values') return [
    { name: 'column', required: false, description: 'Target column. Leave empty for all columns.' },
    { name: 'find', required: true, description: 'Value or pattern to find.' },
    { name: 'replace', required: true, description: 'Replacement value.' },
    { name: 'regex', required: false, description: 'Treat "find" as regex if true.' },
    { name: 'case_sensitive', required: false, description: 'Case-sensitive matching toggle.' },
  ];
  if (op === 'split_column') return [
    { name: 'column', required: true, description: 'Text column to split.' },
    { name: 'delimiter', required: true, description: 'Delimiter used to split text.' },
    { name: 'maxsplit', required: false, description: 'Maximum number of splits.' },
    { name: 'new_columns', required: false, description: 'Comma-separated output column names.' },
    { name: 'drop_original', required: false, description: 'Remove source column after split.' },
  ];
  if (op === 'merge_columns') return [
    { name: 'columns', required: true, description: 'Source columns to combine.' },
    { name: 'new_name', required: true, description: 'Name for merged output column.' },
    { name: 'separator', required: false, description: 'Text inserted between joined values.' },
    { name: 'skip_null', required: false, description: 'Skip null/empty values while merging.' },
    { name: 'drop_source', required: false, description: 'Drop source columns after merge.' },
  ];
  if (op === 'derive_column') return [
    { name: 'new_name', required: true, description: 'Name of derived column.' },
    { name: 'expression', required: true, description: 'Pandas eval expression using existing columns.' },
  ];
  if (op === 'group_aggregate') return [
    { name: 'group_by', required: true, description: 'Columns used as group keys.' },
    { name: 'aggregations', required: true, description: 'Aggregate definitions: column + func + optional alias.' },
  ];
  if (op === 'trim_whitespace') return [
    { name: 'column', required: false, description: 'Target text column. Leave empty for all text columns.' },
  ];
  if (op === 'cast_column') return [
    { name: 'column', required: true, description: 'Source column.' },
    { name: 'dtype', required: true, description: 'Target data type (numeric/string/datetime/boolean).' },
  ];
  if (op === 'bin_numeric_categories') return [
    { name: 'column', required: true, description: 'Numeric source column.' },
    { name: 'rules_text', required: true, description: 'One rule per line. Supported: min-max:label, <x:label, <=x:label, >x:label, >=x:label.' },
    { name: 'default_label', required: false, description: 'Optional category for non-matching numeric values.' },
    { name: 'new_name', required: false, description: 'Optional output column name.' },
  ];
  if (op === 'auto_binning') return [
    { name: 'column', required: true, description: 'Numeric source column.' },
    { name: 'method', required: true, description: 'equal_width, equal_frequency, kmeans, jenks, decision_tree, chimerge, mdlp, domain_threshold.' },
    { name: 'bins', required: false, description: 'Target number of bins for methods that use bin count.' },
    { name: 'target_column', required: false, description: 'Required for supervised methods: decision_tree, chimerge, mdlp.' },
    { name: 'thresholds', required: false, description: 'Comma-separated threshold list for domain_threshold (for example: 3,10,18).' },
    { name: 'labels', required: false, description: 'Optional comma-separated labels for domain_threshold; count must be thresholds+1.' },
    { name: 'chi2_threshold', required: false, description: 'Chi-square merge threshold for chimerge.' },
    { name: 'new_name', required: false, description: 'Optional output column name.' },
  ];
  if (op === 'unit_convert') return [
    { name: 'column', required: true, description: 'Numeric source column.' },
    { name: 'category', required: false, description: 'Unit family: length, mass, temperature, time, volume, area, speed, pressure, energy.' },
    { name: 'from_unit', required: true, description: 'Current unit of source values.' },
    { name: 'to_unit', required: true, description: 'Target unit to convert into.' },
    { name: 'overwrite', required: false, description: 'If true and new_name is blank, overwrite source column.' },
    { name: 'new_name', required: false, description: 'Optional output column name.' },
  ];
  if (['min_max_scaling', 'max_absolute_scaling', 'mean_normalization', 'unit_vector_scaling', 'decimal_scaling', 'z_score_scaling', 'robust_scaling'].includes(op)) return [
    { name: 'column', required: true, description: 'Numeric source column.' },
    { name: 'new_name', required: false, description: 'Optional output column name. Defaults to an auto-generated name.' },
  ];
  if (op === 'log_scaling') return [
    { name: 'column', required: true, description: 'Numeric source column.' },
    { name: 'base', required: false, description: 'Log base: e, 10, or 2.' },
    { name: 'shift_mode', required: false, description: 'auto or custom shift before log.' },
    { name: 'shift', required: false, description: 'Custom shift value when shift_mode=custom.' },
    { name: 'new_name', required: false, description: 'Optional output column name.' },
  ];
  if (op === 'quantile_transform') return [
    { name: 'column', required: true, description: 'Numeric source column.' },
    { name: 'output_distribution', required: false, description: 'uniform or normal.' },
    { name: 'n_quantiles', required: false, description: 'Number of quantiles used for mapping.' },
    { name: 'new_name', required: false, description: 'Optional output column name.' },
  ];
  if (op === 'rename_column') return [
    { name: 'column', required: true, description: 'Current column name.' },
    { name: 'new_name', required: true, description: 'New column name.' },
  ];
  if (op === 'delete_columns') return [
    { name: 'columns', required: true, description: 'List of columns to delete. At least one must be selected and dataset must retain at least one column.' },
  ];
  if (op === 'clip_values') return [
    { name: 'column', required: true, description: 'Numeric column to clip.' },
    { name: 'min', required: false, description: 'Lower clip bound.' },
    { name: 'max', required: false, description: 'Upper clip bound.' },
  ];
  if (op === 'remove_outliers_iqr') return [
    { name: 'column', required: true, description: 'Numeric column to inspect.' },
    { name: 'method', required: false, description: 'Outlier method: iqr/box_plot or zscore.' },
    { name: 'factor', required: false, description: 'IQR multiplier used for lower/upper bounds (IQR method).' },
    { name: 'z_threshold', required: false, description: 'Standard deviation threshold (Z-Score method).' },
    { name: 'mode', required: true, description: 'drop (remove rows) or clip (bound values).' },
  ];
  if (op === 'encode_categorical') return [
    { name: 'column', required: true, description: 'Categorical column to encode.' },
    { name: 'method', required: true, description: 'Encoding method: label or one_hot.' },
  ];
  if (op === 'normalize_text_case') return [
    { name: 'column', required: true, description: 'Text column to transform.' },
    { name: 'case', required: true, description: 'Target case: lower, upper, or title.' },
  ];
  if (op === 'extract_date_part') return [
    { name: 'column', required: true, description: 'Datetime column to extract from.' },
    { name: 'part', required: true, description: 'Part to extract: year/quarter/month/week/day/dayofweek/hour/minute.' },
    { name: 'new_name', required: false, description: 'Output column name. Auto-generated if blank.' },
  ];
  if (op === 'date_diff_days') return [
    { name: 'column', required: true, description: 'Base date column.' },
    { name: 'reference_column', required: false, description: 'Optional second date column for difference.' },
    { name: 'reference_date', required: false, description: 'Optional fixed reference date (YYYY-MM-DD).' },
    { name: 'new_name', required: false, description: 'Output column name. Auto-generated if blank.' },
  ];
  if (op === 'datetime_floor') return [
    { name: 'column', required: true, description: 'Datetime column to floor.' },
    { name: 'granularity', required: true, description: 'Target granularity: day/week/month/hour/minute.' },
    { name: 'new_name', required: false, description: 'Output name. If blank, source may be overwritten.' },
  ];
  if (op === 'shift_column') return [
    { name: 'column', required: true, description: 'Source column to shift.' },
    { name: 'direction', required: true, description: 'Shift direction: down (lag) or up (lead).' },
    { name: 'shifts', required: true, description: 'Number of row positions to shift.' },
    { name: 'fill_value', required: false, description: 'Optional value used to fill newly created gaps.' },
    { name: 'new_name', required: false, description: 'Output column name. Auto-generated if blank.' },
  ];
  if (op === 'cyclical_encoding') return [
    { name: 'column', required: true, description: 'Numeric or datetime source column.' },
    { name: 'value_source', required: false, description: 'raw, hour_of_day, day_of_week, day_of_month, month_of_year, week_of_year, or auto.' },
    { name: 'period', required: false, description: 'Cycle length. For example 24 (hour), 7 (weekday).' },
    { name: 'offset', required: false, description: 'Optional phase offset before transform.' },
    { name: 'prefix', required: false, description: 'Output prefix. Produces <prefix>_sin and <prefix>_cos.' },
  ];
  if (op === 'significant_lags_kendall') return [
    { name: 'column', required: true, description: 'Numeric source column.' },
    { name: 'min_lag', required: false, description: 'Minimum lag step to evaluate.' },
    { name: 'max_lag', required: false, description: 'Maximum lag step to evaluate.' },
    { name: 'alpha', required: false, description: 'Significance threshold for Kendall p-value (default 0.05).' },
    { name: 'top_k', required: false, description: 'Limit number of selected significant lags.' },
    { name: 'include_negative_tau', required: false, description: 'Include significant negative Kendall tau lags.' },
  ];
  if (op === 'rolling_window_stats_nested') return [
    { name: 'column', required: true, description: 'Numeric source column.' },
    { name: 'windows', required: false, description: 'Comma-separated window sizes, e.g., 3,5,10,30.' },
    { name: 'stats', required: false, description: 'Multi-select stats: mean,std,kurt,min,max,median,var,skew,slope.' },
    { name: 'min_periods', required: false, description: 'Minimum observations required within each window.' },
    { name: 'prefix', required: false, description: 'Prefix for generated rolling feature names.' },
  ];
  if (MATH_SCALAR_KEYS.includes(op)) return [
    { name: 'column', required: true, description: 'Numeric source column.' },
    { name: 'value', required: true, description: 'Scalar value used in the selected arithmetic operation.' },
    { name: 'new_name', required: false, description: 'Output name. If blank, source may be overwritten.' },
  ];
  if (MATH_UNARY_KEYS.includes(op)) {
    const params = [
      { name: 'column', required: true, description: 'Numeric source column.' },
      { name: 'new_name', required: false, description: 'Output name. If blank, source may be overwritten.' },
    ];
    if (op === 'math_round') params.splice(1, 0, { name: 'decimals', required: false, description: 'Decimal precision for rounding.' });
    return params;
  }
  if (MATH_BETWEEN_COLUMN_KEYS.includes(op)) return [
    { name: 'left_column', required: true, description: 'First numeric source column.' },
    { name: 'right_column', required: true, description: 'Second numeric source column.' },
    { name: 'new_name', required: true, description: 'Output column name.' },
  ];
  if (op === 'merge_datasets') return [
    { name: 'source_dataset_ids', required: false, description: 'Datasets to append into active dataset when mode=append.' },
    { name: 'source_dataset_id', required: false, description: 'Single source dataset used when mode=join_on_keys.' },
    { name: 'mode', required: true, description: 'append or join_on_keys.' },
    { name: 'join_how', required: false, description: 'Join type for key joins: inner/left/right/outer.' },
    { name: 'left_keys', required: false, description: 'Join key columns from active dataset.' },
    { name: 'right_keys', required: false, description: 'Join key columns from source dataset.' },
  ];
  if (op === 'stats_rolling_mean') return [
    { name: 'column', required: true, description: 'Numeric source column.' },
    { name: 'window', required: true, description: 'Rolling window size.' },
    { name: 'min_periods', required: false, description: 'Minimum observations required in a window.' },
    { name: 'new_name', required: false, description: 'Output column name. Auto-generated if blank.' },
  ];
  if (op.startsWith('stats_')) return [
    { name: 'column', required: true, description: 'Input column used for the statistic.' },
    { name: 'new_name', required: false, description: 'Output column name. Auto-generated if blank.' },
  ];
  if (op === 'duplicate_column') return [
    { name: 'column', required: true, description: 'Column to duplicate.' },
  ];
  return [];
};

const getFunctionOutputDescription = (op) => {
  if (op === 'drop_missing_rows' || op === 'drop_duplicates' || op === 'sort_rows' || op === 'delete_rows_condition') return 'Updates row set/order in the active dataset.';
  if (op === 'merge_datasets') return 'Returns a merged dataset with appended rows or joined columns/rows.';
  if (op === 'derive_column' || op === 'split_column' || op === 'merge_columns' || op === 'extract_date_part' || op === 'date_diff_days' || op === 'datetime_floor' || op === 'shift_column' || op === 'cyclical_encoding' || op === 'significant_lags_kendall' || op === 'rolling_window_stats_nested' || op === 'unit_convert' || op === 'bin_numeric_categories' || op === 'auto_binning' || ['min_max_scaling', 'max_absolute_scaling', 'mean_normalization', 'unit_vector_scaling', 'decimal_scaling', 'z_score_scaling', 'robust_scaling', 'log_scaling', 'quantile_transform'].includes(op)) return 'Adds or updates one or more columns in the active dataset.';
  if (op.startsWith('math_') || op.startsWith('stats_')) return 'Creates or updates numeric derived columns based on the selected function.';
  return 'Applies the transformation directly on the active dataset.';
};

const getFunctionNotes = (op) => {
  if (op === 'merge_datasets') return ['For joins, validate key mappings before apply.', 'Duplicate key names from source are suffixed when needed.'];
  if (op === 'math_divide_scalar' || op === 'math_divide_columns') return ['Division by zero produces null values.'];
  if (op === 'math_log' || op === 'math_log10' || op === 'math_sqrt') return ['Invalid numeric domains (e.g., negative input for sqrt/log) become null values.'];
  if (op === 'log_scaling') return ['For non-positive values, auto-shift adds a constant before applying log.'];
  if (op === 'quantile_transform') return ['Quantile transform is non-parametric and can map to uniform or normal distributions.'];
  if (op === 'bin_numeric_categories') return [
    'Supported rule formats: min-max:label, <x:label, <=x:label, >x:label, >=x:label.',
    'Examples: 0-3:toddler, 4-10:child, 11-17:teen, >=65:senior, <0:invalid.',
    'Ranges are inclusive for min-max (e.g., 0-3 includes both 0 and 3).',
    'First matching rule wins. Keep ranges non-overlapping for predictable output.',
  ];
  if (op === 'auto_binning') return [
    'Supervised methods (decision_tree, chimerge, mdlp) require target_column.',
    'Domain thresholds use explicit cut points (for example: thresholds=3,10,18).',
    'Jenks finds natural breaks; equal_frequency creates near-equal row counts per bin.',
  ];
  if (op === 'significant_lags_kendall') return ['Lags are selected only when Kendall p-value <= alpha.', 'Use top_k to keep only strongest temporal dependencies.'];
  if (op === 'rolling_window_stats_nested') return ['Use smaller windows for short-term fluctuations and larger windows for long-term trends.', 'Kurtosis can be unstable on very small windows.'];
  if (op === 'delete_columns') return ['At least one column must remain after deletion.'];
  if (op === 'stats_zscore') return ['If standard deviation is zero, result values become null.'];
  if (op === 'remove_outliers_iqr') return ['Use Box Plot (IQR) for robust skewed distributions; use Z-Score for near-normal distributions.'];
  if (op === 'unit_convert') return ['Use matching unit family (category) to avoid invalid conversions.', 'For temperature, use C/F/K units only.'];
  if (op === 'stats_rolling_mean') return ['Early rows may be null until min_periods is satisfied.'];
  if (op === 'delete_rows_condition') return ['Rows matching the condition are permanently removed from the current session until undo.'];
  if (op === 'date_diff_days') return ['If both reference column and fixed date are empty, operation fails.'];
  if (op === 'shift_column') return ['Down shift behaves like lag; up shift behaves like lead.', 'Use fill_value to replace nulls introduced by shifting.'];
  if (op === 'cyclical_encoding') return ['Use period=24 for hour-of-day and period=7 for day-of-week.', 'Two columns are generated: sine and cosine.'];
  return ['Operation is checkpointed automatically and can be undone before save.'];
};

const buildFunctionDocumentation = (op) => {
  const base = FUNCTION_DOCS[op] || {};
  return {
    label: DOCUMENTED_OPERATION_LABELS[op] || op,
    summary: base.summary || 'No documentation available yet.',
    keywords: base.keywords || [],
    parameters: getFunctionParameters(op),
    output: getFunctionOutputDescription(op),
    notes: getFunctionNotes(op),
  };
};

function DataPreparationScreen({ datasets, folders, selectedDataset, onSaved }) {
  const datasetId = selectedDataset?.dataset_id || '';
  const [sessionId, setSessionId] = useState('');
  const [tableData, setTableData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cellEdits, setCellEdits] = useState({});
  const [operation, setOperation] = useState('fill_missing');
  const [opParams, setOpParams] = useState({
    column: '',
    strategy: 'value',
    value: '',
    case: 'lower',
    dtype: 'numeric',
    bin_rules_text: '0-3:toddler\n4-10:child',
    bin_default_label: '',
    bin_new_name: '',
    auto_bin_method: 'equal_width',
    auto_bin_bins: '5',
    auto_bin_target_column: '',
    auto_bin_thresholds: '',
    auto_bin_labels: '',
    auto_bin_chi2_threshold: '3.841',
    auto_bin_new_name: '',
    unit_category: 'length',
    unit_from: '',
    unit_to: '',
    unit_overwrite: false,
    unit_new_name: '',
    scaling_new_name: '',
    log_base: 'e',
    log_shift_mode: 'auto',
    log_shift: '',
    quantile_output_distribution: 'uniform',
    quantile_n: '',
    subset: '',
    how: 'any',
    ascending: 'true',
    find: '',
    replace: '',
    regex: false,
    new_name: '',
    min: '',
    max: '',
    factor: '1.5',
    outlier_method: 'iqr',
    z_threshold: '3.0',
    outlier_mode: 'drop',
    encode_method: 'label',
    case_sensitive: true,
    delimiter: ',',
    maxsplit: '',
    new_columns: '',
    drop_original: false,
    columns_multi: '',
    separator: ' ',
    drop_source: false,
    skip_null: true,
    expression: '',
    group_by: '',
    agg_column: '',
    agg_func: 'count',
    agg_alias: '',
    date_part: 'year',
    date_reference_column: '',
    date_reference_date: '',
    date_diff_new_name: '',
    date_floor_granularity: 'day',
    date_floor_new_name: '',
    shift_direction: 'down',
    shift_periods: '1',
    shift_fill_value: '',
    shift_new_name: '',
    cyclical_value_source: 'auto',
    cyclical_period: '',
    cyclical_offset: '0',
    cyclical_prefix: '',
    lag_min_lag: '1',
    lag_max_lag: '24',
    lag_alpha: '0.05',
    lag_top_k: '5',
    lag_include_negative_tau: true,
    rolling_windows: '3,5,10,20',
    rolling_stats: 'mean,std,kurt',
    rolling_min_periods: '1',
    rolling_prefix: '',
    delete_columns_multi: '',
    math_scalar_operator: 'add',
    math_scalar_value: '',
    math_scalar_new_name: '',
    math_unary_func: 'abs',
    math_unary_decimals: '',
    math_unary_new_name: '',
    math_between_left: '',
    math_between_right: '',
    math_between_operator: 'add',
    math_between_new_name: '',
    merge_source_dataset_id: '',
    merge_source_dataset_ids: [],
    merge_mode: 'append',
    merge_join_how: 'inner',
    merge_left_keys: '',
    merge_right_keys: '',
    stats_new_name: '',
    stats_window: '5',
    stats_min_periods: '',
    delete_condition_operator: 'eq',
    delete_condition_value: '',
    delete_condition_case_sensitive: true,
  });
  const [saveMode, setSaveMode] = useState('overwrite');
  const [newFilename, setNewFilename] = useState('');
  const [saveFolder, setSaveFolder] = useState('default');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [showDatasetExplorerModal, setShowDatasetExplorerModal] = useState(false);
  const [showFunctionDocPanel, setShowFunctionDocPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [history, setHistory] = useState({
    can_undo: false,
    can_redo: false,
    undo_count: 0,
    redo_count: 0,
    checkpoint_count: 0,
  });
  const [checkpoints, setCheckpoints] = useState([]);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [rowForm, setRowForm] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [addRowInsertIndex, setAddRowInsertIndex] = useState(null);
  const [addRowMode, setAddRowMode] = useState('append');
  const [inlineEditor, setInlineEditor] = useState(null);
  const [columnWidths, setColumnWidths] = useState({});
  const [highlightedColumns, setHighlightedColumns] = useState([]);
  const [selectedGridRows, setSelectedGridRows] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuSearch, setContextMenuSearch] = useState('');
  const [functionSearch, setFunctionSearch] = useState('');
  const [functionSearchOpen, setFunctionSearchOpen] = useState(false);
  const [mergeKeyPairs, setMergeKeyPairs] = useState([{ left: '', right: '' }]);
  const [selectedInsightColumn, setSelectedInsightColumn] = useState(null);
  const [dryRunPreview, setDryRunPreview] = useState(null);
  const gridShellRef = useRef(null);
  const contextMenuRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const lastContextPointerRef = useRef(null);
  const highlightTimerRef = useRef(null);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = (event) => {
      if (contextMenuRef.current && contextMenuRef.current.contains(event.target)) return;
      setContextMenu(null);
    };
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [contextMenu]);

  useEffect(() => () => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (operation !== 'merge_datasets') return;
    setMergeKeyPairs((prev) => (prev.length ? prev : [{ left: '', right: '' }]));
  }, [operation]);

  const selectedMeta = useMemo(
    () => selectedDataset || datasets.find((d) => d.dataset_id === datasetId) || null,
    [selectedDataset, datasets, datasetId]
  );

  const columns = tableData?.columns || [];
  const rows = tableData?.rows || [];
  const mergeSourceDataset = useMemo(
    () => datasets.find((d) => d.dataset_id === opParams.merge_source_dataset_id) || null,
    [datasets, opParams.merge_source_dataset_id]
  );
  const mergeAppendSourceDatasetIds = useMemo(
    () => (
      Array.isArray(opParams.merge_source_dataset_ids)
        ? opParams.merge_source_dataset_ids.map((id) => String(id || '').trim()).filter(Boolean)
        : []
    ),
    [opParams.merge_source_dataset_ids]
  );
  const mergeSourceColumns = useMemo(() => {
    const schema = mergeSourceDataset?.schema || [];
    return schema.map((c) => String(c?.name || '').trim()).filter(Boolean);
  }, [mergeSourceDataset]);
  const mergeSelectableDatasets = useMemo(
    () => (datasets || []).filter((d) => d.dataset_id !== datasetId),
    [datasets, datasetId]
  );
  const mergeAppendSourceDatasets = useMemo(() => {
    const selectedIds = new Set(mergeAppendSourceDatasetIds);
    return mergeSelectableDatasets.filter((d) => selectedIds.has(d.dataset_id));
  }, [mergeSelectableDatasets, mergeAppendSourceDatasetIds]);
  const mergeAppendSelectionLabel = useMemo(() => {
    if (!mergeAppendSourceDatasets.length) return 'No datasets selected';
    const names = mergeAppendSourceDatasets.slice(0, 3).map((d) => d.original_filename).join(', ');
    const moreCount = mergeAppendSourceDatasets.length - 3;
    return `${mergeAppendSourceDatasets.length} selected: ${names}${moreCount > 0 ? ` +${moreCount} more` : ''}`;
  }, [mergeAppendSourceDatasets]);

  const columnTypeBucket = (dtype) => {
    const t = String(dtype || '').toLowerCase();
    if (!t) return 'text';
    if (t.includes('int') || t.includes('float') || t.includes('double') || t.includes('numeric') || t.includes('decimal')) return 'numeric';
    if (t.includes('bool')) return 'boolean';
    if (t.includes('date') || t.includes('time')) return 'datetime';
    if (t.includes('json')) return 'json';
    return 'text';
  };

  const columnTypeMap = useMemo(() => {
    const types = {};
    const schema = selectedMeta?.schema || [];
    schema.forEach((col) => {
      const name = col?.name;
      if (!name) return;
      const detected = String(col?.detected_dtype || '').trim();
      const semantic = String(col?.semantic_type || '').trim();
      const label = detected || semantic;
      if (label) types[name] = label;
    });

    columns.forEach((col) => {
      if (types[col]) return;
      const sample = rows.find((row) => row?.[col] !== null && row?.[col] !== undefined && row?.[col] !== '');
      const value = sample?.[col];
      if (value === null || value === undefined || value === '') return;
      if (typeof value === 'number') {
        types[col] = Number.isInteger(value) ? 'int' : 'float';
        return;
      }
      if (typeof value === 'boolean') {
        types[col] = 'bool';
        return;
      }
      types[col] = 'string';
    });
    return types;
  }, [selectedMeta, columns, rows]);

  const activeContextColumn = contextMenu?.targetColumns?.[0] || '';
  const activeContextTypeBucket = activeContextColumn ? columnTypeBucket(columnTypeMap[activeContextColumn]) : 'any';

  const filteredColumnFunctions = useMemo(() => {
    const query = String(contextMenuSearch || '').trim().toLowerCase();
    const byType = COLUMN_MENU_FUNCTIONS.filter((item) => (
      item.appliesTo.includes('any') || item.appliesTo.includes(activeContextTypeBucket)
    ));
    if (!query) return byType;
    return byType.filter((item) => {
      const doc = FUNCTION_DOCS[item.value] || {};
      const terms = [item.label, doc.summary || '', ...(doc.keywords || [])].join(' ').toLowerCase();
      return terms.includes(query);
    });
  }, [contextMenuSearch, activeContextTypeBucket]);

  const filteredGlobalFunctions = useMemo(() => {
    const query = String(functionSearch || '').trim().toLowerCase();
    if (!query) return APPLY_FUNCTION_OPTIONS;
    return APPLY_FUNCTION_OPTIONS.filter((item) => {
      const doc = FUNCTION_DOCS[item.value] || {};
      const terms = [item.label, doc.summary || '', ...(doc.keywords || [])].join(' ').toLowerCase();
      return terms.includes(query);
    });
  }, [functionSearch]);
  const selectedFunctionFullDoc = useMemo(() => buildFunctionDocumentation(operation), [operation]);

  useEffect(() => {
    if (!showApplyModal) setShowFunctionDocPanel(false);
  }, [showApplyModal]);

  const columnQuickInsights = useMemo(() => {
    const sampleSize = Math.min(rows.length, 800);
    const sampleRows = rows.slice(0, sampleSize);
    const out = columns.map((col) => {
      const dtype = columnTypeBucket(columnTypeMap[col]);
      const values = sampleRows.map((r) => r?.[col]);
      const nonEmpty = values.filter((v) => v !== null && v !== undefined && String(v) !== '');
      const missingPct = sampleSize ? ((sampleSize - nonEmpty.length) / sampleSize) * 100 : 0;

      if (dtype === 'numeric') {
        const nums = nonEmpty.map((v) => Number(v)).filter((n) => Number.isFinite(n));
        if (!nums.length) return { col, dtype, missingPct, bins: [], min: null, max: null, mean: null };
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const bucketCount = 12;
        const bins = Array(bucketCount).fill(0);
        nums.forEach((n) => {
          if (max === min) {
            bins[0] += 1;
            return;
          }
          const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(((n - min) / (max - min)) * bucketCount)));
          bins[idx] += 1;
        });
        const peak = Math.max(...bins, 1);
        return { col, dtype, missingPct, bins: bins.map((b) => b / peak), min, max, mean };
      }

      if (dtype === 'datetime') {
        const ds = nonEmpty
          .map((v) => new Date(v))
          .map((d) => d.getTime())
          .filter((t) => Number.isFinite(t));
        if (!ds.length) return { col, dtype, missingPct, minDate: '', maxDate: '' };
        const minTs = Math.min(...ds);
        const maxTs = Math.max(...ds);
        return { col, dtype, missingPct, minDate: new Date(minTs).toISOString().slice(0, 10), maxDate: new Date(maxTs).toISOString().slice(0, 10) };
      }

      const counts = new Map();
      nonEmpty.forEach((v) => {
        const key = String(v).slice(0, 32);
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, count]) => ({ label, pct: nonEmpty.length ? (count / nonEmpty.length) * 100 : 0 }));
      return { col, dtype, missingPct, top };
    });
    return { sampleSize, columns: out };
  }, [rows, columns, columnTypeMap]);
  const quickInsightsByColumn = useMemo(
    () => Object.fromEntries((columnQuickInsights.columns || []).map((item) => [item.col, item])),
    [columnQuickInsights]
  );
  const selectedColumnInsight = selectedInsightColumn ? quickInsightsByColumn[selectedInsightColumn] : null;

  const gridColumns = useMemo(() => {
    const typeIcon = (dtype) => {
      const t = String(dtype || '').toLowerCase();
      if (!t) return '';
      if (t.includes('int') || t.includes('float') || t.includes('double') || t.includes('numeric')) return '🔢';
      if (t.includes('bool')) return '✅';
      if (t.includes('date') || t.includes('time')) return '📅';
      if (t.includes('json')) return '🧩';
      return '🔤';
    };

    return columns.map((col) => {
      const icon = typeIcon(columnTypeMap[col]);
      const headerLabelBase = icon ? `${icon} ${col}` : col;
      const headerLabel = highlightedColumns.includes(col) ? `✨ ${headerLabelBase}` : headerLabelBase;
      return {
        id: col,
        title: headerLabel,
        hasMenu: true,
        width: columnWidths[col] || Math.max(180, Math.min(520, String(headerLabel).length * 10 + 80)),
      };
    });
  }, [columns, columnWidths, columnTypeMap, highlightedColumns]);

  const startSession = async (targetDatasetId = datasetId) => {
    if (!targetDatasetId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/prepare/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: targetDatasetId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to start prepare session');
      setSessionId(body.session_id);
      setCellEdits({});
      await loadTable(body.session_id);
      await loadHistory(body.session_id);
    } catch (err) {
      setError(err.message || 'Failed to start session');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSessionId('');
    setTableData(null);
    setCellEdits({});
    setSelectedGridRows([]);
    setContextMenu(null);
    setCheckpoints([]);
    setShowRestoreModal(false);
    setShowAddRowModal(false);
    setRowForm({});
    setRowErrors({});
    setAddRowInsertIndex(null);
    setAddRowMode('append');
    setMergeKeyPairs([{ left: '', right: '' }]);
    setInlineEditor(null);
    setHighlightedColumns([]);
    setDryRunPreview(null);
    if (!datasetId) {
      setError('No dataset selected for preparation.');
      return;
    }
    startSession(datasetId);
  }, [datasetId]);

  const loadTable = async (sid = sessionId, { append = false, highlightFromColumns = null } = {}) => {
    if (!sid) return;
    const currentRows = append ? (tableData?.rows || []) : [];
    const offset = append ? currentRows.length : 0;
    const res = await fetch(`${API_BASE}/prepare/${sid}/table?limit=${PREP_PAGE_SIZE}&offset=${offset}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || 'Failed to load table');
    if (append) {
      setTableData((prev) => {
        const previousRows = prev?.rows || [];
        return {
          ...body,
          rows: [...previousRows, ...(body.rows || [])],
        };
      });
      return;
    }
    setDryRunPreview(null);
    setTableData(body);
    if (Array.isArray(highlightFromColumns)) {
      const previous = new Set(highlightFromColumns);
      const added = (body.columns || []).filter((c) => !previous.has(c));
      if (added.length) {
        setHighlightedColumns(added);
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => {
          setHighlightedColumns([]);
          highlightTimerRef.current = null;
        }, 3000);
      }
    }
  };

  const loadHistory = async (sid = sessionId) => {
    if (!sid) return;
    const res = await fetch(`${API_BASE}/prepare/${sid}/history`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || 'Failed to load history');
    setHistory({
      can_undo: Boolean(body.can_undo),
      can_redo: Boolean(body.can_redo),
      undo_count: Number(body.undo_count || 0),
      redo_count: Number(body.redo_count || 0),
      checkpoint_count: Number(body.checkpoint_count || 0),
    });
    setCheckpoints(Array.isArray(body.checkpoints) ? body.checkpoints : []);
  };

  const loadMoreRows = async () => {
    if (!sessionId || loadingMoreRef.current) return;
    const loadedRows = tableData?.rows?.length || 0;
    const totalRows = tableData?.total_rows || 0;
    if (loadedRows >= totalRows) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await loadTable(sessionId, { append: true });
    } catch (err) {
      setError(err.message || 'Failed to load additional rows');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const onCellChange = (rowIndex, column, value) => {
    const key = `${rowIndex}::${column}`;
    setCellEdits((prev) => ({ ...prev, [key]: { row_index: rowIndex, column, value } }));
  };

  const parseColumnList = (raw) => String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);

  const toggleMultiColumnParam = (field, columnName) => {
    const selected = new Set(parseColumnList(opParams[field]));
    if (selected.has(columnName)) selected.delete(columnName);
    else selected.add(columnName);
    setOpParams((prev) => ({ ...prev, [field]: Array.from(selected).join(',') }));
  };

  const toggleMergeAppendSourceDataset = (dataset) => {
    const datasetIdToToggle = String(dataset?.dataset_id || '').trim();
    if (!datasetIdToToggle) return;
    setOpParams((prev) => {
      const selected = new Set(
        Array.isArray(prev.merge_source_dataset_ids)
          ? prev.merge_source_dataset_ids.map((id) => String(id || '').trim()).filter(Boolean)
          : []
      );
      if (selected.has(datasetIdToToggle)) selected.delete(datasetIdToToggle);
      else selected.add(datasetIdToToggle);
      return { ...prev, merge_source_dataset_ids: Array.from(selected) };
    });
  };

  const validateCellValueByType = (columnName, rawValue) => {
    const dtype = String(columnTypeMap[columnName] || '').toLowerCase();
    const asString = rawValue == null ? '' : String(rawValue);
    const trimmed = asString.trim();

    if (trimmed === '') {
      return { ok: true, value: null };
    }

    const isNumericType =
      dtype.includes('int') ||
      dtype.includes('float') ||
      dtype.includes('double') ||
      dtype.includes('numeric') ||
      dtype.includes('decimal');
    if (isNumericType) {
      const n = Number(trimmed);
      if (Number.isNaN(n)) return { ok: false, error: `Invalid numeric value for "${columnName}"` };
      if (dtype.includes('int') && !Number.isInteger(n)) {
        return { ok: false, error: `Integer required for "${columnName}"` };
      }
      return { ok: true, value: n };
    }

    if (dtype.includes('bool')) {
      const token = trimmed.toLowerCase();
      if (['true', '1', 'yes', 'y', 't'].includes(token)) return { ok: true, value: true };
      if (['false', '0', 'no', 'n', 'f'].includes(token)) return { ok: true, value: false };
      return { ok: false, error: `Boolean expected for "${columnName}"` };
    }

    if (dtype.includes('date') || dtype.includes('time')) {
      const isTimeOnly = /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i.test(trimmed);
      const isDateTime = !Number.isNaN(Date.parse(trimmed));
      if (!isDateTime && !isTimeOnly) {
        return { ok: false, error: `Invalid date/time value for "${columnName}"` };
      }
      return { ok: true, value: trimmed };
    }

    if (dtype.includes('json')) {
      try {
        JSON.parse(trimmed);
      } catch (_err) {
        return { ok: false, error: `Invalid JSON value for "${columnName}"` };
      }
      return { ok: true, value: trimmed };
    }

    return { ok: true, value: asString };
  };

  const persistPendingEdits = async () => {
    if (!sessionId) return;
    const updates = Object.values(cellEdits);
    if (!updates.length) return;
    const res = await fetch(`${API_BASE}/prepare/${sessionId}/update-cells`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to save edits');
      setCellEdits({});
      await loadHistory();
    };

  const updateSingleCell = async (rowIndex, column, value) => {
    if (!sessionId) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/update-cells`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ row_index: rowIndex, column, value }],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to update cell');
      await loadTable();
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Failed to update cell');
    } finally {
      setBusy(false);
    }
  };

  const applyOperation = async () => {
    if (!sessionId) return false;
    setBusy(true);
    setError('');
    try {
      let backendOperation = operation;
      const previousColumns = tableData?.columns || [];
      await persistPendingEdits();
      const params = {};
      if (opParams.column) params.column = opParams.column;
      if (operation === 'fill_missing') {
        params.strategy = opParams.strategy;
        if (opParams.strategy === 'value') params.value = opParams.value;
      }
      if (operation === 'replace_values') {
        params.find = opParams.find;
        params.replace = opParams.replace;
        params.regex = Boolean(opParams.regex);
        params.case_sensitive = Boolean(opParams.case_sensitive);
      }
      if (operation === 'delete_rows_condition') {
        params.condition = opParams.delete_condition_operator;
        params.case_sensitive = Boolean(opParams.delete_condition_case_sensitive);
        if (!['is_null', 'is_not_null'].includes(opParams.delete_condition_operator)) {
          params.value = opParams.delete_condition_value;
        }
      }
      if (operation === 'split_column') {
        params.delimiter = opParams.delimiter;
        if (opParams.maxsplit !== '') params.maxsplit = opParams.maxsplit;
        if (opParams.new_columns.trim()) {
          params.new_columns = opParams.new_columns.split(',').map((s) => s.trim()).filter(Boolean);
        }
        params.drop_original = Boolean(opParams.drop_original);
      }
      if (operation === 'merge_columns') {
        params.columns = opParams.columns_multi.split(',').map((s) => s.trim()).filter(Boolean);
        params.new_name = opParams.new_name;
        params.separator = opParams.separator;
        params.drop_source = Boolean(opParams.drop_source);
        params.skip_null = Boolean(opParams.skip_null);
      }
      if (operation === 'derive_column') {
        params.new_name = opParams.new_name;
        params.expression = opParams.expression;
      }
      if (operation === 'group_aggregate') {
        params.group_by = opParams.group_by.split(',').map((s) => s.trim()).filter(Boolean);
        params.aggregations = [
          {
            column: opParams.agg_column,
            func: opParams.agg_func,
            alias: opParams.agg_alias,
          },
        ];
      }
      if (operation === 'normalize_text_case') params.case = opParams.case;
      if (operation === 'cast_column') params.dtype = opParams.dtype;
      if (operation === 'unit_convert') {
        params.category = opParams.unit_category;
        params.from_unit = opParams.unit_from;
        params.to_unit = opParams.unit_to;
        params.overwrite = Boolean(opParams.unit_overwrite);
        if (opParams.unit_new_name.trim()) params.new_name = opParams.unit_new_name.trim();
      }
      if (operation === 'bin_numeric_categories') {
        params.rules_text = opParams.bin_rules_text;
        if (opParams.bin_default_label.trim()) params.default_label = opParams.bin_default_label.trim();
        if (opParams.bin_new_name.trim()) params.new_name = opParams.bin_new_name.trim();
      }
      if (operation === 'auto_binning') {
        params.method = opParams.auto_bin_method;
        if (opParams.auto_bin_bins !== '') params.bins = opParams.auto_bin_bins;
        if (['decision_tree', 'chimerge', 'mdlp'].includes(opParams.auto_bin_method) && opParams.auto_bin_target_column) {
          params.target_column = opParams.auto_bin_target_column;
        }
        if (opParams.auto_bin_method === 'domain_threshold') {
          params.thresholds = opParams.auto_bin_thresholds;
          if (opParams.auto_bin_labels.trim()) params.labels = opParams.auto_bin_labels;
        }
        if (opParams.auto_bin_method === 'chimerge' && opParams.auto_bin_chi2_threshold !== '') {
          params.chi2_threshold = opParams.auto_bin_chi2_threshold;
        }
        if (opParams.auto_bin_new_name.trim()) params.new_name = opParams.auto_bin_new_name.trim();
      }
      if (['min_max_scaling', 'max_absolute_scaling', 'mean_normalization', 'unit_vector_scaling', 'decimal_scaling', 'z_score_scaling', 'robust_scaling'].includes(operation)) {
        if (opParams.scaling_new_name.trim()) params.new_name = opParams.scaling_new_name.trim();
      }
      if (operation === 'log_scaling') {
        params.base = opParams.log_base;
        params.shift_mode = opParams.log_shift_mode;
        if (opParams.log_shift_mode === 'custom' && opParams.log_shift !== '') params.shift = opParams.log_shift;
        if (opParams.scaling_new_name.trim()) params.new_name = opParams.scaling_new_name.trim();
      }
      if (operation === 'quantile_transform') {
        params.output_distribution = opParams.quantile_output_distribution;
        if (opParams.quantile_n !== '') params.n_quantiles = opParams.quantile_n;
        if (opParams.scaling_new_name.trim()) params.new_name = opParams.scaling_new_name.trim();
      }
      if (operation === 'sort_rows') params.ascending = opParams.ascending;
      if (operation === 'rename_column') params.new_name = opParams.new_name;
      if (operation === 'delete_columns') {
        params.columns = parseColumnList(opParams.delete_columns_multi);
      }
      if (operation === 'clip_values') {
        if (opParams.min !== '') params.min = opParams.min;
        if (opParams.max !== '') params.max = opParams.max;
      }
      if (operation === 'remove_outliers_iqr') {
        params.method = opParams.outlier_method;
        if (opParams.outlier_method === 'zscore') {
          params.z_threshold = opParams.z_threshold;
        } else {
          params.factor = opParams.factor;
        }
        params.mode = opParams.outlier_mode;
      }
      if (operation === 'encode_categorical') params.method = opParams.encode_method;
      if (operation === 'extract_date_part') {
        params.part = opParams.date_part;
        if (opParams.new_name) params.new_name = opParams.new_name;
      }
      if (operation === 'date_diff_days') {
        if (opParams.date_reference_column) params.reference_column = opParams.date_reference_column;
        if (opParams.date_reference_date) params.reference_date = opParams.date_reference_date;
        if (opParams.date_diff_new_name) params.new_name = opParams.date_diff_new_name;
      }
      if (operation === 'datetime_floor') {
        params.granularity = opParams.date_floor_granularity;
        if (opParams.date_floor_new_name) params.new_name = opParams.date_floor_new_name;
      }
      if (operation === 'shift_column') {
        params.direction = opParams.shift_direction;
        if (opParams.shift_periods !== '') params.shifts = opParams.shift_periods;
        if (opParams.shift_fill_value !== '') params.fill_value = opParams.shift_fill_value;
        if (opParams.shift_new_name.trim()) params.new_name = opParams.shift_new_name.trim();
      }
      if (operation === 'cyclical_encoding') {
        params.value_source = opParams.cyclical_value_source;
        if (opParams.cyclical_period !== '') params.period = opParams.cyclical_period;
        if (opParams.cyclical_offset !== '') params.offset = opParams.cyclical_offset;
        if (opParams.cyclical_prefix.trim()) params.prefix = opParams.cyclical_prefix.trim();
      }
      if (operation === 'significant_lags_kendall') {
        if (opParams.lag_min_lag !== '') params.min_lag = opParams.lag_min_lag;
        if (opParams.lag_max_lag !== '') params.max_lag = opParams.lag_max_lag;
        if (opParams.lag_alpha !== '') params.alpha = opParams.lag_alpha;
        if (opParams.lag_top_k !== '') params.top_k = opParams.lag_top_k;
        params.include_negative_tau = Boolean(opParams.lag_include_negative_tau);
      }
      if (operation === 'rolling_window_stats_nested') {
        params.windows = opParams.rolling_windows;
        params.stats = opParams.rolling_stats;
        if (opParams.rolling_min_periods !== '') params.min_periods = opParams.rolling_min_periods;
        if (opParams.rolling_prefix.trim()) params.prefix = opParams.rolling_prefix.trim();
      }
      if (MATH_SCALAR_OPS[operation]) {
        backendOperation = 'math_scalar';
        params.operator = MATH_SCALAR_OPS[operation];
        params.value = opParams.math_scalar_value;
        if (opParams.math_scalar_new_name) params.new_name = opParams.math_scalar_new_name;
      }
      if (MATH_UNARY_OPS[operation]) {
        backendOperation = 'math_unary';
        params.func = MATH_UNARY_OPS[operation];
        if (MATH_UNARY_OPS[operation] === 'round' && opParams.math_unary_decimals !== '') params.decimals = opParams.math_unary_decimals;
        if (opParams.math_unary_new_name) params.new_name = opParams.math_unary_new_name;
      }
      if (MATH_BETWEEN_COLUMNS_OPS[operation]) {
        backendOperation = 'math_between_columns';
        params.left_column = opParams.math_between_left;
        params.right_column = opParams.math_between_right;
        params.operator = MATH_BETWEEN_COLUMNS_OPS[operation];
        params.new_name = opParams.math_between_new_name;
      }
      if (operation === 'merge_datasets') {
        params.mode = opParams.merge_mode;
        if (opParams.merge_mode === 'append') {
          const sourceDatasetIds = mergeAppendSourceDatasetIds.filter((id) => id !== datasetId);
          if (!sourceDatasetIds.length) {
            throw new Error('Choose at least one dataset from Data Explorer for simple append.');
          }
          params.source_dataset_ids = sourceDatasetIds;
        } else if (opParams.merge_mode === 'join_on_keys') {
          if (!opParams.merge_source_dataset_id) {
            throw new Error('Choose one source dataset from Data Explorer for join.');
          }
          params.source_dataset_id = opParams.merge_source_dataset_id;
          params.join_how = opParams.merge_join_how;
          const validPairs = mergeKeyPairs.filter((p) => p.left && p.right);
          params.left_keys = validPairs.map((p) => p.left);
          params.right_keys = validPairs.map((p) => p.right);
        }
      }
      if (operation === 'stats_zscore' || operation === 'stats_percentile_rank' || operation === 'stats_variance' || operation === 'stats_std') {
        if (opParams.stats_new_name) params.new_name = opParams.stats_new_name;
      }
      if (operation === 'stats_rolling_mean') {
        params.window = opParams.stats_window;
        if (opParams.stats_min_periods !== '') params.min_periods = opParams.stats_min_periods;
        if (opParams.stats_new_name) params.new_name = opParams.stats_new_name;
      }
      if (operation === 'drop_missing_rows') {
        params.how = opParams.how;
        if (opParams.subset.trim()) {
          params.subset = opParams.subset.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }
      if (operation === 'drop_duplicates' && opParams.subset.trim()) {
        params.subset = opParams.subset.split(',').map((s) => s.trim()).filter(Boolean);
      }
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: backendOperation,
          params,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to apply operation');
      setCellEdits({});
      await loadTable(sessionId, { highlightFromColumns: previousColumns });
      await loadHistory();
      return true;
    } catch (err) {
      setError(err.message || 'Failed to apply operation');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const savePreparedData = async () => {
    if (!sessionId) return false;
    setBusy(true);
    setError('');
    try {
      await persistPendingEdits();
      const payload = {
        mode: saveMode,
        new_filename: saveMode === 'new' ? newFilename : null,
        folder: saveMode === 'new' ? saveFolder : null,
      };
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to save prepared data');
      await onSaved?.(body.dataset);
      setHistory({
        can_undo: false,
        can_redo: false,
        undo_count: 0,
        redo_count: 0,
        checkpoint_count: 0,
      });
      return true;
    } catch (err) {
      setError(err.message || 'Failed to save prepared data');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const getCellContent = ([col, row]) => {
    const columnName = columns[col];
    const rowObj = rows[row];
    const value = rowObj?.[columnName];
    const highlightTheme = highlightedColumns.includes(columnName)
      ? {
          bgCell: '#fff7cc',
          bgCellMedium: '#ffef99',
          textDark: '#7c5200',
          borderColor: '#f59e0b',
        }
      : undefined;

    if (typeof value === 'number' && Number.isFinite(value)) {
      return {
        kind: GridCellKind.Number,
        data: value,
        displayData: String(value),
        allowOverlay: true,
        readonly: false,
        themeOverride: highlightTheme,
      };
    }

    const textValue = value == null ? '' : String(value);
    return {
      kind: GridCellKind.Text,
      data: textValue,
      displayData: textValue,
      allowOverlay: true,
      readonly: false,
      themeOverride: highlightTheme,
    };
  };

  const onCellEdited = ([col, row], newValue) => {
    if (dryRunPreview) return;
    const columnName = columns[col];
    const rowObj = rows[row];
    if (!rowObj || !columnName) return;
    let value;
    if (newValue.kind === GridCellKind.Number) {
      value = newValue.data;
    } else if (newValue.kind === GridCellKind.Text) {
      value = newValue.data;
    } else {
      value = 'data' in newValue ? newValue.data : '';
    }
    const validated = validateCellValueByType(columnName, value);
    if (!validated.ok) {
      return;
    }
    setTableData((prev) => {
      if (!prev?.rows?.length) return prev;
      const nextRows = [...prev.rows];
      const target = { ...(nextRows[row] || {}) };
      target[columnName] = validated.value;
      nextRows[row] = target;
      return { ...prev, rows: nextRows };
    });
    onCellChange(rowObj._row_index, columnName, validated.value);
  };

  const commitInlineEditor = (save = true) => {
    if (!inlineEditor) return;
    if (save) {
      const { row, columnName, value } = inlineEditor;
      const rowObj = rows[row];
      if (rowObj && columnName) {
        const validated = validateCellValueByType(columnName, value);
        if (!validated.ok) {
          setInlineEditor((prev) => (prev ? { ...prev, invalid: true } : prev));
          return;
        }
        setTableData((prev) => {
          if (!prev?.rows?.length) return prev;
          const nextRows = [...prev.rows];
          const target = { ...(nextRows[row] || {}) };
          target[columnName] = validated.value;
          nextRows[row] = target;
          return { ...prev, rows: nextRows };
        });
        onCellChange(rowObj._row_index, columnName, validated.value);
      }
    }
    setInlineEditor(null);
  };

  useEffect(() => {
    if (!inlineEditor) return undefined;
    const handleViewportScroll = () => {
      commitInlineEditor(true);
    };
    window.addEventListener('scroll', handleViewportScroll, true);
    return () => {
      window.removeEventListener('scroll', handleViewportScroll, true);
    };
  }, [inlineEditor]);

  const openAddRowModal = ({ insertIndex = null, mode = 'append' } = {}) => {
    const initial = {};
    columns.forEach((col) => {
      initial[col] = '';
    });
    setRowForm(initial);
    setRowErrors({});
    setAddRowInsertIndex(Number.isInteger(insertIndex) ? insertIndex : null);
    setAddRowMode(mode);
    setShowAddRowModal(true);
  };

  const validateRowForm = () => {
    const errors = {};
    let nonEmpty = 0;
    columns.forEach((col) => {
      const raw = rowForm[col];
      const value = raw == null ? '' : String(raw).trim();
      if (value !== '') nonEmpty += 1;
      if (value === '') return;
      const dtype = String(columnTypeMap[col] || '').toLowerCase();
      if (dtype.includes('int') || dtype.includes('float') || dtype.includes('double') || dtype.includes('numeric')) {
        if (Number.isNaN(Number(value))) errors[col] = 'Numeric value required';
        return;
      }
      if (dtype.includes('bool')) {
        const token = value.toLowerCase();
        if (!['true', 'false', '1', '0', 'yes', 'no', 'y', 'n', 't', 'f'].includes(token)) {
          errors[col] = 'Boolean expected (true/false)';
        }
        return;
      }
      if (dtype.includes('date') || dtype.includes('time')) {
        const isTime = /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i.test(value);
        const isDate = !Number.isNaN(Date.parse(value));
        if (!isDate && !isTime) errors[col] = 'Date/time format invalid';
      }
    });
    if (nonEmpty === 0) {
      errors.__global = 'At least one field must be provided.';
    }
    setRowErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitAddRow = async () => {
    if (!sessionId) return;
    if (!validateRowForm()) return;
    setBusy(true);
    setError('');
    try {
      await persistPendingEdits();
      const rowData = {};
      columns.forEach((col) => {
        const raw = rowForm[col];
        const value = raw == null ? '' : String(raw).trim();
        rowData[col] = value === '' ? null : raw;
      });
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'add_row',
          params: {
            row_data: rowData,
            insert_index: addRowInsertIndex,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to add row');
      setShowAddRowModal(false);
      setRowForm({});
      setRowErrors({});
      setAddRowInsertIndex(null);
      setAddRowMode('append');
      await loadTable();
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Failed to add row');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!sessionId) return;
    setBusy(true);
    setError('');
    try {
      await persistPendingEdits();
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/undo`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to undo');
      await loadTable();
      if (body.history) {
        setHistory({
          can_undo: Boolean(body.history.can_undo),
          can_redo: Boolean(body.history.can_redo),
          undo_count: Number(body.history.undo_count || 0),
          redo_count: Number(body.history.redo_count || 0),
          checkpoint_count: Number(body.history.checkpoint_count || 0),
        });
        setCheckpoints(Array.isArray(body.history.checkpoints) ? body.history.checkpoints : []);
      } else {
        await loadHistory();
      }
    } catch (err) {
      setError(err.message || 'Failed to undo');
    } finally {
      setBusy(false);
    }
  };

  const redo = async () => {
    if (!sessionId) return;
    setBusy(true);
    setError('');
    try {
      await persistPendingEdits();
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/redo`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to redo');
      await loadTable();
      if (body.history) {
        setHistory({
          can_undo: Boolean(body.history.can_undo),
          can_redo: Boolean(body.history.can_redo),
          undo_count: Number(body.history.undo_count || 0),
          redo_count: Number(body.history.redo_count || 0),
          checkpoint_count: Number(body.history.checkpoint_count || 0),
        });
        setCheckpoints(Array.isArray(body.history.checkpoints) ? body.history.checkpoints : []);
      } else {
        await loadHistory();
      }
    } catch (err) {
      setError(err.message || 'Failed to redo');
    } finally {
      setBusy(false);
    }
  };

  const restoreCheckpoint = async (checkpointId) => {
    if (!sessionId || !checkpointId) return;
    setBusy(true);
    setError('');
    try {
      await persistPendingEdits();
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/checkpoint/${checkpointId}/restore`, {
        method: 'POST',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to restore checkpoint');
      await loadTable();
      if (body.history) {
        setHistory({
          can_undo: Boolean(body.history.can_undo),
          can_redo: Boolean(body.history.can_redo),
          undo_count: Number(body.history.undo_count || 0),
          redo_count: Number(body.history.redo_count || 0),
          checkpoint_count: Number(body.history.checkpoint_count || 0),
        });
        setCheckpoints(Array.isArray(body.history.checkpoints) ? body.history.checkpoints : []);
      } else {
        await loadHistory();
      }
      setShowRestoreModal(false);
    } catch (err) {
      setError(err.message || 'Failed to restore checkpoint');
    } finally {
      setBusy(false);
    }
  };

  const onColumnResize = (_column, newSize, colIndex) => {
    const columnName = columns[colIndex];
    if (!columnName) return;
    setColumnWidths((prev) => ({ ...prev, [columnName]: Math.max(90, Math.min(700, Number(newSize) || 160)) }));
  };

  const extractSelectedRows = (selection) => {
    const rowsSel = selection?.rows;
    if (!rowsSel) return [];
    if (typeof rowsSel.toArray === 'function') return rowsSel.toArray();
    if (typeof rowsSel[Symbol.iterator] === 'function') return Array.from(rowsSel);
    if (Array.isArray(rowsSel)) return rowsSel;
    return [];
  };

  const clampContextMenuPosition = (x, y) => {
    const menuWidth = 220;
    const menuHeight = 160;
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 720;
    return {
      x: Math.max(8, Math.min(Number(x) || 0, viewportWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(Number(y) || 0, viewportHeight - menuHeight - 8)),
    };
  };

  const resolveContextMenuPosition = (event) => {
    const lastPointer = lastContextPointerRef.current;
    if (lastPointer && Date.now() - lastPointer.ts < 1500) {
      return clampContextMenuPosition(lastPointer.x, lastPointer.y);
    }
    const rect = gridShellRef.current?.getBoundingClientRect?.();
    const boundsX = Number(event?.bounds?.x || 0);
    const boundsY = Number(event?.bounds?.y || 0);
    const localX = Number(event?.localEventX || 0);
    const localY = Number(event?.localEventY || 0);
    let x = (rect?.left || 0) + boundsX + localX;
    let y = (rect?.top || 0) + boundsY + localY;
    return clampContextMenuPosition(x, y);
  };

  const applyDeleteRows = async (rowIndexes) => {
    if (!sessionId || !rowIndexes.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'delete_rows',
          params: { row_indices: rowIndexes },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to delete row(s)');
      setSelectedGridRows([]);
      setCellEdits({});
      await loadTable();
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Failed to delete row(s)');
    } finally {
      setBusy(false);
    }
  };

  const applyDeleteColumns = async (columnsToDelete) => {
    if (!sessionId || !columnsToDelete.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'delete_columns',
          params: { columns: columnsToDelete },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to delete column(s)');
      setCellEdits({});
      await loadTable();
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Failed to delete column(s)');
    } finally {
      setBusy(false);
    }
  };

  const applyDuplicateRows = async (rowIndexes) => {
    if (!sessionId || !rowIndexes.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'duplicate_rows',
          params: { row_indices: rowIndexes },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to duplicate row(s)');
      setCellEdits({});
      await loadTable();
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Failed to duplicate row(s)');
    } finally {
      setBusy(false);
    }
  };

  const applyDuplicateColumn = async (columnName) => {
    if (!sessionId || !columnName) return;
    setBusy(true);
    setError('');
    try {
      const previousColumns = tableData?.columns || [];
      const res = await fetch(`${API_BASE}/prepare/${sessionId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'duplicate_column',
          params: { column: columnName },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Failed to duplicate column');
      setCellEdits({});
      await loadTable(sessionId, { highlightFromColumns: previousColumns });
      await loadHistory();
    } catch (err) {
      setError(err.message || 'Failed to duplicate column');
    } finally {
      setBusy(false);
    }
  };

  const onContextAction = async (action, payload = null) => {
    if (!contextMenu) return;
    const menu = contextMenu;
    setContextMenu(null);
    setContextMenuSearch('');

    if (action === 'edit_cell') {
      // Inline editing is handled natively by the grid on double-click.
      return;
    }

    if (action === 'delete_row') {
      const rowIndexes = menu.targetRowIndexes || [];
      if (!rowIndexes.length) return;
      const ok = window.confirm(`Delete ${rowIndexes.length} row(s)?`);
      if (!ok) return;
      await applyDeleteRows(rowIndexes);
      return;
    }

    if (action === 'duplicate_row') {
      const rowIndexes = menu.targetRowIndexes || [];
      if (!rowIndexes.length) return;
      await applyDuplicateRows(rowIndexes);
      return;
    }

    if (action === 'add_row_before' || action === 'add_row_after') {
      const anchor = Number(menu.anchorRowIndex);
      if (!Number.isInteger(anchor)) return;
      const insertIndex = action === 'add_row_before' ? anchor : anchor + 1;
      openAddRowModal({ insertIndex, mode: action === 'add_row_before' ? 'before' : 'after' });
      return;
    }

    if (action === 'delete_column') {
      const cols = menu.targetColumns || [];
      if (!cols.length) return;
      const ok = window.confirm(`Delete column "${cols[0]}"?`);
      if (!ok) return;
      await applyDeleteColumns(cols);
      return;
    }

    if (action === 'duplicate_column') {
      const cols = menu.targetColumns || [];
      if (!cols.length) return;
      await applyDuplicateColumn(cols[0]);
      return;
    }

    if (action === 'apply_column_function') {
      const cols = menu.targetColumns || [];
      if (!cols.length) return;
      const targetOperation = String(payload || operation);
      setOperation(targetOperation);
      setOpParams((prev) => ({ ...prev, column: cols[0] }));
      setShowApplyModal(true);
    }
  };

  const openFunctionFromSearch = (operationValue) => {
    if (!operationValue) return;
    setOperation(operationValue);
    setShowApplyModal(true);
    const option = APPLY_FUNCTION_OPTIONS.find((item) => item.value === operationValue);
    setFunctionSearch(option?.label || '');
    setFunctionSearchOpen(false);
  };

  const autoMapMergeKeys = () => {
    const sourceSet = new Set(mergeSourceColumns);
    const matched = columns.filter((c) => sourceSet.has(c)).map((c) => ({ left: c, right: c }));
    setMergeKeyPairs(matched.length ? matched : [{ left: '', right: '' }]);
  };

  const onCopilotFullRunApplied = async () => {
    setDryRunPreview(null);
    setCellEdits({});
    await loadTable();
    await loadHistory();
  };

  const onCopilotDryRunApplied = (runPayload) => {
    if (!runPayload || !Array.isArray(runPayload.preview_rows)) return;
    setDryRunPreview({
      rows: Number(runPayload.rows || 0),
      sample: Number(runPayload.preview_rows.length || 0),
    });
    setTableData((prev) => ({
      ...(prev || {}),
      session_id: sessionId,
      dataset_id: datasetId,
      dataset_name: selectedMeta?.original_filename || prev?.dataset_name || '',
      columns: Array.isArray(runPayload.columns) ? runPayload.columns : (prev?.columns || []),
      rows: runPayload.preview_rows,
      total_rows: Number(runPayload.rows || runPayload.preview_rows.length || 0),
      offset: 0,
      limit: runPayload.preview_rows.length || PREP_PAGE_SIZE,
    }));
  };

  const clearDryRunPreview = async () => {
    if (!dryRunPreview) return;
    setDryRunPreview(null);
    await loadTable();
  };

  return (
    <section className="card prepare-screen">
      {loading ? <p className="help">Opening dataset...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {sessionId ? (
        <>
          <div className="prep-toolbar">
            <div className="function-search-bar">
              <input
                type="text"
                value={functionSearch}
                placeholder="Search function and press Enter..."
                onFocus={() => setFunctionSearchOpen(true)}
                onBlur={() => {
                  setTimeout(() => setFunctionSearchOpen(false), 120);
                }}
                onChange={(e) => {
                  setFunctionSearch(e.target.value);
                  setFunctionSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const first = filteredGlobalFunctions[0];
                    if (first) openFunctionFromSearch(first.value);
                  }
                }}
              />
              {functionSearchOpen ? (
                <div className="function-search-results">
                  {filteredGlobalFunctions.slice(0, 8).map((fn) => (
                    <button key={fn.value} type="button" onMouseDown={() => openFunctionFromSearch(fn.value)}>
                      <span className="function-result-label">{fn.label}</span>
                      <span className="function-result-desc">{FUNCTION_DOCS[fn.value]?.summary || 'No description available.'}</span>
                    </button>
                  ))}
                  {!filteredGlobalFunctions.length ? <div className="function-search-empty">No functions found.</div> : null}
                </div>
              ) : null}
            </div>

            <div className="prep-action-triggers">
              <button
                type="button"
                className="secondary prep-action-icon-btn"
                onClick={undo}
                disabled={busy || !history.can_undo}
                title="Undo"
                aria-label="Undo"
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                className="secondary prep-action-icon-btn"
                onClick={redo}
                disabled={busy || !history.can_redo}
                title="Redo"
                aria-label="Redo"
              >
                <Redo2 size={16} />
              </button>
              <button
                type="button"
                className="secondary prep-action-icon-btn"
                onClick={() => setShowRestoreModal(true)}
                disabled={busy || !checkpoints.length}
                title="Restore Checkpoint"
                aria-label="Restore Checkpoint"
              >
                <History size={16} />
              </button>
              <button
                type="button"
                className="prep-action-icon-btn"
                onClick={() => setShowSaveModal(true)}
                disabled={busy}
                title="Save Result"
                aria-label="Save Result"
              >
                <Save size={16} />
              </button>
            </div>
          </div>

          <div className="prep-workspace">
            <div className="prep-main">
              {dryRunPreview ? (
                <div className="prep-dryrun-banner">
                  <span>Dry-run preview shown in table (sample output).</span>
                  <button type="button" className="secondary" onClick={clearDryRunPreview}>Back to Live Table</button>
                </div>
              ) : null}
              <div className="table-wrap prep-grid-wrap">
                <div
                  className="glide-grid-shell"
                  ref={gridShellRef}
                  onContextMenuCapture={(e) => {
                    lastContextPointerRef.current = { x: e.clientX, y: e.clientY, ts: Date.now() };
                  }}
                  onWheelCapture={() => {
                    if (inlineEditor) commitInlineEditor(true);
                  }}
                  onTouchMoveCapture={() => {
                    if (inlineEditor) commitInlineEditor(true);
                  }}
                >
                  <DataEditor
                columns={gridColumns}
                rows={rows.length}
                getCellContent={getCellContent}
                onCellEdited={onCellEdited}
                cellActivationBehavior="double-click"
                onColumnResize={onColumnResize}
                onGridSelectionChange={(selection) => setSelectedGridRows(extractSelectedRows(selection))}
                onCellClicked={(cell, event) => {
                  if (!event?.isDoubleClick) return;
                  const colIndex = cell[0];
                  const rowIndex = cell[1];
                  if (colIndex < 0 || rowIndex < 0 || rowIndex >= rows.length) return;
                  const columnName = columns[colIndex];
                  if (!columnName) return;
                  const rowObj = rows[rowIndex] || {};
                  const currentValue = rowObj[columnName] == null ? '' : String(rowObj[columnName]);
                  const bounds = event.bounds || { x: 0, y: 0, width: 120, height: 28 };
                  const shellRect = gridShellRef.current?.getBoundingClientRect?.();
                  let left = Number(bounds.x || 0);
                  let top = Number(bounds.y || 0);
                  const width = Math.max(80, Number(bounds.width || 120));
                  const height = Math.max(28, Number(bounds.height || 28));
                  if (shellRect) {
                    const looksAbsolute =
                      left >= (shellRect.left - 2) &&
                      left <= (shellRect.right + 2) &&
                      top >= (shellRect.top - 2) &&
                      top <= (shellRect.bottom + 2);
                    if (looksAbsolute) {
                      left -= shellRect.left;
                      top -= shellRect.top;
                    } else {
                      const outOfLocalRange = left > shellRect.width || top > shellRect.height || left < 0 || top < 0;
                      if (outOfLocalRange) {
                        left -= shellRect.left;
                        top -= shellRect.top;
                      }
                    }
                  }
                  setInlineEditor({
                    row: rowIndex,
                    col: colIndex,
                    columnName,
                    value: currentValue,
                    invalid: false,
                    x: Math.max(0, left),
                    y: Math.max(0, top),
                    width,
                    height,
                  });
                }}
                onVisibleRegionChanged={(region) => {
                  if (inlineEditor) {
                    commitInlineEditor(true);
                  }
                  const loadedRows = rows.length;
                  const totalRows = tableData?.total_rows || 0;
                  if (!loadedRows || loadedRows >= totalRows) return;
                  const lastVisibleRow = Number(region?.y || 0) + Number(region?.height || 0);
                  if (lastVisibleRow >= loadedRows - PREFETCH_BUFFER_ROWS) {
                    loadMoreRows();
                  }
                }}
                onCellContextMenu={(cell, event) => {
                  if (dryRunPreview) return;
                  event.preventDefault();
                  const colIndex = cell[0];
                  const rowIndex = cell[1];
                  // Only allow context menu on row headers.
                  if (colIndex !== -1 || rowIndex < 0 || rowIndex >= rows.length) return;
                  const rowObj = rows[rowIndex];
                  const { x, y } = resolveContextMenuPosition(event);
                  const selectedActualRows = selectedGridRows
                    .map((gridRow) => rows[gridRow]?._row_index)
                    .filter((idx) => Number.isInteger(idx));
                  const hasSelectedRows = selectedActualRows.length > 0;
                  const targetRows = hasSelectedRows
                    ? selectedActualRows
                    : [rowObj?._row_index].filter((idx) => Number.isInteger(idx));

                  setContextMenu({
                    x,
                    y,
                    rowIndex,
                    anchorRowIndex: rowObj?._row_index,
                    columnName: null,
                    targetRowIndexes: targetRows,
                    targetColumns: [],
                  });
                  setContextMenuSearch('');
                }}
                onHeaderContextMenu={(colIndex, event) => {
                  if (dryRunPreview) return;
                  event.preventDefault();
                  const colName = columns[colIndex];
                  if (!colName) return;
                  const { x, y } = resolveContextMenuPosition(event);
                  setContextMenu({
                    x,
                    y,
                    rowIndex: null,
                    columnName: colName,
                    targetRowIndexes: [],
                    targetColumns: [colName],
                  });
                  setContextMenuSearch('');
                }}
                onHeaderClicked={(colIndex) => {
                  const colName = columns[colIndex];
                  if (!colName) return;
                  setSelectedInsightColumn(colName);
                }}
                onHeaderMenuClick={(colIndex, bounds) => {
                  const colName = columns[colIndex];
                  if (!colName) return;
                  const { x, y } = clampContextMenuPosition(
                    Number(bounds?.x || 0) + Number(bounds?.width || 0) - 8,
                    Number(bounds?.y || 0) + Number(bounds?.height || 0) + 4
                  );
                  setContextMenu({
                    x,
                    y,
                    rowIndex: null,
                    columnName: colName,
                    targetRowIndexes: [],
                    targetColumns: [colName],
                  });
                  setContextMenuSearch('');
                }}
                rowMarkers="both"
                rowSelectionMode="multi"
                width="100%"
                height={560}
                smoothScrollX
                smoothScrollY
              />
                  {inlineEditor ? (
                    <input
                      className={`inline-cell-editor${inlineEditor.invalid ? ' invalid' : ''}`}
                      style={{
                        left: inlineEditor.x,
                        top: inlineEditor.y,
                        width: inlineEditor.width,
                        height: inlineEditor.height,
                      }}
                      value={inlineEditor.value}
                      autoFocus
                      onChange={(e) => setInlineEditor((prev) => (prev ? { ...prev, value: e.target.value, invalid: false } : prev))}
                      onBlur={() => commitInlineEditor(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitInlineEditor(true);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          commitInlineEditor(false);
                        }
                      }}
                    />
                  ) : null}
                </div>
              </div>
              {!loading && tableData ? (
                <p className="help table-footer-status">
                  Loaded {(tableData.rows || []).length} of {tableData.total_rows || 0} rows
                  {loadingMore ? ' (loading more...)' : ''}
                  {' '}| Undo: {history.undo_count} | Redo: {history.redo_count} | Checkpoints: {history.checkpoint_count}
                </p>
              ) : null}
            </div>

          </div>

          {contextMenu ? (
            <div
              ref={contextMenuRef}
              className="context-menu"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onMouseLeave={() => {
                setContextMenu(null);
                setContextMenuSearch('');
              }}
            >
              {contextMenu.targetRowIndexes?.length ? (
                <button type="button" onClick={() => onContextAction('add_row_before')}>
                  Add Row Before
                </button>
              ) : null}
              {contextMenu.targetRowIndexes?.length ? (
                <button type="button" onClick={() => onContextAction('add_row_after')}>
                  Add Row After
                </button>
              ) : null}
              {contextMenu.targetRowIndexes?.length ? (
                <button type="button" onClick={() => onContextAction('duplicate_row')}>
                  Duplicate Row{contextMenu.targetRowIndexes.length > 1 ? 's' : ''}
                </button>
              ) : null}
              {contextMenu.targetRowIndexes?.length ? (
                <button type="button" onClick={() => onContextAction('delete_row')}>
                  Delete Row{contextMenu.targetRowIndexes.length > 1 ? 's' : ''}
                </button>
              ) : null}
              {contextMenu.targetColumns?.length ? (
                <>
                  <div className="context-menu-search">
                    <input
                      type="text"
                      value={contextMenuSearch}
                      placeholder="Search functions..."
                      onChange={(e) => setContextMenuSearch(e.target.value)}
                    />
                  </div>
                  <div className="context-menu-function-list">
                    {filteredColumnFunctions.map((fn) => (
                      <button key={fn.value} type="button" onClick={() => onContextAction('apply_column_function', fn.value)}>
                        <span className="function-result-label">{fn.label}</span>
                        <span className="function-result-desc">{FUNCTION_DOCS[fn.value]?.summary || 'No description available.'}</span>
                      </button>
                    ))}
                    {!filteredColumnFunctions.length ? (
                      <div className="context-menu-empty">No functions found.</div>
                    ) : null}
                  </div>
                </>
              ) : null}
              {contextMenu.targetColumns?.length ? (
                <button type="button" onClick={() => onContextAction('duplicate_column')}>
                  Duplicate Column
                </button>
              ) : null}
              {contextMenu.targetColumns?.length ? (
                <button type="button" onClick={() => onContextAction('delete_column')}>
                  Delete Column
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {showApplyModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className={`modal-card apply-function-modal${showFunctionDocPanel ? ' docs-open' : ''}`}>
            <button
              type="button"
              className="function-help-corner"
              onClick={() => setShowFunctionDocPanel((v) => !v)}
              title="Open function documentation"
              aria-label="Open function documentation"
            >
              ?
            </button>
            <h3>Apply Function</h3>
            <p className="help">Choose a transformation and apply it to the active dataset.</p>

            <label>
              Operation
              <select value={operation} onChange={(e) => setOperation(e.target.value)}>
                {APPLY_FUNCTION_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.values.map((value) => {
                      const fn = APPLY_FUNCTION_OPTIONS.find((item) => item.value === value);
                      if (!fn) return null;
                      return <option key={fn.value} value={fn.value}>{fn.label}</option>;
                    })}
                  </optgroup>
                ))}
              </select>
            </label>

            {operation === 'merge_datasets' ? (
              <>
                <label>
                  {opParams.merge_mode === 'append' ? 'Source Datasets' : 'Source Dataset'}
                  <div className="inline">
                    <button type="button" className="secondary" onClick={() => setShowDatasetExplorerModal(true)}>
                      Open Data Explorer
                    </button>
                    <span className="dataset-pill">
                      {opParams.merge_mode === 'append'
                        ? mergeAppendSelectionLabel
                        : (mergeSourceDataset ? mergeSourceDataset.original_filename : 'No dataset selected')}
                    </span>
                  </div>
                </label>
                <label>
                  Merge Mode
                  <select
                    value={opParams.merge_mode}
                    onChange={(e) => {
                      const nextMode = e.target.value;
                      setOpParams((prev) => {
                        if (nextMode !== 'join_on_keys') return { ...prev, merge_mode: nextMode };
                        const fallbackSourceId = prev.merge_source_dataset_id
                          || (Array.isArray(prev.merge_source_dataset_ids) ? prev.merge_source_dataset_ids[0] : '')
                          || '';
                        return { ...prev, merge_mode: nextMode, merge_source_dataset_id: fallbackSourceId };
                      });
                    }}
                  >
                    <option value="append">Simple Append</option>
                    <option value="join_on_keys">Join On Keys</option>
                  </select>
                </label>
                {opParams.merge_mode === 'join_on_keys' ? (
                  <>
                    <div className="join-type-grid">
                      {[
                        { value: 'inner', label: 'Inner', hint: 'Only matching rows from both datasets.' },
                        { value: 'left', label: 'Left', hint: 'All rows from active dataset + matches.' },
                        { value: 'right', label: 'Right', hint: 'All rows from source dataset + matches.' },
                        { value: 'outer', label: 'Outer', hint: 'All rows from both datasets.' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`join-type-card${opParams.merge_join_how === opt.value ? ' active' : ''}`}
                          onClick={() => setOpParams((p) => ({ ...p, merge_join_how: opt.value }))}
                        >
                          <svg viewBox="0 0 110 58" className="join-venn" aria-hidden="true">
                            <defs>
                              <clipPath id={`join-left-${opt.value}`}>
                                <circle cx="42" cy="30" r="20" />
                              </clipPath>
                              <clipPath id={`join-right-${opt.value}`}>
                                <circle cx="68" cy="30" r="20" />
                              </clipPath>
                            </defs>
                            <text x="32" y="12" className="join-venn-label">L</text>
                            <text x="74" y="12" className="join-venn-label">R</text>
                            <circle
                              cx="42"
                              cy="30"
                              r="20"
                              fill={opt.value === 'left' || opt.value === 'outer' ? 'rgba(59,130,246,0.36)' : 'rgba(148,163,184,0.12)'}
                              stroke="#3b82f6"
                            />
                            <circle
                              cx="68"
                              cy="30"
                              r="20"
                              fill={opt.value === 'right' || opt.value === 'outer' ? 'rgba(16,185,129,0.36)' : 'rgba(148,163,184,0.12)'}
                              stroke="#10b981"
                            />
                            {opt.value === 'inner' || opt.value === 'outer' ? (
                              <circle
                                cx="42"
                                cy="30"
                                r="20"
                                fill={opt.value === 'inner' ? 'rgba(245,158,11,0.62)' : 'rgba(14,165,233,0.32)'}
                                clipPath={`url(#join-right-${opt.value})`}
                              />
                            ) : null}
                          </svg>
                          <strong>{opt.label}</strong>
                          <span>{opt.hint}</span>
                        </button>
                      ))}
                    </div>

                    <div className="label">
                      <span>Key Mapping</span>
                      <div className="join-key-actions">
                        <button type="button" className="secondary" onClick={autoMapMergeKeys}>Auto Match Names</button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setMergeKeyPairs((prev) => [...prev, { left: '', right: '' }])}
                        >
                          Add Key Pair
                        </button>
                      </div>
                      <div className="join-key-list">
                        {mergeKeyPairs.map((pair, idx) => (
                          <div className="join-key-row" key={`pair-${idx}`}>
                            <select
                              value={pair.left}
                              onChange={(e) => setMergeKeyPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, left: e.target.value } : p)))}
                            >
                              <option value="">Left key (active)</option>
                              {columns.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <span className="join-arrow">{'->'}</span>
                            <select
                              value={pair.right}
                              onChange={(e) => setMergeKeyPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, right: e.target.value } : p)))}
                            >
                              <option value="">Right key (source)</option>
                              {mergeSourceColumns.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setMergeKeyPairs((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))}
                              disabled={mergeKeyPairs.length <= 1}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}

            {['fill_missing', 'trim_whitespace', 'cast_column', 'bin_numeric_categories', 'auto_binning', 'unit_convert', 'min_max_scaling', 'max_absolute_scaling', 'mean_normalization', 'unit_vector_scaling', 'decimal_scaling', 'z_score_scaling', 'robust_scaling', 'log_scaling', 'quantile_transform', 'normalize_text_case', 'sort_rows', 'delete_rows_condition', 'replace_values', 'rename_column', 'clip_values', 'remove_outliers_iqr', 'encode_categorical', 'split_column', 'extract_date_part', 'date_diff_days', 'datetime_floor', 'shift_column', 'cyclical_encoding', 'significant_lags_kendall', 'rolling_window_stats_nested', ...MATH_SINGLE_COLUMN_OPS, 'stats_zscore', 'stats_percentile_rank', 'stats_rolling_mean', 'stats_variance', 'stats_std'].includes(operation) ? (
              <label>
                Column
                <select value={opParams.column} onChange={(e) => setOpParams((p) => ({ ...p, column: e.target.value }))}>
                  <option value="">{operation === 'replace_values' || operation === 'fill_missing' || operation === 'trim_whitespace' ? 'All / Select' : 'Select column'}</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {operation === 'delete_rows_condition' ? (
              <>
                <label>
                  Condition
                  <select
                    value={opParams.delete_condition_operator}
                    onChange={(e) => setOpParams((p) => ({ ...p, delete_condition_operator: e.target.value }))}
                  >
                    <option value="eq">equals</option>
                    <option value="ne">not equals</option>
                    <option value="gt">greater than</option>
                    <option value="gte">greater than or equal</option>
                    <option value="lt">less than</option>
                    <option value="lte">less than or equal</option>
                    <option value="contains">contains</option>
                    <option value="not_contains">does not contain</option>
                    <option value="starts_with">starts with</option>
                    <option value="ends_with">ends with</option>
                    <option value="is_null">is null</option>
                    <option value="is_not_null">is not null</option>
                  </select>
                </label>
                {!['is_null', 'is_not_null'].includes(opParams.delete_condition_operator) ? (
                  <label>
                    Value
                    <input
                      value={opParams.delete_condition_value}
                      onChange={(e) => setOpParams((p) => ({ ...p, delete_condition_value: e.target.value }))}
                    />
                  </label>
                ) : null}
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={opParams.delete_condition_case_sensitive}
                    onChange={(e) => setOpParams((p) => ({ ...p, delete_condition_case_sensitive: e.target.checked }))}
                  />
                  Case Sensitive
                </label>
              </>
            ) : null}

            {operation === 'fill_missing' ? (
              <>
                <label>
                  Strategy
                  <select value={opParams.strategy} onChange={(e) => setOpParams((p) => ({ ...p, strategy: e.target.value }))}>
                    <option value="value">Custom Value</option>
                    <option value="mean">Mean</option>
                    <option value="median">Median</option>
                    <option value="mode">Mode</option>
                    <option value="ffill">Forward Fill</option>
                    <option value="bfill">Backward Fill</option>
                  </select>
                </label>
                {opParams.strategy === 'value' ? (
                  <label>
                    Value
                    <input value={opParams.value} onChange={(e) => setOpParams((p) => ({ ...p, value: e.target.value }))} />
                  </label>
                ) : null}
              </>
            ) : null}

            {operation === 'sort_rows' ? (
              <label>
                Order
                <select value={opParams.ascending} onChange={(e) => setOpParams((p) => ({ ...p, ascending: e.target.value }))}>
                  <option value="true">Ascending</option>
                  <option value="false">Descending</option>
                </select>
              </label>
            ) : null}

            {operation === 'replace_values' ? (
              <>
                <label>
                  Find
                  <input value={opParams.find} onChange={(e) => setOpParams((p) => ({ ...p, find: e.target.value }))} />
                </label>
                <label>
                  Replace With
                  <input value={opParams.replace} onChange={(e) => setOpParams((p) => ({ ...p, replace: e.target.value }))} />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={opParams.regex}
                    onChange={(e) => setOpParams((p) => ({ ...p, regex: e.target.checked }))}
                  />
                  Use Regex
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={opParams.case_sensitive}
                    onChange={(e) => setOpParams((p) => ({ ...p, case_sensitive: e.target.checked }))}
                  />
                  Case Sensitive
                </label>
              </>
            ) : null}

            {operation === 'split_column' ? (
              <>
                <label>
                  Delimiter
                  <input value={opParams.delimiter} onChange={(e) => setOpParams((p) => ({ ...p, delimiter: e.target.value }))} />
                </label>
                <label>
                  Max Split (optional)
                  <input value={opParams.maxsplit} onChange={(e) => setOpParams((p) => ({ ...p, maxsplit: e.target.value }))} />
                </label>
                <label>
                  New Columns (comma separated, optional)
                  <input value={opParams.new_columns} onChange={(e) => setOpParams((p) => ({ ...p, new_columns: e.target.value }))} />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={opParams.drop_original}
                    onChange={(e) => setOpParams((p) => ({ ...p, drop_original: e.target.checked }))}
                  />
                  Drop Original Column
                </label>
              </>
            ) : null}

            {operation === 'merge_columns' ? (
              <>
                <div className="label">
                  <span>Columns</span>
                  <details className="checkbox-multiselect">
                    <summary>{parseColumnList(opParams.columns_multi).length || 0} selected</summary>
                    <div className="checkbox-multiselect-list">
                      {columns.map((c) => (
                        <label key={c} className="check">
                          <input
                            type="checkbox"
                            checked={parseColumnList(opParams.columns_multi).includes(c)}
                            onChange={() => toggleMultiColumnParam('columns_multi', c)}
                          />
                          <span>{c}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
                <label>
                  New Column Name
                  <input value={opParams.new_name} onChange={(e) => setOpParams((p) => ({ ...p, new_name: e.target.value }))} />
                </label>
                <label>
                  Separator
                  <input value={opParams.separator} onChange={(e) => setOpParams((p) => ({ ...p, separator: e.target.value }))} />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={opParams.skip_null}
                    onChange={(e) => setOpParams((p) => ({ ...p, skip_null: e.target.checked }))}
                  />
                  Skip Null/Empty Values
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={opParams.drop_source}
                    onChange={(e) => setOpParams((p) => ({ ...p, drop_source: e.target.checked }))}
                  />
                  Drop Source Columns
                </label>
              </>
            ) : null}

            {operation === 'derive_column' ? (
              <>
                <label>
                  New Column Name
                  <input value={opParams.new_name} onChange={(e) => setOpParams((p) => ({ ...p, new_name: e.target.value }))} />
                </label>
                <label>
                  Formula Expression
                  <input
                    placeholder="`col_a` + `col_b`"
                    value={opParams.expression}
                    onChange={(e) => setOpParams((p) => ({ ...p, expression: e.target.value }))}
                  />
                </label>
                <p className="help">Use pandas eval syntax. Wrap spaced column names in backticks.</p>
              </>
            ) : null}

            {operation === 'group_aggregate' ? (
              <>
                <div className="label">
                  <span>Group By Columns</span>
                  <details className="checkbox-multiselect">
                    <summary>{parseColumnList(opParams.group_by).length || 0} selected</summary>
                    <div className="checkbox-multiselect-list">
                      {columns.map((c) => (
                        <label key={c} className="check">
                          <input
                            type="checkbox"
                            checked={parseColumnList(opParams.group_by).includes(c)}
                            onChange={() => toggleMultiColumnParam('group_by', c)}
                          />
                          <span>{c}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
                <label>
                  Aggregate Column
                  <select value={opParams.agg_column} onChange={(e) => setOpParams((p) => ({ ...p, agg_column: e.target.value }))}>
                    <option value="">Select column</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Aggregation Function
                  <select value={opParams.agg_func} onChange={(e) => setOpParams((p) => ({ ...p, agg_func: e.target.value }))}>
                    <option value="count">count</option>
                    <option value="nunique">nunique</option>
                    <option value="sum">sum</option>
                    <option value="mean">mean</option>
                    <option value="median">median</option>
                    <option value="min">min</option>
                    <option value="max">max</option>
                    <option value="std">std</option>
                  </select>
                </label>
                <label>
                  Output Alias (optional)
                  <input
                    placeholder="sales_sum"
                    value={opParams.agg_alias}
                    onChange={(e) => setOpParams((p) => ({ ...p, agg_alias: e.target.value }))}
                  />
                </label>
              </>
            ) : null}

            {operation === 'drop_missing_rows' || operation === 'drop_duplicates' ? (
              <div className="label">
                <span>Subset Columns</span>
                <details className="checkbox-multiselect">
                  <summary>{parseColumnList(opParams.subset).length || 0} selected</summary>
                  <div className="checkbox-multiselect-list">
                    {columns.map((c) => (
                      <label key={c} className="check">
                        <input
                          type="checkbox"
                          checked={parseColumnList(opParams.subset).includes(c)}
                          onChange={() => toggleMultiColumnParam('subset', c)}
                        />
                        <span>{c}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            ) : null}

            {operation === 'drop_missing_rows' ? (
              <label>
                Drop Rule
                <select value={opParams.how} onChange={(e) => setOpParams((p) => ({ ...p, how: e.target.value }))}>
                  <option value="any">Any missing in subset</option>
                  <option value="all">All missing in subset</option>
                </select>
              </label>
            ) : null}

            {operation === 'cast_column' ? (
              <label>
                Target Type
                <select value={opParams.dtype} onChange={(e) => setOpParams((p) => ({ ...p, dtype: e.target.value }))}>
                  <option value="numeric">numeric</option>
                  <option value="string">string</option>
                  <option value="datetime">datetime</option>
                  <option value="boolean">boolean</option>
                </select>
              </label>
            ) : null}

            {operation === 'delete_columns' ? (
              <div className="label">
                <span>Columns To Delete</span>
                <details className="checkbox-multiselect">
                  <summary>{parseColumnList(opParams.delete_columns_multi).length || 0} selected</summary>
                  <div className="checkbox-multiselect-list">
                    {columns.map((c) => (
                      <label key={c} className="check">
                        <input
                          type="checkbox"
                          checked={parseColumnList(opParams.delete_columns_multi).includes(c)}
                          onChange={() => toggleMultiColumnParam('delete_columns_multi', c)}
                        />
                        <span>{c}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            ) : null}

            {operation === 'unit_convert' ? (
              <>
                <label>
                  Unit Family
                  <select value={opParams.unit_category} onChange={(e) => setOpParams((p) => ({ ...p, unit_category: e.target.value }))}>
                    {Object.keys(UNIT_CONVERSION_OPTIONS).map((key) => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </label>
                <label>
                  From Unit
                  <select value={opParams.unit_from} onChange={(e) => setOpParams((p) => ({ ...p, unit_from: e.target.value }))}>
                    <option value="">Select source unit</option>
                    {(UNIT_CONVERSION_OPTIONS[opParams.unit_category] || []).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  To Unit
                  <select value={opParams.unit_to} onChange={(e) => setOpParams((p) => ({ ...p, unit_to: e.target.value }))}>
                    <option value="">Select target unit</option>
                    {(UNIT_CONVERSION_OPTIONS[opParams.unit_category] || []).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(opParams.unit_overwrite)}
                    onChange={(e) => setOpParams((p) => ({ ...p, unit_overwrite: e.target.checked }))}
                  />
                  <span>Overwrite Source Column</span>
                </label>
                <label>
                  New Column Name (optional)
                  <input
                    value={opParams.unit_new_name}
                    onChange={(e) => setOpParams((p) => ({ ...p, unit_new_name: e.target.value }))}
                    placeholder="distance_km"
                  />
                </label>
              </>
            ) : null}

            {operation === 'bin_numeric_categories' ? (
              <>
                <label>
                  Range Rules
                  <textarea
                    value={opParams.bin_rules_text}
                    onChange={(e) => setOpParams((p) => ({ ...p, bin_rules_text: e.target.value }))}
                    placeholder={'0-3:toddler\n4-10:child\n>=65:senior'}
                    rows={5}
                  />
                </label>
                <p className="help">Rules: <code>min-max:label</code>, <code>&lt;x:label</code>, <code>&lt;=x:label</code>, <code>&gt;x:label</code>, <code>&gt;=x:label</code>. One per line.</p>
                <label>
                  Default Label (optional)
                  <input
                    value={opParams.bin_default_label}
                    onChange={(e) => setOpParams((p) => ({ ...p, bin_default_label: e.target.value }))}
                    placeholder="other"
                  />
                </label>
                <label>
                  New Column Name (optional)
                  <input
                    value={opParams.bin_new_name}
                    onChange={(e) => setOpParams((p) => ({ ...p, bin_new_name: e.target.value }))}
                    placeholder="age_group"
                  />
                </label>
              </>
            ) : null}

            {operation === 'auto_binning' ? (
              <>
                <label>
                  Method
                  <select value={opParams.auto_bin_method} onChange={(e) => setOpParams((p) => ({ ...p, auto_bin_method: e.target.value }))}>
                    <option value="equal_width">Equal Width</option>
                    <option value="equal_frequency">Equal Frequency (Quantile)</option>
                    <option value="kmeans">K-Means</option>
                    <option value="jenks">Jenks Natural Breaks</option>
                    <option value="decision_tree">Decision Tree (Supervised)</option>
                    <option value="chimerge">ChiMerge (Supervised)</option>
                    <option value="mdlp">MDLP (Supervised)</option>
                    <option value="domain_threshold">Domain Thresholds</option>
                  </select>
                </label>
                {opParams.auto_bin_method !== 'domain_threshold' ? (
                  <label>
                    Bin Count
                    <input
                      value={opParams.auto_bin_bins}
                      onChange={(e) => setOpParams((p) => ({ ...p, auto_bin_bins: e.target.value }))}
                      placeholder="5"
                    />
                  </label>
                ) : null}
                {['decision_tree', 'chimerge', 'mdlp'].includes(opParams.auto_bin_method) ? (
                  <label>
                    Target Column
                    <select
                      value={opParams.auto_bin_target_column}
                      onChange={(e) => setOpParams((p) => ({ ...p, auto_bin_target_column: e.target.value }))}
                    >
                      <option value="">Select target column</option>
                      {columns.filter((c) => c !== opParams.column).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {opParams.auto_bin_method === 'chimerge' ? (
                  <label>
                    Chi-Square Threshold
                    <input
                      value={opParams.auto_bin_chi2_threshold}
                      onChange={(e) => setOpParams((p) => ({ ...p, auto_bin_chi2_threshold: e.target.value }))}
                      placeholder="3.841"
                    />
                  </label>
                ) : null}
                {opParams.auto_bin_method === 'domain_threshold' ? (
                  <>
                    <label>
                      Thresholds (comma-separated)
                      <input
                        value={opParams.auto_bin_thresholds}
                        onChange={(e) => setOpParams((p) => ({ ...p, auto_bin_thresholds: e.target.value }))}
                        placeholder="3,10,18"
                      />
                    </label>
                    <label>
                      Labels (comma-separated, optional)
                      <input
                        value={opParams.auto_bin_labels}
                        onChange={(e) => setOpParams((p) => ({ ...p, auto_bin_labels: e.target.value }))}
                        placeholder="toddler,child,teen,adult"
                      />
                    </label>
                  </>
                ) : null}
                <label>
                  New Column Name (optional)
                  <input
                    value={opParams.auto_bin_new_name}
                    onChange={(e) => setOpParams((p) => ({ ...p, auto_bin_new_name: e.target.value }))}
                    placeholder="age_bin"
                  />
                </label>
              </>
            ) : null}

            {['min_max_scaling', 'max_absolute_scaling', 'mean_normalization', 'unit_vector_scaling', 'decimal_scaling', 'z_score_scaling', 'robust_scaling'].includes(operation) ? (
              <label>
                New Column Name (optional)
                <input
                  value={opParams.scaling_new_name}
                  onChange={(e) => setOpParams((p) => ({ ...p, scaling_new_name: e.target.value }))}
                  placeholder="leave empty for auto name"
                />
              </label>
            ) : null}

            {operation === 'log_scaling' ? (
              <>
                <label>
                  Log Base
                  <select value={opParams.log_base} onChange={(e) => setOpParams((p) => ({ ...p, log_base: e.target.value }))}>
                    <option value="e">Natural Log (e)</option>
                    <option value="10">Log10</option>
                    <option value="2">Log2</option>
                  </select>
                </label>
                <label>
                  Shift Mode
                  <select value={opParams.log_shift_mode} onChange={(e) => setOpParams((p) => ({ ...p, log_shift_mode: e.target.value }))}>
                    <option value="auto">Auto Shift</option>
                    <option value="custom">Custom Shift</option>
                  </select>
                </label>
                {opParams.log_shift_mode === 'custom' ? (
                  <label>
                    Shift Value
                    <input value={opParams.log_shift} onChange={(e) => setOpParams((p) => ({ ...p, log_shift: e.target.value }))} />
                  </label>
                ) : null}
                <label>
                  New Column Name (optional)
                  <input
                    value={opParams.scaling_new_name}
                    onChange={(e) => setOpParams((p) => ({ ...p, scaling_new_name: e.target.value }))}
                    placeholder="leave empty for auto name"
                  />
                </label>
              </>
            ) : null}

            {operation === 'quantile_transform' ? (
              <>
                <label>
                  Output Distribution
                  <select
                    value={opParams.quantile_output_distribution}
                    onChange={(e) => setOpParams((p) => ({ ...p, quantile_output_distribution: e.target.value }))}
                  >
                    <option value="uniform">Uniform</option>
                    <option value="normal">Normal</option>
                  </select>
                </label>
                <label>
                  Number of Quantiles (optional)
                  <input
                    value={opParams.quantile_n}
                    onChange={(e) => setOpParams((p) => ({ ...p, quantile_n: e.target.value }))}
                    placeholder="auto"
                  />
                </label>
                <label>
                  New Column Name (optional)
                  <input
                    value={opParams.scaling_new_name}
                    onChange={(e) => setOpParams((p) => ({ ...p, scaling_new_name: e.target.value }))}
                    placeholder="leave empty for auto name"
                  />
                </label>
              </>
            ) : null}

            {operation === 'rename_column' ? (
              <label>
                New Column Name
                <input value={opParams.new_name} onChange={(e) => setOpParams((p) => ({ ...p, new_name: e.target.value }))} />
              </label>
            ) : null}

            {operation === 'clip_values' ? (
              <>
                <label>
                  Min (optional)
                  <input value={opParams.min} onChange={(e) => setOpParams((p) => ({ ...p, min: e.target.value }))} />
                </label>
                <label>
                  Max (optional)
                  <input value={opParams.max} onChange={(e) => setOpParams((p) => ({ ...p, max: e.target.value }))} />
                </label>
              </>
            ) : null}

            {operation === 'remove_outliers_iqr' ? (
              <>
                <label>
                  Method
                  <select value={opParams.outlier_method} onChange={(e) => setOpParams((p) => ({ ...p, outlier_method: e.target.value }))}>
                    <option value="iqr">Box Plot (IQR)</option>
                    <option value="zscore">Z-Score</option>
                  </select>
                </label>
                {opParams.outlier_method === 'zscore' ? (
                  <label>
                    Z-Score Threshold
                    <input value={opParams.z_threshold} onChange={(e) => setOpParams((p) => ({ ...p, z_threshold: e.target.value }))} />
                  </label>
                ) : (
                  <label>
                    IQR Factor
                    <input value={opParams.factor} onChange={(e) => setOpParams((p) => ({ ...p, factor: e.target.value }))} />
                  </label>
                )}
                <label>
                  Action
                  <select value={opParams.outlier_mode} onChange={(e) => setOpParams((p) => ({ ...p, outlier_mode: e.target.value }))}>
                    <option value="drop">Drop Outlier Rows</option>
                    <option value="clip">Clip to Bounds</option>
                  </select>
                </label>
              </>
            ) : null}

            {operation === 'encode_categorical' ? (
              <label>
                Encoding Method
                <select value={opParams.encode_method} onChange={(e) => setOpParams((p) => ({ ...p, encode_method: e.target.value }))}>
                  <option value="label">Label Encode</option>
                  <option value="one_hot">One-Hot Encode</option>
                </select>
              </label>
            ) : null}

            {operation === 'normalize_text_case' ? (
              <label>
                Case
                <select value={opParams.case} onChange={(e) => setOpParams((p) => ({ ...p, case: e.target.value }))}>
                  <option value="lower">lower</option>
                  <option value="upper">upper</option>
                  <option value="title">title</option>
                </select>
              </label>
            ) : null}

            {operation === 'extract_date_part' ? (
              <>
                <label>
                  Date Part
                  <select value={opParams.date_part} onChange={(e) => setOpParams((p) => ({ ...p, date_part: e.target.value }))}>
                    <option value="year">year</option>
                    <option value="quarter">quarter</option>
                    <option value="month">month</option>
                    <option value="week">week</option>
                    <option value="day">day</option>
                    <option value="dayofweek">dayofweek</option>
                    <option value="hour">hour</option>
                    <option value="minute">minute</option>
                  </select>
                </label>
                <label>
                  New Column Name (optional)
                  <input value={opParams.new_name} onChange={(e) => setOpParams((p) => ({ ...p, new_name: e.target.value }))} />
                </label>
              </>
            ) : null}

            {operation === 'date_diff_days' ? (
              <>
                <label>
                  Reference Column (optional)
                  <select value={opParams.date_reference_column} onChange={(e) => setOpParams((p) => ({ ...p, date_reference_column: e.target.value }))}>
                    <option value="">Use fixed date below</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Reference Date (optional)
                  <input
                    value={opParams.date_reference_date}
                    placeholder="YYYY-MM-DD"
                    onChange={(e) => setOpParams((p) => ({ ...p, date_reference_date: e.target.value }))}
                  />
                </label>
                <label>
                  New Column Name (optional)
                  <input value={opParams.date_diff_new_name} onChange={(e) => setOpParams((p) => ({ ...p, date_diff_new_name: e.target.value }))} />
                </label>
              </>
            ) : null}

            {operation === 'datetime_floor' ? (
              <>
                <label>
                  Granularity
                  <select value={opParams.date_floor_granularity} onChange={(e) => setOpParams((p) => ({ ...p, date_floor_granularity: e.target.value }))}>
                    <option value="day">day</option>
                    <option value="week">week</option>
                    <option value="month">month</option>
                    <option value="hour">hour</option>
                    <option value="minute">minute</option>
                  </select>
                </label>
                <label>
                  New Column Name (optional)
                  <input
                    value={opParams.date_floor_new_name}
                    placeholder="leave empty to overwrite source"
                    onChange={(e) => setOpParams((p) => ({ ...p, date_floor_new_name: e.target.value }))}
                  />
                </label>
              </>
            ) : null}

            {operation === 'shift_column' ? (
              <>
                <label>
                  Direction
                  <select value={opParams.shift_direction} onChange={(e) => setOpParams((p) => ({ ...p, shift_direction: e.target.value }))}>
                    <option value="down">Down (Lag)</option>
                    <option value="up">Up (Lead)</option>
                  </select>
                </label>
                <label>
                  Number of Shifts
                  <input
                    value={opParams.shift_periods}
                    onChange={(e) => setOpParams((p) => ({ ...p, shift_periods: e.target.value }))}
                    placeholder="1"
                  />
                </label>
                <label>
                  Fill Value (optional)
                  <input
                    value={opParams.shift_fill_value}
                    onChange={(e) => setOpParams((p) => ({ ...p, shift_fill_value: e.target.value }))}
                    placeholder="leave empty for null"
                  />
                </label>
                <label>
                  New Column Name (optional)
                  <input
                    value={opParams.shift_new_name}
                    onChange={(e) => setOpParams((p) => ({ ...p, shift_new_name: e.target.value }))}
                    placeholder="sales_lag_1"
                  />
                </label>
              </>
            ) : null}

            {operation === 'cyclical_encoding' ? (
              <>
                <label>
                  Value Source
                  <select value={opParams.cyclical_value_source} onChange={(e) => setOpParams((p) => ({ ...p, cyclical_value_source: e.target.value }))}>
                    <option value="auto">Auto</option>
                    <option value="raw">Raw Numeric Values</option>
                    <option value="hour_of_day">Hour of Day</option>
                    <option value="day_of_week">Day of Week</option>
                    <option value="day_of_month">Day of Month</option>
                    <option value="month_of_year">Month of Year</option>
                    <option value="week_of_year">Week of Year</option>
                  </select>
                </label>
                <label>
                  Period (optional)
                  <input
                    value={opParams.cyclical_period}
                    onChange={(e) => setOpParams((p) => ({ ...p, cyclical_period: e.target.value }))}
                    placeholder="24 for hour, 7 for day_of_week"
                  />
                </label>
                <label>
                  Offset (optional)
                  <input
                    value={opParams.cyclical_offset}
                    onChange={(e) => setOpParams((p) => ({ ...p, cyclical_offset: e.target.value }))}
                    placeholder="0"
                  />
                </label>
                <label>
                  Prefix (optional)
                  <input
                    value={opParams.cyclical_prefix}
                    onChange={(e) => setOpParams((p) => ({ ...p, cyclical_prefix: e.target.value }))}
                    placeholder="hour_of_day"
                  />
                </label>
              </>
            ) : null}

            {operation === 'significant_lags_kendall' ? (
              <>
                <label>
                  Min Lag
                  <input value={opParams.lag_min_lag} onChange={(e) => setOpParams((p) => ({ ...p, lag_min_lag: e.target.value }))} />
                </label>
                <label>
                  Max Lag
                  <input value={opParams.lag_max_lag} onChange={(e) => setOpParams((p) => ({ ...p, lag_max_lag: e.target.value }))} />
                </label>
                <label>
                  Alpha (p-value)
                  <input value={opParams.lag_alpha} onChange={(e) => setOpParams((p) => ({ ...p, lag_alpha: e.target.value }))} />
                </label>
                <label>
                  Top K Significant Lags
                  <input value={opParams.lag_top_k} onChange={(e) => setOpParams((p) => ({ ...p, lag_top_k: e.target.value }))} />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(opParams.lag_include_negative_tau)}
                    onChange={(e) => setOpParams((p) => ({ ...p, lag_include_negative_tau: e.target.checked }))}
                  />
                  <span>Include Negative Tau</span>
                </label>
              </>
            ) : null}

            {operation === 'rolling_window_stats_nested' ? (
              <>
                <label>
                  Windows (comma-separated)
                  <input
                    value={opParams.rolling_windows}
                    onChange={(e) => setOpParams((p) => ({ ...p, rolling_windows: e.target.value }))}
                    placeholder="3,5,10,20"
                  />
                </label>
                <div className="label">
                  <span>Stats</span>
                  <details className="checkbox-multiselect">
                    <summary>{parseColumnList(opParams.rolling_stats).length || 0} selected</summary>
                    <div className="checkbox-multiselect-list">
                      {ROLLING_STATS_OPTIONS.map((stat) => (
                        <label key={stat} className="check">
                          <input
                            type="checkbox"
                            checked={parseColumnList(opParams.rolling_stats).includes(stat)}
                            onChange={() => toggleMultiColumnParam('rolling_stats', stat)}
                          />
                          <span>{stat}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
                <label>
                  Min Periods
                  <input
                    value={opParams.rolling_min_periods}
                    onChange={(e) => setOpParams((p) => ({ ...p, rolling_min_periods: e.target.value }))}
                  />
                </label>
                <label>
                  Prefix (optional)
                  <input
                    value={opParams.rolling_prefix}
                    onChange={(e) => setOpParams((p) => ({ ...p, rolling_prefix: e.target.value }))}
                    placeholder="signal"
                  />
                </label>
              </>
            ) : null}

            {Boolean(MATH_SCALAR_OPS[operation]) ? (
              <>
                <label>
                  Value
                  <input value={opParams.math_scalar_value} onChange={(e) => setOpParams((p) => ({ ...p, math_scalar_value: e.target.value }))} />
                </label>
                <label>
                  New Column Name (optional)
                  <input
                    value={opParams.math_scalar_new_name}
                    placeholder="leave empty to overwrite source"
                    onChange={(e) => setOpParams((p) => ({ ...p, math_scalar_new_name: e.target.value }))}
                  />
                </label>
              </>
            ) : null}

            {Boolean(MATH_UNARY_OPS[operation]) ? (
              <>
                {MATH_UNARY_OPS[operation] === 'round' ? (
                  <label>
                    Decimals
                    <input value={opParams.math_unary_decimals} onChange={(e) => setOpParams((p) => ({ ...p, math_unary_decimals: e.target.value }))} />
                  </label>
                ) : null}
                <label>
                  New Column Name (optional)
                  <input
                    value={opParams.math_unary_new_name}
                    placeholder="leave empty to overwrite source"
                    onChange={(e) => setOpParams((p) => ({ ...p, math_unary_new_name: e.target.value }))}
                  />
                </label>
              </>
            ) : null}

            {Boolean(MATH_BETWEEN_COLUMNS_OPS[operation]) ? (
              <>
                <label>
                  Left Column
                  <select value={opParams.math_between_left} onChange={(e) => setOpParams((p) => ({ ...p, math_between_left: e.target.value }))}>
                    <option value="">Select column</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Right Column
                  <select value={opParams.math_between_right} onChange={(e) => setOpParams((p) => ({ ...p, math_between_right: e.target.value }))}>
                    <option value="">Select column</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  New Column Name
                  <input value={opParams.math_between_new_name} onChange={(e) => setOpParams((p) => ({ ...p, math_between_new_name: e.target.value }))} />
                </label>
              </>
            ) : null}

            {operation === 'stats_zscore' || operation === 'stats_percentile_rank' || operation === 'stats_variance' || operation === 'stats_std' ? (
              <label>
                New Column Name (optional)
                <input
                  value={opParams.stats_new_name}
                  placeholder="auto name if blank"
                  onChange={(e) => setOpParams((p) => ({ ...p, stats_new_name: e.target.value }))}
                />
              </label>
            ) : null}

            {operation === 'stats_rolling_mean' ? (
              <>
                <label>
                  Window
                  <input value={opParams.stats_window} onChange={(e) => setOpParams((p) => ({ ...p, stats_window: e.target.value }))} />
                </label>
                <label>
                  Min Periods (optional)
                  <input value={opParams.stats_min_periods} onChange={(e) => setOpParams((p) => ({ ...p, stats_min_periods: e.target.value }))} />
                </label>
                <label>
                  New Column Name (optional)
                  <input
                    value={opParams.stats_new_name}
                    placeholder="auto name if blank"
                    onChange={(e) => setOpParams((p) => ({ ...p, stats_new_name: e.target.value }))}
                  />
                </label>
              </>
            ) : null}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowApplyModal(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await applyOperation();
                  if (ok) setShowApplyModal(false);
                }}
                disabled={busy}
              >
                Apply Operation
              </button>
            </div>
            <aside className={`function-doc-panel${showFunctionDocPanel ? ' open' : ''}`} aria-hidden={!showFunctionDocPanel}>
              <div className="function-doc-panel-header">
                <h4>{selectedFunctionFullDoc.label}</h4>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowFunctionDocPanel(false)}
                >
                  Close
                </button>
              </div>
              <p className="function-doc-summary">{selectedFunctionFullDoc.summary}</p>
              <div className="function-doc-section">
                <h5>Parameters</h5>
                {selectedFunctionFullDoc.parameters.length ? (
                  <ul className="function-doc-list">
                    {selectedFunctionFullDoc.parameters.map((param) => (
                      <li key={param.name}>
                        <code>{param.name}</code>
                        <span className={`param-badge ${param.required ? 'required' : 'optional'}`}>
                          {param.required ? 'Required' : 'Optional'}
                        </span>
                        <span>{param.description}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="help">No configurable parameters for this function.</p>
                )}
              </div>
              <div className="function-doc-section">
                <h5>Output</h5>
                <p>{selectedFunctionFullDoc.output}</p>
              </div>
              <div className="function-doc-section">
                <h5>Notes</h5>
                <ul className="function-doc-list">
                  {selectedFunctionFullDoc.notes.map((note) => (
                    <li key={note}><span>{note}</span></li>
                  ))}
                </ul>
              </div>
              {selectedFunctionFullDoc.keywords.length ? (
                <div className="function-doc-section">
                  <h5>Search Keywords</h5>
                  <p>{selectedFunctionFullDoc.keywords.join(', ')}</p>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      ) : null}

      <DatasetExplorerModal
        open={showDatasetExplorerModal}
        datasets={mergeSelectableDatasets}
        title="Dataset Explorer"
        description={opParams.merge_mode === 'append'
          ? 'Pick one or more source datasets for append.'
          : 'Pick a source dataset for join.'}
        selectionMode={opParams.merge_mode === 'append' ? 'multiple' : 'single'}
        selectedDatasetIds={opParams.merge_mode === 'append'
          ? mergeAppendSourceDatasetIds
          : (opParams.merge_source_dataset_id ? [opParams.merge_source_dataset_id] : [])}
        onToggleSelect={toggleMergeAppendSourceDataset}
        onConfirmSelection={() => setShowDatasetExplorerModal(false)}
        confirmLabel="Use Selected"
        onClose={() => setShowDatasetExplorerModal(false)}
        onSelect={(ds) => {
          if (opParams.merge_mode !== 'join_on_keys') return;
          setOpParams((prev) => ({ ...prev, merge_source_dataset_id: ds?.dataset_id || '' }));
          setShowDatasetExplorerModal(false);
        }}
      />

      {showSaveModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Save Result</h3>
            <p className="help">Save current prepared dataset by overwrite or as new dataset.</p>
            <p className="help">Saving will reset undo/redo history and clear all checkpoints for this session.</p>

            <label>
              Save Mode
              <select value={saveMode} onChange={(e) => setSaveMode(e.target.value)}>
                <option value="overwrite">Overwrite Existing</option>
                <option value="new">Create New Dataset</option>
              </select>
            </label>

            {saveMode === 'new' ? (
              <>
                <label>
                  New Filename
                  <input
                    placeholder="prepared_data.csv"
                    value={newFilename}
                    onChange={(e) => setNewFilename(e.target.value)}
                  />
                </label>
                <label>
                  Folder
                  <select value={saveFolder} onChange={(e) => setSaveFolder(e.target.value)}>
                    {(folders || []).map((f) => (
                      <option key={f.name} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowSaveModal(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await savePreparedData();
                  if (ok) setShowSaveModal(false);
                }}
                disabled={busy || (saveMode === 'new' && !newFilename.trim())}
              >
                Save Prepared Data
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRestoreModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card modal-wide checkpoint-modal">
            <div className="checkpoint-modal-head">
              <h3>Checkpoints</h3>
              <span className="checkpoint-count">{checkpoints.length} total</span>
            </div>
            <p className="help">Auto-created at each operation. Restore any checkpoint below.</p>
            {checkpoints.length ? (
              <div className="table-wrap checkpoint-table-wrap">
                <table className="preview-table checkpoint-table">
                  <thead>
                    <tr>
                      <th className="checkpoint-col-name">Name</th>
                      <th className="checkpoint-col-op">Operation</th>
                      <th className="checkpoint-col-details">Details</th>
                      <th className="checkpoint-col-time">Timestamp</th>
                      <th className="checkpoint-col-action">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkpoints.map((cp) => (
                      <tr key={cp.checkpoint_id}>
                        <td className="checkpoint-name-cell">{cp.label || `Checkpoint ${cp.serial_no || ''}`}</td>
                        <td className="checkpoint-op-cell">{cp.operation_label || '-'}</td>
                        <td className="checkpoint-details">{cp.operation_details || '-'}</td>
                        <td className="checkpoint-time-cell">{formatCheckpointTimestamp(cp.created_at)}</td>
                        <td className="checkpoint-action-cell">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => restoreCheckpoint(cp.checkpoint_id)}
                            disabled={busy}
                          >
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="help">No checkpoints yet.</p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowRestoreModal(false)}
                disabled={busy}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedColumnInsight ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>{selectedInsightColumn} Insights</h3>
            <p className="help">Based on currently loaded rows ({columnQuickInsights.sampleSize}).</p>
            <p className="help">Type: {selectedColumnInsight.dtype} | Missing: {Number(selectedColumnInsight.missingPct || 0).toFixed(1)}%</p>

            {selectedColumnInsight.dtype === 'numeric' ? (
              <>
                <div className="quick-hist">
                  {(selectedColumnInsight.bins || []).map((h, idx) => (
                    <span key={`ins-modal-bin-${idx}`} style={{ height: `${Math.max(8, Math.round((h || 0) * 36))}px` }} />
                  ))}
                </div>
                <p className="help">
                  Min: {selectedColumnInsight.min ?? '-'} | Mean: {selectedColumnInsight.mean != null ? Number(selectedColumnInsight.mean).toFixed(2) : '-'} | Max: {selectedColumnInsight.max ?? '-'}
                </p>
              </>
            ) : null}

            {selectedColumnInsight.dtype === 'datetime' ? (
              <p className="help">
                Range: {selectedColumnInsight.minDate || '-'} {'->'} {selectedColumnInsight.maxDate || '-'}
              </p>
            ) : null}

            {selectedColumnInsight.dtype !== 'numeric' && selectedColumnInsight.dtype !== 'datetime' ? (
              <div className="quick-top-values">
                {(selectedColumnInsight.top || []).map((t) => (
                  <div key={`ins-modal-${t.label}`} className="quick-top-row">
                    <span title={t.label}>{t.label}</span>
                    <div><i style={{ width: `${Math.max(2, Math.min(100, t.pct))}%` }} /></div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setSelectedInsightColumn(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddRowModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card modal-wide">
            <h3>{addRowMode === 'before' ? 'Add Row Before' : addRowMode === 'after' ? 'Add Row After' : 'Add Row'}</h3>
            <p className="help">
              {addRowMode === 'before'
                ? 'Enter values for the new row to insert before the selected row.'
                : addRowMode === 'after'
                  ? 'Enter values for the new row to insert after the selected row.'
                  : 'Enter values for the new row. Leave fields blank for null values.'}
            </p>
            {rowErrors.__global ? <p className="error">{rowErrors.__global}</p> : null}
            <div className="grid two">
              {columns.map((col) => (
                <label key={col}>
                  {col}
                  <input
                    value={rowForm[col] ?? ''}
                    onChange={(e) => setRowForm((prev) => ({ ...prev, [col]: e.target.value }))}
                    placeholder={columnTypeMap[col] ? String(columnTypeMap[col]) : ''}
                  />
                  {rowErrors[col] ? <span className="error">{rowErrors[col]}</span> : null}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAddRowModal(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" onClick={submitAddRow} disabled={busy}>
                {addRowMode === 'before' ? 'Add Before' : addRowMode === 'after' ? 'Add After' : 'Add Row'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default DataPreparationScreen;
