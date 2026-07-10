# Graph Report - amzsellerhub  (2026-07-10)

## Corpus Check
- 96 files · ~176,376 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1758 nodes · 4652 edges · 81 communities (79 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 46 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a16b2244`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- To-Do Database Layer
- AI Image Studio
- Text Utilities & AI Usage Tracking
- Calendar Feeds & ICS Export
- Product Research Selection
- News Deduplication & Sources
- Task Boards & Reminders
- Sessions & User Accounts
- Main App Core
- Trend Alerts & Item Tracking
- BSR & Decision Scoring
- Seller Coach Learning
- To-Do UI Interactions
- Admin User Management
- Navigation & Product Editing
- Internal Admin Dashboard
- Backend Package Dependencies
- Cloud Sync Client
- AI Analysis Pipeline
- API Server & Crawler Worker
- Listing Generator
- Task Rendering & Drag-Drop
- Niche Sources & Prompts
- FBA Profit Calculations
- Helium & Seller Report Import
- Topic Forecasting
- To-Do Filters & Cache
- AI Strategy Brief
- Hub State & To-Do Tests
- Amazon Link & JSON Extraction
- Task Detail Mutations
- Alert Dispatching
- Login & Auth Gate
- PPC Cockpit
- To-Do Dialogs & Menus
- Idea Pool Management
- Clipboard & Templates
- Backend Architecture Docs
- News Radar Widget
- Niche Scoring
- Seller Radar Concept Doc
- Keyword Cleaning Tools
- Cashflow Planner
- Project Instructions Doc
- Product List Management
- Product Research Concept Doc
- Backend Architecture Reference
- Platform Integration Tests
- Amazon Import Concept Doc
- Seller Radar Operations Doc
- Backup Snapshots
- Accounts & Sync Concept Doc
- PPC Keywords Concept Doc
- Backend Claude Instructions
- Trend Engine & Risk Monitoring
- User Data Sync Storage
- Global Search
- AI Proxy Concept Doc
- Export & Detail Recalc
- Task Moves & Notifications
- Research Progress Indicator
- Freitext Import
- Crawler Pipeline Architecture
- Supplier Management
- Tax Reserve Calculations
- External AI Prompt Handoff
- Google Calendar Sync & SSE
- Tag Manager
- Bulk Selection UI
- Save & Backup Export
- Product Modal Editing
- FBA Category Selects
- Landed Cost Calculator
- Product Bulk Selection
- JSON Repair Utilities
- Local Dev Server
- Marketing Website Docs
- Amazon Search Links
- Frontend Deploy Script
- Local Start Script

## God Nodes (most connected - your core abstractions)
1. `db()` - 147 edges
2. `toast()` - 117 edges
3. `save()` - 109 edges
4. `esc()` - 94 edges
5. `mutate()` - 49 edges
6. `researchInit()` - 47 edges
7. `buildApi()` - 47 edges
8. `go()` - 45 edges
9. `renderAll()` - 43 edges
10. `renderProds()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `decisionVerdict()` --indirect_call--> `v()`  [INFERRED]
  js/app.js → server/test/platform.test.js
- `dossierReasoning()` --indirect_call--> `v()`  [INFERRED]
  js/app.js → server/test/platform.test.js
- `renderDetailSales()` --indirect_call--> `v()`  [INFERRED]
  js/app.js → server/test/platform.test.js
- `asinHasImage()` --indirect_call--> `v()`  [INFERRED]
  js/app.js → server/test/platform.test.js
- `igParseListing()` --indirect_call--> `v()`  [INFERRED]
  js/bildstudio.js → server/test/platform.test.js

## Import Cycles
- None detected.

## Communities (81 total, 2 thin omitted)

### Community 0 - "To-Do Database Layer"
Cohesion: 0.06
Nodes (123): activityFor(), addTaskTag(), attachmentBytesForUser(), attachmentsForTask(), buildSet(), checklistForTasks(), commentsForTask(), deleteAttachment() (+115 more)

### Community 1 - "AI Image Studio"
Cohesion: 0.07
Nodes (60): ask(), beat(), buildPrompt(), fetchListing(), generateOne(), generatePollinations(), igAddUsp(), igApi() (+52 more)

### Community 2 - "Text Utilities & AI Usage Tracking"
Cohesion: 0.06
Nodes (55): decodeEntities(), NAMED_ENTITIES, stripTags(), EMPTY_USAGE, getUsage(), incrementUsage(), todayKey(), USAGE_COLS (+47 more)

### Community 3 - "Calendar Feeds & ICS Export"
Cohesion: 0.05
Nodes (59): RFC-5545, generatePrompt(), openPromptModal(), resetPrompt(), erAnalyze(), erFindCol(), countCalendarFeeds(), deleteCalendarFeed() (+51 more)

### Community 4 - "Product Research Selection"
Cohesion: 0.07
Nodes (74): auswahlAddToProduktliste(), auswahlDelete(), auswahlDeleteSelected(), auswahlOrderSample(), auswahlSelAll(), auswahlSetDecision(), auswahlStatCard(), auswahlToggleSel() (+66 more)

### Community 5 - "News Deduplication & Sources"
Cohesion: 0.06
Nodes (50): KEYWORDS, KEYWORDS_NEGATIVE, isDuplicateTitle(), titleSimilarity(), trigrams(), urlHash(), recentTitleNorms(), SOURCES (+42 more)

### Community 6 - "Task Boards & Reminders"
Cohesion: 0.07
Nodes (55): calculateBoardProgress(), deleteBoard(), filterTasks(), getDueTasks(), moveTask(), notifBrowserPush(), notifClearAll(), notifClickItem() (+47 more)

### Community 7 - "Sessions & User Accounts"
Cohesion: 0.07
Nodes (45): countActiveSessions(), createSession(), deleteSession(), deleteSessionsForUser(), findValidSession(), touchSession(), createUser(), findByEmail() (+37 more)

### Community 8 - "Main App Core"
Cohesion: 0.06
Nodes (17): amazonSearchTerms(), buildAmazonSearchUrl(), calculateCorporateTaxEstimate(), calculateIncomeTaxEstimate(), calculateTaxReserve(), calculateTradeTaxEstimate(), calculateVatReserve(), closeLesson() (+9 more)

### Community 9 - "Trend Alerts & Item Tracking"
Cohesion: 0.07
Nodes (38): insertItem(), parseAiSummary(), queryEvents(), analyzedItemsSince(), unanalyzedItemsSince(), upsertTopicDaily(), upsertTrendTopic(), computeMetrics() (+30 more)

### Community 10 - "BSR & Decision Scoring"
Cohesion: 0.07
Nodes (44): bsrCalc(), bsrCalibrate(), bsrGetCalib(), bsrResetCalib(), bsrScaleFor(), bsrSetCalib(), complianceFor(), complianceHtml() (+36 more)

### Community 11 - "Seller Coach Learning"
Cohesion: 0.08
Nodes (40): backupOpen(), coachBuildLessonNav(), coachBuildMainNav(), coachBuildModuleCard(), coachCalculateStreak(), coachCelebratePhase(), coachContinueLearning(), coachFindNextLesson() (+32 more)

### Community 12 - "To-Do UI Interactions"
Cohesion: 0.08
Nodes (22): avatar(), connectSSE(), duePop(), duePopHtml(), dueShiftMonth(), isActive(), miniCal(), notifyBrowser() (+14 more)

### Community 13 - "Admin User Management"
Cohesion: 0.11
Nodes (32): adminChangePw(), adminClosePwModal(), adminCloseUserModal(), adminDeleteUser(), adminEscape(), adminExtendLicense(), adminFmtDate(), adminGeneratePassword() (+24 more)

### Community 14 - "Navigation & Product Editing"
Cohesion: 0.09
Nodes (29): addKW(), bsrPopulateCats(), clearProductSalesData(), coachStartModule(), editIdee(), editTitleInline(), eur(), fbaTogglePpc() (+21 more)

### Community 15 - "Internal Admin Dashboard"
Cohesion: 0.15
Nodes (28): dt(), esc(), num(), PROFILES, renderInternal(), buildApi(), fail(), aiCallStats() (+20 more)

### Community 16 - "Backend Package Dependencies"
Cohesion: 0.06
Nodes (33): dependencies, @anthropic-ai/sdk, express, fast-xml-parser, node-cron, pg, description, devDependencies (+25 more)

### Community 17 - "Cloud Sync Client"
Cohesion: 0.19
Nodes (32): syApi(), syApplyMode(), syBtnClick(), syClose(), syDropToken(), syFetch(), syIsSyncKey(), syLocalKeys() (+24 more)

### Community 18 - "AI Analysis Pipeline"
Cohesion: 0.09
Nodes (22): aiEnabled(), pendingAiItems(), saveAiFailure(), aiState, drainQueue(), app, fb, health (+14 more)

### Community 19 - "API Server & Crawler Worker"
Cohesion: 0.26
Nodes (11): startApi(), crawlAndAnalyze(), startWorker(), config, validateConfig(), emit(), log, deleteExpiredSessions() (+3 more)

### Community 20 - "Listing Generator"
Cohesion: 0.12
Nodes (19): lgApply(), lgBuildPrompt(), lgBytes(), lgCount(), lgDelete(), lgGenerate(), lgLoad(), lgParse() (+11 more)

### Community 21 - "Task Rendering & Drag-Drop"
Cohesion: 0.10
Nodes (29): clearSel(), closeDetail(), currentTasks(), dropOnCol(), dropOnDay(), dropOnList(), dropOnRow(), inlineEdit() (+21 more)

### Community 22 - "Niche Sources & Prompts"
Cohesion: 0.11
Nodes (27): addSrc(), calcSrcScore(), closeGM(), fbaOpenConfig(), gmPrompt(), listingPromptGen(), nischenAdd(), nischenAddDialog() (+19 more)

### Community 23 - "FBA Profit Calculations"
Cohesion: 0.13
Nodes (26): calculateBreakEvenMetrics(), calculateFbaFee(), calculateFuelSurcharge(), calculateNetAfterTaxReserve(), calculatePlanCostPerUnit(), calculatePpcCost(), calculateProfitMetrics(), calculateReferralFee() (+18 more)

### Community 24 - "Helium & Seller Report Import"
Cohesion: 0.10
Nodes (26): closeSellerModal(), confirmSellerImport(), detectHeliumType(), detectReportType(), extractASIN(), extractSKU(), getFieldFromRow(), getHelField() (+18 more)

### Community 25 - "Topic Forecasting"
Cohesion: 0.08
Nodes (32): aiClient(), PROMPTS, logAiCall(), upsertTopicForecast(), topicHistory(), AI_CATEGORIES, ANALYSIS_SCHEMA, analyzeItem() (+24 more)

### Community 26 - "To-Do Filters & Cache"
Cohesion: 0.12
Nodes (23): applySavedFilter(), boot(), bulk(), bulkPatch(), cacheRead(), cacheWrite(), calShift(), calToday() (+15 more)

### Community 27 - "AI Strategy Brief"
Cohesion: 0.12
Nodes (19): saveAiResult(), getStrategyBrief(), saveStrategyBrief(), BRIEF_SCHEMA, fallbackBrief(), strategyState, updateStrategyBrief(), app (+11 more)

### Community 28 - "Hub State & To-Do Tests"
Cohesion: 0.09
Nodes (19): hubState, subscribe(), subscribers, app, bigFile, cutoff, del, fakeRes (+11 more)

### Community 29 - "Amazon Link & JSON Extraction"
Cohesion: 0.13
Nodes (19): asinHasImage(), asinOf(), bestAmazonLinkFor(), cleanAmazonUrl(), closePerplexityModal(), collectAmazonProductLinks(), extractJSON(), extractPerplexitySources() (+11 more)

### Community 30 - "Task Detail Mutations"
Cohesion: 0.17
Nodes (21): attDel(), attUpload(), cAdd(), cDel(), cEditSave(), clAdd(), clDel(), clEdit() (+13 more)

### Community 31 - "Alert Dispatching"
Cohesion: 0.13
Nodes (22): bumpAlertAttempts(), insertAlert(), itemsWithoutAlertCheck(), markAlertDelivered(), pendingAlerts(), dispatchAlerts(), dispatchFetch(), dispatchState (+14 more)

### Community 32 - "Login & Auth Gate"
Cohesion: 0.14
Nodes (6): applyRoleVisibility(), finishLogin(), injectFooterControls(), showLoginErr(), syStore(), wikaUnlock()

### Community 33 - "PPC Cockpit"
Cohesion: 0.23
Nodes (16): ppcAuditAnalyze(), ppcAuditCols(), ppcAuditFile(), ppcCerebroAnalyze(), ppcCerebroApply(), ppcCerebroClose(), ppcCerebroOpen(), ppcFillSelect() (+8 more)

### Community 34 - "To-Do Dialogs & Menus"
Cohesion: 0.16
Nodes (18): closeDialogs(), closeOvl(), closePop(), fmtLink(), folderMenu(), folderRename(), gcalEventPop(), listMenu() (+10 more)

### Community 35 - "Idea Pool Management"
Cohesion: 0.11
Nodes (25): addAmazonLink(), addBildUrl(), auswahlSaveNote(), bulkChangeStatus(), bulkDelete(), bulkSetStatus(), closeClaudeModal(), closeIdeeModal() (+17 more)

### Community 36 - "Clipboard & Templates"
Cohesion: 0.13
Nodes (20): addLaunchItem(), closePromptModal(), copyPrompt(), deleteTask(), fallbackCopy(), kwCopy(), lgCopy(), listingCopyHtml() (+12 more)

### Community 37 - "Backend Architecture Docs"
Cohesion: 0.13
Nodes (15): AI Intelligence Layer — Erweiterungspunkt, Apps & Betriebsmodi (src/apps/), Architektur-Analyse (4.7.2026) — Befunde & Status, Datenmodell, Environment-Konfiguration, Härtungs-Bausteine (Platform Hardening, 4.7.2026), Kernmodule → Code-Mapping, Layer-Taxonomie (Plattform-Sicht → Code) (+7 more)

### Community 38 - "News Radar Widget"
Cohesion: 0.18
Nodes (14): lgImportAmazon(), lgSyToken(), newsAct(), newsResetDeleted(), newsSetFilter(), newsSetPage(), newsSetState(), newsState() (+6 more)

### Community 39 - "Niche Scoring"
Cohesion: 0.34
Nodes (14): nischenAttraktivitaet(), nischenDetailDialog(), nischenEinstiegsbarriere(), nischenKriterienCheck(), nischenMonatsAbsatz(), nischenProfitPotenzial(), nischenQuickWin(), nischenRanking() (+6 more)

### Community 40 - "Seller Radar Concept Doc"
Cohesion: 0.14
Nodes (13): 2.1 Quellen-Typen (v1-Startliste — Feeds am 4.7.2026 real verifiziert ✅), 2.2 Relevanz-Bewertung (deterministisch, erklärbar — kein Blackbox-Score), 2.3 Dubletten-Vermeidung (2 Ebenen, in dieser Reihenfolge), 2.4 Aktualitäts-Prüfung, 2. Quellen, Relevanz, Dubletten, Aktualität, 3.1 Skizze (beim Login, oberhalb der Produktsuchen), 3.2 Was wird angezeigt (pro Item, bewusst wenig), 3.3 Priorisierungslogik beim Login (serverseitig in `GET /api/top`) (+5 more)

### Community 41 - "Keyword Cleaning Tools"
Cohesion: 0.15
Nodes (13): kwByteLength(), kwClean(), kwcleanInit(), kwOnInput(), kwRenderResult(), kwStat(), kwStemDe(), kwStripSpecial() (+5 more)

### Community 42 - "Cashflow Planner"
Cohesion: 0.44
Nodes (12): cfAddAmazon(), cfAddBestellung(), cfAddPosten(), cfData(), cfDel(), cfDelSerie(), cfDone(), cfEditPosten() (+4 more)

### Community 43 - "Project Instructions Doc"
Cohesion: 0.17
Nodes (11): Aufbau (Kurz), Automatischer Sync über Claude-Code-Hooks (`.claude/settings.json`), Backups, graphify, Hosting (vorbereitet — Ziel: amzsellerhub.de auf netcup-Webspace), Lokale Vorschau (solange die Domain hängt), Offene nächste Schritte (Stand 7.7.2026), SellerHub (+3 more)

### Community 44 - "Product List Management"
Cohesion: 0.11
Nodes (19): closePM(), cp(), deleteCurrentProd(), delProd(), dlf(), duplicateCurrentProd(), dupProd(), exportCSV() (+11 more)

### Community 45 - "Product Research Concept Doc"
Cohesion: 0.17
Nodes (11): 1. Die eine Recherche-Pipeline (ersetzt Ideen-Pool + Konkurrenz-Tabelle + Engere Wahl), 2. Das EINE Entscheidungs-Scorecard (ersetzt Score-Matrix + Nischen-Score + „Potenzial"), 3. Red-Flag-Regel-Engine (macht „Entscheidung leicht"), 4. Mockup: Kandidaten-Entscheidungskarte (das „10-Sekunden-Urteil"), 5. Mockup: Review-Mining (1 Klick — der eigentliche Wettbewerbsvorteil), 6. Mockup: Nischen-Scan (Felder automatisch füllen statt abtippen), 7. Was wird wiederverwendet / verschmolzen / geparkt, 8. Umsetzungs-Reihenfolge (Vorschlag) (+3 more)

### Community 46 - "Backend Architecture Reference"
Cohesion: 0.17
Nodes (10): Alert-Dispatcher (`services/alerts/dispatch.js`, Registry-Position nach `alerts`), Amazon-Import (Modul 3), Architektur (AI Service Layer), Forecasting-Modul (`services/intelligence/forecast.js`, Registry-Position nach `trends`), KI-Proxy (Modul 2), Konten & Sync (Modul 1), Kostenabschätzung pro 1.000 Artikel, Personalisierung (+2 more)

### Community 47 - "Platform Integration Tests"
Cohesion: 0.20
Nodes (9): app, line, mem, okOut, { Pool }, pretty, runNode(), srv (+1 more)

### Community 48 - "Amazon Import Concept Doc"
Cohesion: 0.22
Nodes (8): B1: Bildstudio-Schnellimport (js/bildstudio.js), B2: KI-Listing-Generator (im Listing-Editor `p-listing`, js/app.js), `GET /api/import/amazon-image?url=…` (Bearer-Pflicht), Konzept: Amazon-Import + KI-Listing-Generator (Modul 3), Nicht in v1, `POST /api/import/amazon` (Bearer-Pflicht), Teil A — Backend: Amazon-Import, Teil B — Frontend

### Community 49 - "Seller Radar Operations Doc"
Cohesion: 0.22
Nodes (9): Backup & Datensicherung, Dashboard-Anbindung (SellerHub-Frontend), Deployment (Railway / Render), Lokal starten, Projektstruktur (Service-Architektur — Details & Grenzen: [`ARCHITEKTUR.md`](ARCHITEKTUR.md)), Quellen (`data/sources.js`), Scheduling-Logik, SellerHub Seller-Radar (MVP) (+1 more)

### Community 50 - "Backup Snapshots"
Cohesion: 0.29
Nodes (8): download(), get(), hasData(), list(), openDb(), restore(), snapshotIfDue(), writeSnap()

### Community 51 - "Accounts & Sync Concept Doc"
Cohesion: 0.25
Nodes (7): API (unter /api/auth und /api/sync), Datenmodell (Postgres), Frontend (v1: js/sync.js, Opt-in), Konzept: Konten + Daten-Sync (SaaS-Fundament, Modul 1), Leitplanken, Nicht in v1 (bewusst), Umsetzungs-Reihenfolge

### Community 52 - "PPC Keywords Concept Doc"
Cohesion: 0.25
Nodes (7): 1. Datenquellen-Realität (ehrlich), 2. Modul A — Keyword-Import (Cerebro/Magnet-Paste), 3. Modul B — Launch-PPC-Planer (deterministisch, der Kern), 4. Modul C — Suchbegriffs-Audit (echte Kampagnen-Daten), 5. Was wird wiederverwendet / wo landet es, 6. Umsetzungs-Reihenfolge, Konzept: PPC & Keywords mit echten Daten

### Community 53 - "Backend Claude Instructions"
Cohesion: 0.25
Nodes (7): Checkliste: Neue Quelle, Checkliste: Neues AI-Modul, Häufige Fallen, Kommandos, Konventionen (einhalten!), SellerHub Backend — Hinweise für Claude Code, Struktur (Kurzform — Details in ARCHITEKTUR.md)

### Community 54 - "Trend Engine & Risk Monitoring"
Cohesion: 0.25
Nodes (8): Alert-Regeln (Risk Monitoring, bewusst OHNE KI-Entscheidung — reproduzierbar), Architektur, Clustering-Strategie (und warum keine Embeddings in v1), Dashboard-Datenstruktur — `GET /api/market-intelligence`, Phase 4: Trend-Engine, Opportunity Detection & Risk Monitoring, Skalierung auf > 50.000 Artikel, Trend-Score (deterministisch, jede Komponente erklärbar), Vorbereitung Predictive Forecasting (Phase 5)

### Community 55 - "User Data Sync Storage"
Cohesion: 0.50
Nodes (6): listUserData(), upsertUserData(), userDataSizes(), userDataTotalSize(), applySyncBatch(), listSyncData()

### Community 56 - "Global Search"
Cohesion: 0.33
Nodes (7): closeGlobalSearch(), escapeHtml(), executeSearchResult(), handleSearchKey(), highlightMatch(), lgHtml(), renderGlobalSearchResults()

### Community 57 - "AI Proxy Concept Doc"
Cohesion: 0.29
Nodes (6): API (Bearer-Auth aus Modul 1 zwingend), Frontend (js/bildstudio.js), Kontingente & Telemetrie, Konzept: KI-Proxy im Backend (Modul 2), Leitplanken, Nicht in v1

### Community 58 - "Export & Detail Recalc"
Cohesion: 0.08
Nodes (23): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Buttons, Cards / Containers (+15 more)

### Community 59 - "Task Moves & Notifications"
Cohesion: 0.18
Nodes (10): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Platform, Positioning, Product, Product Purpose (+2 more)

### Community 60 - "Research Progress Indicator"
Cohesion: 0.53
Nodes (6): researchBeatCandidate(), researchBeatProgDone(), researchBeatProgHide(), researchBeatProgPaint(), researchBeatProgShow(), researchBeatProgStep()

### Community 61 - "Freitext Import"
Cohesion: 0.24
Nodes (10): createBoard(), createList(), createTask(), pmAddList(), pmCreateBoardFromTemplate(), pmCreateEmptyBoard(), pmCreateFromTemplate(), pmNewBoardDialog() (+2 more)

### Community 62 - "Crawler Pipeline Architecture"
Cohesion: 0.33
Nodes (6): 1.1 Überblick (eine Pipeline, drei Bausteine), 1.2 Crawler-Logik (3 Quellen-Stufen, bewusst in dieser Reihenfolge), 1.3 Datenbankstruktur (2 Tabellen reichen für v1), 1.4 API-Endpunkte (REST, readonly, minimal), 1.5 Event-Update-Mechanismus, 1. Systemarchitektur

### Community 63 - "Supplier Management"
Cohesion: 0.50
Nodes (5): addDetailSupplier(), calcSupplierScore(), delDetailSupplier(), editDetailSupplier(), renderDetailSuppliers()

### Community 64 - "Tax Reserve Calculations"
Cohesion: 0.22
Nodes (10): listingActive(), listingDelete(), listingDeleteConfirm(), listingExec(), listingInsertLink(), listingOnInput(), listingRefreshOutputs(), listingRename() (+2 more)

### Community 65 - "External AI Prompt Handoff"
Cohesion: 0.33
Nodes (6): duePick(), field(), loadActivity(), renderDetail(), repeatChange(), setTab()

### Community 66 - "Google Calendar Sync & SSE"
Cohesion: 0.60
Nodes (5): gcalAdd(), gcalDel(), gcalDialog(), gcalEnsure(), gcalSync()

### Community 67 - "Tag Manager"
Cohesion: 0.40
Nodes (5): openTagManager(), tagColor(), tagCreate(), tagDelete(), tagMenu()

### Community 68 - "Bulk Selection UI"
Cohesion: 0.50
Nodes (4): clearSelection(), toggleSelect(), toggleSelectAll(), updateBulkBar()

### Community 69 - "Save & Backup Export"
Cohesion: 0.50
Nodes (4): _doSave(), renderBackupHint(), saveNow(), wikaExportAll()

### Community 70 - "Product Modal Editing"
Cohesion: 0.50
Nodes (4): editProd(), fCalc(), openProdModal(), productFetchImage()

### Community 71 - "FBA Category Selects"
Cohesion: 0.50
Nodes (4): fbaCatLabel(), fbaPopulateSelects(), fbaPopulateSelectsRefresh(), fbaTierLabel()

### Community 72 - "Landed Cost Calculator"
Cohesion: 0.50
Nodes (4): lcApply(), lcCalc(), lcEustCashflow(), lcVals()

### Community 73 - "Product Bulk Selection"
Cohesion: 0.50
Nodes (4): saveDetailField(), saveDetailManual(), setDetailDirty(), setDetailSaved()

### Community 74 - "JSON Repair Utilities"
Cohesion: 0.50
Nodes (4): removeOuterCitations(), removeOuterMarkdownLinks(), repairBracketsInStrings(), tryRepairJSON()

### Community 75 - "Local Dev Server"
Cohesion: 0.50
Nodes (3): MIME, PORT, ROOT

### Community 76 - "Marketing Website Docs"
Cohesion: 0.50
Nodes (3): SellerHub Marketing-Website, Vor Veröffentlichung ausfüllen (Suche nach `TODO` / `[`), Ziel-Layout auf dem Webspace (amzsellerhub.de)

### Community 77 - "Amazon Search Links"
Cohesion: 0.67
Nodes (3): applyHeliumPick(), applyHeliumToProduct(), heliumSourceLabel()

## Knowledge Gaps
- **337 isolated node(s):** `deploy-frontend.sh script`, `ROOT`, `PORT`, `MIME`, `name` (+332 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `v()` connect `Platform Integration Tests` to `To-Do Database Layer`, `AI Image Studio`, `To-Do Dialogs & Menus`, `Calendar Feeds & ICS Export`, `Product Research Selection`, `BSR & Decision Scoring`, `Navigation & Product Editing`, `Internal Admin Dashboard`, `Cloud Sync Client`, `API Server & Crawler Worker`, `Amazon Link & JSON Extraction`?**
  _High betweenness centrality (0.351) - this node is a cross-community bridge._
- **Why does `err()` connect `Calendar Feeds & ICS Export` to `AI Image Studio`, `PPC Cockpit`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `renderDetailSales()` connect `Navigation & Product Editing` to `Main App Core`, `BSR & Decision Scoring`, `Seller Coach Learning`, `Amazon Search Links`, `Platform Integration Tests`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **What connects `deploy-frontend.sh script`, `ROOT`, `PORT` to the rest of the system?**
  _337 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `To-Do Database Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.05883870967741935 - nodes in this community are weakly interconnected._
- **Should `AI Image Studio` be split into smaller, more focused modules?**
  _Cohesion score 0.06829488919041157 - nodes in this community are weakly interconnected._
- **Should `Text Utilities & AI Usage Tracking` be split into smaller, more focused modules?**
  _Cohesion score 0.056535504296698326 - nodes in this community are weakly interconnected._