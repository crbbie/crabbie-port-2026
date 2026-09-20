import { supabase, isConfigured } from './supabase-client.js';
import { isAdminUser, validateLoginPayload } from './admin-auth-core.js';
import { decideAdminAuthEvent } from './admin-auth-events-core.js';

let currentAdmin = null;
let isRestoring = true;
// One authenticated session may request exactly one CMS hydration pass.
let adminHydrationRequested = false;

function isAdminDirty() {
  try {
    return Boolean(window.CrabbieAdminAuth && window.CrabbieAdminAuth.isDirty && window.CrabbieAdminAuth.isDirty());
  } catch (err) {
    return false;
  }
}

function notifyAdminUi(event) {
  const decision = decideAdminAuthEvent({
    event,
    hasAdminUser: Boolean(currentAdmin),
    hasHydrated: adminHydrationRequested,
    hydrationInFlight: false,
    dirty: isAdminDirty()
  });
  if (decision.clearAdmin) {
    currentAdmin = null;
    adminHydrationRequested = false;
  }
  if (decision.hydrate) adminHydrationRequested = true;
  const payload = { event, adminUser: currentAdmin, hydrate: decision.hydrate, updateUserOnly: decision.updateUserOnly };
  const bridge = window.CrabbieAdminAuth;
  if (bridge) {
    bridge.notify(payload);
    return;
  }
  // The inline admin script owns the shell; it always registers before load.
  document.addEventListener('DOMContentLoaded', function () {
    if (window.CrabbieAdminAuth) window.CrabbieAdminAuth.notify(payload);
  }, { once: true });
}

export function getAdminState() {
  return { admin: currentAdmin, isRestoring };
}

export async function restoreSession() {
  if (!isConfigured || !supabase) {
    isRestoring = false;
    currentAdmin = null;
    notifyAdminUi('SIGNED_OUT');
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
  }
  // One clear ownership path: the initial entry asks for the first hydration.
  notifyAdminUi('INITIAL_SESSION');
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
  // The auth-state callback delivers the same SIGNED_IN event; the policy
  // keeps the pair to a single hydration request.
  notifyAdminUi('SIGNED_IN');
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
  adminHydrationRequested = false;
  notifyAdminUi('SIGNED_OUT');
}

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    currentAdmin = session && session.user && isAdminUser(session.user) ? session.user : null;
    notifyAdminUi(event);
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
