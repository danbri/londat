# Company-level and property-level open data for the Canary Wharf postcodes

Fetched 2026-10-03. Input: `magpie/cwplans/postcodes/postcodes.json`. The Canary Wharf set is the tiers
`cw-core` (325), `cw-ward` (80) and `cw-box-other-ward` (253): 658 live postcodes. The 224 `terminated-cw`
postcodes are kept for history, so most tools query 882 postcodes. The Canary Wharf box is WGS84
[-0.0300, 51.4980, -0.0050, 51.5100]; the Docklands box is [-0.0950, 51.4740, 0.0150, 51.5220].

**Ethics rule for every file here:** company-level and property-level data only. No officers, PSCs,
directors, residents, tenants or owners who are private individuals. No tool here fetches officer, PSC or
filing-history data. Price Paid, UPRN and LBSM2 rows are addresses or properties; nothing here links them
to people.

Raw downloads are in `magpie/cwplans/data/raw/registry/` (git-ignored). Tools are in
`magpie/cwplans/tools/registry-*.mjs` (Node 22, no new packages). All HTTP uses the User-Agent
`glitchcan-cwplans/0.1 (https://github.com/danbri/glitchcan-minigam)`.

| dataset | access | licence | Canary Wharf result | output |
|---|---|---|---|---|
| Companies House Basic Company Data | open bulk download, no account | free reuse (OGL terms) | 16,619 live companies at 523 postcodes | `companies/companies-by-postcode.json`, `companies/companies-summary.json` |
| HM Land Registry Price Paid | open SPARQL, no account | OGL v3 | 22,752 transactions at 453 postcodes; 14,261 homes | `landregistry/price-paid-by-postcode.json`, `landregistry/price-paid-summary.json` |
| HM Land Registry INSPIRE Index Polygons | open download, no account (session cookie) | OGL v3 with attribution conditions | 1,182 freehold polygons touch the box | `landregistry/inspire-canary-wharf.geojson` |
| HM Land Registry CCOD / OCOD | **account + licence agreement + API key** | CCOD/OCOD licence | not downloaded | — |
| OS Open UPRN | open, OS Downloads API, no key | OGL v3 | 30,712 UPRNs in the box | `uprn/uprn-canary-wharf.csv`, `uprn/uprn-summary.json` |
| OS Open Linked Identifiers (LIDS) | open, OS Downloads API, no key | OGL v3 | 30,711 UPRN→TOID, 30,573 UPRN→USRN links | `uprn/uprn-linked-ids-canary-wharf.csv` |
| VOA non-domestic rating list 2026 | open download, no login | **restricted VOA licence, not OGL** | 4,546 rated properties at 289 postcodes, RV £457.1m | aggregates: `companies/voa-ndr-2026-summary.json`; per-property extract in raw only |
| EPC non-domestic (and domestic) bulk | **GOV.UK One Login account** | OGL (register terms) | not downloaded | — |
| GLA London Building Stock Model 2 | open, London Datastore | OGL v3 | 20,570 homes, 441 postcodes, 1,433 TOIDs | `uprn/lbsm2-homes-summary.json` (aggregates only) |
| Planning London Datahub | open guest API | OGL v3 | 2,931 applications in the box (count only) | already in `magpie/cwplans/feeds/`; not duplicated |
| London Development Database | open, London Datastore, frozen 2020 | OGL v3 | not downloaded | — |

## 1. Companies House — Basic Company Data

- What: one row per company on the register. Company-level fields only: name, number, status, category,
  incorporation date, dissolution date, SIC codes, registered-office address, accounts category.
  The product has no officers and no PSCs.
- URL: https://download.companieshouse.gov.uk/en_output.html — file
  `BasicCompanyDataAsOneFile-2026-10-01.zip` (494 MB zip, 2.8 GB CSV, 5,704,712 rows). Monthly.
- Licence: Companies House bulk data is free to reuse (OGL terms for Companies House public data).
- Tool: `node magpie/cwplans/tools/registry-companies.mjs` (about 80 s; streams the zip through `unzip -p`).
- Result: **16,619 companies** with a registered office at **523** of the 882 postcodes
  (cw-core 10,068; cw-ward 3,555; cw-box-other-ward 2,971; terminated-cw 25).
  Status: Active 14,717; Proposal to Strike off 1,048; Liquidation 705; In Administration 122.
  Accounts category: micro 4,316; none filed yet 3,729; dormant 2,151; full 1,855.
