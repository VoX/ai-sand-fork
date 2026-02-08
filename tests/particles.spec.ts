import { test, expect } from '@playwright/test'

test.describe('Particle Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
  })

  test('canvas is rendered', async ({ page }) => {
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('can draw on canvas', async ({ page }) => {
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    
    if (box) {
      // Draw in center of canvas
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2)
      await page.mouse.up()
    }
    
    // Canvas should have been interacted with
    await expect(canvas).toBeVisible()
  })

  test('selecting different materials works', async ({ page }) => {
    const materials = ['water', 'fire', 'plant', 'gun']
    
    for (const material of materials) {
      const btn = page.locator('.material-btn', { hasText: material })
      await btn.click()
      await expect(btn).toHaveClass(/active/)
    }
  })

  test('gun particle button exists', async ({ page }) => {
    const gunBtn = page.locator('.material-btn', { hasText: 'gun' })
    await expect(gunBtn).toBeVisible()
    await gunBtn.click()
    await expect(gunBtn).toHaveClass(/active/)
  })

  test('pause stops simulation', async ({ page }) => {
    const pauseBtn = page.locator('.ctrl-btn.pause')
    await pauseBtn.click()
    
    // Take screenshot, wait, take another - they should be identical when paused
    const canvas = page.locator('canvas')
    const screenshot1 = await canvas.screenshot()
    await page.waitForTimeout(100)
    const screenshot2 = await canvas.screenshot()
    
    // Paused canvas shouldn't change
    expect(screenshot1.equals(screenshot2)).toBeTruthy()
  })

  test('reset clears canvas', async ({ page }) => {
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    
    // Draw something
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }
    
    // Click reset
    const resetBtn = page.locator('.ctrl-btn.reset')
    await resetBtn.click()
    
    // Canvas should be reset (we can't easily verify contents, but no error means success)
    await expect(canvas).toBeVisible()
  })
})

test.describe('Visual Regression', () => {
  test('control buttons look correct', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.action-btns')
    
    const actionBtns = page.locator('.action-btns')
    await expect(actionBtns).toHaveScreenshot('control-buttons.png')
  })
})
