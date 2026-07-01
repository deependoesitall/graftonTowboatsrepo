'use client';
// src/lib/auth-context.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface CustomerProfile {
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
}

interface SignUpDetails {
  firstName: string;
  lastName?: string;
  companyName?: string;
}

interface AuthContextType {
  user: User | null;
  profile: CustomerProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, details: SignUpDetails) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, loading: true,
  signUp: async () => ({ error: null, needsConfirmation: false }),
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  resetPassword: async () => ({ error: null }),
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  async function loadProfile() {
    try {
      const { data } = await supabase
        .from('customer_profiles')
        .select('*')
        .maybeSingle();
      setProfile(data ?? null);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    // Step 1: Read the current session from cookies immediately (no network call).
    // This is the fast path that handles page loads with an existing session,
    // including after Google OAuth where the callback sets cookies then redirects here.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) loadProfile();
    });

    // Step 2: Subscribe to all subsequent auth changes (sign in, sign out, token refresh).
    // Skip INITIAL_SESSION — getSession() above already handled it. Without this skip,
    // INITIAL_SESSION can fire null AFTER getSession() correctly found a session,
    // causing a false sign-out flash (the root cause of the Google OAuth flicker).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION') return;
        // CRITICAL: do NOT await Supabase calls inside this callback —
        // the client holds an auth lock here. Defer with setTimeout if needed.
        setUser(session?.user ?? null);
        setLoading(false);
        if (session?.user) {
          setTimeout(() => { loadProfile(); }, 0);
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function signUp(email: string, password: string, details: SignUpDetails) {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
      if (data.user) {
        const contactName = [details.firstName, details.lastName].filter(Boolean).join(' ');
        await supabase.from('customer_profiles').upsert({
          user_id: data.user.id,
          first_name: details.firstName || null,
          last_name: details.lastName || null,
          company_name: details.companyName || null,
          contact_name: contactName || null,
        });
        // If session is present, user is immediately signed in (email confirmation disabled)
        if (data.session) {
          await loadProfile();
        }
        // If no session, Supabase requires email confirmation — caller should show that message
      }
      return { error: null, needsConfirmation: !data.session };
    } catch (e: any) {
      return { error: e?.message || 'Sign up failed', needsConfirmation: false };
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      // Profile loads via the deferred onAuthStateChange handler
      return { error: null };
    } catch (e: any) {
      return { error: e?.message || 'Sign in failed' };
    }
  }

  async function resetPassword(email: string) {
    try {
      const redirectTo = `${window.location.origin}/auth/callback?type=recovery`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) return { error: error.message };
      return { error: null };
    } catch (e: any) {
      return { error: e?.message || 'Failed to send reset email' };
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, resetPassword, refreshProfile: loadProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
