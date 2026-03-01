import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Scale, Cult } from '../types';

// ─── Cores ────────────────────────────────────────────────────────────────────
const COLOR_HEADER_BG: [number, number, number] = [28, 25, 23];
const COLOR_HEADER_TEXT: [number, number, number] = [251, 191, 36];
const COLOR_TYPE_BG: [number, number, number] = [68, 51, 20];
const COLOR_TYPE_TEXT: [number, number, number] = [253, 230, 138];
const COLOR_CULT_BG: [number, number, number] = [41, 37, 36];
const COLOR_CULT_TEXT: [number, number, number] = [231, 229, 228];
const COLOR_ROW_ODD: [number, number, number] = [255, 255, 255];
const COLOR_ROW_EVEN: [number, number, number] = [250, 250, 249];
const COLOR_STATUS_OK: [number, number, number] = [22, 163, 74];
const COLOR_STATUS_PEND: [number, number, number] = [180, 83, 9];
const COLOR_STATUS_SWAP: [number, number, number] = [37, 99, 235];
const COLOR_STATUS_REF: [number, number, number] = [220, 38, 38];
const COLOR_LINE: [number, number, number] = [214, 211, 209];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusColor(status: string): [number, number, number] {
  if (status === 'Confirmado') return COLOR_STATUS_OK;
  if (status === 'Troca')      return COLOR_STATUS_SWAP;
  if (status === 'Recusado')   return COLOR_STATUS_REF;
  return COLOR_STATUS_PEND;
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return `${weekdays[date.getDay()]}, ${d}/${m}/${y}`;
}

function fmtTime(t: string) {
  return t ? t.slice(0, 5) : '';
}

// ─── Carrega logo do servidor ─────────────────────────────────────────────────
async function fetchLogo(): Promise<string | null> {
  try {
    const res = await fetch('/api/settings/logo');
    if (!res.ok) return null;
    const data = await res.json();
    return data?.value || null;
  } catch { return null; }
}

