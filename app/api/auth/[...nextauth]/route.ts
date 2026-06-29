import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"

process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || "https://taxsnap-jet.vercel.app"

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }