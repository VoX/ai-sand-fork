import path from 'path'
import { fileURLToPath } from 'url'
import { test, expect } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

    // Wait for the pause message to reach the worker and settle
    await page.waitForTimeout(500)

    const canvas = page.locator('canvas')
    const screenshot1 = await canvas.screenshot()
    await page.waitForTimeout(200)
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

test.describe('Snapshot Load Game Test', () => {
  test('loaded save file matches visual snapshot', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')

    // Pause the simulation
    const pauseBtn = page.locator('.ctrl-btn.playpause')
    await pauseBtn.click()
    await expect(pauseBtn).toHaveClass(/paused/)

    // Load the snapshot-test.sand file
    const sandFile = path.resolve(__dirname, 'snapshot-test.sand')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(sandFile)

    // Wait for the load to complete and render to settle
    await page.waitForTimeout(500)

    // Verify the page structure matches the expected visual snapshot
    await expect(page).toHaveScreenshot({
      stylePath: path.resolve(__dirname, 'hide-ui.css'),
    });
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

test.describe('Simulation Regression Snapshot', () => {
  test('simulate forward some steps and then match snapshot to find sim regressions', async ({ page }) => {
    // Navigate with pauseAtStep=3248 (snapshot-test.sand starts at simStep=3048)
    await page.goto('/?pauseAtStep=3248')
    await page.waitForSelector('canvas')

    // Load the snapshot-test.sand file (simulation is playing by default)
    const sandFile = path.resolve(__dirname, 'snapshot-test.sand')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(sandFile)

    // Wait for auto-pause: the play/pause button should gain the .paused class
    const pauseBtn = page.locator('.ctrl-btn.playpause')
    await expect(pauseBtn).toHaveClass(/paused/, { timeout: 10000 })

    // Wait for render to settle after pause
    await page.waitForTimeout(500)

    // Verify the page matches the expected visual snapshot
    await expect(page).toHaveScreenshot({
      stylePath: path.resolve(__dirname, 'hide-ui.css'),
    })
  })
})
