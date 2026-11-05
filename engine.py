import pandas as pd
import re, io
from datetime import datetime
from collections import defaultdict

PLATFORM_DIRECTORY = [
"Amazon","Flipkart","Meesho","Myntra","Snapdeal","GlowRoad","LimeRoad","JioMart",
"Tata CLiQ","Snapmint","Citymall","Roposo Clout","Shopdeck","Pepperfry","AJIO",
"Blinkit","Nykaa","Shopify","WooCommerce","Etsy","Shopsy","Zomato","Swiggy",
"Dreamplug","House of Varee","Poptech","Paytm Mall","FirstCry","BigBasket",
"Zepto","ONDC seller apps","Custom / Other"
]

ALIASES = {
"invoice_no":["invoice_no","invoice number","invoice no","invoice id","bill no","bill number","order invoice","tax invoice no","document number","inum"],
"invoice_date":["invoice_date","invoice date","date","bill date","document date","order date","idt"],
"customer_gstin":["customer_gstin","gstin","buyer gstin","recipient gstin","billing gstin","ctin","gst number"],
"customer_name":["customer_name","buyer name","customer","recipient name","billing name","party name"],
"place_of_supply":["place_of_supply","place of supply","pos","destination state","shipping state","state of supply"],
"state_code":["state_code","pos code","place of supply code","state code"],
"invoice_value":["invoice_value","invoice amount","total invoice value","gross amount","grand total","total amount","amount"],
"taxable_value":["taxable_value","taxable amount","assessable value","taxable value","net taxable","taxable"],
"gst_rate":["gst_rate","tax rate","gst %","gst percentage","rate","tax%"],
"igst":["igst","integrated tax","igst amount"],
"cgst":["cgst","central tax","cgst amount"],
"sgst":["sgst","utgst","state tax","sgst amount","utgst amount"],
"cess":["cess","cess amount"],
"hsn":["hsn","hsn code","hsn/sac","hsn sac","sac"],
"quantity":["quantity","qty","units"],
"uom":["uom","unit","unit of measure","uqc"],
"document_type":["document_type","type","transaction type","note type","document type"],
"platform":["platform","marketplace","channel","sales channel"],
"ecommerce_gstin":["ecommerce_gstin","e-commerce gstin","operator gstin","eco gstin"]
}

def norm(s):
    return re.sub(r"[^a-z0-9]+"," ",str(s).strip().lower()).strip()

def detect_platform(filename, hint="Auto-detect"):
    if hint and hint != "Auto-detect": return hint
    n = filename.lower()
    for p in PLATFORM_DIRECTORY:
        if p.lower().replace(" ","") in n.replace(" ",""): return p
    return "Custom / Other"

def map_columns(columns):
    normalized = {norm(c): c for c in columns}
    mapping = {}
    for field, aliases in ALIASES.items():
        for a in aliases:
            if norm(a) in normalized:
                mapping[field] = normalized[norm(a)]
                break
    return mapping

def as_num(v):
    if pd.isna(v) or str(v).strip() == "": return 0.0
    if isinstance(v, str): v = v.replace(",","").replace("₹","").replace("%","").strip()
    try: return float(v)
    except: return 0.0

def normalize_uploads(files, platform_hint="Auto-detect"):
    all_rows, logs = [], []
    for f in files:
        platform = detect_platform(f.name, platform_hint)
        try:
            if f.name.lower().endswith(".csv"):
                sheets = {"CSV": pd.read_csv(f)}
            else:
                sheets = pd.read_excel(f, sheet_name=None)
            file_count = 0
            for sheet, df in sheets.items():
                if df.empty: continue
                df.columns = [str(c).strip() for c in df.columns]
                mapping = map_columns(df.columns)
                if not any(x in mapping for x in ["invoice_no","invoice_value","taxable_value"]):
                    logs.append({"file":f.name,"sheet":sheet,"platform":platform,"status":"Skipped: no recognizable invoice/value columns","rows":0,"mapped_fields":", ".join(mapping)})
                    continue
                for _, r in df.iterrows():
                    def get(k, default=""):
                        col = mapping.get(k)
                        return r[col] if col is not None and pd.notna(r[col]) else default
                    taxable = as_num(get("taxable_value"))
                    invval = as_num(get("invoice_value", taxable))
                    rate = as_num(get("gst_rate"))
                    igst, cgst, sgst, cess = [as_num(get(k)) for k in ["igst","cgst","sgst","cess"]]
                    if not taxable and invval:
                        tax = igst+cgst+sgst+cess
                        taxable = max(invval-tax, 0) if tax else invval/(1+rate/100) if rate else invval
                    if not (get("invoice_no") or invval or taxable): continue
                    all_rows.append({
                        "invoice_no":str(get("invoice_no")).strip(),
                        "invoice_date":str(get("invoice_date")).strip()[:10],
                        "customer_gstin":str(get("customer_gstin")).strip().upper(),
                        "customer_name":str(get("customer_name")).strip(),
                        "place_of_supply":str(get("place_of_supply")).strip(),
                        "state_code":str(get("state_code") or "").strip().zfill(2) if get("state_code") else "",
                        "invoice_value":round(invval,2),"taxable_value":round(taxable,2),
                        "gst_rate":rate,"igst":round(igst,2),"cgst":round(cgst,2),
                        "sgst":round(sgst,2),"cess":round(cess,2),
                        "hsn":str(get("hsn")).strip(),"quantity":as_num(get("quantity")),
                        "uom":str(get("uom")).strip().upper(),"document_type":str(get("document_type") or "Invoice").strip(),
                        "platform":str(get("platform") or platform).strip(),"ecommerce_gstin":str(get("ecommerce_gstin")).strip().upper(),
                        "source_file":f.name,"source_sheet":sheet
                    })
                    file_count += 1
                logs.append({"file":f.name,"sheet":sheet,"platform":platform,"status":"Processed","rows":file_count,"mapped_fields":", ".join(mapping)})
        except Exception as e:
            logs.append({"file":f.name,"sheet":"-","platform":platform,"status":f"Error: {e}","rows":0,"mapped_fields":""})
    return all_rows, logs

