import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HealthDays, healthTime, unionMs } from './health-export'

const dateOf = (tz: string) => (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
const rec = (type: string, o: Record<string, string>) => ({ type, sourceName: 'Fake Phone', ...o })

test('healthTime reads the Health export timestamp', () => {
  assert.equal(new Date(healthTime('2024-01-01 08:00:00 +0530')).toISOString(), '2024-01-01T02:30:00.000Z')
  assert.equal(new Date(healthTime('2024-01-01 08:00:00 -0800')).toISOString(), '2024-01-01T16:00:00.000Z')
  assert.ok(Number.isNaN(healthTime('yesterday')))
})

test('steps: sum per source, then the max across sources', () => {
  const d = new HealthDays(dateOf('Asia/Kolkata'))
  const step = (source: string, value: string, h: string) => d.add(rec('HKQuantityTypeIdentifierStepCount', { sourceName: source, unit: 'count', value, startDate: `2024-01-01 ${h}:00:00 +0530`, endDate: `2024-01-01 ${h}:30:00 +0530` }))
  step('Fake Phone', '3000', '08'); step('Fake Phone', '2500', '12')
  step('Fake Watch', '4000', '08'); step('Fake Watch', '1000', '12')
  assert.deepEqual(d.days().get('2024-01-01'), { metrics: { steps: 5500 } })
})

test('distance, energy and weight are converted; weight and resting heart rate keep the last of the day', () => {
  const d = new HealthDays(dateOf('Asia/Kolkata'))
  d.add(rec('HKQuantityTypeIdentifierDistanceWalkingRunning', { unit: 'mi', value: '2', startDate: '2024-01-01 08:00:00 +0530', endDate: '2024-01-01 08:30:00 +0530' }))
  d.add(rec('HKQuantityTypeIdentifierActiveEnergyBurned', { unit: 'kJ', value: '418.4', startDate: '2024-01-01 08:00:00 +0530', endDate: '2024-01-01 08:30:00 +0530' }))
  d.add(rec('HKQuantityTypeIdentifierBodyMass', { unit: 'lb', value: '160', startDate: '2024-01-01 07:00:00 +0530', endDate: '2024-01-01 07:00:00 +0530' }))
  d.add(rec('HKQuantityTypeIdentifierBodyMass', { unit: 'lb', value: '158', startDate: '2024-01-01 21:00:00 +0530', endDate: '2024-01-01 21:00:00 +0530' }))
  d.add(rec('HKQuantityTypeIdentifierRestingHeartRate', { unit: 'count/min', value: '58', startDate: '2024-01-01 09:00:00 +0530', endDate: '2024-01-01 09:00:00 +0530' }))
  d.add(rec('HKQuantityTypeIdentifierFlightsClimbed', { unit: 'count', value: '4', startDate: '2024-01-01 09:00:00 +0530', endDate: '2024-01-01 09:01:00 +0530' }))
  assert.deepEqual(d.days().get('2024-01-01'), { metrics: { distance: 3.22, active_energy: 100, weight: 71.67, resting_hr: 58, flights: 4 } })
})

test('mindful minutes are the sum of the sessions', () => {
  const d = new HealthDays(dateOf('Asia/Kolkata'))
  d.add({ type: 'HKCategoryTypeIdentifierMindfulSession', startDate: '2024-01-01 07:00:00 +0530', endDate: '2024-01-01 07:10:00 +0530', value: 'HKCategoryValueNotApplicable' })
  d.add({ type: 'HKCategoryTypeIdentifierMindfulSession', startDate: '2024-01-01 21:00:00 +0530', endDate: '2024-01-01 21:05:00 +0530', value: 'HKCategoryValueNotApplicable' })
  assert.equal(d.days().get('2024-01-01')?.metrics.mindful_minutes, 15)
})

test('sleep: the union of intervals across sources, Asleep values only, dated by the end', () => {
  const d = new HealthDays(dateOf('Asia/Kolkata'))
  const s = (source: string, value: string, start: string, end: string) =>
    d.add({ type: 'HKCategoryTypeIdentifierSleepAnalysis', sourceName: source, value, startDate: start, endDate: end })
  // Night of Jan 1 to 2 on a phone (in bed) and a watch (asleep, two stages that overlap the phone's asleep span).
  s('Fake Phone', 'HKCategoryValueSleepAnalysisInBed', '2024-01-01 22:00:00 +0530', '2024-01-02 07:00:00 +0530')
  s('Fake Phone', 'HKCategoryValueSleepAnalysisAsleepUnspecified', '2024-01-01 23:00:00 +0530', '2024-01-02 05:00:00 +0530')
  s('Fake Watch', 'HKCategoryValueSleepAnalysisAsleepCore', '2024-01-01 23:30:00 +0530', '2024-01-02 03:00:00 +0530')
  s('Fake Watch', 'HKCategoryValueSleepAnalysisAsleepDeep', '2024-01-02 03:00:00 +0530', '2024-01-02 06:30:00 +0530')
  s('Fake Watch', 'HKCategoryValueSleepAnalysisAwake', '2024-01-02 03:00:00 +0530', '2024-01-02 03:20:00 +0530')
  // 23:00 to 06:30 = 7.5 h. The next evening's interval belongs to Jan 3.
  assert.equal(d.days().get('2024-01-02')?.sleepHours, 7.5)
  assert.equal(d.days().get('2024-01-01'), undefined)
})

test('local date across midnight follows the user time zone, not the device offset', () => {
  const ist = new HealthDays(dateOf('Asia/Kolkata'))
  const pst = new HealthDays(dateOf('America/Los_Angeles'))
  const r = rec('HKQuantityTypeIdentifierStepCount', { unit: 'count', value: '100', startDate: '2024-01-01 23:50:00 +0530', endDate: '2024-01-01 23:55:00 +0530' })
  ist.add(r); pst.add(r)
  assert.deepEqual([...ist.days().keys()], ['2024-01-01'])
  assert.deepEqual([...pst.days().keys()], ['2024-01-01']) // 18:20 UTC is 10:20 in Los Angeles, the same day
  const late = rec('HKQuantityTypeIdentifierStepCount', { unit: 'count', value: '100', startDate: '2024-01-02 01:00:00 +0530', endDate: '2024-01-02 01:05:00 +0530' })
  const ist2 = new HealthDays(dateOf('Asia/Kolkata')); const pst2 = new HealthDays(dateOf('America/Los_Angeles'))
  ist2.add(late); pst2.add(late)
  assert.deepEqual([...ist2.days().keys()], ['2024-01-02'])
  assert.deepEqual([...pst2.days().keys()], ['2024-01-01']) // 19:30 UTC the day before is 11:30 on Jan 1 in Los Angeles
})

test('records of other types or with bad numbers are ignored', () => {
  const d = new HealthDays(dateOf('Asia/Kolkata'))
  d.add(rec('HKQuantityTypeIdentifierHeartRate', { unit: 'count/min', value: '70', startDate: '2024-01-01 08:00:00 +0530', endDate: '2024-01-01 08:00:00 +0530' }))
  d.add(rec('HKQuantityTypeIdentifierStepCount', { unit: 'count', value: 'abc', startDate: '2024-01-01 08:00:00 +0530', endDate: '2024-01-01 08:00:00 +0530' }))
  d.add(rec('HKQuantityTypeIdentifierStepCount', { unit: 'count', value: '5', startDate: 'bad', endDate: 'bad' }))
  assert.equal(d.days().size, 0)
})

test('unionMs merges overlaps and keeps gaps', () => {
  assert.equal(unionMs([[0, 10], [5, 20], [30, 40]]), 30)
  assert.equal(unionMs([]), 0)
})
