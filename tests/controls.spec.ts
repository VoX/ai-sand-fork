import { test, expect } from '@playwright/test'

test.describe('Control Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
  })

  test('simulation is playing by default', async ({ page }) => {
    const btn = page.locator('.ctrl-btn.playpause')
    await expect(btn).toHaveClass(/playing/)
  })

  test('clicking play/pause toggles paused state', async ({ page }) => {
    const btn = page.locator('.ctrl-btn.playpause')
    await btn.click()
    await expect(btn).toHaveClass(/paused/)
    await btn.click()
    await expect(btn).toHaveClass(/playing/)
  })

  test('material dropdown opens and shows items', async ({ page }) => {
    const trigger = page.locator('.material-dropdown-trigger')
    await trigger.click()
    const sandBtn = page.locator('.material-dropdown-item', { hasText: 'sand' })
    await expect(sandBtn).toBeVisible()
    await sandBtn.click()
    await expect(sandBtn).not.toBeVisible()
  })

  test('control buttons have SVG icons', async ({ page }) => {
    const playpause = page.locator('.ctrl-btn.playpause svg')
    const reset = page.locator('.ctrl-btn.reset svg')
    const save = page.locator('.ctrl-btn.save svg')
    const load = page.locator('.ctrl-btn.load svg')

    await expect(playpause).toBeVisible()
    await expect(reset).toBeVisible()
    await expect(save).toBeVisible()
    await expect(load).toBeVisible()
  })
})
