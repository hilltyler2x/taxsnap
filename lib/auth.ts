import GoogleProvider from "next-auth/providers/google"
import AzureADProvider from "next-auth/providers/azure-ad"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import type { NextAuthOptions } from "next-auth"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID ?? "common",
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { plan: true, isOwner: true },
        })
        ;(session.user as any).plan = dbUser?.plan ?? "FREE"
        ;(session.user as any).isOwner = dbUser?.isOwner ?? false

        if (user.email === process.env.OWNER_EMAIL && !dbUser?.isOwner) {
          await prisma.user.update({
            where: { id: user.id },
            data: { isOwner: true, plan: "OWNER" as any },
          })
          ;(session.user as any).isOwner = true
          ;(session.user as any).plan = "OWNER"
        }
      }
      return session
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "database" },
}
