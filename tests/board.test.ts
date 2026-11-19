import { expect, test } from 'claude-code/testing'

import { boardHtml, tasksFrom } from '../hooks/band/board'

const CSV = [
  'key,started,project,name,cost_usd,turns,agent_minutes,tokens_total,tokens_output,reuse_pct,reused,new,callers_open,tests,level,model',
  's1-1,2026-11-10 10:00,D:\\Repos\\Steward,Fix it,1.5,10,12,1000,100,50,1,2,0,passed,ultra,claude-sonnet-5-5',
  's2-2,0.32,D:\\Repos\\Old,Broken row,1,1,1,1,1,,0,0,0,,ultra,',
].join('\n')

test('tasksFrom keeps the folder name and drops a row without a start time', () => {
  const tasks = tasksFrom(CSV)
  expect(tasks.length).toBe(1)
  expect(tasks[0]?.project).toBe('Steward')
  expect(tasks[0]?.key).toBe('s1-1')
})

test('the page has every section, the grouped buttons, the export dialog and no session table', () => {
  const html = boardHtml(tasksFrom(CSV), Date.UTC(2026, 10, 19))
  for (const id of ['projects', 'context', 'reuse', 'router', 'plans', 'runs', 'extras']) expect(html.includes(`id="sec-${id}"`)).toBe(true)
  expect(html.includes('id="export-json"')).toBe(false)
  for (const id of ['copy-summary', 'export-all', 'share', 'export-dialog']) expect(html.includes(`id="${id}"`)).toBe(true)
  for (const id of ['overview', 'context', 'reuse', 'router', 'plans', 'runs', 'extras']) expect(html.includes(`data-page="${id}"`)).toBe(true)
  for (const id of ['export-pdf', 'picker', 'export-raw-dlg', 'share-menu', 'with-titles', 'export-all-sections']) expect(html.includes(`id="${id}"`)).toBe(true)
  expect(html.includes('@keyframes bd-rise')).toBe(true)
  for (const name of ['bd-hot', 'bd-confetti', 'bd-reveal', '#card.assemble']) expect(html.includes(name)).toBe(true)
  expect(html.includes('data-motion="rich"')).toBe(true)
  expect(html.includes('id="motion"')).toBe(false)
  expect(html.includes('prefers-reduced-motion')).toBe(true)
  expect(html.includes('data-page="projects"')).toBe(false)
  expect(html.indexOf('id="sec-projects"')).toBeGreaterThan(html.indexOf('data-page="overview"'))
  expect(html.indexOf('id="sec-projects"')).toBeLessThan(html.indexOf('class="card heat"'))
  expect(html.includes('<title>Unified Band</title>')).toBe(true)
  expect(html.includes('ponytail.dev')).toBe(false)
  expect(html.includes('Open ›')).toBe(false)
  expect(html.includes('id="legend"')).toBe(false)
  expect(html.includes('.prow{display:grid')).toBe(true)
  expect(html.includes('id="back"')).toBe(false)
  expect(html.includes('id="rows"')).toBe(false)
  expect(html.includes('Search sessions')).toBe(false)
})

test('the journal, the router log and board.json reach the page as data', () => {
  const html = boardHtml([], 1, { events: [{ t: 'turn', ts: 1 }], audit: [{ ts: 1, parent: 'sonnet' }], config: { projects: { A: { label: 'Sip & Tell' } } } })
  const data = JSON.parse(html.split('<script type="application/json" id="board-data">')[1]?.split('</script>')[0] ?? '{}')
  expect(data.events.length).toBe(1)
  expect(data.audit[0].parent).toBe('sonnet')
  expect(data.config.projects.A.label).toBe('Sip & Tell')
})

test('board.json can rename the dashboard, and the name is escaped', () => {
  const html = boardHtml([], 1, { events: [], audit: [], config: { title: 'My <Board>' } })
  expect(html.includes('<title>My &lt;Board&gt;</title>')).toBe(true)
  expect(html.includes('<title>Unified Band</title>')).toBe(false)
})

test('the projects table tells you when a category is empty', () => {
  expect(boardHtml([], 1, { events: [], audit: [], config: {} }).includes('No projects in this category.')).toBe(true)
})
