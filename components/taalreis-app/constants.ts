import { T } from "@/design_handoff_taalreis/taalreis-tokens";

export const APP_STATE_KEY = "taalreis_state";
export const DEMO_CHAPTERS_KEY = "taalreis_chapters";
export const VIEW_KEY = "taalreis_view";
export const VOCAB_SYNC_KEY = "taalreis_vocab_latest";
export const LIBRARY_VOCAB_BY_CHAPTER_KEY = "taalreis_library_vocab_by_chapter";
export const READING_HISTORY_KEY = "taalreis_reading_history";

export const PAD = {
  cardW: 260,
  rowH: 160,
  nodeY0: 60,
  xLeft: 220,
  xRight: 520,
  dotSize: 12
};

export const wordRows = [
  ["comer", "eten"],
  ["la mesa", "de tafel"],
  ["beber", "drinken"],
  ["el menú", "het menu"],
  ["pedir", "bestellen"],
  ["el camarero", "de ober"],
  ["la cuenta", "de rekening"],
  ["rico", "lekker"]
];

export const reviewSessions = [
  { datum: "2 mei 2026, 14:30", type: "Leesvaardigheid", score: "3/3", kleur: T.accent },
  { datum: "1 mei 2026, 09:15", type: "Schrijfvaardigheid", score: "Voltooid", kleur: "#6B8FBF" },
  { datum: "30 apr 2026, 20:00", type: "Woordenschattoets", score: "8/10", kleur: T.success },
  { datum: "28 apr 2026, 18:45", type: "Leesvaardigheid", score: "2/3", kleur: T.accent }
];

export const calendarActivity: Record<number, number> = {
  1: 1, 2: 3, 3: 2, 5: 1, 6: 3, 7: 2, 8: 1, 10: 3, 14: 1, 15: 2, 20: 1, 21: 3, 22: 2, 23: 1
};

export const calendarSessions: Record<number, string[]> = {
  2: ["📖 Leesvaardigheid · 3/3", "✅ Woordenschattoets · 8/10", "✏️ Schrijfvaardigheid"],
  6: ["✅ Woordenschattoets · 9/10", "📖 Leesvaardigheid · 3/3", "✏️ Schrijfvaardigheid"],
  10: ["📖 Leesvaardigheid · 2/3"],
  14: ["✅ Woordenschattoets · 7/10"],
  21: ["📖 Leesvaardigheid · 3/3", "✅ Woordenschattoets · 10/10", "✏️ Schrijfvaardigheid"]
};

export const practiceCards = [
  { id: "woordenschat", title: "Woordenschat", copy: "Oefen en herhaal je woordparen.", icon: "🧠" },
  { id: "leesvaardigheid", title: "Leesvaardigheid", copy: "Lees korte teksten en beantwoord vragen.", icon: "📖" },
  { id: "schrijfvaardigheid", title: "Schrijfvaardigheid", copy: "Schrijfopdrachten met directe feedback.", icon: "✍️" }
];
