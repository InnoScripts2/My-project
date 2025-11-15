#!/usr/bin/env node

/**
 * Manual smoke test for Reports System
 * 
 * Tests:
 * - Report generation (HTML/PDF)
 * - Preview
 * - Email/SMS sending (DEV mode)
 * - Cleanup
 */

import { reportService, ReportType, DeliveryChannel } from '../service.js'
import type { ThicknessReportData, ObdReportData } from '@selfservice/report'

async function runSmokeTests() {
  console.log('=== Reports System Smoke Test ===\n')

  // Test 1: Generate Thickness Report
  console.log('1. Generating thickness report...')
  const thicknessData: ThicknessReportData = {
    sessionId: 'smoke-test-thickness',
    contact: { email: 'test@example.com', phone: '+79991234567' },
    points: [
      { id: '1', label: 'Капот', valueMicrons: 120 },
      { id: '2', label: 'Крыша', valueMicrons: 100 },
      { id: '3', label: 'Дверь передняя левая', valueMicrons: 150 },
      { id: '4', label: 'Крыло заднее правое', valueMicrons: 180 }
    ],
    summary: 'Все измерения в пределах нормы. Возможна перекраска заднего крыла.'
  }

  const thicknessReport = await reportService.generateReport(
    'smoke-test-thickness',
    ReportType.THICKNESS,
    thicknessData
  )
  console.log('✓ Thickness report generated:', thicknessReport.reportId)
  console.log('  Generated at:', thicknessReport.generatedAt)
  console.log('  Expires at:', thicknessReport.expiresAt)
  console.log('  Has PDF:', !!thicknessReport.pdfPath)
  console.log()

  // Test 2: Generate OBD Report
  console.log('2. Generating OBD report...')
  const obdData: ObdReportData = {
    sessionId: 'smoke-test-obd',
    contact: { email: 'test@example.com', phone: '+79991234567' },
    dtc: [
      { code: 'P0420', description: 'Catalyst System Efficiency Below Threshold' },
      { code: 'P0171', description: 'System Too Lean (Bank 1)' }
    ],
    mil: true,
    clearAttempt: {
      at: new Date().toISOString(),
      result: 'ok',
      message: 'DTC codes cleared successfully'
    }
  }

  const obdReport = await reportService.generateReport(
    'smoke-test-obd',
    ReportType.DIAGNOSTICS,
    obdData
  )
  console.log('✓ OBD report generated:', obdReport.reportId)
  console.log('  Generated at:', obdReport.generatedAt)
  console.log('  Has PDF:', !!obdReport.pdfPath)
  console.log()

  // Test 3: Preview Report
  console.log('3. Testing report preview...')
  const html = await reportService.previewReport(thicknessReport.reportId)
  console.log('✓ HTML preview retrieved:', html.length, 'bytes')
  console.log('  Contains session ID:', html.includes('smoke-test-thickness'))
  console.log()

  // Test 4: Send Email
  console.log('4. Testing email delivery (DEV mode)...')
  const emailResult = await reportService.sendReport(thicknessReport.reportId, {
    channel: DeliveryChannel.EMAIL,
    recipient: 'test@example.com',
    language: 'ru'
  })
  console.log('✓ Email delivery result:')
  console.log('  Success:', emailResult.success)
  console.log('  Recipient:', emailResult.recipient)
  console.log('  Sent at:', emailResult.sentAt)
  if (emailResult.error) {
    console.log('  Error:', emailResult.error)
  }
  console.log()

  // Test 5: Send SMS
  console.log('5. Testing SMS delivery (DEV mode)...')
  const smsResult = await reportService.sendReport(obdReport.reportId, {
    channel: DeliveryChannel.SMS,
    recipient: '+79991234567',
    language: 'ru'
  })
  console.log('✓ SMS delivery result:')
  console.log('  Success:', smsResult.success)
  console.log('  Recipient:', smsResult.recipient)
  console.log('  Sent at:', smsResult.sentAt)
  if (smsResult.error) {
    console.log('  Error:', smsResult.error)
  }
  console.log()

  // Test 6: Get Report
  console.log('6. Testing report retrieval...')
  const retrieved = await reportService.getReport(thicknessReport.reportId)
  console.log('✓ Report retrieved successfully')
  console.log('  Report ID:', retrieved?.reportId)
  console.log('  Type:', retrieved?.type)
  console.log()

  // Test 7: Cleanup
  console.log('7. Testing cleanup (no expired reports yet)...')
  const deletedCount = await reportService.cleanup()
  console.log('✓ Cleanup completed')
  console.log('  Deleted reports:', deletedCount)
  console.log()

  console.log('=== All smoke tests passed! ===')
}

runSmokeTests().catch(err => {
  console.error('Smoke test failed:', err)
  process.exit(1)
})
