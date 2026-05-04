"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { addChapterAction, saveProfileAction, saveSettingsAction, signOutAction } from "@/lib/actions";
import { defaultChapters } from "@/lib/default-data";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { AppUser, BootData, JourneyChapter, Screen, UserSettings } from "@/lib/types";
import { S, T } from "@/design_handoff_taalreis/taalreis-tokens";

const APP_STATE_KEY = "taalreis_state";
const DEMO_CHAPTERS_KEY = "taalreis_chapters";
const VIEW_KEY = "taalreis_view";

const PAD = {
  cardW: 260,
  rowH: 160,
  nodeY0: 60,
  xLeft: 220,
  xRight: 520,
  dotSize: 12
};

const wordRows = [
  ["comer", "eten"],
  ["la mesa", "de tafel"],
  ["beber", "drinken"],
  ["el menú", "het menu"],
  ["pedir", "bestellen"],
  ["el camarero", "de ober"],
  ["la cuenta", "de rekening"],
  ["rico", "lekker"]
];

const VOCAB_SYNC_KEY = "taalreis_vocab_latest";
const LIBRARY_VOCAB_BY_CHAPTER_KEY = "taalreis_library_vocab_by_chapter";
const READING_SESSIONS_KEY = "taalreis_reading_sessions";

function normalizePair(spanish: string, dutch: string) {
  return `${spanish.trim().toLowerCase()}::${dutch.trim().toLowerCase()}`;
}

function sanitizeRows(rows: string[][]) {
  const seen = new Set<string>();
  const unique: string[][] = [];

  rows.forEach((row) => {
    const spanish = (row[0] ?? "").trim();
    const dutch = (row[1] ?? "").trim();

    if (!spanish || !dutch) {
      return;
    }

    const key = normalizePair(spanish, dutch);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push([spanish, dutch]);
  });

  return unique;
}

const reviewSessions = [
  { datum: "2 mei 2026, 14:30", type: "Leesvaardigheid", score: "3/3", kleur: T.accent },
  { datum: "1 mei 2026, 09:15", type: "Schrijfvaardigheid", score: "Voltooid", kleur: "#6B8FBF" },
  { datum: "30 apr 2026, 20:00", type: "Woordenschattoets", score: "8/10", kleur: T.success },
  { datum: "28 apr 2026, 18:45", type: "Leesvaardigheid", score: "2/3", kleur: T.accent }
];

const calendarActivity: Record<number, number> = {
  1: 1,
  2: 3,
  3: 2,
  5: 1,
  6: 3,
  7: 2,
  8: 1,
  10: 3,
  14: 1,
  15: 2,
  20: 1,
  21: 3,
  22: 2,
  23: 1
};

const calendarSessions: Record<number, string[]> = {
  2: ["📖 Leesvaardigheid · 3/3", "✅ Woordenschattoets · 8/10", "✏️ Schrijfvaardigheid"],
  6: ["✅ Woordenschattoets · 9/10", "📖 Leesvaardigheid · 3/3", "✏️ Schrijfvaardigheid"],
  10: ["📖 Leesvaardigheid · 2/3"],
  14: ["✅ Woordenschattoets · 7/10"],
  21: ["📖 Leesvaardigheid · 3/3", "✅ Woordenschattoets · 10/10", "✏️ Schrijfvaardigheid"]
};

const practiceCards = [
  { id: "woordenschat", title: "Woordenschat", copy: "Oefen en herhaal je woordparen.", icon: "🧠" },
  { id: "leesvaardigheid", title: "Leesvaardigheid", copy: "Lees korte teksten en beantwoord vragen.", icon: "📖" },
  { id: "schrijfvaardigheid", title: "Schrijfvaardigheid", copy: "Schrijfopdrachten met directe feedback.", icon: "✍️" }
];

function cubicBez(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function midpointOnPath(index: number) {
  const y0 = index * PAD.rowH + PAD.nodeY0;
  const y1 = (index + 1) * PAD.rowH + PAD.nodeY0;
  const x0 = index % 2 === 0 ? PAD.xLeft : PAD.xRight;
  const x1 = (index + 1) % 2 === 0 ? PAD.xLeft : PAD.xRight;
  const midY = (y0 + y1) / 2;
  return [cubicBez(x0, x0, x1, x1, 0.5), cubicBez(y0, midY, midY, y1, 0.5)] as const;
}

function buildPath(count: number, shadow: boolean) {
  const points: Array<[number, number]> = [];

  for (let index = 0; index < count; index += 1) {
    const y = index * PAD.rowH + PAD.nodeY0;
    const x = index % 2 === 0 ? PAD.xLeft : PAD.xRight;
    points.push([x + (shadow ? 2 : 0), y + (shadow ? 2 : 0)]);
  }

  if (points.length < 2) {
    return "";
  }

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const curr = points[index];
    const midY = (prev[1] + curr[1]) / 2;
    d += ` C ${prev[0]} ${midY}, ${curr[0]} ${midY}, ${curr[0]} ${curr[1]}`;
  }

  return d;
}

