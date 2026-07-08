import { auth, currentUser } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export async function getCurrentUser() {
  const { userId } = await auth()
  if (!userId) return null

  const existing = await prisma.user.findUnique({ where: { id: userId } })
  if (existing) {
    if (existing.email === process.env.OWNER_EMAIL && !existing.isOwner) {
      return prisma.user.update({
        where: { id: userId },
        data: { isOwner: true, plan: "OWNER" },
      })
    }
    return existing
  }

  const cu = await currentUser()
  const email = cu?.emailAddresses?.[0]?.emailAddress ?? null
  const name = cu ? [cu.firstName, cu.lastName].filter(Boolean).join(" ") || null : null
  const isOwner = !!email && email === process.env.OWNER_EMAIL

  return prisma.user.create({
    data: {
      id: userId,
      email,
      name,
      image: cu?.imageUrl ?? null,
      isOwner,
      plan: isOwner ? "OWNER" : "FREE",
    },
  })
}
