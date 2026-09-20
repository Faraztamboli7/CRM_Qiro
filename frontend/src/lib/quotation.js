import { jsPDF } from "jspdf";

/* ------------------------------------------------------------------ */
/* Quotation attachments                                               */
/* Files are kept in browser storage per deal (the Express API has no  */
/* upload endpoint yet). Swap readAttachments/saveAttachment for API   */
/* calls when a /deals/:id/attachments route exists.                   */
/* ------------------------------------------------------------------ */

const KEY = "qiro.document.attachments";

const readAll = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
};

const writeAll = (all) => localStorage.setItem(KEY, JSON.stringify(all));

export const listAttachments = (dealId, documentType = "quotation") =>
  readAll()[`${documentType}:${String(dealId)}`] ?? [];

export function addAttachment(dealId, file, documentType = "quotation") {
  return new Promise((resolve, reject) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      reject(new Error("Select a PDF file"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const all = readAll();
      const k = `${documentType}:${String(dealId)}`;
      const list = all[k] ?? [];
      const item = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        addedAt: new Date().toISOString(),
        dataUrl: reader.result
      };
      all[k] = [item, ...list];
      writeAll(all);
      resolve(all[k]);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function removeAttachment(dealId, id, documentType = "quotation") {
  const all = readAll();
  const k = `${documentType}:${String(dealId)}`;
  all[k] = (all[k] ?? []).filter((f) => f.id !== id);
  writeAll(all);
  return all[k];
}

export function humanSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function downloadAttachment(att) {
  const a = document.createElement("a");
  a.href = att.dataUrl;
  a.download = att.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function shareAttachment(att, title = "Document") {
  if (navigator.canShare && att.dataUrl) {
    try {
      const blob = await fetch(att.dataUrl).then((r) => r.blob());
      const file = new File([blob], att.name, { type: att.type || "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title,
          text: `${title}: ${att.name}`
        });
        return "shared";
      }
    } catch {
      /* fall through to download */
    }
  }

  downloadAttachment(att);
  return "downloaded";
}

/* ------------------------------------------------------------------ */
/* Dynamic Professional Quotation PDF Generator                       */
/* ------------------------------------------------------------------ */

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(Number(n ?? 0))
    .replace("₹", "Rs. ");

export const BANK_DETAILS = {
  companyName: "QIRO TECH INNOVATION PRIVATE LIMITED",
  bankName: "IDFC FIRST",
  accountNumber: "86690868447",
  ifsc: "IDFB0043491",
  swift: "IDFBINBBMUM",
  branch: "CHHATRAPATI SAMBHAJINAGAR BRANCH"
};

export const COMPANY_DETAILS = {
  name: "QIRO TECH INNOVATION PVT. LTD.",
  shortName: "Qiro Tech Innovation Pvt. Ltd.",
  addressLine1: "Office No 602, 6th Floor, The Business AdvantEdge,",
  addressLine2: "Near Laxmi Chowk, Marunji Road, Hinjawadi Phase I,",
  cityStatePin: "Pune, Maharashtra – 411057",
  headerTagline: "Pune, Maharashtra | commercial@qirotec.com | +918623823997",
  email: "commercial@qirotec.com",
  phone: "+91 8623823997",
  gstin: "27AABCQ2268A1ZR"
};

/**
 * Builds the comprehensive, corporate Multi-page Quotation PDF exactly matching
 * the reference documents (Qiro Website Proposal, Digital Marketing Quotation).
 */
export function buildDynamicQuotationPdf(quotation) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const contentW = W - M * 2;
  const bottomLimit = H - 55;

  const raw = quotation?.raw ?? quotation ?? {};
  const client = raw.client_details ?? {};
  const items = Array.isArray(raw.items) ? raw.items : [];
  const scopeSections = Array.isArray(raw.scope_sections) ? raw.scope_sections : [];
  const timelineItems = Array.isArray(raw.timeline_items) ? raw.timeline_items : [];
  const inclusions = Array.isArray(raw.inclusions) ? raw.inclusions : [];
  const pricing = raw.pricing_breakdown ?? {
    subtotal: raw.subtotal || raw.total_amount || 0,
    discount: raw.discount || 0,
    tax_rate: 18,
    tax_amount: raw.tax || 0,
    grand_total: raw.total_amount || 0
  };

  const clientName = client.name || raw.customer_name || "Valued Client";
  const clientCompany = client.company && client.company !== "—" ? client.company : "";
  const clientCity = client.city || "Pune, Maharashtra";
  const qNum = raw.quotation_number || `Q-${new Date().getFullYear()}-0001`;
  const qDate = raw.created_at
    ? new Date(raw.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const qType = raw.quotation_type || "Quotation";
  const qSubject = raw.subject || `Quotation for ${qType.replace(" Quotation", "")}`;

  // Helper for adding new page with header
  function checkPageBreak(requiredHeight) {
    if (y + requiredHeight > bottomLimit) {
      doc.addPage();
      y = 54;
      return true;
    }
    return false;
  }

  // --- PAGE 1: HEADER & LOGO ---
  let y = 35;

  // Qiro Logo Icon (Circle with notch style representation)
  doc.setDrawColor(23, 132, 214);
  doc.setLineWidth(5);
  doc.circle(W / 2 - 110, y + 22, 14, "S");
  doc.setFillColor(23, 132, 214);
  doc.rect(W / 2 - 104, y + 18, 12, 5, "F");

  // Company Name
  doc.setTextColor(19, 78, 123);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("QIRO TECH", W / 2 - 85, y + 20);

  doc.setTextColor(60, 150, 220);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.text("Innovation Pvt. Ltd.", W / 2 - 85, y + 36);

  y += 58;

  // Tagline / Contact bar
  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(COMPANY_DETAILS.headerTagline, W / 2, y, { align: "center" });

  // Divider line
  y += 10;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.75);
  doc.line(M, y, W - M, y);

  // QUOTATION Title
  y += 30;
  doc.setTextColor(19, 78, 123);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("QUOTATION", W / 2, y, { align: "center" });

  // Quotation For (Left) & Metadata (Right)
  y += 28;
  doc.setTextColor(19, 78, 123);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Quotation for:", M, y);

  if (clientCompany) {
    doc.setTextColor(19, 78, 123);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(clientCompany, W - M, y, { align: "right" });
  }

  y += 15;
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(clientName, M, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Date: ${qDate}`, W - M, y, { align: "right" });

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(clientCity, M, y);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(`Quotation #: ${qNum}`, W - M, y, { align: "right" });

  // Subject Banner
  y += 35;
  doc.setTextColor(19, 78, 123);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Subject : ${qSubject}`, W / 2, y, { align: "center" });

  // Salutation & Intro
  y += 26;
  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text("Dear Sir,", M, y);
  y += 16;
  const introMsg = `Subject: - Your enquiry for requirement for ${qType.replace(" Quotation", "")} service. Dated on ${qDate}.`;
  doc.text(introMsg, M, y);
  y += 16;
  doc.text("Thank you for showing interest in our Services & contacting us. Please find our exclusive quotation for your requirement:", M, y);
  y += 24;

  // --- PRODUCTS / SERVICES TABLE ---
  const colW = {
    sr: 32,
    desc: 115,
    tech: 105,
    deliv: 140,
    price: 60,
    total: 65
  };
  // total = 517 pts ~= contentW (499)

  const thY = y;
  doc.setFillColor(19, 78, 123); // Dark corporate blue from reference
  doc.rect(M, thY, contentW, 26, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);

  let curX = M;
  doc.text("Sr.", curX + colW.sr / 2, thY + 11, { align: "center" });
  doc.text("No.", curX + colW.sr / 2, thY + 21, { align: "center" });
  curX += colW.sr;

  doc.text("Product", curX + 6, thY + 11);
  doc.text("Description", curX + 6, thY + 21);
  curX += colW.desc;

  doc.text("Technology", curX + 6, thY + 16);
  curX += colW.tech;

  doc.text("Deliverables", curX + 6, thY + 16);
  curX += colW.deliv;

  doc.text("Price / Unit", curX + colW.price / 2, thY + 16, { align: "center" });
  curX += colW.price;

  doc.text("Total Amount", curX + colW.total - 6, thY + 16, { align: "right" });

  y += 26;

  // Render Table Items
  const itemsToRender = items.length > 0 ? items : [
    {
      description: raw.product_service || "Digital Marketing / Software Development",
      technology: "Adobe Tools, Canva / Modern Tech Stack",
      deliverables: "Design & Development Deliverables as agreed",
      quantity: 1,
      unit_price: raw.total_amount || 0,
      total: raw.total_amount || 0
    }
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  itemsToRender.forEach((it, idx) => {
    const descLines = doc.splitTextToSize(String(it.description || ""), colW.desc - 10);
    const techLines = doc.splitTextToSize(String(it.technology || "—"), colW.tech - 10);
    const delivLines = doc.splitTextToSize(String(it.deliverables || "—"), colW.deliv - 10);

    const maxLines = Math.max(descLines.length, techLines.length, delivLines.length, 1);
    const rowHeight = Math.max(30, maxLines * 13 + 14);

    checkPageBreak(rowHeight + 40);

    // Row borders
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.rect(M, y, contentW, rowHeight);

    // Vertical column grid lines
    let lineX = M;
    [colW.sr, colW.desc, colW.tech, colW.deliv, colW.price].forEach((w) => {
      lineX += w;
      doc.line(lineX, y, lineX, y + rowHeight);
    });

    // Content
    let textX = M;
    doc.text(String(idx + 1), textX + colW.sr / 2, y + 16, { align: "center" });
    textX += colW.sr;

    descLines.forEach((l, i) => doc.text(l, textX + 5, y + 14 + i * 12));
    textX += colW.desc;

    techLines.forEach((l, i) => doc.text(l, textX + 5, y + 14 + i * 12));
    textX += colW.tech;

    delivLines.forEach((l, i) => doc.text(l, textX + 5, y + 14 + i * 12));
    textX += colW.deliv;

    const priceText = inr(it.unit_price) + (it.quantity > 1 ? ` (x${it.quantity})` : "");
    doc.text(priceText, textX + colW.price / 2, y + 16, { align: "center" });
    textX += colW.price;

    doc.text(inr(it.total), textX + colW.total - 6, y + 16, { align: "right" });

    y += rowHeight;
  });

  // Totals Section
  const totalsW = colW.price + colW.total;
  const labelsW = contentW - totalsW;

  // Subtotal
  doc.rect(M, y, contentW, 22);
  doc.setFont("helvetica", "bold");
  doc.text("Sub Total :", M + labelsW - 10, y + 15, { align: "right" });
  doc.text(inr(pricing.subtotal), W - M - 6, y + 15, { align: "right" });
  y += 22;

  // Discount (if any)
  if (pricing.discount > 0) {
    doc.rect(M, y, contentW, 20);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(220, 38, 38);
    doc.text("Discount :", M + labelsW - 10, y + 14, { align: "right" });
    doc.text(`- ${inr(pricing.discount)}`, W - M - 6, y + 14, { align: "right" });
    doc.setTextColor(30, 41, 59);
    y += 20;
  }

  // Grand Total (Including 18% GST)
  doc.rect(M, y, contentW, 24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(19, 78, 123);
  doc.text(`(Including ${pricing.tax_rate ?? 18}% GST) Grand Total :`, M + labelsW - 10, y + 16, { align: "right" });
  doc.text(inr(pricing.grand_total), W - M - 6, y + 16, { align: "right" });
  y += 35;

  // --- FOLLOWING PAGES: SCOPE OF WORK (SOW) ---
  // Start SOW on page 2 if there's extensive content
  doc.addPage();
  y = 54;

  // SOW Big Blue Header
  doc.setTextColor(19, 78, 123);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const sowTitle = clientCompany
    ? `Scope Of Work : ${qType.replace(" Quotation", "")} For ${clientCompany}`
    : `SCOPE OF WORK (SOW) — ${qType.replace(" Quotation", "")}`;
  doc.text(sowTitle, W / 2, y, { align: "center" });
  y += 28;

  // Render Scope Sections
  scopeSections.forEach((sec) => {
    checkPageBreak(60);

    // Blue section heading matching reference
    doc.setTextColor(19, 78, 123);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(sec.title || "Section", M, y);
    y += 18;

    // Body content (paragraphs and bullets)
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const rawContent = String(sec.content || "");
    const lines = rawContent.split("\n").filter((l) => l.trim().length > 0);

    lines.forEach((line) => {
      const trimmed = line.trim();
      const isBullet = trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*") || /^\d+[\.\)]/.test(trimmed);
      const cleanLine = trimmed.replace(/^[\s•\-\*]+/, "").trim();

      const splitText = doc.splitTextToSize(cleanLine, contentW - (isBullet ? 18 : 0));
      checkPageBreak(splitText.length * 14 + 6);

      if (isBullet) {
        doc.setFillColor(19, 78, 123);
        doc.circle(M + 5, y + 7, 2, "F");
        splitText.forEach((t, i) => {
          doc.text(t, M + 16, y + 10 + i * 14);
        });
      } else {
        splitText.forEach((t, i) => {
          doc.text(t, M, y + 10 + i * 14);
        });
      }
      y += splitText.length * 14 + 6;
    });

    y += 12;
  });

  // --- TIMELINE TABLE (If present) ---
  if (timelineItems.length > 0) {
    checkPageBreak(90);

    doc.setTextColor(19, 78, 123);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Features & Timeline", M, y);
    y += 16;

    const tColW = { phase: 130, act: 240, time: contentW - 370 };
    doc.setFillColor(19, 78, 123);
    doc.rect(M, y, contentW, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text("Phase", M + 8, y + 14);
    doc.text("Key Activities", M + tColW.phase + 8, y + 14);
    doc.text("Timeline", M + tColW.phase + tColW.act + 8, y + 14);
    y += 20;

    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "normal");

    timelineItems.forEach((t) => {
      const pLines = doc.splitTextToSize(String(t.phase || ""), tColW.phase - 16);
      const aLines = doc.splitTextToSize(String(t.key_activities || ""), tColW.act - 16);
      const tLines = doc.splitTextToSize(String(t.timeline || ""), tColW.time - 16);
      const rowH = Math.max(24, Math.max(pLines.length, aLines.length, tLines.length) * 12 + 10);

      checkPageBreak(rowH + 20);

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      doc.rect(M, y, contentW, rowH);
      doc.line(M + tColW.phase, y, M + tColW.phase, y + rowH);
      doc.line(M + tColW.phase + tColW.act, y, M + tColW.phase + tColW.act, y + rowH);

      pLines.forEach((l, i) => doc.text(l, M + 8, y + 13 + i * 11));
      aLines.forEach((l, i) => doc.text(l, M + tColW.phase + 8, y + 13 + i * 11));
      tLines.forEach((l, i) => doc.text(l, M + tColW.phase + tColW.act + 8, y + 13 + i * 11));

      y += rowH;
    });

    y += 20;
  }

  // --- INCLUSIONS SECTION ---
  if (inclusions.length > 0) {
    checkPageBreak(60);

    doc.setTextColor(19, 78, 123);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Inclusions", M, y);
    y += 16;

    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    inclusions.forEach((inc) => {
      const clean = String(inc).replace(/^[\s•\-\*]+/, "").trim();
      const splitText = doc.splitTextToSize(clean, contentW - 20);
      checkPageBreak(splitText.length * 14 + 6);

      doc.setFillColor(19, 78, 123);
      doc.circle(M + 5, y + 5, 2, "F");
      splitText.forEach((t, i) => {
        doc.text(t, M + 16, y + 8 + i * 13);
      });
      y += splitText.length * 13 + 6;
    });

    y += 20;
  }

  // --- BANK DETAILS SECTION ---
  checkPageBreak(120);
  doc.setTextColor(19, 78, 123);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Bank Details:", M, y);
  y += 16;

  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`Company name: ${BANK_DETAILS.companyName}`, M, y);
  y += 14;
  doc.text(`Account number: ${BANK_DETAILS.accountNumber}`, M, y);
  y += 14;
  doc.text(`IFSC: ${BANK_DETAILS.ifsc}`, M, y);
  y += 14;
  doc.text(`SWIFT Code: ${BANK_DETAILS.swift}`, M, y);
  y += 14;
  doc.text(`Bank name: ${BANK_DETAILS.bankName}`, M, y);
  y += 14;
  doc.text(`Branch: ${BANK_DETAILS.branch}`, M, y);
  y += 25;

  // --- TERMS & CONDITIONS ---
  if (raw.terms_conditions) {
    checkPageBreak(70);
    doc.setTextColor(19, 78, 123);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Terms & Conditions:", M, y);
    y += 14;

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const termLines = doc.splitTextToSize(raw.terms_conditions, contentW);
    termLines.forEach((l) => {
      checkPageBreak(14);
      doc.text(l, M, y);
      y += 13;
    });
    y += 15;
  }

  // --- CLOSING & SIGNATURE ---
  checkPageBreak(110);
  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Thank you for the opportunity to present this proposal.", M, y);
  y += 14;
  doc.text("We look forward to supporting your business with our technology solutions.", M, y);
  y += 14;
  doc.text("Please feel free to contact us if you require any clarification.", M, y);
  y += 24;

  doc.setTextColor(19, 78, 123);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text("Warm Regards,", M, y);
  y += 16;
  doc.text(COMPANY_DETAILS.shortName, M, y);
  y += 14;

  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`GST: ${COMPANY_DETAILS.gstin}`, M, y);
  y += 14;
  doc.text(COMPANY_DETAILS.addressLine1, M, y);
  y += 12;
  doc.text(COMPANY_DETAILS.addressLine2, M, y);
  y += 12;
  doc.text(COMPANY_DETAILS.cityStatePin, M, y);
  y += 12;
  doc.text(COMPANY_DETAILS.email, M, y);
  y += 12;
  doc.text(COMPANY_DETAILS.phone, M, y);

  // --- PAGE NUMBERING FOOTER ON ALL PAGES ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${i} of ${totalPages}`,
      W - M,
      H - 22,
      { align: "right" }
    );
    doc.text(
      `Qiro CRM · Confidential Quotation #${qNum}`,
      M,
      H - 22
    );
  }

  return doc;
}

/** Legacy backwards-compatible export for existing deals view */
export function buildQuotationPdf(payload) {
  const deal = payload?.deal;
  const lead = payload?.lead;
  const preparedBy = payload?.preparedBy;

  const quotationData = {
    quotation_number: `Q-${new Date().getFullYear()}-${String(deal?.id || 1).padStart(4, "0")}`,
    quotation_type: deal?.title || "Website Quotation",
    subject: `Quotation for ${deal?.title || "Web Development"}`,
    customer_name: [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || lead?.company || "Customer",
    client_details: {
      name: [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || lead?.company || "Customer",
      company: lead?.company || "—",
      email: lead?.email || "",
      phone: lead?.phone || "",
      city: "Pune, Maharashtra"
    },
    items: [
      {
        description: deal?.title || "Web Development",
        technology: "HTML, CSS, JS, Next JS",
        deliverables: "1) Hosting, 2) Domain, 3) SSL Certificate",
        quantity: 1,
        unit_price: Number(deal?.amount || 0),
        total: Number(deal?.amount || 0)
      }
    ],
    pricing_breakdown: {
      subtotal: Number(deal?.amount || 0),
      discount: 0,
      tax_rate: 18,
      tax_amount: (Number(deal?.amount || 0) * 18) / 100,
      grand_total: Math.round(Number(deal?.amount || 0) * 1.18)
    },
    scope_sections: [
      {
        title: "Project Overview",
        content: deal?.description || "The project aims to design, develop and launch a professional, secure and user-friendly digital solution."
      },
      {
        title: "Deliverables",
        content: "• Quality assured deliverables\n• Deployment & Handover\n• Maintenance support"
      }
    ],
    inclusions: [
      "Hosting & Infrastructure setup",
      "SSL Certificate installation",
      "Technical support via WhatsApp & Email"
    ]
  };

  return buildDynamicQuotationPdf(quotationData);
}

export function quotationFileName(dealOrQuotation, lead) {
  const num = dealOrQuotation?.quotation_number || `Q-${dealOrQuotation?.id ?? ""}`;
  const name =
    [lead?.first_name, lead?.last_name].filter(Boolean).join("-") ||
    dealOrQuotation?.customer_name ||
    lead?.company ||
    "customer";
  return `Quotation-${num}-${String(name).toLowerCase().replace(/\s+/g, "-")}.pdf`;
}

/** Download the PDF, then offer the native share sheet when available. */
export async function shareQuotationPdf(payload) {
  const doc = payload?.quotation_type
    ? buildDynamicQuotationPdf(payload)
    : buildQuotationPdf(payload);

  const fileName = quotationFileName(payload?.deal || payload, payload?.lead);
  const blob = doc.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "Quotation",
        text: `Quotation from Qiro Tech Innovation`
      });
      return "shared";
    } catch {
      /* fall through to download */
    }
  }
  doc.save(fileName);
  return "downloaded";
}

