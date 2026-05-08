"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppUser, JourneyChapter, UserSettings } from "@/lib/types";

type ActionResult<T> = {
  data?: T;
  error?: string;
};

type GeneratedReadingQuestion = {
  type: "open";
  question: string;
  options?: string[];
  correctAnswer: string;
};

type GeneratedReadingContent = {
  storyTitle: string;
  story: string;
  questions: GeneratedReadingQuestion[];
};

export async function saveChaptersAction(input: {
  chapters: JourneyChapter[];
}): Promise<ActionResult<JourneyChapter[]>> {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return { error: "Supabase is niet geconfigureerd." };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Je sessie is verlopen. Log opnieuw in." };
  }

  const normalized = input.chapters.map((chapter, index) => ({
    ...chapter,
    n: String(index + 1).padStart(2, "0"),
    sortOrder: index + 1,
    title: chapter.title.trim(),
    subtitle: (chapter.subtitle ?? "").trim(),
    active: chapter.active ?? false,
    done: chapter.done ?? false
  }));

  const rowsWithSubtitle = normalized.map((chapter) => ({
    id: chapter.id,
    user_id: user.id,
    chapter_number: chapter.n,
    title: chapter.title,
    subtitle: chapter.subtitle,
    progress_percent: chapter.prog,
    total_words: chapter.total,
    is_done: Boolean(chapter.done),
    is_active: Boolean(chapter.active),
    sort_order: chapter.sortOrder
  }));

  const upsertRows = async (withSubtitle: boolean) => {
    const payload = withSubtitle
      ? rowsWithSubtitle
      : rowsWithSubtitle.map(({ subtitle: _subtitle, ...legacy }) => legacy);
    return supabase.from("journey_chapters").upsert(payload, {
      onConflict: "user_id,sort_order"
    });
  };

  const { error: upsertError } = await upsertRows(true);

  if (upsertError && upsertError.message.toLowerCase().includes("subtitle")) {
    const { error: legacyUpsertError } = await upsertRows(false);
    if (legacyUpsertError) {
      return { error: "Opslaan van het hoofdstuk is niet gelukt." };
    }
  } else if (upsertError) {
    return { error: "Opslaan van het hoofdstuk is niet gelukt." };
  }

  const chapterIds = normalized.map((chapter) => chapter.id);
  const { error: cleanupError } = await supabase
    .from("journey_chapters")
    .delete()
    .eq("user_id", user.id)
    .not("id", "in", `(${chapterIds.map((id) => `\"${id}\"`).join(",")})`);

  if (cleanupError) {
    return { error: "Opslaan van het hoofdstuk is niet gelukt." };
  }

  revalidatePath("/");
  return { data: normalized };
}

export async function saveSettingsAction(
  settings: UserSettings
): Promise<ActionResult<UserSettings>> {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return { error: "Supabase is niet geconfigureerd." };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Je sessie is verlopen. Log opnieuw in." };
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      full_name: user.user_metadata.full_name ?? user.email?.split("@")[0] ?? "Reiziger",
      interface_language: settings.interfaceLanguage,
      level: settings.level,
      notifications_enabled: settings.notificationsEnabled
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return { error: "Instellingen opslaan is niet gelukt." };
  }

  revalidatePath("/");
  return { data: settings };
}

export async function signOutAction(): Promise<ActionResult<true>> {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return { data: true };
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    return { error: "Uitloggen is niet gelukt." };
  }

  revalidatePath("/");
  return { data: true };
}

