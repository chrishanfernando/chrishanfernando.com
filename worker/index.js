// Cloudflare Worker entry for chrishanfernando.com.
//
// The site is otherwise a static Astro build served straight from ./dist. This
// Worker exists for ONE feature: a private, password-gated meal-planning page
// shared between two people, living at an unguessable path `/m/<slug>`.
//
// Everything that isn't `/m/...` is handed straight to the static assets, so the
// public profile pages keep their zero-overhead static serving.
//
// Nothing private is committed to the repo. The path slug, the shared password,
// and the cookie-signing key are all Worker **secrets** (see README-meal-plan.md):
//   MEAL_SLUG           - the path segment, e.g. the <slug> in /m/<slug>
//   MEAL_PASSWORD       - the shared password
//   MEAL_COOKIE_SECRET  - random key used to sign the session cookie
// Bindings:
//   ASSETS   - static assets fetcher (the built Astro site)
//   MEAL_KV  - KV namespace holding the single shared meal-plan document

import { renderAppPage, renderLoginPage } from './meal-plan-page.js';

const SESSION_COOKIE = 'mp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const KV_KEY = 'state';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean); // e.g. ['m','abc','api','state']

    // Not our feature -> let the static site handle it (pages, assets, 404).
    if (segments[0] !== 'm') {
      return env.ASSETS.fetch(request);
    }

    // Misconfigured deployment: fail closed rather than exposing anything.
    if (!env.MEAL_SLUG || !env.MEAL_PASSWORD || !env.MEAL_COOKIE_SECRET) {
      return new Response('Meal plan is not configured.', { status: 503 });
    }

    // Wrong slug -> behave exactly like any other unknown URL (don't confirm the
    // real slug exists). Serve the site's normal 404.
    if (segments[1] !== env.MEAL_SLUG) {
      return env.ASSETS.fetch(request);
    }

    const base = `/m/${env.MEAL_SLUG}`;
    const rest = segments.slice(2); // path after the slug

    try {
      // --- Login / logout (do not require an existing session) ---
      if (rest[0] === 'login' && request.method === 'POST') {
        return handleLogin(request, env, base);
      }
      if (rest[0] === 'logout' && request.method === 'POST') {
        return handleLogout(base);
      }

      // --- Everything else requires a valid session ---
      const authed = await isAuthed(request, env);

      // The page itself.
      if (rest.length === 0) {
        if (request.method !== 'GET') return methodNotAllowed('GET');
        if (!authed) return htmlResponse(renderLoginPage(base, false), 200);
        const stored = await loadState(env);
        return htmlResponse(renderAppPage(base, stored), 200);
      }

      // The state API.
      if (rest[0] === 'api' && rest[1] === 'state' && rest.length === 2) {
        if (!authed) return jsonResponse({ error: 'unauthorized' }, 401);
        if (request.method === 'GET') {
          return jsonResponse(await loadState(env));
        }
        if (request.method === 'PUT') {
          return handleSave(request, env);
        }
        return methodNotAllowed('GET, PUT');
      }

      return new Response('Not found', { status: 404 });
    } catch (err) {
      return new Response('Internal error', { status: 500 });
    }
  },
};

// --------------------------------------------------------------------------
// Auth
// --------------------------------------------------------------------------

async function handleLogin(request, env, base) {
  const form = await request.formData();
  const password = String(form.get('password') || '');
  if (!timingSafeEqual(password, env.MEAL_PASSWORD)) {
    return htmlResponse(renderLoginPage(base, true), 401);
  }
  const cookie = await createSessionCookie(env, base);
  return new Response(null, {
    status: 303,
    headers: { Location: base, 'Set-Cookie': cookie },
  });
}

function handleLogout(base) {
  const cleared = `${SESSION_COOKIE}=; Path=${base}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return new Response(null, {
    status: 303,
    headers: { Location: base, 'Set-Cookie': cleared },
  });
}

async function isAuthed(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return false;
  return verifySessionToken(env, token);
}

// Session token = "<expiryEpoch>.<hmacHex>" where hmac covers the expiry.
async function createSessionCookie(env, base) {
  const exp = nowSeconds() + SESSION_TTL_SECONDS;
  const sig = await hmacHex(env.MEAL_COOKIE_SECRET, String(exp));
  const value = `${exp}.${sig}`;
  return `${SESSION_COOKIE}=${value}; Path=${base}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

async function verifySessionToken(env, token) {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < nowSeconds()) return false;
  const expected = await hmacHex(env.MEAL_COOKIE_SECRET, expStr);
  return timingSafeEqual(sig, expected);
}

