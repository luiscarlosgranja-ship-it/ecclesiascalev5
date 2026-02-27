import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Scale, Cult } from '../types';

export function exportScalePDF(scales: Scale[], cult: Cult | null, title: string) {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 14, 20);

  if (cult) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Culto: ${cult.name || cult.type_name || ''} | Data: ${cult.date} | Horário: ${cult.time}`, 14, 30);
  }

  autoTable(doc, {
    startY: cult ? 38 : 28,
    head: [['#', 'Voluntário', 'Setor', 'Status']],
    body: scales.map((s, i) => [
      i + 1,
      s.member_name || '',
      s.sector_name || '',
      s.status,
    ]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 30, 50] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
}

export function exportMemberScalePDF(scales: Scale[], memberName: string) {
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Minha Escala', 14, 20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Voluntário: ${memberName}`, 14, 30);

  autoTable(doc, {
    startY: 38,
    head: [['Data', 'Culto', 'Setor', 'Horário', 'Status']],
    body: scales.map(s => [
      s.cult_date || '',
      s.cult_name || '',
      s.sector_name || '',
      s.cult_time || '',
      s.status,
    ]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 30, 50] },
  });

  doc.save(`escala_${memberName.replace(/\s+/g, '_')}.pdf`);
}
