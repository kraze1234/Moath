// يصوّر الصفحة إطارًا إطارًا (30 إطارًا في الثانية) داخل .frames، بعدة متصفحات بالتوازي
const { chromium } = require("playwright");
const os = require("os");
(async () => {
  const [dir, end] = process.argv.slice(2);
  const FPS = 30, N = Math.round(+end * FPS);
  const W = Math.max(1, Math.min(4, os.cpus().length));
  const b = await chromium.launch();
  await Promise.all(Array.from({ length: W }, async (_, w) => {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto("file://" + dir + "/index.html?render");
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(500);
    for (let i = w; i < N; i += W) {
      await p.evaluate((t) => seek(t), i / FPS);
      await p.screenshot({ path: `${dir}/.frames/f${String(i).padStart(4, "0")}.png` });
    }
  }));
  await b.close();
})();
