import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Scale, Cult } from '../types';

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C_HEADER_BG:  [number,number,number] = [28,  25,  23 ];  // stone-900
const C_HEADER_FG:  [number,number,number] = [251, 191, 36 ];  // amber-400
const C_BLOCK_HDR:  [number,number,number] = [55,  48,  44 ];  // stone-700  (cabeçalho do bloco)
const C_BLOCK_FG:   [number,number,number] = [231, 229, 228];  // stone-200
const C_TH_BG:      [number,number,number] = [80,  70,  65 ];  // cinza-quente (thead da tabela interna)
const C_TH_FG:      [number,number,number] = [200, 190, 180];
const C_ROW_ODD:    [number,number,number] = [255, 255, 255];
const C_ROW_EVEN:   [number,number,number] = [248, 246, 244];
const C_BORDER:     [number,number,number] = [200, 195, 190];
const C_ST_OK:      [number,number,number] = [22,  163, 74 ];  // verde
const C_ST_PEND:    [number,number,number] = [180, 83,  9  ];  // âmbar
const C_ST_SWAP:    [number,number,number] = [37,  99,  235];  // azul
const C_ST_REF:     [number,number,number] = [220, 38,  38 ];  // vermelho

function statusColor(s: string): [number,number,number] {
  if (s === 'Confirmado') return C_ST_OK;
  if (s === 'Troca')      return C_ST_SWAP;
  if (s === 'Recusado')   return C_ST_REF;
  return C_ST_PEND;
}

function fmtDate(d: string): string {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const dow = days[new Date(+y, +m - 1, +dd).getDay()];
  return `${dow} ${dd}/${m}`;
}

function fmtTime(t: string) { return t ? t.slice(0,5) : ''; }

async function fetchLogo(): Promise<string | null> {
  try {
    const r = await fetch('/api/settings/logo');
    const d = await r.json();
    return d?.value || null;
  } catch { return null; }
}

// ─── Cabeçalho global da página ───────────────────────────────────────────────
function drawMainHeader(
  doc: jsPDF,
  logo: string | null,
  title: string,
  subtitle: string,
  pw: number,
): number {
  const MX = 10;
  const y0 = 8;
  const hh = 18;

  doc.setFillColor(...C_HEADER_BG);
  doc.rect(MX, y0, pw - MX * 2, hh, 'F');

  // Logo
  let textX = MX + 4;
  if (logo && !logo.startsWith('data:image/svg')) {
    try {
      const fmt = logo.includes('jpeg') || logo.includes('jpg') ? 'JPEG' : 'PNG';
      doc.addImage(logo, fmt, MX + 2, y0 + 2, 12, 12);
      textX = MX + 17;
    } catch { /* ignora */ }
  }

  // Título centralizado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C_HEADER_FG);
  doc.text(title, pw / 2, y0 + 7, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 170, 155);
  doc.text(subtitle, pw / 2, y0 + 13, { align: 'center' });

  // Data emissão — direita
  const now = new Date();
  doc.setFontSize(6.5);
  doc.setTextColor(130, 120, 110);
  doc.text(
    `Emitido ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`,
    pw - MX - 2, y0 + 13, { align: 'right' }
  );

  return y0 + hh + 4;
}

// ─── Rodapé ───────────────────────────────────────────────────────────────────
function drawFooter(doc: jsPDF, page: number, total: number, pw: number, ph: number) {
  const y = ph - 6;
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.2);
  doc.line(10, y - 1, pw - 10, y - 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(150, 140, 130);
  doc.text('EcclesiaScale', 10, y + 2);
  doc.text(`Página ${page} / ${total}`, pw - 10, y + 2, { align: 'right' });
}