// ─── Cabeçalho de página ──────────────────────────────────────────────────────
function drawPageHeader(
  doc: jsPDF,
  logo: string | null,
  title: string,
  subtitle: string,
  pageWidth: number,
): number {
  const MARGIN = 14;
  const y = 12;

  doc.setFillColor(...COLOR_HEADER_BG);
  doc.roundedRect(MARGIN - 2, y - 4, pageWidth - (MARGIN - 2) * 2, 22, 2, 2, 'F');

  if (logo && !logo.startsWith('data:image/svg')) {
    try {
      const fmt = logo.startsWith('data:image/jpeg') || logo.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
      doc.addImage(logo, fmt, MARGIN + 1, y - 1, 14, 14);
    } catch { /* ignora logo inválido */ }
  }

  const titleX = logo ? MARGIN + 18 : MARGIN + 2;
  doc.setTextColor(...COLOR_HEADER_TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, titleX, y + 5);

  doc.setTextColor(180, 170, 160);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, titleX, y + 12);

  const now = new Date();
  const emitStr = `Emitido em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  doc.setTextColor(120, 110, 100);
  doc.setFontSize(7);
  doc.text(emitStr, pageWidth - MARGIN - 2, y + 12, { align: 'right' });

  return y + 22;
}

// ─── Rodapé ───────────────────────────────────────────────────────────────────
function drawFooter(doc: jsPDF, pageNum: number, totalPages: number, pageWidth: number) {
  const y = 287;
  doc.setDrawColor(...COLOR_LINE);
  doc.setLineWidth(0.2);
  doc.line(14, y, pageWidth - 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(150, 140, 130);
  doc.text('EcclesiaScale', 14, y + 4);
  doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - 14, y + 4, { align: 'right' });
}

// ─────────────────────────────────────────────────────────────────────────────
//  exportScalePDF
//  - cult único: mostra voluntários deste culto agrupados por setor
//  - mês inteiro: agrupa por Tipo de Culto → Data → Setor
// ─────────────────────────────────────────────────────────────────────────────
export async function exportScalePDF(
  scales: Scale[],
  cult: Cult | null,
  title: string,
  allScales?: Scale[],
  allCults?: Cult[],
) {
  const logo = await fetchLogo();
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 14;

  const isMonthExport = !!(allScales && allCults && allCults.length > 1);

  // Monta lista de cultos a renderizar
  const cultsToRender: Array<{ cult: Cult; scales: Scale[] }> = isMonthExport
    ? allCults!.map(c => ({ cult: c, scales: allScales!.filter(s => s.cult_id === c.id) }))
    : [{ cult: cult!, scales }];

  // Subtítulo
  const totalVolunteers = isMonthExport ? allScales!.length : scales.length;
  const subtitle = isMonthExport
    ? `${cultsToRender.length} culto(s) · ${totalVolunteers} voluntário(s) escalado(s)`
    : cult
      ? `${fmtDate(cult.date)} às ${fmtTime(cult.time)} · ${scales.length} voluntário(s)`
      : `${scales.length} voluntário(s)`;

  // Agrupa por tipo de culto (ordenado)
  const byType = new Map<string, Array<{ cult: Cult; scales: Scale[] }>>();
  for (const item of cultsToRender) {
    const typeLabel = item.cult.type_name || item.cult.name || 'Sem Tipo';
    if (!byType.has(typeLabel)) byType.set(typeLabel, []);
    byType.get(typeLabel)!.push(item);
  }
  // Ordena cada grupo por data
  byType.forEach(items => items.sort((a, b) => a.cult.date.localeCompare(b.cult.date)));

  let y = drawPageHeader(doc, logo, title, subtitle, PAGE_W);
  let pageNum = 1;

  const checkPage = (needed: number) => {
    if (y + needed > 280) {
      doc.addPage();
      pageNum++;
      y = drawPageHeader(doc, logo, title, subtitle, PAGE_W);
    }
  };

  // Renderiza agrupado por tipo
  for (const [typeName, items] of byType) {

    // ── Faixa do tipo de culto ──────────────────────────────────────────────
    checkPage(10);
    doc.setFillColor(...COLOR_TYPE_BG);
    doc.roundedRect(MARGIN - 2, y, PAGE_W - (MARGIN - 2) * 2, 7, 1, 1, 'F');
    doc.setTextColor(...COLOR_TYPE_TEXT);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(typeName.toUpperCase(), MARGIN + 2, y + 4.8);
    // Contagem de cultos neste tipo — direita
    doc.setTextColor(200, 180, 100);
    doc.setFontSize(7.5);
    doc.text(`${items.length} culto(s)`, PAGE_W - MARGIN - 2, y + 4.8, { align: 'right' });
    y += 9;

    for (const { cult: c, scales: cScales } of items) {
      checkPage(16);

      // ── Faixa do culto (data + hora) ───────────────────────────────────
      doc.setFillColor(...COLOR_CULT_BG);
      doc.rect(MARGIN - 2, y, PAGE_W - (MARGIN - 2) * 2, 6.5, 'F');

      doc.setTextColor(...COLOR_CULT_TEXT);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(fmtDate(c.date), MARGIN + 1, y + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 175, 170);
      doc.setFontSize(8);
      doc.text(fmtTime(c.time), MARGIN + 42, y + 4.5);

      if (c.name && c.name !== typeName) {
        doc.setTextColor(160, 155, 150);
        doc.text(c.name, MARGIN + 56, y + 4.5);
      }

      doc.setTextColor(160, 155, 110);
      doc.setFontSize(7.5);
      doc.text(`${cScales.length} vol.`, PAGE_W - MARGIN - 2, y + 4.5, { align: 'right' });
      y += 8;

      if (cScales.length === 0) {
        checkPage(7);
        doc.setTextColor(150, 140, 130);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum voluntário escalado.', MARGIN + 4, y + 4);
        y += 7;
        continue;
      }

      // ── Tabela agrupada por setor ──────────────────────────────────────
      const bySetor = new Map<string, Scale[]>();
      for (const s of [...cScales].sort((a, b) => (a.sector_name || '').localeCompare(b.sector_name || ''))) {
        const k = s.sector_name || 'Sem Setor';
        if (!bySetor.has(k)) bySetor.set(k, []);
        bySetor.get(k)!.push(s);
      }

      const tableBody: any[] = [];
      for (const [sectorName, sScales] of bySetor) {
        sScales.forEach((s, idx) => {
          tableBody.push([
            idx === 0 ? sectorName : '',
            s.member_name || '—',
            {
              content: s.status,
              styles: { textColor: statusColor(s.status), fontStyle: 'bold' },
            },
          ]);
        });
      }

      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        head: [['Setor', 'Voluntário', 'Status']],
        body: tableBody,
        theme: 'plain',
        styles: {
          fontSize: 8.5,
          cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 },
          lineColor: COLOR_LINE,
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [55, 48, 44],
          textColor: [200, 190, 180],
          fontStyle: 'bold',
          fontSize: 7.5,
        },
        alternateRowStyles: { fillColor: COLOR_ROW_EVEN },
        bodyStyles: { fillColor: COLOR_ROW_ODD },
        columnStyles: {
          0: { cellWidth: 45, fontStyle: 'bold', textColor: [100, 90, 80] },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 28, halign: 'center' },
        },
      });

      y = (doc as any).lastAutoTable.finalY + 4;
    }

    y += 3;
  }

  // ── Legenda ────────────────────────────────────────────────────────────────
  checkPage(14);
  y += 2;
  doc.setDrawColor(...COLOR_LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 110, 100);
  doc.text('Legenda de Status:', MARGIN, y);
  let lx = MARGIN + 30;
  for (const st of [
    { label: 'Confirmado', color: COLOR_STATUS_OK },
    { label: 'Pendente',   color: COLOR_STATUS_PEND },
    { label: 'Troca',      color: COLOR_STATUS_SWAP },
    { label: 'Recusado',   color: COLOR_STATUS_REF },
  ]) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...st.color);
    doc.text(`● ${st.label}`, lx, y);
    lx += 28;
  }

  // ── Rodapé em todas as páginas ─────────────────────────────────────────────
  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, PAGE_W);
  }

  const fileName = isMonthExport
    ? `escalas_${new Date().toISOString().slice(0, 7)}.pdf`
    : `escala_${(cult?.date || 'culto').replace(/-/g, '')}.pdf`;
  doc.save(fileName);
}

// ─────────────────────────────────────────────────────────────────────────────
//  exportMemberScalePDF — painel do membro, agrupado por mês
// ─────────────────────────────────────────────────────────────────────────────
export async function exportMemberScalePDF(scales: Scale[], memberName: string) {
  const logo = await fetchLogo();
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const MARGIN = 14;

  const title = 'Minha Escala de Voluntariado';
  const subtitle = `${memberName} · ${scales.length} escala(s)`;

  let y = drawPageHeader(doc, logo, title, subtitle, PAGE_W);

  const checkPage = (h: number) => {
    if (y + h > 280) {
      doc.addPage();
      y = drawPageHeader(doc, logo, title, subtitle, PAGE_W);
    }
  };

  // Agrupa por mês
  const byMonth = new Map<string, Scale[]>();
  for (const s of [...scales].sort((a, b) => (a.cult_date || '').localeCompare(b.cult_date || ''))) {
    const m = (s.cult_date || '').slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(s);
  }

  const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  for (const [monthKey, mScales] of byMonth) {
    const [yyyy, mm] = monthKey.split('-');
    const monthLabel = `${MONTH_NAMES[Number(mm) - 1]} de ${yyyy}  —  ${mScales.length} escala(s)`;

    checkPage(12);
    doc.setFillColor(...COLOR_TYPE_BG);
    doc.roundedRect(MARGIN - 2, y, PAGE_W - (MARGIN - 2) * 2, 7, 1, 1, 'F');
    doc.setTextColor(...COLOR_TYPE_TEXT);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(monthLabel.toUpperCase(), MARGIN + 2, y + 4.8);
    y += 10;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Data', 'Horário', 'Tipo / Culto', 'Setor', 'Status']],
      body: mScales.map(s => [
        fmtDate(s.cult_date || ''),
        fmtTime(s.cult_time || ''),
        s.cult_name || '—',
        s.sector_name || '—',
        { content: s.status, styles: { textColor: statusColor(s.status), fontStyle: 'bold' } },
      ]),
      theme: 'plain',
      styles: {
        fontSize: 8.5,
        cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
        lineColor: COLOR_LINE,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [55, 48, 44],
        textColor: [200, 190, 180],
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: COLOR_ROW_EVEN },
      bodyStyles: { fillColor: COLOR_ROW_ODD },
      columnStyles: {
        0: { cellWidth: 36 },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 36 },
        4: { cellWidth: 25, halign: 'center' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Resumo final
  checkPage(16);
  y += 2;
  doc.setDrawColor(...COLOR_LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;

  const confirmed = scales.filter(s => s.status === 'Confirmado').length;
  const pending = scales.filter(s => s.status === 'Pendente').length;
  const swap = scales.filter(s => s.status === 'Troca').length;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 90, 80);
  doc.text('Resumo:', MARGIN, y);

  let rx = MARGIN + 18;
  for (const item of [
    { label: `${confirmed} confirmada(s)`, color: COLOR_STATUS_OK },
    { label: `${pending} pendente(s)`,     color: COLOR_STATUS_PEND },
    { label: `${swap} em troca`,           color: COLOR_STATUS_SWAP },
    { label: `${scales.length} total`,     color: [100, 90, 80] as [number,number,number] },
  ]) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...item.color);
    doc.text(item.label, rx, y);
    rx += 33;
  }

  // Rodapé
  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, PAGE_W);
  }

  doc.save(`minha_escala_${memberName.replace(/\s+/g, '_')}.pdf`);
}
