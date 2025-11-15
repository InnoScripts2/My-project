/**
 * ThicknessAnalyzer.ts - Advanced analysis for thickness measurements
 * 
 * Features:
 * - Real-time anomaly detection
 * - Heat map generation
 * - Statistical analysis
 * - Repair zone detection
 * - ML export
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'node:os';

export interface Measurement {
  zone: string;
  value: number;
  x?: number;
  y?: number;
}

export interface Anomaly {
  zone: string;
  value: number;
  type: 'too_high' | 'too_low' | 'outlier';
  severity: 'warning' | 'critical';
}

export interface HeatMap {
  width: number;
  height: number;
  data: number[][];
  colorScale: { min: number; max: number };
}

export interface Statistics {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  count: number;
}

export interface RepairZone {
  zones: string[];
  avgThickness: number;
  confidence: number;
}

export class ThicknessAnalyzer {
  private readonly highThreshold = 200; // μm
  private readonly lowThreshold = 50; // μm
  private readonly repairThreshold = 180; // μm

  /**
   * Detect anomalous measurements
   */
  detectAnomalies(measurements: Measurement[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    
    if (measurements.length === 0) return anomalies;

    // Calculate statistics for outlier detection
    const stats = this.calculateStatistics(measurements);
    const outlierThreshold = stats.mean + (2 * stats.stddev);

    for (const m of measurements) {
      // Check for too high
      if (m.value > this.highThreshold) {
        anomalies.push({
          zone: m.zone,
          value: m.value,
          type: 'too_high',
          severity: m.value > 250 ? 'critical' : 'warning'
        });
      }
      
      // Check for too low
      else if (m.value < this.lowThreshold) {
        anomalies.push({
          zone: m.zone,
          value: m.value,
          type: 'too_low',
          severity: m.value < 30 ? 'critical' : 'warning'
        });
      }
      
      // Check for statistical outlier
      else if (m.value > outlierThreshold) {
        anomalies.push({
          zone: m.zone,
          value: m.value,
          type: 'outlier',
          severity: 'warning'
        });
      }
    }

    return anomalies;
  }

  /**
   * Generate 2D heat map from measurements
   */
  generateHeatMap(measurements: Measurement[], width: number, height: number): HeatMap {
    // Initialize grid with null values
    const grid: (number | null)[][] = Array(height).fill(null).map(() => Array(width).fill(null));
    
    // Find min/max for color scaling
    const values = measurements.map(m => m.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Map measurements to grid (simple binning)
    for (const m of measurements) {
      if (m.x !== undefined && m.y !== undefined) {
        const gridX = Math.min(Math.floor(m.x * width), width - 1);
        const gridY = Math.min(Math.floor(m.y * height), height - 1);
        grid[gridY][gridX] = m.value;
      }
    }

    // Interpolate missing values
    const interpolated = this.interpolateGrid(grid);

    return {
      width,
      height,
      data: interpolated,
      colorScale: { min, max }
    };
  }

  /**
   * Calculate statistical metrics
   */
  calculateStatistics(measurements: Measurement[]): Statistics {
    if (measurements.length === 0) {
      return { mean: 0, median: 0, stddev: 0, min: 0, max: 0, count: 0 };
    }

    const values = measurements.map(m => m.value).sort((a, b) => a - b);
    const count = values.length;
    
    // Mean
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / count;

    // Median
    const mid = Math.floor(count / 2);
    const median = count % 2 === 0 
      ? (values[mid - 1] + values[mid]) / 2 
      : values[mid];

    // Standard deviation
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
    const stddev = Math.sqrt(variance);

    // Min/Max
    const min = values[0];
    const max = values[count - 1];

    return { mean, median, stddev, min, max, count };
  }

  /**
   * Detect potential repair zones (clusters of high thickness)
   */
  detectRepairZones(measurements: Measurement[], threshold?: number): RepairZone[] {
    const repairThreshold = threshold ?? this.repairThreshold;
    const highMeasurements = measurements.filter(m => m.value > repairThreshold);

    if (highMeasurements.length === 0) return [];

    // Simple clustering: group adjacent zones
    const clusters: Measurement[][] = [];
    const visited = new Set<string>();

    for (const m of highMeasurements) {
      if (visited.has(m.zone)) continue;

      const cluster = [m];
      visited.add(m.zone);

      // Find adjacent measurements (simplified - in real impl, use spatial proximity)
      for (const other of highMeasurements) {
        if (visited.has(other.zone)) continue;
        if (this.areAdjacent(m, other, measurements)) {
          cluster.push(other);
          visited.add(other.zone);
        }
      }

      if (cluster.length >= 3) { // Minimum cluster size
        clusters.push(cluster);
      }
    }

    // Convert clusters to repair zones
    return clusters.map(cluster => {
      const zones = cluster.map(m => m.zone);
      const avgThickness = cluster.reduce((sum, m) => sum + m.value, 0) / cluster.length;
      const confidence = Math.min(cluster.length / 10, 1); // More points = higher confidence

      return { zones, avgThickness, confidence };
    });
  }

  /**
   * Export measurements in ML-friendly format
   */
  async exportForML(sessionId: string, measurements: Measurement[]): Promise<string> {
    const lines = ['zone,x,y,thickness_microns'];
    
    for (const m of measurements) {
      const x = m.x ?? 0;
      const y = m.y ?? 0;
      lines.push(`${m.zone},${x},${y},${m.value}`);
    }

    const csv = lines.join('\n');
    const filename = `thickness-ml-${sessionId}.csv`;
    const tempDir = path.join(os.tmpdir(), 'kiosk-agent-thickness');
    await fs.mkdir(tempDir, { recursive: true });
    const filepath = path.join(tempDir, filename);
    
    await fs.writeFile(filepath, csv, 'utf-8');
    
    return filepath;
  }

  /**
   * Simple grid interpolation using nearest neighbor
   */
  private interpolateGrid(grid: (number | null)[][]): number[][] {
    const height = grid.length;
    const width = grid[0].length;
    const result: number[][] = Array(height).fill(0).map(() => Array(width).fill(0));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] !== null) {
          result[y][x] = grid[y][x]!;
        } else {
          // Find nearest non-null value
          result[y][x] = this.findNearest(grid, x, y);
        }
      }
    }

    return result;
  }

  /**
   * Find nearest non-null value in grid
   */
  private findNearest(grid: (number | null)[][], x: number, y: number): number {
    const height = grid.length;
    const width = grid[0].length;
    let minDist = Infinity;
    let nearest = 100; // Default value

    for (let ny = 0; ny < height; ny++) {
      for (let nx = 0; nx < width; nx++) {
        if (grid[ny][nx] !== null) {
          const dist = Math.sqrt(Math.pow(nx - x, 2) + Math.pow(ny - y, 2));
          if (dist < minDist) {
            minDist = dist;
            nearest = grid[ny][nx]!;
          }
        }
      }
    }

    return nearest;
  }

  /**
   * Check if two measurements are spatially adjacent
   */
  private areAdjacent(m1: Measurement, m2: Measurement, allMeasurements: Measurement[]): boolean {
    if (m1.x === undefined || m1.y === undefined || m2.x === undefined || m2.y === undefined) {
      // Fallback to zone name proximity (simplified)
      const idx1 = allMeasurements.findIndex(m => m.zone === m1.zone);
      const idx2 = allMeasurements.findIndex(m => m.zone === m2.zone);
      return Math.abs(idx1 - idx2) <= 2;
    }

    const distance = Math.sqrt(Math.pow(m2.x - m1.x, 2) + Math.pow(m2.y - m1.y, 2));
    return distance < 0.2; // Adjacent if within 20% of normalized space
  }
}
