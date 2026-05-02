import { TaalreisApp } from "@/components/taalreis-app";
import { getBootData } from "@/lib/data";

export default async function HomePage() {
  const bootData = await getBootData();
  return <TaalreisApp {...bootData} />;
}
