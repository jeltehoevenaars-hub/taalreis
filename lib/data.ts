import { cookies } from "next/headers";

import { defaultChapters, defaultSettings } from "@/lib/default-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { BootData, JourneyChapter, UserSettings } from "@/lib/types";

const ACTIVE_PROFILE_COOKIE = "taalreis_active_profile_id";

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

type ProfileSettingsRow = {
  full_name: string | null;
  avatar_url: string | null;
  interface_language: "nl" | "en" | null;
  level: string | null;
  notifications_enabled: boolean | null;
};

type AccountProfile = { id: string; name: string; slug: string; is_default: boolean };

function mapChapter(row: ChapterRow): JourneyChapter { return { id: row.id, n: row.chapter_number, title: row.title, subtitle: row.subtitle ?? "", prog: row.progress_percent, total: row.total_words, done: row.is_done, active: row.is_active, sortOrder: row.sort_order }; }
function mapSettings(row?: ProfileSettingsRow | null): UserSettings { return { level: row?.level ?? defaultSettings.level, interfaceLanguage: row?.interface_language ?? defaultSettings.interfaceLanguage, notificationsEnabled: row?.notifications_enabled ?? defaultSettings.notificationsEnabled }; }

export async function resolveActiveProfile(userId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const cookieStore = await cookies();
  const cookieProfileId = cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value?.trim() || null;

  const { data: dbState } = await supabase.from("account_profile_state").select("active_profile_id").eq("user_id", userId).maybeSingle();
  if (dbState?.active_profile_id) {
    cookieStore.set(ACTIVE_PROFILE_COOKIE, dbState.active_profile_id, { path: "/", httpOnly: true, sameSite: "lax" });
    return dbState.active_profile_id;
  }

  if (cookieProfileId) {
    const { data: owned } = await supabase.from("account_profiles").select("id").eq("id", cookieProfileId).eq("user_id", userId).maybeSingle();
    if (owned?.id) {
      await supabase.from("account_profile_state").upsert({ user_id: userId, active_profile_id: cookieProfileId }, { onConflict: "user_id" });
      return cookieProfileId;
    }
  }

  const { data: fallback } = await supabase.from("account_profiles").select("id").eq("user_id", userId).order("is_default", { ascending: false }).limit(1).maybeSingle();
  if (!fallback?.id) return null;
  await supabase.from("account_profile_state").upsert({ user_id: userId, active_profile_id: fallback.id }, { onConflict: "user_id" });
  cookieStore.set(ACTIVE_PROFILE_COOKIE, fallback.id, { path: "/", httpOnly: true, sameSite: "lax" });
  return fallback.id;
}

async function seedDefaultChapters(userId: string, profileId: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return defaultChapters;
  const seeded = defaultChapters.map((chapter, index) => ({ ...chapter, id: `${profileId}-${String(index + 1).padStart(2, "0")}` }));
  await supabase.from("journey_chapters").upsert(seeded.map((chapter, index) => ({ id: chapter.id, user_id: userId, profile_id: profileId, chapter_number: chapter.n, title: chapter.title, subtitle: chapter.subtitle, progress_percent: chapter.prog, total_words: chapter.total, is_done: Boolean(chapter.done), is_active: Boolean(chapter.active), sort_order: index + 1 })), { onConflict: "profile_id,sort_order" });
  return seeded;
}

export async function getBootData(): Promise<BootData> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { initialUser: null, initialChapters: defaultChapters, initialSettings: defaultSettings, supabaseEnabled: false, profiles: [], activeProfileId: null };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { initialUser: null, initialChapters: defaultChapters, initialSettings: defaultSettings, supabaseEnabled: true, profiles: [], activeProfileId: null };

  const profilePromise = supabase.from("profiles").select("full_name, avatar_url, interface_language, level, notifications_enabled").eq("user_id", user.id).maybeSingle();
  const { data: profileData } = await profilePromise;
  const baseName = (profileData?.full_name ?? user.user_metadata.full_name ?? user.email?.split("@")[0] ?? "Reiziger").trim() || "Reiziger";

  const { data: existingProfiles } = await supabase.from("account_profiles").select("id, name, slug, is_default").eq("user_id", user.id).order("created_at", { ascending: true });
  let profiles: AccountProfile[] = (existingProfiles ?? []) as AccountProfile[];
  if (profiles.length === 0) {
    const { data: createdProfile } = await supabase
      .from("account_profiles")
      .insert({ user_id: user.id, name: `${baseName}/1`, slug: `${baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "profiel"}-1`, is_default: true })
      .select("id, name, slug, is_default")
      .single();
    if (createdProfile) {
      profiles = [createdProfile as AccountProfile];
      await supabase.from("account_profile_state").upsert({ user_id: user.id, active_profile_id: createdProfile.id }, { onConflict: "user_id" });
      await seedDefaultChapters(user.id, createdProfile.id);
    }
  }

  const activeProfileId = await resolveActiveProfile(user.id);

  let chaptersData: ChapterRow[] | null = null;
  let chaptersError: Error | null = null;
  if (activeProfileId) {
    const chapterResult = await supabase.from("journey_chapters").select("id, chapter_number, title, subtitle, progress_percent, total_words, is_done, is_active, sort_order").eq("user_id", user.id).eq("profile_id", activeProfileId).order("sort_order");
    chaptersData = chapterResult.data as ChapterRow[] | null;
    chaptersError = chapterResult.error as Error | null;
  }

  let chapters: JourneyChapter[] = defaultChapters;
  if (activeProfileId && !chaptersError && chaptersData && chaptersData.length > 0) chapters = chaptersData.map(mapChapter);
  else if (activeProfileId) chapters = await seedDefaultChapters(user.id, activeProfileId);

  return { initialUser: { name: profileData?.full_name ?? user.user_metadata.full_name ?? user.email?.split("@")[0] ?? "Reiziger", email: user.email ?? "", avatarUrl: profileData?.avatar_url ?? null }, initialChapters: chapters, initialSettings: mapSettings(profileData), supabaseEnabled: true, profiles, activeProfileId };
}
