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
//  CULTO ÚNICO COM BLOCOS DE DEPARTAMENTO
//  Layout: retrato, blocos em grade (2 colunas ou 1 linha)
// ─────────────────────────────────────────────────────────────────────────────
interface DepartmentGroup {
  name: string;
  scales: Scale[];
}

// Mapeamento explícito de setores para departamentos (case-insensitive)
const SETOR_DEPARTMENT_MAP: { [key: string]: string } = {
  // Diáconos / Obreiros
  'setor 1': 'Diáconos / Obreiros',
  'setor 2': 'Diáconos / Obreiros',
  'setor 3': 'Diáconos / Obreiros',
  'setor 4': 'Diáconos / Obreiros',
  'maquininhas': 'Diáconos / Obreiros',
  'máquina de cartão': 'Diáconos / Obreiros',
  'maquina de cartao': 'Diáconos / Obreiros',
  'máquinas de cartão': 'Diáconos / Obreiros',
  'maquinas de cartao': 'Diáconos / Obreiros',
  'recepção': 'Diáconos / Obreiros',
  'recepcao': 'Diáconos / Obreiros',
  'externo': 'Diáconos / Obreiros',
  
  // Mídia
  'som': 'Mídia',
  'filmagem': 'Mídia',
  'foto': 'Mídia',
  'transmissão': 'Mídia',
  'transmissao': 'Mídia',
  'câmera': 'Mídia',
  'camera': 'Mídia',
  'iluminação': 'Mídia',
  'iluminacao': 'Mídia',
  'redes sociais': 'Mídia',
  'mídia': 'Mídia',
  'media': 'Mídia',
  
  // Infantil
  'infantil': 'Infantil',
  'berçário': 'Infantil',
  'bercario': 'Infantil',
  'escola bíblica': 'Infantil',
  'escola biblica': 'Infantil',
  
  // Louvor
  'bateria': 'Louvor',
  'back 1': 'Louvor',
  'back 2': 'Louvor',
  'back 3': 'Louvor',
  'back 4': 'Louvor',
  'vocal': 'Louvor',
  'violão': 'Louvor',
  'violao': 'Louvor',
  'baixo': 'Louvor',
  'guitarra': 'Louvor',
  'teclado': 'Louvor',
  'louvor': 'Louvor',
  'música': 'Louvor',
  'musica': 'Louvor',
  'canto': 'Louvor',
  
  // Una
  'una': 'Una',
  'una 1': 'Una',
  'una 2': 'Una',
  
  // Bem-Vindos
  'bem-vindos': 'Bem-Vindos',
  'bem vindos': 'Bem-Vindos',
  'bem-vindo': 'Bem-Vindos',
  'bem vindo': 'Bem-Vindos',
  'recepção de bem-vindos': 'Bem-Vindos',
  'recepcao de bem-vindos': 'Bem-Vindos',
  'boas-vindas': 'Bem-Vindos',
  'boas vindas': 'Bem-Vindos',
};

// Ordem fixa dos departamentos
const DEPARTMENT_ORDER = [
  'Diáconos / Obreiros',
  'Mídia',
  'Infantil',
  'Louvor',
  'Una',
  'Bem-Vindos',
];