- Incorporations per year (the "opening" signal): 2022 1,087; 2023 1,186; 2024 1,495; **2025 2,078**;
  **2026 1,479 to 30 September** (151, 151, 203, 170, 137, 188, 153, 138, 188 per month).
  2026 by tier: cw-core 734, cw-ward 473, cw-box-other-ward 272.
- Companies per building postcode (top): E14 5HU (5 Churchill Place, CSC registered-agent address) 2,652;
  E14 8PX (Docklands Business Centre, Tiller Road) 1,730; E14 9XL (Beaufort Court, Admirals Way) 1,441;
  E14 9NN (City Reach) 1,355; E14 5AB (One Canada Square) 1,095; E14 5AA (1 Canada Square / Churchill Place) 1,003;
  E14 5RE (30 Churchill Place) 673; E14 9DG (one flat used as a registered office) 486; E14 5NR (40 Bank Street) 337.
- Company page pattern: `https://find-and-update.company-information.service.gov.uk/company/<number>`.
  Checked 2026-10-03: https://find-and-update.company-information.service.gov.uk/company/00132862 → HTTP 200,
  title "MHASLH LIMITED overview". Do not follow the officer or PSC tabs from there into this registry.
- Caveats:
  - A registered office is not a place of business. Most of the large counts are formation agents,
    accountants, registered-agent services (CSC at 5 Churchill Place), insolvency practitioners
    (Begbies Traynor, Level 33 One Canada Square) and serviced offices. Use them as a signal, not a tenant list.
  - The product holds **live companies only**. Dissolved companies are absent, so `dissolved` is normally
    null and closures are not visible in one snapshot. To see closures, keep each monthly file and diff
    the company numbers per postcode.
  - "Care of" values can be a person's name. The tool keeps `care_of` only when it looks like an
    organisation (34 kept, 117 withheld as `care_of_withheld: true`), and replaces a non-organisation
    "C/O …" clause inside address lines with `C/O [withheld]` (161 lines). Some small firms are
    over-withheld; that is the accepted cost.
  - Company names are company-level data. Some company names contain a founder's name; that is how the
    company is registered, and the registry does not add any link to a person.

## 2. HM Land Registry — Price Paid Data

- What: residential (and some non-residential) sales in England and Wales since 1995: price, date,
  property type, new-build flag, tenure, PPD category, PAON, SAON, street. No names exist in this data.
- Access that worked: SPARQL, `POST https://landregistry.data.gov.uk/landregistry/query`, 20 postcodes per
  query with `VALUES ?pc { … }`, 0.7 s between queries (45 queries). Cross-check: the linked-data API
  `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.postcode=E14%209GU&_pageSize=200`
  gives 450 records for E14 9GU over three pages, the same as SPARQL. The full CSV
  (pp-complete.csv, about 5 GB) was not needed.
- Licence: OGL v3. Attribution: "Contains HM Land Registry data © Crown copyright and database right 2026.
  This data is licensed under the Open Government Licence v3.0."
- Tool: `node magpie/cwplans/tools/registry-landregistry.mjs` (about 1 minute).
- Result: **22,752 transactions at 453 postcodes**, latest 2026-08-04. **14,261 homes** (distinct
  SAON+PAON+street among residential types; type `other` is excluded). Flats/maisonettes are 21,449 of
  the transactions; `other` (offices, units, car spaces, land) 500.
- Transactions per year: peaks 2021 (2,027), 2020 (1,460), 2010 (1,352), 2016 (1,308); 2024 800;
  2025 493; 2026 150 (to August).
- New builds per year: 2020 1,151; **2021 1,658**; 2022 547; 2023 164; 2024 365; 2025 132; 2026 0 so far.
  Largest new-build addresses since 2024: 222 Marsh Wall (E14 9EN, 9PH, 9LZ), Harcourt Tower 67 Marsh Wall
  (E14 9SW, 9GS, 9XF, 9ZB), Quest House South, 23 Escapade Place (E14 0WP).
- Homes per postcode (top): E14 9GU 440 (Marsh Wall); E14 9ZW 191 (Park Drive); E14 9RT 111
  (South Quay Square); E14 9BU 106 (Lincoln Plaza); E14 9LQ 99 (Cassilis Road); E14 9ZN 99 (Marsh Wall).
