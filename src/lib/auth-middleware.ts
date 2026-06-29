import { NextRequest } from "next/server";
import { verifyToken, getTokenFromHeaders } from "./auth";
import { db } from "./db";

export async function getAuthenticatedUser(request: NextRequest) {
  const token = getTokenFromHeaders(request.headers);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true, avatar: true },
  });

  return user;
}
