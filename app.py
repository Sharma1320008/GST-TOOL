import streamlit as st
import pandas as pd
import json
from io import BytesIO
from datetime import datetime
from app.engine import normalize_uploads, build_gstr1, validate_records, make_excel, PLATFORM_DIRECTORY

st.set_page_config(page_title="E-Commerce GST Pro", page_icon="🧾", layout="wide")
st.markdown("""
<style>
.block-container{padding-top:1.5rem;max-width:1500px}
.hero{padding:24px;border-radius:16px;background:linear-gradient(120deg,#102d50,#176b87);color:white}
.hero h1{color:white;margin:0}.hero p{color:#e7f4ff;margin:6px 0 0}
div[data-testid="stMetric"]{background:#f4f7fb;padding:14px;border-radius:12px;border:1px solid #e4eaf1}
</style>
""", unsafe_allow_html=True)

st.markdown('<div class="hero"><h1>🧾 E-Commerce GST Pro</h1><p>Multi-platform sales import • GST validation • GSTR-1 preparation • Excel & JSON export</p></div>', unsafe_allow_html=True)
st.caption("Preparation software only. Always review the output and validate JSON against the latest GSTN utility/schema before filing.")

with st.sidebar:
    st.header("Return setup")
    gstin = st.text_input("Supplier GSTIN", max_chars=15, placeholder="e.g. 07ABCDE1234F1Z5").strip().upper()
    legal_name = st.text_input("Legal / trade name")
    period = st.text_input("Return period (MMYYYY)", value=datetime.now().strftime("%m%Y"), max_chars=6)
    state_code = st.text_input("Supplier state code", value=gstin[:2] if len(gstin)>=2 else "07", max_chars=2)
    b2cl_threshold = st.number_input("B2CL invoice threshold (₹)", min_value=0, value=100000, step=10000)
    st.divider()
    st.markdown("**Data handling**")
    st.caption("Files are processed by this Streamlit server. Deploy only on infrastructure you trust; do not upload sensitive reports to a public demo.")

tab1, tab2, tab3, tab4 = st.tabs(["📥 Import reports", "📊 Sales register", "🧮 GSTR-1 preview", "⬇️ Export"])

with tab1:
    st.subheader("Import e-commerce reports")
    st.write("Upload one or more Excel/CSV files exported from marketplaces, payment/e-commerce operators or your accounting system.")
    st.info("Automatic detection uses file name, sheet names and column headings. Platform-specific formats vary; review every mapping and exception.")
    uploaded = st.file_uploader("Choose reports", type=["xlsx","xls","xlsm","csv"], accept_multiple_files=True)
    platform = st.selectbox("Platform (optional hint)", ["Auto-detect"] + PLATFORM_DIRECTORY)
    if uploaded:
        data, import_log = normalize_uploads(uploaded, platform_hint=platform)
        st.session_state["records"] = data
        st.session_state["import_log"] = import_log
        st.success(f"Imported {len(data)} normalized transaction rows.")
        st.dataframe(pd.DataFrame(import_log), use_container_width=True, hide_index=True)
        if data:
            st.dataframe(pd.DataFrame(data).head(100), use_container_width=True, hide_index=True)
    else:
        st.session_state.setdefault("records", [])
        st.caption("No file selected yet. You can also download a standard input template below.")
    template = pd.DataFrame(columns=["invoice_no","invoice_date","customer_gstin","customer_name","place_of_supply","state_code","invoice_value","taxable_value","gst_rate","igst","cgst","sgst","cess","hsn","quantity","uom","document_type","platform","ecommerce_gstin"])
    st.download_button("Download universal import template", template.to_csv(index=False).encode("utf-8"), "ecommerce_gst_import_template.csv", "text/csv")

records = st.session_state.get("records", [])
if records:
    clean = pd.DataFrame(records)
    issues = validate_records(records, gstin, period)
else:
    clean = pd.DataFrame()
    issues = []

with tab2:
    st.subheader("Normalized sales register")
    if clean.empty:
        st.info("Import reports to view the normalized register.")
    else:
        c1,c2,c3,c4 = st.columns(4)
        c1.metric("Rows", len(clean))
        c2.metric("Taxable value", f"₹{clean['taxable_value'].fillna(0).sum():,.2f}")
        c3.metric("GST", f"₹{(clean['igst'].fillna(0)+clean['cgst'].fillna(0)+clean['sgst'].fillna(0)+clean['cess'].fillna(0)).sum():,.2f}")
        c4.metric("Validation issues", len(issues))
        edited = st.data_editor(clean, use_container_width=True, num_rows="dynamic", key="sales_editor")
        st.session_state["records"] = edited.fillna("").to_dict("records")

with tab3:
    st.subheader("GSTR-1 classification preview")
    if not gstin or len(gstin) != 15:
        st.warning("Enter a 15-character supplier GSTIN in the sidebar.")
    if not records:
        st.info("Import sales reports first.")
    else:
        result = build_gstr1(records, gstin, period, state_code, int(b2cl_threshold))
        summary = result["summary"]
        cols = st.columns(4)
        cols[0].metric("B2B invoices", summary["b2b"])
        cols[1].metric("B2CL invoices", summary["b2cl"])
        cols[2].metric("B2CS groups", summary["b2cs"])
        cols[3].metric("Credit/debit notes", summary["cdn"])
        st.dataframe(pd.DataFrame(result["table_summary"]), use_container_width=True, hide_index=True)
        if issues:
            st.error(f"{len(issues)} validation issue(s) require review.")
            st.dataframe(pd.DataFrame(issues), use_container_width=True, hide_index=True)
        st.session_state["gstr1"] = result

with tab4:
    st.subheader("Download prepared return")
    result = st.session_state.get("gstr1")
    if not records:
        st.info("Import reports and prepare GSTR-1 first.")
    else:
        result = build_gstr1(records, gstin, period, state_code, int(b2cl_threshold))
        json_bytes = json.dumps(result["json"], indent=2, ensure_ascii=False).encode("utf-8")
        st.download_button("Download GSTR-1 JSON (review/validate before portal upload)", json_bytes, f"GSTR1_{gstin}_{period}.json", "application/json")
        excel_bytes = make_excel(result, records, issues)
        st.download_button("Download GSTR-1 Excel workbook", excel_bytes, f"GSTR1_{gstin}_{period}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        st.warning("The JSON export is a structured GSTR-1 preparation payload. It is not certified as GSTN-upload-ready until matched against the current official GSTN schema and tested in the latest Returns Offline Tool.")
        st.markdown("**Before filing:** verify GSTIN/POS, tax rates, invoice values, credit notes, HSN/UQC, Table 13 document series, e-commerce operator reporting and amendments.")
