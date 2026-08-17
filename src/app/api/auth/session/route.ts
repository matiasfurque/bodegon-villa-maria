import { currentUser } from "@/lib/auth";
import { json } from "@/lib/api";

export async function GET() {
  const user = await currentUser();
  return json({ user });
}
