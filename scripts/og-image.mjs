/**
 * Régénère static/og.png, l'image d'aperçu des liens partagés (LinkedIn,
 * WhatsApp, Slack…). Ce n'est pas un dessin à part : c'est une photo du vrai
 * hero de la landing page, une fois ses animations terminées. L'aperçu suit
 * donc le design du site sans qu'on ait à le refaire à la main.
 *
 *   npm run dev    # dans un autre terminal
 *   npm run og
 *
 * Puis monter OG_VERSION dans src/lib/seo.ts : les réseaux gardent une image
 * en cache tant que son URL ne change pas.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const url = process.env.OG_URL ?? 'http://localhost:5173/';

/**
 * Un Chromium déjà présent, quelle que soit sa version : celui qu'attend cette
 * version de Playwright, sinon un autre de son cache, sinon Chrome. Une simple
 * capture d'écran n'a pas besoin de la révision exacte, et ça évite un
 * téléchargement de 100 Mo. À défaut : `npx playwright-core install chromium`.
 */
function cachedChromium() {
  const cache = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')].find(existsSync);
  if (!cache) return undefined;
  const candidates = readdirSync(cache)
    .filter((dir) => dir.startsWith('chromium'))
    .sort()
    .reverse()
    .flatMap((dir) => [
      join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      join(cache, dir, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
      join(cache, dir, 'chrome-linux/chrome'),
      join(cache, dir, 'chrome-linux64/chrome')
    ]);
  return candidates.find(existsSync);
}

const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ executablePath: cachedChromium() }))
  .catch(() => chromium.launch({ channel: 'chrome' }));
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
// `networkidle` : en dev, Vite peut recharger la page une fois ses dépendances
// optimisées, ce qui effacerait les retouches ci-dessous.
await page.goto(url, { waitUntil: 'networkidle' });

// Le logo et le hero, centrés dans le cadre ; pas de liens de navigation,
// ni la mention sous les boutons, qui n'a de sens que sur la page.
await page.addStyleTag({
  content: `
    header nav { display: none !important; }
    header > div { padding-top: 26px !important; }
    main > section:first-child > div.relative { padding-top: 0 !important; padding-bottom: 26px !important; min-height: 560px; }
    main > section:first-child p.rise:last-of-type { display: none !important; }
  `
});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(2600); // fin des entrées et du trait sous « au clair. »
const navHidden = await page.evaluate(() => getComputedStyle(document.querySelector('header nav')).display === 'none');
if (!navHidden) throw new Error('La page a été rechargée pendant la capture : relancer `npm run og`.');
await page.screenshot({ path: 'static/og.png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('static/og.png régénérée depuis', url);
