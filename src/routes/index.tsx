import { lazy, Suspense, useRef, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useMyTeam } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Medal, ChevronDown, Loader2, Eye, EyeOff, LogOut } from "lucide-react";

const FaultyTerminal = lazy(() => import("@/components/eo/FaultyTerminal"));

export const Route = createFileRoute("/")(
  {
    head: () => ({
      meta: [
        { title: "Edge Olympics — BIG AI. TINY SILICON." },
        {
          name: "description",
          content:
            "An Edge AI optimization challenge by ECE Society, NIT Warangal. Submit a TFLite model for Raspberry Pi 4 benchmarking on accuracy, latency, and RAM.",
        },
        { property: "og:title", content: "Edge Olympics — BIG AI. TINY SILICON." },
        {
          property: "og:description",
          content:
            "Can you make your AI model run on 2GB of RAM? Edge Olympics — ECE Society, NIT Warangal.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    }),
    component: LandingPage,
  }
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function useScrollReveal(threshold = 0.25) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) { setVisible(true); obs.disconnect(); }
      },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function LandingNav({
  authCardRef,
  user,
  teamName,
  onSignOut,
}: {
  authCardRef: React.RefObject<HTMLElement | null>;
  user: ReturnType<typeof useSession>["user"];
  teamName: string | undefined;
  onSignOut: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const scrollToAuth = () =>
    authCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "py-2" : "py-5"
      }`}
      aria-label="Main navigation"
    >
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between transition-all duration-500 ${
          scrolled
            ? "glass-dark rounded-2xl mx-4 px-5 py-3"
            : "px-6"
        }`}
      >
        <Link
          to="/"
          className="flex items-center gap-2.5 font-bold tracking-tight text-white"
          aria-label="Edge Olympics home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Medal className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold uppercase tracking-widest">Edge Olympics</span>
        </Link>
        <div className="flex items-center gap-5">
          <a href="/edge-olympics-participant-guide.pdf" target="_blank" rel="noopener noreferrer" className="text-sm text-white/75 transition-colors hover:text-white">Rulebook</a>
          <Link
            to="/leaderboard"
            className="text-sm text-white/60 transition-colors hover:text-white"
          >
            Leaderboard
          </Link>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-white/70 sm:block">
                {teamName ?? "Your Team"}
              </span>
              <button
                onClick={onSignOut}
                className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/60 transition-all hover:border-white/40 hover:text-white"
                aria-label="Sign out"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={scrollToAuth}
              className="rounded-full border border-white/20 bg-white/8 px-4 py-1.5 text-sm text-white/80 backdrop-blur-sm transition-all hover:bg-white/15 hover:text-white"
            >
              Login
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection({ reduced }: { reduced: boolean }) {
  return (
    <section
      className="relative flex min-h-screen flex-col items-center justify-center"
      aria-labelledby="hero-title"
    >
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-7 px-6 text-center">
        <motion.p
          style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
          className="text-xs font-semibold uppercase tracking-[0.35em] text-white"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          ECE SOCIETY, NIT WARANGAL
        </motion.p>

        <motion.h1
          id="hero-title"
          style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black uppercase leading-tight tracking-tight text-white"
          initial={reduced ? false : { opacity: 0, y: 35 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          EDGE OLYMPICS
        </motion.h1>

        <motion.p
          style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
          className="text-xl font-semibold tracking-widest text-white sm:text-2xl"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.0 }}
        >
          BIG AI. TINY SILICON
        </motion.p>

        <motion.p
          className="max-w-xl text-base text-white/50 sm:text-lg"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.2 }}
        >
          {" "}
          <span className="text-white/80 font-medium">
          Anyone can train a massive model on a cloud GPU.
            Can you make it run on 2GB of RAM?
          </span>
        </motion.p>

        <motion.div
          className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.5 }}
        >
          {[
            { icon: "📅", text: "30 October 2026" },
            { icon: "⏰", text: "Submit by 6 PM IST" },
            { icon: "📍", text: "Room B316" },
            { icon: "👥", text: "Team submissions" },
          ].map((item) => (
            <span
              key={item.text}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/50 backdrop-blur-sm"
            >
              <span>{item.icon}</span>
              {item.text}
            </span>
          ))}
        </motion.div>
        <a href="/edge-olympics-participant-guide.pdf" target="_blank" rel="noopener noreferrer" className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-85">Read the event rulebook (PDF)</a>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.8 }}
        aria-hidden="true"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.4em] text-white/30">
          Scroll to enter
        </span>
        <motion.div
          animate={reduced ? {} : { y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="h-5 w-5 text-white/25" />
        </motion.div>
      </motion.div>
    </section>
  );
}

