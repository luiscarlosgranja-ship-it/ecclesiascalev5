import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Scale, Cult } from '../types';

// ─── Busca logo salvo no servidor ─────────────────────────────────────────────
async function fetchLogo(): Promise<string | null> {
  try {
    const res = await fetch('/api/settings/logo');
    if (!res.ok) return null;
    const data = await res.json();
    return data.logo || null;
  } catch {
    return null;
  }
}

// ─── Desenha cabeçalho com logo + título ──────────────────────────────────────
async function drawHeader(doc: jsPDF, title: string, subtitle?: string): Promise<number> {
  const logo = await fetchLogo();
  const pageW = doc.internal.pageSize.getWidth();
  let cursorY = 14;

  if (logo) {
    try {
      const format = logo.startsWith('data:image/png') ? 'PNG'
        : logo.startsWith('data:image/svg') ? 'SVG'
        : 'JPEG';

      const logoSize = 14; // mm
      doc.addImage(logo, format, 14, cursorY - 2, logoSize, logoSize);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(title, 14 + logoSize + 4, cursorY + 5);

      if (subtitle) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(subtitle, 14 + logoSize + 4, cursorY + 12);
        doc.setTextColor(0, 0, 0);
      }

      cursorY += logoSize + 4;
    } catch {
      cursorY = drawFallback(doc, title, subtitle);
    }
  } else {
    cursorY = drawFallback(doc, title, subtitle);
  }

  // Linha separadora
  doc.setDrawColor(200, 200, 200);
  doc.line(14, cursorY, pageW - 14, cursorY);

  return cursorY + 6;
}

function drawFallback(doc: jsPDF, title: string, subtitle?: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 14, 20);
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, 14, 28);
    doc.setTextColor(0, 0, 0);
    return 32;
  }
  return 26;
}

// ─── Exportar escala de culto ─────────────────────────────────────────────────
export async function exportScalePDF(scales: Scale[], cult: Cult | null, title: string) {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });

  const subtitle = cult
    ? `${cult.name || cult.type_name || ''} | Data: ${cult.date} | Horário: ${cult.time}`
    : undefined;

  const startY = await drawHeader(doc, title, subtitle);

  autoTable(doc, {
    startY,
    head: [['#', 'Voluntário', 'Setor', 'Status']],
    body: scales.map((s, i) => [i + 1, s.member_name || '', s.sector_name || '', s.status]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 30, 50] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
}

// ─── Exportar escala pessoal ──────────────────────────────────────────────────
export async function exportMemberScalePDF(scales: Scale[], memberName: string) {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });

  const startY = await drawHeader(doc, 'Minha Escala', `Voluntário: ${memberName}`);

  autoTable(doc, {
    startY,
    head: [['Data', 'Culto', 'Setor', 'Horário', 'Status']],
    body: scales.map(s => [s.cult_date || '', s.cult_name || '', s.sector_name || '', s.cult_time || '', s.status]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 30, 50] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(`escala_${memberName.replace(/\s+/g, '_')}.pdf`);
}
