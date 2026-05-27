import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LockKeyhole, LogIn, ShieldCheck, User } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../utils/errors';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LoginModalProps {
  isDarkMode: boolean;
}

export default function LoginModal({ isDarkMode }: LoginModalProps) {
  const { login } = useAuth();
  const [loginValue, setLoginValue] = useState('Make');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(loginValue.trim(), password);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Не удалось войти'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center overflow-hidden bg-[#050505] p-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(245,158,11,0.18),transparent_34%),radial-gradient(circle_at_75%_80%,rgba(59,130,246,0.14),transparent_32%)]" />
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "relative w-full max-w-md rounded-[2rem] border p-8 shadow-2xl backdrop-blur-xl",
          isDarkMode ? "border-white/10 bg-[#111111]/90" : "border-white/20 bg-[#111111]/90"
        )}
      >
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#8CAFBE] text-black shadow-lg shadow-[#8CAFBE]/20">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">Вход в CRM</h2>
            <p className="mt-1 text-sm text-gray-400">Авторизация менеджера</p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Логин</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                value={loginValue}
                onChange={event => setLoginValue(event.target.value)}
                autoComplete="username"
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 pl-12 pr-4 text-sm font-bold outline-none transition-all focus:border-[#8CAFBE] focus:bg-white/10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Пароль</label>
            <div className="relative">
              <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                value={password}
                onChange={event => setPassword(event.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                autoFocus
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 pl-12 pr-12 text-sm font-bold outline-none transition-all focus:border-[#8CAFBE] focus:bg-white/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">
            {error}
          </div>
        )}

        <motion.button
          type="submit"
          disabled={isSubmitting}
          whileTap={{ scale: 0.97 }}
          className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#8CAFBE] text-sm font-black text-black shadow-lg shadow-[#8CAFBE]/20 transition-all hover:bg-[#B4CDD2] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogIn size={18} />
          {isSubmitting ? 'Проверяем...' : 'Войти'}
        </motion.button>
      </motion.form>
    </div>
  );
}
