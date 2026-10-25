// Recuperação local de entradas durante recargas e mudanças de rota.
// Não persiste senhas, arquivos, credenciais ou campos ocultos.
const PREFIX = 'liquida:draft:v1:';
const MAX_AGE = 24 * 60 * 60 * 1000;
const MAX_FIELDS = 200;
const MAX_SIZE = 100_000;
const BLACKLIST = /password|senha|token|secret|chave|authorization|apikey|api_key|cpf|cnpj|imei|serial|voucher|email|telefone|phone/i;
const SUPPORTED = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const memory = new Map();
let userKey = 'anonymous';
let currentRoute = '';

function eligible(el) {
  if (!el || !SUPPORTED.has(el.tagName)) return false;
  const type = (el.type || '').toLowerCase();
  if (['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return false;
  if (el.disabled || el.closest('[data-no-draft], [autocomplete="off"]')) return false;
  if (el.autocomplete === 'off' || el.autocomplete === 'one-time-code') return false;
  if (BLACKLIST.test([el.name, el.id, el.autocomplete].join(' '))) return false;
  if (el.tagName === 'INPUT' && !['text', 'search', 'number', 'date', 'datetime-local', 'time', 'checkbox', 'radio', 'email', 'tel', 'url'].includes(type)) return false;
  return true;
}

function fingerprint(el) {
  const form = el.closest('form');
  const container = form || el.closest('main') || document.body;
  const elems = Array.from(container.querySelectorAll('input,textarea,select')).filter(eligible);
  const index = elems.indexOf(el);
  return [form?.id || form?.getAttribute('name') || 'page', el.name || el.id || el.getAttribute('placeholder') || el.tagName, index].join('::');
}

function key(route = currentRoute) {
  return PREFIX + userKey + ':' + route;
}

function read(route = currentRoute) {
  try {
    const raw = sessionStorage.getItem(key(route));
    const data = raw ? JSON.parse(raw) : null;
    if (!data || Date.now() - data.time > MAX_AGE) return {};
    return data.fields || {};
  } catch { return memory.get(key(route)) || {}; }
}

function save(route, fields) {
  const data = { time: Date.now(), fields };
  memory.set(key(route), fields);
  try {
    const value = JSON.stringify(data);
    if (value.length <= MAX_SIZE) sessionStorage.setItem(key(route), value);
  } catch { /* quotas ou modo privado: conserva estado em memória */ }
}

function record(event) {
  const el = event.target;
  if (!eligible(el)) return;
  const field = fingerprint(el);
  const fields = { ...read() };
  fields[field] = el.type === 'checkbox' || el.type === 'radio' ? Boolean(el.checked) : el.value;
  if (Object.keys(fields).length > MAX_FIELDS) return;
  save(currentRoute, fields);
}

function restore(el, fields) {
  if (!eligible(el)) return;
  const value = fields[fingerprint(el)];
  if (value === undefined || el.dataset.liquidaDraftRestored === currentRoute) return;
  el.dataset.liquidaDraftRestored = currentRoute;
  const property = el.type === 'checkbox' || el.type === 'radio' ? 'checked' : 'value';
  if (el[property] === value) return;
  const descriptor = Object.getOwnPropertyDescriptor(
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype :
    el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, property
  );
  if (descriptor?.set) descriptor.set.call(el, value);
  else el[property] = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function installDraftRecovery() {
  if (typeof window === 'undefined' || window.__liquidaDraftInstalled) return;
  window.__liquidaDraftInstalled = true;
  currentRoute = location.pathname + location.search;
  document.addEventListener('input', record, true);
  document.addEventListener('change', record, true);
  let scheduled = false;
  function apply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const fields = read();
      if (!Object.keys(fields).length) return;
      document.querySelectorAll('input,textarea,select').forEach(el => restore(el, fields));
    });
  }
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', () => { currentRoute = location.pathname + location.search; apply(); });
  window.addEventListener('liquida:navigate', (e) => { currentRoute = e.detail?.route || location.pathname + location.search; apply(); });
  window.addEventListener('liquida:draft-clear', () => {
    sessionStorage.removeItem(key()); memory.delete(key());
  });
  apply();
}

export function updateDraftRoute(route, userId) {
  if (userId && userKey !== userId) userKey = userId;
  currentRoute = route;
  window.dispatchEvent(new CustomEvent('liquida:navigate', { detail: { route } }));
}
