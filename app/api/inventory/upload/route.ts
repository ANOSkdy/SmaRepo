import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'BLOB_TOKEN_MISSING' }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'INVALID_FORM_DATA' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'UNSUPPORTED_FILE_TYPE' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 400 });
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const pathname = `inventory/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  try {
    const uploadResponse = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': file.type,
        'x-content-type': file.type,
        'x-add-random-suffix': '0',
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      return NextResponse.json({ error: 'BLOB_UPLOAD_FAILED' }, { status: 502 });
    }

    const uploaded = (await uploadResponse.json()) as { url?: string; pathname?: string };
    if (!uploaded.url || !uploaded.pathname) {
      return NextResponse.json({ error: 'BLOB_UPLOAD_INVALID_RESPONSE' }, { status: 502 });
    }

    return NextResponse.json({ url: uploaded.url, path: uploaded.pathname });
  } catch {
    return NextResponse.json({ error: 'BLOB_UPLOAD_FAILED' }, { status: 502 });
  }
}
