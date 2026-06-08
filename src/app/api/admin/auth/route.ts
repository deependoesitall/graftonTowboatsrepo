// src/app/api/admin/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const adminPassword = process.env.ADMIN_PASSWORD || 'grafton2024';
  if (password !== adminPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  // Return the secret key as the session token
  return NextResponse.json({
    token: process.env.ADMIN_SECRET_KEY || 'grafton-admin-secret',
  });
}
