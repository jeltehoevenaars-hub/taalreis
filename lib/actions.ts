"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppUser, JourneyChapter, UserSettings } from "@/lib/types";

type ActionResult<T> = {
  data?: T;
  error?: string;
};

type GeneratedReadingQuestion = {
  type: "meerkeuze" | "open";
  question: string;
  options?: string[];
  correctAnswer: string;
};

type GeneratedReadingContent = {
  storyTitle: string;
  story: string;
  questions: GeneratedReadingQuestion[];
};

export async function addChapterAction(input: {
  title: string;
  insertAfterIndex: number;
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

  const next = [...input.chapters];
  const insertAt = input.insertAfterIndex + 1;
  next.splice(insertAt, 0, {
    id: crypto.randomUUID(),
    n: "",
    title: input.title.trim(),
    prog: 0,
    total: 0,
    sortOrder: insertAt + 1
  });

  const normalized = next.map((chapter, index) => ({
    ...chapter,
    n: String(index + 1).padStart(2, "0"),
    sortOrder: index + 1,
    active: chapter.active ?? false,
    done: chapter.done ?? false
  }));

  const { error } = await supabase.from("journey_chapters").upsert(
    normalized.map((chapter) => ({
      id: chapter.id,
      user_id: user.id,
      chapter_number: chapter.n,
      title: chapter.title,
      progress_percent: chapter.prog,
      total_words: chapter.total,
      is_done: Boolean(chapter.done),
      is_active: Boolean(chapter.active),
      sort_order: chapter.sortOrder
    })),
    { onConflict: "user_id,id" }
  );

  if (error) {
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
    .filter(([spanish, dutch]) => spanish.length > 0 && dutch.length > 0);

  if (cleanedRows.length === 0) {
    return { error: "Je woordenlijst is leeg. Voeg eerst woorden toe voordat je een verhaal genereert." };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return { error: "OPENAI_API_KEY ontbreekt op de server." };
  }

  const totalQuestions = input.durationMinutes <= 5 ? 4 : input.durationMinutes <= 10 ? 6 : input.durationMinutes <= 15 ? 8 : 10;
  const vocabSelection = cleanedRows.slice(0, Math.min(20, cleanedRows.length));

  const prompt = [
    "Maak een Spaanse leesvaardigheidstoets voor een Nederlandse leerling.",
    `Hoofdstuk: ${input.chapterLabel}`,
    `Niveau: ${input.level}`,
    `Aantal vragen: ${totalQuestions}`,
    "Gebruik alleen woorden uit deze lijst als focus (Spaans -> Nederlands):",
    ...vocabSelection.map(([sp, nl]) => `- ${sp} -> ${nl}`),
    "Geef ALLEEN geldige JSON met precies dit schema:",
    '{"storyTitle":"string","story":"string","questions":[{"type":"meerkeuze|open","question":"string","options":["string"],"correctAnswer":"string"}]}',
    "Regels:",
    "- story en vragen moeten in het Spaans/Nederlands passen bij het opgegeven niveau.",
    "- Meerkeuzevragen moeten exact 4 opties hebben.",
    "- Open vragen mogen geen options veld hebben.",
    "- correctAnswer moet ingevuld zijn voor elke vraag.",
    `- Lever exact ${totalQuestions} vragen.`
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
                      type: { type: "string", enum: ["meerkeuze", "open"] },
                      question: { type: "string" },
                      options: {
                        type: "array",
                        items: { type: "string" }
                      },
                      correctAnswer: { type: "string" }
                    },
                    required: ["type", "question", "options", "correctAnswer"]
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

    const normalizedQuestions: GeneratedReadingQuestion[] = parsed.questions.map((q) => {
      if (q.type === "open") {
        return {
          type: "open",
          question: q.question?.trim() ?? "",
          correctAnswer: q.correctAnswer?.trim() ?? ""
        };
      }

      return {
        type: "meerkeuze",
        question: q.question?.trim() ?? "",
        options: (q.options ?? []).map((option) => option.trim()).filter((option) => option.length > 0),
        correctAnswer: q.correctAnswer?.trim() ?? ""
      };
    });

    const invalidMcq = normalizedQuestions.find((question) => {
      if (question.type !== "meerkeuze") return false;
      return !question.options || question.options.length !== 4;
    });

    if (invalidMcq) {
      return { error: "OpenAI gaf een meerkeuzevraag zonder precies 4 antwoordopties." };
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
