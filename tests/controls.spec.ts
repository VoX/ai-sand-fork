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
    const box = await trigger.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    const sandBtn = page.locator('.material-dropdown-item', { hasText: 'sand' })
    await expect(sandBtn).toBeVisible()
    await sandBtn.click()
    await expect(sandBtn).not.toBeVisible()
  })

  test('control buttons have SVG icons', async ({ page }) => {
    const settings = page.locator('.ctrl-btn.settings svg')
    const playpause = page.locator('.ctrl-btn.playpause svg')
    const zoomIn = page.locator('.ctrl-btn.zoom svg').first()
    const panToggle = page.locator('.ctrl-btn.pan-toggle svg')

    await expect(settings).toBeVisible()
    await expect(playpause).toBeVisible()
    await expect(zoomIn).toBeVisible()
    await expect(panToggle).toBeVisible()
  })
})
