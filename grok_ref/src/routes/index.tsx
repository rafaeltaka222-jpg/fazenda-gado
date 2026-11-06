import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent, type PointerEvent } from "react";
import { Eye, EyeOff, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({ component: Gate });

const CALF_LINES = [
  "Mu! Eu sou o Nuvem. Clique de novo.",
  "Nasci em agosto, no pasto da baixada.",
  "O lote 12 está na pastagem 7 hoje.",
  "Peso médio do rebanho: 428 kg.",
  "Tem três brilhos no capim. Acha todos.",
];

const COW_LINES = [
  "Estrela: bom dia. A porteira está aberta.",
  "Estrela: o bezerro adora um clique.",
  "Estrela: senha de demonstração? Qualquer uma serve.",
];

const FINDS = [
  { id: "cerca", label: "Cerca nova", detail: "O mourão da entrada foi trocado ontem." },
  { id: "agua", label: "Bebedouro", detail: "Água limpa no cocho da mangueira." },
  { id: "sombra", label: "Sombra", detail: "O rebanho descansa debaixo do ipê." },
];

function Gate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [entered, setEntered] = useState<string | null>(null);
  const [calf, setCalf] = useState(0);
  const [calfOpen, setCalfOpen] = useState(false);
  const [cow, setCow] = useState(0);
  const [cowOpen, setCowOpen] = useState(false);
  const [found, setFound] = useState<string[]>([]);
  const [shift, setShift] = useState({ x: 0, y: 0 });

  const name = useMemo(() => {
    const raw = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
    if (!raw) return "visitante";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [email]);

  function onMove(e: PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setShift({ x, y });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Preencha e-mail e senha para abrir a porteira.");
      return;
    }
    if (!email.includes("@")) {
      setError("Use um e-mail com @ — pode ser de demonstração.");
      return;
    }
    setError("");
    setEntered(name);
  }

  return (
    <main
      className="relative min-h-dvh overflow-hidden bg-leaf-deep text-cream"
      onPointerMove={onMove}
    >
      <div
        className="motion-ken pointer-events-none absolute inset-0"
        style={{
          animation: "ken 28s ease-in-out infinite alternate",
          transform: `translate3d(${shift.x * -18}px, ${shift.y * -12}px, 0)`,
        }}
      >
        <img
          src="/farm/pasture.jpg"
          alt="Pastagem com gado Nelore ao entardecer"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-leaf-deep/75 via-leaf-deep/25 to-leaf-deep/55" />

      <Bird delay="0s" duration="22s" top="top-[18%]" />
      <Bird delay="-9s" duration="30s" top="top-[30%] scale-75" />

      <button
        type="button"
        aria-label="Falar com a vaca Estrela"
        onClick={() => {
          setCowOpen(true);
          setCow((n) => (cowOpen ? (n + 1) % COW_LINES.length : 0));
        }}
        className="motion-bob absolute bottom-[18%] left-[8%] z-20 hidden w-36 origin-bottom md:block lg:w-44"
        style={{ animation: "bob 3.4s ease-in-out infinite" }}
      >
        <img
          src="/farm/cow.png"
          alt=""
          className="w-full drop-shadow-xl"
        />
      </button>
      {cowOpen && (
        <p
          className="absolute bottom-[46%] left-[6%] z-20 hidden max-w-56 rounded-2xl bg-cream px-4 py-3 text-sm text-ink shadow-lg md:block"
          style={{ animation: "pop 220ms ease-out" }}
        >
          {COW_LINES[cow]}
        </p>
      )}

      {FINDS.map((item, i) => {
        const open = found.includes(item.id);
        const pos = ["left-[22%] top-[58%]", "left-[38%] top-[46%]", "left-[48%] top-[68%]"][i];
        return (
          <button
            key={item.id}
            type="button"
            aria-label={open ? item.detail : `Descobrir ${item.label}`}
            onClick={() =>
              setFound((list) => (list.includes(item.id) ? list : [...list, item.id]))
            }
            className={`absolute z-20 ${pos} hidden min-h-11 items-center gap-2 rounded-full border border-cream/70 bg-leaf-deep/55 px-3 py-2 text-left text-xs text-cream backdrop-blur-sm md:flex`}
          >
            <Sparkles className="size-4 text-gold" />
            {open ? item.detail : item.label}
          </button>
        );
      })}

      <section className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-end gap-6 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-10">
        <div className="max-w-md">
          <p className="mb-3 inline-flex items-center gap-3 rounded-full bg-cream/95 py-1 pr-4 pl-1 text-xs font-medium tracking-wide text-leaf-deep uppercase">
            <img src="/farm/logo-jr.svg" alt="JR Com. e Exp. de Café" className="h-14 w-14 rounded-full bg-cream object-contain" />
            JR · Com. e Exp. de Café
          </p>
          <h1 className="font-display text-4xl leading-tight text-cream md:text-6xl">
            A porteira abre com um clique.
          </h1>
          <p className="mt-3 max-w-sm text-base text-cream/90">
            Toque no bezerro. Ele guarda um recado novo a cada toque — e a vaca no pasto responde.
          </p>
          <p className="mt-4 text-sm text-cream/80">
            Descobertas no capim: {found.length} de {FINDS.length}
          </p>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-line bg-cream-2/92 p-6 text-ink shadow-2xl backdrop-blur-md md:p-8">
          {entered ? (
            <Welcome name={entered} onBack={() => setEntered(null)} />
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <img src="/farm/logo-jr.svg" alt="" className="mb-3 h-20 w-auto" />
                <h2 className="font-display text-3xl text-leaf-deep">Entrar</h2>
                <p className="mt-1 text-sm text-muted">
                  Demonstração local. Qualquer e-mail e senha abrem o curral.
                </p>
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                E-mail
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  inputMode="email"
                  placeholder="joao@fazenda.com"
                  className="min-h-11 rounded-xl border border-line bg-cream px-3 text-base font-normal outline-none focus:border-leaf"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Senha
                <span className="relative">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="min-h-11 w-full rounded-xl border border-line bg-cream px-3 pr-12 text-base font-normal outline-none focus:border-leaf"
                  />
                  <button
                    type="button"
                    aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShow((v) => !v)}
                    className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center text-muted"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
              </label>
              {error && (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="min-h-12 rounded-xl bg-leaf px-4 text-base font-semibold text-cream transition hover:bg-leaf-deep"
              >
                Abrir a porteira
              </button>
            </form>
          )}
        </div>
      </section>

      <div className="absolute bottom-4 left-4 z-20 md:bottom-8 md:left-8">
        <button
          type="button"
          onClick={() => {
            setCalfOpen(true);
            setCalf((n) => (calfOpen ? (n + 1) % CALF_LINES.length : 0));
          }}
          className="motion-bob flex items-end gap-3"
          style={{ animation: "bob 2.6s ease-in-out infinite" }}
          aria-label="Bezerro Nuvem, clique para ouvir"
          aria-expanded={calfOpen}
        >
          <img
            src="/farm/calf.png"
            alt="Bezerro Nuvem, clique para ouvir"
            className="size-28 object-contain md:size-36"
          />
        </button>
        {calfOpen && (
          <p
            className="mt-2 max-w-64 rounded-2xl bg-cream px-4 py-3 text-sm text-ink shadow-lg"
            style={{ animation: "pop 220ms ease-out" }}
          >
            {CALF_LINES[calf]}
          </p>
        )}
      </div>
    </main>
  );
}

function Welcome({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4" style={{ animation: "pop 240ms ease-out" }}>
      <p className="text-sm font-medium tracking-wide text-leaf uppercase">Curral aberto</p>
      <h2 className="font-display text-3xl text-leaf-deep">Bem-vindo, {name}.</h2>
      <p className="text-sm text-muted">
        O rebanho de hoje: 12.487 cabeças. Vacina de brucelose vence em dois dias no lote das fêmeas.
      </p>
      <ul className="grid grid-cols-2 gap-2 text-sm">
        <li className="rounded-xl bg-cream px-3 py-3">
          <span className="block text-muted">Machos</span>
          <strong className="font-display text-2xl">6.120</strong>
        </li>
        <li className="rounded-xl bg-cream px-3 py-3">
          <span className="block text-muted">Fêmeas</span>
          <strong className="font-display text-2xl">6.367</strong>
        </li>
      </ul>
      <button
        type="button"
        onClick={onBack}
        className="min-h-12 rounded-xl border border-line bg-cream text-sm font-semibold text-leaf-deep"
      >
        Voltar à porteira
      </button>
    </div>
  );
}

function Bird({ top, duration, delay }: { top: string; duration: string; delay: string }) {
  return (
    <span
      aria-hidden
      className={`motion-drift pointer-events-none absolute text-cream/90 ${top}`}
      style={{ animation: `drift ${duration} linear ${delay} infinite` }}
    >
      <svg width="28" height="14" viewBox="0 0 28 14" fill="currentColor">
        <path d="M1 9c4-6 7-6 10-2 2 3 4 3 6 0 3-4 6-4 10-1-4 1-6 3-8 3-2 0-3-2-5-2s-4 3-6 3c-3 0-5-2-7-1z" />
      </svg>
    </span>
  );
}
