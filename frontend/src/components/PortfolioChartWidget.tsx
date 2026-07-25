'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

export interface PortfolioAsset {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  value: number;
  percentage: number;
  color?: string;
}

export interface PortfolioChartProps {
  assets: PortfolioAsset[];
  totalValue: number;
  currency?: string;
  showAnimation?: boolean;
  onAssetClick?: (asset: PortfolioAsset) => void;
  className?: string;
}

export interface PortfolioHistoryPoint {
  timestamp: number;
  value: number;
}

// Default color palette for assets
const DEFAULT_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
];

/**
 * PortfolioChartWidget - A responsive portfolio visualization component
 * Displays asset allocation with pie chart and includes state management
 * Optimized: removed framer-motion dependency for smaller bundle size
 */
export function PortfolioChartWidget({
  assets = [],
  totalValue = 0,
  currency = 'USD',
  showAnimation = true,
  onAssetClick,
  className = '',
}: PortfolioChartProps) {
  const t = useTranslations();
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'pie' | 'history'>('pie');

  // Add colors to assets if not provided
  const assetsWithColors = useMemo(() => {
    return assets.map((asset, index) => ({
      ...asset,
      color: asset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    }));
  }, [assets]);

  // Prepare data for pie chart
  const pieData = useMemo(() => {
    return assetsWithColors.map(asset => ({
      name: asset.symbol,
      value: asset.value,
      payload: asset,
    }));
  }, [assetsWithColors]);

  // Handle asset selection
  const handleAssetClick = useCallback(
    (asset: PortfolioAsset) => {
      setSelectedAsset(asset.id === selectedAsset ? null : asset.id);
      onAssetClick?.(asset);
    },
    [selectedAsset, onAssetClick]
  );

  // Format currency values
  const formatCurrency = useCallback(
    (value: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    },
    [currency]
  );

  return (
    <div
      className={`w-full h-full flex flex-col gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('portfolioChart.valueTitle') || 'Portfolio Value'}
          </h2>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {formatCurrency(totalValue)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setChartType('pie')}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-all duration-200 ${
              chartType === 'pie'
                ? 'bg-blue-600 text-white scale-105'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            aria-pressed={chartType === 'pie'}
          >
            {t('portfolioChart.allocation') || 'Allocation'}
          </button>
          <button
            onClick={() => setChartType('history')}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-all duration-200 ${
              chartType === 'history'
                ? 'bg-blue-600 text-white scale-105'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            aria-pressed={chartType === 'history'}
          >
            {t('portfolioChart.trend') || 'Trend'}
          </button>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-md min-h-[300px]">
        <div className={chartType === 'pie' ? 'w-full h-full' : 'w-full h-full p-4'}>
          {chartType === 'pie' ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={2}
                  isAnimationActive={showAnimation}
                  animationDuration={800}
                  onClick={(entry) => handleAssetClick(entry.payload.payload)}
                >
                  {assetsWithColors.map((asset) => (
                    <Cell
                      key={`cell-${asset.id}`}
                      fill={asset.color}
                      className={`cursor-pointer transition-opacity duration-300 ${
                        selectedAsset === null || selectedAsset === asset.id
                          ? 'opacity-100'
                          : 'opacity-40'
                      }`}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCurrency(value as number)}
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: '1px solid #374151',
                    borderRadius: '0.375rem',
                    color: '#F3F4F6',
                  }}
                />
                <Legend
                  formatter={(value, entry) => {
                    const asset = (entry as unknown as { payload: { payload: PortfolioAsset } }).payload.payload;
                    return `${asset.symbol} (${asset.percentage.toFixed(1)}%)`;
                  }}
                  wrapperStyle={{
                    paddingTop: '20px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3B82F6"
                  isAnimationActive={showAnimation}
                  animationDuration={800}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Asset List */}
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {assetsWithColors.map((asset) => (
          <div
            key={asset.id}
            onClick={() => handleAssetClick(asset)}
            className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-all duration-200 ${
              selectedAsset === asset.id
                ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAssetClick(asset);
              }
            }}
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
              style={{ backgroundColor: asset.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-white text-sm">
                  {asset.symbol}
                </span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {asset.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {asset.amount.toFixed(4)} {asset.symbol}
                </span>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  {formatCurrency(asset.value)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PortfolioChartWidget;