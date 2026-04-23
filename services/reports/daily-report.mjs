const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN = Object.freeze({
  top: 26,
  right: 24,
  bottom: 30,
  left: 24,
});
const FOOTER_HEIGHT = 18;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN.left - PAGE_MARGIN.right;
const CONTENT_BOTTOM = PAGE_HEIGHT - PAGE_MARGIN.bottom - FOOTER_HEIGHT;
const TABLE_FONT_SIZE = 9;
const TABLE_LINE_HEIGHT = 11;
const TABLE_CELL_PADDING_X = 8;
const TABLE_CELL_PADDING_Y = 7;

const PDF_COLORS = Object.freeze({
  white: [255, 255, 255],
  ink: [17, 24, 39],
  muted: [100, 116, 139],
  border: [226, 232, 240],
  rowAlt: [248, 250, 252],
  header: [15, 23, 42],
  headerAccent: [245, 158, 11],
  income: [16, 185, 129],
  expense: [239, 68, 68],
  balance: [37, 99, 235],
  stats: [245, 158, 11],
  cardBg: [248, 250, 252],
});

const NARROW_WIDTH_CHARS = "fijlrtI1'`.,:;|!()[]{}";
const WIDE_WIDTH_CHARS = "MW@#%&QGOmw";

function numFmt(value) {
  return Number(value || 0).toLocaleString("ru-RU");
}

function formatDateTime(value, timeZone = "Asia/Tashkent") {
  const date = new Date(value || Date.now());
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.day}.${map.month}.${map.year} ${map.hour}:${map.minute}`;
}

function formatDate(value, timeZone = "Asia/Tashkent") {
  return formatDateTime(value, timeZone).slice(0, 10);
}

function normalizePlanName(row = {}) {
  return String(row.category || row.category_name || row.name || "Reja").trim() || "Reja";
}

function toPdfSafeText(value) {
  return String(value ?? "")
    .replace(/[’`]/g, "'")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function shorten(value, maxLength = 88, fallback = "—") {
  const safe = toPdfSafeText(value);
  if (!safe) return fallback;
  if (safe.length <= maxLength) return safe;
  return `${safe.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function pdfColor(color = PDF_COLORS.ink) {
  return color
    .map((value) => {
      const normalized = Math.max(0, Math.min(255, Number(value || 0))) / 255;
      return normalized.toFixed(3).replace(/0+$/g, "").replace(/\.$/, "");
    })
    .join(" ");
}

function estimateTextWidth(value, fontSize = 10) {
  const safe = toPdfSafeText(value);
  if (!safe) return 0;

  let units = 0;
  for (const char of safe) {
    if (char === " ") {
      units += 0.28;
    } else if (NARROW_WIDTH_CHARS.includes(char)) {
      units += 0.32;
    } else if (WIDE_WIDTH_CHARS.includes(char)) {
      units += 0.86;
    } else if (/[A-Z0-9]/.test(char)) {
      units += 0.62;
    } else {
      units += 0.55;
    }
  }

  return units * fontSize;
}

function truncateToWidth(value, maxWidth, fontSize = 10) {
  const safe = toPdfSafeText(value);
  if (!safe) return "";
  if (estimateTextWidth(safe, fontSize) <= maxWidth) return safe;

  const suffix = "...";
  let current = safe;

  while (current && estimateTextWidth(`${current}${suffix}`, fontSize) > maxWidth) {
    current = current.slice(0, -1).trimEnd();
  }

  return current ? `${current}${suffix}` : suffix;
}

function splitLongToken(token, maxWidth, fontSize = 10) {
  const safe = toPdfSafeText(token);
  if (!safe) return [];

  const parts = [];
  let current = "";

  for (const char of safe) {
    const candidate = `${current}${char}`;
    if (!current || estimateTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    parts.push(current);
    current = char;
  }

  if (current) parts.push(current);
  return parts.length ? parts : [safe];
}

function wrapText(value, maxWidth, fontSize = 10, maxLines = Number.POSITIVE_INFINITY) {
  const safe = toPdfSafeText(value);
  if (!safe) return [""];
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return [safe];

  const tokens = [];
  for (const token of safe.split(/\s+/).filter(Boolean)) {
    if (estimateTextWidth(token, fontSize) <= maxWidth) {
      tokens.push(token);
    } else {
      tokens.push(...splitLongToken(token, maxWidth, fontSize));
    }
  }

  const lines = [];
  let current = "";

  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    if (!current || estimateTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = token;
  }

  if (current) lines.push(current);
  if (!lines.length) return [safe];
  if (lines.length <= maxLines) return lines;

  const visibleLines = lines.slice(0, Math.max(1, maxLines));
  visibleLines[visibleLines.length - 1] = truncateToWidth(
    `${visibleLines[visibleLines.length - 1]} ...`,
    maxWidth,
    fontSize
  );
  return visibleLines;
}

function buildRectCommand(x, yTop, width, height, options = {}) {
  if (width <= 0 || height <= 0) return "";

  const y = PAGE_HEIGHT - yTop - height;
  const fillColor = options.fillColor || null;
  const strokeColor = options.strokeColor || null;
  const lineWidth = Math.max(0.5, Number(options.lineWidth || 1));
  const rows = ["q"];

  if (fillColor) rows.push(`${pdfColor(fillColor)} rg`);
  if (strokeColor) rows.push(`${pdfColor(strokeColor)} RG`, `${lineWidth} w`);

  rows.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`);

  if (fillColor && strokeColor) rows.push("B");
  else if (fillColor) rows.push("f");
  else if (strokeColor) rows.push("S");

  rows.push("Q");
  return rows.join("\n");
}

