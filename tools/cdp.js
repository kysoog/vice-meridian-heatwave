import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export class DevTools {
  constructor(options = {}) {
    this.root = options.root ?? process.cwd();
    this.debugPort = options.debugPort ?? 19337;
    this.width = options.width ?? 1280; this.height = options.height ?? 800;
    this.profile = join(this.root, 'capture', 'chromium-profile');
    this.browser = null; this.socket = null; this.nextId = 1;
    this.pending = new Map(); this.exceptions = []; this.logs = [];
  }
  async launch() {
    rmSync(this.profile, { recursive: true, force: true }); mkdirSync(this.profile, { recursive: true });
    this.browser = spawn('/usr/bin/chromium', [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader-webgl',
      `--remote-debugging-port=${this.debugPort}`, `--user-data-dir=${this.profile}`,
      `--window-size=${this.width},${this.height}`, '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', '--disable-background-timer-throttling', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    this.browser.stderr.on('data', (chunk) => { stderr += chunk.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
    this.browser.once('exit', (code) => { if (code && !this.closing) console.error(`Chromium exited ${code}: ${stderr.slice(-1200)}`); });
    let target;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.debugPort}/json/new?about:blank`, { method: 'PUT' });
        if (response.ok) { target = await response.json(); break; }
      } catch { /* Browser debugger is starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!target) throw new Error(`DevTools endpoint did not start. ${stderr.slice(-1000)}`);
    await this.connect(target.webSocketDebuggerUrl);
    await this.send('Page.enable'); await this.send('Runtime.enable'); await this.send('Log.enable');
    await this.send('Emulation.setDeviceMetricsOverride', { width: this.width, height: this.height, deviceScaleFactor: 1, mobile: false });
  }
  connect(url) {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(url);
      const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 10000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('DevTools WebSocket error')); }, { once: true });
      this.socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id) {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id); clearTimeout(pending.timer);
          if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`)); else pending.resolve(message.result);
        } else if (message.method === 'Runtime.exceptionThrown') {
          this.exceptions.push({ text: message.params.exceptionDetails.text, description: message.params.exceptionDetails.exception?.description ?? '', url: message.params.exceptionDetails.url ?? '', line: message.params.exceptionDetails.lineNumber });
        } else if (message.method === 'Log.entryAdded') this.logs.push(message.params.entry);
      });
      this.socket.addEventListener('close', () => {
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('DevTools socket closed')); }
        this.pending.clear();
      });
    });
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  }
  async waitFor(expression, timeoutMs = 180000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.exceptions.length) throw new Error(`Page exception: ${JSON.stringify(this.exceptions)}`);
      if (await this.evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (this.exceptions.length) throw new Error(`Page exception: ${JSON.stringify(this.exceptions)}`);
    const diagnostic = await this.evaluate('({readyState:document.readyState,url:location.href,title:document.title,body:document.body?.innerText?.slice(0,500),gameReady:window.__gameReady,shotReady:window.__shotReady})').catch((error) => String(error));
    throw new Error(`Ready condition timed out: ${expression}; page=${JSON.stringify(diagnostic)}; logs=${JSON.stringify(this.logs.slice(-12))}`);
  }
  async navigate(url) {
    this.exceptions.length = 0; this.logs.length = 0;
    await this.send('Page.navigate', { url });
    await this.waitFor('window.__gameReady === true', 45000);
  }
  async close() {
    this.closing = true;
    try { this.socket?.close(); } catch { /* Already closed. */ }
    if (this.browser && this.browser.exitCode === null) {
      this.browser.kill('SIGTERM');
      await Promise.race([new Promise((resolve) => this.browser.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 3000))]);
      if (this.browser.exitCode === null) {
        this.browser.kill('SIGKILL');
        await new Promise((resolve) => this.browser.once('exit', resolve));
      }
    }
    try { rmSync(this.profile, { recursive: true, force: true }); } catch { /* Scratch is safe to remove on the next run. */ }
  }
}