function groupScalesByDepartment(scales: Scale[]): DepartmentGroup[] {
  // Agrupar escalas por departamento usando o mapeamento
  const deptMap = new Map<string, Scale[]>();
  
  console.log('=== AGRUPAMENTO DE DEPARTAMENTOS ===');
  console.log('Escalas recebidas:', scales.length);
  console.log('Mapeamento disponível:', Object.keys(SETOR_DEPARTMENT_MAP).length, 'setores mapeados');
  
  for (const scale of scales) {
    const sectorName = scale.sector_name || 'Sem Setor';
    const sectorLower = sectorName.toLowerCase().trim();
    
    // Procurar no mapeamento
    let deptName = SETOR_DEPARTMENT_MAP[sectorLower];
    
    // Se não encontrou, mostrar aviso e usar o nome do setor como departamento
    if (!deptName) {
      console.warn(`⚠️ Setor não mapeado: "${sectorName}" (${sectorLower})`);
      deptName = sectorName;
    }
    
    console.log(`"${sectorName}" → "${deptName}"`);
    
    if (!deptMap.has(deptName)) {
      deptMap.set(deptName, []);
    }
    deptMap.get(deptName)!.push(scale);
  }
  
  console.log('Departamentos encontrados:', Array.from(deptMap.keys()));
  console.log('Ordem esperada:', DEPARTMENT_ORDER);
  
  // Retornar na ordem fixa dos departamentos
  const result: DepartmentGroup[] = [];
  
  // Primeiro: adicionar departamentos na ordem fixa (se houver escalas)
  for (const deptName of DEPARTMENT_ORDER) {
    if (deptMap.has(deptName)) {
      result.push({
        name: deptName,
        scales: deptMap.get(deptName)!
      });
      console.log(`✅ Adicionado: ${deptName} (${deptMap.get(deptName)!.length} escalas)`);
      deptMap.delete(deptName);
    }
  }
  
  // Depois: adicionar departamentos não mapeados no final
  for (const [deptName, scaleList] of deptMap) {
    console.warn(`⚠️ Departamento não padrão encontrado: "${deptName}" (${scaleList.length} escalas)`);
    result.push({ name: deptName, scales: scaleList });
  }
  
  console.log('Resultado final:', result.map(r => ({ name: r.name, count: r.scales.length })));
  console.log('=== FIM DO AGRUPAMENTO ===');
  
  return result;
}

