import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Scale, Cult } from '../types';

async function fetchLogo(): Promise<string | null> {
  try {
    const r = await fetch('/api/settings/logo');
    const d = await r.json();
    return d?.value || null;
  } catch {
    return null;
  }
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
  const margin = 8;
  const blockGap = 5;

  // ─ HEADER ─
  doc.setFillColor(40, 40, 40);
  doc.rect(0, 0, pageWidth, 25, 'F');

  doc.setTextColor(255, 215, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, pageWidth / 2, 13, { align: 'center' });

  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const cultInfo = cult.date + ' · ' + cult.time + ' · ' + (cult.name || cult.type_name || 'Culto');
  doc.text(cultInfo, pageWidth / 2, 21, { align: 'center' });

  // ─ AGRUPAR ESCALAS POR DEPARTAMENTO ─
  const deptMap = new Map<string, Array<{ name: string; sector: string }>>();

  for (const scale of scales) {
    const sectorLower = (scale.sector_name || '').toLowerCase().trim();
    let dept = 'Sem Departamento';

    if (sectorLower.match(/^louvor/i)) {
      dept = 'Louvor';
    } else if (['filmagem', 'foto', 'som', 'iluminação', 'iluminacao', 'projeção', 'projecao'].includes(sectorLower)) {
      dept = 'Mídia';
    } else if (sectorLower.match(/^setor/i) || ['externo', 'máquina de cartão', 'maquina de cartao'].includes(sectorLower) || sectorLower.includes('recepção') || sectorLower.includes('recepcao')) {
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

  // ─ CALCULAR BLOCOS DINÂMICOS ─
  const deptsToPrint = deptOrder.filter(d => deptMap.has(d));
  const blocksPerRow = 2;
  const maxBlockWidth = (pageWidth - margin * 2 - blockGap) / blocksPerRow;
  const lineHeight = 4.5;
  const headerHeight = 10;
  const contentStartY = 30;

  // ─ RENDERIZAR BLOCOS DE DEPARTAMENTOS ─
  let blockIndex = 0;
  let currentX = margin;
  let currentY = contentStartY;

  for (const deptName of deptOrder) {
    if (!deptMap.has(deptName)) {
      continue;
    }

    const deptVoluntarios = deptMap.get(deptName)!;

    // Calcular altura do bloco baseado no conteúdo
    const blockHeight = headerHeight + (deptVoluntarios.length * lineHeight) + 4;

    // Verificar se precisa quebra de linha
    const blockCol = blockIndex % blocksPerRow;
    if (blockCol === 1) {
      // Segunda coluna - posicionar ao lado
      currentX = margin + maxBlockWidth + blockGap;
    } else if (blockCol === 0 && blockIndex > 0) {
      // Próxima linha
      currentY += blockHeight + blockGap + 2;
      currentX = margin;
    } else {
      // Primeira coluna
      currentX = margin;
    }

    const blockX = currentX;
    const blockY = currentY;
    const blockWidth = maxBlockWidth;

    // ─ BORDA DO BLOCO ─
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.6);
    doc.rect(blockX, blockY, blockWidth, blockHeight);

    // ─ HEADER DO DEPARTAMENTO ─
    doc.setFillColor(50, 50, 50);
    doc.rect(blockX, blockY, blockWidth, headerHeight, 'F');

    doc.setTextColor(255, 215, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(deptName.toUpperCase(), blockX + 3, blockY + 6.5);

    // ─ VOLUNTÁRIOS COM SETORES ─
    let volunteerY = blockY + headerHeight + 2;
    let rowCount = 0;

    for (const vol of deptVoluntarios) {
      // Background alternado
      if (rowCount % 2 === 1) {
        doc.setFillColor(240, 240, 240);
        doc.rect(blockX, volunteerY - 2.5, blockWidth, lineHeight - 0.5, 'F');
      }

      // Nome do voluntário
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(vol.name, blockX + 2, volunteerY);

      // Setor do voluntário
      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.text(vol.sector, blockX + blockWidth / 2, volunteerY);

      volunteerY += lineHeight;
      rowCount++;
    }

    blockIndex++;
  }

  // ─ RODAPÉ ─
  doc.setFillColor(40, 40, 40);
  doc.rect(0, pageHeight - 7, pageWidth, 7, 'F');

  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('EcclesiaScale', margin, pageHeight - 2.5);
  doc.text('Página 1 / 1', pageWidth - margin, pageHeight - 2.5, { align: 'right' });

  const filename = 'escala_' + (cult.date ? cult.date.replace(/-/g, '') : 'culto') + '.pdf';
  doc.save(filename);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF MÊS - GRID LANDSCAPE COM BLOCOS PEQUENOS AJUSTADOS
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
  const blockGap = 4;

  // ─ HEADER ─
  doc.setFillColor(40, 40, 40);
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setTextColor(255, 215, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, pageWidth / 2, 12, { align: 'center' });

  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const totalVols = allScales.length;
  const cultCount = allCults.length;
  doc.text(cultCount + ' culto(s) · ' + totalVols + ' voluntário(s)', pageWidth / 2, 18.5, { align: 'center' });

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

  // ─ LAYOUT DINÂMICO ─
  const colsPerPage = 4;
  const maxBlockWidth = (pageWidth - margin * 2 - blockGap * (colsPerPage - 1)) / colsPerPage;
  const maxBlockHeight = (pageHeight - 30) / 2 - blockGap;
  const minLineHeight = 2.8;

  let blockIndex = 0;
  let currentY = 28;
  let maxRowHeight = 0;

  // ─ RENDERIZAR CULTOS EM GRID ─
  for (const cult of sortedCults) {
    const cultScales = cultMap.get(cult.id) || [];

    const deptMap = new Map<string, number>();
    for (const scale of cultScales) {
      const sectorLower = (scale.sector_name || '').toLowerCase().trim();
      let dept = 'Outros';

      if (sectorLower.match(/^louvor/i)) {
        dept = 'Louvor';
      } else if (['filmagem', 'foto', 'som', 'iluminação', 'iluminacao', 'projeção', 'projecao'].includes(sectorLower)) {
        dept = 'Mídia';
      } else if (sectorLower.match(/^setor/i) || ['externo', 'máquina de cartão', 'maquina de cartao'].includes(sectorLower) || sectorLower.includes('recepção') || sectorLower.includes('recepcao')) {
        dept = 'Obreiros';
      } else if (sectorLower.match(/^una/i)) {
        dept = 'Una';
      } else if (sectorLower.includes('infantil')) {
        dept = 'Infantil';
      }

      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    }

    // Calcular altura do bloco baseado no conteúdo
    const deptCount = deptMap.size;
    const blockHeight = 8 + (deptCount * minLineHeight) + 2;

    const blockCol = blockIndex % colsPerPage;
    const blockRow = Math.floor(blockIndex / colsPerPage);

    // Verificar quebra de linha
    if (blockCol === 0 && blockIndex > 0) {
      currentY += maxRowHeight + blockGap;
      maxRowHeight = 0;
    }

    maxRowHeight = Math.max(maxRowHeight, blockHeight);

    const blockX = margin + blockCol * (maxBlockWidth + blockGap);
    const blockY = currentY;
    const blockWidth = maxBlockWidth;

    // ─ BLOCO DO CULTO ─
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.4);
    doc.rect(blockX, blockY, blockWidth, blockHeight);

    // ─ HEADER (DATA/HORA) ─
    doc.setFillColor(50, 50, 50);
    doc.rect(blockX, blockY, blockWidth, 8, 'F');

    doc.setTextColor(255, 215, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    const cultDateTime = cult.date + ' ' + cult.time;
    doc.text(cultDateTime, blockX + 2, blockY + 5.5);

    // ─ NOME DO CULTO ─
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    const cultName = cult.name || cult.type_name || 'Culto';
    doc.text(cultName, blockX + 2, blockY + 6.8);

    // ─ MINI-BLOCOS DE DEPARTAMENTOS ─
    let deptY = blockY + 9;
    for (const [deptName, count] of deptMap) {
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5);
      const deptText = deptName + ' (' + count + ')';
      doc.text(deptText, blockX + 2, deptY);
      deptY += minLineHeight;

      if (deptY > blockY + blockHeight - 1) {
        break;
      }
    }

    blockIndex++;
  }

  // ─ RODAPÉ ─
  doc.setFillColor(40, 40, 40);
  doc.rect(0, pageHeight - 6, pageWidth, 6, 'F');

  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.text('EcclesiaScale', margin, pageHeight - 2);
  doc.text('Página 1 / 1', pageWidth - margin, pageHeight - 2, { align: 'right' });

  const filename = 'escalas_' + new Date().toISOString().slice(0, 7) + '.pdf';
  doc.save(filename);
}

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
  doc.text(memberName, 10, 10);
  doc.save('membro_' + memberName + '.pdf');
}
