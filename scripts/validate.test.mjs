import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skill = join(root, 'skills', 'msx-activity-review');
const template = readFileSync(join(skill, 'assets', 'review-template.html'), 'utf8');
const script = template.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const demo = JSON.parse(readFileSync(join(skill, 'assets', 'sample-review.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const guid = number => `00000000-0000-0000-0000-${number.toString(16).padStart(12, '0')}`;

// Minimal offline DOM for executing the real template, not a replacement coverage implementation.
class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.events = {};
    this.style = {};
    this.value = '';
    this.text = '';
    this.hidden = false;
    this.disabled = false;
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(x => x.textContent).join(''); }
  appendChild(child) {
    if (child.parent) child.parent.children = child.parent.children.filter(x => x !== child);
    child.parent = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, fn) { this.events[name] = fn; }
  click() { if (!this.disabled) this.events.click?.(); }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  scrollIntoView() {}
}

function page(data, storage = new Map(), navigator = {}) {
  const all = [], ids = {};
  const createElement = tag => {
    const el = new Element(tag);
    all.push(el);
    return el;
  };
  for (const [, id] of template.matchAll(/\bid="([^"]+)"/g)) {
    ids[id] = createElement('div');
    ids[id].id = id;
  }
  ids['msxr-data'].textContent = JSON.stringify(data);
  const window = { addEventListener() {}, scrollTo() {} };
  const document = {
    getElementById: id => ids[id],
    createElement,
    createTextNode: text => { const el = createElement('#text'); el.textContent = text; return el; },
    querySelectorAll: () => all.filter(x => ['input', 'select', 'textarea', 'button'].includes(x.tagName))
  };
  runInNewContext(script, {
    document, window, navigator, CSS: { supports: () => true },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    requestAnimationFrame: fn => fn(), setTimeout: fn => { fn(); return 1; }, clearTimeout() {}
  }, { timeout: 2000 });
  return { ids, all, api: window.MSXReview, storage };
}

function fixture(user, size, sources = ['email', 'teams']) {
  const data = clone(demo), r = data.review;
  r.owner = { id: guid(user), displayName: `Synthetic user ${user}`, email: `user${user}@example.invalid` };
  r.candidates = [];
  r.catalog = [];
  r.checks = [];
  r.exclusions = [];
  r.options.allowMilestoneCreation = false;
  r.window = { start: '2026-10-01T09:17:00Z', end: '2026-10-08T12:43:00Z' };
  const accounts = Array.from({ length: size }, (_, i) => ({
    accountId: guid(user * 1000 + i), name: `Synthetic organization ${user}-${i}`,
    tpid: 'synthetic-shared-parent', aliases: [{ name: `Verified alias ${user}-${i}`, ref: 'Synthetic authoritative fixture' }],
    searchStatus: 'pending'
  }));
  r.accountScope = {
    source: 'My Team Accounts', savedQueryId: guid(900), ownerId: r.owner.id,
    resolvedAt: '2026-10-08T12:43:00Z', complete: true, restriction: null, note: '', accounts
  };
  r.coverage = {
    selectedSources: sources, complete: true, sources: [], gaps: [],
    searches: accounts.flatMap(a => sources.map(type => ({
      accountId: a.accountId, type, ...r.window, terms: [a.name, ...a.aliases.map(x => x.name)],
      tool: 'synthetic-collection-read', status: 'no-passages-returned', items: 0,
      capped: false, exhaustive: true, note: '', gaps: []
    })))
  };
  return data;
}

test('different signed-in users and changing portfolios have independent, dynamic counts', () => {
  const storage = new Map();
  for (const [user, count] of [[101, 2], [202, 7], [101, 4], [303, 65]]) {
    const p = page(fixture(user, count), storage);
    assert.match(p.ids.chips.textContent, new RegExp(`Account scope: ${count} resolved`));
    assert.match(p.ids.chips.textContent, new RegExp(`All selected accounts searched \\(${count}\\)`));
    assert.equal(p.ids.coverage.children.filter(x => x.textContent.includes('TPID synthetic-shared-parent')).length, count);
    assert.equal(p.api.getState().ownerId, guid(user));
    assert.match(p.ids.coverage.textContent, /activity absence not established/);
    assert.match(p.ids.coverage.textContent, /\[2026-10-01T09:17:00Z, 2026-10-08T12:43:00Z\)/);
  }
});

test('ranked zero passages and capped searches are not exhaustive evidence', () => {
  const data = fixture(101, 2);
  data.review.coverage.searches.forEach(x => { x.capped = true; x.exhaustive = false; x.note = 'Synthetic passage cap'; });
  const p = page(data);
  assert.match(p.ids.chips.textContent, /All selected accounts searched/);
  assert.match(p.ids.chips.textContent, /Evidence coverage partial or unknown/);
  assert.match(p.ids.coverage.textContent, /CAPPED.*retrieval not exhaustive.*Synthetic passage cap/);
  assert.match(p.ids.summary.textContent, /No qualifying work retrieved.*does not establish no activity/);
});

