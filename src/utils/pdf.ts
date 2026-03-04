import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Scale, Cult } from '../types';

// ─── Tipo DeptBlock (espelho do que vem da API /scales/by-department) ─────────
export interface DeptBlock {
  department_id: number | null;
  department_name: string;
  scales: {
    id: number;
    status: string;
    member_name: string;
    member_id: number;
    sector_name: string;
    department_id: number | null;
    department_name: string;
  }[];
}

// ─── Paleta ──────────────────────────────────────────────────────────────────
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
    return d?.logo || d?.value || null;
  } catch { return null; }
}

async function fetchChurchName(): Promise<string> {
  try {
    const r = await fetch('/api/public/church-name');
    const d = await r.json();
    return d?.name || 'EcclesiaScale';
  } catch { return 'EcclesiaScale'; }
}

// ─── Cabeçalho global da página ───────────────────────────────────────────────
function drawMainHeader(
  doc: jsPDF,
  logo: string | null,
  title: string,
  subtitle: string,
  pw: number,
  churchName?: string,
): number {
  const MX = 10;
  const y0 = 8;
  const hh = 18;

  doc.setFillColor(...C_HEADER_BG);
  doc.rect(MX, y0, pw - MX * 2, hh, 'F');

  // Logo
  if (logo && !logo.startsWith('data:image/svg')) {
    try {
      const fmt = logo.includes('jpeg') || logo.includes('jpg') ? 'JPEG' : 'PNG';
      doc.addImage(logo, fmt, MX + 2, y0 + 2, 12, 12);
    } catch { /* ignora */ }
  }

  // Nome da igreja — esquerda (abaixo do logo se houver)
  if (churchName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(180, 170, 155);
    doc.text(churchName, MX + (logo ? 16 : 4), y0 + 5);
  }

  // Título centralizado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C_HEADER_FG);
  doc.text(title, pw / 2, y0 + 8, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 170, 155);
  doc.text(subtitle, pw / 2, y0 + 14, { align: 'center' });

  // Data emissão — direita
  const now = new Date();
  doc.setFontSize(6.5);
  doc.setTextColor(130, 120, 110);
  doc.text(
    `Emitido ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`,
    pw - MX - 2, y0 + 14, { align: 'right' }
  );

  return y0 + hh + 4;
}

// ─── Rodapé ───────────────────────────────────────────────────────────────────
function drawFooter(doc: jsPDF, page: number, total: number, pw: number, ph: number, churchName?: string) {
  const y = ph - 6;
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.2);
  doc.line(10, y - 1, pw - 10, y - 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(150, 140, 130);
  doc.text(churchName || 'EcclesiaScale', 10, y + 2);
  doc.text(`Página ${page} / ${total}`, pw - 10, y + 2, { align: 'right' });
}

// ─────────────────────────────────────────────────────────────────────────────
//  CULTO ÚNICO COM BLOCOS DE DEPARTAMENTO
//  Usa DeptBlock[] direto da API /scales/by-department — sem mapeamento hardcoded
// ─────────────────────────────────────────────────────────────────────────────