function buildLineCommand(x1, y1Top, x2, y2Top, color = PDF_COLORS.border, lineWidth = 1) {
  const y1 = PAGE_HEIGHT - y1Top;
  const y2 = PAGE_HEIGHT - y2Top;

  return [
    "q",
    `${pdfColor(color)} RG`,
    `${Math.max(0.5, Number(lineWidth || 1)).toFixed(2)} w`,
    `${x1.toFixed(2)} ${y1.toFixed(2)} m`,
    `${x2.toFixed(2)} ${y2.toFixed(2)} l`,
    "S",
    "Q",
  ].join("\n");
}

function buildTextCommand(text, x, yTop, options = {}) {
  const safe = toPdfSafeText(text);
  if (!safe) return "";

  const fontSize = Number(options.size || 10);
  const textWidth = estimateTextWidth(safe, fontSize);
  const width = Math.max(0, Number(options.width || 0));
  let xPos = x;

  if (width > 0 && options.align === "right") {
    xPos = Math.max(x, x + width - textWidth);
  } else if (width > 0 && options.align === "center") {
    xPos = Math.max(x, x + (width - textWidth) / 2);
  }

  const baseline = PAGE_HEIGHT - yTop - fontSize * 0.82;
  const fontName = options.bold ? "F2" : "F1";
  const color = options.color || PDF_COLORS.ink;

  return [
    "q",
    `${pdfColor(color)} rg`,
    "BT",
    `/${fontName} ${fontSize.toFixed(2)} Tf`,
    `1 0 0 1 ${xPos.toFixed(2)} ${baseline.toFixed(2)} Tm`,
    `(${escapePdfText(safe)}) Tj`,
    "ET",
    "Q",
  ].join("\n");
}