async function exportSingleCultBlocksPDF(
  scales: Scale[],
  cult: Cult,
  title: string,
) {
  const logo = await fetchLogo();
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const PW = doc.internal.pageSize.getWidth();  // 210mm
  const PH = doc.internal.pageSize.getHeight(); // 297mm
  const MX = 12;
  const MY = 8;
  
  const subtitle = `${fmtDate(cult.date)}  ·  ${fmtTime(cult.time)}`;
  let curY = drawMainHeader(doc, logo, title, subtitle, PW);
  curY += 4;

  const deptGroups = groupScalesByDepartment(scales);
  const contentW = PW - MX * 2;
  const blockW = contentW / 2 - 2; // 2 colunas com espaço entre
  const blockPadding = 3;
  const blockBorderW = 0.3;

  let col = 0;
  let maxRowH = 0;

  for (let i = 0; i < deptGroups.length; i++) {
    const deptGroup = deptGroups[i];
    
    // Agrupar escalas por setor dentro do departamento
    const sectorMap = new Map<string, Scale[]>();
    for (const scale of deptGroup.scales) {
      const sectorName = scale.sector_name || 'Sem Setor';
      if (!sectorMap.has(sectorName)) {
        sectorMap.set(sectorName, []);
      }
      sectorMap.get(sectorName)!.push(scale);
    }
    const sectors = Array.from(sectorMap.entries()).map(([name, scales]) => ({
      sectorName: name,
      scales: scales
    }));
    
    // Calcula altura do bloco
    const headerH = 6;
    const sectorHeaderH = 4;
    const rowH = 4;
    const footerH = 2;
    const totalScales = sectors.reduce((sum, s) => sum + s.scales.length, 0);
    const blockH = headerH + (sectors.length * sectorHeaderH) + (totalScales * rowH) + footerH;
    
    if (col === 0) {
      maxRowH = blockH;
    } else {
      maxRowH = Math.max(maxRowH, blockH);
    }

    // Verificar quebra de página
    if (curY + maxRowH > PH - 15 && col === 0) {
      doc.addPage();
      curY = drawMainHeader(doc, logo, title, subtitle, PW) + 4;
      col = 0;
      maxRowH = blockH;
    }

    const bx = MX + col * (blockW + 4);
    const by = curY;

    // ── Desenha o bloco ─────────────────────────────────────────────
    
    // Borda do bloco
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(blockBorderW);
    doc.rect(bx, by, blockW, blockH, 'S');

    // Cabeçalho do bloco (DEPARTAMENTO)
    doc.setFillColor(...C_BLOCK_HDR);
    doc.rect(bx, by, blockW, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_BLOCK_FG);
    doc.text(deptGroup.name.toUpperCase(), bx + blockPadding, by + 4.5, { maxWidth: blockW - blockPadding * 2 });

    // Conteúdo: Setores e Voluntários
    let contentY = by + headerH;
    
    sectors.forEach((sector) => {
      // Cabeçalho do setor (sub-header)
      doc.setFillColor(200, 190, 180);
      doc.rect(bx, contentY, blockW, sectorHeaderH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(50, 45, 40);
      doc.text(sector.sectorName, bx + blockPadding, contentY + 3, { maxWidth: blockW - blockPadding * 2 });
      contentY += sectorHeaderH;

      // Voluntários do setor
      sector.scales.forEach((scale, scaleIdx) => {
        const bgColor = scaleIdx % 2 === 0 ? C_ROW_ODD : C_ROW_EVEN;
        doc.setFillColor(...bgColor);
        doc.rect(bx, contentY, blockW, rowH, 'F');

        // Nome do voluntário (coluna esquerda)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.setTextColor(50, 45, 40);
        doc.text(scale.member_name || '—', bx + blockPadding, contentY + 2.5, { maxWidth: blockW / 2 - blockPadding });

        // Setor do voluntário (coluna direita)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.setTextColor(100, 95, 90);
        doc.text(scale.sector_name || '—', bx + blockW / 2 + blockPadding, contentY + 2.5, { maxWidth: blockW / 2 - blockPadding * 2 });

        contentY += rowH;
      });
    });

    col++;
    if (col >= 2) {
      col = 0;
      curY += maxRowH + MY;
    }
  }

  // Rodapé
  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, PW, PH);
  }

  doc.save(`escala_${(cult?.date || 'culto').replace(/-/g,'')}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  GRADE DE CULTOS — layout igual à imagem de referência
//  Landscape A4, 4 colunas, cada célula = bloco de um culto com mini-blocos de departamentos
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
  const MX = 6;
  const MY = 6;

  // Ordena cultos por data
  const sorted = [...allCults].sort((a, b) => a.date.localeCompare(b.date));

  const totalVol = allScales.length;
  const subtitle = `${sorted.length} culto(s) · ${totalVol} voluntário(s) escalado(s) · ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;

  let curY = drawMainHeader(doc, logo, title, subtitle, PW);
  curY += 3;

  // Agrupar escalas por culto
  const cultMap = new Map<number, Scale[]>();
  console.log('📊 Mês PDF: Total de escalas:', allScales.length);
  for (const scale of allScales) {
    if (!cultMap.has(scale.cult_id)) {
      cultMap.set(scale.cult_id, []);
    }
    cultMap.get(scale.cult_id)!.push(scale);
  }
  console.log('📊 Mês PDF: Cultos encontrados:', cultMap.size);

  // Calcular altura máxima de um bloco
  function calcBlockHeight(cult: Cult): number {
    const cultScales = cultMap.get(cult.id) || [];
    const deptMap = new Map<string, number>();
    
    for (const scale of cultScales) {
      const sectorLower = (scale.sector_name || '').toLowerCase().trim();
      const deptName = SETOR_DEPARTMENT_MAP[sectorLower] || scale.department_name || 'Sem Departamento';
      deptMap.set(deptName, (deptMap.get(deptName) || 0) + 1);
    }

    const headerH = 7;     // header preto com data/hora/nome
    const deptHeaderH = 3.5; // nome departamento
    const rowH = 2.8;      // cada linha de voluntário
    const deptGapH = 1;    // espaço entre departamentos
    
    let contentH = 0;
    for (const count of deptMap.values()) {
      contentH += deptHeaderH + (count * rowH) + deptGapH;
    }

    return headerH + contentH + 2;
  }

  // Calcular número de colunas baseado na altura disponível
  const availableH = PH - curY - 12; // espaço para rodapé
  const minBlockH = Math.max(...sorted.map(c => calcBlockHeight(c)));
  
  let numCols = Math.floor((PW - MX * 2) / 100); // ~100mm por coluna mínimo
  numCols = Math.max(1, Math.min(numCols, sorted.length));

  // Ajustar largura das colunas
  const GAP = 3;
  const blockW = (PW - MX * 2 - GAP * (numCols - 1)) / numCols;

  // Renderizar cultos em grid
  let col = 0;
  let row = 0;
  let blockX = MX;
  let blockY = curY;

  for (let i = 0; i < sorted.length; i++) {
    const cult = sorted[i];
    const bh = calcBlockHeight(cult);
    const cultScales = cultMap.get(cult.id) || [];

    // Agrupar por departamento (usando mapeamento de setor)
    const deptMap = new Map<string, Scale[]>();
    for (const scale of cultScales) {
      const sectorLower = (scale.sector_name || '').toLowerCase().trim();
      let deptName = SETOR_DEPARTMENT_MAP[sectorLower] || scale.department_name || 'Sem Departamento';
      
      if (!deptMap.has(deptName)) {
        deptMap.set(deptName, []);
      }
      deptMap.get(deptName)!.push(scale);
    }

    // Desenhar bloco
    // Header preto
    doc.setFillColor(50, 45, 40);
    doc.rect(blockX, blockY, blockW, 7, 'F');

    // Data e hora em branco
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`${cult.date}  ${cult.time}`, blockX + 2, blockY + 3);

    // Nome culto em branco
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(cult.name || cult.type_name || 'Culto', blockX + 2, blockY + 5.5);

    let contentY = blockY + 7;

    // Departamentos
    const deptOrder = ['Diáconos / Obreiros', 'Mídia', 'Infantil', 'Louvor', 'Una', 'Bem-Vindos'];
    let rowCount = 0;

    for (const deptName of deptOrder) {
      const scales = deptMap.get(deptName);
      if (!scales || scales.length === 0) continue;

      // Nome do departamento
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(50, 45, 40);
      doc.text(deptName, blockX + 1.5, contentY + 2);
      contentY += 3.5;

      // Voluntários com cores alternadas
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      
      for (const scale of scales) {
        // Background alternado (branco/cinza)
        if (rowCount % 2 === 1) {
          doc.setFillColor(240, 240, 240);
          doc.rect(blockX, contentY - 2.5, blockW, 2.8, 'F');
        }

        doc.setTextColor(80, 75, 70);
        const text = `${scale.member_name || '—'} ${scale.sector_name || '—'}`;
        doc.text(text, blockX + 1.5, contentY);
        contentY += 2.8;
        rowCount++;
      }

      contentY += 1;
    }

    // Borda do bloco
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.rect(blockX, blockY, blockW, contentY - blockY);

    // Próxima posição
    col++;
    if (col >= numCols) {
      col = 0;
      row++;
      blockX = MX;
      blockY += contentY - blockY + MY;
    } else {
      blockX += blockW + GAP;
    }
  }

  // Rodapé
  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, PW, PH);
  }

  doc.save(`escalas_${new Date().toISOString().slice(0, 7)}.pdf`);
}





