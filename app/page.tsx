import { existsSync } from "node:fs";
import { join } from "node:path";
import Ceremony from "@/components/Ceremony";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Ceremony audioAvailable={existsSync(join(process.cwd(), "public/draw-music.mp3"))} />;
}
