import type { JourneyChapter, UserSettings } from "@/lib/types";

export const defaultChapters: JourneyChapter[] = [
  {
    id: "default-01",
    n: "01",
    title: "In het restaurant",
    prog: 72,
    total: 20,
    done: true,
    sortOrder: 1
  },
  {
    id: "default-02",
    n: "02",
    title: "Op het vliegveld",
    prog: 38,
    total: 20,
    active: true,
    sortOrder: 2
  },
  {
    id: "default-03",
    n: "03",
    title: "Stadsvervoer",
    prog: 0,
    total: 18,
    sortOrder: 3
  },
  {
    id: "default-04",
    n: "04",
    title: "Winkelen",
    prog: 0,
    total: 15,
    sortOrder: 4
  }
];

export const defaultSettings: UserSettings = {
  level: "B1",
  interfaceLanguage: "nl",
  notificationsEnabled: true
};
