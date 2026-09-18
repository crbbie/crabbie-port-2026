import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
const config = window.__CRABBIE_SUPABASE_CONFIG__ || {};
export const isConfigured = Boolean(config.url && config.key);
export const supabase = isConfigured ? createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
window.CrabbieSupabase = { supabase, isConfigured };
