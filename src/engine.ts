import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { NormalizedRow, ImportLog, ValidationIssue, Gstr1Result, Gstr1TableSummaryItem } from './types';

export const PLATFORM_DIRECTORY: string[] = [
  "Amazon", "Flipkart", "Meesho", "Myntra", "Snapdeal", "GlowRoad", "LimeRoad", "JioMart",
  "Tata CLiQ", "Snapmint", "Citymall", "Roposo Clout", "Shopdeck", "Pepperfry", "AJIO",
  "Blinkit", "Nykaa", "Shopify", "WooCommerce", "Etsy", "Shopsy", "Zomato", "Swiggy",
  "Dreamplug", "House of Varee", "Poptech", "Paytm Mall", "FirstCry", "BigBasket",
  "Zepto", "ONDC seller apps", "Custom / Other"
];

export const ALIASES: Record<string, string[]> = {
  invoice_no: [
    "invoice_no", "invoice number", "invoice no", "invoice id", "bill no", "bill number",
    "order invoice", "tax invoice no", "document number", "inum", "invoice_num", "order_id"
  ],
  invoice_date: [
    "invoice_date", "invoice date", "date", "bill date", "document date", "order date", "idt", "created_at"
  ],
  customer_gstin: [
    "customer_gstin", "gstin", "buyer gstin", "recipient gstin", "billing gstin", "ctin", "gst number", "tin"
  ],
  customer_name: [
    "customer_name", "buyer name", "customer", "recipient name", "billing name", "party name", "client name"
  ],
  place_of_supply: [
    "place_of_supply", "place of supply", "pos", "destination state", "shipping state", "state of supply", "delivery state"
  ],
  state_code: [
    "state_code", "pos code", "place of supply code", "state code", "pos_code"
  ],
  invoice_value: [
    "invoice_value", "invoice amount", "total invoice value", "gross amount", "grand total", "total amount", "amount", "total"
  ],
  taxable_value: [
    "taxable_value", "taxable amount", "assessable value", "taxable value", "net taxable", "taxable", "subtotal"
  ],
  gst_rate: [
    "gst_rate", "tax rate", "gst %", "gst percentage", "rate", "tax%", "tax_rate"
  ],
  igst: [
    "igst", "integrated tax", "igst amount", "integrated_tax"
  ],
  cgst: [
    "cgst", "central tax", "cgst amount", "central_tax"
  ],
  sgst: [
    "sgst", "utgst", "state tax", "sgst amount", "utgst amount", "state_tax"
  ],
  cess: [
    "cess", "cess amount"
  ],
  hsn: [
    "hsn", "hsn code", "hsn/sac", "hsn sac", "sac", "hsn_code"
  ],
  quantity: [
    "quantity", "qty", "units", "quantity sold", "count"
  ],
  uom: [
    "uom", "unit", "unit of measure", "uqc"
  ],
  document_type: [
    "document_type", "type", "transaction type", "note type", "document type", "doc_type"
  ],
  platform: [
    "platform", "marketplace", "channel", "sales channel", "source"
  ],
  ecommerce_gstin: [
    "ecommerce_gstin", "e-commerce gstin", "operator gstin", "eco gstin", "tcs_gstin"
  ]
};

export function norm(s: any): string {
  if (s == null) return '';
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function detectPlatform(filename: string, hint: string = "Auto-detect"): string {
  if (hint && hint !== "Auto-detect") return hint;
  const n = filename.toLowerCase();
  for (const p of PLATFORM_DIRECTORY) {
    if (n.replace(/\s+/g, '').includes(p.toLowerCase().replace(/\s+/g, ''))) {
      return p;
    }
  }
  return "Custom / Other";
}

export function mapColumns(columns: string[]): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const c of columns) {
    normalized[norm(c)] = c;
  }

  const mapping: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const a of aliases) {
      const na = norm(a);
      if (normalized[na] !== undefined) {
        mapping[field] = normalized[na];
        break;
      }
    }
  }
  return mapping;
}