// --------------------------------------------------------------------------
// State storage (single shared document in KV)
// --------------------------------------------------------------------------

async function loadState(env) {
  const raw = await env.MEAL_KV.get(KV_KEY);
  if (!raw) return { version: 0, updatedAt: null, data: DEFAULT_STATE };
  try {
    const parsed = JSON.parse(raw);
    return {
      version: parsed.version || 0,
      updatedAt: parsed.updatedAt || null,
      data: sanitizeData(parsed.data),
    };
  } catch {
    return { version: 0, updatedAt: null, data: DEFAULT_STATE };
  }
}

async function handleSave(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400);
  }
  const data = sanitizeData(body && body.data);
  if (!data) return jsonResponse({ error: 'invalid data' }, 400);

  const current = await loadState(env);
  const next = {
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
    data,
  };
  await env.MEAL_KV.put(KV_KEY, JSON.stringify(next));
  return jsonResponse(next);
}

// Validate + normalise the incoming document so a bad client can't poison KV.
function sanitizeData(data) {
  if (!data || typeof data !== 'object') return null;
  const cats = data.categories;
  const weeks = data.weeks;
  if (!cats || typeof cats !== 'object' || !Array.isArray(weeks)) return null;

  const CAT_KEYS = ['batch', 'fresh', 'zero'];
  const cleanCats = {};
  for (const key of CAT_KEYS) {
    const list = Array.isArray(cats[key]) ? cats[key] : [];
    const seen = new Set();
    cleanCats[key] = [];
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const v = item.trim().slice(0, 80);
      if (!v) continue;
      const lower = v.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      cleanCats[key].push(v);
    }
  }

  const cleanWeeks = [];
  for (const week of weeks) {
    if (!week || typeof week !== 'object') continue;
    const w = {};
    for (const key of CAT_KEYS) {
      w[key] = typeof week[key] === 'string' ? week[key].trim().slice(0, 80) : '';
    }
    cleanWeeks.push(w);
    if (cleanWeeks.length >= 52) break; // hard cap
  }
  if (cleanWeeks.length === 0) return null;

  return { categories: cleanCats, weeks: cleanWeeks };
}

// --------------------------------------------------------------------------
// Small helpers
// --------------------------------------------------------------------------

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time-ish string compare to avoid leaking length/prefix via timing.
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) {
    // Still do a compare to keep timing roughly constant.
    let diff = 1;
    const len = Math.max(ab.length, 1);
    for (let i = 0; i < len; i++) diff |= (ab[i] || 0) ^ (ab[i] || 0);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function methodNotAllowed(allow) {
  return new Response('Method not allowed', { status: 405, headers: { Allow: allow } });
}

// Seed used the first time the page is opened, before anything is saved.
// Mirrors the reference implementation's starting rotation.
const DEFAULT_STATE = {
  categories: {
    batch: [
      'Rice and veggies',
      'Brioche bun burgers',
      'Quiche',
      "Shepherd's pie (beef or lamb)",
      'Chicken schnitzel or tenders',
      'Gnocchi bake',
      'Chicken & veggie pot pie',
      'Chicken noodle soup',
    ],
    fresh: [
      'Pasta with salmon or tuna',
      'Noodles',
      'Fried rice',
      'Beef or chicken stir-fry',
      'Homemade pizza (dough + toppings)',
      'Dumplings / potstickers',
      'Ravioli with sauce + meatballs or sausage',
    ],
    zero: ['Ready-made pies', 'Pizza (shop-bought)'],
  },
  weeks: [
    { batch: 'Quiche', fresh: 'Fried rice', zero: 'Pizza (shop-bought)' },
    { batch: 'Chicken schnitzel or tenders', fresh: 'Beef or chicken stir-fry', zero: 'Ready-made pies' },
    { batch: 'Rice and veggies', fresh: 'Noodles', zero: 'Pizza (shop-bought)' },
    { batch: 'Gnocchi bake', fresh: 'Homemade pizza (dough + toppings)', zero: 'Ready-made pies' },
    { batch: 'Chicken & veggie pot pie', fresh: 'Dumplings / potstickers', zero: 'Pizza (shop-bought)' },
    { batch: 'Chicken noodle soup', fresh: 'Pasta with salmon or tuna', zero: 'Ready-made pies' },
    { batch: 'Brioche bun burgers', fresh: 'Fried rice', zero: 'Pizza (shop-bought)' },
    { batch: "Shepherd's pie (beef or lamb)", fresh: 'Pasta with salmon or tuna', zero: 'Ready-made pies' },
  ],
};