async function exportSingleCultBlocksPDF(
  deptBlocks: DeptBlock[],
  cult: Cult,
  title: string,
) {
  const [logo, churchName] = await Promise.all([fetchLogo(), fetchChurchName()]);
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const MX = 12;
  const MY = 8;

  const subtitle = `${fmtDate(cult.date)}  ·  ${fmtTime(cult.time)}`;
  let curY = drawMainHeader(doc, logo, title, subtitle, PW, churchName);
  curY += 4;

  const contentW = PW - MX * 2;
  const blockW = contentW / 2 - 2;
  const blockPadding = 3;
  const blockBorderW = 0.3;
  const headerH = 6;
  const sectorHeaderH = 4;
  const rowH = 4;
  const footerH = 2;

  let col = 0;
  let maxRowH = 0;

  for (let i = 0; i < deptBlocks.length; i++) {
    const dept = deptBlocks[i];

    // Agrupa escalas do bloco por setor
    const sectorMap = new Map<string, typeof dept.scales>();
    for (const scale of dept.scales) {
      const k = scale.sector_name || 'Sem Setor';
      if (!sectorMap.has(k)) sectorMap.set(k, []);
      sectorMap.get(k)!.push(scale);
    }
    const sectors = Array.from(sectorMap.entries()).map(([name, s]) => ({ sectorName: name, scales: s }));

    const blockH = headerH + (sectors.length * sectorHeaderH) + (dept.scales.length * rowH) + footerH;

    if (col === 0) {
      maxRowH = blockH;
    } else {
      maxRowH = Math.max(maxRowH, blockH);
    }

    if (curY + maxRowH > PH - 15 && col === 0) {
      doc.addPage();
      curY = drawMainHeader(doc, logo, title, subtitle, PW, churchName) + 4;
      col = 0;
      maxRowH = blockH;
    }

    const bx = MX + col * (blockW + 4);
    const by = curY;

    // Borda do bloco
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(blockBorderW);
    doc.rect(bx, by, blockW, blockH, 'S');

    // Cabeçalho do departamento
    doc.setFillColor(...C_BLOCK_HDR);
    doc.rect(bx, by, blockW, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_BLOCK_FG);
    doc.text(dept.department_name.toUpperCase(), bx + blockPadding, by + 4.5, { maxWidth: blockW - blockPadding * 2 });

    let contentY = by + headerH;

    sectors.forEach((sector) => {
      // Sub-header do setor
      doc.setFillColor(200, 190, 180);
      doc.rect(bx, contentY, blockW, sectorHeaderH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(50, 45, 40);
      doc.text(sector.sectorName, bx + blockPadding, contentY + 3, { maxWidth: blockW - blockPadding * 2 });
      contentY += sectorHeaderH;

      sector.scales.forEach((scale, idx) => {
        doc.setFillColor(...(idx % 2 === 0 ? C_ROW_ODD : C_ROW_EVEN));
        doc.rect(bx, contentY, blockW, rowH, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.setTextColor(50, 45, 40);
        doc.text(scale.member_name || '—', bx + blockPadding, contentY + 2.5, { maxWidth: blockW - blockPadding * 2 - 8 });

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...statusColor(scale.status));
        doc.setFontSize(5);
        doc.text(scale.status || 'Pendente', bx + blockW - blockPadding - 8, contentY + 2.5, { maxWidth: 8 });

        contentY += rowH;
      });
    });

    col++;
    if (col >= 2) {
      col = 0;
      curY += maxRowH + MY;
    }
  }

  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, PW, PH, churchName);
  }

  doc.save(`escala_${(cult?.date || 'culto').replace(/-/g, '')}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  GRADE DE CULTOS — landscape A4, 4 colunas
//  Recebe deptBlocksByCult: Map<cult_id, DeptBlock[]> com dados reais da API
// ─────────────────────────────────────────────────────────────────────────────
async function exportMonthGridPDF(
  deptBlocksByCult: Map<number, DeptBlock[]>,
  allCults: Cult[],
  title: string,
) {
  const [logo, churchName] = await Promise.all([fetchLogo(), fetchChurchName()]);
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const MX = 8;
  const MY_TOP = 4;
  const COLS = 4;
  const GAP = 3;

  const sorted = [...allCults].sort((a, b) => a.date.localeCompare(b.date));
  const totalVol = Array.from(deptBlocksByCult.values()).reduce((sum, blocks) => sum + blocks.reduce((s, b) => s + b.scales.length, 0), 0);
  const subtitle = `${sorted.length} culto(s)  ·  ${totalVol} voluntário(s) escalado(s)  ·  ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;

  let headerY = drawMainHeader(doc, logo, title, subtitle, PW, churchName);
  let curY = headerY + MY_TOP;

  const colW = (PW - MX * 2 - GAP * (COLS - 1)) / COLS;
  const blockHeaderH = 8;
  const deptMiniH = 22;
  const blockPadB = 2;

  function blockHeight(cultId: number): number {
    const blocks = deptBlocksByCult.get(cultId) || [];
    const deptHeight = Math.max(deptMiniH * blocks.length, 40);
    return blockHeaderH + deptHeight + blockPadB;
  }

  let col = 0;
  let rowMaxH = 0;

  for (let i = 0; i < sorted.length; i++) {
    const cult = sorted[i];

    if (col === 0) {
      rowMaxH = 0;
      for (let j = i; j < Math.min(i + COLS, sorted.length); j++) {
        rowMaxH = Math.max(rowMaxH, blockHeight(sorted[j].id));
      }
      if (curY + rowMaxH > PH - 12) {
        doc.addPage();
        headerY = drawMainHeader(doc, logo, title, subtitle, PW, churchName);
        curY = headerY + MY_TOP;
      }
    }

    const bx = MX + col * (colW + GAP);
    const by = curY;

    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(bx, by, colW, rowMaxH, 'S');

    // Cabeçalho do bloco do culto
    doc.setFillColor(...C_BLOCK_HDR);
    doc.rect(bx, by, colW, blockHeaderH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_BLOCK_FG);
    doc.text(fmtDate(cult.date), bx + 2, by + 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(180, 175, 165);
    doc.text(fmtTime(cult.time), bx + colW - 2, by + 3, { align: 'right' });

    const typeName = cult.type_name || cult.name || '';
    if (typeName) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(5.5);
      doc.setTextColor(200, 185, 155);
      doc.text(typeName, bx + 2, by + 6.5, { maxWidth: colW - 4 });
    }

    // Mini-blocos de departamentos (dados reais da API)
    const deptGroups = deptBlocksByCult.get(cult.id) || [];

    if (deptGroups.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(5);
      doc.setTextColor(160, 150, 140);
      doc.text('Sem escalas', bx + 2, by + blockHeaderH + 5, { maxWidth: colW - 4 });
    } else {
      const miniBlockH = Math.floor((rowMaxH - blockHeaderH - 2) / Math.max(1, deptGroups.length));

      deptGroups.forEach((dept, deptIdx) => {
        const mbx = bx + 1;
        const mby = by + blockHeaderH + 1 + deptIdx * miniBlockH;
        const mbw = colW - 2;
        const mbh = miniBlockH - 0.5;

        doc.setFillColor(245, 243, 240);
        doc.setDrawColor(220, 215, 210);
        doc.setLineWidth(0.15);
        doc.rect(mbx, mby, mbw, mbh, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(4);
        doc.setTextColor(80, 70, 60);
        doc.text(dept.department_name, mbx + 1, mby + 2, { maxWidth: mbw - 2 });

        if (dept.scales.length === 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(3);
          doc.setTextColor(160, 150, 140);
          doc.text('vazio', mbx + 1, mby + 4);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(3.2);

          let miniY = mby + 4;
          const lineHeight = 1.8;
          const maxLines = Math.max(1, Math.floor((mbh - 3) / lineHeight));

          for (let k = 0; k < Math.min(maxLines, dept.scales.length); k++) {
            const scale = dept.scales[k];
            const statusSymbol = scale.status === 'Confirmado' ? '✓' :
                                 scale.status === 'Pendente' ? '○' :
                                 scale.status === 'Troca' ? '⇄' : '✗';

            doc.setTextColor(...statusColor(scale.status));
            doc.setFont('helvetica', 'bold');
            doc.text(statusSymbol, mbx + 0.8, miniY);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(40, 35, 30);
            doc.text((scale.member_name || '?').substring(0, 14), mbx + 2, miniY, { maxWidth: mbw - 3.5 });

            miniY += lineHeight;
          }

          if (dept.scales.length > maxLines) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(2.8);
            doc.setTextColor(150, 140, 130);
            doc.text(`+${dept.scales.length - maxLines}`, mbx + 0.8, miniY);
          }
        }
      });
    }

    col++;
    if (col >= COLS) {
      col = 0;
      curY += rowMaxH + GAP;
    }
  }

  // Legenda
  const legendY = PH - 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
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

  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, PW, PH, churchName);
  }

  doc.save(`escalas_${new Date().toISOString().slice(0, 7)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  exportScalePDF  — culto único (blocos por departamento) OU mês (grade paisagem)
// ─────────────────────────────────────────────────────────────────────────────
export async function exportScalePDF(
  scales: Scale[],
  cult: Cult | null,
  title: string,
  allScales?: Scale[],
  allCults?: Cult[],
  selectedSectors?: string[],
  selectedDepartmentIds?: number[],
  // Dados reais da API — usados quando disponíveis
  deptBlocks?: DeptBlock[],
  deptBlocksByCult?: Map<number, DeptBlock[]>,
) {
  // ── Culto único com blocos reais da API ───────────────────────────────────
  if (cult && deptBlocks) {
    let filtered = deptBlocks;
    if (selectedDepartmentIds && selectedDepartmentIds.length > 0) {
      filtered = deptBlocks.filter(b => b.department_id !== null && selectedDepartmentIds.includes(b.department_id));
    }
    return exportSingleCultBlocksPDF(filtered, cult, title);
  }

  // ── Mês inteiro com blocos reais da API ───────────────────────────────────
  if (allCults && allCults.length >= 1 && deptBlocksByCult) {
    let filteredMap = deptBlocksByCult;
    if (selectedDepartmentIds && selectedDepartmentIds.length > 0) {
      filteredMap = new Map();
      for (const [cultId, blocks] of deptBlocksByCult) {
        filteredMap.set(cultId, blocks.filter(b => b.department_id !== null && selectedDepartmentIds.includes(b.department_id!)));
      }
    }
    return exportMonthGridPDF(filteredMap, allCults, title);
  }

  // ── Fallback sem dados da API (não deve ocorrer no fluxo normal) ──────────
  if (cult) {
    return exportSingleCultBlocksPDF([], cult, title);
  }

  // Fallback (não deve chegar aqui)
  const [logo, churchName] = await Promise.all([fetchLogo(), fetchChurchName()]);
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const PW = doc.internal.pageSize.getWidth();
  const MX = 14;

  const subtitle = `${scales.length} voluntário(s)`;

  let y = drawMainHeader(doc, logo, title, subtitle, PW, churchName);

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

  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, PW, doc.internal.pageSize.getHeight(), churchName);
  }

  doc.save(`escala_${(cult?.date || 'culto').replace(/-/g,'')}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  exportMemberScalePDF — painel individual, agrupado por mês
// ─────────────────────────────────────────────────────────────────────────────
export async function exportMemberScalePDF(scales: Scale[], memberName: string) {
  const [logo, churchName] = await Promise.all([fetchLogo(), fetchChurchName()]);
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const PW = doc.internal.pageSize.getWidth();
  const MX = 14;

  const title = 'Minha Escala de Voluntariado';
  const subtitle = `${memberName}  ·  ${scales.length} escala(s)`;
  let y = drawMainHeader(doc, logo, title, subtitle, PW, churchName);

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
      y = drawMainHeader(doc, logo, title, subtitle, PW, churchName);
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
  if (y + 10 > 280) { doc.addPage(); y = drawMainHeader(doc, logo, title, subtitle, PW, churchName); }
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
    drawFooter(doc, p, total, PW, doc.internal.pageSize.getHeight(), churchName);
  }
  doc.save(`minha_escala_${memberName.replace(/\s+/g,'_')}.pdf`);
}
