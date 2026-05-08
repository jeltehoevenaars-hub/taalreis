import type { JourneyChapter, UserSettings } from "@/lib/types";

export const defaultChapters: JourneyChapter[] = [
  {
    id: "default-01",
    n: "01",
    title: "Nieuw hoofdstuk",
    subtitle: "Klik om titel en subtitel aan te passen",
    prog: 0,
    total: 0,
    active: true,
    sortOrder: 1
  }
];

export const defaultSettings: UserSettings = {
  level: "B1",
  interfaceLanguage: "nl",
  notificationsEnabled: true
};
