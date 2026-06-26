import fs from 'node:fs';
import path from 'node:path';
import { getCareerOpsRoot } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const root = getCareerOpsRoot();
  const safe = path.basename(params.name);
  const filePath = path.join(root, 'output', safe);
  if (!filePath.startsWith(path.join(root, 'output'))) {
    return new Response('forbidden', { status: 403 });
  }
  if (!fs.existsSync(filePath)) {
    return new Response('not found', { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  return new Response(buf, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${safe}"`,
    },
  });
}
