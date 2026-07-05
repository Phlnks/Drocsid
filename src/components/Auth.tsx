import { useState } from 'react';
import { supabase } from '../supabase';
import DrocsidLogo from './ui/DrocsidLogo';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export default function Auth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Local auth states
  const [isSignUp, setIsSignUp] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [password, setPassword] = useState('');

  const handleGoogleLogin = async (forceChoice = false) => {
    setLoading(true);
    setError('');
    try {
      // Déterminer l'URL de redirection
      const redirectTo = window.location.origin;
      
      const options: any = {
        redirectTo: redirectTo,
        skipBrowserRedirect: true,
        queryParams: {}
      };

      if (forceChoice) {
        options.queryParams.prompt = 'select_account';
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options
      });
      
      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  const handleLocalAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    const trimmedInput = userInput.trim();
    const trimmedPassword = password;

    if (!trimmedInput || !trimmedPassword) {
      setError(t('common.requiredFields', 'All fields are required.'));
      setLoading(false);
      return;
    }

    if (trimmedPassword.length < 6) {
      setError(t('auth.passwordError'));
      setLoading(false);
      return;
    }

    const isEmail = trimmedInput.includes('@');
    const email = isEmail ? trimmedInput : `${trimmedInput.toLowerCase()}@drocsid.local`;
    const username = isEmail ? trimmedInput.split('@')[0] : trimmedInput;

    try {
      if (isSignUp) {
        // Validate username format if not an email
        if (!isEmail) {
          const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
          if (!usernameRegex.test(username)) {
            setError(t('auth.usernameError'));
            setLoading(false);
            return;
          }
        }

        // Check if username already exists in profiles
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username)
          .maybeSingle();

        if (existingProfile) {
          setError(t('auth.usernameTaken'));
          setLoading(false);
          return;
        }

        // SignUp
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password: trimmedPassword,
          options: {
            data: {
              username: username
            }
          }
        });

        if (signUpError) throw signUpError;
        
        // Auto sign in if no session was created automatically
        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password: trimmedPassword
          });
          if (signInError) throw signInError;
        }
      } else {
        // SignIn
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: trimmedPassword
        });

        if (signInError) throw signInError;
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col justify-center items-center p-4">
      <div className="bg-[#313338] p-8 rounded-2xl shadow-xl w-full max-w-md border border-zinc-800">
        <div className="flex justify-center mb-6">
          <div className="bg-black p-1 rounded-xl">
            <DrocsidLogo className="w-14 h-14" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2 text-center">{t('auth.welcome')}</h1>
        <p className="text-zinc-400 mb-6 text-center text-sm">{t('auth.description')}</p>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-6 text-sm">
            {error}
            <div className="mt-2 pt-2 border-t border-red-500/20 text-[10px] opacity-70 break-all">
              URL : {window.location.origin}
            </div>
          </div>
        )}

        <form onSubmit={handleLocalAuth} className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
              {t('auth.username')}
            </label>
            <input
              type="text"
              required
              disabled={loading}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="shaco"
              className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all placeholder:text-[#5c5e66]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#b5bac1] uppercase mb-2">
              {t('auth.password')}
            </label>
            <input
              type="password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#1e1f22] text-[#f2f3f5] p-2.5 rounded border border-transparent focus:border-[#5865F2] outline-none transition-all placeholder:text-[#5c5e66]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-2.5 rounded transition-colors disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              isSignUp ? t('auth.signUp') : t('auth.signIn')
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-sm text-[#00a8fc] hover:underline"
            >
              {isSignUp ? t('auth.haveAccount') : t('auth.noAccount')}
            </button>
          </div>
        </form>

        <div className="relative flex py-4 items-center mb-4">
          <div className="flex-grow border-t border-zinc-700/50"></div>
          <span className="flex-shrink mx-4 text-xs text-[#b5bac1] font-bold uppercase">{t('auth.or')}</span>
          <div className="flex-grow border-t border-zinc-700/50"></div>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => handleGoogleLogin(false)}
            disabled={loading}
            className="w-full bg-white text-zinc-900 font-semibold py-3 px-4 rounded-lg hover:bg-zinc-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {t('auth.continueWithGoogle')}
              </>
            )}
          </button>

          <button
            onClick={() => handleGoogleLogin(true)}
            disabled={loading}
            className="w-full bg-zinc-700 text-white font-semibold py-2.5 px-4 rounded hover:bg-zinc-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
          >
            {t('auth.switchAccount')}
          </button>

          <div className="pt-6 border-t border-zinc-700/50 flex flex-col gap-4">
            <button
              onClick={() => navigate('/download')}
              className="text-indigo-400 hover:text-indigo-300 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t('download.title')}
            </button>

            <button
              onClick={() => {
                localStorage.removeItem('drocsid-current-instance-id');
                localStorage.setItem('drocsid-current-instance-id', 'default');
                window.location.reload();
              }}
              className="text-zinc-500 hover:text-white text-xs transition-colors"
            >
              {t('auth.connectionProblem')} {t('auth.resetDefaultServer')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
