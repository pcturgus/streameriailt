import { prisma } from "@/lib/db";

// Įrašo administratoriaus veiksmą į žurnalą (klaida niekada nestabdo paties veiksmo)
export async function logAdmin(admin: { id: string; displayName: string }, action: string, target: string) {
  try {
    await prisma.adminLog.create({
      data: { adminId: admin.id, adminName: admin.displayName, action, target: target.slice(0, 300) },
    });
  } catch {
    /* žurnalas neprivalomas */
  }
}