// ─────────────────────────────────────────────────────────────────────────────
//  GRADE DE CULTOS — layout igual à imagem de referência
//  Landscape A4, 4 colunas, cada célula = bloco de um culto
// ─────────────────────────────────────────────────────────────────────────────
async function exportMonthGridPDF(
  allScales: Scale[],
  allCults: Cult[],
  title: string,
  departments?: { id: number; name: string }[],
  memberDeptMap?: Map<number, number | null>,
) {
  const logo = await fetchLogo();
  // Portrait A4 para melhor organização dos quadros
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const PW = doc.internal.pageSize.getWidth();   // 210
  const PH = doc.internal.pageSize.getHeight();  // 297
  const MX = 8;
  const GAP = 3;

  const sorted = [...allCults].sort((a, b) => a.date.localeCompare(b.date));
  const totalVol = allScales.length;
  const subtitle = `${sorted.length} culto(s)  ·  ${totalVol} voluntário(s)  ·  ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;

  // Agrupa departamentos para exibição
  const deptList = departments && departments.length > 0 ? departments : [{ id: -1, name: 'Voluntários' }];

  // Para cada culto, gera uma página (ou seção)
  // Layout: 2 colunas de departamentos por culto, cultos empilhados
  // Cada culto = bloco com cabeçalho + sub-blocos por departamento

  const CULT_COLS = sorted.length <= 4 ? 1 : 2; // 1 col p/ poucos cultos, 2 col p/ muitos
  const cultColW = (PW - MX * 2 - GAP * (CULT_COLS - 1)) / CULT_COLS;

  // Calcula altura de um bloco de culto
  const cultHeaderH = 10;
  const deptHeaderH = 6;
  const rowH = 5;
  const minBlockH = cultHeaderH + deptHeaderH + rowH + 4;

  function calcCultBlockH(cultId: number): number {
    const cScales = allScales.filter(s => s.cult_id === cultId);
    let h = cultHeaderH;
    for (const dept of deptList) {
      const dScales = dept.id === -1 ? cScales : cScales.filter(s => {
        const dId = memberDeptMap?.get(s.member_id) ?? null;
        return dept.id === -1 ? true : dId === dept.id;
      });
      if (dScales.length === 0) continue;
      h += deptHeaderH + dScales.length * rowH;
    }
    return Math.max(minBlockH, h + 4);
  }

  let headerY = drawMainHeader(doc, logo, title, subtitle, PW);
  let curY = headerY + GAP;
  let col = 0;
  let rowMaxH = 0;
  let pageNum = 1;

  for (let i = 0; i < sorted.length; i++) {
    const cult = sorted[i];
    const bh = calcCultBlockH(cult.id);

    // Início de nova linha de colunas
    if (col === 0) {
      rowMaxH = 0;
      for (let j = i; j < Math.min(i + CULT_COLS, sorted.length); j++) {
        rowMaxH = Math.max(rowMaxH, calcCultBlockH(sorted[j].id));
      }
      // Nova página?
      if (curY + rowMaxH > PH - 14) {
        doc.addPage();
        pageNum++;
        headerY = drawMainHeader(doc, logo, title, subtitle, PW);
        curY = headerY + GAP;
      }
    }

    const bx = MX + col * (cultColW + GAP);
    const by = curY;
    const cScales = allScales.filter(s => s.cult_id === cult.id);

    // ── Borda do bloco ────────────────────────────────────────────────────────
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.3);
    doc.rect(bx, by, cultColW, rowMaxH, 'S');

    // ── Cabeçalho do culto ────────────────────────────────────────────────────
    doc.setFillColor(...C_BLOCK_HDR);
    doc.rect(bx, by, cultColW, cultHeaderH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C_BLOCK_FG);
    doc.text(fmtDate(cult.date), bx + 3, by + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 175, 165);
    doc.text(fmtTime(cult.time), bx + cultColW - 3, by + 4.5, { align: 'right' });

    const typeName = cult.type_name || cult.name || '';
    if (typeName) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(200, 185, 155);
      doc.text(typeName, bx + 3, by + 8.5, { maxWidth: cultColW - 6 });
    }

    // ── Sub-blocos por Departamento ───────────────────────────────────────────
    let dy = by + cultHeaderH;

    if (cScales.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(160, 150, 140);
      doc.text('Sem voluntários escalados', bx + 3, dy + 5);
    } else {
      for (const dept of deptList) {
        const dScales = dept.id === -1
          ? cScales
          : cScales.filter(s => (memberDeptMap?.get(s.member_id) ?? null) === dept.id);

        if (dScales.length === 0) continue;

        // Cabeçalho do departamento
        doc.setFillColor(42, 37, 35);
        doc.rect(bx, dy, cultColW, deptHeaderH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(251, 191, 36);
        doc.text(dept.name.toUpperCase(), bx + 3, dy + 4);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(160, 150, 130);
        doc.text(`${dScales.length} membro(s)`, bx + cultColW - 3, dy + 4, { align: 'right' });
        dy += deptHeaderH;

        // Linhas de membros
        const colNameW = cultColW * 0.45;
        const colSectorW = cultColW * 0.35;
        const colStatusW = cultColW * 0.20;

        for (let ri = 0; ri < dScales.length; ri++) {
          const s = dScales[ri];
          doc.setFillColor(...(ri % 2 === 0 ? C_ROW_ODD : C_ROW_EVEN));
          doc.rect(bx, dy, cultColW, rowH, 'F');
          doc.setDrawColor(230, 225, 220);
          doc.setLineWidth(0.08);
          doc.line(bx, dy, bx + cultColW, dy);

          doc.setFontSize(6.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(40, 35, 30);
          doc.text(s.member_name || '—', bx + 2, dy + 3.5, { maxWidth: colNameW - 2 });

          doc.setTextColor(100, 90, 80);
          doc.text(s.sector_name || '—', bx + colNameW + 1, dy + 3.5, { maxWidth: colSectorW - 2 });

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...statusColor(s.status));
          doc.text(s.status, bx + colNameW + colSectorW + 1, dy + 3.5, { maxWidth: colStatusW - 1 });

          dy += rowH;
        }
      }
    }

    col++;
    if (col >= CULT_COLS) {
      col = 0;
      curY += rowMaxH + GAP;
    }
  }

  // Rodapé em todas as páginas
  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, PW, PH);
  }

  doc.save(`escalas_${new Date().toISOString().slice(0,7)}.pdf`);
}


// ─────────────────────────────────────────────────────────────────────────────
//  exportScalePDF  — culto único (portrait, lista simples) OU mês (grade)
// ─────────────────────────────────────────────────────────────────────────────
export async function exportScalePDF(
  scales: Scale[],
  cult: Cult | null,
  title: string,
  allScales?: Scale[],
  allCults?: Cult[],
  departments?: { id: number; name: string }[],
  memberDeptMap?: Map<number, number | null>,
) {
  // Mês inteiro → grade portrait por departamento
  if (allScales && allCults && allCults.length > 1) {
    return exportMonthGridPDF(allScales, allCults, title, departments, memberDeptMap);
  }

  // Culto único → portrait com tabela simples
  const logo = await fetchLogo();
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const PW = doc.internal.pageSize.getWidth();
  const MX = 14;

  const subtitle = cult
    ? `${fmtDate(cult.date)}  ·  ${fmtTime(cult.time)}  ·  ${scales.length} voluntário(s)`
    : `${scales.length} voluntário(s)`;

  let y = drawMainHeader(doc, logo, title, subtitle, PW);

  // Agrupa por setor
  const bySetor = new Map<string, Scale[]>();
  for (const s of [...scales].sort((a,b)=>(a.sector_name||'').localeCompare(b.sector_name||''))) {
    const k = s.sector_name || 'Sem Setor';
    if (!bySetor.has(k)) bySetor.set(k, []);
    bySetor.get(k)!.push(s);
  }

  const body: any[] = [];
  for (const [sectorName, ss] of bySetor) {
    ss.forEach((s, i) => {
      body.push([
        i === 0 ? sectorName : '',
        s.member_name || '—',
        { content: s.status, styles: { textColor: statusColor(s.status), fontStyle: 'bold' } },
      ]);
    });
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MX, right: MX },
    head: [['Setor', 'Voluntário', 'Status']],
    body,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, lineColor: [210,205,200], lineWidth: 0.15 },
    headStyles: { fillColor: C_BLOCK_HDR, textColor: C_TH_FG, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 246, 244] },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold', textColor: [90,80,70] },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30, halign: 'center' },
    },
  });

  // Rodapé
  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, PW, doc.internal.pageSize.getHeight());
  }

  doc.save(`escala_${(cult?.date || 'culto').replace(/-/g,'')}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  exportMemberScalePDF — painel individual, agrupado por mês
// ─────────────────────────────────────────────────────────────────────────────
export async function exportMemberScalePDF(scales: Scale[], memberName: string) {
  const logo = await fetchLogo();
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const PW = doc.internal.pageSize.getWidth();
  const MX = 14;

  const title = 'Minha Escala de Voluntariado';
  const subtitle = `${memberName}  ·  ${scales.length} escala(s)`;
  let y = drawMainHeader(doc, logo, title, subtitle, PW);

  const byMonth = new Map<string, Scale[]>();
  for (const s of [...scales].sort((a,b)=>(a.cult_date||'').localeCompare(b.cult_date||''))) {
    const m = (s.cult_date||'').slice(0,7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(s);
  }

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  for (const [mk, ms] of byMonth) {
    const [yy, mm] = mk.split('-');
    const label = `${MONTHS[+mm-1]} de ${yy}  —  ${ms.length} escala(s)`;

    if (y + 12 > 280) {
      doc.addPage();
      y = drawMainHeader(doc, logo, title, subtitle, PW);
    }

    // Faixa do mês
    doc.setFillColor(68, 51, 20);
    doc.roundedRect(MX - 2, y, PW - (MX-2)*2, 7, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(253, 230, 138);
    doc.text(label.toUpperCase(), MX + 1, y + 4.8);
    y += 10;

    autoTable(doc, {
      startY: y,
      margin: { left: MX, right: MX },
      head: [['Data', 'Horário', 'Tipo / Culto', 'Setor', 'Status']],
      body: ms.map(s => [
        fmtDate(s.cult_date || ''),
        fmtTime(s.cult_time || ''),
        s.cult_name || '—',
        s.sector_name || '—',
        { content: s.status, styles: { textColor: statusColor(s.status), fontStyle: 'bold' } },
      ]),
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: {top:2,bottom:2,left:3,right:3}, lineColor:[210,205,200], lineWidth:0.15 },
      headStyles: { fillColor: C_BLOCK_HDR, textColor: C_TH_FG, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248,246,244] },
      columnStyles: {
        0:{cellWidth:36}, 1:{cellWidth:18,halign:'center'}, 2:{cellWidth:'auto'},
        3:{cellWidth:36}, 4:{cellWidth:25,halign:'center'},
      },
    });

    y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;
  }

  // Resumo
  if (y + 10 > 280) { doc.addPage(); y = drawMainHeader(doc, logo, title, subtitle, PW); }
  doc.setDrawColor(...[210,205,200] as [number,number,number]);
  doc.setLineWidth(0.2);
  doc.line(MX, y, PW - MX, y);
  y += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100,90,80);
  doc.text('Resumo:', MX, y);
  let rx = MX + 18;
  for (const item of [
    { l:`${scales.filter(s=>s.status==='Confirmado').length} confirmada(s)`, c: C_ST_OK },
    { l:`${scales.filter(s=>s.status==='Pendente').length} pendente(s)`,     c: C_ST_PEND },
    { l:`${scales.filter(s=>s.status==='Troca').length} em troca`,           c: C_ST_SWAP },
    { l:`${scales.length} total`,                                             c:[100,90,80] as [number,number,number] },
  ]) {
    doc.setFont('helvetica','normal'); doc.setTextColor(...item.c);
    doc.text(item.l, rx, y); rx += 36;
  }

  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, PW, doc.internal.pageSize.getHeight());
  }
  doc.save(`minha_escala_${memberName.replace(/\s+/g,'_')}.pdf`);
}
