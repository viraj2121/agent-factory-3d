// Browser smoke test: opens the running dashboard (npm run dev, port 5173) in a real browser and checks the main paths.
//   npm run smoke            (needs Playwright once:  npm i -D playwright && npx playwright install chromium)
// It reads and clicks only; it changes nothing in the service. Exit code 1 when a check fails.
let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error('Playwright is not installed. Run once:  npm i -D playwright && npx playwright install chromium')
  process.exit(2)
}
const URL = process.env.DASHBOARD_URL ?? 'http://localhost:5173/?tour=off'
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }

const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))

await page.goto(URL)
await page.waitForTimeout(8000)
check('the 3D canvas is drawn', (await page.locator('canvas').count()) > 0)
check('the banner says LIVE or a labelled demo', /LIVE|LOOK TEST|demo/i.test(await page.locator('body').innerText()))

const fps = () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = (t) => { n++; t - t0 < 3000 ? requestAnimationFrame(f) : res(n / ((t - t0) / 1000)) }; requestAnimationFrame(f) }))
const hallFps = await fps()
check('the hall runs at 20 fps or better', hallFps >= 20, `(${hallFps.toFixed(0)} fps)`)

await page.keyboard.press('g')
await page.waitForTimeout(6000)
check('G flies up to the solar system (Hall/System switch shows System)', await page.locator('text=System').first().isVisible())
check('planet name tags are shown', (await page.locator('.planet-label').count()) > 0)
const sysFps = await fps()
check('the solar system runs at 30 fps or better', sysFps >= 30, `(${sysFps.toFixed(0)} fps)`)

let hit = null
outer: for (let y = 250; y <= 560; y += 14) for (let x = 330; x <= 1040; x += 14) {
  await page.mouse.move(x, y)
  if ((await page.evaluate(() => document.body.style.cursor)) === 'pointer') { hit = [x, y]; break outer }
}
check('a planet can be pointed at', !!hit)
if (hit) {
  await page.mouse.click(hit[0], hit[1])
  await page.waitForTimeout(3500)
  check('clicking a planet opens its card', (await page.locator('.planet-card').count()) === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(2500)
  check('Esc closes the card and glides back out', (await page.locator('.planet-card').count()) === 0)
}

await page.keyboard.press('g')
await page.waitForTimeout(6000)
check('G comes back to the hall (no solar-system tags left)', (await page.locator('.planet-label').count()) === 0)
check('no errors in the console', errors.length === 0, errors[0] ?? '')

await browser.close()
process.exit(results.every(Boolean) ? 0 : 1)
