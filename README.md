# E-Commerce GST Pro

Multi-platform e-commerce sales import and GSTR-1 preparation starter application.

## Features
- Platform directory covering major Indian marketplaces and D2C/e-commerce channels.
- Excel/CSV multi-file upload and multi-sheet import.
- Automatic header mapping to a normalized invoice model.
- Sales register, duplicate and basic GST validation.
- Indicative B2B, B2CL, B2CS, credit/debit note and HSN summaries.
- Excel workbook and JSON preparation export.
- Universal CSV template.

## Run locally
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

## Deploy online
1. Create a GitHub repository and upload all files in this project.
2. On Render, create a new Web Service and connect the repository.
3. Render reads `render.yaml`; deploy.
4. Use a private service and HTTPS. Configure access control before uploading live taxpayer data.

Alternative: Streamlit Community Cloud can deploy `app.py` from GitHub. Check its current resource, privacy and usage terms before using it for client data.

## Important GST limitations
This is an MVP starter, not a certified GST filing product. Platform names in the directory do not mean every proprietary seller report format has been independently tested. Header auto-detection is best-effort and must be reviewed. Tax classification can depend on transaction nature, POS, supplier registration, e-commerce operator arrangements, returns, amendments and current law.

The JSON is an internal preparation payload, not certified as upload-ready GSTN JSON. GSTN schema and offline utility versions change. Before portal upload, map to and validate against the current official GSTN schema and test in the latest Returns Offline Tool. Table 13 document series, exports, advances, amendments, nil/exempt supplies, ECO supplies and other applicable tables need completion before production filing.

Do not upload sensitive taxpayer data to an untrusted public deployment. This Streamlit version processes uploaded files on the application server.
