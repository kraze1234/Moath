// يصوّر الصفحة إطارًا إطارًا (30 إطارًا في الثانية) داخل .frames
const { chromium } = require("playwright");
(async () => {
  const [dir, end] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto("file://" + dir + "/index.html?render");
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  const FPS = 30, N = Math.round(+end * FPS);
  for (let i = 0; i < N; i++) {
    await p.evaluate(t => seek(t), i / FPS);
    await p.screenshot({ path: `${dir}/.frames/f${String(i).padStart(4, "0")}.png` });
  }
  await b.close();
})();
