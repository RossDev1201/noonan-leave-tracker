import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { fetchLogins } from "./googleSheets";

type AppUser = {
  id: string;
  username: string;
  password: string;
  role: "admin" | "member";
  employeeId?: string;
};

// Fallback: load users from env vars (used in local dev when sheet is unavailable)
function loadUsersFromEnv(): AppUser[] {
  const users: AppUser[] = [];

  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    users.push({
      id: "admin",
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
      role: "admin",
    });
  }

  for (let i = 1; i <= 50; i++) {
    const username = process.env[`MEMBER${i}_USERNAME`];
    const password = process.env[`MEMBER${i}_PASSWORD`];
    const employeeId = process.env[`MEMBER${i}_EMPLOYEE_ID`];
    if (!username || !password) break;
    users.push({
      id: employeeId ?? `member${i}`,
      username,
      password,
      role: "member",
      employeeId,
    });
  }

  return users;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // Primary: read users from the Google Sheet "Logins" tab
        try {
          const sheetUsers = await fetchLogins();
          if (sheetUsers.length > 0) {
            const found = sheetUsers.find(
              (u) => u.username === credentials.username && u.password === credentials.password
            );
            if (!found) return null;
            return {
              id: found.employeeId ?? found.username,
              name: found.username,
              role: found.role,
              employeeId: found.employeeId,
            };
          }
        } catch {
          // Sheet unavailable — fall through to env vars
        }

        // Fallback: env vars (local dev)
        const envUsers = loadUsersFromEnv();
        const found = envUsers.find(
          (u) => u.username === credentials.username && u.password === credentials.password
        );
        if (!found) return null;
        return {
          id: found.id,
          name: found.username,
          role: found.role,
          employeeId: found.employeeId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as AppUser).role;
        token.employeeId = (user as AppUser).employeeId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as AppUser).role = token.role as "admin" | "member";
        (session.user as AppUser).employeeId = token.employeeId as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
