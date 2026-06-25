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
    // Safety net — never show a loading state longer than 3 seconds
    const timeout = setTimeout(() => setLoading(false), 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      clearTimeout(timeout);
      setLoading(false);
      if (session?.user) {
        // Defer: NEVER call supabase queries synchronously in auth callbacks
        setTimeout(() => { loadProfile(); }, 0);
      }
    }).catch(() => {
      clearTimeout(timeout);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // CRITICAL: do NOT await supabase calls inside this callback.
        // The client holds an auth lock during this callback — any query
        // made here deadlocks the entire client. Defer with setTimeout.
        setUser(session?.user ?? null);
        setLoading(false);
        if (session?.user) {
          setTimeout(() => { loadProfile(); }, 0);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
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