test('missing sources, failed queries, unknown statuses and missing aliases remain per-account gaps', () => {
  for (const change of [
    r => { r.coverage.searches = r.coverage.searches.filter(x => x.type !== 'teams'); },
    r => { r.coverage.searches[0].status = 'failed'; r.coverage.searches[0].note = 'Synthetic connector denied'; },
    r => { r.coverage.searches[0].status = 'unknown'; },
    r => { r.coverage.searches[0].terms = [r.accountScope.accounts[0].name]; },
    r => { r.coverage.searches[0].end = '2026-10-08T12:42:59Z'; }
  ]) {
    const data = fixture(101, 2);
    change(data.review);
    const p = page(data);
    assert.doesNotMatch(p.ids.chips.textContent, /All selected accounts searched/);
    assert.match(p.ids.coverage.textContent, /source\/time\/term gap/);
    assert.match(p.ids.chips.textContent, /Evidence coverage partial or unknown/);
  }
  const failed = fixture(101, 1);
  failed.review.coverage.searches.forEach(x => { x.status = 'failed'; x.note = 'Synthetic permission failure'; });
  assert.match(page(failed).ids.coverage.textContent, /Search failed.*Synthetic permission failure/);
});

test('successful time partitions must cover the exact half-open window for every verified term', () => {
  const data = fixture(101, 1, ['email']);
  const first = data.review.coverage.searches[0];
  const second = clone(first);
  first.end = '2026-10-04T00:00:00Z';
  second.start = first.end;
  data.review.coverage.searches.push(second);
  assert.match(page(data).ids.chips.textContent, /All selected accounts searched/);
  second.start = '2026-10-04T00:00:01Z';
  assert.doesNotMatch(page(data).ids.chips.textContent, /All selected accounts searched/);
  second.start = first.end;
  second.end = '2026-10-09T00:00:00Z';
  assert.match(page(data).ids.coverage.textContent, /out-of-window interval/);
});

test('incomplete retrieval, duplicate page rows and owner mismatch block approvals instead of using a saved roster', () => {
  for (const change of [
    r => { r.accountScope.complete = false; r.accountScope.note = 'Synthetic later-page failure'; },
    r => { r.accountScope.accounts.push(clone(r.accountScope.accounts[0])); },
    r => { r.accountScope.ownerId = guid(202); },
    r => { delete r.accountScope; },
    r => { r.accountScope.accounts = []; }
  ]) {
    const data = clone(demo);
    change(data.review);
    const p = page(data);
    assert.match(p.ids.summary.textContent, /Portfolio\/source provenance invalid/);
    assert.equal(p.ids.logAll.disabled, true);
    p.ids.logAll.click();
    assert.ok(p.api.getState().candidates.every(x => x.taskDecision !== 'approved' && x.commentDecision !== 'approved'));
  }
  const data = fixture(101, 2);
  data.review.accountScope.accounts.push(clone(data.review.accountScope.accounts[0]));
  assert.match(page(data).ids.chips.textContent, /Account scope: 2 retrieved accounts \(incomplete\/unverified\)/);
});

test('explicit narrower account scope retains the full portfolio and labels exclusions', () => {
  const data = fixture(101, 7, ['email']);
  const r = data.review;
  r.accountScope.restriction = { request: 'Synthetic user explicitly selected first account', accountIds: [r.accountScope.accounts[0].accountId] };
  r.coverage.searches = r.coverage.searches.slice(0, 1);
  const p = page(data);
  assert.match(p.ids.chips.textContent, /Account scope: 7 resolved.*Explicit narrower scope: 1 accounts/);
  assert.match(p.ids.chips.textContent, /All selected accounts searched \(1\)/);
  assert.equal(p.ids.coverage.children.filter(x => x.textContent.includes('Explicitly out of scope')).length, 6);
  r.accountScope.restriction.request = '';
  assert.match(page(data).ids.coverage.textContent, /Invalid explicit account restriction/);
});

test('page keeps restricted candidates out of DOM/state and does not import other-owner decisions', () => {
  const data = clone(demo), other = page(data).api.getState();
  other.ownerId = guid(202);
  other.candidates[0].subject = 'Synthetic foreign-owner edit';
  other.savedAt = '2099-01-01T00:00:00Z';
  data.decisions = other;
  data.review.candidates[0].keptInChat = true;
  data.review.candidates[0].subject = 'Synthetic restricted marker';
  const p = page(data, new Map([[`msxreview:${data.review.reviewId}`, JSON.stringify(other)]]));
  assert.doesNotMatch(p.ids.list.textContent, /Synthetic restricted marker|Synthetic foreign-owner edit/);
  assert.ok(!p.api.getState().candidates.some(x => x.id === 'c01'));
  assert.equal(p.api.getState().ownerId, data.review.owner.id);
});

