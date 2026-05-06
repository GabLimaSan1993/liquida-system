import { useState } from "react";
import { signIn } from "../services/authService";

function inputClass() {
  return "w-full rounded-2xl border border-[#E9D5FF] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#F59E0B]/40 bg-white";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="min-h-screen bg-[linear-gradient(135deg,#4C1D95_0%,#6B1F87_42%,#A12A7D_70%,#F97316_100%)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="relative h-14 w-14 rounded-2xl bg-white/20 shadow-lg ring-1 ring-white/30 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center text-white font-black text-xl">
              LP
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-white">
              liquida<span className="text-[#F59E0B]">preço</span>
            </div>
            <div className="text-sm text-white/70 -mt-1">Liquida System</div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-[32px] bg-white p-8 shadow-2xl">
          <h1 className="text-2xl font-black text-[#4C1D95] mb-1">Bem-vindo</h1>
          <p className="text-sm text-slate-500 mb-6">Faça login para acessar o sistema.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label>
              <span className="text-sm font-semibold text-slate-600">E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass()}
                placeholder="seu@email.com"
              />
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-600">Senha</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass()}
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 ring-1 ring-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-[linear-gradient(135deg,#4C1D95_0%,#6B1F87_100%)] py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 mt-2"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-white/50 mt-6">
          Liquida System · Pricing & Margem
        </p>
      </div>
    </div>
  );
}