def validate_records(rows, gstin="", period=""):
    issues=[]
    for i,r in enumerate(rows, start=1):
        if not r.get("invoice_no"): issues.append({"row":i,"invoice": "","issue":"Missing invoice number"})
        if not r.get("invoice_date"): issues.append({"row":i,"invoice":r.get("invoice_no"),"issue":"Missing invoice date"})
        if not r.get("taxable_value") and not r.get("invoice_value"): issues.append({"row":i,"invoice":r.get("invoice_no"),"issue":"Missing taxable/invoice value"})
        g=str(r.get("customer_gstin","") or "")
        if g and (len(g)!=15 or not re.match(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$",g)):
            issues.append({"row":i,"invoice":r.get("invoice_no"),"issue":"Customer GSTIN format/check pattern invalid"})
        if float(r.get("igst",0) or 0)>0 and (float(r.get("cgst",0) or 0)>0 or float(r.get("sgst",0) or 0)>0):
            issues.append({"row":i,"invoice":r.get("invoice_no"),"issue":"IGST and CGST/SGST both populated; verify tax treatment"})
        if float(r.get("taxable_value",0) or 0)<0:
            issues.append({"row":i,"invoice":r.get("invoice_no"),"issue":"Negative taxable value; check credit-note handling"})
    seen=set()
    for i,r in enumerate(rows, start=1):
        key=(r.get("invoice_no"),r.get("invoice_date"),r.get("customer_gstin"))
        if key in seen: issues.append({"row":i,"invoice":r.get("invoice_no"),"issue":"Possible duplicate invoice"})
        seen.add(key)
    if gstin and len(gstin)!=15: issues.append({"row":"Setup","invoice":"","issue":"Supplier GSTIN must be 15 characters"})
    if period and not re.match(r"^(0[1-9]|1[0-2])[0-9]{4}$",period): issues.append({"row":"Setup","invoice":"","issue":"Return period must be MMYYYY"})
    return issues

def _pos(r, supplier_state):
    sc=str(r.get("state_code","") or "").zfill(2)
    if sc and sc!="00": return sc
    p=str(r.get("place_of_supply","") or "").strip()
    m=re.match(r"^(\d{1,2})",p)
    if m: return m.group(1).zfill(2)
    return supplier_state

def _tax_item(r):
    rate=float(r.get("gst_rate",0) or 0)
    taxable=float(r.get("taxable_value",0) or 0)
    igst=float(r.get("igst",0) or 0)
    cgst=float(r.get("cgst",0) or 0)
    sgst=float(r.get("sgst",0) or 0)
    cess=float(r.get("cess",0) or 0)
    if not any([igst,cgst,sgst]) and rate and taxable:
        igst=round(taxable*rate/100,2)
        cgst=sgst=0
    return {"num":1,"itm_det":{"txval":round(taxable,2),"rt":rate,"iamt":round(igst,2),"camt":round(cgst,2),"samt":round(sgst,2),"csamt":round(cess,2)}}

def build_gstr1(rows, gstin, period, supplier_state="07", threshold=100000):
    b2b=defaultdict(list); b2cl=defaultdict(list); b2cs=defaultdict(float); cdn=[]
    hsn=defaultdict(lambda: {"qty":0.0,"txval":0.0,"iamt":0.0,"camt":0.0,"samt":0.0,"csamt":0.0,"rt":0.0,"uqc":"OTH"})
    docs=[]
    for r in rows:
        pos=_pos(r,supplier_state)
        date=str(r.get("invoice_date",""))
        try: dt=pd.to_datetime(date,dayfirst=True).strftime("%d-%m-%Y")
        except: dt=date
        invno=str(r.get("invoice_no","")).strip()
        typ=str(r.get("document_type","Invoice")).lower()
        value=round(float(r.get("invoice_value",0) or 0),2)
        tx=round(float(r.get("taxable_value",0) or 0),2)
        rate=float(r.get("gst_rate",0) or 0)
        item=_tax_item(r)
        itms=[item]
        gstin_buyer=str(r.get("customer_gstin","") or "").upper()
        if "credit" in typ or "debit" in typ:
            cdn.append({"ntty":"C" if "credit" in typ else "D","nt_num":invno,"nt_dt":dt,"val":value,"pos":pos,"rchrg":"N","inv_typ":"R","itms":itms,"typ":"R" if gstin_buyer else "UR"})
        elif gstin_buyer:
            b2b[gstin_buyer].append({"inum":invno,"idt":dt,"val":value,"pos":pos,"rchrg":"N","inv_typ":"R","itms":itms})
        elif pos!=str(supplier_state).zfill(2) and value>threshold:
            b2cl[pos].append({"inum":invno,"idt":dt,"val":value,"itms":itms})
        else:
            key=(pos,rate)
            b2cs[key]+=tx
        h=str(r.get("hsn","") or "UNSPECIFIED")
        hsn[h]["qty"]+=float(r.get("quantity",0) or 0); hsn[h]["txval"]+=tx
        hsn[h]["iamt"]+=item["itm_det"]["iamt"]; hsn[h]["camt"]+=item["itm_det"]["camt"]
        hsn[h]["samt"]+=item["itm_det"]["samt"]; hsn[h]["csamt"]+=item["itm_det"]["csamt"]
        hsn[h]["rt"]=rate; hsn[h]["uqc"]=str(r.get("uom") or "OTH")
    json_payload={
      "version":"3.2-preparation",
      "gstin":gstin,"fp":period,
      "b2b":[{"ctin":k,"inv":v} for k,v in b2b.items()],
      "b2cl":[{"pos":k,"inv":v} for k,v in b2cl.items()],
      "b2cs":[{"sply_ty":"INTER" if k[0]!=str(supplier_state).zfill(2) else "INTRA","pos":k[0],"typ":"OE","rt":k[1],"txval":round(v,2)} for k,v in b2cs.items()],
      "cdnr":[],"cdnur":cdn,
      "hsn":{"data":[{"num":i+1,"hsn_sc":k,"desc":"","uqc":v["uqc"],"qty":round(v["qty"],3),"val":round(v["txval"]+v["iamt"]+v["camt"]+v["samt"]+v["csamt"],2),"txval":round(v["txval"],2),"iamt":round(v["iamt"],2),"camt":round(v["camt"],2),"samt":round(v["samt"],2),"csamt":round(v["csamt"],2)} for i,(k,v) in enumerate(hsn.items())]},
      "doc_issue":{"doc_det":[]}
    }
    # Table summary is an indicative preparation summary, not a substitute for GSTN schema validation.
    summary={"b2b":sum(len(v) for v in b2b.values()),"b2cl":sum(len(v) for v in b2cl.values()),"b2cs":len(b2cs),"cdn":len(cdn)}
    table_summary=[
      {"GSTR-1 table":"4A/4B B2B","records":summary["b2b"]},
      {"GSTR-1 table":"5 B2CL","records":summary["b2cl"]},
      {"GSTR-1 table":"7 B2CS","records":summary["b2cs"]},
      {"GSTR-1 table":"9B Credit/Debit Notes (review classification)","records":summary["cdn"]},
      {"GSTR-1 table":"12 HSN summary (aggregated)","records":len(hsn)}
    ]
    return {"json":json_payload,"summary":summary,"table_summary":table_summary}

def make_excel(result, rows, issues):
    out=io.BytesIO()
    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        pd.DataFrame(rows).to_excel(writer,index=False,sheet_name="Sales Register")
        pd.DataFrame(result["table_summary"]).to_excel(writer,index=False,sheet_name="GSTR1 Summary")
        pd.DataFrame(result["json"].get("b2b",[])).to_excel(writer,index=False,sheet_name="B2B Raw")
        pd.DataFrame(result["json"].get("b2cl",[])).to_excel(writer,index=False,sheet_name="B2CL Raw")
        pd.DataFrame(result["json"].get("b2cs",[])).to_excel(writer,index=False,sheet_name="B2CS Raw")
        pd.DataFrame(result["json"].get("hsn",{}).get("data",[])).to_excel(writer,index=False,sheet_name="HSN Summary")
        pd.DataFrame(issues).to_excel(writer,index=False,sheet_name="Validation")
    out.seek(0)
    return out.getvalue()
