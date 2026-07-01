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
    // Read session from cookies on mount. This handles:
    // 1. Page loads with an existing session (returning user)
    // 2. After Google OAuth redirect — the /auth/callback route sets cookies,
    //    then redirects here; getSession() picks up those cookies immediately.
    //
    // We do NOT use onAuthStateChange because the SDK fires SIGNED_OUT for
    // non-genuine reasons (e.g. rate-limit 429 on token refresh), which would
    // immediately kick the user back to the sign-in screen. Managing state
    // directly in signIn/signUp/signOut is simpler and more reliable.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) loadProfile();
    });
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
        if (data.session) {
          // Email confirmation is disabled — user is signed in immediately
          setUser(data.user);
          setLoading(false);
          await loadProfile();
        }
      }
      return { error: null, needsConfirmation: !data.session };
    } catch (e: any) {
      return { error: e?.message || 'Sign up failed', needsConfirmation: false };
    }
  }

  async function signIn(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      // Update state directly from the sign-in response — no event subscription needed
      if (data.user) {
        setUser(data.user);
        setLoading(false);
        await loadProfile();
      }
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