function getStoredState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return JSON.parse(window.localStorage.getItem(APP_STATE_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function TaalreisApp({
  initialUser,
  initialChapters,
  initialSettings,
  supabaseEnabled
}: BootData) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [screen, setScreen] = useState<Screen>("Login");
  const [user, setUser] = useState<AppUser | null>(initialUser);
  const [chapters, setChapters] = useState<JourneyChapter[]>(initialChapters);
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [librarySelectedChapterId, setLibrarySelectedChapterId] = useState<string | null>(null);
  const [libraryInitialTab, setLibraryInitialTab] = useState<"vocabulair" | "oefenen" | "geschiedenis">(
    "vocabulair"
  );
  const [variant, setVariant] = useState<"pad" | "tijdlijn">("pad");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const saved = getStoredState();
    const savedScreen = saved?.screen as Screen | undefined;
    const savedView = window.localStorage.getItem(VIEW_KEY);

    if (savedView === "pad" || savedView === "tijdlijn") {
      setVariant(savedView);
    }

    if (initialUser) {
      setScreen(savedScreen && savedScreen !== "Login" ? savedScreen : "Reiskaart");
      return;
    }

    const demoUser = saved?.user as AppUser | undefined;

    if (demoUser) {
      setUser(demoUser);
      setScreen(savedScreen && savedScreen !== "Login" ? savedScreen : "Reiskaart");
      try {
        const localChapters = JSON.parse(
          window.localStorage.getItem(DEMO_CHAPTERS_KEY) ?? "null"
        ) as JourneyChapter[] | null;
        if (localChapters?.length) {
          setChapters(localChapters);
        }
      } catch {}
      return;
    }

    setScreen("Login");
  }, [initialUser]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload = {
      screen,
      user: initialUser ? null : user
    };
    window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(payload));
    window.localStorage.setItem(VIEW_KEY, variant);
  }, [screen, user, variant, initialUser]);

  useEffect(() => {
    if (typeof window === "undefined" || initialUser) {
      return;
    }

    window.localStorage.setItem(DEMO_CHAPTERS_KEY, JSON.stringify(chapters));
  }, [chapters, initialUser]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event) => {
      router.refresh();
    });

    return () => subscription.unsubscribe();
  }, [router, supabase]);

  const isDemoMode = !supabase;

  async function handleDemoLogin(nextUser: AppUser) {
    setUser(nextUser);
    setScreen("Reiskaart");
    setFeedback(null);
  }

  async function handleAuth(values: {
    mode: "login" | "register";
    email: string;
    password: string;
    name: string;
  }) {
    if (!supabase) {
      await handleDemoLogin({
        name: values.name || "Sofía",
        email: values.email
      });
      return;
    }

    if (values.mode === "login") {
      const { error, data } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password
      });

      if (error) {
        setFeedback(error.message);
        return;
      }

      setUser({
        name:
          data.user.user_metadata.full_name ??
          data.user.email?.split("@")[0] ??
          "Reiziger",
        email: data.user.email ?? values.email
      });
      setScreen("Reiskaart");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          full_name: values.name
        }
      }
    });

    if (error) {
      setFeedback(error.message);
      return;
    }

    setFeedback("Account aangemaakt. Controleer je inbox om je e-mailadres te bevestigen.");
  }

  async function handleGoogleLogin() {
    if (!supabase) {
      await handleDemoLogin({
        name: "Sofía",
        email: "sofia@gmail.com"
      });
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo
      }
    });

    if (error) {
      setFeedback(error.message);
    }
  }

  function navigate(nextScreen: Screen) {
    if (nextScreen === "Login") {
      void handleLogout();
      return;
    }
    setScreen(nextScreen);
  }

  async function handleLogout() {
    if (supabase) {
      const result = await signOutAction();
      if (result.error) {
        setFeedback(result.error);
        return;
      }
    }

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(APP_STATE_KEY);
      window.localStorage.removeItem(DEMO_CHAPTERS_KEY);
    }

    setUser(null);
    setLibrarySelectedChapterId(null);
    setLibraryInitialTab("vocabulair");
    setScreen("Login");
    setChapters(defaultChapters);
    router.refresh();
  }

  async function handleAddChapter(title: string, insertAfterIndex: number) {
    if (!supabase || !initialUser) {
      setChapters((current) => {
        const next = [...current];
        next.splice(insertAfterIndex + 1, 0, {
          id: `local-${Date.now()}`,
          n: "",
          title,
          prog: 0,
          total: 0,
          sortOrder: insertAfterIndex + 1
        });
        return next.map((chapter, index) => ({
          ...chapter,
          n: String(index + 1).padStart(2, "0"),
          sortOrder: index + 1
        }));
      });
      return;
    }

    const result = await addChapterAction({
      title,
      insertAfterIndex,
      chapters
    });

    if (result.error) {
      setFeedback(result.error);
      return;
    }

    if (result.data) {
      setChapters(result.data);
    }
  }

  async function handleSaveSettings(nextSettings: UserSettings) {
    setSettings(nextSettings);

    if (!supabase || !initialUser) {
      return;
    }

    const result = await saveSettingsAction(nextSettings);
    if (result.error) {
      setFeedback(result.error);
    }
  }

  async function handleSaveProfile(nextProfile: { name: string; avatarUrl: string }) {
    if (!user) {
      return;
    }

    const nextUser: AppUser = {
      ...user,
      name: nextProfile.name.trim() || "Reiziger",
      avatarUrl: nextProfile.avatarUrl.trim() || null
    };
    setUser(nextUser);

    if (!supabase || !initialUser) {
      return;
    }

    const result = await saveProfileAction(nextProfile);
    if (result.error) {
      setFeedback(result.error);
      return;
    }

    if (result.data) {
      setUser(result.data);
    }
  }

  if (screen === "Login" || !user) {
    return (
      <div className="page-enter">
        <LoginScreen
          onSubmit={handleAuth}
          onGoogle={handleGoogleLogin}
          feedback={feedback}
          demoMode={!supabase}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopNav active={screen} onNav={navigate} user={user} />

      {feedback ? (
        <div
          style={{
            position: "fixed",
            top: 24,
            left: 240,
            zIndex: 300,
            ...S.card({
              padding: "10px 14px",
              boxShadow: T.shadow.md
            })
          }}
        >
          <span style={{ fontSize: T.fs.sm, color: T.textSec }}>{feedback}</span>
        </div>
      ) : null}

      <div style={{ marginLeft: 220 }}>
      {screen === "Reiskaart" ? (
        <div className="page-enter">
          <JourneyMap
            chapters={chapters}
            onOpenChapter={(chapter) => {
              setLibrarySelectedChapterId(chapter.id);
              setLibraryInitialTab("vocabulair");
              setScreen("Bibliotheek");
            }}
            onAddChapter={handleAddChapter}
            variant={variant}
            onVariantChange={setVariant}
          />
        </div>
      ) : null}

      {screen === "Bibliotheek" ? (
        <div className="page-enter">
          <LibraryScreen
            chapters={chapters}
            selectedChapterId={librarySelectedChapterId}
            initialTab={libraryInitialTab}
            defaultLevel={settings.level}
          />
        </div>
      ) : null}

      {screen === "Kalender" ? (
        <div className="page-enter">
          <CalendarScreen />
        </div>
      ) : null}

      {screen === "Instellingen" ? (
        <div className="page-enter">
          <SettingsScreen
            user={user}
            settings={settings}
            onSave={handleSaveSettings}
            onSaveProfile={handleSaveProfile}
            onLogout={handleLogout}
          />
        </div>
      ) : null}

      </div>

      {isDemoMode ? (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 200,
            ...S.card({
              padding: "10px 14px",
              background: T.accentLight
            })
          }}
        >
          <div style={{ fontSize: T.fs.xs, color: T.accent, fontWeight: T.fw.semi }}>
            Demo-modus actief
          </div>
          <div style={{ fontSize: T.fs.xs, color: T.textSec, marginTop: 2 }}>
            Voeg Supabase-keys toe voor echte auth en opslag.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoginScreen({
  onSubmit,
  onGoogle,
  feedback,
  demoMode
}: {
  onSubmit: (values: {
    mode: "login" | "register";
    email: string;
    password: string;
    name: string;
  }) => Promise<void>;
  onGoogle: () => Promise<void>;
  feedback: string | null;
  demoMode: boolean;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (mode === "register" && !name.trim()) {
      nextErrors.name = "Vul je naam in.";
    }

    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      nextErrors.email = "Gebruik een geldig e-mailadres.";
    }

    if (!password.trim()) {
      nextErrors.password = "Vul je wachtwoord in.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setLoading(true);
    await onSubmit({ mode, email: email.trim(), password, name: name.trim() });
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24
      }}
    >
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🗺️</div>
          <div
            style={{
              fontSize: T.fs.xl,
              fontWeight: T.fw.semi,
              color: T.text,
              letterSpacing: -0.3
            }}
          >
            Taalreis
          </div>
          <div style={{ fontSize: T.fs.sm, color: T.textSec, marginTop: 6 }}>
            Spaans → Nederlands leerplatform
          </div>
        </div>

        <div style={S.card({ padding: "32px 36px", boxShadow: T.shadow.md })}>
          <div
            style={{
              display: "flex",
              background: T.neutralLight,
              borderRadius: T.radius.sm,
              padding: 3,
              marginBottom: 24
            }}
          >
            {[
              ["login", "Inloggen"],
              ["register", "Registreren"]
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMode(key as "login" | "register")}
                style={{
                  flex: 1,
                  height: 34,
                  borderRadius: T.radius.sm - 1,
                  fontSize: T.fs.sm,
                  fontWeight: T.fw.med,
                  background: mode === key ? T.surface : "transparent",
                  color: mode === key ? T.text : T.textSec,
                  boxShadow: mode === key ? T.shadow.sm : "none",
                  cursor: "pointer",
                  transition: T.trans
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "register" ? (
              <Field label="Naam" error={errors.name}>
                <input
                  style={S.input()}
                  placeholder="Jouw naam"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            ) : null}

            <Field label="E-mailadres" error={errors.email}>
              <input
                type="email"
                style={S.input()}
                placeholder="jouw@email.nl"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>

            <Field
              label="Wachtwoord"
              error={errors.password}
              aside={mode === "login" ? "Vergeten?" : undefined}
            >
              <input
                type="password"
                style={S.input()}
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              style={S.btn("primary", {
                width: "100%",
                height: 42,
                marginTop: 6,
                opacity: loading ? 0.7 : 1
              })}
            >
              {loading
                ? "Even wachten…"
                : mode === "login"
                  ? "Inloggen"
                  : "Account aanmaken"}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <span style={{ fontSize: T.fs.xs, color: T.textSec }}>of</span>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>

          <button
            onClick={() => void onGoogle()}
            style={S.btn("default", {
              width: "100%",
              height: 40,
              gap: 10
            })}
          >
            <GoogleIcon />
            Doorgaan met Google
          </button>

          <div style={{ marginTop: 16, fontSize: T.fs.xs, color: T.textSec }}>
            {demoMode
              ? "Supabase ontbreekt nog, dus deze omgeving gebruikt een lokale demo-login."
              : "Je account en voortgang worden gesynchroniseerd via Supabase."}
          </div>

          {feedback ? (
            <div style={{ marginTop: 12, fontSize: T.fs.xs, color: T.accent }}>{feedback}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TopNav({
  active,
  onNav,
  user
}: {
  active: Screen;
  onNav: (screen: Screen) => void;
  user: AppUser;
}) {
  const tabs: Screen[] = ["Reiskaart", "Bibliotheek", "Kalender"];

  return (
    <nav
      style={{
        position: "fixed",
        inset: "0 auto 0 0",
        zIndex: 100,
        width: 220,
        background: T.surface,
        borderRight: `1px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        boxShadow: T.shadow.sm
      }}
      className="nav-shell"
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: T.fw.semi,
          color: T.text,
          margin: "16px",
          letterSpacing: -0.2,
          cursor: "pointer"
        }}
        onClick={() => onNav("Reiskaart")}
      >
        Taalreis
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, padding: "0 12px" }} className="nav-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onNav(tab)}
            style={{
              fontSize: T.fs.sm,
              fontWeight: T.fw.med,
              color: active === tab ? T.accent : T.textSec,
              cursor: "pointer",
              padding: "10px 14px",
              textAlign: "left",
              borderRadius: 8,
              background: active === tab ? T.accentLight : "transparent",
              transition: T.trans
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ padding: 12 }}>
        <button
          onClick={() => onNav("Instellingen")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius.pill,
            padding: "4px 12px",
            background: T.surface,
            cursor: "pointer"
          }}
          title="Open account instellingen"
        >
          <span style={{ fontSize: T.fs.sm, fontWeight: T.fw.semi }}>{user.name}</span>
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={`Profielfoto van ${user.name}`}
              style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: T.accentMid,
                display: "grid",
                placeItems: "center",
                color: T.accent,
                fontWeight: T.fw.semi,
                fontSize: 13
              }}
            >
              {user.name[0]}
            </div>
          )}
        </button>
      </div>
    </nav>
  );
}

function JourneyMap({
  chapters,
  onOpenChapter,
  onAddChapter,
  variant,
  onVariantChange
}: {
  chapters: JourneyChapter[];
  onOpenChapter: (chapter: JourneyChapter) => void;
  onAddChapter: (title: string, insertAfterIndex: number) => Promise<void>;
  variant: "pad" | "tijdlijn";
  onVariantChange: (variant: "pad" | "tijdlijn") => void;
}) {
  const [modalState, setModalState] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingTop: 24 }}>
      <div className="max-shell">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32
          }}
          className="mobile-stack"
        >
          <div>
            <h1 style={{ fontSize: T.fs.xl, fontWeight: T.fw.semi, margin: 0 }}>Reiskaart</h1>
            <p style={{ fontSize: T.fs.sm, color: T.textSec, marginTop: 4 }}>
              Jouw leerreis Spaans → Nederlands
            </p>
          </div>

          <div
            style={{
              display: "flex",
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.radius.sm,
              overflow: "hidden"
            }}
          >
            {[
              ["pad", "Pad"],
              ["tijdlijn", "Tijdlijn"]
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => onVariantChange(key as "pad" | "tijdlijn")}
                style={{
                  padding: "7px 16px",
                  background: variant === key ? T.accent : "transparent",
                  color: variant === key ? "#fff" : T.textSec,
                  fontSize: T.fs.sm,
                  fontWeight: T.fw.med,
                  cursor: "pointer",
                  transition: T.trans
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {variant === "pad" && !isMobile ? (
          <PadView chapters={chapters} onOpenChapter={onOpenChapter} onAddAt={setModalState} />
        ) : (
          <TimelineView chapters={chapters} onOpenChapter={onOpenChapter} onAddAt={setModalState} />
        )}
      </div>

      {modalState !== null ? (
        <AddChapterModal
          insertAfterIndex={modalState}
          totalChapters={chapters.length}
          onClose={() => setModalState(null)}
          onConfirm={async (title) => {
            await onAddChapter(title, modalState);
            setModalState(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PadView({
  chapters,
  onOpenChapter,
  onAddAt
}: {
  chapters: JourneyChapter[];
  onOpenChapter: (chapter: JourneyChapter) => void;
  onAddAt: (index: number) => void;
}) {
  const totalItems = chapters.length + 1;
  const svgHeight = totalItems * PAD.rowH + 60;

  return (
    <div style={{ position: "relative", height: svgHeight + 40 }}>
      <svg
        width="100%"
        height={svgHeight}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
      >
        <defs>
          <filter id="pathBlur">
            <feGaussianBlur stdDeviation="1" />
          </filter>
        </defs>
        <path
          d={buildPath(totalItems, true)}
          fill="none"
          stroke={T.neutral}
          strokeWidth="3"
          opacity="0.4"
          filter="url(#pathBlur)"
        />
        <path
          d={buildPath(totalItems, false)}
          fill="none"
          stroke={T.neutral}
          strokeWidth="2.5"
          strokeDasharray="10 6"
        />
        <path
          d={buildPath(chapters.filter((chapter) => chapter.prog > 0).length + 1, false)}
          fill="none"
          stroke={T.accent}
          strokeWidth="2.5"
          strokeDasharray="10 6"
          opacity="0.5"
        />
      </svg>

      {chapters.map((chapter, index) => {
        const isLeft = index % 2 === 0;
        const nodeX = isLeft ? PAD.xLeft : PAD.xRight;
        const nodeY = index * PAD.rowH + PAD.nodeY0;
        const cardLeft = nodeX - PAD.cardW / 2;
        const cardTop = nodeY - 50;

        return (
          <div key={chapter.id}>
            <button
              className="card-hover"
              onClick={() => onOpenChapter(chapter)}
              style={{
                position: "absolute",
                top: cardTop,
                left: cardLeft,
                width: PAD.cardW,
                textAlign: "left",
                ...S.card({
                  padding: "16px 20px",
                  cursor: "pointer",
                  border: chapter.active ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                  boxShadow: chapter.active ? `0 0 0 3px ${T.accentLight}` : T.shadow.sm
                })
              }}
            >
              <CardHeader chapter={chapter} />
              <div
                style={{
                  fontSize: T.fs.base,
                  fontWeight: T.fw.med,
                  color: T.text,
                  marginBottom: 10
                }}
              >
                {chapter.title}
              </div>
              <ProgressBar pct={chapter.prog} />
              <FooterWords chapter={chapter} />
            </button>


            {index < chapters.length - 1 ? (
              <PathInsertButton index={index} onClick={() => onAddAt(index)} />
            ) : null}
          </div>
        );
      })}

      {(() => {
        const index = chapters.length;
        const nodeX = index % 2 === 0 ? PAD.xLeft : PAD.xRight;
        const nodeY = index * PAD.rowH + PAD.nodeY0;
        const cardWidth = 240;

        return (
          <button
            onClick={() => onAddAt(chapters.length - 1)}
            style={{
              position: "absolute",
              top: nodeY - 44,
              left: nodeX - cardWidth / 2,
              width: cardWidth,
              textAlign: "center",
              ...S.card({
                padding: "18px 20px",
                cursor: "pointer",
                borderStyle: "dashed",
                background: T.bg
              })
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = T.accentLight;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = T.bg;
            }}
          >
            <div style={{ fontSize: T.fs.lg, color: T.accent, marginBottom: 4 }}>+</div>
            <div style={{ fontSize: T.fs.sm, fontWeight: T.fw.med, color: T.accent }}>
              Hoofdstuk toevoegen
            </div>
          </button>
        );
      })()}
    </div>
  );
}

function TimelineView({
  chapters,
  onOpenChapter,
  onAddAt
}: {
  chapters: JourneyChapter[];
  onOpenChapter: (chapter: JourneyChapter) => void;
  onAddAt: (index: number) => void;
}) {
  return (
    <div>
      <div className="screen-grid three-cols" style={{ marginBottom: 32 }}>
        {[
          { val: chapters.length, label: "Hoofdstukken" },
          { val: "5", label: "Dagen op rij" },
          { val: "72%", label: "Progress" }
        ].map((stat) => (
          <div key={stat.label} style={S.card({ padding: "16px 20px", textAlign: "center" })}>
            <div
              style={{
                fontSize: 22,
                fontWeight: T.fw.semi,
                color: T.accent,
                marginBottom: 4
              }}
            >
              {stat.val}
            </div>
            <div style={{ fontSize: T.fs.xs, color: T.textSec }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div style={{ position: "relative", paddingLeft: 36 }}>
        <div
          style={{
            position: "absolute",
            left: 13,
            top: 8,
            bottom: 8,
            width: 2,
            background: T.neutral,
            borderRadius: 2
          }}
        />

        {chapters.map((chapter, index) => (
          <div key={chapter.id}>
            {index > 0 ? (
              <div style={{ position: "relative", height: 20, display: "flex", alignItems: "center" }}>
                <button
                  className="timeline-insert"
                  onClick={() => onAddAt(index - 1)}
                  style={{
                    position: "absolute",
                    left: -38,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: `1.5px solid ${T.accent}`,
                    background: T.surface,
                    color: T.accent,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1,
                    padding: 0,
                    transition: T.trans
                  }}
                >
                  +
                </button>
              </div>
            ) : null}

            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: -30,
                  top: 18,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: chapter.done ? T.accent : T.surface,
                  border: `2px solid ${chapter.done ? T.accent : chapter.active ? T.accent : T.neutral}`,
                  boxShadow: chapter.active ? `0 0 0 3px ${T.accentLight}` : "none"
                }}
              />
              <button
                className="card-hover"
                onClick={() => onOpenChapter(chapter)}
                style={{
                  width: "100%",
                  display: "block",
                  textAlign: "left",
                  ...S.card({
                    padding: "16px 20px",
                    cursor: "pointer",
                    border: chapter.active ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                    boxShadow: chapter.active ? `0 0 0 3px ${T.accentLight}` : T.shadow.sm
                  })
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: T.fs.xs, color: T.textSec }}>{chapter.n}</span>
                  <span style={{ fontSize: T.fs.base, fontWeight: T.fw.med, flex: 1 }}>
                    {chapter.title}
                  </span>
                  <StatusBadge chapter={chapter} />
                  <span style={{ fontSize: T.fs.xs, color: T.textSec }}>{chapter.total} woorden</span>
                </div>
                <ProgressBar pct={chapter.prog} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                  <span style={{ fontSize: T.fs.xs, color: T.textSec }}>Progress</span>
                  <span style={{ fontSize: T.fs.xs, color: T.textSec }}>{chapter.prog}%</span>
                </div>
              </button>
            </div>
          </div>
        ))}

        <div style={{ position: "relative", marginTop: 8 }}>
          <div
            style={{
              position: "absolute",
              left: -30,
              top: 14,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: T.surface,
              border: `2px dashed ${T.accent}`
            }}
          />
          <button
            onClick={() => onAddAt(chapters.length - 1)}
            style={{
              width: "100%",
              textAlign: "center",
              ...S.card({
                padding: "16px",
                cursor: "pointer",
                borderStyle: "dashed",
                background: T.bg
              })
            }}
          >
            <span style={{ fontSize: T.fs.sm, fontWeight: T.fw.med, color: T.accent }}>
              + Hoofdstuk toevoegen
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ChapterScreen({
  chapter,
  onClose
}: {
  chapter: JourneyChapter;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"woordenschat" | "oefenen">("woordenschat");
  const [uploadState, setUploadState] = useState<"idle" | "drop" | "loading" | "confirm">("idle");
  const [exercise, setExercise] = useState<string | null>(null);
  const [activeReadingSessionId, setActiveReadingSessionId] = useState<string | null>(null);
  const [loadingPct, setLoadingPct] = useState(0);
  const [rows, setRows] = useState<string[][]>([]);

  useEffect(() => {
    if (uploadState !== "loading") {
      return;
    }

    let pct = 0;
    const interval = window.setInterval(() => {
      pct += Math.random() * 18;
      if (pct >= 100) {
        pct = 100;
        window.clearInterval(interval);
        window.setTimeout(() => setUploadState("confirm"), 300);
      }
      setLoadingPct(Math.min(pct, 100));
    }, 180);

    return () => window.clearInterval(interval);
  }, [uploadState]);

  return (
    <div className="chapter-layout">
      <div
        className="chapter-sidebar"
        style={{
          borderRight: `1px solid ${T.border}`,
          background: T.surface,
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <button
          onClick={onClose}
          style={S.btn("default", {
            height: 32,
            padding: "0 12px",
            fontSize: T.fs.xs,
            marginBottom: 20,
            alignSelf: "flex-start"
          })}
        >
          ← Reiskaart
        </button>

        <div style={{ fontSize: T.fs.base, fontWeight: T.fw.semi, marginBottom: 4 }}>
          {chapter.title}
        </div>
        <ProgressBar pct={chapter.prog} style={{ marginBottom: 3 }} />
        <div style={{ fontSize: T.fs.xs, color: T.accent, fontStyle: "italic", marginBottom: 2 }}>
          Progress
        </div>
        <div style={{ fontSize: T.fs.xs, color: T.textSec, marginBottom: 24 }}>
          {chapter.total} woorden
        </div>

        {[
          ["woordenschat", "Woordenschat"],
          ["oefenen", "Oefenen"]
        ].map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              className="sidebar-link"
              onClick={() => {
                setTab(key as "woordenschat" | "oefenen");
                setExercise(null);
                setUploadState("idle");
              }}
              style={{
                background: active ? T.accentLight : "transparent",
                borderLeft: `3px solid ${active ? T.accent : "transparent"}`,
                padding: "9px 12px",
                fontSize: T.fs.sm,
                fontWeight: active ? T.fw.med : T.fw.reg,
                color: active ? T.accent : T.textSec,
                cursor: "pointer",
                borderRadius: `0 ${T.radius.sm}px ${T.radius.sm}px 0`,
                textAlign: "left",
                transition: T.trans
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="chapter-main" style={{ background: T.bg }}>
        <div
          style={{
            background: T.surface,
            borderBottom: `1px solid ${T.border}`,
            padding: "0 32px",
            display: "flex"
          }}
        >
          {[
            ["woordenschat", "Woordenschat"],
            ["oefenen", "Oefenen"]
          ].map(([key, label]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setTab(key as "woordenschat" | "oefenen");
                  setExercise(null);
                  setUploadState("idle");
                }}
                style={{
                  height: 48,
                  background: "transparent",
                  fontSize: T.fs.sm,
                  fontWeight: active ? T.fw.med : T.fw.reg,
                  color: active ? T.accent : T.textSec,
                  cursor: "pointer",
                  borderBottom: `2px solid ${active ? T.accent : "transparent"}`,
                  padding: "0 16px",
                  transition: T.trans,
                  marginRight: 4
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "28px 32px", maxWidth: 860 }}>
          {tab === "woordenschat" ? (
            <VocabularyPanel
              uploadState={uploadState}
              setUploadState={setUploadState}
              loadingPct={loadingPct}
              rows={rows}
              setRows={setRows}
            />
          ) : exercise ? (
            <QuizPanel onBack={() => setExercise(null)} />
          ) : (
            <ExerciseChooser onSelect={setExercise} />
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryScreen({
  chapters,
  selectedChapterId,
  initialTab,
  defaultLevel
}: {
  chapters: JourneyChapter[];
  selectedChapterId: string | null;
  initialTab: "vocabulair" | "oefenen" | "geschiedenis";
  defaultLevel: string;
}) {
  const [tab, setTab] = useState<"vocabulair" | "oefenen" | "geschiedenis">(initialTab);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [exercise, setExercise] = useState<string | null>(null);
  const [filter, setFilter] = useState("Alles");
  const [search, setSearch] = useState("");
  const [libraryRowsByChapter, setLibraryRowsByChapter] = useState<Record<string, string[][]>>({});
  const [readingSessions, setReadingSessions] = useState<any[]>([]);
  const [libraryEditing, setLibraryEditing] = useState(false);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const saved = window.localStorage.getItem(LIBRARY_VOCAB_BY_CHAPTER_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Record<string, string[][]>;
      setLibraryRowsByChapter(parsed);
    } catch {
      setLibraryRowsByChapter({});
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LIBRARY_VOCAB_BY_CHAPTER_KEY, JSON.stringify(libraryRowsByChapter));
  }, [libraryRowsByChapter]);

  useEffect(() => {
    const saved = window.localStorage.getItem(READING_SESSIONS_KEY);
    if (!saved) return;
    try {
      setReadingSessions(JSON.parse(saved));
    } catch {
      setReadingSessions([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(READING_SESSIONS_KEY, JSON.stringify(readingSessions));
  }, [readingSessions]);

  const selectedChapterKey = selectedChapter !== null ? chapters[selectedChapter]?.id ?? null : null;
  const libraryRows = selectedChapterKey ? libraryRowsByChapter[selectedChapterKey] ?? [] : [];
  const setLibraryRows = (next: string[][] | ((current: string[][]) => string[][])) => {
    if (!selectedChapterKey) return;
    setLibraryRowsByChapter((current) => {
      const chapterRows = current[selectedChapterKey] ?? [];
      const resolved = typeof next === "function" ? next(chapterRows) : next;
      return {
        ...current,
        [selectedChapterKey]: resolved
      };
    });
  };

  useEffect(() => {
    if (selectedChapter !== null && !chapters[selectedChapter]) {
      setSelectedChapter(null);
    }
  }, [selectedChapter, chapters]);

  useEffect(() => {
    if (!selectedChapterId) {
      return;
    }
    const index = chapters.findIndex((chapter) => chapter.id === selectedChapterId);
    if (index >= 0) {
      setSelectedChapter(index);
    }
  }, [chapters, selectedChapterId]);

  useEffect(() => {
    setTab(initialTab);
    setExercise(null);
  }, [initialTab]);

  const filteredWords = useMemo(() => {
    if (libraryEditing) {
      return libraryRows;
    }
    if (!deferredSearch.trim()) {
      return libraryRows;
    }
    return libraryRows.filter(
      ([spanish, dutch]) =>
        spanish.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        dutch.toLowerCase().includes(deferredSearch.toLowerCase())
    );
  }, [deferredSearch, libraryRows, libraryEditing]);

  const allHistory = [
    ...readingSessions.map((session) => ({
      id: session.id,
      datum: new Date(session.createdAt).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" }),
      type: "Leesvaardigheid",
      score: session.finalScore ? `${session.finalScore}/10` : "Afgesloten",
      kleur: T.accent
    })),
    ...reviewSessions
  ];
  const filteredSessions = filter === "Alles" ? allHistory : allHistory.filter((session) => session.type === filter);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingTop: 24 }}>
      <div style={{ display: "flex", height: "calc(100vh - 56px)" }}>
        <div
          style={{
            width: 220,
            flexShrink: 0,
            background: T.surface,
            borderRight: `1px solid ${T.border}`,
            padding: "24px 0",
            overflowY: "auto"
          }}
        >
          <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, marginBottom: 16 }}>
            {[
              ["vocabulair", "Vocabulair"],
              ["oefenen", "Oefenen"],
              ["geschiedenis", "Geschiedenis"]
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key as "vocabulair" | "oefenen" | "geschiedenis");
                  setExercise(null);
                }}
                style={{
                  flex: 1,
                  height: 40,
                  background: "transparent",
                  fontSize: T.fs.xs,
                  fontWeight: tab === key ? T.fw.med : T.fw.reg,
                  color: tab === key ? T.accent : T.textSec,
                  cursor: "pointer",
                  borderBottom: `2px solid ${tab === key ? T.accent : "transparent"}`,
                  transition: T.trans
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div
              style={{
                fontSize: T.fs.xs,
                color: T.textSec,
                fontWeight: T.fw.med,
                padding: "0 12px",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: 0.5
              }}
            >
              Hoofdstukken
            </div>
            {chapters.map((chapter, index) => {
              const active = selectedChapter === index;
              return (
                <button
                  key={chapter.id}
                  className="sidebar-link"
                  onClick={() => startTransition(() => setSelectedChapter(index))}
                  style={{
                    background: active ? T.accentLight : "transparent",
                    borderLeft: `3px solid ${active ? T.accent : "transparent"}`,
                    padding: "8px 12px",
                    fontSize: T.fs.sm,
                    color: active ? T.accent : T.textSec,
                    cursor: "pointer",
                    textAlign: "left",
                    borderRadius: `0 ${T.radius.sm}px ${T.radius.sm}px 0`,
                    fontWeight: active ? T.fw.med : T.fw.reg,
                    transition: T.trans
                  }}
                >
                  <span style={{ color: T.neutral, marginRight: 8, fontSize: T.fs.xs }}>{chapter.n}</span>
                  {chapter.title}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>
          {selectedChapter === null ? (
            <div style={{ textAlign: "center", paddingTop: 60, color: T.textSec, fontSize: T.fs.sm }}>
              ← Kies een hoofdstuk om te beginnen
            </div>
          ) : tab === "vocabulair" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: T.fs.base, fontWeight: T.fw.med, color: T.text, flex: 1 }}>
                  {chapters[selectedChapter].n} · {chapters[selectedChapter].title}
                </div>
                <span style={S.tag("neutral", { fontSize: T.fs.xs })}>{sanitizeRows(libraryRows).length} woorden</span>
                <button
                  style={S.btn("ghost", { height: 34, padding: "0 10px", fontSize: T.fs.xs })}
                  onClick={() => {
                    setLibraryEditing(true);
                    setSearch("");
                    if (libraryRows.length === 0) {
                      setLibraryRows([["", ""]]);
                    }
                  }}
                >
                  <span aria-label="Bewerk" title="Bewerk">🖉</span>
                </button>
                <button
                  style={S.btn("ghost", { height: 34, padding: "0 10px", fontSize: T.fs.xs })}
                  onClick={() => {
                    setLibraryRows((current) => sanitizeRows(current));
                    setLibraryEditing(false);
                  }}
                >
                  <span aria-label="Opslaan" title="Opslaan">✓</span>
                </button>
                <input
                  style={S.input({ height: 34, width: 180 })}
                  placeholder="Zoeken…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <WordTable
                rows={filteredWords}
                editable={libraryEditing}
                onChange={setLibraryRows}
                onInputTab={(index) => {
                  if (index === libraryRows.length - 1) {
                    setLibraryRows((current) => [...current, ["", ""]]);
                  }
                }}
              />
            </div>
          ) : tab === "oefenen" ? (
            exercise ? (
              exercise === "leesvaardigheid" ? (
                <ReadingPracticePanel
                  chapter={chapters[selectedChapter]}
                  defaultLevel={defaultLevel}
                  words={sanitizeRows(libraryRows)}
                  onBack={() => setExercise(null)}
                  initialSession={readingSessions.find((item) => item.id === activeReadingSessionId) ?? null}
                  onSessionSaved={(session: any) => {
                    setReadingSessions((current) => {
                      const others = current.filter((item) => item.id !== session.id);
                      return [session, ...others];
                    });
                  }}
                />
              ) : (
                <QuizPanel onBack={() => setExercise(null)} />
              )
            ) : <ExerciseChooser onSelect={setExercise} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: T.fs.base, fontWeight: T.fw.med, color: T.text, flex: 1 }}>
                  {chapters[selectedChapter].n} · {chapters[selectedChapter].title}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Alles", "Leesvaardigheid", "Schrijfvaardigheid", "Woordenschattoets"].map((item) => (
                    <button
                      key={item}
                      onClick={() => setFilter(item)}
                      style={S.btn(filter === item ? "primary" : "default", {
                        height: 30,
                        padding: "0 12px",
                        fontSize: T.fs.xs
                      })}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {filteredSessions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px", color: T.textSec, fontSize: T.fs.sm }}>
                  Geen sessies voor dit filter.
                </div>
              ) : null}

              {filteredSessions.map((session, index) => (
                <div
                  key={`${session.datum}-${index}`}
                  style={S.card({
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 18px"
                  })}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: T.fs.xs, color: T.textSec }}>{session.datum}</div>
                  </div>
                  <span
                    style={S.tag("accent", {
                      fontSize: T.fs.xs,
                      borderColor: session.kleur,
                      color: session.kleur,
                      background: `${session.kleur}12`
                    })}
                  >
                    {session.type}
                  </span>
                  <span
                    style={{
                      fontSize: T.fs.sm,
                      fontWeight: T.fw.med,
                      color: T.text,
                      minWidth: 50,
                      textAlign: "right"
                    }}
                  >
                    {session.score}
                  </span>
                  <button
                    style={S.btn("default", { height: 30, padding: "0 12px", fontSize: T.fs.xs })}
                    onClick={() => {
                      if (session.type !== "Leesvaardigheid" || !session.id) return;
                      setTab("oefenen");
                      setExercise("leesvaardigheid");
                      setActiveReadingSessionId(session.id);
                    }}
                  >
                    Bekijken
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarScreen() {
  const [month, setMonth] = useState({ year: 2026, month: 4 });
  const [hovered, setHovered] = useState<number | null>(null);
  const monthNames = [
    "Januari",
    "Februari",
    "Maart",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Augustus",
    "September",
    "Oktober",
    "November",
    "December"
  ];
  const firstDay = new Date(month.year, month.month, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingTop: 24 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32
          }}
          className="mobile-stack"
        >
          <h1 style={{ fontSize: T.fs.xl, fontWeight: T.fw.semi, margin: 0 }}>Kalender</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={() =>
                setMonth((current) =>
                  current.month === 0
                    ? { year: current.year - 1, month: 11 }
                    : { year: current.year, month: current.month - 1 }
                )
              }
              style={S.btn("default", { height: 34, padding: "0 12px" })}
            >
              ←
            </button>
            <span style={{ fontSize: T.fs.md, fontWeight: T.fw.med, minWidth: 140, textAlign: "center" }}>
              {monthNames[month.month]} {month.year}
            </span>
            <button
              onClick={() =>
                setMonth((current) =>
                  current.month === 11
                    ? { year: current.year + 1, month: 0 }
                    : { year: current.year, month: current.month + 1 }
                )
              }
              style={S.btn("default", { height: 34, padding: "0 12px" })}
            >
              →
            </button>
          </div>
        </div>

        <div style={S.card({ padding: "24px", marginBottom: 24 })}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
            {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((day) => (
              <div
                key={day}
                style={{
                  textAlign: "center",
                  fontSize: T.fs.xs,
                  color: T.textSec,
                  fontWeight: T.fw.med,
                  padding: "4px 0"
                }}
              >
                {day}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, position: "relative" }}>
            {Array.from({ length: offset }).map((_, index) => (
              <div key={`empty-${index}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const level = calendarActivity[day] ?? 0;
              const active = level > 0;
              const today = month.month === 4 && month.year === 2026 && day === 2;
              const background =
                level === 0 ? T.bg : level === 1 ? "#F2DDD3" : level === 2 ? "#DFA98F" : T.accent;

              return (
                <div
                  key={day}
                  onMouseEnter={() => active && setHovered(day)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    height: 44,
                    background,
                    border: `1.5px solid ${today ? T.accent : active ? "transparent" : T.border}`,
                    borderRadius: T.radius.sm,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: T.fs.sm,
                    fontWeight: active ? T.fw.med : T.fw.reg,
                    color: level === 3 ? "#fff" : T.text,
                    cursor: active ? "pointer" : "default",
                    position: "relative",
                    transition: T.trans,
                    boxShadow: today ? `0 0 0 2px ${T.accent}` : "none"
                  }}
                >
                  {day}
                  {hovered === day && calendarSessions[day] ? (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "calc(100% + 6px)",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        borderRadius: T.radius.md,
                        padding: "10px 14px",
                        zIndex: 50,
                        minWidth: 220,
                        boxShadow: T.shadow.md,
                        whiteSpace: "nowrap",
                        pointerEvents: "none"
                      }}
                    >
                      <div style={{ fontSize: T.fs.xs, fontWeight: T.fw.semi, marginBottom: 6 }}>
                        {day} {monthNames[month.month]}
                      </div>
                      {calendarSessions[day].map((item) => (
                        <div key={item} style={{ fontSize: T.fs.xs, color: T.textSec, marginBottom: 3 }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="screen-grid three-cols">
          {[
            { val: "🔥 12", label: "Dagen op rij" },
            { val: "13", label: "Sessies deze maand" },
            { val: "8.2", label: "Gem. cijfer", color: T.success }
          ].map((stat) => (
            <div key={stat.label} style={S.card({ textAlign: "center", padding: "18px" })}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: T.fw.semi,
                  color: stat.color ?? T.accent,
                  marginBottom: 4
                }}
              >
                {stat.val}
              </div>
              <div style={{ fontSize: T.fs.xs, color: T.textSec }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsScreen({
  user,
  settings,
  onSave,
  onSaveProfile,
  onLogout
}: {
  user: AppUser;
  settings: UserSettings;
  onSave: (settings: UserSettings) => Promise<void>;
  onSaveProfile: (profile: { name: string; avatarUrl: string }) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [level, setLevel] = useState(settings.level);
  const [language, setLanguage] = useState<UserSettings["interfaceLanguage"]>(settings.interfaceLanguage);
  const [notifications, setNotifications] = useState(settings.notificationsEnabled);
  const [name, setName] = useState(user.name);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");

  function persist(next: UserSettings) {
    void onSave(next);
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingTop: 24 }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 32px" }}>
        <h1 style={{ fontSize: T.fs.xl, fontWeight: T.fw.semi, margin: "0 0 28px" }}>Instellingen</h1>

        <SectionCard title="Account">
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`Profielfoto van ${name || user.name}`}
                style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: T.accentMid,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 18,
                  fontWeight: T.fw.semi,
                  color: T.accent,
                  flexShrink: 0
                }}
              >
                {(name || user.name)[0]}
              </div>
            )}
            <div>
              <div style={{ fontSize: T.fs.base, fontWeight: T.fw.med }}>{name || user.name}</div>
              <div style={{ fontSize: T.fs.xs, color: T.textSec }}>{user.email}</div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <label style={{ fontSize: T.fs.xs, color: T.textSec }}>Naam</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Je naam"
              style={{ ...S.input, width: "100%" }}
            />
            <label style={{ fontSize: T.fs.xs, color: T.textSec }}>Profielfoto URL</label>
            <input
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://..."
              style={{ ...S.input, width: "100%" }}
            />
            <button
              style={S.btn("default", { width: "fit-content", height: 34, fontSize: T.fs.xs })}
              onClick={() => void onSaveProfile({ name, avatarUrl })}
            >
              Profiel opslaan
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, paddingTop: 4, flexWrap: "wrap" }}>
            <button style={S.btn("default", { height: 34, fontSize: T.fs.xs })} disabled>
              Wachtwoord wijzigen
            </button>
            <button
              style={S.btn("default", { height: 34, fontSize: T.fs.xs, color: T.textSec })}
              onClick={() => void onLogout()}
            >
              Uitloggen
            </button>
          </div>
          <div style={{ fontSize: T.fs.xs, color: T.textSec, marginTop: 10 }}>
            ✓ Ingelogd · synchroniseert automatisch tussen apparaten
          </div>
        </SectionCard>

        <SectionCard title="Taalniveau">
          <div style={{ fontSize: T.fs.sm, color: T.text, marginBottom: 10 }}>Spaans niveau (ERK)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((item) => (
              <button
                key={item}
                onClick={() => {
                  setLevel(item);
                  persist({
                    level: item,
                    interfaceLanguage: language,
                    notificationsEnabled: notifications
                  });
                }}
                style={S.btn(level === item ? "primary" : "default", {
                  height: 34,
                  padding: "0 16px"
                })}
              >
                {item}
              </button>
            ))}
          </div>
          <div style={{ fontSize: T.fs.xs, color: T.textSec, marginTop: 10 }}>
            Dit bepaalt de complexiteit van gegenereerde teksten en oefeningen.
          </div>
        </SectionCard>

        <SectionCard title="App-voorkeuren">
          <SettingRow label="Weergavetaal" sub="De taal van de interface">
            <div style={{ display: "flex", gap: 6 }}>
              {[
                ["nl", "NL"],
                ["en", "EN"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    const nextLanguage = value as "nl" | "en";
                    setLanguage(nextLanguage);
                    persist({
                      level,
                      interfaceLanguage: nextLanguage,
                      notificationsEnabled: notifications
                    });
                  }}
                  style={S.btn(language === value ? "primary" : "default", {
                    height: 30,
                    padding: "0 14px",
                    fontSize: T.fs.xs
                  })}
                >
                  {label}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow label="Meldingen" sub="Dagelijkse oefenherinneringen">
            <button
              onClick={() => {
                const nextNotifications = !notifications;
                setNotifications(nextNotifications);
                persist({
                  level,
                  interfaceLanguage: language,
                  notificationsEnabled: nextNotifications
                });
              }}
              style={{
                width: 44,
                height: 24,
                borderRadius: T.radius.pill,
                background: notifications ? T.accent : T.neutral,
                position: "relative",
                cursor: "pointer",
                transition: T.trans
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 3,
                  left: notifications ? 22 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  transition: T.trans
                }}
              />
            </button>
          </SettingRow>
        </SectionCard>
      </div>
    </div>
  );
}

function VocabularyPanel({
  uploadState,
  setUploadState,
  loadingPct,
  rows,
  setRows
}: {
  uploadState: "idle" | "drop" | "loading" | "confirm";
  setUploadState: (value: "idle" | "drop" | "loading" | "confirm") => void;
  loadingPct: number;
  rows: string[][];
  setRows: (rows: string[][] | ((current: string[][]) => string[][])) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const sanitized = sanitizeRows(rows);
      window.localStorage.setItem(VOCAB_SYNC_KEY, JSON.stringify({ savedAt: new Date().toISOString(), rows: sanitized }));
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [rows]);

  if (uploadState === "drop") {
    return (
      <div>
        <div
          onClick={() => setUploadState("loading")}
          style={{
            border: `2px dashed ${T.accent}`,
            borderRadius: T.radius.lg,
            background: T.accentLight,
            padding: "48px 32px",
            textAlign: "center",
            cursor: "pointer",
            marginBottom: 20,
            transition: T.trans
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: T.fs.md, fontWeight: T.fw.med, marginBottom: 6 }}>
            Sleep een foto of scan hierheen
          </div>
          <div style={{ fontSize: T.fs.sm, color: T.textSec, marginBottom: 16 }}>
            of klik om een bestand te kiezen — PNG, TXT
          </div>
          <button style={S.btn("primary")} onClick={() => fileInputRef.current?.click()}>
            Bestand kiezen
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.png"
            style={{ display: "none" }}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setErrorMessage(null);

              if (file.name.toLowerCase().endsWith(".txt")) {
                const text = await file.text();
                const parsedRows = text
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => line.split(";").map((part) => part.trim()))
                  .filter((parts) => parts.length === 2) as string[][];
                setRows((current) => sanitizeRows([...current, ...parsedRows]));
                setUploadState("idle");
                return;
              }

              if (file.name.toLowerCase().endsWith(".png")) {
                setErrorMessage("PNG kon niet betrouwbaar worden uitgelezen. Probeer een scherpere scan of upload een .txt-bestand.");
                setUploadState("idle");
              }
            }}
          />
        </div>
        <button style={S.btn("default")} onClick={() => setUploadState("idle")}>
          Annuleren
        </button>
      </div>
    );
  }

  if (uploadState === "loading") {
    return (
      <div style={{ ...S.card({ padding: "32px" }), textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 16 }}>⚙️</div>
        <div style={{ fontSize: T.fs.md, fontWeight: T.fw.med, marginBottom: 6 }}>
          Woordparen extraheren…
        </div>
        <div style={{ fontSize: T.fs.sm, color: T.textSec, marginBottom: 20 }}>
          AI analyseert de tekstboekpagina
        </div>
        <ProgressBar pct={loadingPct} style={{ maxWidth: 300, margin: "0 auto" }} />
        <div style={{ fontSize: T.fs.xs, color: T.textSec, marginTop: 8 }}>
          {Math.round(loadingPct)}%
        </div>
      </div>
    );
  }

  if (uploadState === "confirm") {
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
            padding: "10px 16px",
            background: T.successLight,
            borderRadius: T.radius.sm,
            border: `1px solid ${T.success}`
          }}
        >
          <span style={{ color: T.success, fontSize: T.fs.base }}>✓</span>
          <span style={{ fontSize: T.fs.sm, color: T.success, fontWeight: T.fw.med }}>
            6 woordparen gevonden — controleer vóór opslaan
          </span>
        </div>
        <div style={S.card({ marginBottom: 16 })}>
          <WordTable
            editable
            onChange={setRows}
            rows={[
              ["el desayuno", "het ontbijt"],
              ["la servilleta", "het servet"],
              ["la bebida", "het drankje"],
              ["el plato", "het bord"],
              ["probar", "proeven"],
              ["delicioso", "heerlijk"]
            ]}
          />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={S.btn("primary")} onClick={() => setUploadState("idle")}>
            Opslaan
          </button>
          <button style={S.btn("default")} onClick={() => setUploadState("idle")}>
            Annuleren
          </button>
        </div>
      </div>
    );
  }

  const lastIndex = rows.length - 1;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <button style={S.btn("primary")} onClick={() => setUploadState("drop")}>
          ↑ Uploaden
        </button>
        <button
          style={S.btn("ghost")}
          onClick={() => {
            setIsEditing(true);
            if (rows.length === 0) {
              setRows([["", ""]]);
            }
          }}
        >
          ✏️ Bewerk
        </button>
        <button
          style={S.btn("ghost")}
          onClick={() => {
            setRows((current) => sanitizeRows(current));
            setIsEditing(false);
          }}
        >
          💾 Opslaan
        </button>
        <input style={S.input({ width: 200 })} placeholder="Zoeken…" />
      </div>
      {errorMessage ? (
        <div style={{ ...S.card({ marginBottom: 12, padding: "10px 14px" }), border: `1px solid ${T.accent}`, color: T.accent }}>
          {errorMessage}
        </div>
      ) : null}
      <WordTable
        rows={rows}
        onChange={setRows}
        editable={isEditing}
        onInputTab={(index) => {
          if (index === lastIndex) {
            setRows((current) => [...current, ["", ""]]);
          }
        }}
      />
    </div>
  );
}

function ExerciseChooser({ onSelect }: { onSelect: (value: string) => void }) {
  return (
    <div>
      <h2 style={{ fontSize: T.fs.lg, fontWeight: T.fw.med, marginBottom: 20 }}>
        Kies een oefening
      </h2>
      <div className="screen-grid three-cols">
        {practiceCards.map((card) => (
          <button
            key={card.id}
            className="card-hover"
            onClick={() => onSelect(card.id)}
            style={S.card({
              padding: "22px",
              cursor: "pointer",
              textAlign: "left",
              minHeight: 190
            })}
          >
            <div style={{ fontSize: 28, marginBottom: 14 }}>{card.icon}</div>
            <div style={{ fontSize: T.fs.base, fontWeight: T.fw.med, marginBottom: 8 }}>
              {card.title}
            </div>
            <div style={{ fontSize: T.fs.sm, color: T.textSec, lineHeight: 1.6 }}>
              {card.copy}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReadingPracticePanel({
  chapter,
  defaultLevel,
  words,
  onBack,
  initialSession,
  onSessionSaved
}: {
  chapter: JourneyChapter;
  defaultLevel: string;
  words: string[][];
  onBack: () => void;
  initialSession: any | null;
  onSessionSaved: (session: any) => void;
}) {
  const [level, setLevel] = useState(defaultLevel);
  const [minutes, setMinutes] = useState(10);
  const [session, setSession] = useState<any | null>(initialSession);
  const [showAnswers, setShowAnswers] = useState<Record<number, boolean>>({});
  const [scores, setScores] = useState<Record<number, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setSession(initialSession);
    setIsSaved(Boolean(initialSession));
  }, [initialSession]);

  const questionCount = minutes === 5 ? 6 : minutes === 10 ? 9 : 12;
  const mcCount = Math.round((questionCount * 2) / 3);

  const generateSession = () => {
    const chapterWords = words.slice(0, 10).map(([foreignWord, dutchWord]) => `${foreignWord} (${dutchWord})`);
    const text = `In ${chapter.title} oefent de cursist woorden zoals ${chapterWords.join(", ")}. ` +
      `Tijdens deze leesvaardigheidsoefening op niveau ${level} leest de cursist een Nederlandse tekst die past bij het hoofdstuk. ` +
      `De tekst is ontworpen voor ongeveer ${minutes} minuten leestijd en bevat zowel bekende als aanvullende woorden in context.`;
    const questions = Array.from({ length: questionCount }, (_, index) => {
      const isMc = index < mcCount;
      if (isMc) {
        return {
          id: index + 1,
          type: "mc",
          question: `Meerkeuzevraag ${index + 1}: Wat is de beste samenvatting van alinea ${Math.min(index + 1, 3)}?`,
          options: ["Optie A", "Optie B", "Optie C", "Optie D"],
          modelAnswer: "Optie B"
        };
      }
      return {
        id: index + 1,
        type: "open",
        question: `Open vraag ${index + 1}: Leg in 1-3 zinnen uit wat de hoofdgedachte van dit deel is.`,
        modelAnswer: "Modelantwoord: benoem kernboodschap en minstens één detail uit de tekst."
      };
    });
    const nextSession = {
      id: crypto.randomUUID(),
      chapterId: chapter.id,
      chapterLabel: `${chapter.n} · ${chapter.title}`,
      level,
      minutes,
      createdAt: new Date().toISOString(),
      status: "open",
      text,
      questions,
      answers: {} as Record<number, string>
    };
    setSession(nextSession);
    setScores({});
    setShowResult(false);
    setIsSaved(false);
  };

  const updateAnswer = (questionId: number, value: string) => {
    if (!session || session.status === "closed") return;
    const updated = { ...session, answers: { ...session.answers, [questionId]: value } };
    setSession(updated);
  };

  const allScored = session ? session.questions.every((question: any) => scores[question.id] === "0" || scores[question.id] === "1") : false;
  const totalPoints = session ? session.questions.reduce((sum: number, question: any) => sum + Number(scores[question.id] ?? 0), 0) : 0;
  const finalGrade = session ? ((totalPoints / session.questions.length) * 10).toFixed(1) : "0.0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button style={S.btn("default", { height: 32, width: 100, fontSize: T.fs.xs })} onClick={onBack}>← Terug</button>
      <h2 style={{ fontSize: T.fs.lg, fontWeight: T.fw.med, margin: 0 }}>Leesvaardigheid</h2>
      {!session ? (
        <div style={S.card({ padding: "20px", display: "grid", gap: 12, maxWidth: 600 })}>
          <div style={{ fontSize: T.fs.sm, color: T.textSec }}>Genereer een oefening voor {chapter.n} · {chapter.title}.</div>
          <label style={{ fontSize: T.fs.xs }}>Niveau</label>
          <select value={level} onChange={(event) => setLevel(event.target.value)} style={S.input({ height: 38, width: 180 }) as CSSProperties}>
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((cefr) => <option key={cefr}>{cefr}</option>)}
          </select>
          <label style={{ fontSize: T.fs.xs }}>Leestijd (minuten)</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[5, 10, 15].map((option) => (
              <button key={option} style={S.btn(minutes === option ? "primary" : "default")} onClick={() => setMinutes(option)}>
                {option}
              </button>
            ))}
          </div>
          <button style={S.btn("primary")} onClick={generateSession}>Genereer oefening</button>
        </div>
      ) : (
        <>
          <div style={S.card({ padding: "20px" })}>
            <div style={{ fontSize: T.fs.xs, color: T.textSec, marginBottom: 10 }}>
              Niveau {session.level} · Leestijd {session.minutes} minuten · Status: {session.status === "closed" ? "Afgesloten" : "Open"}
            </div>
            <p style={{ margin: 0, fontSize: T.fs.sm, lineHeight: 1.7 }}>{session.text}</p>
          </div>
          {session.questions.map((question: any) => (
            <div key={question.id} style={S.card({ padding: "16px" })}>
              <div style={{ fontSize: T.fs.xs, color: T.accent, marginBottom: 8 }}>{question.type === "mc" ? "MEERKEUZE" : "OPEN"}</div>
              <div style={{ fontSize: T.fs.sm, marginBottom: 10 }}>{question.question}</div>
              {question.type === "mc" ? (
                <select
                  value={session.answers[question.id] ?? ""}
                  disabled={session.status === "closed"}
                  onChange={(event) => updateAnswer(question.id, event.target.value)}
                  style={S.input({ height: 36, width: 220 }) as CSSProperties}
                >
                  <option value="">Kies antwoord…</option>
                  {question.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <textarea
                  value={session.answers[question.id] ?? ""}
                  disabled={session.status === "closed"}
                  onChange={(event) => updateAnswer(question.id, event.target.value)}
                  style={{ ...S.input({ height: 90 }), width: "100%", resize: "vertical" }}
                />
              )}
              <div style={{ marginTop: 10 }}>
                <button style={S.btn("ghost", { height: 30, fontSize: T.fs.xs })} onClick={() => setShowAnswers((current) => ({ ...current, [question.id]: !current[question.id] }))}>
                  {showAnswers[question.id] ? "Verberg antwoord" : "Toon antwoord"}
                </button>
                {showAnswers[question.id] ? <div style={{ marginTop: 8, fontSize: T.fs.sm, color: T.textSec }}>{question.modelAnswer}</div> : null}
                {showAnswers[question.id] ? (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: T.fs.xs, color: T.textSec }}>Punten (0 of 1):</label>
                    <select
                      value={scores[question.id] ?? ""}
                      onChange={(event) => setScores((current) => ({ ...current, [question.id]: event.target.value }))}
                      style={S.input({ height: 32, width: 90 }) as CSSProperties}
                    >
                      <option value="">-</option>
                      <option value="0">0</option>
                      <option value="1">1</option>
                    </select>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
            <button style={S.btn("default")} onClick={() => setShowAnswers(Object.fromEntries(session.questions.map((q: any) => [q.id, true])))}>Controleren</button>
            {allScored ? <button style={S.btn("primary")} disabled={showResult || isSaved} onClick={() => setShowResult(true)}>Toets afsluiten</button> : null}
          </div>
          {showResult ? (
            <div style={S.card({ padding: "14px", border: `1px solid ${T.border}` })}>
              <div style={{ fontSize: T.fs.sm, marginBottom: 10 }}>
                Eindcijfer: <strong>{finalGrade}</strong> (punten {totalPoints}/{session.questions.length})
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={S.btn("primary")}
                  disabled={isSaved}
                  onClick={() => {
                    const finalSession = { ...session, status: "closed", finalScore: finalGrade, awardedPoints: scores };
                    setSession(finalSession);
                    onSessionSaved(finalSession);
                    setIsSaved(true);
                  }}
                >
                  Opslaan
                </button>
                <button style={S.btn("default")} disabled={!isSaved} onClick={onBack}>Scherm sluiten</button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function QuizPanel({ onBack }: { onBack: () => void }) {
  const vragen = [
    { nr: 1, type: "Vertalen", vraag: "Wat betekent 'la cuenta' in het Nederlands?" },
    { nr: 2, type: "Invullen", vraag: "Vul in: Yo quiero ___ agua." },
    { nr: 3, type: "Vertalen", vraag: "Hoe zeg je 'bestellen' in het Spaans?" }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <button
          style={S.btn("default", { height: 32, padding: "0 12px", fontSize: T.fs.xs })}
          onClick={onBack}
        >
          ← Terug
        </button>
        <h2 style={{ fontSize: T.fs.lg, fontWeight: T.fw.med, margin: 0 }}>Woordenschattoets</h2>
      </div>
      {vragen.map((vraag) => (
        <div
          key={vraag.nr}
          style={S.card({
            display: "flex",
            gap: 16,
            alignItems: "flex-start"
          })}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: T.neutralLight,
              display: "grid",
              placeItems: "center",
              fontSize: T.fs.sm,
              fontWeight: T.fw.semi,
              flexShrink: 0,
              marginTop: 2
            }}
          >
            {vraag.nr}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: T.fs.xs, color: T.accent, fontWeight: T.fw.med, marginBottom: 4 }}>
              {vraag.type.toUpperCase()}
            </div>
            <div style={{ fontSize: T.fs.sm, marginBottom: 8 }}>{vraag.vraag}</div>
            <input style={S.input({ height: 34 })} placeholder="Jouw antwoord…" />
          </div>
        </div>
      ))}
      <button style={{ ...S.btn("primary"), alignSelf: "flex-end" }}>Toets indienen</button>
    </div>
  );
}

function AddChapterModal({
  insertAfterIndex,
  totalChapters,
  onConfirm,
  onClose
}: {
  insertAfterIndex: number;
  totalChapters: number;
  onConfirm: (title: string) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const isAppend = insertAfterIndex === totalChapters - 1;
  const positionLabel = isAppend
    ? "aan het einde"
    : `na hoofdstuk ${String(insertAfterIndex + 1).padStart(2, "0")}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        background: "rgba(26,23,20,0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fade-in 0.15s ease"
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: T.surface,
          borderRadius: T.radius.lg,
          boxShadow: "0 8px 40px rgba(26,23,20,0.16)",
          padding: "32px",
          width: 420,
          maxWidth: "90vw",
          animation: "modal-in 0.18s ease"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 24
          }}
        >
          <div>
            <div style={{ fontSize: T.fs.lg, fontWeight: T.fw.semi, marginBottom: 4 }}>
              Nieuw hoofdstuk
            </div>
            <div style={{ fontSize: T.fs.xs, color: T.textSec }}>
              Wordt ingevoegd {positionLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              cursor: "pointer",
              color: T.textSec,
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
              borderRadius: T.radius.sm
            }}
          >
            ×
          </button>
        </div>

        <label
          style={{
            display: "block",
            fontSize: T.fs.xs,
            fontWeight: T.fw.med,
            color: T.textSec,
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: 0.5
          }}
        >
          Titel
        </label>
        <input
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="bijv. Op het strand"
          style={S.input({ width: "100%", marginBottom: 24, fontSize: T.fs.base })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onClose();
            }
            if (event.key === "Enter" && title.trim()) {
              void onConfirm(title.trim());
            }
          }}
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={S.btn("default", { height: 38 })} onClick={onClose}>
            Annuleren
          </button>
          <button
            disabled={!title.trim()}
            onClick={() => void onConfirm(title.trim())}
            style={{
              ...S.btn("primary", { height: 38 }),
              opacity: title.trim() ? 1 : 0.45,
              cursor: title.trim() ? "pointer" : "default"
            }}
          >
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={S.card({ marginBottom: 16 })}>
      <div
        style={{
          fontSize: T.fs.base,
          fontWeight: T.fw.med,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: `1px solid ${T.border}`
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function SettingRow({
  label,
  sub,
  children
}: {
  label: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: `1px solid ${T.neutralLight}`,
        gap: 16
      }}
    >
      <div>
        <div style={{ fontSize: T.fs.sm }}>{label}</div>
        {sub ? <div style={{ fontSize: T.fs.xs, color: T.textSec, marginTop: 2 }}>{sub}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  error,
  aside
}: {
  label: string;
  children: ReactNode;
  error?: string;
  aside?: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <label
          style={{
            fontSize: T.fs.xs,
            color: T.textSec,
            fontWeight: T.fw.med,
            display: "block"
          }}
        >
          {label}
        </label>
        {aside ? <span style={{ fontSize: T.fs.xs, color: T.accent }}>{aside}</span> : null}
      </div>
      {children}
      {error ? <div style={{ marginTop: 6, fontSize: T.fs.xs, color: T.accent }}>{error}</div> : null}
    </div>
  );
}

function CardHeader({ chapter }: { chapter: JourneyChapter }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontSize: T.fs.xs, color: T.textSec, fontWeight: T.fw.med }}>{chapter.n}</span>
      <StatusBadge chapter={chapter} />
    </div>
  );
}

function StatusBadge({ chapter }: { chapter: JourneyChapter }) {
  if (chapter.done) {
    return <span style={S.tag("accent", { fontSize: 10 })}>✓ Klaar</span>;
  }
  if (chapter.active) {
    return <span style={S.tag("accent", { fontSize: 10 })}>▶ Bezig</span>;
  }
  return null;
}

function FooterWords({ chapter }: { chapter: JourneyChapter }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
      <span style={{ fontSize: T.fs.xs, color: T.textSec }}>Progress</span>
      <span style={{ fontSize: T.fs.xs, color: T.textSec }}>{chapter.total} woorden</span>
    </div>
  );
}

function ProgressBar({
  pct,
  style
}: {
  pct: number;
  style?: CSSProperties;
}) {
  return (
    <div style={{ ...S.progress, ...style }}>
      <div style={S.progressFill(pct)} />
    </div>
  );
}

function WordTable({
  rows,
  editable = false,
  onChange,
  onInputTab
}: {
  rows: string[][];
  editable?: boolean;
  onChange?: (rows: string[][]) => void;
  onInputTab?: (rowIndex: number) => void;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ borderBottom: `1.5px solid ${T.border}` }}>
          {["Spaans", "Nederlands"].map((column) => (
            <th
              key={column}
              style={{
                textAlign: "left",
                padding: "7px 12px",
                fontSize: T.fs.xs,
                color: T.textSec,
                fontWeight: T.fw.med
              }}
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={index}
            style={{ borderBottom: `1px solid ${T.neutralLight}` }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = T.neutralLight;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "transparent";
            }}
          >
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} style={{ padding: "9px 12px", fontSize: T.fs.sm }}>
                {editable ? (
                  <input
                    value={cell}
                    onChange={(event) => {
                      if (!onChange) return;
                      const next = rows.map((r) => [...r]);
                      next[index][cellIndex] = event.target.value;
                      onChange(next);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Tab" && cellIndex === 1) {
                        onInputTab?.(index);
                      }
                    }}
                    style={S.input({ width: "100%", height: 30 })}
                  />
                ) : (
                  cell
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PathInsertButton({ index, onClick }: { index: number; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const size = hovered ? 26 : 20;
  const [x, y] = midpointOnPath(index);

  return (
    <button
      className="path-insert"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Hoofdstuk hier invoegen"
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1.5px solid ${T.accent}`,
        background: T.surface,
        color: T.accent,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1,
        transition: T.trans,
        zIndex: 3,
        boxShadow: hovered ? T.shadow.md : T.shadow.sm,
        padding: 0
      }}
    >
      +
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
