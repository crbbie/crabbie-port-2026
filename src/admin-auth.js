import { supabase, isConfigured } from './supabase-client.js';
import { isAdminUser, validateLoginPayload } from './admin-auth-core.js';

let currentAdmin = null;
let isRestoring = true;

export function getAdminState() {
  return { admin: currentAdmin, isRestoring };
}

export async function restoreSession() {
  if (!isConfigured || !supabase) {
    isRestoring = false;
    if (window.CrabbieAdminAuth) window.CrabbieAdminAuth.notify(null);
    return null;
  }
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session || !session.user) {
      currentAdmin = null;
    } else if (isAdminUser(session.user)) {
      currentAdmin = session.user;
    } else {
      await supabase.auth.signOut();
      currentAdmin = null;
    }
  } catch (err) {
    console.warn('Session restoration failed:', err.message);
    currentAdmin = null;
  } finally {
    isRestoring = false;
    if (window.CrabbieAdminAuth) window.CrabbieAdminAuth.notify(currentAdmin);
  }
  return currentAdmin;
}

export async function login(email, password) {
  const check = validateLoginPayload(email, password);
  if (!check.valid) return { success: false, error: check.error };
  if (!isConfigured || !supabase) return { success: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    return { success: false, error: error.message };
  }
  if (!isAdminUser(data.user)) {
    await supabase.auth.signOut();
    return { success: false, error: 'Access denied. Account is not authorized as admin.' };
  }
  currentAdmin = data.user;
  if (window.CrabbieAdminAuth) window.CrabbieAdminAuth.notify(currentAdmin);
  return { success: true, user: currentAdmin };
}

export async function logout() {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Signout error:', e.message);
    }
  }
  currentAdmin = null;
  if (window.CrabbieAdminAuth) window.CrabbieAdminAuth.notify(null);
}

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      currentAdmin = null;
      if (window.CrabbieAdminAuth) window.CrabbieAdminAuth.notify(null);
    } else if (session && session.user && isAdminUser(session.user)) {
      currentAdmin = session.user;
      if (window.CrabbieAdminAuth) window.CrabbieAdminAuth.notify(currentAdmin);
    }
  });
}

restoreSession();

window.CrabbieAuthService = {
  getAdmin: () => currentAdmin,
  isRestoring: () => isRestoring,
  login,
  logout,
  restoreSession
};


function isAdminLocation() {
  const path = (window.location.pathname || '').replace(/^\/+|\/+$/g, '');
  const hash = (window.location.hash || '').replace(/^#/, '');
  return path === 'admin' || path.startsWith('admin/') || hash === 'admin' || hash.startsWith('admin/');
}

function syncStandaloneAdminGate() {
  if (!isAdminLocation()) return;
  document.body.classList.add('admin-mode');
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('is-active', view.getAttribute('data-view') === 'admin');
  });
  const loginShell = document.getElementById('adminLoginShell');
  const realShell = document.getElementById('adminRealShell');
  if (loginShell) loginShell.style.display = currentAdmin ? 'none' : 'flex';
  if (realShell) realShell.style.display = currentAdmin ? '' : 'none';
}

function wireStandaloneLoginForm() {
  const form = document.getElementById('adminLoginForm');
  if (!form || form.dataset.authWired === '1') return;
  form.dataset.authWired = '1';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailEl = document.getElementById('adminEmail');
    const passEl = document.getElementById('adminPassword');
    const errorEl = document.getElementById('adminLoginError');
    const button = document.getElementById('adminLoginBtn');

    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'Signing in…';
    }

    try {
      const result = await login(emailEl ? emailEl.value : '', passEl ? passEl.value : '');
      if (!result.success) {
        if (errorEl) {
          errorEl.textContent = result.error || 'Login failed';
          errorEl.style.display = 'block';
        }
        return;
      }
      if (passEl) passEl.value = '';
      syncStandaloneAdminGate();
      if (window.CrabbieAdminAuth) window.CrabbieAdminAuth.notify(currentAdmin);
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Login error';
        errorEl.style.display = 'block';
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Sign In';
      }
    }
  });
}

function initAdminEntry() {
  wireStandaloneLoginForm();
  syncStandaloneAdminGate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminEntry);
} else {
  initAdminEntry();
}
window.addEventListener('hashchange', syncStandaloneAdminGate);