test('same-owner edits, approval resets, duplicate gating and chat-only write boundary are preserved', () => {
  const data = clone(demo), p = page(data);
  p.ids.logAll.click();
  const state = p.api.getState();
  assert.equal(state.candidates.find(x => x.id === 'c01').taskDecision, 'approved');
  assert.notEqual(state.candidates.find(x => x.id === 'c02').taskDecision, 'approved');
  assert.notEqual(state.candidates.find(x => x.id === 'c03').taskDecision, 'approved');
  assert.equal(state.finished, false);
  data.decisions = state;
  const resumed = page(data);
  assert.equal(resumed.api.getState().candidates.find(x => x.id === 'c01').taskDecision, 'approved');
  const title = resumed.all.find(x => x['aria-label'] === 'HoK title' && x.value === data.review.candidates[0].subject);
  title.value = 'Edited synthetic deliverable.';
  title.events.input();
  assert.equal(resumed.api.getState().candidates.find(x => x.id === 'c01').taskDecision, 'pending');
  assert.deepEqual(Object.keys(p.api).sort(), ['clearSaved', 'getState', 'lock', 'showPlan', 'showResults']);
  assert.doesNotMatch(script, /\b(fetch|XMLHttpRequest|WebSocket|dataverse_write)\s*\(/);
});

test('finished banner copies exactly "post to msx" without writing or changing decisions', async () => {
  const copied = [];
  const p = page(clone(demo), new Map(), { clipboard: { writeText: text => { copied.push(text); return Promise.resolve(); } } });
  p.ids.logAll.click();
  p.ids.copyPhrase.click();
  assert.deepEqual(copied, [], 'copy is inert before Finish review');
  p.ids.finish.click();
  p.ids.dlgFinish.click();
  assert.equal(p.ids.finished.hidden, false);
  assert.equal(p.ids.copyPhrase.disabled, false);
  const before = JSON.stringify({ ...p.api.getState(), savedAt: null });
  p.ids.copyPhrase.click();
  await Promise.resolve();
  assert.deepEqual(copied, ['post to msx']);
  assert.match(p.ids.copyStatus.textContent, /Copied/);
  assert.equal(JSON.stringify({ ...p.api.getState(), savedAt: null }), before);
  p.api.lock();
  assert.equal(p.ids.finished.hidden, true);
  p.ids.copyPhrase.events.click();
  assert.deepEqual(copied, ['post to msx'], 'copy is inert once locked');

  const offline = page(clone(demo));
  offline.ids.logAll.click();
  offline.ids.finish.click();
  offline.ids.dlgFinish.click();
  offline.ids.copyPhrase.click();
  assert.equal(offline.ids.phrase.hidden, false);
  assert.equal(offline.ids.phrase.textContent, 'post to msx');
  assert.match(offline.ids.copyStatus.textContent, /Type this in chat/);
});

test('package links, token, synthetic fixture and procedural retrieval safeguards stay consistent', () => {
  assert.equal(template.split('/*__MSXR_DATA__*/').length, 2);
  assert.match(template, /default-src 'none'/);
  assert.doesNotMatch(script, /\.innerHTML\s*=|\beval\s*\(/);
  assert.equal(demo.demo, true);
  assert.ok(demo.review.owner.email.endsWith('@example.com'));
  const files = [join(skill, 'SKILL.md'), ...readdirSync(join(skill, 'references')).map(x => join(skill, 'references', x))];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)]+)\)/g)) {
      if (target.startsWith('#') || /^[a-z]+:\/\//i.test(target)) continue;
      assert.ok(existsSync(resolve(dirname(file), target.split('#')[0])), `${file}: broken link ${target}`);
    }
  }
  const procedure = readFileSync(join(skill, 'SKILL.md'), 'utf8');
  const operations = readFileSync(join(skill, 'references', 'MSX_OPERATIONS.md'), 'utf8');
  assert.match(procedure, /^---\r?\nname: msx-activity-review\r?\ndescription:/);
  assert.match(procedure, /before any activity search/);
  assert.match(procedure, /exact plan being confirmed in this chat/);
  assert.match(operations, /eq-userid/);
  assert.match(operations, /active-account filters/);
  assert.match(operations, /exact `meta.nextCursor`/);
  assert.match(operations, /no FetchXML cross-call cursor/);
  assert.match(operations, /Deduplicate repeated `accountid`/);
  assert.match(operations, /do not[\s\S]*discard distinct CRM accounts/);
  assert.match(operations, /mark incomplete and stop before activity searches/);
});
