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
/* Tax Invoice PDF — Professional layout matching Qiro reference       */
/* ------------------------------------------------------------------ */

/** Convert number to Indian words (rupees) */
function numberToWordsINR(num) {
  if (!num || num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const convert = (n) => {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + " " + (n % 10 ? ones[n % 10] + " " : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred " + convert(n % 100);
    if (n < 100000) return convert(Math.floor(n / 1000)) + "Thousand " + convert(n % 1000);
    if (n < 10000000) return convert(Math.floor(n / 100000)) + "Lakh " + convert(n % 100000);
    return convert(Math.floor(n / 10000000)) + "Crore " + convert(n % 10000000);
  };

  const rounded = Math.round(Math.abs(num));
  return "Rs. " + convert(rounded).replace(/\s+/g, " ").trim() + " Only";
}

/** Get financial year string e.g. "2026-27" */
function financialYear(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const month = d.getMonth(); // 0-based
  const year = d.getFullYear();
  const fy = month >= 3 ? year : year - 1; // April onwards = current FY
  return `${fy}-${String(fy + 1).slice(2)}`;
}

export function buildInvoicePdf(sale, customerName = null) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 36;
  const contentW = W - M * 2;
  let y = 0;

  const raw = sale?.raw ?? sale ?? {};
  const invoiceNum = raw.invoice_number || sale?.id || `INV-${Date.now()}`;
  const saleDate = raw.sale_date || sale?.date || new Date().toISOString();
  const saleAmount = Number(raw.sale_amount ?? sale?.amount ?? 0);
  const discount = Number(raw.discount ?? 0);
  const tax = Number(raw.tax ?? 0);
  const finalAmount = Number(raw.final_amount ?? sale?.amount ?? (saleAmount - discount + tax));
  const paymentStatus = String(raw.payment_status ?? sale?.status ?? "PENDING").toUpperCase();
  const dealTitle = raw.deal_title || raw.product_service || "Professional Services";
  const dealAmount = Number(raw.deal_amount ?? finalAmount);

  // Client details from lead join
  const clientName = customerName
    || [raw.lead_first_name, raw.lead_last_name].filter(Boolean).join(" ")
    || raw.customer_code
    || "Valued Customer";
  const clientCompany = raw.lead_company || "";
  const clientPhone = raw.lead_phone || "";

  // Format invoice number for display: QTIPL/YYYY-YY/XXXX
  const fy = financialYear(saleDate);
  const invSeq = invoiceNum.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const displayInvoiceNo = `QTIPL/${fy}/${invSeq}`;

  // Format date as YYYY-MM-DD
  const dateObj = new Date(saleDate);
  const formattedDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;

  // GST calculations (18% total = CGST 9% + SGST 9%)
  const taxableAmount = saleAmount - discount;
  const cgstRate = 9;
  const sgstRate = 9;
  const cgstAmt = Math.round(taxableAmount * cgstRate / 100);
  const sgstAmt = Math.round(taxableAmount * sgstRate / 100);
  const totalRounded = Math.round(taxableAmount + cgstAmt + sgstAmt);
  const gstTotal = cgstAmt + sgstAmt;

  // Dark teal theme (matches reference)
  const tealR = 0, tealG = 77, tealB = 77;

  // Helper: draw bordered cell
  const drawCell = (x, cy, w, h, opts = {}) => {
    doc.setDrawColor(tealR, tealG, tealB);
    doc.setLineWidth(0.5);
    if (opts.fill) {
      doc.setFillColor(...(opts.fillColor || [0, 77, 77]));
      doc.rect(x, cy, w, h, "FD");
    } else {
      doc.rect(x, cy, w, h, "S");
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // TAX INVOICE title bar
  // ═══════════════════════════════════════════════════════════════
  y = M;
  const titleH = 22;
  drawCell(M, y, contentW, titleH, { fill: true, fillColor: [0, 77, 77] });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("TAX INVOICE", W / 2, y + 15, { align: "center" });

  doc.setFontSize(7);
  doc.setTextColor(30, 30, 30);
  doc.text("ORIGINAL FOR RECIPIENT", W - M, y + 8, { align: "right" });

  y += titleH;

  // ═══════════════════════════════════════════════════════════════
  // Company header block
  // ═══════════════════════════════════════════════════════════════
  const compH = 68;
  drawCell(M, y, contentW, compH);

  doc.setTextColor(0, 77, 77);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("QIRO TECH INNOVATION PVT. LTD.", W / 2, y + 22, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text(
    "OFFICE NO 602, 6TH FLOOR, THE BUSINESS ADVANTEDGE, NEAR LAXMI CHOWK, MARUNJI ROAD, HINJAWADI PHASE I, HINJAWADI, PUNE 411057",
    W / 2, y + 37, { align: "center" }
  );
  doc.text(
    `Email: ${COMPANY_DETAILS.email} | Ph: ${COMPANY_DETAILS.phone}`,
    W / 2, y + 49, { align: "center" }
  );
  doc.text(`GSTIN: ${COMPANY_DETAILS.gstin}`, W / 2, y + 59, { align: "center" });

  y += compH;

  // ═══════════════════════════════════════════════════════════════
  // Client Details (left) | Invoice Metadata (right)
  // ═══════════════════════════════════════════════════════════════
  const detailH = 120;
  const halfW = contentW / 2;

  drawCell(M, y, halfW, detailH);
  drawCell(M + halfW, y, halfW, detailH);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);

  let ly = y + 16;
  const labelX = M + 8;
  const valLX = M + 72;

  // Client Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Client Name :", labelX, ly);
  doc.setFontSize(9);
  doc.text(String(clientCompany || clientName).toUpperCase(), valLX, ly);

  // Address (placeholder — lead address not stored)
  ly += 16;
  doc.setFontSize(8);
  doc.text("Address :", labelX, ly);
  doc.setFont("helvetica", "normal");

  // Mobile
  ly += 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Mobile No. :", labelX, ly);
  doc.setFont("helvetica", "normal");
  doc.text(String(clientPhone), valLX, ly);

  // Pincode
  ly += 14;
  doc.setFont("helvetica", "bold");
  doc.text("Pincode :", labelX, ly);

  // GSTIN
  ly += 14;
  doc.setFont("helvetica", "bold");
  doc.text("GSTIN :", labelX, ly);

  // Right column — Invoice metadata
  const rLabelX = M + halfW + 8;
  const rValX = M + halfW + 90;
  let ry = y + 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Invoice Date :", rLabelX, ry);
  doc.setFont("helvetica", "normal");
  doc.text(formattedDate, rValX, ry);

  ry += 16;
  doc.setFont("helvetica", "bold");
  doc.text("Invoice No :", rLabelX, ry);
  doc.setFont("helvetica", "normal");
  doc.text(displayInvoiceNo, rValX, ry);

  ry += 16;
  doc.setFont("helvetica", "bold");
  doc.text("State Name :", rLabelX, ry);
  doc.setFont("helvetica", "normal");
  doc.text("Maharashtra", rValX, ry);

  ry += 16;
  doc.setFont("helvetica", "bold");
  doc.text("State Code :", rLabelX, ry);
  doc.setFont("helvetica", "normal");
  doc.text("MH", rValX, ry);

  ry += 16;
  doc.setFont("helvetica", "bold");
  doc.text("Place of Supply :", rLabelX, ry);
  doc.setFont("helvetica", "normal");
  doc.text("Maharashtra (27)", rValX, ry);

  y += detailH;

  // ═══════════════════════════════════════════════════════════════
  // Items table header
  // ═══════════════════════════════════════════════════════════════
  const colSN = 35;
  const colHSN = 65;
  const colQTY = 50;
  const colRate = 70;
  const colAmt = 80;
  const colDesc = contentW - colSN - colHSN - colQTY - colRate - colAmt;
  const thH = 22;

  let tx = M;
  const colStarts = [
    tx,
    tx + colSN,
    tx + colSN + colDesc,
    tx + colSN + colDesc + colHSN,
    tx + colSN + colDesc + colHSN + colQTY,
    tx + colSN + colDesc + colHSN + colQTY + colRate
  ];
  const colWidths = [colSN, colDesc, colHSN, colQTY, colRate, colAmt];
  const colLabels = ["S.N.", "DESCRIPTION", "HSN/SAC", "QTY", "RATE", "AMOUNT"];

  colStarts.forEach((cx, i) => {
    drawCell(cx, y, colWidths[i], thH, { fill: true, fillColor: [230, 240, 240] });
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 50, 50);
  colStarts.forEach((cx, i) => {
    doc.text(colLabels[i], cx + colWidths[i] / 2, y + 14, { align: "center" });
  });

  y += thH;

  // ═══════════════════════════════════════════════════════════════
  // Item data row
  // ═══════════════════════════════════════════════════════════════
  const itemDesc = dealTitle;
  const descLines = doc.splitTextToSize(String(itemDesc), colDesc - 16);
  const itemRowH = Math.max(70, descLines.length * 12 + 20);

  colStarts.forEach((cx, i) => drawCell(cx, y, colWidths[i], itemRowH));

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text("1", colStarts[0] + colSN / 2, y + 16, { align: "center" });
  descLines.forEach((line, i) => doc.text(line, colStarts[1] + 8, y + 16 + i * 12));
  doc.text("1", colStarts[3] + colQTY / 2, y + 16, { align: "center" });
  if (taxableAmount > 0) {
    doc.text(inr(taxableAmount), colStarts[4] + colRate - 6, y + 16, { align: "right" });
    doc.text(inr(taxableAmount), colStarts[5] + colAmt - 6, y + 16, { align: "right" });
  }

  y += itemRowH;

  // ═══════════════════════════════════════════════════════════════
  // GST Summary rows
  // ═══════════════════════════════════════════════════════════════
  const summX = colStarts[4];
  const summLabelW = colRate;
  const summAmtW = colAmt;
  const leftSpanW = colSN + colDesc + colHSN + colQTY;

  const summaryRows = [
    { label: "TAXABLE AMOUNT", amount: taxableAmount },
    { label: `CGST @${cgstRate}%`, amount: cgstAmt },
    { label: `SGST @${sgstRate}%`, amount: sgstAmt },
    { label: "TOTAL (ROUNDED)", amount: totalRounded, bold: true, icon: true }
  ];

  const leftLabels = [
    "",
    `GST Amount : ${numberToWordsINR(gstTotal)}`,
    "",
    `Invoice Value : ${numberToWordsINR(totalRounded)}`
  ];

  summaryRows.forEach((row, i) => {
    const rowH = 20;
    drawCell(M, y, leftSpanW, rowH);
    drawCell(summX, y, summLabelW, rowH, row.bold ? { fill: true, fillColor: [230, 240, 240] } : {});
    drawCell(summX + summLabelW, y, summAmtW, rowH);

    if (leftLabels[i]) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(30, 30, 30);
      doc.text(leftLabels[i], M + 8, y + 13);
    }

    doc.setFont("helvetica", row.bold ? "bold" : "normal");
    doc.setFontSize(8);
    doc.setTextColor(0, 50, 50);
    doc.text(row.label, summX + 6, y + 13);

    if (row.icon) {
      doc.setTextColor(0, 77, 77);
      doc.setFont("helvetica", "bold");
      doc.text("\u20B9", summX + summLabelW + summAmtW - 8, y + 13, { align: "right" });
    }

    if (row.amount > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 30);
      const amtStr = row.icon ? String(row.amount.toLocaleString("en-IN")) : inr(row.amount);
      doc.text(amtStr, summX + summLabelW + summAmtW - (row.icon ? 14 : 6), y + 13, { align: "right" });
    }

    y += rowH;
  });

  // ═══════════════════════════════════════════════════════════════
  // Bank Details (left) | Grand Total / Deal / Bill (right)
  // ═══════════════════════════════════════════════════════════════
  const bankSectionH = 120;
  const totalsW = summLabelW + summAmtW;

  drawCell(M, y, leftSpanW, bankSectionH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 77, 77);
  doc.text("BANK ACCOUNT DETAILS", M + 8, y + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);

  const bankLines = [
    ["Account Name", BANK_DETAILS.companyName],
    ["Bank Name", BANK_DETAILS.bankName],
    ["Account No.", BANK_DETAILS.accountNumber],
    ["IFSC Code", BANK_DETAILS.ifsc],
    ["SWIFT Code", BANK_DETAILS.swift],
    ["Branch Name", BANK_DETAILS.branch]
  ];

  let by = y + 30;
  bankLines.forEach(([lbl, val]) => {
    doc.setFont("helvetica", "bold");
    doc.text(lbl, M + 8, by);
    doc.setFont("helvetica", "normal");
    doc.text(`: ${val}`, M + 78, by);
    by += 13;
  });

  by += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Payment Status :", M + 8, by);
  if (paymentStatus === "PAID") {
    doc.setTextColor(22, 163, 74);
    doc.text("FULLY PAID", M + 90, by);
  } else if (paymentStatus === "PARTIAL") {
    doc.setTextColor(234, 88, 12);
    doc.text("PARTIALLY PAID", M + 90, by);
  } else {
    doc.setTextColor(220, 38, 38);
    doc.text("PENDING", M + 90, by);
  }
  doc.setTextColor(30, 30, 30);

  // Right side — Grand TOTAL
  const totalRowH = 30;
  const grandTotalY = y;
  drawCell(summX, grandTotalY, totalsW, totalRowH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 50, 50);
  doc.text("Grand TOTAL", summX + 6, grandTotalY + 13);
  doc.setTextColor(0, 77, 77);
  doc.text("\u20B9", summX + totalsW - 8, grandTotalY + 13, { align: "right" });
  doc.setTextColor(30, 30, 30);
  doc.text(String(totalRounded.toLocaleString("en-IN")), summX + totalsW - 14, grandTotalY + 13, { align: "right" });

  // TOTAL PROJECT DEAL
  const dealRowY = grandTotalY + totalRowH;
  drawCell(summX, dealRowY, totalsW, totalRowH + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 50, 50);
  doc.text("TOTAL PROJECT", summX + 6, dealRowY + 11);
  doc.text("DEAL :", summX + 6, dealRowY + 22);
  doc.setTextColor(0, 77, 77);
  doc.text("\u20B9", summX + totalsW - 8, dealRowY + 17, { align: "right" });
  doc.setTextColor(30, 30, 30);
  doc.text(String(dealAmount.toLocaleString("en-IN")), summX + totalsW - 14, dealRowY + 17, { align: "right" });

  // Current Bill Amount
  const billRowY = dealRowY + totalRowH + 6;
  const billRowH = bankSectionH - totalRowH - (totalRowH + 6);
  drawCell(summX, billRowY, totalsW, billRowH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 50, 50);
  doc.text("Current Bill Amount :", summX + 6, billRowY + 14);
  doc.setTextColor(0, 77, 77);
  doc.text("\u20B9", summX + totalsW - 8, billRowY + 14, { align: "right" });
  doc.setTextColor(30, 30, 30);
  doc.text(String(finalAmount.toLocaleString("en-IN")), summX + totalsW - 14, billRowY + 14, { align: "right" });

  y += bankSectionH;

  // ═══════════════════════════════════════════════════════════════
  // Footer
  // ═══════════════════════════════════════════════════════════════
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("This is a system-generated invoice by Qiro CRM. Subject to Pune, Maharashtra jurisdiction.", M, y);
  y += 10;
  doc.text("Terms: Payment is due as per agreed commercial terms. All disputes subject to Pune jurisdiction.", M, y);

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
