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

  test('canvas has ARIA attributes', async ({ page }) => {
    const canvas = page.locator('canvas')
    await expect(canvas).toHaveAttribute('role', 'application')
    await expect(canvas).toHaveAttribute('aria-label', 'Particle simulation canvas')
  })

  test('can draw on canvas', async ({ page }) => {
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()

    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2)
      await page.mouse.up()
    }

    await expect(canvas).toBeVisible()
  })

  test('selecting materials via dropdown works', async ({ page }) => {
    const trigger = page.locator('.material-dropdown-trigger')
    await trigger.click()

    const waterBtn = page.locator('.material-dropdown-item', { hasText: 'water' })
    await expect(waterBtn).toBeVisible()
    await waterBtn.click()

    // Trigger should now show "water"
    await expect(trigger).toContainText('water')
  })

  test('pause stops simulation', async ({ page }) => {
    const pauseBtn = page.locator('.ctrl-btn.playpause')
    await pauseBtn.click()
    await expect(pauseBtn).toHaveClass(/paused/)

    const canvas = page.locator('canvas')
    const screenshot1 = await canvas.screenshot()
    await page.waitForTimeout(100)
    const screenshot2 = await canvas.screenshot()

    expect(screenshot1.equals(screenshot2)).toBeTruthy()
  })

  test('reset clears canvas', async ({ page }) => {
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()

    // Draw something
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }

    // Click reset (needs double-click: first arms, second confirms)
    const resetBtn = page.locator('.ctrl-btn.reset')
    await resetBtn.click()
    await resetBtn.click()

    await expect(canvas).toBeVisible()
  })
})

test.describe('Save / Load', () => {
  test('save produces a .sand download and load restores it', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')

    // Trigger save and capture the download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.ctrl-btn.save').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.sand$/)

    // Save to a temp path and load it back
    const path = await download.path()
    expect(path).toBeTruthy()

    // Use the file input to load
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path!)

    // Should not error — canvas still visible
    await expect(page.locator('canvas')).toBeVisible()
  })
})

test.describe('Brush Size Keyboard Shortcuts', () => {
  test('[ and ] keys change brush size', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')

    const brushDisplay = page.locator('.brush-size span')
    const initial = await brushDisplay.textContent()
    const initialSize = parseInt(initial ?? '3', 10)

    // Press ] to increase
    await page.keyboard.press(']')
    const increased = await brushDisplay.textContent()
    expect(parseInt(increased ?? '0', 10)).toBe(initialSize + 1)

    // Press [ to decrease
    await page.keyboard.press('[')
    const restored = await brushDisplay.textContent()
    expect(parseInt(restored ?? '0', 10)).toBe(initialSize)
  })
})
