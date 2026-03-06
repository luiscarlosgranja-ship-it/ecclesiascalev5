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

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C_HEADER_BG:  [number,number,number] = [28,  25,  23 ];  // stone-900
const C_HEADER_FG:  [number,number,number] = [251, 191, 36 ];  // amber-400
const C_BLOCK_HDR:  [number,number,number] = [55,  48,  44 ];  // stone-700  (cabeçalho do bloco)
const C_BLOCK_FG:   [number,number,number] = [245, 245, 244];  // stone-50
const C_ROW_ODD:    [number,number,number] = [255, 255, 255];  // white
const C_ROW_EVEN:   [number,number,number] = [229, 229, 229];  // neutral-200
const C_BORDER:     [number,number,number] = [120, 113, 108];  // stone-500

function statusColor(status: any): [number, number, number] {
  const s = typeof status === 'string' ? status.toLowerCase() : '';
  if (s.includes('confirmado') || s.includes('ok')) return [19, 161, 14];
  if (s.includes('pendente')) return [220, 38, 38];
  if (s.includes('troca')) return [59, 130, 246];
  return [107, 114, 128];
}

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
  const hh = 16;

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
  doc.setFontSize(7);
  doc.setTextColor(130, 120, 110);
  doc.text(
    'Emitido ' + now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}),
    pw - MX - 2, y0 + 13, { align: 'right' }
  );

  return y0 + hh + 4;
}

// ─── Rodapé ───────────────────────────────────────────────────────────────────
function drawFooter(doc: jsPDF, page: number, total: number, pw: number, ph: number) {
  const y = ph - 6;
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.2);
  doc.line(10, y, pw - 10, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(150, 140, 130);
  doc.text('EcclesiaScale', 10, y + 2);
  doc.text('Página ' + page + ' / ' + total, pw - 10, y + 2, { align: 'right' });
}

function fmtDate(d: string): string {
  try {
    const [y, m, da] = d.split('-');
    return da + '/' + m + '/' + y;
  } catch { return d; }
}

