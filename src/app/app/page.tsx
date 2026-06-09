import type { Metadata } from "next";
import { Workspace } from "@/components/app/Workspace";

export const metadata: Metadata = {
  title: "Dictum — Workspace",
  description: "Dictate locally with Whisper. Your audio never leaves the device.",
};

export default function AppPage() {
  return <Workspace />;
}
