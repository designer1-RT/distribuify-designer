import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Toaster, toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loginEmail } from "@/lib/access";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Pontual Catálogo" },
      { name: "description", content: "Acesse a plataforma de catálogos da distribuidora Pontual." },
      { property: "og:title", content: "Entrar — Pontual Catálogo" },
      { property: "og:description", content: "Acesse a plataforma de catálogos da distribuidora Pontual." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [login, setLogin] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(login), password: key });
    if (error) toast.error("Login ou chave de acesso incorretos");
    else nav({ to: "/" });
    setBusy(false);
  }

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Toaster richColors position="top-center" />
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border bg-popover p-8 shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-xl font-extrabold text-primary-foreground">P</div>
        <h1 className="mt-4 text-center text-2xl font-bold">Entrar</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Distribuidora Pontual</p>
        <label className="mt-6 block text-sm font-medium">Login</label>
        <input required autoComplete="username" autoCapitalize="none" value={login} onChange={(e) => setLogin(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" />
        <label className="mt-4 block text-sm font-medium">Chave de acesso</label>
        <input type="password" required autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" />
        <button disabled={busy} className="mt-6 w-full rounded-md bg-primary py-2.5 font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? "Aguarde…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