- Caveats: only homes that **sold** since 1995 appear, so "homes" is a lower bound (rented-only blocks and
  build-to-rent towers are missing or under-counted). New-build sales are registered late; recent months
  grow after publication. Commercial sales in PPD are partial (category B only). Postcodes with no sales
  (most office postcodes) have no entry.

## 3. HM Land Registry — INSPIRE Index Polygons

- What: one polygon per registered freehold title extent, with an INSPIRE ID. It is an index, not a legal
  boundary. It has no title number and no owner.
- URL: https://use-land-property-data.service.gov.uk/datasets/inspire/download/London_Borough_of_Tower_Hamlets.zip
  (published 2026-09-06; monthly, first Sunday). No account is needed, but the site sets a session cookie
  first: get the download page with a cookie jar, then the zip. The older name `Tower_Hamlets.zip` still
  answers, with a **stale 2023 file** — use the `London_Borough_of_…` name.
- Licence: OGL v3 with conditions (https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions).
  Show both statements: "This information is subject to Crown copyright and database rights 2026 and is
  reproduced with the permission of HM Land Registry." and "The polygons (including the associated geometry,
  namely x, y co-ordinates) are subject to Crown copyright and database rights 2026 Ordnance Survey 100026316."
- Tool: `node magpie/cwplans/tools/registry-inspire.mjs` (about 1 s).
- Result: borough file 23,391 polygons; **1,182 intersect the Canary Wharf box** (1,067 fully inside),
  3.42 km² in total. Converted to WGS84 with the OSTN15 grid; `area_m2` and `centroid_bng` come from the
  original BNG geometry. Properties: `inspire_id`, `valid_from`, `begin_lifespan`, `area_m2`, `centroid`,
  `centroid_bng`, `fully_inside_box`. Valid-from peaks are 2010 (419) and 2011 (333), the INSPIRE launch
  load, not real events.
- Caveat: only freehold titles. Leasehold flats and offices sit inside a freehold polygon.

### CCOD and OCOD (corporate owners)

- CCOD (UK companies that own property): https://use-land-property-data.service.gov.uk/datasets/ccod
- OCOD (overseas companies that own property): https://use-land-property-data.service.gov.uk/datasets/ocod
- **Not downloadable without an account.** Access needs: a free account on Use land and property data,
  sign-in, and agreement to the dataset licence; then the site issues an API key
  (`/api/v1/datasets/ccod` answered HTTP 403 without one; `/datasets/ccod/download` redirects to `/error`).
  The example data on the dataset pages needs no account.
- These are corporate-owner datasets (title number, address, proprietor company name and number).
  They hold no private individuals. If the owner gets a key, filter by the postcode list, and keep the
  key out of the repo.

## 4. OS Open UPRN and OS Open Linked Identifiers

- OS Open UPRN: https://api.os.uk/downloads/v1/products/OpenUPRN/downloads — `osopenuprn_202609_csv.zip`
  (619 MB; 41,676,575 rows: UPRN, X, Y, lat, lon). No API key is needed for the Downloads API.
- LIDS: https://api.os.uk/downloads/v1/products/LIDS/downloads — `lids-2026-09_csv_BLPU-UPRN-TopographicArea-TOID-5.zip`
  (841 MB) and `lids-2026-09_csv_BLPU-UPRN-Street-USRN-11.zip` (921 MB).
- Licence: OGL v3. "Contains OS data © Crown copyright and database right 2026."
- Tool: `node magpie/cwplans/tools/registry-uprn.mjs` (about 3 minutes).
- Result: Docklands box 355,085 UPRNs; **Canary Wharf box 30,712 UPRNs**. 30,711 have a TopographicArea
  TOID (**1,851 distinct TOIDs** — the MasterMap polygon the address point is in, usually the building);
  30,555 have a USRN (**211 streets**). The TOID with most UPRNs has 996 (near 51.50272, -0.025454).
- `uprn-canary-wharf.csv` columns: uprn, x_bng, y_bng, lat, lon, nearest_postcode_centroid, nearest_pc_m,
  nearest_pc_is_cw. The nearest postcode is an **approximation**: Open UPRN has no address and no postcode
  (AddressBase is not open), and ONSPD centroids are points, not boundaries.
- Caveat: UPRNs are properties and other addressable objects (flats, offices, car spaces, street furniture),
  not people.

