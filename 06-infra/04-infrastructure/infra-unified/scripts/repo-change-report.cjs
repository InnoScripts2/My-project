'use strict'
const { execSync } = require('node:child_process')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim()
}

function safeSh(cmd) {
  try { return sh(cmd) } catch { return '' }
}

function buildReport({ prevSha, lastSha }) {
  const now = new Date()
  const branch = safeSh('git rev-parse --abbrev-ref HEAD') || 'unknown'
  const last = lastSha || safeSh('git rev-parse HEAD')
  const prev = prevSha || safeSh('git rev-parse HEAD~1')

  const diffStatus = prev ? safeSh(`git diff --name-status ${prev} ${last}`) : safeSh('git diff --name-status')
  const files = diffStatus.split('\n').filter(Boolean).map(line => {
    const [status, ...rest] = line.split('\t')
    return { status, file: rest.join('\t') }
  })
  const added = files.filter(f => f.status === 'A').length
  const modified = files.filter(f => f.status === 'M').length
  const deleted = files.filter(f => f.status === 'D').length
  const total = files.length

  const lastCommit = (safeSh(`git log --pretty=format:%H\t%an\t%ae\t%ad\t%s -1 ${last}`) || '').split('\t')
  const [sha, author, email, date, subject] = [lastCommit[0]||'', lastCommit[1]||'', lastCommit[2]||'', lastCommit[3]||'', lastCommit[4]||'']
  const parents = safeSh(`git log --pretty=%P -1 ${last}`)
  const parentCount = parents ? parents.split(' ').filter(Boolean).length : 0
  const isMerge = parentCount >= 2

  const diffStat = prev ? safeSh(`git diff --stat ${prev} ${last}`) : safeSh('git diff --stat')
  const shortStat = prev ? safeSh(`git diff --shortstat ${prev} ${last}`) : safeSh('git diff --shortstat')
  let insertions = 0, deletions = 0
  try {
    const mIns = shortStat.match(/(\d+)\s+insertion/)
    const mDel = shortStat.match(/(\d+)\s+deletion/)
    insertions = mIns ? parseInt(mIns[1], 10) : 0
    deletions = mDel ? parseInt(mDel[1], 10) : 0
  } catch {}

  const md = [
    `# Отчёт об изменениях`,
    `Дата: ${now.toISOString()}`,
    `Ветка: ${branch}`,
    `Последний коммит: ${sha}`,
    `Автор: ${author} <${email}>`,
    `Тема: ${subject}`,
    '',
    `Итого файлов: ${total} (A:${added} M:${modified} D:${deleted})`,
    '',
    '## Список файлов',
    files.map(f => `- ${f.status}\t${f.file}`).join('\n') || '(нет изменений)',
    '',
    '## Статистика diff',
    '```',
    diffStat || '(нет изменений)',
    '```'
  ].join('\n')

  return { branch, sha, subject, author, total, added, modified, deleted, insertions, deletions, parentCount, isMerge, md }
}

function writeReport(md) {
  const outDir = join(process.cwd(), 'outbox', 'change-reports')
  mkdirSync(outDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '').replace('T','_').slice(0,15)
  const file = join(outDir, `changes_${ts}.md`)
  writeFileSync(file, md, 'utf8')
  return file
}

function main() {
  const args = process.argv.slice(2)
  const argPrev = args.find(a => a.startsWith('--prev='))?.split('=')[1]
  const argLast = args.find(a => a.startsWith('--last='))?.split('=')[1]
  const report = buildReport({ prevSha: argPrev, lastSha: argLast })
  const path = writeReport(report.md)
  const summary = {
    ok: true,
    path,
    branch: report.branch,
    sha: report.sha,
    files: report.total,
    added: report.added,
    modified: report.modified,
    deleted: report.deleted,
  insertions: report.insertions,
  deletions: report.deletions,
  parentCount: report.parentCount,
  isMerge: report.isMerge,
    subject: report.subject,
    author: report.author,
    preview: report.md.slice(0, 1200)
  }
  if (process.env.JSON) {
    process.stdout.write(JSON.stringify(summary))
  } else {
    console.log(`Report: ${path} (files=${summary.files}, A:${summary.added} M:${summary.modified} D:${summary.deleted})`)
  }
}

if (require.main === module) {
  main()
}

module.exports = { buildReport, writeReport }