// ── Suspense Beats ────────────────────────────────────────────────────────────

function SuspenseBeat({
  eyebrow,
  headline,
  body,
  aside,
  align = "left",
  reduced,
}: {
  eyebrow: string;
  headline: React.ReactNode;
  body: string;
  aside?: string;
  align?: "left" | "right";
  reduced: boolean;
}) {
  const { ref, visible } = useScrollReveal(0.2);
  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 70 }}
      animate={visible ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col gap-5 ${align === "right" ? "items-end text-right" : "items-start"}`}
    >
      <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
        {eyebrow}
      </span>
      <h2
        style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
        className="text-3xl sm:text-4xl md:text-5xl font-extrabold uppercase leading-tight tracking-tight text-white"
      >
        {headline}
      </h2>
      <p className="max-w-lg rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-base leading-relaxed text-white/90 shadow-lg backdrop-blur-md">
        {body}
      </p>
      {aside && (
        <p className="font-mono text-[clamp(2rem,6vw,4rem)] font-black text-white/8 uppercase tracking-tighter">
          {aside}
        </p>
      )}
    </motion.div>
  );
}

function SuspenseSections({ reduced }: { reduced: boolean }) {
  return (
    <section
      className="relative py-32 md:py-48"
      aria-label="Challenge overview"
    >
      {/* Top fade from hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/50 to-transparent" />

      <div className="mx-auto flex max-w-4xl flex-col gap-40 px-6 md:gap-56">
        <SuspenseBeat
          eyebrow="The Challenge"
          headline="CUT THE BLOAT. KEEP THE BRAINS."
          body="Build your own AI model using the provided dataset, then optimize it — through pruning, quantization, and every technique you know — to run efficiently on a Raspberry Pi 4. The cloud is not an option."
          aside="Raspberry Pi 4"
          align="left"
          reduced={reduced}
        />
        <SuspenseBeat
          eyebrow="Real Hardware Testing"
          headline="REAL HARDWARE. REAL LIMITS."
          body="We run your model directly on physical Raspberry Pi rigs. Accuracy, inference latency, and peak RAM determine the score; thermal checks keep the runs comparable."
          aside="Pi 4B Testing"
          align="right"
          reduced={reduced}
        />
        <SuspenseBeat
          eyebrow="The Catch"
          headline="EVERY MILLISECOND COUNTS."
          body="A weighted score rewards accuracy, speed, and memory efficiency. The model runs on constrained hardware under the same benchmark limits as every other entry."
          aside="Weighted Score"
          align="left"
          reduced={reduced}
        />
      </div>
    </section>
  );
}

// ── How It Works ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: "01",
    icon: "🧠",
    title: "Build Your Model",
    desc: "Use the challenge training data and class order. Build an eight-class grayscale classifier with a [1,128,128,1] input.",
  },
  {
    num: "02",
    icon: "⚙️",
    title: "Optimize Ruthlessly",
    desc: "Export one self-contained .tflite file under 50 MiB. Check its input and output tensors with a CPU interpreter.",
  },
  {
    num: "03",
    icon: "🖥️",
    title: "We Run It Live",
    desc: "Sign in, create or join a team, then upload from My team. You have three slots; failed runs free a slot.",
  },
  {
    num: "04",
    icon: "🏅",
    title: "Track Your Score",
    desc: "Watch validation and Pi testing progress. The best completed run counts, using accuracy, latency, and RAM.",
  },
];

function StepCard({
  step,
  index,
  reduced,
}: {
  step: (typeof STEPS)[0];
  index: number;
  reduced: boolean;
}) {
  const { ref, visible } = useScrollReveal(0.15);
  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 40 }}
      animate={visible ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
      className="glass group relative flex flex-col gap-4 overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:border-white/20 -hover:shadow-[0_0_50px_rgba(45,226,166,0.14)]"
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(circle at 50% -20%, rgba(45,226,166,0.1), transparent 65%)",
        }}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between">
        <span className="text-3xl" aria-hidden="true">
          {step.icon}
        </span>
        <span className="font-mono text-5xl font-black text-white/5">{step.num}</span>
      </div>
      <h3 className="text-base font-bold text-white">{step.title}</h3>
      <p className="text-sm leading-relaxed text-white/45">{step.desc}</p>
    </motion.div>
  );
}

function HowItWorks({ reduced }: { reduced: boolean }) {
  const { ref: titleRef, visible: titleVisible } = useScrollReveal(0.3);
  const { ref: statsRef, visible: statsVisible } = useScrollReveal(0.2);

  return (
    <section className="py-32 md:py-40" aria-labelledby="how-it-works-title">
      <div className="mx-auto max-w-6xl px-6">
        {/* Section header */}
        <motion.div
          ref={titleRef}
          initial={reduced ? false : { opacity: 0, y: 30 }}
          animate={titleVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mb-14 text-center"
        >
          <span
            style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
            className="text-xs font-bold uppercase tracking-[0.35em] text-white"
          >
            THE PROCESS
          </span>
          <h2
            id="how-it-works-title"
            style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}
            className="mt-3 text-3xl sm:text-4xl md:text-5xl font-extrabold uppercase tracking-tight text-white"
          >
            HOW IT WORKS
          </h2>
        </motion.div>

        {/* Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <StepCard key={step.num} step={step} index={i} reduced={reduced} />
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-primary/30 bg-black/70 p-6 text-center text-white">
          <p className="max-w-xl text-sm leading-relaxed text-white/75">New here? Follow the four steps above, then read the event rulebook before uploading.</p>
          <a href="/edge-olympics-participant-guide.pdf" target="_blank" rel="noopener noreferrer" className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Open event rulebook (PDF)</a>
        </div>

        {/* Stats */}
        <motion.div
          ref={statsRef}
          initial={reduced ? false : { opacity: 0, y: 30 }}
          animate={statsVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 grid grid-cols-3 gap-4"
        >
          {[
            { value: "4", label: "Pi 4B Workers" },
            { value: "8", label: "Output Classes" },
            { value: "3", label: "Scored Metrics" },
          ].map((s) => (
            <div
              key={s.label}
              className="glass flex flex-col items-center gap-1.5 rounded-2xl py-8 text-center"
            >
              <span className="font-mono text-[clamp(1.8rem,5vw,3rem)] font-black text-primary">
                {s.value}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                {s.label}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ── Auth Card ─────────────────────────────────────────────────────────────────

function AuthCard({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teamName, setTeamName] = useState("");
  const [memberNames, setMemberNames] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const navigate = useNavigate();

  const clearFields = () => {
    setEmail(""); setPassword(""); setTeamName(""); setMemberNames("");
    setSent(false); setResetMode(false);
  };

  const switchMode = (m: "in" | "up") => { setMode(m); clearFields(); };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success("Reset link sent — check your inbox.");
      setResetMode(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const trimmed = teamName.trim();
        if (!trimmed) throw new Error("Team name is required.");
        // Check uniqueness
        const { data: existing, error: checkErr } = await supabase
          .from("teams")
          .select("id")
          .ilike("name", trimmed)
          .maybeSingle();
        if (checkErr) throw checkErr;
        if (existing) {
          throw new Error(`The team name "${trimmed}" is already taken. Choose another.`);
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/leaderboard`,
            data: {
              display_name: email.split("@")[0],
              team_name: trimmed,
              member_names: memberNames,
            },
          },
        });
        if (error) throw error;
        if (!data.session) { setSent(true); return; }
        // Create team if session is active immediately
        try {
          await supabase.rpc("create_team", { _name: trimmed });
        } catch {
          // Continue if team creation is handled elsewhere
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      onSuccess();
      navigate({ to: "/leaderboard" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="glass-dark w-full max-w-md rounded-3xl p-10 text-center">
        <div className="text-5xl mb-5">📬</div>
        <h3 className="text-xl font-bold text-white mb-2">Check your inbox</h3>
        <p className="text-sm text-white/45 leading-relaxed mb-6">
          We sent a confirmation link to <span className="text-white/70">{email}</span>.
          Click it to activate your account, then come back to sign in.
        </p>
        <button
          onClick={() => { setSent(false); switchMode("in"); }}
          className="text-sm text-primary hover:underline"
        >
          Back to sign in →
        </button>
      </div>
    );
  }

  if (resetMode) {
    return (
      <div className="glass-dark w-full max-w-md rounded-3xl p-8">
        <form onSubmit={handleReset} className="flex flex-col gap-5">
          <div>
            <h3 className="text-xl font-bold text-white">Reset Password</h3>
            <p className="mt-1 text-sm text-white/45">
              Enter your email and we'll send a reset link.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-email" className="text-white/60 text-xs uppercase tracking-wider">
              Email
            </Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-primary/40"
            />
          </div>
          <Button type="submit" disabled={busy} size="lg" className="w-full">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : "Send reset link"}
          </Button>
          <button
            type="button"
            onClick={() => setResetMode(false)}
            className="text-center text-sm text-white/35 hover:text-white"
          >
            ← Back to sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="glass-dark w-full max-w-md rounded-3xl p-8" role="region" aria-label="Authentication">
      {/* Mode tabs */}
      <div className="mb-7 flex rounded-2xl bg-white/5 p-1" role="tablist">
        {(["in", "up"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${
              mode === m
                ? "bg-white/10 text-white shadow-sm"
                : "text-white/35 hover:text-white/65"
            }`}
          >
            {m === "in" ? "Sign In" : "Sign Up"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {mode === "up" && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="team-name" className="text-white/60 text-xs uppercase tracking-wider">
                Team Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="team-name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
                placeholder="e.g. NeuralNinjas"
                className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-primary/40"
              />
              <p className="text-[11px] text-white/30">
                Must be unique. One account per team.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="member-names" className="text-white/60 text-xs uppercase tracking-wider">
                Team Members{" "}
                <span className="text-white/25 normal-case font-normal">(optional)</span>
              </Label>
              <Input
                id="member-names"
                value={memberNames}
                onChange={(e) => setMemberNames(e.target.value)}
                placeholder="Alice, Bob, Carol…"
                className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-primary/40"
              />
              <p className="text-[11px] text-white/30">
                Display only — shown on the leaderboard.
              </p>
            </div>
          </>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="auth-email" className="text-white/60 text-xs uppercase tracking-wider">
            Email
          </Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border-white/10 bg-white/5 text-white placeholder:text-white/25 focus-visible:ring-primary/40"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="auth-password" className="text-white/60 text-xs uppercase tracking-wider">
            Password
          </Label>
          <div className="relative">
            <Input
              id="auth-password"
              type={showPwd ? "text" : "password"}
              minLength={6}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border-white/10 bg-white/5 pr-10 text-white placeholder:text-white/25 focus-visible:ring-primary/40"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70"
              aria-label={showPwd ? "Hide password" : "Show password"}
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" size="lg" disabled={busy} className="mt-2 w-full">
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mode === "in" ? "Signing in…" : "Creating account…"}
            </>
          ) : mode === "in" ? (
            "Sign In"
          ) : (
            "Register Team & Enter"
          )}
        </Button>

        {mode === "in" && (
          <button
            type="button"
            onClick={() => setResetMode(true)}
            className="text-center text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Forgot password?
          </button>
        )}
      </form>
    </div>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────

function FinalSection({
  authCardRef,
  reduced,
}: {
  authCardRef: React.RefObject<HTMLElement | null>;
  reduced: boolean;
}) {
  const [showAuth, setShowAuth] = useState(false);
  const { user } = useSession();
  const team = useMyTeam(user?.id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { ref, visible } = useScrollReveal(0.15);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
  };

  return (
    <section className="relative overflow-hidden py-40 md:py-56" aria-labelledby="cta-title">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-60 bg-gradient-to-b from-transparent to-black/60" />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-16 px-6 text-center">
        <motion.div
          ref={ref}
          initial={reduced ? false : { opacity: 0, y: 50 }}
          animate={visible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-5"
        >
          <h2
            id="cta-title"
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold uppercase leading-tight tracking-tight text-white"
          >
            Think your model can
            <br />
            <span className="text-primary">survive the hardware?</span>
          </h2>
          <p className="mx-auto max-w-md text-white/40 text-base">
            The arena is open. Register your team and enter the competition.
          </p>
        </motion.div>

        {/* Auth area */}
        <div
          ref={authCardRef as React.RefObject<HTMLDivElement>}
          className="w-full flex flex-col items-center gap-5"
        >
          {user ? (
            <motion.div
              initial={reduced ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center gap-4"
            >
              <p className="text-white/45 text-sm">
                Signed in as{" "}
                <span className="text-white font-semibold">
                  {team.data?.name ?? user.email}
                </span>
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  size="lg"
                  onClick={() => navigate({ to: "/leaderboard" })}
                  className="px-10"
                >
                  Enter the Arena →
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={signOut}
                  className="text-white/40 hover:text-white"
                >
                  Sign out
                </Button>
              </div>
            </motion.div>
          ) : (
            <>
              <AnimatePresence mode="wait">
                {!showAuth ? (
                  <motion.div
                    key="cta-btn"
                    initial={reduced ? false : { opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Button
                      size="lg"
                      className="px-14 py-4 text-base font-bold"
                      onClick={() => setShowAuth(true)}
                    >
                      Enter the Arena
                    </Button>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {showAuth && (
                  <motion.div
                    key="auth-card"
                    initial={reduced ? false : { opacity: 0, y: 50, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 30, scale: 0.95 }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full max-w-md"
                  >
                    <AuthCard onSuccess={() => {}} />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {/* POC */}
        <motion.p
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-xs text-white/25"
        >
          For queries contact{" "}
          <a
            href="tel:+917660899844"
            className="text-white/40 hover:text-white/70 transition-colors"
          >
            Ashish — 7660899844
          </a>
        </motion.p>
      </div>
    </section>
  );
}

// ── Root Page ─────────────────────────────────────────────────────────────────

function LandingPage() {
  const reduced = useReducedMotion();
  const { user } = useSession();
  const team = useMyTeam(user?.id);
  const authCardRef = useRef<HTMLElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="landing-page">
      {/* Fixed full-page terminal background — z-0, behind everything */}
      <div className="fixed inset-0 z-0 bg-[#020806]" aria-hidden="true">
        {reduced ? (
          <div className="h-full w-full bg-gradient-to-br from-[#020a08] via-[#03110d] to-[#010605]" />
        ) : (
          <Suspense
            fallback={
              <div className="h-full w-full bg-gradient-to-br from-[#020a08] via-[#03110d] to-[#010605]" />
            }
          >
            <FaultyTerminal
              glyphs="characters"
              tint="#2de2a6"
              gridMul={[2, 1]}
              digitSize={1.4}
              timeScale={0.25}
              scanlineIntensity={0.35}
              flickerAmount={0.4}
              curvature={0.28}
              brightness={0.9}
              glow={0.6}
              persistence={0.5}
              scramble={0.5}
              mouseReact
              mouseStrength={0.4}
              mouseGlow={0.6}
              pageLoadAnimation
              clickEffect="glitch"
              variation={0}
              vignette={0.3}
              dpr={1}
              style={{}}
            />
          </Suspense>
        )}
        {/* Dark overlay keeps text readable over the binary layer */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/35 to-black/60" />
      </div>

      {/* Scrollable content — z-10, sits above fixed canvas */}
      <div className="relative z-10 min-h-screen">
        <LandingNav
          authCardRef={authCardRef}
          user={user}
          teamName={team.data?.name}
          onSignOut={signOut}
        />
        <HeroSection reduced={reduced} />
        <SuspenseSections reduced={reduced} />
        <HowItWorks reduced={reduced} />
        <FinalSection authCardRef={authCardRef} reduced={reduced} />

        {/* Footer */}
        <footer className="border-t border-white/5 py-10 text-center">
          <div className="mx-auto max-w-7xl px-6 flex flex-col items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/25">
              Edge Olympics
            </p>
            <p className="text-xs text-white/20">ECE Society, NIT Warangal</p>
            <div className="mt-1 flex gap-6 text-xs text-white/20">
              <a href="/edge-olympics-participant-guide.pdf" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white/45">Rulebook</a>
              <Link to="/leaderboard" className="transition-colors hover:text-white/45">
                Leaderboard
              </Link>
              <Link to="/team" className="transition-colors hover:text-white/45">
                My Team
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
