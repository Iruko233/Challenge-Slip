const puppeteer = require("puppeteer-extra");
const express = require('express');
const chalk = require('chalk');
const app = express();
const port = 3000;

const sleep = duration => new Promise(resolve => setTimeout(resolve, duration * 1000));

async function main() {
  app.get('/api', async (req, res) => {
    const targetURL = req.query.target;

    if (targetURL) {
      try {
        const { title, cookie, userAgent } = await openBrowser(targetURL);
        res.send({ title, userAgent, cookie });
      } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
      }
    } else {
      res.status(400).send('Bad Request');
    }
  });

  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}


async function openBrowser(targetURL) {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
  ];

  const randomIndex = Math.floor(Math.random() * userAgents.length);
  const randomUserAgent = userAgents[randomIndex];

  const options = {
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      "--no-sandbox",
      "--no-first-run",
      "--ignore-certificate-errors",
      "--disable-extensions",
      "--test-type",
      "--user-agent="
      + randomUserAgent
    ]
  };

  const browser = await puppeteer.launch(options);
  const [page] = await browser.pages();
  const client = page._client();
  page.on("framenavigated", (frame) => {
    if (frame.url().includes("challenges.cloudflare.com") === true) client.send("Target.detachFromTarget", { targetId: frame._id });
  });
  page.setDefaultNavigationTimeout(60 * 1000);
  const userAgent = await page.evaluate(function () {
    return navigator.userAgent;
  });
  await page.goto(targetURL, {
    waitUntil: "domcontentloaded"
  });
  const content = await page.content();

  if (content.includes("challenge-platform") === true) {
    console.log(chalk.yellow('Found CloudFlare challenge'));
    try {
      await sleep(20);
      return new Promise(async (resolve) => {
        const waitInterval = setTimeout(() => { clearInterval(waitInterval); resolve(false); }, 5000);
        try {
          const elements = await page.$$('[name="cf-turnstile-response"]');
          if (elements.length === 0) {
            const coordinates = await page.evaluate(() => {
              const coords = [];
              const checkDivs = () => {
                document.querySelectorAll('div').forEach(item => {
                  try {
                    const rect = item.getBoundingClientRect();
                    const style = window.getComputedStyle(item);
                    if (style.margin === "0px" && style.padding === "0px" && rect.width > 290 && rect.width <= 310 && !item.querySelector('*')) {
                      coords.push({ x: rect.x, y: rect.y, w: rect.width, h: rect.height });
                    }
                  } catch (err) { }
                });
              };
              checkDivs();
              if (coords.length === 0) checkDivs();
              return coords;
            });

            for (const { x, y, h } of coordinates) {
              try { await page.mouse.click(x + 30, y + h / 2); } catch (err) { }
            }
            return resolve(true);
          }

          for (const element of elements) {
            try {
              const parent = await element.evaluateHandle(el => el.parentElement);
              const box = await parent.boundingBox();
              await page.mouse.click(box.x + 30, box.y + box.height / 2);
            } catch (err) { }
          }
          clearInterval(waitInterval);
          resolve(true);
        } catch (err) {
          clearInterval(waitInterval);
          resolve(false);
        }
      });
    } finally {
      await sleep(10);
      const title = await page.title();
      const cookies = await page.cookies();
      const cookie = cookies.map(cookie => cookie.name + "=" + cookie.value).join("; ").trim();
      console.log("Title:", title);
      console.log("Cookies:", cookie);
      console.log("UserAgent:", userAgent);
      const content = await page.content();
      if (content.includes("challenge-platform") === false) {
        console.log(chalk.green('Challenge solved'));
      }
      await browser.close();
      return { title, cookie, userAgent };
    }
  }

  console.log(chalk.green('No challenge detected'));
  await sleep(10);
  const title = await page.title();
  const cookies = await page.cookies();
  const cookie = cookies.map(cookie => cookie.name + "=" + cookie.value).join("; ").trim();
  console.log("Title:", title);
  console.log("Cookies:", cookie);
  console.log("UserAgent:", userAgent);
  await browser.close();
  return { title, cookie, userAgent };
}

main();