function fmtTime(t: string): string {
  return t || '--:--';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF CULTO INDIVIDUAL - BLOCOS POR DEPARTAMENTO (LANDSCAPE)
// ═══════════════════════════════════════════════════════════════════════════════

export async function exportCultoPDFBlocos(
  scales: Scale[],
  cult: Cult,
  title: string,
) {
  const logo = await fetchLogo();
  const doc = new jsPDF({
    orientation: 'landscape',
    format: 'a4',
    unit: 'mm',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 10;

  // ─ HEADER ─
  doc.setFillColor(40, 40, 40);
  doc.rect(0, 0, pageWidth, 30, 'F');

  doc.setTextColor(255, 215, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, pageWidth / 2, 15, { align: 'center' });

  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    cult.date + ' · ' + cult.time + ' · ' + (cult.name || cult.type_name),
    pageWidth / 2,
    23,
    { align: 'center' }
  );

  // ─ AGRUPAR ESCALAS POR DEPARTAMENTO ─
  const deptMap = new Map<string, Array<{ name: string; sector: string }>>();

  for (const scale of scales) {
    const sectorLower = (scale.sector_name || '').toLowerCase().trim();
    let dept = 'Sem Departamento';

    if (sectorLower.match(/^louvor/i)) {
      dept = 'Louvor';
    } else if (
      ['filmagem', 'foto', 'som', 'iluminação', 'iluminacao', 'projeção', 'projecao'].includes(
        sectorLower
      )
    ) {
      dept = 'Mídia';
    } else if (
      sectorLower.match(/^setor/i) ||
      ['externo', 'máquina de cartão', 'maquina de cartao'].includes(sectorLower) ||
      sectorLower.includes('recepção') ||
      sectorLower.includes('recepcao')
    ) {
      dept = 'Obreiros / Diáconos';
    } else if (sectorLower.match(/^una/i)) {
      dept = 'Una';
    } else if (sectorLower.includes('infantil') || sectorLower.includes('departamento')) {
      dept = 'Infantil';
    }

    if (!deptMap.has(dept)) {
      deptMap.set(dept, []);
    }

    deptMap.get(dept)!.push({
      name: scale.member_name || '—',
      sector: scale.sector_name || '—',
    });
  }

  // ─ ORDEM PADRÃO DOS DEPARTAMENTOS ─
  const deptOrder = [
    'Obreiros / Diáconos',
    'Louvor',
    'Mídia',
    'Infantil',
    'Una',
    'Bem-Vindos',
  ];

  // ─ CALCULAR LAYOUT EM GRID ─
  const deptsToPrint = deptOrder.filter(d => deptMap.has(d));
  const blocksPerRow = 2;
  const blockWidth = (pageWidth - margin * 2 - 10) / blocksPerRow;
  const blockHeight = (pageHeight - 50) / 2;

  // ─ RENDERIZAR BLOCOS DE DEPARTAMENTOS ─
  let blockIndex = 0;

  for (const deptName of deptOrder) {
    if (!deptMap.has(deptName)) continue;

    const deptVoluntarios = deptMap.get(deptName)!;
    const blockCol = blockIndex % blocksPerRow;
    const blockRow = Math.floor(blockIndex / blocksPerRow);

    const blockX = margin + blockCol * (blockWidth + 10);
    const blockY = 35 + blockRow * (blockHeight + 5);

    // ─ BORDA DO BLOCO ─
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.7);
    doc.rect(blockX, blockY, blockWidth, blockHeight);

    // ─ HEADER DO DEPARTAMENTO ─
    doc.setFillColor(50, 50, 50);
    doc.rect(blockX, blockY, blockWidth, 12, 'F');

    doc.setTextColor(255, 215, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(deptName.toUpperCase(), blockX + 4, blockY + 8);

    // ─ VOLUNTÁRIOS COM SETORES ─
    let volunteerY = blockY + 14;
    let rowCount = 0;

    for (const vol of deptVoluntarios) {
      if (rowCount % 2 === 1) {
        doc.setFillColor(240, 240, 240);
        doc.rect(blockX, volunteerY - 3, blockWidth, 5, 'F');
      }

      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(vol.name, blockX + 3, volunteerY);

      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(vol.sector, blockX + blockWidth / 2 + 2, volunteerY);

      volunteerY += 5;
      rowCount++;

      if (volunteerY > blockY + blockHeight - 2) break;
    }

    blockIndex++;
  }

  // ─ RODAPÉ ─
  doc.setFillColor(40, 40, 40);
  doc.rect(0, pageHeight - 8, pageWidth, 8, 'F');

  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('EcclesiaScale', margin, pageHeight - 3);
  doc.text('Página 1 / 1', pageWidth - margin, pageHeight - 3, { align: 'right' });

  const filename = 'escala_' + (cult.date || 'culto').replace(/-/g, '') + '.pdf';
  doc.save(filename);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF MÊS - GRID LANDSCAPE COM BLOCOS PEQUENOS
// ═══════════════════════════════════════════════════════════════════════════════

export async function exportMesGridPDFBlocos(
  allScales: Scale[],
  allCults: Cult[],
  title: string,
) {
  const logo = await fetchLogo();
  const doc = new jsPDF({
    orientation: 'landscape',
    format: 'a4',
    unit: 'mm',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 8;

  // ─ HEADER ─
  doc.setFillColor(40, 40, 40);
  doc.rect(0, 0, pageWidth, 25, 'F');

  doc.setTextColor(255, 215, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, pageWidth / 2, 12, { align: 'center' });

  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const totalVols = allScales.length;
  doc.text(allCults.length + ' culto(s) · ' + totalVols + ' voluntário(s)', pageWidth / 2, 20, {
    align: 'center',
  });

  // ─ ORDENAR CULTOS POR DATA ─
  const sortedCults = [...allCults].sort((a, b) => a.date.localeCompare(b.date));

  // ─ AGRUPAR ESCALAS POR CULTO ─
  const cultMap = new Map<number, Scale[]>();
  for (const scale of allScales) {
    if (!cultMap.has(scale.cult_id)) {
      cultMap.set(scale.cult_id, []);
    }
    cultMap.get(scale.cult_id)!.push(scale);
  }

  // ─ LAYOUT GRID ─
  const colsPerPage = 4;
  const rowsPerPage = 2;
  const blockW = (pageWidth - margin * 2) / colsPerPage - 5;
  const blockH = (pageHeight - 35) / rowsPerPage - 5;

  let blockIndex = 0;
  let curY = 30;

  // ─ RENDERIZAR CULTOS EM GRID ─
  for (const cult of sortedCults) {
    const cultScales = cultMap.get(cult.id) || [];

    const deptMap = new Map<string, number>();
    for (const scale of cultScales) {
      const sectorLower = (scale.sector_name || '').toLowerCase().trim();
      let dept = 'Outros';

      if (sectorLower.match(/^louvor/i)) {
        dept = 'Louvor';
      } else if (
        ['filmagem', 'foto', 'som', 'iluminação', 'iluminacao', 'projeção', 'projecao'].includes(
          sectorLower
        )
      ) {
        dept = 'Mídia';
      } else if (
        sectorLower.match(/^setor/i) ||
        ['externo', 'máquina de cartão', 'maquina de cartao'].includes(sectorLower) ||
        sectorLower.includes('recepção') ||
        sectorLower.includes('recepcao')
      ) {
        dept = 'Obreiros';
      } else if (sectorLower.match(/^una/i)) {
        dept = 'Una';
      } else if (sectorLower.includes('infantil')) {
        dept = 'Infantil';
      }

      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    }

    const blockCol = blockIndex % colsPerPage;
    const blockRow = Math.floor(blockIndex / colsPerPage);

    if (blockRow > 0 && blockCol === 0) {
      curY += blockH + 5;
    }

    const blockX = margin + blockCol * (blockW + 5);
    const blockY = curY;

    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.4);
    doc.rect(blockX, blockY, blockW, blockH);

    doc.setFillColor(50, 50, 50);
    doc.rect(blockX, blockY, blockW, 8, 'F');

    doc.setTextColor(255, 215, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(cult.date + ' ' + cult.time, blockX + 2, blockY + 6);

    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(cult.name || cult.type_name || 'Culto', blockX + 2, blockY + 12);

    let deptY = blockY + 14;
    for (const [deptName, count] of deptMap) {
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5);
      doc.text(deptName + ' (' + count + ')', blockX + 2, deptY);
      deptY += 3;

      if (deptY > blockY + blockH - 2) break;
    }

    blockIndex++;
  }

  // ─ RODAPÉ ─
  doc.setFillColor(40, 40, 40);
  doc.rect(0, pageHeight - 6, pageWidth, 6, 'F');

  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('EcclesiaScale', margin, pageHeight - 2);
  doc.text('Página 1 / 1', pageWidth - margin, pageHeight - 2, { align: 'right' });

  const filename = 'escalas_' + new Date().toISOString().slice(0, 7) + '.pdf';
  doc.save(filename);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function exportScalePDF(
  scales: Scale[],
  cult: Cult | null,
  title: string,
  allScales?: Scale[],
  allCults?: Cult[],
) {
  if (allScales && allCults && allCults.length > 1) {
    return exportMesGridPDFBlocos(allScales, allCults, title);
  }

  if (cult && scales.length > 0) {
    return exportCultoPDFBlocos(scales, cult, title);
  }
}

export async function exportMemberScalePDF(scales: Scale[], memberName: string) {
  const doc = new jsPDF();
  const PW = doc.internal.pageSize.getWidth();
  doc.text(memberName, 10, 10);
  doc.save('membro_' + memberName + '.pdf');
}
