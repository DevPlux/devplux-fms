/**
 * DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
 * Export Utilities: High-Precision PDF Financial Statements
 */

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export interface PDFTableColumn {
  header: string;
  dataKey: string;
}

export interface PDFExportOptions {
  title: string;
  subtitle?: string;
  period?: string;
  currency?: string;
  filename: string;
  columns: PDFTableColumn[];
  rows: Record<string, unknown>[];
  summaryTotals?: Record<string, string | number>;
}

export function generateFinancialPDF(options: PDFExportOptions): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Company Header
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // Navy 900
  doc.setFont('helvetica', 'bold');
  doc.text('DEVPLUX (PVT) LTD', 14, 18);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.setFont('helvetica', 'normal');
  doc.text('Company Reg No: PV-00289144 | Corporate Financial Management System', 14, 24);

  // Divider Line
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.5);
  doc.line(14, 27, pageWidth - 14, 27);

  // Document Title & Metadata
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(options.title.toUpperCase(), 14, 35);

  let currentY = 41;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  if (options.period) {
    doc.text(`Reporting Period: ${options.period}`, 14, currentY);
    currentY += 5;
  }

  const generatedDate = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Generated On: ${generatedDate} (UTC+05:30) | Currency: ${options.currency || 'LKR'}`, 14, currentY);
  currentY += 7;

  // Build Table
  const tableHeaders = options.columns.map((c) => c.header);
  const tableData = options.rows.map((row) =>
    options.columns.map((c) => String(row[c.dataKey] ?? '—'))
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY: currentY,
    head: [tableHeaders],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42], // Dark navy blue
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data: { pageNumber: number }) => {
      // Footer page numbering
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} — Devplux (Pvt) Ltd Confidential Financial Record`,
        14,
        doc.internal.pageSize.getHeight() - 10
      );
    },
  });

  doc.save(`${options.filename}.pdf`);
}
