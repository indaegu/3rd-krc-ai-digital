import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const browserPath = browserCandidates.find(existsSync);
if (!browserPath) {
  throw new Error('Chrome 또는 Edge 실행 파일을 찾지 못했어요.');
}

const profileDir = mkdtempSync(join(tmpdir(), 'mulsigye-prototype-'));
const prototypeUrl = pathToFileURL(resolve('prototype/mulsigye-app-prototype-v2.html')).href;
const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    prototypeUrl,
  ],
  { stdio: 'ignore', windowsHide: true },
);

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitUntil(check, message, timeout = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await check()) return;
    await delay(80);
  }
  throw new Error(message);
}

let socket;

try {
  const portFile = join(profileDir, 'DevToolsActivePort');
  await waitUntil(() => existsSync(portFile), '브라우저 디버깅 포트가 열리지 않았어요.');
  const [port] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);

  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === 'page');
  if (!target) throw new Error('프로토타입 브라우저 탭을 찾지 못했어요.');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const pageErrors = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const handler = pending.get(message.id);
      if (!handler) return;
      pending.delete(message.id);
      if (message.error) handler.reject(new Error(message.error.message));
      else handler.resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      pageErrors.push(detail.exception?.description ?? detail.text);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      pageErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolveMessage, rejectMessage) => {
      const id = ++nextId;
      pending.set(id, { resolve: resolveMessage, reject: rejectMessage });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const evaluation = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (evaluation.exceptionDetails) {
      throw new Error(evaluation.exceptionDetails.exception?.description ?? evaluation.exceptionDetails.text);
    }
    return evaluation.result.value;
  };

  const click = async (selector) => {
    const encoded = JSON.stringify(selector);
    await evaluate(`(() => { const element = document.querySelector(${encoded}); if (!element) throw new Error('Missing selector: ' + ${encoded}); element.click(); return true; })()`);
  };

  const text = (selector) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? ''`);

  const expectText = async (selector, expected) => {
    const actual = await text(selector);
    if (!actual.includes(expected)) {
      throw new Error(`${selector}에서 “${expected}”를 찾지 못했어요. 실제 값: “${actual}”`);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await waitUntil(() => evaluate("document.readyState === 'complete'"), '프로토타입 로드가 끝나지 않았어요.');

  await delay(1_650);
  await expectText('#s-onboard.on h2', '며칠 앞서');
  await click('#goRegionSetup');
  await delay(420);
  await expectText('#consentSheet.on h3', '동의가 필요해요');
  await click('#agreeAll');
  await click('#consentOk');
  await click('#addBtn');
  await click('[data-q="빛가람로"]');
  await delay(650);
  await click('#addrList button');
  await expectText('#confirmBox.on', '우리 지역 대표 저수지');
  await click('#addRegionBtn');
  await delay(780);
  await click('#startMain');
  await delay(1_050);

  await expectText('#regionLabel', '대표 나주호');
  await expectText('#rate', '57');
  await expectText('#avg', '68%');
  await expectText('#stage', '관심');
  await expectText('#reachBig', '18일 뒤');
  await expectText('#reachDesc', '가능성이 있어요');

  await click('[data-scen="severe"]');
  await expectText('#avg', '46%');
  await expectText('#reachBig', '9일 뒤');
  await expectText('#coachMsg', '가능성이 있어요');

  await click('[data-scen="flood"]');
  await expectText('#avg', '118%');
  const bannerVisible = await evaluate("document.querySelector('#banner').classList.contains('show')");
  if (!bannerVisible) throw new Error('만수위 참고 배너가 보이지 않아요.');

  await click('.morebtn');
  await expectText('#detailTitle', '평년 대비 저수율');

  const bodyText = await text('body');
  for (const forbidden of ['가장 가까운 저수지', '물 상황 알림 받기', '지금 속도면', 'WebView']) {
    if (bodyText.includes(forbidden)) throw new Error(`금지된 프로토타입 문구가 남아 있어요: ${forbidden}`);
  }

  if (pageErrors.length > 0) {
    throw new Error(`브라우저 JavaScript 오류:\n${pageErrors.join('\n')}`);
  }

  console.log('Prototype interaction OK (onboarding, consent, region, 3 scenarios, detail).');
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser.kill();

  const safeTempRoot = resolve(tmpdir());
  const safeProfile = resolve(profileDir);
  if (dirname(safeProfile) === safeTempRoot && basename(safeProfile).startsWith('mulsigye-prototype-')) {
    await delay(150);
    try {
      rmSync(safeProfile, { recursive: true, force: true });
    } catch {
      // Browser child processes can briefly retain files on Windows; the OS temp cleaner can remove them later.
    }
  }
}
