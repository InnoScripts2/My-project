import type { UptimeReport, MTTRReport, SLAReport } from './types/index.js';

interface DowntimeRecord {
  start_time: string;
  end_time: string | null;
  reason: string;
}

interface IncidentRecord {
  incident_id: string;
  detected_at: string;
  resolved_at: string;
}

interface DatabaseAdapter {
  query(sql: string, params: any[]): Promise<any[]>;
  insert(table: string, data: any): Promise<any>;
}

export class SLAManager {
  private db: DatabaseAdapter;
  private slaTarget: number = 99.5;
  private mttrTarget: number = 7200;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  async calculateUptime(startDate: string, endDate: string): Promise<UptimeReport> {
    const totalTime = new Date(endDate).getTime() - new Date(startDate).getTime();

    const downtimeRecords = await this.db.query(
      'SELECT start_time, end_time FROM downtime WHERE start_time >= ? AND end_time <= ? AND end_time IS NOT NULL',
      [startDate, endDate]
    );

    const downtime = downtimeRecords.reduce((sum: number, record: DowntimeRecord) => {
      if (!record.end_time) return sum;
      return sum + (new Date(record.end_time).getTime() - new Date(record.start_time).getTime());
    }, 0);

    const uptime = totalTime - downtime;
    const uptimePercentage = (uptime / totalTime) * 100;

    return {
      totalTime: totalTime / 1000,
      uptime: uptime / 1000,
      downtime: downtime / 1000,
      uptimePercentage,
      incidentsCount: downtimeRecords.length,
      slaTarget: this.slaTarget,
      slaMet: uptimePercentage >= this.slaTarget,
    };
  }

  async trackDowntime(startTime: string, endTime: string | null, reason: string): Promise<void> {
    await this.db.insert('downtime', {
      start_time: startTime,
      end_time: endTime,
      reason,
      created_at: new Date().toISOString(),
    });
  }

  async getMTTR(startDate: string, endDate: string): Promise<MTTRReport> {
    const incidents = await this.db.query(
      'SELECT incident_id, detected_at, resolved_at FROM incidents WHERE detected_at >= ? AND resolved_at <= ? AND resolved_at IS NOT NULL',
      [startDate, endDate]
    );

    const durations = incidents.map((inc: IncidentRecord) => {
      return (new Date(inc.resolved_at).getTime() - new Date(inc.detected_at).getTime()) / 1000;
    });

    const averageMTTR = durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0;
    
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const medianMTTR = sortedDurations.length > 0
      ? sortedDurations.length % 2 === 0
        ? (sortedDurations[sortedDurations.length / 2 - 1] + sortedDurations[sortedDurations.length / 2]) / 2
        : sortedDurations[Math.floor(sortedDurations.length / 2)]
      : 0;
    
    const maxMTTR = durations.length > 0 ? Math.max(...durations) : 0;

    return {
      incidents: incidents.map((inc: IncidentRecord, idx: number) => ({
        incidentId: inc.incident_id,
        detectedAt: inc.detected_at,
        resolvedAt: inc.resolved_at,
        duration: durations[idx],
      })),
      averageMTTR,
      medianMTTR,
      maxMTTR,
      mttrTarget: this.mttrTarget,
      mttrMet: averageMTTR <= this.mttrTarget,
    };
  }

  async generateSLAReport(month: string): Promise<SLAReport> {
    const startDate = `${month}-01T00:00:00Z`;
    const year = parseInt(month.split('-')[0]);
    const monthNum = parseInt(month.split('-')[1]);
    const nextMonth = monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, '0')}`;
    const endDate = `${nextMonth}-01T00:00:00Z`;

    const uptimeReport = await this.calculateUptime(startDate, endDate);
    const mttrReport = await this.getMTTR(startDate, endDate);

    const downtimeRecords = await this.db.query(
      'SELECT start_time, end_time, reason FROM downtime WHERE start_time >= ? AND end_time <= ? AND end_time IS NOT NULL',
      [startDate, endDate]
    );

    return {
      month,
      uptimePercentage: uptimeReport.uptimePercentage,
      slaMet: uptimeReport.slaMet,
      incidentsCount: uptimeReport.incidentsCount,
      mttr: mttrReport.averageMTTR,
      downtime: downtimeRecords.map((record: DowntimeRecord) => ({
        startTime: record.start_time,
        endTime: record.end_time || new Date().toISOString(),
        duration: (new Date(record.end_time || new Date()).getTime() - new Date(record.start_time).getTime()) / 1000,
        reason: record.reason,
      })),
    };
  }
}