/* ------------------------------------------------------------------ */
/* Tax Invoice PDF (Preserved exactly as required)                    */
/* ------------------------------------------------------------------ */

export function buildInvoicePdf(sale, customerName = null) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = 64;

  const raw = sale?.raw ?? sale ?? {};
  const invoiceNum = raw.invoice_number || sale?.id || `INV-${Date.now()}`;
  const saleDate = raw.sale_date || sale?.date || new Date().toISOString();
  const customer = customerName || sale?.customer || raw.customer_code || "Valued Customer";
  const item = raw.product_service || "Products & Professional Services";
  const saleAmount = Number(raw.sale_amount ?? sale?.amount ?? 0);
  const discount = Number(raw.discount ?? 0);
  const tax = Number(raw.tax ?? 0);
  const finalAmount = Number(raw.final_amount ?? sale?.amount ?? (saleAmount - discount + tax));
  const paymentStatus = String(raw.payment_status ?? sale?.status ?? "PENDING").toUpperCase();
  const paymentMethod = String(raw.payment_method ?? "UPI").replace(/_/g, " ");
  const owner = sale?.owner || "Sales Executive";

  // Header banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, W, 96, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("QIRO CRM", M, 46);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Official Tax Invoice", M, 68);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`#${invoiceNum}`, W - M, 46, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Date: ${new Date(saleDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
    W - M,
    68,
    { align: "right" }
  );

  // Billing details
  y = 135;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Billed To (Customer)", M, y);
  doc.text("Billed By (Company)", W / 2, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const left = [
    String(customer),
    raw.deal_title ? `Deal: ${raw.deal_title}` : null,
    "Payment Terms: Standard Commercial Terms"
  ].filter(Boolean);

  const right = [
    "Qiro Technologies Pvt Ltd",
    `Account Manager: ${owner}`,
    `GSTIN: ${COMPANY_DETAILS.gstin}`,
    `Email: ${COMPANY_DETAILS.email}`
  ];

  left.forEach((line, i) => doc.text(String(line), M, y + 18 + i * 16));
  right.forEach((line, i) => doc.text(String(line), W / 2, y + 18 + i * 16));

  y = y + 20 + Math.max(left.length, right.length) * 16 + 18;

  // Payment status badge line
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Payment Status:", M, y);
  
  if (paymentStatus === "PAID") {
    doc.setTextColor(22, 101, 52); // Green
    doc.text(`PAID (Method: ${paymentMethod})`, M + 95, y);
  } else if (paymentStatus === "PARTIAL") {
    doc.setTextColor(194, 65, 12); // Orange
    doc.text(`PARTIAL PAYMENT (Method: ${paymentMethod})`, M + 95, y);
  } else {
    doc.setTextColor(185, 28, 28); // Red
    doc.text(`PENDING (Payment Method: ${paymentMethod})`, M + 95, y);
  }
  doc.setTextColor(30, 41, 59);

  y += 24;

  // Table header
  doc.setFillColor(241, 245, 249);
  doc.rect(M, y, W - M * 2, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Description of Service / Product", M + 12, y + 18);
  doc.text("Amount (INR)", W - M - 12, y + 18, { align: "right" });

  y += 28;

  // Line item
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const desc = doc.splitTextToSize(String(item), W - M * 2 - 140);
  const rowH = Math.max(32, desc.length * 14 + 16);
  desc.forEach((line, i) => doc.text(line, M + 12, y + 18 + i * 14));
  doc.text(inr(saleAmount), W - M - 12, y + 18, { align: "right" });

  y += rowH;
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);
  y += 18;

  // Summary box
  const summaryX = W - M - 200;
  const valX = W - M - 12;

  doc.setFontSize(10);
  doc.text("Subtotal:", summaryX, y);
  doc.text(inr(saleAmount), valX, y, { align: "right" });
  y += 18;

  if (discount > 0) {
    doc.setTextColor(220, 38, 38);
    doc.text("Discount:", summaryX, y);
    doc.text(`- ${inr(discount)}`, valX, y, { align: "right" });
    doc.setTextColor(30, 41, 59);
    y += 18;
  }

  if (tax > 0) {
    doc.text("GST / Taxes:", summaryX, y);
    doc.text(`+ ${inr(tax)}`, valX, y, { align: "right" });
    y += 18;
  }

  doc.setDrawColor(203, 213, 225);
  doc.line(summaryX, y, W - M, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Total Payable:", summaryX, y + 2);
  doc.text(inr(finalAmount), valX, y + 2, { align: "right" });

  y += 35;

  // Bank Details on Invoice
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Bank Account Details:", M, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Account Name: ${BANK_DETAILS.companyName}`, M, y);
  y += 12;
  doc.text(`Bank: ${BANK_DETAILS.bankName} | A/C: ${BANK_DETAILS.accountNumber}`, M, y);
  y += 12;
  doc.text(`IFSC: ${BANK_DETAILS.ifsc} | Branch: ${BANK_DETAILS.branch}`, M, y);
  y += 24;

  // Footer notes & terms
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("Terms & Notes:", M, y);
  y += 14;
  doc.text("1. All payments are non-refundable unless specified in master agreement.", M, y);
  y += 12;
  doc.text("2. Payments can be completed using NEFT/RTGS, UPI, or Corporate Cards.", M, y);
  y += 12;
  doc.text("3. This is a system-generated invoice generated through Qiro CRM.", M, y);

  return doc;
}

export function downloadInvoicePdf(sale, customerName = null) {
  const doc = buildInvoicePdf(sale, customerName);
  const raw = sale?.raw ?? sale ?? {};
  const invNum = raw.invoice_number || sale?.id || "INV";
  doc.save(`Invoice-${invNum}.pdf`);
}

export async function shareInvoicePdf(sale, customerName = null) {
  const doc = buildInvoicePdf(sale, customerName);
  const raw = sale?.raw ?? sale ?? {};
  const invNum = raw.invoice_number || sale?.id || "INV";
  const fileName = `Invoice-${invNum}.pdf`;
  const blob = doc.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "Tax Invoice",
        text: `Invoice #${invNum} from Qiro CRM`
      });
      return "shared";
    } catch {
      /* fall through to download */
    }
  }
  doc.save(fileName);
  return "downloaded";
}
