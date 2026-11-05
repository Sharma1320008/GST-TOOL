import React, { useState, useMemo, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Receipt,
  FileCheck,
  Download,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ShieldAlert,
  HelpCircle,
  FileText,
  ChevronRight,
  ExternalLink,
  Layers,
  Building2,
  Calendar,
  Sparkles
} from 'lucide-react';
import {
  NormalizedRow,
  ImportLog,
  ValidationIssue,
  Gstr1Result
} from './types';
import {
  PLATFORM_DIRECTORY,
  parseUploads,
  validateRecords,
  buildGstr1,
  generateExcelWorkbook,
  generateUniversalTemplateCsv,
  getSampleRows
} from './engine';

export default function App() {
  // Return setup states
  const [supplierGstin, setSupplierGstin] = useState<string>('07AABCE1234F1Z5');
  const [legalName, setLegalName] = useState<string>('Vedic Retailers Private Limited');
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}${yyyy}`;
  });
  const [supplierState, setSupplierState] = useState<string>('07');
  const [b2clThreshold, setB2clThreshold] = useState<number>(100000);

  // Data states
  const [records, setRecords] = useState<NormalizedRow[]>(() => getSampleRows());
  const [importLogs, setImportLogs] = useState<ImportLog[]>([
    {
      file: "Demo_Multiplatform_Dataset.xlsx",
      sheet: "Marketplace Combined",
      platform: "Auto-detect",
      status: "Processed (Sample Initialized)",
      rows: 6,
      mapped_fields: "invoice_no, invoice_date, customer_gstin, customer_name, place_of_supply, invoice_value, taxable_value, gst_rate, igst, cgst, sgst, hsn, quantity"
    }
  ]);
  const [platformHint, setPlatformHint] = useState<string>('Auto-detect');
  const [activeTab, setActiveTab] = useState<'import' | 'register' | 'preview' | 'export'>('import');

  // Search & filter for Sales Register
  const [registerSearch, setRegisterSearch] = useState<string>('');
  const [filterPlatform, setFilterPlatform] = useState<string>('All');
  const [filterDocType, setFilterDocType] = useState<string>('All');

  // Preview sub-tab
  const [previewSubTab, setPreviewSubTab] = useState<'summary' | 'b2b' | 'b2cl' | 'b2cs' | 'cdn' | 'hsn' | 'issues'>('summary');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update supplier state code if gstin changes
  const handleGstinChange = (val: string) => {
    const cleanVal = val.toUpperCase().slice(0, 15);
    setSupplierGstin(cleanVal);
    if (cleanVal.length >= 2) {
      setSupplierState(cleanVal.slice(0, 2));
    }
  };

  // Process uploaded files
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList: { name: string; buffer: ArrayBuffer }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = await file.arrayBuffer();
      fileList.push({ name: file.name, buffer });
    }

    const { rows: newRows, logs: newLogs } = parseUploads(fileList, platformHint);
    setRecords(prev => [...prev, ...newRows]);
    setImportLogs(prev => [...prev, ...newLogs]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Download Universal Template CSV
  const handleDownloadTemplate = () => {
    const csvContent = generateUniversalTemplateCsv();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'ecommerce_gst_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Load demo sample rows
  const handleLoadSample = () => {
    const sample = getSampleRows();
    setRecords(sample);
    setImportLogs([
      {
        file: "Demo_Multiplatform_Dataset.xlsx",
        sheet: "Marketplace Combined",
        platform: "Auto-detect",
        status: "Sample reloaded",
        rows: sample.length,
        mapped_fields: "invoice_no, invoice_date, customer_gstin, customer_name, place_of_supply, invoice_value, taxable_value, gst_rate, igst, cgst, sgst, hsn, quantity"
      }
    ]);
  };

  // Calculations
  const validationIssues = useMemo(() => {
    return validateRecords(records, supplierGstin, period);
  }, [records, supplierGstin, period]);

  const gstr1Result: Gstr1Result = useMemo(() => {
    return buildGstr1(records, supplierGstin, period, supplierState, b2clThreshold);
  }, [records, supplierGstin, period, supplierState, b2clThreshold]);

  // Aggregate metrics
  const totalTaxable = useMemo(() => {
    return records.reduce((acc, r) => acc + (Number(r.taxable_value) || 0), 0);
  }, [records]);

  const totalGst = useMemo(() => {
    return records.reduce((acc, r) => {
      const igst = Number(r.igst) || 0;
      const cgst = Number(r.cgst) || 0;
      const sgst = Number(r.sgst) || 0;
      const cess = Number(r.cess) || 0;
      return acc + igst + cgst + sgst + cess;
    }, 0);
  }, [records]);

  // Download GSTR-1 JSON
  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(gstr1Result.json, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GSTR1_${supplierGstin || 'DRAFT'}_${period}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download Excel Workbook
  const handleDownloadExcel = () => {
    const uint8Arr = generateExcelWorkbook(gstr1Result, records, validationIssues);
    const blob = new Blob([uint8Arr.buffer as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GSTR1_${supplierGstin || 'DRAFT'}_${period}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered rows for sales register
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (filterPlatform !== 'All' && r.platform !== filterPlatform) return false;
      if (filterDocType !== 'All' && r.document_type !== filterDocType) return false;
      if (registerSearch.trim()) {
        const q = registerSearch.toLowerCase();
        const match =
          r.invoice_no.toLowerCase().includes(q) ||
          r.customer_name.toLowerCase().includes(q) ||
          r.customer_gstin.toLowerCase().includes(q) ||
          r.place_of_supply.toLowerCase().includes(q) ||
          r.hsn.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [records, filterPlatform, filterDocType, registerSearch]);

  const handleDeleteRow = (id?: string) => {
    if (!id) return;
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header / Hero */}
      <header className="bg-gradient-to-r from-[#102d50] to-[#176b87] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <div className="bg-white/10 p-2.5 rounded-xl border border-white/20 backdrop-blur-sm">
                  <Receipt className="w-8 h-8 text-sky-200" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                    E-Commerce GST Pro
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-400/20 text-sky-200 border border-sky-300/30">
                      GSTR-1 v3.2 Engine
                    </span>
                  </h1>
                  <p className="text-sky-100 text-sm mt-0.5">
                    Multi-platform sales import • GST validation • GSTR-1 preparation • Excel & JSON export
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleLoadSample}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 text-white rounded-lg border border-white/20 transition-colors"
                title="Populate with sample Amazon, Flipkart, Meesho, Shopify records"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Load Sample Data
              </button>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 text-white rounded-lg border border-white/20 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Universal CSV Template
              </button>
            </div>
          </div>
          <div className="mt-3 text-xs text-sky-200/80 flex items-center gap-1.5 border-t border-white/10 pt-2.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>
              Preparation software only. Always review output and validate JSON against the latest GSTN offline utility before portal upload.
            </span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar: Return Setup */}
          <div className="lg:col-span-1 space-y-5">
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Building2 className="w-4 h-4 text-sky-600" />
                Return Setup
              </h2>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier GSTIN <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="e.g. 07ABCDE1234F1Z5"
                    value={supplierGstin}
                    onChange={(e) => handleGstinChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 uppercase font-mono"
                  />
                  {supplierGstin && supplierGstin.length !== 15 && (
                    <p className="text-xs text-rose-500 mt-1">Must be exactly 15 characters</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Legal / Trade Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Vedic Retailers Pvt Ltd"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Period (MMYYYY) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="112026"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      State Code
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      placeholder="07"
                      value={supplierState}
                      onChange={(e) => setSupplierState(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    B2CL Threshold (₹)
                  </label>
                  <input
                    type="number"
                    step={10000}
                    value={b2clThreshold}
                    onChange={(e) => setB2clThreshold(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Threshold for large inter-state unregistered supplies (₹1,00,000 as per recent GST amendments).
                  </p>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-start gap-2 text-xs text-slate-600 bg-sky-50 p-3 rounded-lg border border-sky-100">
                  <ShieldAlert className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-sky-900 block mb-0.5">Local Client Execution</span>
                    <span>All Excel and CSV files are processed completely in your browser. Zero sensitive sales data is sent over the network.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Metrics Badge */}
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Current Batch Summary
              </h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Total Rows</span>
                  <span className="text-lg font-bold text-slate-900">{records.length}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Validation Issues</span>
                  <span className={`text-lg font-bold ${validationIssues.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {validationIssues.length}
                  </span>
                </div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500 block">Total Taxable Value</span>
                <span className="text-base font-bold text-slate-900">
                  ₹{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500 block">Total GST (IGST+CGST+SGST)</span>
                <span className="text-base font-bold text-sky-700">
                  ₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Right Main Content Tabs */}
          <div className="lg:col-span-3 space-y-5">
            {/* Tabs Header */}
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-1.5 flex flex-wrap gap-1">
              <button
                onClick={() => setActiveTab('import')}
                className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'import'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>📥 Import Reports</span>
              </button>

              <button
                onClick={() => setActiveTab('register')}
                className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'register'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>📊 Sales Register ({records.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('preview')}
                className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'preview'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Receipt className="w-4 h-4" />
                <span>🧮 GSTR-1 Preview</span>
              </button>

              <button
                onClick={() => setActiveTab('export')}
                className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'export'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>⬇️ Export</span>
              </button>
            </div>

            {/* TAB 1: IMPORT REPORTS */}
            {activeTab === 'import' && (
              <div className="space-y-5">
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Import E-Commerce Sales Reports</h2>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Upload multi-platform Excel (.xlsx, .xls) or CSV exports from Amazon, Flipkart, Meesho, Shopify, Blinkit, etc.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Platform (Optional Hint)
                        </label>
                        <select
                          value={platformHint}
                          onChange={(e) => setPlatformHint(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                          <option value="Auto-detect">Auto-detect from file name & headers</option>
                          {PLATFORM_DIRECTORY.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-1 flex items-end">
                        <button
                          onClick={handleLoadSample}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg border border-slate-300 transition-colors"
                        >
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          Reload Sample
                        </button>
                      </div>
                    </div>

                    {/* File Dropzone */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-3 border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/50 hover:bg-sky-50 rounded-xl p-8 text-center cursor-pointer transition-colors"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".xlsx,.xls,.xlsm,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <div className="w-12 h-12 mx-auto bg-sky-100 text-sky-700 rounded-full flex items-center justify-center mb-3">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">
                        Click or drag & drop marketplace reports here
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Supports Excel (.xlsx, .xls, .xlsm) and CSV files • Multi-sheet supported
                      </p>
                      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">Amazon MTR</span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">Flipkart GSTR-1</span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">Meesho Orders</span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">Shopify Sales</span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">Myntra</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2.5">
                      <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block mb-0.5">Automatic Header Mapping & Normalization</span>
                        <span>
                          The engine uses fuzzy matching for 20+ synonyms per GST field (e.g. "order invoice", "tax invoice no", "inum", "net taxable", "buyer gstin", "pos", "shipping state").
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Import Log History */}
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-sky-600" />
                      Import Log & File Mapping
                    </h3>
                    <span className="text-xs text-slate-500">{importLogs.length} source file(s) logged</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">File Name</th>
                          <th className="py-2.5 px-4">Sheet</th>
                          <th className="py-2.5 px-4">Platform</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4 text-right">Rows</th>
                          <th className="py-2.5 px-4">Mapped Fields</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importLogs.map((log, i) => (
                          <tr key={i} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-4 font-medium text-slate-900">{log.file}</td>
                            <td className="py-2.5 px-4">{log.sheet}</td>
                            <td className="py-2.5 px-4">
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                                {log.platform}
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              <span
                                className={`inline-flex items-center gap-1 font-medium ${
                                  log.status.toLowerCase().includes('error')
                                    ? 'text-rose-600'
                                    : log.status.toLowerCase().includes('skipped')
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                                }`}
                              >
                                {log.status.toLowerCase().includes('processed') && <CheckCircle2 className="w-3.5 h-3.5" />}
                                {log.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-semibold text-slate-800">{log.rows}</td>
                            <td className="py-2.5 px-4 text-slate-500 max-w-xs truncate" title={log.mapped_fields}>
                              {log.mapped_fields || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: SALES REGISTER */}
            {activeTab === 'register' && (
              <div className="space-y-4">
                {/* Metric Summary Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-xs text-slate-500 block">Total Records</span>
                    <span className="text-xl font-bold text-slate-900">{records.length}</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-xs text-slate-500 block">Taxable Value</span>
                    <span className="text-xl font-bold text-slate-900">
                      ₹{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-xs text-slate-500 block">Total GST</span>
                    <span className="text-xl font-bold text-sky-700">
                      ₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                    <span className="text-xs text-slate-500 block">Validation Issues</span>
                    <span
                      className={`text-xl font-bold ${
                        validationIssues.length > 0 ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    >
                      {validationIssues.length}
                    </span>
                  </div>
                </div>

                {/* Filter and Action toolbar */}
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="flex flex-1 w-full gap-2 items-center">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search invoice #, customer name, GSTIN, HSN..."
                          value={registerSearch}
                          onChange={(e) => setRegisterSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>

                      <select
                        value={filterPlatform}
                        onChange={(e) => setFilterPlatform(e.target.value)}
                        className="px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="All">All Platforms</option>
                        {Array.from(new Set(records.map(r => r.platform))).filter(Boolean).map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>

                      <select
                        value={filterDocType}
                        onChange={(e) => setFilterDocType(e.target.value)}
                        className="px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="All">All Doc Types</option>
                        <option value="Invoice">Invoice</option>
                        <option value="Credit Note">Credit Note</option>
                        <option value="Debit Note">Debit Note</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setRecords([])}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear All
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table View */}
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-700 border-collapse">
                      <thead className="bg-slate-100 text-slate-800 font-semibold sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-3">#</th>
                          <th className="py-3 px-3">Platform</th>
                          <th className="py-3 px-3">Type</th>
                          <th className="py-3 px-3">Invoice No</th>
                          <th className="py-3 px-3">Date</th>
                          <th className="py-3 px-3">Buyer GSTIN</th>
                          <th className="py-3 px-3">Buyer Name</th>
                          <th className="py-3 px-3">POS</th>
                          <th className="py-3 px-3 text-right">Invoice Val (₹)</th>
                          <th className="py-3 px-3 text-right">Taxable Val (₹)</th>
                          <th className="py-3 px-3 text-center">Rate</th>
                          <th className="py-3 px-3 text-right">IGST (₹)</th>
                          <th className="py-3 px-3 text-right">CGST (₹)</th>
                          <th className="py-3 px-3 text-right">SGST (₹)</th>
                          <th className="py-3 px-3">HSN</th>
                          <th className="py-3 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredRecords.length === 0 ? (
                          <tr>
                            <td colSpan={16} className="text-center py-12 text-slate-400">
                              No records found matching your filters.
                            </td>
                          </tr>
                        ) : (
                          filteredRecords.map((r, idx) => (
                            <tr key={r.id || idx} className="hover:bg-sky-50/50 transition-colors">
                              <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                              <td className="py-2 px-3">
                                <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 font-medium text-[11px] text-slate-800">
                                  {r.platform}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                                    r.document_type.toLowerCase().includes('credit')
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {r.document_type}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-900 font-mono">{r.invoice_no}</td>
                              <td className="py-2 px-3 font-mono text-slate-600">{r.invoice_date}</td>
                              <td className="py-2 px-3 font-mono font-medium text-sky-900">
                                {r.customer_gstin || <span className="text-slate-400 italic">B2C (UR)</span>}
                              </td>
                              <td className="py-2 px-3 max-w-[130px] truncate" title={r.customer_name}>
                                {r.customer_name || '—'}
                              </td>
                              <td className="py-2 px-3">{r.place_of_supply || r.state_code || '—'}</td>
                              <td className="py-2 px-3 text-right font-mono font-medium text-slate-900">
                                {r.invoice_value.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-slate-700">
                                {r.taxable_value.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-center font-mono">{r.gst_rate}%</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-700">{r.igst.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-700">{r.cgst.toFixed(2)}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-700">{r.sgst.toFixed(2)}</td>
                              <td className="py-2 px-3 font-mono text-slate-600">{r.hsn || '—'}</td>
                              <td className="py-2 px-3 text-center">
                                <button
                                  onClick={() => handleDeleteRow(r.id)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                  title="Delete transaction"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
                    <span>Showing {filteredRecords.length} of {records.length} transactions</span>
                    <span>Values rounded to 2 decimal places</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: GSTR-1 PREVIEW */}
            {activeTab === 'preview' && (
              <div className="space-y-5">
                {/* 4 Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">B2B Invoices (Table 4)</span>
                      <span className="text-xl font-bold text-slate-900">{gstr1Result.summary.b2b}</span>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-sky-50 text-sky-600">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">B2CL Large (Table 5)</span>
                      <span className="text-xl font-bold text-slate-900">{gstr1Result.summary.b2cl}</span>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-teal-50 text-teal-600">
                      <FileCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">B2CS Groups (Table 7)</span>
                      <span className="text-xl font-bold text-slate-900">{gstr1Result.summary.b2cs}</span>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">Credit / Debit Notes</span>
                      <span className="text-xl font-bold text-slate-900">{gstr1Result.summary.cdn}</span>
                    </div>
                  </div>
                </div>

                {/* Sub-tabs for GSTR-1 Views */}
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 flex flex-wrap gap-1">
                    <button
                      onClick={() => setPreviewSubTab('summary')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        previewSubTab === 'summary' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Official Table Summary
                    </button>
                    <button
                      onClick={() => setPreviewSubTab('b2b')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        previewSubTab === 'b2b' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      4A/4B B2B ({gstr1Result.summary.b2b})
                    </button>
                    <button
                      onClick={() => setPreviewSubTab('b2cl')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        previewSubTab === 'b2cl' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      5 B2CL Large ({gstr1Result.summary.b2cl})
                    </button>
                    <button
                      onClick={() => setPreviewSubTab('b2cs')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        previewSubTab === 'b2cs' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      7 B2CS Small ({gstr1Result.summary.b2cs})
                    </button>
                    <button
                      onClick={() => setPreviewSubTab('cdn')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        previewSubTab === 'cdn' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      9B Credit/Debit Notes ({gstr1Result.summary.cdn})
                    </button>
                    <button
                      onClick={() => setPreviewSubTab('hsn')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        previewSubTab === 'hsn' ? 'bg-white text-sky-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      12 HSN Summary ({gstr1Result.json.hsn.data.length})
                    </button>
                    <button
                      onClick={() => setPreviewSubTab('issues')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                        previewSubTab === 'issues'
                          ? 'bg-white text-amber-700 shadow-xs font-semibold'
                          : validationIssues.length > 0
                          ? 'text-amber-700 font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Validation Issues ({validationIssues.length})
                    </button>
                  </div>

                  <div className="p-4">
                    {/* View: Official Table Summary */}
                    {previewSubTab === 'summary' && (
                      <div className="space-y-4">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-4 font-semibold">GSTR-1 Table Section</th>
                              <th className="py-2.5 px-4 font-semibold text-right">Processed Records / Count</th>
                              <th className="py-2.5 px-4 font-semibold">Classification Logic Applied</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {gstr1Result.table_summary.map((ts, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/70">
                                <td className="py-3 px-4 font-medium text-slate-900 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                                  {ts['GSTR-1 table']}
                                </td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 text-sm">
                                  {ts.records}
                                </td>
                                <td className="py-3 px-4 text-slate-500">
                                  {ts['GSTR-1 table'].includes('B2B') && 'Registered recipients (valid 15-char buyer GSTIN)'}
                                  {ts['GSTR-1 table'].includes('B2CL') && `Unregistered inter-state supply exceeding ₹${b2clThreshold.toLocaleString('en-IN')}`}
                                  {ts['GSTR-1 table'].includes('B2CS') && 'Intra-state supplies and small inter-state aggregated by POS & Tax Rate'}
                                  {ts['GSTR-1 table'].includes('Credit') && 'Credit / Debit notes issued to registered or unregistered recipients'}
                                  {ts['GSTR-1 table'].includes('HSN') && 'Aggregated by HSN/SAC code, quantity, rate and UQC'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* View: B2B */}
                    {previewSubTab === 'b2b' && (
                      <div className="space-y-3">
                        {gstr1Result.json.b2b.length === 0 ? (
                          <p className="text-xs text-slate-500 py-6 text-center">No B2B invoices in this batch.</p>
                        ) : (
                          gstr1Result.json.b2b.map((group, i) => (
                            <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                              <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs">
                                <span className="font-semibold text-slate-800">
                                  Buyer GSTIN: <span className="font-mono text-sky-700">{group.ctin}</span>
                                </span>
                                <span className="text-slate-500">{group.inv.length} invoice(s)</span>
                              </div>
                              <div className="mt-2 space-y-1">
                                {group.inv.map((inv, j) => (
                                  <div key={j} className="flex items-center justify-between text-xs py-1 text-slate-700">
                                    <span className="font-mono font-medium">{inv.inum} ({inv.idt})</span>
                                    <span>POS: {inv.pos}</span>
                                    <span className="font-mono font-semibold">₹{inv.val.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* View: B2CL */}
                    {previewSubTab === 'b2cl' && (
                      <div className="space-y-3">
                        {gstr1Result.json.b2cl.length === 0 ? (
                          <p className="text-xs text-slate-500 py-6 text-center">
                            No B2CL invoices (unregistered inter-state exceeding ₹{b2clThreshold.toLocaleString('en-IN')}) found.
                          </p>
                        ) : (
                          gstr1Result.json.b2cl.map((group, i) => (
                            <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                              <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs">
                                <span className="font-semibold text-slate-800">Place of Supply (POS): State {group.pos}</span>
                                <span className="text-slate-500">{group.inv.length} invoice(s)</span>
                              </div>
                              <div className="mt-2 space-y-1">
                                {group.inv.map((inv, j) => (
                                  <div key={j} className="flex items-center justify-between text-xs py-1 text-slate-700">
                                    <span className="font-mono font-medium">{inv.inum} ({inv.idt})</span>
                                    <span className="font-mono font-semibold">₹{inv.val.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* View: B2CS */}
                    {previewSubTab === 'b2cs' && (
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-4 font-semibold">Supply Type</th>
                            <th className="py-2.5 px-4 font-semibold">Place of Supply</th>
                            <th className="py-2.5 px-4 font-semibold text-center">GST Rate</th>
                            <th className="py-2.5 px-4 font-semibold text-right">Taxable Value (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {gstr1Result.json.b2cs.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-slate-400">No B2CS transactions</td>
                            </tr>
                          ) : (
                            gstr1Result.json.b2cs.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/80">
                                <td className="py-2 px-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${item.sply_ty === 'INTER' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                    {item.sply_ty}
                                  </span>
                                </td>
                                <td className="py-2 px-4 font-mono">State {item.pos}</td>
                                <td className="py-2 px-4 text-center font-mono">{item.rt}%</td>
                                <td className="py-2 px-4 text-right font-mono font-semibold text-slate-900">
                                  ₹{item.txval.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {/* View: CDN */}
                    {previewSubTab === 'cdn' && (
                      <div className="space-y-3">
                        {gstr1Result.json.cdnur.length === 0 ? (
                          <p className="text-xs text-slate-500 py-6 text-center">No Credit/Debit notes found.</p>
                        ) : (
                          gstr1Result.json.cdnur.map((note, idx) => (
                            <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 flex justify-between items-center text-xs">
                              <div>
                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium mr-2 ${note.ntty === 'C' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>
                                  {note.ntty === 'C' ? 'Credit Note' : 'Debit Note'}
                                </span>
                                <span className="font-mono font-semibold">{note.nt_num}</span>
                                <span className="text-slate-500 ml-2">({note.nt_dt})</span>
                              </div>
                              <div className="text-right">
                                <span className="text-slate-500 mr-3">POS: {note.pos}</span>
                                <span className="font-mono font-bold text-slate-900">₹{note.val.toFixed(2)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* View: HSN */}
                    {previewSubTab === 'hsn' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold">
                            <tr>
                              <th className="py-2 px-3">#</th>
                              <th className="py-2 px-3">HSN Code</th>
                              <th className="py-2 px-3">UQC</th>
                              <th className="py-2 px-3 text-right">Total Qty</th>
                              <th className="py-2 px-3 text-right">Total Value (₹)</th>
                              <th className="py-2 px-3 text-right">Taxable Val (₹)</th>
                              <th className="py-2 px-3 text-right">IGST (₹)</th>
                              <th className="py-2 px-3 text-right">CGST (₹)</th>
                              <th className="py-2 px-3 text-right">SGST (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {gstr1Result.json.hsn.data.map((h, i) => (
                              <tr key={i} className="hover:bg-slate-50/80">
                                <td className="py-2 px-3 text-slate-400">{h.num}</td>
                                <td className="py-2 px-3 font-mono font-semibold text-slate-900">{h.hsn_sc}</td>
                                <td className="py-2 px-3 font-mono text-slate-600">{h.uqc}</td>
                                <td className="py-2 px-3 text-right font-mono">{h.qty}</td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                                  {h.val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-2 px-3 text-right font-mono">{h.txval.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right font-mono">{h.iamt.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right font-mono">{h.camt.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right font-mono">{h.samt.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* View: Issues */}
                    {previewSubTab === 'issues' && (
                      <div className="space-y-3">
                        {validationIssues.length === 0 ? (
                          <div className="text-center py-8">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                            <h4 className="text-sm font-semibold text-slate-900">All Clear!</h4>
                            <p className="text-xs text-slate-500">No GST validation errors or format warnings detected.</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {validationIssues.map((issue, idx) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-lg border flex items-start gap-3 text-xs ${
                                  issue.severity === 'error'
                                    ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                                }`}
                              >
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold">
                                      Row {issue.row} {issue.invoice ? `• Invoice: ${issue.invoice}` : ''}
                                    </span>
                                    <span className="uppercase text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wider">
                                      {issue.severity || 'warning'}
                                    </span>
                                  </div>
                                  <p className="mt-0.5">{issue.issue}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: EXPORT */}
            {activeTab === 'export' && (
              <div className="space-y-5">
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
                  <h2 className="text-lg font-semibold text-slate-900">Download Prepared Return Files</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Export your normalized e-commerce data as an official GSTR-1 preparation JSON or full multi-sheet audit Excel workbook.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                    {/* JSON Download Card */}
                    <div className="border border-slate-200 rounded-xl p-5 hover:border-sky-300 hover:shadow-xs transition-all flex flex-col justify-between">
                      <div>
                        <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center mb-3">
                          <Receipt className="w-5 h-5" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">GSTR-1 Preparation JSON</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Standard JSON format with b2b, b2cl, b2cs, cdnur, and hsn arrays ready for import into the GSTN Offline Tool.
                        </p>
                        <div className="mt-3 bg-slate-50 p-2 rounded text-[11px] font-mono text-slate-600 truncate">
                          GSTR1_{supplierGstin || 'DRAFT'}_{period}.json
                        </div>
                      </div>
                      <button
                        onClick={handleDownloadJson}
                        disabled={records.length === 0}
                        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium text-xs sm:text-sm rounded-lg shadow-xs transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download GSTR-1 JSON
                      </button>
                    </div>

                    {/* Excel Download Card */}
                    <div className="border border-slate-200 rounded-xl p-5 hover:border-emerald-300 hover:shadow-xs transition-all flex flex-col justify-between">
                      <div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                          <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">Audit Excel Workbook (.xlsx)</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Complete 7-sheet workbook: Sales Register, GSTR1 Summary, B2B Raw, B2CL Raw, B2CS Raw, HSN Summary, and Validation issues.
                        </p>
                        <div className="mt-3 bg-slate-50 p-2 rounded text-[11px] font-mono text-slate-600 truncate">
                          GSTR1_{supplierGstin || 'DRAFT'}_{period}.xlsx
                        </div>
                      </div>
                      <button
                        onClick={handleDownloadExcel}
                        disabled={records.length === 0}
                        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs sm:text-sm rounded-lg shadow-xs transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download GSTR-1 Excel Workbook
                      </button>
                    </div>
                  </div>

                  {/* GST Advisory & Important Limitation notice */}
                  <div className="mt-6 p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Important GST Regulatory Notice</span>
                    </div>
                    <p className="leading-relaxed">
                      The JSON export is an internal preparation payload. It is not certified as GSTN-upload-ready until matched against the current official GSTN schema and tested in the latest Returns Offline Tool.
                    </p>
                    <p className="leading-relaxed text-amber-800">
                      <strong>Before portal upload:</strong> verify GSTIN/POS, tax rates, invoice values, credit notes, HSN/UQC, Table 13 document series, e-commerce operator reporting (Sec 9(5) / Sec 52 TCS), and amendments.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>E-Commerce GST Pro • High-speed client-side multi-platform GST preparation</span>
          <span>Aligned with GSTN GSTR-1 v3.2 schema rules</span>
        </div>
      </footer>
    </div>
  );
}
