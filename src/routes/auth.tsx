import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Toaster, toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Pontual Catálogo" },
      { name: "description", content: "Acesse a conta da distribuidora Pontual para editar o catálogo." },
      { property: "og:title", content: "Entrar — Pontual Catálogo" },
      { property: "og:description", content: "Acesse a conta da distribuidora Pontual para editar o catálogo." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) toast.error("E-mail ou senha incorretos");
      else nav({ to: "/" });
    } else {
      const { error } = await supabase.auth.signUp({ email, password: pass, options: { emailRedirectTo: window.location.origin } });
      if (error) toast.error(error.message);
      else toast.success("Conta criada! Confirme pelo link enviado ao seu e-mail.");
    }
    setBusy(false);
  }

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Toaster richColors position="top-center" />
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border bg-popover p-8 shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-xl font-extrabold text-primary-foreground">P</div>
        <h1 className="mt-4 text-center text-2xl font-bold">{mode === "in" ? "Entrar" : "Criar conta"}</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Distribuidora Pontual</p>
        <label className="mt-6 block text-sm font-medium">E-mail</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" />
        <label className="mt-4 block text-sm font-medium">Senha</label>
        <input type="password" required minLength={6} value={pass} onChange={(e) => setPass(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" />
        <button disabled={busy} className="mt-6 w-full rounded-md bg-primary py-2.5 font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? "Aguarde…" : mode === "in" ? "Entrar" : "Criar conta"}
        </button>
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground">
          {mode === "in" ? "Ainda não tem conta? Criar conta" : "Já tem conta? Entrar"}
        </button>
        <button type="button" onClick={() => nav({ to: "/" })} className="mt-2 w-full text-sm text-muted-foreground hover:text-foreground">Voltar</button>
      </form>
    </div>
  );
}
