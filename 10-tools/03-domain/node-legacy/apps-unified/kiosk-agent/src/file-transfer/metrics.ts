import { Counter, Histogram, Registry } from 'prom-client'

let metricsInstance: ReturnType<typeof registerFileTransferMetrics> | null = null

export function registerFileTransferMetrics(registry: Registry) {
  const archivedReportsTotal = new Counter({
    name: 'file_transfer_archived_reports_total',
    help: 'Total number of archived reports',
    labelNames: ['type', 'success'],
    registers: [registry],
  })

  const syncDuration = new Histogram({
    name: 'file_transfer_sync_duration_seconds',
    help: 'Duration of synchronization in seconds',
    buckets: [1, 5, 10, 30, 60, 120, 300],
    registers: [registry],
  })

  const syncUploadedFiles = new Counter({
    name: 'file_transfer_sync_uploaded_files_total',
    help: 'Total number of files uploaded during synchronization',
    registers: [registry],
  })

  const syncFailed = new Counter({
    name: 'file_transfer_sync_failed_total',
    help: 'Total number of failed synchronizations',
    labelNames: ['reason'],
    registers: [registry],
  })

  const retentionDeletedLocal = new Counter({
    name: 'file_transfer_retention_deleted_local_total',
    help: 'Total number of local files deleted by retention policy',
    registers: [registry],
  })

  const retentionDeletedRemote = new Counter({
    name: 'file_transfer_retention_deleted_remote_total',
    help: 'Total number of remote files deleted by retention policy',
    registers: [registry],
  })

  return {
    archivedReportsTotal,
    syncDuration,
    syncUploadedFiles,
    syncFailed,
    retentionDeletedLocal,
    retentionDeletedRemote,
  }
}

export function getFileTransferMetrics(registry: Registry): ReturnType<typeof registerFileTransferMetrics> {
  if (!metricsInstance) {
    metricsInstance = registerFileTransferMetrics(registry)
  }
  return metricsInstance
}
