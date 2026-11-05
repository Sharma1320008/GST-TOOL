export interface NormalizedRow {
  id?: string;
  invoice_no: string;
  invoice_date: string;
  customer_gstin: string;
  customer_name: string;
  place_of_supply: string;
  state_code: string;
  invoice_value: number;
  taxable_value: number;
  gst_rate: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  hsn: string;
  quantity: number;
  uom: string;
  document_type: string;
  platform: string;
  ecommerce_gstin: string;
  source_file: string;
  source_sheet: string;
}

export interface ImportLog {
  file: string;
  sheet: string;
  platform: string;
  status: string;
  rows: number;
  mapped_fields: string;
}

export interface ValidationIssue {
  row: number | string;
  invoice: string;
  issue: string;
  severity?: 'error' | 'warning' | 'info';
}

export interface Gstr1SummaryCounts {
  b2b: number;
  b2cl: number;
  b2cs: number;
  cdn: number;
}

export interface Gstr1TableSummaryItem {
  'GSTR-1 table': string;
  records: number;
}

export interface Gstr1Result {
  json: {
    version: string;
    gstin: string;
    fp: string;
    b2b: Array<{
      ctin: string;
      inv: Array<{
        inum: string;
        idt: string;
        val: number;
        pos: string;
        rchrg: string;
        inv_typ: string;
        itms: Array<{
          num: number;
          itm_det: {
            txval: number;
            rt: number;
            iamt: number;
            camt: number;
            samt: number;
            csamt: number;
          };
        }>;
      }>;
    }>;
    b2cl: Array<{
      pos: string;
      inv: Array<{
        inum: string;
        idt: string;
        val: number;
        itms: Array<any>;
      }>;
    }>;
    b2cs: Array<{
      sply_ty: string;
      pos: string;
      typ: string;
      rt: number;
      txval: number;
    }>;
    cdnr: any[];
    cdnur: Array<{
      ntty: string;
      nt_num: string;
      nt_dt: string;
      val: number;
      pos: string;
      rchrg: string;
      inv_typ: string;
      itms: Array<any>;
      typ: string;
    }>;
    hsn: {
      data: Array<{
        num: number;
        hsn_sc: string;
        desc: string;
        uqc: string;
        qty: number;
        val: number;
        txval: number;
        iamt: number;
        camt: number;
        samt: number;
        csamt: number;
      }>;
    };
    doc_issue: {
      doc_det: any[];
    };
  };
  summary: Gstr1SummaryCounts;
  table_summary: Gstr1TableSummaryItem[];
}
