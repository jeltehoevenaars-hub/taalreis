import { defaultChapters, defaultSettings } from "@/lib/default-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { BootData, JourneyChapter, UserSettings } from "@/lib/types";

type ChapterRow = {
  id: string;
  chapter_number: string;
  title: string;
  subtitle: string | null;
  progress_percent: number;
  total_words: number;
  is_done: boolean;
  is_active: boolean;
  sort_order: number;
};

type ProfileRow = {
  full_name: string | null;
  avatar_url: string | null;
  interface_language: "nl" | "en" | null;
  level: string | null;
  notifications_enabled: boolean | null;
};

function mapChapter(row: ChapterRow): JourneyChapter {
  return {
    id: row.id,
    n: row.chapter_number,
    title: row.title,
    subtitle: row.subtitle ?? "",
    prog: row.progress_percent,
    total: row.total_words,
    done: row.is_done,
    active: row.is_active,
    sortOrder: row.sort_order
  };
}

function mapSettings(row?: ProfileRow | null): UserSettings {
  return {
    level: row?.level ?? defaultSettings.level,
    interfaceLanguage: row?.interface_language ?? defaultSettings.interfaceLanguage,
    notificationsEnabled:
      row?.notifications_enabled ?? defaultSettings.notificationsEnabled
  };
}

async function seedDefaultChapters(userId: string) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return defaultChapters;
  }

  const seededChapters = defaultChapters.map((chapter, index) => ({
    ...chapter,
    id: `${userId}-${String(index + 1).padStart(2, "0")}`
  }));

  await supabase.from("journey_chapters").upsert(
    seededChapters.map((chapter, index) => ({
      id: chapter.id,
      user_id: userId,
      chapter_number: chapter.n,
      title: chapter.title,
      subtitle: chapter.subtitle,
      progress_percent: chapter.prog,
      total_words: chapter.total,
      is_done: Boolean(chapter.done),
      is_active: Boolean(chapter.active),
      sort_order: index + 1
    })),
    { onConflict: "id" }
  );

  return seededChapters;
}

export async function getBootData(): Promise<BootData> {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return {
      initialUser: null,
      initialChapters: defaultChapters,
      initialSettings: defaultSettings,
      supabaseEnabled: false
    };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      initialUser: null,
      initialChapters: defaultChapters,
      initialSettings: defaultSettings,
      supabaseEnabled: true
    };
  }

  const profilePromise = supabase
    .from("profiles")
    .select("full_name, avatar_url, interface_language, level, notifications_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  let { data: chaptersData, error: chaptersError } = await supabase
    .from("journey_chapters")
    .select(
      "id, chapter_number, title, subtitle, progress_percent, total_words, is_done, is_active, sort_order"
    )
    .eq("user_id", user.id)
    .order("sort_order");

  if (chaptersError && chaptersError.message.toLowerCase().includes("subtitle")) {
    const legacyResult = await supabase
      .from("journey_chapters")
      .select(
        "id, chapter_number, title, progress_percent, total_words, is_done, is_active, sort_order"
      )
      .eq("user_id", user.id)
      .order("sort_order");
    chaptersData = legacyResult.data as ChapterRow[] | null;
    chaptersError = legacyResult.error;
  }

  const { data: profileData } = await profilePromise;

  let chapters: JourneyChapter[] = defaultChapters;

  if (!chaptersError && chaptersData && chaptersData.length > 0) {
    chapters = chaptersData.map(mapChapter);
  } else {
    chapters = await seedDefaultChapters(user.id);
  }

  return {
    initialUser: {
      name:
        profileData?.full_name ??
        user.user_metadata.full_name ??
        user.email?.split("@")[0] ??
        "Reiziger",
      email: user.email ?? "",
      avatarUrl: profileData?.avatar_url ?? null
    },
    initialChapters: chapters,
    initialSettings: mapSettings(profileData),
    supabaseEnabled: true
  };
}
