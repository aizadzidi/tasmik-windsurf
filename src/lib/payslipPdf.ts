import JsPdf from "jspdf";
import autoTable from "jspdf-autotable";
import type { MonthlyPayroll } from "@/types/payroll";
import { formatRM } from "@/types/payroll";

function formatMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .toLowerCase();
}

async function loadLogo(): Promise<string | null> {
  const paths = ["/icon.png", "/icon", "/apple-icon.png"];
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (!res.ok) continue;
      const blob = await res.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      continue;
    }
  }
  return null;
}

export async function downloadPayslipPdf(
  payroll: MonthlyPayroll,
  tenantName?: string
): Promise<void> {
  const doc = new JsPdf({ orientation: "p", unit: "mm", format: "a4" });
  const margin = 14;
  const pageWidth = 210;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Header ──
  const logo = await loadLogo();
  if (logo) {
    doc.addImage(logo, "PNG", margin, y, 11, 11);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  doc.text(tenantName || "Payslip", margin + (logo ? 14 : 0), y + 5);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(107, 114, 128);
  doc.text("PAYSLIP", margin + (logo ? 14 : 0), y + 10);
  doc.text(formatMonth(payroll.payroll_month), pageWidth - margin, y + 5, {
    align: "right",
  });
  y += 18;

  // Divider
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ── Staff info ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(55, 65, 81);
  const staffInfo = [
    ["Employee", payroll.staff_name],
    ["Position", payroll.staff_position || "-"],
    ["Working Days", String(payroll.working_days)],
    ["Daily Rate", formatRM(payroll.daily_rate)],
  ];
  for (const [label, value] of staffInfo) {
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, margin + 40, y);
    doc.setFont("helvetica", "normal");
    y += 5;
  }
  y += 4;

  // ── Earnings ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(31, 41, 55);
  doc.text("EARNINGS", margin, y);
  y += 2;

  const earningsRows: [string, string][] = [
    ["Basic Salary", formatRM(payroll.basic_salary)],
  ];
  if (payroll.housing_allowance > 0)
    earningsRows.push(["Housing Allowance", formatRM(payroll.housing_allowance)]);
  if (payroll.transport_allowance > 0)
    earningsRows.push(["Transport Allowance", formatRM(payroll.transport_allowance)]);
  if (payroll.meal_allowance > 0)
    earningsRows.push(["Meal Allowance", formatRM(payroll.meal_allowance)]);
  if (payroll.other_allowance > 0)
    earningsRows.push([
      payroll.other_allowance_label || "Other Allowance",
      formatRM(payroll.other_allowance),
    ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Item", "Amount"]],
    body: earningsRows,
    foot: [["GROSS SALARY", formatRM(payroll.gross_salary)]],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [55, 65, 81] },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [31, 41, 55],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [31, 41, 55],
      fontStyle: "bold",
      fontSize: 9.5,
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.65 },
      1: { cellWidth: contentWidth * 0.35, halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  y += 4;

  // ── Deductions ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(31, 41, 55);
  doc.text("DEDUCTIONS", margin, y);
  y += 2;

  const deductionRows: [string, string][] = [];
  if (payroll.epf_employee > 0)
    deductionRows.push([`EPF (${payroll.epf_employee_rate}%)`, formatRM(payroll.epf_employee)]);
  if (payroll.socso_employee > 0)
    deductionRows.push([`SOCSO (${payroll.socso_employee_rate}%)`, formatRM(payroll.socso_employee)]);
  if (payroll.eis_employee > 0)
    deductionRows.push([`EIS (${payroll.eis_employee_rate}%)`, formatRM(payroll.eis_employee)]);
  if (payroll.upl_days > 0)
    deductionRows.push([`Unpaid Leave (${payroll.upl_days} days)`, formatRM(payroll.upl_deduction)]);
  if (payroll.custom_deduction_amount > 0)
    deductionRows.push([
      payroll.custom_deduction_note ? `Custom: ${payroll.custom_deduction_note}` : "Custom Deduction",
      formatRM(payroll.custom_deduction_amount),
    ]);

  if (deductionRows.length === 0) {
    deductionRows.push(["No deductions", formatRM(0)]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Item", "Amount"]],
    body: deductionRows,
    foot: [["TOTAL DEDUCTIONS", formatRM(payroll.total_deductions)]],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [55, 65, 81] },
    headStyles: {
      fillColor: [254, 242, 242],
      textColor: [127, 29, 29],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    footStyles: {
      fillColor: [254, 242, 242],
      textColor: [127, 29, 29],
      fontStyle: "bold",
      fontSize: 9.5,
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.65 },
      1: { cellWidth: contentWidth * 0.35, halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  y += 6;

  // ── Net Pay ──
  doc.setDrawColor(79, 70, 229);
  doc.setFillColor(238, 242, 255);
  doc.roundedRect(margin, y, contentWidth, 14, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(49, 46, 129);
  doc.text("NET PAY", margin + 4, y + 9);
  doc.text(formatRM(payroll.net_salary), pageWidth - margin - 4, y + 9, {
    align: "right",
  });
  y += 20;

  // ── Employer contributions ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text("EMPLOYER CONTRIBUTIONS (Reference)", margin, y);
  y += 2;

  const employerRows: [string, string][] = [];
  if (payroll.epf_employer > 0)
    employerRows.push([`EPF (${payroll.epf_employer_rate}%)`, formatRM(payroll.epf_employer)]);
  if (payroll.socso_employer > 0)
    employerRows.push([`SOCSO (${payroll.socso_employer_rate}%)`, formatRM(payroll.socso_employer)]);
  if (payroll.eis_employer > 0)
    employerRows.push([`EIS (${payroll.eis_employer_rate}%)`, formatRM(payroll.eis_employer)]);

  if (employerRows.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      body: employerRows,
      theme: "plain",
      styles: { fontSize: 8.5, cellPadding: 2, textColor: [107, 114, 128] },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.65 },
        1: { cellWidth: contentWidth * 0.35, halign: "right" },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable?.finalY ?? y + 20;
  }

  y += 8;

  // ── Footer ──
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `Generated: ${new Date().toISOString().split("T")[0]}`,
    margin,
    y
  );
  doc.text(
    "This is a computer-generated payslip",
    pageWidth - margin,
    y,
    { align: "right" }
  );

  const monthKey = payroll.payroll_month.slice(0, 7);
  const safeName = sanitizeFileName(payroll.staff_name || "staff");
  doc.save(`payslip-${safeName}-${monthKey}.pdf`);
}
