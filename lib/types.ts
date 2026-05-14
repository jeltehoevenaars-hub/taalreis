export type Screen = "Login" | "Reiskaart" | "Bibliotheek" | "Kalender" | "Instellingen";

export type JourneyChapter = {
  id: string;
  n: string;
  title: string;
  subtitle: string;
  prog: number;
  total: number;
  done?: boolean;
  active?: boolean;
  sortOrder: number;
};

export type AppUser = {
  name: string;
  email: string;
  avatarUrl?: string | null;
};

export type AccountProfile = {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
};

export type UserSettings = {
  level: string;
  interfaceLanguage: "nl" | "en";
  notificationsEnabled: boolean;
};

export type BootData = {
  initialUser: AppUser | null;
  initialChapters: JourneyChapter[];
  initialSettings: UserSettings;
  supabaseEnabled: boolean;
  profiles: AccountProfile[];
  activeProfileId: string | null;
};