export function asNum(v: any): number {
  if (v == null || v === '') return 0.0;
  if (typeof v === 'number') {
    return isNaN(v) ? 0.0 : v;
  }
  let str = String(v).replace(/,/g, '').replace(/₹/g, '').replace(/%/g, '').trim();
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0.0 : parsed;
}

export interface UploadFileInput {
  name: string;
  buffer: ArrayBuffer;
}

export function parseUploads(files: UploadFileInput[], platformHint: string = "Auto-detect"): { rows: NormalizedRow[]; logs: ImportLog[] } {
  const allRows: NormalizedRow[] = [];
  const logs: ImportLog[] = [];

  for (const file of files) {
    const platform = detectPlatform(file.name, platformHint);
    try {
      let sheetsData: Record<string, Record<string, any>[]> = {};

      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = new TextDecoder().decode(file.buffer);
        const parsed = Papa.parse<Record<string, any>>(text, {
          header: true,
          skipEmptyLines: 'greedy'
        });
        sheetsData['CSV'] = parsed.data || [];
      } else {
        const workbook = XLSX.read(file.buffer, { type: 'array', cellDates: true });
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
            defval: '',
            raw: false
          });
          sheetsData[sheetName] = json;
        }
      }

      for (const [sheet, dataList] of Object.entries(sheetsData)) {
        if (!dataList || dataList.length === 0) continue;

        // Clean headers
        const sampleRow = dataList[0];
        const rawColumns = Object.keys(sampleRow).map(c => String(c).trim());
        const mapping = mapColumns(rawColumns);

        if (!['invoice_no', 'invoice_value', 'taxable_value'].some(x => x in mapping)) {
          logs.push({
            file: file.name,
            sheet,
            platform,
            status: "Skipped: no recognizable invoice/value columns",
            rows: 0,
            mapped_fields: Object.keys(mapping).join(', ')
          });
          continue;
        }

        let fileCount = 0;
        for (let i = 0; i < dataList.length; i++) {
          const r = dataList[i];
          const get = (k: string, defaultValue: any = ""): any => {
            const col = mapping[k];
            if (col && r[col] !== undefined && r[col] !== null) {
              return r[col];
            }
            return defaultValue;
          };

          const invNoRaw = get("invoice_no");
          let taxable = asNum(get("taxable_value"));
          const invval = asNum(get("invoice_value", taxable));
          const rate = asNum(get("gst_rate"));
          const igst = asNum(get("igst"));
          const cgst = asNum(get("cgst"));
          const sgst = asNum(get("sgst"));
          const cess = asNum(get("cess"));

          if (!taxable && invval) {
            const tax = igst + cgst + sgst + cess;
            if (tax) {
              taxable = Math.max(invval - tax, 0);
            } else if (rate) {
              taxable = invval / (1 + rate / 100);
            } else {
              taxable = invval;
            }
          }

          if (!invNoRaw && !invval && !taxable) continue;

          let invoiceDate = String(get("invoice_date") || "").trim();
          if (invoiceDate.length > 10) {
            invoiceDate = invoiceDate.slice(0, 10);
          }

          const rawStateCode = String(get("state_code") || "").trim();
          const stateCodeFormatted = rawStateCode ? rawStateCode.padStart(2, '0') : "";

          const rowRecord: NormalizedRow = {
            id: `${file.name}-${sheet}-${i}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            invoice_no: String(get("invoice_no")).trim(),
            invoice_date: invoiceDate,
            customer_gstin: String(get("customer_gstin")).trim().toUpperCase(),
            customer_name: String(get("customer_name")).trim(),
            place_of_supply: String(get("place_of_supply")).trim(),
            state_code: stateCodeFormatted,
            invoice_value: Math.round(invval * 100) / 100,
            taxable_value: Math.round(taxable * 100) / 100,
            gst_rate: rate,
            igst: Math.round(igst * 100) / 100,
            cgst: Math.round(cgst * 100) / 100,
            sgst: Math.round(sgst * 100) / 100,
            cess: Math.round(cess * 100) / 100,
            hsn: String(get("hsn")).trim(),
            quantity: asNum(get("quantity")),
            uom: String(get("uom") || "OTH").trim().toUpperCase(),
            document_type: String(get("document_type") || "Invoice").trim(),
            platform: String(get("platform") || platform).trim(),
            ecommerce_gstin: String(get("ecommerce_gstin")).trim().toUpperCase(),
            source_file: file.name,
            source_sheet: sheet
          };

          allRows.push(rowRecord);
          fileCount++;
        }

        logs.push({
          file: file.name,
          sheet,
          platform,
          status: "Processed",
          rows: fileCount,
          mapped_fields: Object.keys(mapping).join(', ')
        });
      }
    } catch (err: any) {
      logs.push({
        file: file.name,
        sheet: "-",
        platform,
        status: `Error: ${err?.message || String(err)}`,
        rows: 0,
        mapped_fields: ""
      });
    }
  }

  return { rows: allRows, logs };
}

export function validateRecords(rows: NormalizedRow[], supplierGstin: string = "", period: string = ""): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  rows.forEach((r, idx) => {
    const rowNum = idx + 1;
    if (!r.invoice_no) {
      issues.push({ row: rowNum, invoice: "", issue: "Missing invoice number", severity: "error" });
    }
    if (!r.invoice_date) {
      issues.push({ row: rowNum, invoice: r.invoice_no, issue: "Missing invoice date", severity: "warning" });
    }
    if (!r.taxable_value && !r.invoice_value) {
      issues.push({ row: rowNum, invoice: r.invoice_no, issue: "Missing taxable/invoice value", severity: "error" });
    }
    const buyerGstin = (r.customer_gstin || "").trim();
    if (buyerGstin && (buyerGstin.length !== 15 || !gstinRegex.test(buyerGstin))) {
      issues.push({ row: rowNum, invoice: r.invoice_no, issue: "Customer GSTIN format/checksum pattern invalid", severity: "error" });
    }
    const igstVal = Number(r.igst) || 0;
    const cgstVal = Number(r.cgst) || 0;
    const sgstVal = Number(r.sgst) || 0;
    if (igstVal > 0 && (cgstVal > 0 || sgstVal > 0)) {
      issues.push({ row: rowNum, invoice: r.invoice_no, issue: "IGST and CGST/SGST both populated; verify tax treatment", severity: "warning" });
    }
    const taxableVal = Number(r.taxable_value) || 0;
    if (taxableVal < 0) {
      issues.push({ row: rowNum, invoice: r.invoice_no, issue: "Negative taxable value; check credit-note handling", severity: "warning" });
    }
  });

  const seen = new Set<string>();
  rows.forEach((r, idx) => {
    const rowNum = idx + 1;
    const key = `${r.invoice_no || ''}|${r.invoice_date || ''}|${r.customer_gstin || ''}`;
    if (r.invoice_no && seen.has(key)) {
      issues.push({ row: rowNum, invoice: r.invoice_no, issue: "Possible duplicate invoice (same number, date and buyer)", severity: "warning" });
    }
    if (r.invoice_no) {
      seen.add(key);
    }
  });

  if (supplierGstin && supplierGstin.length !== 15) {
    issues.push({ row: "Setup", invoice: "", issue: "Supplier GSTIN must be 15 characters", severity: "error" });
  }
  if (period && !/^(0[1-9]|1[0-2])[0-9]{4}$/.test(period)) {
    issues.push({ row: "Setup", invoice: "", issue: "Return period must be MMYYYY format", severity: "error" });
  }

  return issues;
}

function resolvePos(r: NormalizedRow, supplierState: string): string {
  const sc = String(r.state_code || '').trim().padStart(2, '0');
  if (sc && sc !== '00') return sc;

  const p = String(r.place_of_supply || '').trim();
  const m = p.match(/^(\d{1,2})/);
  if (m) {
    return m[1].padStart(2, '0');
  }
  return supplierState.padStart(2, '0');
}

function makeTaxItem(r: NormalizedRow) {
  const rate = Number(r.gst_rate) || 0;
  const taxable = Number(r.taxable_value) || 0;
  let igst = Number(r.igst) || 0;
  let cgst = Number(r.cgst) || 0;
  let sgst = Number(r.sgst) || 0;
  const cess = Number(r.cess) || 0;

  if (igst === 0 && cgst === 0 && sgst === 0 && rate > 0 && taxable > 0) {
    igst = Math.round((taxable * rate / 100) * 100) / 100;
    cgst = 0;
    sgst = 0;
  }

  return {
    num: 1,
    itm_det: {
      txval: Math.round(taxable * 100) / 100,
      rt: rate,
      iamt: Math.round(igst * 100) / 100,
      camt: Math.round(cgst * 100) / 100,
      samt: Math.round(sgst * 100) / 100,
      csamt: Math.round(cess * 100) / 100
    }
  };
}

export function buildGstr1(
  rows: NormalizedRow[],
  gstin: string,
  period: string,
  supplierState: string = "07",
  threshold: number = 100000
): Gstr1Result {
  const formattedSupplierState = (supplierState || "07").trim().padStart(2, '0');
  const b2bMap: Record<string, any[]> = {};
  const b2clMap: Record<string, any[]> = {};
  const b2csMap: Record<string, number> = {};
  const cdn: any[] = [];

  const hsnMap: Record<string, {
    qty: number;
    txval: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
    rt: number;
    uqc: string;
  }> = {};

  for (const r of rows) {
    const pos = resolvePos(r, formattedSupplierState);
    const dateStr = String(r.invoice_date || '');
    let formattedDt = dateStr;
    if (dateStr) {
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD -> DD-MM-YYYY
          formattedDt = `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
        } else if (parts[2].length === 4) {
          // DD-MM-YYYY or MM-DD-YYYY
          formattedDt = `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
        }
      }
    }

    const invno = String(r.invoice_no || '').trim();
    const typ = String(r.document_type || 'Invoice').toLowerCase();
    const value = Math.round((Number(r.invoice_value) || 0) * 100) / 100;
    const tx = Math.round((Number(r.taxable_value) || 0) * 100) / 100;
    const rate = Number(r.gst_rate) || 0;
    const item = makeTaxItem(r);
    const itms = [item];
    const buyerGstin = String(r.customer_gstin || '').trim().toUpperCase();

    if (typ.includes('credit') || typ.includes('debit')) {
      cdn.push({
        ntty: typ.includes('credit') ? 'C' : 'D',
        nt_num: invno,
        nt_dt: formattedDt,
        val: value,
        pos,
        rchrg: 'N',
        inv_typ: 'R',
        itms,
        typ: buyerGstin ? 'R' : 'UR'
      });
    } else if (buyerGstin) {
      if (!b2bMap[buyerGstin]) b2bMap[buyerGstin] = [];
      b2bMap[buyerGstin].push({
        inum: invno,
        idt: formattedDt,
        val: value,
        pos,
        rchrg: 'N',
        inv_typ: 'R',
        itms
      });
    } else if (pos !== formattedSupplierState && value > threshold) {
      if (!b2clMap[pos]) b2clMap[pos] = [];
      b2clMap[pos].push({
        inum: invno,
        idt: formattedDt,
        val: value,
        itms
      });
    } else {
      const key = `${pos}___${rate}`;
      b2csMap[key] = (b2csMap[key] || 0) + tx;
    }

    const h = String(r.hsn || '').trim() || 'UNSPECIFIED';
    if (!hsnMap[h]) {
      hsnMap[h] = {
        qty: 0,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        csamt: 0,
        rt: rate,
        uqc: String(r.uom || 'OTH').toUpperCase()
      };
    }
    hsnMap[h].qty += Number(r.quantity) || 0;
    hsnMap[h].txval += tx;
    hsnMap[h].iamt += item.itm_det.iamt;
    hsnMap[h].camt += item.itm_det.camt;
    hsnMap[h].samt += item.itm_det.samt;
    hsnMap[h].csamt += item.itm_det.csamt;
    hsnMap[h].rt = rate;
  }

  const b2bArray = Object.entries(b2bMap).map(([ctin, inv]) => ({ ctin, inv }));
  const b2clArray = Object.entries(b2clMap).map(([pos, inv]) => ({ pos, inv }));
  const b2csArray = Object.entries(b2csMap).map(([key, txval]) => {
    const [pos, rateStr] = key.split('___');
    return {
      sply_ty: pos !== formattedSupplierState ? "INTER" : "INTRA",
      pos,
      typ: "OE",
      rt: parseFloat(rateStr) || 0,
      txval: Math.round(txval * 100) / 100
    };
  });

  const hsnData = Object.entries(hsnMap).map(([hsnCode, val], index) => {
    const totalVal = val.txval + val.iamt + val.camt + val.samt + val.csamt;
    return {
      num: index + 1,
      hsn_sc: hsnCode,
      desc: "",
      uqc: val.uqc || "OTH",
      qty: Math.round(val.qty * 1000) / 1000,
      val: Math.round(totalVal * 100) / 100,
      txval: Math.round(val.txval * 100) / 100,
      iamt: Math.round(val.iamt * 100) / 100,
      camt: Math.round(val.camt * 100) / 100,
      samt: Math.round(val.samt * 100) / 100,
      csamt: Math.round(val.csamt * 100) / 100
    };
  });

  const b2bCount = Object.values(b2bMap).reduce((acc, curr) => acc + curr.length, 0);
  const b2clCount = Object.values(b2clMap).reduce((acc, curr) => acc + curr.length, 0);
  const b2csCount = Object.keys(b2csMap).length;
  const cdnCount = cdn.length;

  const jsonPayload = {
    version: "3.2-preparation",
    gstin,
    fp: period,
    b2b: b2bArray,
    b2cl: b2clArray,
    b2cs: b2csArray,
    cdnr: [],
    cdnur: cdn,
    hsn: {
      data: hsnData
    },
    doc_issue: {
      doc_det: []
    }
  };

  const tableSummary: Gstr1TableSummaryItem[] = [
    { 'GSTR-1 table': "4A/4B B2B", records: b2bCount },
    { 'GSTR-1 table': "5 B2CL", records: b2clCount },
    { 'GSTR-1 table': "7 B2CS", records: b2csCount },
    { 'GSTR-1 table': "9B Credit/Debit Notes (review classification)", records: cdnCount },
    { 'GSTR-1 table': "12 HSN summary (aggregated)", records: hsnData.length }
  ];

  return {
    json: jsonPayload,
    summary: {
      b2b: b2bCount,
      b2cl: b2clCount,
      b2cs: b2csCount,
      cdn: cdnCount
    },
    table_summary: tableSummary
  };
}

export function generateExcelWorkbook(result: Gstr1Result, rows: NormalizedRow[], issues: ValidationIssue[]): Uint8Array {
  const wb = XLSX.utils.book_new();

  // 1. Sales Register
  const cleanRows = rows.map(({ id, ...rest }) => rest);
  const wsSales = XLSX.utils.json_to_sheet(cleanRows.length ? cleanRows : [{}]);
  XLSX.utils.book_append_sheet(wb, wsSales, "Sales Register");

  // 2. GSTR1 Summary
  const wsSummary = XLSX.utils.json_to_sheet(result.table_summary);
  XLSX.utils.book_append_sheet(wb, wsSummary, "GSTR1 Summary");

  // 3. B2B Raw
  const flatB2B: any[] = [];
  result.json.b2b.forEach(b => {
    b.inv.forEach(i => {
      flatB2B.push({
        ctin: b.ctin,
        inum: i.inum,
        idt: i.idt,
        val: i.val,
        pos: i.pos,
        rate: i.itms?.[0]?.itm_det?.rt ?? 0,
        taxable_value: i.itms?.[0]?.itm_det?.txval ?? 0,
        igst: i.itms?.[0]?.itm_det?.iamt ?? 0,
        cgst: i.itms?.[0]?.itm_det?.camt ?? 0,
        sgst: i.itms?.[0]?.itm_det?.samt ?? 0,
        cess: i.itms?.[0]?.itm_det?.csamt ?? 0
      });
    });
  });
  const wsB2B = XLSX.utils.json_to_sheet(flatB2B.length ? flatB2B : [{ ctin: '', inum: '', val: 0 }]);
  XLSX.utils.book_append_sheet(wb, wsB2B, "B2B Raw");

  // 4. B2CL Raw
  const flatB2CL: any[] = [];
  result.json.b2cl.forEach(b => {
    b.inv.forEach(i => {
      flatB2CL.push({
        pos: b.pos,
        inum: i.inum,
        idt: i.idt,
        val: i.val,
        rate: i.itms?.[0]?.itm_det?.rt ?? 0,
        taxable_value: i.itms?.[0]?.itm_det?.txval ?? 0,
        igst: i.itms?.[0]?.itm_det?.iamt ?? 0,
        cgst: i.itms?.[0]?.itm_det?.camt ?? 0,
        sgst: i.itms?.[0]?.itm_det?.samt ?? 0
      });
    });
  });
  const wsB2CL = XLSX.utils.json_to_sheet(flatB2CL.length ? flatB2CL : [{ pos: '', inum: '', val: 0 }]);
  XLSX.utils.book_append_sheet(wb, wsB2CL, "B2CL Raw");

  // 5. B2CS Raw
  const wsB2CS = XLSX.utils.json_to_sheet(result.json.b2cs.length ? result.json.b2cs : [{ pos: '', rt: 0, txval: 0 }]);
  XLSX.utils.book_append_sheet(wb, wsB2CS, "B2CS Raw");

  // 6. HSN Summary
  const wsHSN = XLSX.utils.json_to_sheet(result.json.hsn.data.length ? result.json.hsn.data : [{ hsn_sc: '', qty: 0, txval: 0 }]);
  XLSX.utils.book_append_sheet(wb, wsHSN, "HSN Summary");

  // 7. Validation
  const wsVal = XLSX.utils.json_to_sheet(issues.length ? issues : [{ row: '', invoice: '', issue: 'None' }]);
  XLSX.utils.book_append_sheet(wb, wsVal, "Validation");

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(wbout);
}

export function generateUniversalTemplateCsv(): string {
  const headers = [
    "invoice_no", "invoice_date", "customer_gstin", "customer_name", "place_of_supply",
    "state_code", "invoice_value", "taxable_value", "gst_rate", "igst", "cgst", "sgst",
    "cess", "hsn", "quantity", "uom", "document_type", "platform", "ecommerce_gstin"
  ];
  return headers.join(",") + "\n";
}

export function getSampleRows(): NormalizedRow[] {
  return [
    {
      id: "sample-1",
      invoice_no: "AMZ-2026-001",
      invoice_date: "01-11-2026",
      customer_gstin: "27AABCU9603R1ZM",
      customer_name: "Apex Electronics Pvt Ltd",
      place_of_supply: "27 Maharashtra",
      state_code: "27",
      invoice_value: 23600.00,
      taxable_value: 20000.00,
      gst_rate: 18,
      igst: 3600.00,
      cgst: 0,
      sgst: 0,
      cess: 0,
      hsn: "84713010",
      quantity: 2,
      uom: "NOS",
      document_type: "Invoice",
      platform: "Amazon",
      ecommerce_gstin: "07AAGCA1234F1Z8",
      source_file: "Amazon_Sales_MTR_Nov.xlsx",
      source_sheet: "Tax Report"
    },
    {
      id: "sample-2",
      invoice_no: "AMZ-2026-002",
      invoice_date: "02-11-2026",
      customer_gstin: "",
      customer_name: "Rahul Verma",
      place_of_supply: "29 Karnataka",
      state_code: "29",
      invoice_value: 125000.00,
      taxable_value: 105932.20,
      gst_rate: 18,
      igst: 19067.80,
      cgst: 0,
      sgst: 0,
      cess: 0,
      hsn: "852872",
      quantity: 1,
      uom: "NOS",
      document_type: "Invoice",
      platform: "Amazon",
      ecommerce_gstin: "07AAGCA1234F1Z8",
      source_file: "Amazon_Sales_MTR_Nov.xlsx",
      source_sheet: "Tax Report"
    },
    {
      id: "sample-3",
      invoice_no: "FK-2026-8812",
      invoice_date: "03-11-2026",
      customer_gstin: "",
      customer_name: "Pooja Sharma",
      place_of_supply: "07 Delhi",
      state_code: "07",
      invoice_value: 2360.00,
      taxable_value: 2000.00,
      gst_rate: 18,
      igst: 0,
      cgst: 180.00,
      sgst: 180.00,
      cess: 0,
      hsn: "61091000",
      quantity: 4,
      uom: "PCS",
      document_type: "Invoice",
      platform: "Flipkart",
      ecommerce_gstin: "07AAGCF5678K1ZQ",
      source_file: "Flipkart_GSTR1_Report.csv",
      source_sheet: "CSV"
    },
    {
      id: "sample-4",
      invoice_no: "MSH-9921",
      invoice_date: "03-11-2026",
      customer_gstin: "",
      customer_name: "Sunil Das",
      place_of_supply: "19 West Bengal",
      state_code: "19",
      invoice_value: 1180.00,
      taxable_value: 1000.00,
      gst_rate: 18,
      igst: 180.00,
      cgst: 0,
      sgst: 0,
      cess: 0,
      hsn: "620342",
      quantity: 2,
      uom: "PCS",
      document_type: "Invoice",
      platform: "Meesho",
      ecommerce_gstin: "29AABCS1429B1ZB",
      source_file: "Meesho_Orders_Nov.xlsx",
      source_sheet: "Delivered Orders"
    },
    {
      id: "sample-5",
      invoice_no: "CN-FK-001",
      invoice_date: "04-11-2026",
      customer_gstin: "",
      customer_name: "Kavita Singh",
      place_of_supply: "07 Delhi",
      state_code: "07",
      invoice_value: 590.00,
      taxable_value: 500.00,
      gst_rate: 18,
      igst: 0,
      cgst: 45.00,
      sgst: 45.00,
      cess: 0,
      hsn: "61091000",
      quantity: 1,
      uom: "PCS",
      document_type: "Credit Note",
      platform: "Flipkart",
      ecommerce_gstin: "07AAGCF5678K1ZQ",
      source_file: "Flipkart_Returns.csv",
      source_sheet: "CSV"
    },
    {
      id: "sample-6",
      invoice_no: "SHOP-7721",
      invoice_date: "04-11-2026",
      customer_gstin: "06AAACT2727Q1ZG",
      customer_name: "Orbit Retailers LLP",
      place_of_supply: "06 Haryana",
      state_code: "06",
      invoice_value: 59000.00,
      taxable_value: 50000.00,
      gst_rate: 18,
      igst: 9000.00,
      cgst: 0,
      sgst: 0,
      cess: 0,
      hsn: "84713010",
      quantity: 5,
      uom: "NOS",
      document_type: "Invoice",
      platform: "Shopify",
      ecommerce_gstin: "",
      source_file: "Shopify_Direct_Sales.csv",
      source_sheet: "CSV"
    }
  ];
}
