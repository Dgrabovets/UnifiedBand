import { expect, test } from 'claude-code/testing'

import { decide, detectFanout, isFollowup, scoreEffort } from '../hooks/router-core.mjs'

// The Python original knew English words only, so a Russian task looked "moderate" to it. The port also reads Russian,
// and the rule these tests keep is simple: a Russian prompt gets the decision its English translation gets.
const deps = { now: () => 'T', sha: () => 'S', id: () => 'x', budgetGate: () => true }

const PAIRS: [string, string][] = [
  // complex verbs, with and without breadth
  ['Перепиши весь модуль платежей на новую архитектуру и добавь тесты для всех веток', 'Rewrite the whole payment module on a new architecture and add tests for all branches'],
  ['Рефактори сервис авторизации', 'Refactor the auth service'],
  ['Мигрируй базу данных на PostgreSQL и обнови все вызовы', 'Migrate the database to PostgreSQL and update all callers'],
  ['Реализуй кэширование для API', 'Implement caching for the API'],
  ['Оптимизируй запросы в отчёте', 'Optimize the queries in the report'],
  ['Интегрируй платёжный шлюз', 'Integrate the payment gateway'],
  ['Вынеси общую логику в отдельный модуль', 'Extract the common logic into a separate module'],
  ['Перенеси проект на новую платформу', 'Port the project to the new platform'],
  ['Переработай всю инфраструктуру сборки', 'Restructure the entire infrastructure of the build'],
  // deep verbs
  ['Спроектируй архитектуру нового сервиса уведомлений', 'Design the architecture of the new notification service'],
  ['Исследуй причину падения тестов', 'Investigate the cause of the test failures'],
  ['Проанализируй производительность запросов', 'Analyze the performance of the queries'],
  ['Проведи аудит безопасности', 'Run an audit of the security'],
  ['Найди первопричину утечки памяти', 'Find the root cause of the memory leak'],
  // lookups
  ['Где лежит конфиг?', 'Where is the config?'],
  ['Покажи список пользователей', 'Show the list of users'],
  ['Что такое этот модуль?', 'What is this module?'],
  ['Сколько файлов в папке src?', 'How many files are in the src folder?'],
  ['Есть ли тесты для парсера?', 'Is there a test for the parser?'],
  ['Прочитай README и скажи, что он делает', 'Read the README and tell me what it does'],
  // ordinary edits
  ['Исправь опечатку в заголовке README', 'Fix the typo in the README title'],
  ['Добавь комментарий к этой функции', 'Add a comment to this function'],
  ['Переименуй переменную x в y', 'Rename the variable x to y'],
  ['Удали неиспользуемый импорт', 'Remove the unused import'],
  ['Напиши тест для функции сложения', 'Write a test for the add function'],
  ['исправь баг в файле parser.ts', 'fix the bug in parser.ts'],
  // effort: several files, verification
  ['Перепиши ./a.py ./b.py ./c.py и проверь тесты', 'Rewrite ./a.py ./b.py ./c.py and verify the tests'],
  ['Реализуй вход в систему и добавь тесты', 'Implement the login and add tests'],
  // fan-out
  ['1. Добавь заголовок\n2. Исправь подвал', '1. Add a header\n2. Fix the footer'],
  ['Обнови зависимости для каждого пакета', 'Update the dependencies for each package'],
  ['Проверь формат для каждого файла', 'Check the format for every file'],
  // follow-ups
  ['да, продолжай', 'yes, continue'],
  ['теперь то же для второго файла', 'now the same for the second file'],
  ['давай', 'go'],
  ['Это не работает', 'This does not work'],
]

const view = (prompt: string, planMode = false, parent = 'opus') => {
  const { row, context } = decide({ prompt, parent, planMode }, deps)
  const d = row.decision
  return { outcome: row.outcome, hint: row.outcome_hint, tier: d.tier, model: d.model, effort: d.effort, fanout: d.fanout, injected: context !== null }
}

test('a Russian prompt is decided like its English translation, on every kind of signal', () => {
  const different = PAIRS.flatMap(([ru, en]) => {
    const [a, b] = [view(ru), view(en)]
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [`${ru} -> ${JSON.stringify(a)} but ${en} -> ${JSON.stringify(b)}`]
  })
  expect(different.join('\n')).toBe('')
})

test('plan mode and the effort score read Russian too', () => {
  expect(view('Спланируй миграцию базы данных', true)).toEqual(view('Plan the database migration', true))
  for (const [ru, en] of PAIRS) expect(scoreEffort(ru)[0]).toBe(scoreEffort(en)[0])
})

test('Russian numbered lists, loops and follow-ups are detected', () => {
  expect(detectFanout('1. Добавь заголовок\n2. Исправь подвал')).toEqual([true, 2])
  expect(detectFanout('Обнови зависимости для каждого пакета')).toEqual([true, 0])
  expect(isFollowup('да, продолжай')).toBe(true)
  expect(isFollowup('Перепиши весь модуль платежей на новую архитектуру и добавь тесты для всех веток сейчас')).toBe(false)
})

test('the example that sent a hard Russian task to the cheaper model now gets the strong one', () => {
  const hard = view('Перепиши весь модуль платежей на новую архитектуру и добавь тесты для всех веток')
  expect(hard.tier).toBe('complex')
  expect(hard.model).toBe('opus')
  expect(hard.injected).toBe(false)
})
