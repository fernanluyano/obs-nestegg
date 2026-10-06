import { describe, expect, it } from 'vitest'
import { budgetProgress } from '../../domain/budget'
import { barWidth, leftText } from '../../view/budgetRow'

describe('leftText', () => {
  it('says what is left under budget', () => {
    expect(leftText(budgetProgress(10000, 2550))).toBe('74.50 left')
  })

  it('says by how much the plan is exceeded', () => {
    expect(leftText(budgetProgress(10000, 123456))).toBe('1,134.56 over')
  })

  it('says so when the plan is met exactly', () => {
    expect(leftText(budgetProgress(10000, 10000))).toBe('On budget')
  })
})

describe('barWidth', () => {
  it('is a percentage of the bar', () => {
    expect(barWidth(budgetProgress(10000, 2500))).toBe('25%')
    expect(barWidth(budgetProgress(10000, 99999))).toBe('100%')
  })
})
