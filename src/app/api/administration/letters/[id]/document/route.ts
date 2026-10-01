/**
 * GET /api/administration/letters/:id/document — Generate digital letter document (HTML).
 *
 * Returns an HTML page with official letter template that can be printed/saved as PDF.
 * Includes QR code (via external service) and registration number.
 *
 * @see Requirements 13.3
 * @see Requirements 2.1, 2.2, 2.3 — Route Handler withPermission Migration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@prisma/client';

const letterTemplates: Record<string, { title: string; header: string }> = {
  surat_pengantar: {
    title: 'SURAT PENGANTAR',
    header: 'Surat Pengantar',
  },
  domisili: {
    title: 'SURAT KETERANGAN DOMISILI',
    header: 'Surat Keterangan Domisili',
  },
  SKTM: {
    title: 'SURAT KETERANGAN TIDAK MAMPU',
    header: 'Surat Keterangan Tidak Mampu (SKTM)',
  },
};

/**
 * Handler for GET /api/administration/letters/[id]/document
 * Downloads/generates the letter document.
 *
 * Permission: admin:read (download letter document)
 */
const handleGetLetterDocument: AuthorizedRouteHandler = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Missing id parameter',
        correlationId,
      },
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const letter = await prisma.letterRequest.findFirst({
      where: { id, tenantId: authContext.tenantId, status: 'approved' },
    });

    if (!letter) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Approved letter not found', correlationId },
        { status: 404 },
      );
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: letter.userId },
      select: { name: true, email: true },
    });

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: authContext.tenantId },
      select: { name: true, rtRwNumber: true, region: true, address: true },
    });

    const template = letterTemplates[letter.letterType] ?? { title: 'SURAT', header: 'Surat' };
    const regNumber = `${letter.letterType.toUpperCase().replace('_', '')}-${id.slice(0, 8).toUpperCase()}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`https://societ-rt.com/verify/${id}`)}`;
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${template.header} - ${regNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; padding: 40px 60px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 3px double #000; padding-bottom: 15px; margin-bottom: 20px; }
    .header h1 { font-size: 14pt; margin-bottom: 2px; }
    .header h2 { font-size: 16pt; margin-bottom: 5px; }
    .header p { font-size: 10pt; }
    .title { text-align: center; margin: 30px 0 20px; }
    .title h3 { font-size: 14pt; text-decoration: underline; }
    .title p { font-size: 10pt; }
    .content { margin: 20px 0; text-align: justify; }
    .content p { margin-bottom: 10px; }
    .signature { margin-top: 50px; text-align: right; }
    .signature .name { margin-top: 60px; font-weight: bold; text-decoration: underline; }
    .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #ccc; padding-top: 15px; }
    .qr { text-align: center; }
    .qr img { width: 100px; height: 100px; }
    .qr p { font-size: 8pt; color: #666; }
    .reg-number { font-size: 9pt; color: #666; }
    @media print { body { padding: 20px 40px; } .no-print { display: none; } }
    .print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .print-btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Cetak / Save PDF</button>

  <div class="header">
    <h1>RUKUN TETANGGA / RUKUN WARGA</h1>
    <h2>${tenant?.name ?? 'RT/RW'}</h2>
    <p>${tenant?.rtRwNumber ?? ''} | ${tenant?.region ?? ''}</p>
    <p>${tenant?.address ?? ''}</p>
  </div>

  <div class="title">
    <h3>${template.title}</h3>
    <p>Nomor: ${regNumber}</p>
  </div>

  <div class="content">
    <p>Yang bertanda tangan di bawah ini, Ketua RT/RW ${tenant?.rtRwNumber ?? ''}, ${tenant?.region ?? ''}, dengan ini menerangkan bahwa:</p>
    
    <table style="margin: 15px 0 15px 30px;">
      <tr><td style="width: 120px;">Nama</td><td>: ${user?.name ?? '-'}</td></tr>
      <tr><td>Email</td><td>: ${user?.email ?? '-'}</td></tr>
    </table>

    <p>Adalah benar warga kami yang berdomisili di wilayah RT/RW kami.</p>
    
    <p><strong>Keperluan:</strong> ${letter.purpose}</p>

    <p>Demikian surat ini dibuat untuk dapat dipergunakan sebagaimana mestinya.</p>
  </div>

  <div class="signature">
    <p>${tenant?.region ?? ''}, ${today}</p>
    <p>Ketua RT/RW ${tenant?.rtRwNumber ?? ''}</p>
    <p class="name">_________________________</p>
  </div>

  <div class="footer">
    <div class="reg-number">
      <p>Reg: ${regNumber}</p>
      <p>Diterbitkan: ${today}</p>
      <p>Dokumen ini sah secara digital</p>
    </div>
    <div class="qr">
      <img src="${qrUrl}" alt="QR Code Verifikasi" />
      <p>Scan untuk verifikasi</p>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Exports with withPermission wrapper
// ---------------------------------------------------------------------------

/**
 * GET /api/administration/letters/[id]/document
 * Permission: admin:read — Download letter document
 */
export const GET = withPermission(
  { permissions: ['admin:read'] },
  handleGetLetterDocument,
);
