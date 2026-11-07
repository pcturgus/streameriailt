import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin – Streameriai.Lt", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const user = await currentUser();
  if (!user?.isAdmin) redirect("/");
  return <AdminClient name={user.displayName} />;
}
