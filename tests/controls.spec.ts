import { test, expect } from '@playwright/test'

test.describe('Control Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
  })

  test('play button is active by default', async ({ page }) => {
    const playBtn = page.locator('.ctrl-btn.play')
    await expect(playBtn).toHaveClass(/active/)
  })

  test('clicking pause activates pause button', async ({ page }) => {
    const pauseBtn = page.locator('.ctrl-btn.pause')
    await pauseBtn.click()
    await expect(pauseBtn).toHaveClass(/active/)
  })

  test('clicking erase toggles erase mode', async ({ page }) => {
    const eraseBtn = page.locator('.ctrl-btn.erase')
    await eraseBtn.click()
    await expect(eraseBtn).toHaveClass(/active/)
    await eraseBtn.click()
    await expect(eraseBtn).not.toHaveClass(/active/)
  })

  test('material buttons exist and are clickable', async ({ page }) => {
    const sandBtn = page.locator('.material-btn', { hasText: 'sand' })
    await expect(sandBtn).toBeVisible()
    await sandBtn.click()
    await expect(sandBtn).toHaveClass(/active/)
  })

  test('control buttons have SVG icons', async ({ page }) => {
    const playBtn = page.locator('.ctrl-btn.play svg')
    const pauseBtn = page.locator('.ctrl-btn.pause svg')
    const resetBtn = page.locator('.ctrl-btn.reset svg')
    const eraseBtn = page.locator('.ctrl-btn.erase svg')
    
    await expect(playBtn).toBeVisible()
    await expect(pauseBtn).toBeVisible()
    await expect(resetBtn).toBeVisible()
    await expect(eraseBtn).toBeVisible()
  })
})
