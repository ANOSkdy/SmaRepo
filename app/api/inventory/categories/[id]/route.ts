import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function PATCH() {
  return NextResponse.json({ error: 'MACHINE_BACKED_READ_ONLY' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'MACHINE_BACKED_READ_ONLY' }, { status: 405 });
}
