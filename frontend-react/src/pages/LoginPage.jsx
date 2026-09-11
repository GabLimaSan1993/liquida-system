import { useState } from "react";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from "lucide-react";

import { signIn } from "../services/authService";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    if (!email || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      await signIn(email, password);
    } catch (err) {
      setError("E-mail ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F4F4F5] px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-x-0 top-0 h-1 bg-[#2B1836]" />

      <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-[1400px] items-center justify-center">
        <div className="grid w-full max-w-[1180px] overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)] lg:grid-cols-[1.08fr_0.92fr]">

          {/* LADO DA MARCA */}
          <section className="relative hidden min-h-[680px] overflow-hidden bg-[#F7F5F8] lg:flex lg:items-center lg:justify-center">
            <div className="absolute left-0 top-0 h-full w-[6px] bg-[#2B1836]" />

            <div className="absolute left-10 top-10 h-16 w-16 rounded-full bg-[#6D28D9]/[0.04]" />
            <div className="absolute bottom-14 right-12 h-28 w-28 rounded-full bg-[#2B1836]/[0.03]" />

            <div className="relative flex w-full max-w-[560px] flex-col items-center px-12">
              <img
                src="/brand/liquida-logo-full.png"
                alt="LiquidaPreço"
                className="w-full max-w-[500px] object-contain"
              />

              <div className="mt-10 h-px w-20 bg-[#2B1836]/15" />

              <div className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-[#2B1836]/45">
                Liquida System
              </div>
            </div>
          </section>

          {/* LOGIN */}
          <section className="relative flex min-h-[680px] flex-col bg-white">
            <div className="flex flex-1 items-center justify-center px-7 py-14 sm:px-12 lg:px-16">
              <div className="w-full max-w-[420px]">

                {/* Logo mobile */}
                <div className="mb-12 lg:hidden">
                  <img
                    src="/brand/liquida-logo-full.png"
                    alt="LiquidaPreço"
                    className="mx-auto w-full max-w-[280px] object-contain"
                  />
                </div>

                <div className="mb-9">
                  <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#F4F0F6] text-[#2B1836] ring-1 ring-[#2B1836]/10">
                    <LockKeyhole className="h-5 w-5" />
                  </div>

                  <h1 className="text-[30px] font-black tracking-[-0.03em] text-slate-900">
                    Acesse sua conta
                  </h1>

                  <p className="mt-2 text-sm text-slate-500">
                    Utilize suas credenciais para continuar.
                  </p>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="space-y-5"
                >
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-sm font-bold text-slate-700"
                    >
                      E-mail
                    </label>

                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />

                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="
                          h-12 w-full rounded-xl border border-slate-200
                          bg-slate-50 pl-11 pr-4 text-sm text-slate-800
                          outline-none transition
                          placeholder:text-slate-400
                          hover:border-slate-300
                          focus:border-[#6D4A7B] focus:bg-white
                          focus:ring-4 focus:ring-[#6D4A7B]/10
                        "
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="mb-2 block text-sm font-bold text-slate-700"
                    >
                      Senha
                    </label>

                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />

                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="
                          h-12 w-full rounded-xl border border-slate-200
                          bg-slate-50 pl-11 pr-12 text-sm text-slate-800
                          outline-none transition
                          placeholder:text-slate-400
                          hover:border-slate-300
                          focus:border-[#6D4A7B] focus:bg-white
                          focus:ring-4 focus:ring-[#6D4A7B]/10
                        "
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="
                          absolute right-3 top-1/2 flex h-8 w-8
                          -translate-y-1/2 items-center justify-center
                          rounded-lg text-slate-400 transition
                          hover:bg-slate-100 hover:text-slate-700
                        "
                        aria-label={
                          showPassword
                            ? "Ocultar senha"
                            : "Mostrar senha"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="h-[18px] w-[18px]" />
                        ) : (
                          <Eye className="h-[18px] w-[18px]" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="
                      mt-2 flex h-12 w-full items-center justify-center
                      rounded-xl bg-[#2B1836] text-sm font-bold text-white
                      shadow-[0_8px_24px_rgba(43,24,54,0.18)]
                      transition
                      hover:bg-[#382046]
                      focus:outline-none focus:ring-4 focus:ring-[#2B1836]/15
                      disabled:cursor-not-allowed disabled:opacity-50
                    "
                  >
                    {loading ? "Entrando..." : "Entrar"}
                  </button>
                </form>
              </div>
            </div>

            <div className="border-t border-slate-100 px-6 py-5 text-center">
              <span className="text-[11px] font-medium tracking-wide text-slate-400">
                Powered by{" "}
              </span>

              <span className="text-[11px] font-bold tracking-wide text-slate-600">
                Redoma Advisory
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}