function groupScalesByDepartmentForMonth(scales: Scale[]): DepartmentGroup[] {
  // Se não há escalas, retorna array vazio
  if (!scales || scales.length === 0) {
    return [];
  }
  
  // Usar o mesmo mapeamento que no culto individual
  const deptMap = new Map<string, Scale[]>();
  
  for (const scale of scales) {
    const sectorName = scale.sector_name || 'Sem Setor';
    // Converter para lowercase para buscar no mapeamento
    const sectorLower = sectorName.toLowerCase().trim();
    const deptName = SETOR_DEPARTMENT_MAP[sectorLower] || sectorName;
    
    if (!deptMap.has(deptName)) {
      deptMap.set(deptName, []);
    }
    deptMap.get(deptName)!.push(scale);
  }
  
  // Retornar na ordem fixa dos departamentos (nomes curtos para mês)
  const result: DepartmentGroup[] = [];
  const shortNames: { [key: string]: string } = {
    'Diáconos / Obreiros': 'Diáconos',
    'Mídia': 'Mídia',
    'Infantil': 'Infantil',
    'Louvor': 'Louvor',
    'Una': 'Una',
    'Bem-Vindos': 'Bem-Vindos',
  };
  
  for (const deptName of DEPARTMENT_ORDER) {
    if (deptMap.has(deptName)) {
      result.push({
        name: shortNames[deptName] || deptName,
        scales: deptMap.get(deptName)!
      });
      deptMap.delete(deptName);
    }
  }
  
  // Adicionar departamentos não mapeados
  for (const [deptName, scaleList] of deptMap) {
    result.push({ name: deptName, scales: scaleList });
  }
  
  return result;
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
) {
  // Mapeamento de department_id para nome
  const DEPT_MAP: { [key: number]: string } = {
    1: 'Diáconos / Obreiros',
    2: 'Mídia',
    3: 'Infantil',
    4: 'Louvor',
    5: 'Una',
    6: 'Bem-Vindos',
  };
  
  // Filtrar escalas pelos departamentos selecionados se fornecido
  let filteredScales = scales;
  if (selectedDepartmentIds && selectedDepartmentIds.length > 0) {
    // Precisamos agrupar por departamento através do setor
    // Usar o mapeamento do pdf.ts
    filteredScales = scales.filter(s => {
      const sectorLower = (s.sector_name || '').toLowerCase().trim();
      let deptName = SETOR_DEPARTMENT_MAP[sectorLower] || s.sector_name;
      
      // Procurar se este departamento está selecionado
      return selectedDepartmentIds.some(deptId => {
        const selectedDeptName = DEPT_MAP[deptId];
        return deptName === selectedDeptName;
      });
    });
  }

  // Filtrar escalas pelos setores selecionados, se informados
  if (selectedSectors && selectedSectors.length > 0) {
    filteredScales = filteredScales.filter(s => selectedSectors.includes(s.sector_name || ''));
  }

  // Mês inteiro → grade landscape
  if (allScales && allCults && allCults.length > 1) {
    let filteredAllScales = allScales;
    if (selectedDepartmentIds && selectedDepartmentIds.length > 0) {
      filteredAllScales = allScales.filter(s => {
        const sectorLower = (s.sector_name || '').toLowerCase().trim();
        let deptName = SETOR_DEPARTMENT_MAP[sectorLower] || s.sector_name;
        return selectedDepartmentIds.some(deptId => {
          const selectedDeptName = DEPT_MAP[deptId];
          return deptName === selectedDeptName;
        });
      });
    }
    if (selectedSectors && selectedSectors.length > 0) {
      filteredAllScales = filteredAllScales.filter(s => selectedSectors.includes(s.sector_name || ''));
    }
    return exportMonthGridPDF(filteredAllScales, allCults, title);
  }

  // Culto único → blocos de departamento
  if (cult) {
    return exportSingleCultBlocksPDF(filteredScales, cult, title);
  }

  // Fallback (não deve chegar aqui)
  const logo = await fetchLogo();
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const PW = doc.internal.pageSize.getWidth();
  const MX = 14;

  const subtitle = `${scales.length} voluntário(s)`;

  let y = drawMainHeader(doc, logo, title, subtitle, PW);

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
