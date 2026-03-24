'use strict';

const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN yo'q");

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

function escXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  } catch {
    return new Date(value).toLocaleString('uz-UZ');
  }
}

function buildExcelXml(payload = {}) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const meta = payload.meta || {};
  const summary = payload.summary || {};

  const headerCells = ['Sana', 'Kategoriya', 'Tur', 'Summa (so\'m)', 'Chek', 'Manba'].map((label) => (
    `<Cell ss:StyleID="header"><Data ss:Type="String">${escXml(label)}</Data></Cell>`
  )).join('');

  const bodyRows = rows.map((row) => {
    const amount = Number(row.amount || 0);
    return `<Row>
      <Cell><Data ss:Type="String">${escXml(fmtDate(row.date || row.created_at || row.ms || ''))}</Data></Cell>
      <Cell><Data ss:Type="String">${escXml(row.category || '—')}</Data></Cell>
      <Cell><Data ss:Type="String">${escXml(row.type === 'income' ? 'Kirim' : 'Chiqim')}</Data></Cell>
      <Cell ss:StyleID="number"><Data ss:Type="Number">${Number.isFinite(amount) ? amount : 0}</Data></Cell>
      <Cell><Data ss:Type="String">${escXml(row.receipt_url || row.receipt ? 'Bor' : 'Yo\'q')}</Data></Cell>
      <Cell><Data ss:Type="String">${escXml(row.source || '')}</Data></Cell>
    </Row>`;
  }).join('\n');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#111827" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
  </Style>
  <Style ss:ID="section">
   <Font ss:Bold="1" ss:Color="#0F172A" ss:Size="12"/>
  </Style>
  <Style ss:ID="number">
   <NumberFormat ss:Format="#,##0"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Hisobot">
  <Table>
   <Column ss:Width="130"/>
   <Column ss:Width="220"/>
   <Column ss:Width="90"/>
   <Column ss:Width="110"/>
   <Column ss:Width="70"/>
   <Column ss:Width="100"/>
   <Row>
    <Cell ss:MergeAcross="5" ss:StyleID="section"><Data ss:Type="String">Kassa - Excel hisobot</Data></Cell>
   </Row>
   <Row>
    <Cell ss:MergeAcross="5"><Data ss:Type="String">Davr: ${escXml(meta.period || '—')}</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type="String">Kirim</Data></Cell>
    <Cell ss:StyleID="number"><Data ss:Type="Number">${Number(summary.income || 0)}</Data></Cell>
    <Cell><Data ss:Type="String">Chiqim</Data></Cell>
    <Cell ss:StyleID="number"><Data ss:Type="Number">${Number(summary.expense || 0)}</Data></Cell>
    <Cell><Data ss:Type="String">Qoldiq</Data></Cell>
    <Cell ss:StyleID="number"><Data ss:Type="Number">${Number(summary.balance || 0)}</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type="String">Operatsiyalar</Data></Cell>
    <Cell><Data ss:Type="Number">${Number(summary.count || rows.length || 0)}</Data></Cell>
    <Cell><Data ss:Type="String">Cheklar</Data></Cell>
    <Cell><Data ss:Type="Number">${Number(summary.receipts || 0)}</Data></Cell>
    <Cell><Data ss:Type="String">Yaratildi</Data></Cell>
    <Cell><Data ss:Type="String">${escXml(meta.generatedAt || fmtDate(Date.now()))}</Data></Cell>
   </Row>
   <Row/>
   <Row>${headerCells}</Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('send-report-files ready');
  }

  try {
    const body = req.body || {};
    const userId = Number(body.user_id || body.userId || 0);
    const pdfFileName = String(body.pdf_file_name || body.pdfFileName || 'Kassa-report.pdf').trim() || 'Kassa-report.pdf';
    const pdfCaption = String(body.pdf_caption || body.pdfCaption || '📄 Kassa PDF hisobot').trim();
    const pdfBase64 = String(body.pdf_base64 || body.pdfBase64 || '').trim();
    const excelFileName = String(body.excel_file_name || body.excelFileName || 'Kassa-report.xls').trim() || 'Kassa-report.xls';
    const excelCaption = String(body.excel_caption || body.excelCaption || '📊 Kassa Excel hisobot').trim();

    if (!userId) return res.status(400).json({ ok: false, error: 'user_id required' });
    if (!pdfBase64) return res.status(400).json({ ok: false, error: 'pdf_base64 required' });

    const cleanPdfBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const pdfBuffer = Buffer.from(cleanPdfBase64, 'base64');
    if (!pdfBuffer.length) return res.status(400).json({ ok: false, error: 'invalid pdf payload' });

    const excelXml = buildExcelXml(body);
    const excelBuffer = Buffer.from(excelXml, 'utf8');

    await bot.sendDocument(
      userId,
      pdfBuffer,
      { caption: pdfCaption },
      { filename: pdfFileName, contentType: 'application/pdf' }
    );

    await bot.sendDocument(
      userId,
      excelBuffer,
      { caption: excelCaption },
      { filename: excelFileName, contentType: 'application/vnd.ms-excel' }
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
