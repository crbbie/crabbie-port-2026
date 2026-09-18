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
