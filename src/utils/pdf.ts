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
) {
  const logo = await fetchLogo();
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
  const PW = doc.internal.pageSize.getWidth();   // ~297
  const PH = doc.internal.pageSize.getHeight();  // ~210
  const MX = 8;   // margem horizontal
  const MY_TOP = 4; // margem topo extra após header
  const COLS = 4;
  const GAP = 3;   // espaço entre blocos

  // Ordena cultos por data
  const sorted = [...allCults].sort((a, b) => a.date.localeCompare(b.date));

  const totalVol = allScales.length;
  const subtitle = `${sorted.length} culto(s)  ·  ${totalVol} voluntário(s) escalado(s)  ·  ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;

  let headerY = drawMainHeader(doc, logo, title, subtitle, PW);
  let curY = headerY + MY_TOP;
  let pageNum = 1;

  const colW = (PW - MX * 2 - GAP * (COLS - 1)) / COLS;

  // Calcula altura de um bloco dado o nº de voluntários
  const blockHeaderH = 10; // cabeçalho do bloco (data+hora)
  const tableHeadH = 6;    // thead da mini-tabela
  const rowH = 5.2;        // altura de cada linha
  const blockPadB = 3;     // padding inferior do bloco

  function blockHeight(scaleCount: number): number {
    return blockHeaderH + tableHeadH + Math.max(1, scaleCount) * rowH + blockPadB;
  }

  // Altura disponível por página
  const availH = PH - (headerY + MY_TOP) - 12; // 12 = rodapé

  // Distribui blocos em linhas de 4
  let col = 0;
  let rowMaxH = 0; // altura máxima do bloco na linha atual

  for (let i = 0; i < sorted.length; i++) {
    const cult = sorted[i];
    const cScales = allScales.filter(s => s.cult_id === cult.id);
    const bh = blockHeight(cScales.length);

    // Nova linha?
    if (col === 0) {
      // Pré-calcula a altura máxima desta linha
      rowMaxH = 0;
      for (let j = i; j < Math.min(i + COLS, sorted.length); j++) {
        const s2 = allScales.filter(s => s.cult_id === sorted[j].id);
        rowMaxH = Math.max(rowMaxH, blockHeight(s2.length));
      }
      // Nova página se não couber
      if (curY + rowMaxH > PH - 12) {
        doc.addPage();
        pageNum++;
        headerY = drawMainHeader(doc, logo, title, subtitle, PW);
        curY = headerY + MY_TOP;
      }
    }

    const bx = MX + col * (colW + GAP);
    const by = curY;

    // ── Desenha o bloco ───────────────────────────────────────────────────────

    // Borda do bloco
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(bx, by, colW, rowMaxH, 'S');

    // Cabeçalho do bloco
    doc.setFillColor(...C_BLOCK_HDR);
    doc.rect(bx, by, colW, blockHeaderH, 'F');

    // Data — esquerda
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_BLOCK_FG);
    doc.text(fmtDate(cult.date), bx + 2, by + 4.5);

    // Hora — direita
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 175, 165);
    doc.text(fmtTime(cult.time), bx + colW - 2, by + 4.5, { align: 'right' });

    // Tipo/nome do culto
    const typeName = cult.type_name || cult.name || '';
    if (typeName) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(200, 185, 155);
      doc.text(typeName, bx + 2, by + 8.5, { maxWidth: colW - 4 });
    }

    // ── Mini-tabela de voluntários ─────────────────────────────────────────
    const tableY = by + blockHeaderH;

    // thead
    doc.setFillColor(...C_TH_BG);
    doc.rect(bx, tableY, colW, tableHeadH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...C_TH_FG);
    const c1w = colW * 0.38;
    const c2w = colW * 0.42;
    const c3w = colW * 0.20;
    doc.text('SETOR',      bx + 2,            tableY + 4);
    doc.text('VOLUNTÁRIO', bx + c1w + 2,      tableY + 4);
    doc.text('STATUS',     bx + c1w + c2w + 2, tableY + 4);

    if (cScales.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(160, 150, 140);
      doc.text('Sem voluntários escalados', bx + 2, tableY + tableHeadH + 4);
    } else {
      // Linhas
      const bySetor = new Map<string, Scale[]>();
      for (const s of [...cScales].sort((a,b)=>(a.sector_name||'').localeCompare(b.sector_name||''))) {
        const k = s.sector_name || 'Sem Setor';
        if (!bySetor.has(k)) bySetor.set(k, []);
        bySetor.get(k)!.push(s);
      }

      let ry = tableY + tableHeadH;
      let rowIdx = 0;

      for (const [sectorName, sScales] of bySetor) {
        for (let si = 0; si < sScales.length; si++) {
          const s = sScales[si];
          // Fundo alternado
          doc.setFillColor(...(rowIdx % 2 === 0 ? C_ROW_ODD : C_ROW_EVEN));
          doc.rect(bx, ry, colW, rowH, 'F');

          // Linha separadora horizontal suave
          doc.setDrawColor(225, 220, 215);
          doc.setLineWidth(0.1);
          doc.line(bx, ry, bx + colW, ry);

          doc.setFontSize(6.5);

          // Setor (somente na 1ª linha do grupo)
          if (si === 0) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(90, 80, 70);
            doc.text(sectorName, bx + 2, ry + 3.6, { maxWidth: c1w - 3 });
          }

          // Voluntário
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(50, 45, 40);
          doc.text(s.member_name || '—', bx + c1w + 2, ry + 3.6, { maxWidth: c2w - 3 });

          // Status colorido
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...statusColor(s.status));
          doc.text(s.status, bx + c1w + c2w + 2, ry + 3.6, { maxWidth: c3w - 2 });

          ry += rowH;
          rowIdx++;
        }
      }
    }

    col++;
    if (col >= COLS) {
      col = 0;
      curY += rowMaxH + GAP;
    }
  }

  // Legenda
  const legendY = PH - 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(120, 110, 100);
  doc.text('Status:', MX, legendY);
  let lx = MX + 12;
  for (const st of [
    { l: 'Confirmado', c: C_ST_OK },
    { l: 'Pendente',   c: C_ST_PEND },
    { l: 'Troca',      c: C_ST_SWAP },
    { l: 'Recusado',   c: C_ST_REF },
  ]) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...st.c);
    doc.text(`● ${st.l}`, lx, legendY);
    lx += 26;
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
) {
  // Mês inteiro → grade landscape
  if (allScales && allCults && allCults.length > 1) {
    return exportMonthGridPDF(allScales, allCults, title);
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