export async function generateReadingContentAction(input: {
  chapterLabel: string;
  level: string;
  durationMinutes: number;
  rows: string[][];
}): Promise<ActionResult<GeneratedReadingContent>> {
  const cleanedRows = input.rows
    .map((row) => [(row[0] ?? "").trim(), (row[1] ?? "").trim()] as [string, string])
    .filter(([sourceWord, dutch]) => sourceWord.length > 0 && dutch.length > 0);

  if (cleanedRows.length === 0) {
    return { error: "Je woordenlijst is leeg. Voeg eerst woorden toe voordat je een verhaal genereert." };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return { error: "OPENAI_API_KEY ontbreekt op de server." };
  }

  const totalQuestions = input.durationMinutes <= 5 ? 4 : input.durationMinutes <= 10 ? 6 : input.durationMinutes <= 15 ? 8 : 10;
  const storyLengthInstruction = input.durationMinutes <= 5
    ? "Schrijf een tekst van ongeveer 675-825 woorden (uitgaande van ±150 woorden per minuut en 5 minuten leestijd)."
    : input.durationMinutes <= 10
      ? "Schrijf een tekst van ongeveer 1350-1650 woorden (uitgaande van ±150 woorden per minuut en 10 minuten leestijd)."
      : input.durationMinutes <= 15
        ? "Schrijf een tekst van ongeveer 2025-2475 woorden (uitgaande van ±150 woorden per minuut en 15 minuten leestijd)."
        : "Schrijf een uitgebreide tekst van ongeveer 2700-3300 woorden (uitgaande van ±150 woorden per minuut en 20+ minuten leestijd).";
  const vocabSelection = cleanedRows.slice(0, Math.min(20, cleanedRows.length));

  const prompt = [
    "Maak een Spaanse leestekst met Nederlandstalige open vragen voor een Nederlandse leerling.",
    `Hoofdstuk: ${input.chapterLabel}`,
    `Niveau: ${input.level}`,
    `Doelduur: ${input.durationMinutes} minuten`,
    `Aantal vragen: ${totalQuestions}`,
    storyLengthInstruction,
    "Gebruik deze woordparen als inhoudelijke inspiratie voor de Spaanse tekst (bronwoord -> Nederlandse betekenis):",
    ...vocabSelection.map(([sourceWord, dutchMeaning]) => `- ${sourceWord} -> ${dutchMeaning}`),
    "Geef ALLEEN geldige JSON met precies dit schema:",
    '{"storyTitle":"string","story":"string","questions":[{"type":"open","question":"string","correctAnswer":"string"}]}',
    "Regels:",
    "- story moet volledig in het Spaans zijn en passen bij het opgegeven niveau.",
    "- vragen en correctAnswer moeten volledig in het Nederlands zijn.",
    "- Genereer uitsluitend open vragen (type: open).",
    "- Gebruik geen meerkeuzevragen en geen options veld.",
    "- correctAnswer moet ingevuld zijn voor elke vraag.",
    `- Lever exact ${totalQuestions} vragen.`,
    "- Houd de verhaaltekst binnen de gevraagde woordlengtebandbreedte."
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "generated_reading_content",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                storyTitle: { type: "string" },
                story: { type: "string" },
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      type: { type: "string", enum: ["open"] },
                      question: { type: "string" },
                      correctAnswer: { type: "string" }
                    },
                    required: ["type", "question", "correctAnswer"]
                  }
                }
              },
              required: ["storyTitle", "story", "questions"]
            },
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      return { error: `OpenAI fout (${response.status}): ${body.slice(0, 220)}` };
    }

    const json = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        content?: Array<{
          type?: string;
          text?: string;
        }>;
      }>;
    };
    const outputFromText = json.output_text?.trim();
    const outputFromContent = json.output
      ?.flatMap((item) => item.content ?? [])
      .find((contentItem) => contentItem.type === "output_text" && typeof contentItem.text === "string")
      ?.text?.trim();
    const output = outputFromText || outputFromContent;
    if (!output) {
      return { error: "OpenAI gaf geen tekst terug." };
    }

    let parsed: GeneratedReadingContent;
    try {
      parsed = JSON.parse(output) as GeneratedReadingContent;
    } catch {
      return {
        error: `OpenAI output kon niet als JSON geparsed worden. Eerste 120 chars: ${output.slice(0, 120)}`
      };
    }
    if (!parsed.story || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return { error: "OpenAI response had een ongeldig formaat." };
    }

    if (parsed.questions.length !== totalQuestions) {
      return { error: `OpenAI gaf ${parsed.questions.length} vragen terug, maar ${totalQuestions} zijn vereist.` };
    }

    const normalizedQuestions: GeneratedReadingQuestion[] = parsed.questions.map((q) => ({
      type: "open",
      question: q.question?.trim() ?? "",
      correctAnswer: q.correctAnswer?.trim() ?? ""
    }));

    const hasInvalidType = parsed.questions.some((question) => question.type !== "open");
    if (hasInvalidType) {
      return { error: "OpenAI gaf een niet-open vraag terug. Alleen open vragen zijn toegestaan." };
    }

    return {
      data: {
        storyTitle: parsed.storyTitle?.trim() || `Leesvaardigheid · ${input.chapterLabel}`,
        story: parsed.story.trim(),
        questions: normalizedQuestions
      }
    };
  } catch {
    return { error: "OpenAI aanroep mislukt. Controleer je API-configuratie en probeer opnieuw." };
  }
}

export async function saveProfileAction(input: {
  name: string;
  avatarUrl: string;
}): Promise<ActionResult<AppUser>> {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return { error: "Supabase is niet geconfigureerd." };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Je sessie is verlopen. Log opnieuw in." };
  }

  const cleanedName = input.name.trim() || "Reiziger";
  const cleanedAvatar = input.avatarUrl.trim();

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      full_name: cleanedName,
      avatar_url: cleanedAvatar || null
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return { error: "Profiel opslaan is niet gelukt." };
  }

  revalidatePath("/");
  return {
    data: {
      name: cleanedName,
      email: user.email ?? "",
      avatarUrl: cleanedAvatar || null
    }
  };
}