function buildPdfDocument(pages = []) {
  const objects = [];
  const pageRefs = [];

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  let nextObjectId = 5;

  for (const page of pages) {
    const pageObjectId = nextObjectId;
    const contentObjectId = nextObjectId + 1;
    nextObjectId += 2;

    const stream = Array.isArray(page?.commands) ? page.commands.filter(Boolean).join("\n") : "";
    pageRefs.push(`${pageObjectId} 0 R`);

    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  objects[2] = `<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) continue;
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let id = 1; id < objects.length; id += 1) {
    const offset = offsets[id] || 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function addCommand(page, command) {
  if (command) page.commands.push(command);
}

function drawTextLines(page, lines = [], x, yTop, options = {}) {
  const lineHeight = Number(options.lineHeight || 11);
  lines.forEach((line, index) => {
    addCommand(
      page,
      buildTextCommand(line, x, yTop + index * lineHeight, options)
    );
  });
}

function drawSummaryCard(page, x, yTop, width, height, label, value, accentColor) {
  addCommand(page, buildRectCommand(x, yTop, width, height, {
    fillColor: PDF_COLORS.cardBg,
    strokeColor: PDF_COLORS.border,
  }));
  addCommand(page, buildRectCommand(x, yTop, width, 4, { fillColor: accentColor }));
  addCommand(page, buildTextCommand(label, x + 12, yTop + 14, {
    size: 9,
    color: PDF_COLORS.muted,
  }));
  addCommand(page, buildTextCommand(value, x + 12, yTop + 34, {
    size: 13,
    bold: true,
    color: accentColor,
    width: width - 24,
  }));
}

function drawStatCard(page, x, yTop, width, height, label, value) {
  addCommand(page, buildRectCommand(x, yTop, width, height, {
    fillColor: PDF_COLORS.white,
    strokeColor: PDF_COLORS.border,
  }));
  addCommand(page, buildTextCommand(label, x + 10, yTop + 12, {
    size: 8.5,
    color: PDF_COLORS.muted,
  }));
  addCommand(page, buildTextCommand(String(value), x + 10, yTop + 28, {
    size: 12,
    bold: true,
    color: PDF_COLORS.ink,
  }));
}

function measureTableRowHeight(columns = [], cells = []) {
  let tallest = TABLE_LINE_HEIGHT + TABLE_CELL_PADDING_Y * 2;

  columns.forEach((column, index) => {
    const cell = cells[index] || {};
    const lines = wrapText(
      cell.text || "—",
      Math.max(28, Number(column.width || 0) - TABLE_CELL_PADDING_X * 2),
      TABLE_FONT_SIZE,
      Number(column.maxLines || 2)
    );

    const lineCount = Math.max(1, lines.length);
    tallest = Math.max(
      tallest,
      lineCount * TABLE_LINE_HEIGHT + TABLE_CELL_PADDING_Y * 2
    );
  });

  return Math.max(28, tallest);
}

export function summarizeDailyReport(dataset = {}) {
  const transactions = Array.isArray(dataset.transactions) ? dataset.transactions : [];
  const debts = Array.isArray(dataset.debts) ? dataset.debts : [];
  const plans = Array.isArray(dataset.plans) ? dataset.plans : [];

  const income = transactions
    .filter((row) => row?.type === "income")
    .reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const expense = transactions
    .filter((row) => row?.type === "expense")
    .reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const receiptsCount = transactions.filter((row) => row?.receipt || row?.receipt_url).length;

  return {
    transactionsCount: transactions.length,
    debtsCount: debts.length,
    plansCount: plans.length,
    receiptsCount,
    income,
    expense,
    balance: income - expense,
    totalActivities: transactions.length + debts.length + plans.length,
  };
}

export function buildDailyReportPdf(dataset = {}, options = {}) {
  const timeZone = options.timeZone || "Asia/Tashkent";
  const generatedAt = options.generatedAt || Date.now();
  const summary = summarizeDailyReport(dataset);
  const safeFullName = shorten(options.fullName, 44, "");
  const pages = [];

  let currentPage = { commands: [] };
  let currentY = PAGE_MARGIN.top;
  pages.push(currentPage);

  const startNewPage = () => {
    currentPage = { commands: [] };
    pages.push(currentPage);
    currentY = PAGE_MARGIN.top;
  };

  const ensureSpace = (height) => {
    if (currentY + height <= CONTENT_BOTTOM) return false;
    startNewPage();
    return true;
  };

  const renderHero = () => {
    const x = PAGE_MARGIN.left;
    const y = currentY;
    const width = CONTENT_WIDTH;
    const height = 108;
    const rightColumnWidth = 136;
    const metaColor = [226, 232, 240];
    const titleWidth = width - rightColumnWidth - 28;

    addCommand(currentPage, buildRectCommand(x, y, width, height, {
      fillColor: PDF_COLORS.header,
    }));
    addCommand(currentPage, buildRectCommand(x, y, width, 5, {
      fillColor: PDF_COLORS.headerAccent,
    }));

    addCommand(currentPage, buildTextCommand("Kassa - Moliyaviy hisobot", x + 16, y + 18, {
      size: 18,
      bold: true,
      color: PDF_COLORS.white,
      width: titleWidth,
    }));
    addCommand(currentPage, buildTextCommand("Davr: Bugungi hisobot", x + 16, y + 46, {
      size: 10,
      color: metaColor,
      width: titleWidth,
    }));
    addCommand(currentPage, buildTextCommand(`Sana: ${formatDate(generatedAt, timeZone)}`, x + 16, y + 62, {
      size: 10,
      color: metaColor,
      width: titleWidth,
    }));
    addCommand(currentPage, buildTextCommand(`Yaratilgan: ${formatDateTime(generatedAt, timeZone)}`, x + 16, y + 78, {
      size: 10,
      color: metaColor,
      width: titleWidth,
    }));

    if (safeFullName) {
      addCommand(currentPage, buildTextCommand(`Foydalanuvchi: ${safeFullName}`, x + 16, y + 94, {
        size: 9,
        color: metaColor,
        width: titleWidth,
      }));
    }

    const statX = x + width - rightColumnWidth - 16;
    addCommand(currentPage, buildTextCommand("Kun yakuni", statX, y + 18, {
      size: 9,
      bold: true,
      color: PDF_COLORS.headerAccent,
      width: rightColumnWidth,
      align: "right",
    }));
    addCommand(currentPage, buildTextCommand(String(summary.totalActivities || 0), statX, y + 38, {
      size: 28,
      bold: true,
      color: PDF_COLORS.white,
      width: rightColumnWidth,
      align: "right",
    }));
    addCommand(currentPage, buildTextCommand("Jami yozuvlar", statX, y + 76, {
      size: 9,
      color: metaColor,
      width: rightColumnWidth,
      align: "right",
    }));

    currentY += height + 16;
  };

  const renderSummary = () => {
    const gap = 10;
    const cardWidth = (CONTENT_WIDTH - gap * 2) / 3;
    const summaryHeight = 64;
    const balanceColor = summary.balance >= 0 ? PDF_COLORS.balance : PDF_COLORS.expense;

    drawSummaryCard(
      currentPage,
      PAGE_MARGIN.left,
      currentY,
      cardWidth,
      summaryHeight,
      "Kirim",
      `+${numFmt(summary.income)} so'm`,
      PDF_COLORS.income
    );
    drawSummaryCard(
      currentPage,
      PAGE_MARGIN.left + cardWidth + gap,
      currentY,
      cardWidth,
      summaryHeight,
      "Chiqim",
      `-${numFmt(summary.expense)} so'm`,
      PDF_COLORS.expense
    );
    drawSummaryCard(
      currentPage,
      PAGE_MARGIN.left + (cardWidth + gap) * 2,
      currentY,
      cardWidth,
      summaryHeight,
      "Qoldiq",
      `${numFmt(summary.balance)} so'm`,
      balanceColor
    );

    currentY += summaryHeight + 10;

    const statWidth = (CONTENT_WIDTH - gap * 3) / 4;
    const statHeight = 48;
    const stats = [
      ["Operatsiyalar", summary.transactionsCount],
      ["Cheklar", summary.receiptsCount],
      ["Qarzlar", summary.debtsCount],
      ["Rejalar", summary.plansCount],
    ];

    stats.forEach(([label, value], index) => {
      drawStatCard(
        currentPage,
        PAGE_MARGIN.left + (statWidth + gap) * index,
        currentY,
        statWidth,
        statHeight,
        label,
        value
      );
    });

    currentY += statHeight + 18;
  };

  const renderSectionTitle = (title) => {
    addCommand(currentPage, buildRectCommand(PAGE_MARGIN.left, currentY + 4, 4, 18, {
      fillColor: PDF_COLORS.stats,
    }));
    addCommand(currentPage, buildTextCommand(title, PAGE_MARGIN.left + 12, currentY + 3, {
      size: 13,
      bold: true,
      color: PDF_COLORS.ink,
    }));
    currentY += 26;
  };

  const renderTableHeader = (columns = []) => {
    const headerHeight = 28;
    let cursorX = PAGE_MARGIN.left;

    addCommand(currentPage, buildRectCommand(PAGE_MARGIN.left, currentY, CONTENT_WIDTH, headerHeight, {
      fillColor: PDF_COLORS.ink,
      strokeColor: PDF_COLORS.ink,
    }));

    columns.forEach((column) => {
      addCommand(currentPage, buildTextCommand(column.label, cursorX + TABLE_CELL_PADDING_X, currentY + 8, {
        size: 9,
        bold: true,
        color: PDF_COLORS.white,
        width: column.width - TABLE_CELL_PADDING_X * 2,
        align: column.align || "left",
      }));
      cursorX += column.width;
    });

    currentY += headerHeight;
  };

  const renderTableRow = (columns = [], cells = [], index = 0) => {
    const rowHeight = measureTableRowHeight(columns, cells);
    let cursorX = PAGE_MARGIN.left;

    addCommand(currentPage, buildRectCommand(PAGE_MARGIN.left, currentY, CONTENT_WIDTH, rowHeight, {
      fillColor: index % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.rowAlt,
      strokeColor: PDF_COLORS.border,
    }));

    columns.forEach((column, columnIndex) => {
      if (columnIndex > 0) {
        addCommand(currentPage, buildLineCommand(cursorX, currentY, cursorX, currentY + rowHeight, PDF_COLORS.border, 1));
      }

      const cell = cells[columnIndex] || {};
      const lines = wrapText(
        cell.text || "—",
        Math.max(28, column.width - TABLE_CELL_PADDING_X * 2),
        TABLE_FONT_SIZE,
        Number(column.maxLines || 2)
      );
      const lineCount = Math.max(1, lines.length);
      const textBlockHeight = lineCount * TABLE_LINE_HEIGHT;
      const textTop = currentY + Math.max(TABLE_CELL_PADDING_Y, (rowHeight - textBlockHeight) / 2 - 1);

      drawTextLines(currentPage, lines, cursorX + TABLE_CELL_PADDING_X, textTop, {
        size: TABLE_FONT_SIZE,
        lineHeight: TABLE_LINE_HEIGHT,
        color: cell.color || PDF_COLORS.ink,
        bold: !!cell.bold,
        align: cell.align || column.align || "left",
        width: column.width - TABLE_CELL_PADDING_X * 2,
      });

      cursorX += column.width;
    });

    currentY += rowHeight;
  };

  const renderTableSection = (title, columns, rows) => {
    if (!Array.isArray(rows) || !rows.length) return;

    const openSection = (continued = false) => {
      ensureSpace(56);
      renderSectionTitle(continued ? `${title} (davomi)` : title);
      renderTableHeader(columns);
    };

    openSection(false);

    rows.forEach((cells, index) => {
      const rowHeight = measureTableRowHeight(columns, cells);
      if (currentY + rowHeight > CONTENT_BOTTOM) {
        startNewPage();
        openSection(true);
      }
      renderTableRow(columns, cells, index);
    });

    currentY += 16;
  };

  renderHero();
  renderSummary();

  const transactionRows = (Array.isArray(dataset.transactions) ? dataset.transactions : []).map((row) => {
    const isIncome = row?.type === "income";
    return [
      { text: formatDateTime(row?.date || row?.created_at || generatedAt, timeZone) },
      { text: shorten(row?.category || row?.category_name || "Kategoriya", 48) },
      {
        text: isIncome ? "Kirim" : "Chiqim",
        color: isIncome ? PDF_COLORS.income : PDF_COLORS.expense,
        bold: true,
      },
      {
        text: `${isIncome ? "+" : "-"}${numFmt(row?.amount || 0)} so'm`,
        align: "right",
        color: isIncome ? PDF_COLORS.income : PDF_COLORS.expense,
        bold: true,
      },
    ];
  });

  const debtRows = (Array.isArray(dataset.debts) ? dataset.debts : []).map((row) => [
    { text: formatDateTime(row?.created_at || generatedAt, timeZone) },
    { text: shorten(row?.person_name || "Noma'lum", 34) },
    {
      text: row?.direction === "payable" ? "Qaytarasiz" : "Qaytadi",
      color: row?.direction === "payable" ? PDF_COLORS.expense : PDF_COLORS.income,
      bold: true,
    },
    {
      text: `${numFmt(row?.amount || 0)} so'm`,
      align: "right",
      color: PDF_COLORS.ink,
      bold: true,
    },
  ]);

  const planRows = (Array.isArray(dataset.plans) ? dataset.plans : []).map((row) => [
    { text: formatDateTime(row?.created_at || row?.updated_at || generatedAt, timeZone) },
    { text: shorten(normalizePlanName(row), 34) },
    {
      text: `${numFmt(row?.amount || 0)} so'm`,
      align: "right",
      color: PDF_COLORS.balance,
      bold: true,
    },
    {
      text: `${numFmt(row?.alert_before || 0)} so'm`,
      align: "right",
      color: PDF_COLORS.stats,
      bold: true,
    },
  ]);

  renderTableSection("Tranzaksiyalar", [
    { label: "Sana", width: 100, maxLines: 1 },
    { label: "Kategoriya", width: 225, maxLines: 2 },
    { label: "Tur", width: 72, maxLines: 1 },
    { label: "Summa", width: 150, maxLines: 1, align: "right" },
  ], transactionRows);

  renderTableSection("Qarzlar", [
    { label: "Sana", width: 100, maxLines: 1 },
    { label: "Inson", width: 170, maxLines: 2 },
    { label: "Holat", width: 137, maxLines: 1 },
    { label: "Summa", width: 140, maxLines: 1, align: "right" },
  ], debtRows);

  renderTableSection("Rejalar", [
    { label: "Sana", width: 100, maxLines: 1 },
    { label: "Kategoriya", width: 175, maxLines: 2 },
    { label: "Limit", width: 136, maxLines: 1, align: "right" },
    { label: "Ogoh.", width: 136, maxLines: 1, align: "right" },
  ], planRows);

  pages.forEach((page, index) => {
    addCommand(page, buildLineCommand(PAGE_MARGIN.left, CONTENT_BOTTOM + 4, PAGE_WIDTH - PAGE_MARGIN.right, CONTENT_BOTTOM + 4, PDF_COLORS.border, 1));
    addCommand(page, buildTextCommand("Kassa", PAGE_MARGIN.left, CONTENT_BOTTOM + 9, {
      size: 8,
      bold: true,
      color: PDF_COLORS.muted,
    }));
    addCommand(page, buildTextCommand(`Sahifa ${index + 1}/${pages.length}`, PAGE_WIDTH - PAGE_MARGIN.right - 74, CONTENT_BOTTOM + 9, {
      size: 8,
      color: PDF_COLORS.muted,
      width: 74,
      align: "right",
    }));
  });

  return buildPdfDocument(pages);
}
