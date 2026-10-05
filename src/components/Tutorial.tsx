import { useEffect, useState } from "react";

export const STEPS = [
  { target: "nav-dashboard", title: "Painel", text: "Comece aqui: envie seu catálogo em PDF e veja seus arquivos." },
  { target: "nav-editor", title: "Editar produtos", text: "Edite código, nome e quantidade dos produtos e troque o layout da página." },
  { target: "nav-pages", title: "Organizar páginas", text: "Reordene, adicione ou remova páginas do catálogo." },
  { target: "nav-theme", title: "Modo claro / escuro", text: "Alterne a aparência da plataforma." },
  { target: "nav-login", title: "Entrar / Sair", text: "Acesse sua conta da distribuidora." },
  { target: "tool-zoom", title: "Zoom e páginas", text: "Aproxime, afaste e veja em qual página você está." },
  { target: "tool-share", title: "Enviar link", text: "Copie um link do catálogo para enviar aos clientes." },
  { target: "tool-export", title: "Exportar PDF", text: "Baixe o catálogo atualizado em PDF." },
  { target: "help", title: "Ajuda", text: "Clique aqui quando quiser rever este tutorial." },
];

export function Tutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i]!;

  useEffect(() => { if (open) setI(0); }, [open]);
  useEffect(() => {
    if (!open) return;
    const update = () => setRect(document.querySelector(`[data-tour="${step.target}"]`)?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, step]);

  if (!open || !rect) return null;
  const onRight = rect.left < window.innerWidth / 2;
  const boxW = 300;
  const left = onRight ? rect.right + 56 : rect.left - boxW - 56;
  const top = Math.min(Math.max(rect.top + rect.height / 2 - 70, 16), window.innerHeight - 200);
  const ax1 = onRight ? rect.right + 6 : rect.left - 6;
  const ax2 = onRight ? left : left + boxW;
  const ay = rect.top + rect.height / 2;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-background/40" onClick={onClose} />
      <div className="pointer-events-none absolute rounded-lg ring-4 ring-primary transition-all" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full text-primary">
        <defs><marker id="arr" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker></defs>
        <line x1={ax2} y1={top + 40} x2={ax1} y2={ay} stroke="currentColor" strokeWidth="2.5" markerEnd="url(#arr)" />
      </svg>
      <div className="absolute rounded-xl border bg-popover p-5 text-popover-foreground shadow-2xl" style={{ left, top, width: boxW }}>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Passo {i + 1} de {STEPS.length}</p>
        <h3 className="mt-1 text-lg font-bold">{step.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
        <div className="mt-4 flex justify-between">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Pular</button>
          <div className="flex gap-2">
            {i > 0 && <button onClick={() => setI(i - 1)} className="rounded-md bg-secondary px-3 py-1.5 text-sm">Voltar</button>}
            <button onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : onClose())} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
              {i < STEPS.length - 1 ? "Próximo" : "Concluir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