## 5. Other checks

### VOA business rates (non-domestic rating list)

- URL: https://voaratinglists.blob.core.windows.net/html/rlidata.htm — downloads are free with **no login**.
  Used: `uk-englandwales-ndr-2026-listentries-compiled-epoch-0003-baseline-csv.zip` (93 MB, 2,164,323 rows,
  2026 list live from 1 April 2026; full epoch files every 2 months, change files twice a week).
- Licence: **restricted VOA licence, not OGL** (https://www.tax.service.gov.uk/view-my-valuation/terms-and-conditions).
  Data may be passed on only if the receiver is told those terms apply.
- Tool: `node magpie/cwplans/tools/registry-voa.mjs` (about 5 s).
- Result: **4,546 rated properties at 289 postcodes**, total rateable value **£457,142,247**.
  Offices 1,761; car parking spaces about 1,300; shops 332; stores 190; restaurants 107; market stalls 81.
  Top by RV: E14 5AA £70.2m (Canada Square / Churchill Place); E14 5LE £34.0m (Bank Street, 2 entries);
  E14 5AB £28.8m; E14 5AX £24.7m; E14 9GE £22.9m (734 entries, Harbour Exchange Square).
- Because of the licence, only per-postcode aggregates are in `companies/voa-ndr-2026-summary.json`. The
  per-property extract (UARN, description, address, RV; the firm's-name field is never copied) is
  `data/raw/registry/voa/voa-ndr-2026-canary-wharf.json`, not committed. **The owner decides** whether to
  publish per-property rows with the VOA terms attached.

### EPC register (non-domestic and domestic)

- The old https://epc.opendatacommunities.org/ now redirects to https://get-energy-performance-data.communities.gov.uk/.
- Bulk CSV and the developer API need **sign-in with GOV.UK One Login** (an account). Not downloaded.
- Single certificates stay searchable by postcode at https://find-energy-certificate.service.gov.uk/ (no
  login), but that is a look-up service, not a bulk source.

### London Datastore

- **London Building Stock Model 2** (https://data.london.gov.uk/dataset/2k55d, OGL v3, updated 2025-04-03):
  one row per home with UPRN, TOID, postcode, construction age band, built form, EPC rating (real or
  modelled), floor area and floor count. Downloaded the Tower Hamlets CSV (85 MB, 144,191 homes).
  Tool: `node magpie/cwplans/tools/registry-lbsm.mjs`. Result: **20,570 homes**, 441 postcodes, 1,433 TOIDs,
  written as **aggregates only** (`uprn/lbsm2-homes-summary.json`). LBSM2 also has modelled tenure, fuel
  poverty and deprivation per home; those describe households, so the tool never reads them out.
- **Planning London Datahub** (replaces the LDD): guest API
  `https://planningdata.london.gov.uk/api-guest/applications/_search` answers without a key. A
  `geo_bounding_box` query on the Canary Wharf box gives **2,931 applications**. The fields seen hold site
  names, descriptions and `lead_developer_company_name`; no applicant or agent person fields were seen in a
  50-record sample. It is already catalogued in `magpie/cwplans/feeds/README.md`, so it is not duplicated here.
- **London Development Database** (https://data.london.gov.uk/dataset/2jxq0 and the SQL extract
  https://data.london.gov.uk/dataset/2koxx): OGL v3, open, frozen in 2020 ("replaced by the Planning London
  Datahub"). Not downloaded; useful only for history before 2020.
- The Datastore CKAN search (`/api/action/package_search?q=…`) ignores the query text and returns every
  dataset (1,305), so filter the titles locally.

## Re-run

    node magpie/cwplans/tools/registry-companies.mjs     # needs the CH zip in data/raw/registry/
    node magpie/cwplans/tools/registry-landregistry.mjs  # live SPARQL
    node magpie/cwplans/tools/registry-inspire.mjs       # needs data/raw/registry/inspire/*.gml
    node magpie/cwplans/tools/registry-uprn.mjs          # needs Open UPRN + two LIDS zips
    node magpie/cwplans/tools/registry-voa.mjs           # needs data/raw/registry/voa/ndr-2026-listentries-*.zip
    node magpie/cwplans/tools/registry-lbsm.mjs          # needs data/raw/registry/lbsm/LBSMv2_Tower_Hamlets.csv; run after registry-uprn
