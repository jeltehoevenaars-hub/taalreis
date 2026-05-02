"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { JourneyChapter, UserSettings } from "@/lib/types";

type ActionResult<T> = {
  data?: T;
  error?: string;
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
    { onConflict: "id" }
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
