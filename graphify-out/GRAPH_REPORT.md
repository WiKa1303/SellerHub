# Graph Report - /Users/wk/Developer/amzsellerhub  (2026-07-09)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1723 nodes · 4619 edges · 82 communities (80 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 46 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `db00ce5f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- db
- bildstudio.js
- import.test.js
- index.js
- save
- smoke.test.js
- pmRenderBoard
- index.js
- app.js
- trends.test.js
- fmt
- esc
- todo.js
- admin.js
- go
- routes.js
- scripts
- sync.js
- ai.test.js
- db.js
- renderListing
- renderAll
- renderNischen
- pf
- parseSellerFile
- forecast.test.js
- refresh
- strategy.test.js
- todo.test.js
- importPerplexityResponse
- mutate
- dispatch.test.js
- auth.js
- ppc.js
- ovl
- renderIdeen
- toast
- SellerHub — Plattform-Architektur
- renderNewsPage
- nischenDetailDialog
- KONZEPT: Seller-Radar — News & Events für Amazon FBA Seller (DACH)
- renderKeywordClean
- cashflow.js
- SellerHub
- renderProds
- Konzept: Perfekte Produktrecherche in SellerHub
- README.md
- platform.test.js
- Konzept: Amazon-Import + KI-Listing-Generator (Modul 3)
- SellerHub Seller-Radar (MVP)
- get
- Konzept: Konten + Daten-Sync (SaaS-Fundament, Modul 1)
- Konzept: PPC & Keywords mit echten Daten
- SellerHub Backend — Hinweise für Claude Code
- Phase 4: Trend-Engine, Opportunity Detection & Risk Monitoring
- index.js
- renderGlobalSearchResults
- Konzept: KI-Proxy im Backend (Modul 2)
- cp
- notifUpdateBell
- researchBeatCandidate
- engine.js
- 1. Systemarchitektur
- renderDetailSuppliers
- calculateTaxReserve
- openClaudeWithPrompt
- gcalEnsure
- openTagManager
- updateBulkBar
- _doSave
- productFetchImage
- fbaPopulateSelects
- lcApply
- updateProdBulkBar
- tryRepairJSON
- lokaler-server.mjs
- SellerHub Marketing-Website
- buildAmazonSearchUrl
- deploy-frontend.sh
- start-lokal.sh
- lgGenerate

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

## Communities (82 total, 2 thin omitted)

### Community 0 - "db"
Cohesion: 0.06
Nodes (123): activityFor(), addTaskTag(), attachmentBytesForUser(), attachmentsForTask(), buildSet(), checklistForTasks(), commentsForTask(), deleteAttachment() (+115 more)

### Community 1 - "bildstudio.js"
Cohesion: 0.06
Nodes (66): generatePrompt(), openPromptModal(), resetPrompt(), ask(), beat(), buildPrompt(), fetchListing(), generateOne() (+58 more)

### Community 2 - "import.test.js"
Cohesion: 0.06
Nodes (55): decodeEntities(), NAMED_ENTITIES, stripTags(), EMPTY_USAGE, getUsage(), incrementUsage(), todayKey(), USAGE_COLS (+47 more)

### Community 3 - "index.js"
Cohesion: 0.06
Nodes (53): RFC-5545, countCalendarFeeds(), deleteCalendarFeed(), getCalendarExportToken(), getCalendarFeed(), insertCalendarExportToken(), insertCalendarFeed(), listCalendarFeeds() (+45 more)

### Community 4 - "save"
Cohesion: 0.10
Nodes (61): auswahlAddToProduktliste(), auswahlDelete(), auswahlDeleteSelected(), auswahlOrderSample(), auswahlSaveNote(), auswahlSetDecision(), auswahlUpdateBadge(), complianceToggle() (+53 more)

### Community 5 - "smoke.test.js"
Cohesion: 0.06
Nodes (50): KEYWORDS, KEYWORDS_NEGATIVE, isDuplicateTitle(), titleSimilarity(), trigrams(), urlHash(), recentTitleNorms(), SOURCES (+42 more)

### Community 6 - "pmRenderBoard"
Cohesion: 0.07
Nodes (54): calculateBoardProgress(), createBoard(), createList(), createTask(), filterTasks(), getDueTasks(), notifBrowserPush(), notifClickItem() (+46 more)

### Community 7 - "index.js"
Cohesion: 0.07
Nodes (45): countActiveSessions(), createSession(), deleteSession(), deleteSessionsForUser(), findValidSession(), touchSession(), createUser(), findByEmail() (+37 more)

### Community 8 - "app.js"
Cohesion: 0.04
Nodes (26): auswahlSelAll(), auswahlStatCard(), auswahlToggleSel(), closeHeliumModal(), closeLesson(), coachBackFromLesson(), deleteBoard(), deleteTask() (+18 more)

### Community 9 - "trends.test.js"
Cohesion: 0.09
Nodes (28): insertAlert(), itemsWithoutAlertCheck(), insertItem(), alertState, classifyAlert(), generateAlerts(), seedAlert(), alertsApi (+20 more)

### Community 10 - "fmt"
Cohesion: 0.07
Nodes (45): bsrCalc(), bsrCalibrate(), bsrGetCalib(), bsrResetCalib(), bsrScaleFor(), bsrSetCalib(), complianceFor(), complianceHtml() (+37 more)

### Community 11 - "esc"
Cohesion: 0.07
Nodes (41): backupOpen(), coachBuildLessonNav(), coachBuildMainNav(), coachBuildModuleCard(), coachCalculateStreak(), coachCelebratePhase(), coachContinueLearning(), coachFindNextLesson() (+33 more)

### Community 12 - "todo.js"
Cohesion: 0.08
Nodes (21): avatar(), duePick(), duePop(), duePopHtml(), dueShiftMonth(), field(), loadActivity(), miniCal() (+13 more)

### Community 13 - "admin.js"
Cohesion: 0.11
Nodes (32): adminChangePw(), adminClosePwModal(), adminCloseUserModal(), adminDeleteUser(), adminEscape(), adminExtendLicense(), adminFmtDate(), adminGeneratePassword() (+24 more)

### Community 14 - "go"
Cohesion: 0.07
Nodes (36): addKW(), applyHeliumPick(), applyHeliumToProduct(), bsrPopulateCats(), clearProductSalesData(), coachStartModule(), editIdee(), editTitleInline() (+28 more)

### Community 15 - "routes.js"
Cohesion: 0.15
Nodes (28): dt(), esc(), num(), PROFILES, renderInternal(), buildApi(), fail(), aiCallStats() (+20 more)

### Community 16 - "scripts"
Cohesion: 0.06
Nodes (33): dependencies, @anthropic-ai/sdk, express, fast-xml-parser, node-cron, pg, description, devDependencies (+25 more)

### Community 17 - "sync.js"
Cohesion: 0.19
Nodes (32): syApi(), syApplyMode(), syBtnClick(), syClose(), syDropToken(), syFetch(), syIsSyncKey(), syLocalKeys() (+24 more)

### Community 18 - "ai.test.js"
Cohesion: 0.08
Nodes (28): aiClient(), PROMPTS, logAiCall(), AI_CATEGORIES, ANALYSIS_SCHEMA, analyzeItem(), interpretForecasts(), FALLBACK_ACTION (+20 more)

### Community 19 - "db.js"
Cohesion: 0.16
Nodes (21): startApi(), crawlAndAnalyze(), startWorker(), aiEnabled(), config, validateConfig(), emit(), log (+13 more)

### Community 20 - "renderListing"
Cohesion: 0.10
Nodes (26): lgApply(), lgBytes(), lgCount(), lgDelete(), lgLoad(), lgSave(), listingActive(), listingBtn() (+18 more)

### Community 21 - "renderAll"
Cohesion: 0.10
Nodes (29): clearSel(), closeDetail(), currentTasks(), dropOnCol(), dropOnDay(), dropOnList(), dropOnRow(), inlineEdit() (+21 more)

### Community 22 - "renderNischen"
Cohesion: 0.11
Nodes (27): addSrc(), calcSrcScore(), closeGM(), fbaOpenConfig(), gmPrompt(), listingPromptGen(), nischenAdd(), nischenAddDialog() (+19 more)

### Community 23 - "pf"
Cohesion: 0.13
Nodes (26): calculateBreakEvenMetrics(), calculateFbaFee(), calculateFuelSurcharge(), calculateNetAfterTaxReserve(), calculatePlanCostPerUnit(), calculatePpcCost(), calculateProfitMetrics(), calculateReferralFee() (+18 more)

### Community 24 - "parseSellerFile"
Cohesion: 0.10
Nodes (26): closeSellerModal(), confirmSellerImport(), detectHeliumType(), detectReportType(), extractASIN(), extractSKU(), getFieldFromRow(), getHelField() (+18 more)

### Community 25 - "forecast.test.js"
Cohesion: 0.10
Nodes (21): upsertTopicForecast(), topicHistory(), forecastState, HINT_SCHEMA, holtForecast(), runForecast(), api, app (+13 more)

### Community 26 - "refresh"
Cohesion: 0.12
Nodes (23): applySavedFilter(), boot(), bulk(), bulkPatch(), cacheRead(), cacheWrite(), calShift(), calToday() (+15 more)

### Community 27 - "strategy.test.js"
Cohesion: 0.15
Nodes (13): saveAiResult(), app, brief, daysAgo(), fb, health, keys, mem (+5 more)

### Community 28 - "todo.test.js"
Cohesion: 0.09
Nodes (19): hubState, subscribe(), subscribers, app, bigFile, cutoff, del, fakeRes (+11 more)

### Community 29 - "importPerplexityResponse"
Cohesion: 0.12
Nodes (22): asinHasImage(), asinOf(), bestAmazonLinkFor(), cleanAmazonUrl(), closeClaudeModal(), closePerplexityModal(), collectAmazonProductLinks(), extractJSON() (+14 more)

### Community 30 - "mutate"
Cohesion: 0.17
Nodes (21): attDel(), attUpload(), cAdd(), cDel(), cEditSave(), clAdd(), clDel(), clEdit() (+13 more)

### Community 31 - "dispatch.test.js"
Cohesion: 0.17
Nodes (16): bumpAlertAttempts(), markAlertDelivered(), pendingAlerts(), dispatchAlerts(), dispatchFetch(), dispatchState, doFetch(), sendNtfy() (+8 more)

### Community 32 - "auth.js"
Cohesion: 0.14
Nodes (6): applyRoleVisibility(), finishLogin(), injectFooterControls(), showLoginErr(), syStore(), wikaUnlock()

### Community 33 - "ppc.js"
Cohesion: 0.23
Nodes (16): ppcAuditAnalyze(), ppcAuditCols(), ppcAuditFile(), ppcCerebroAnalyze(), ppcCerebroApply(), ppcCerebroClose(), ppcCerebroOpen(), ppcFillSelect() (+8 more)

### Community 34 - "ovl"
Cohesion: 0.16
Nodes (18): closeDialogs(), closeOvl(), closePop(), fmtLink(), folderMenu(), folderRename(), gcalEventPop(), listMenu() (+10 more)

### Community 35 - "renderIdeen"
Cohesion: 0.12
Nodes (17): addAmazonLink(), addBildUrl(), bulkChangeStatus(), bulkDelete(), bulkSetStatus(), closeIdeeModal(), closeImportModal(), delIdee() (+9 more)

### Community 36 - "toast"
Cohesion: 0.15
Nodes (16): addLaunchItem(), copyPrompt(), fallbackCopy(), kwCopy(), lgCopy(), listingCopyHtml(), listingCopyPlain(), loadLaunchTemplate() (+8 more)

### Community 37 - "SellerHub — Plattform-Architektur"
Cohesion: 0.13
Nodes (15): AI Intelligence Layer — Erweiterungspunkt, Apps & Betriebsmodi (src/apps/), Architektur-Analyse (4.7.2026) — Befunde & Status, Datenmodell, Environment-Konfiguration, Härtungs-Bausteine (Platform Hardening, 4.7.2026), Kernmodule → Code-Mapping, Layer-Taxonomie (Plattform-Sicht → Code) (+7 more)

### Community 38 - "renderNewsPage"
Cohesion: 0.18
Nodes (14): lgImportAmazon(), lgSyToken(), newsAct(), newsResetDeleted(), newsSetFilter(), newsSetPage(), newsSetState(), newsState() (+6 more)

### Community 39 - "nischenDetailDialog"
Cohesion: 0.34
Nodes (14): nischenAttraktivitaet(), nischenDetailDialog(), nischenEinstiegsbarriere(), nischenKriterienCheck(), nischenMonatsAbsatz(), nischenProfitPotenzial(), nischenQuickWin(), nischenRanking() (+6 more)

### Community 40 - "KONZEPT: Seller-Radar — News & Events für Amazon FBA Seller (DACH)"
Cohesion: 0.14
Nodes (13): 2.1 Quellen-Typen (v1-Startliste — Feeds am 4.7.2026 real verifiziert ✅), 2.2 Relevanz-Bewertung (deterministisch, erklärbar — kein Blackbox-Score), 2.3 Dubletten-Vermeidung (2 Ebenen, in dieser Reihenfolge), 2.4 Aktualitäts-Prüfung, 2. Quellen, Relevanz, Dubletten, Aktualität, 3.1 Skizze (beim Login, oberhalb der Produktsuchen), 3.2 Was wird angezeigt (pro Item, bewusst wenig), 3.3 Priorisierungslogik beim Login (serverseitig in `GET /api/top`) (+5 more)

### Community 41 - "renderKeywordClean"
Cohesion: 0.15
Nodes (13): kwByteLength(), kwClean(), kwcleanInit(), kwOnInput(), kwRenderResult(), kwStat(), kwStemDe(), kwStripSpecial() (+5 more)

### Community 42 - "cashflow.js"
Cohesion: 0.44
Nodes (12): cfAddAmazon(), cfAddBestellung(), cfAddPosten(), cfData(), cfDel(), cfDelSerie(), cfDone(), cfEditPosten() (+4 more)

### Community 43 - "SellerHub"
Cohesion: 0.17
Nodes (11): Aufbau (Kurz), Automatischer Sync über Claude-Code-Hooks (`.claude/settings.json`), Backups, graphify, Hosting (vorbereitet — Ziel: amzsellerhub.de auf netcup-Webspace), Lokale Vorschau (solange die Domain hängt), Offene nächste Schritte (Stand 7.7.2026), SellerHub (+3 more)

### Community 44 - "renderProds"
Cohesion: 0.17
Nodes (12): closePM(), deleteCurrentProd(), delProd(), duplicateCurrentProd(), dupProd(), prodBulkDelete(), prodBulkSetStatus(), prodSearchInput() (+4 more)

### Community 45 - "Konzept: Perfekte Produktrecherche in SellerHub"
Cohesion: 0.17
Nodes (11): 1. Die eine Recherche-Pipeline (ersetzt Ideen-Pool + Konkurrenz-Tabelle + Engere Wahl), 2. Das EINE Entscheidungs-Scorecard (ersetzt Score-Matrix + Nischen-Score + „Potenzial"), 3. Red-Flag-Regel-Engine (macht „Entscheidung leicht"), 4. Mockup: Kandidaten-Entscheidungskarte (das „10-Sekunden-Urteil"), 5. Mockup: Review-Mining (1 Klick — der eigentliche Wettbewerbsvorteil), 6. Mockup: Nischen-Scan (Felder automatisch füllen statt abtippen), 7. Was wird wiederverwendet / verschmolzen / geparkt, 8. Umsetzungs-Reihenfolge (Vorschlag) (+3 more)

### Community 46 - "README.md"
Cohesion: 0.17
Nodes (10): Alert-Dispatcher (`services/alerts/dispatch.js`, Registry-Position nach `alerts`), Amazon-Import (Modul 3), Architektur (AI Service Layer), Forecasting-Modul (`services/intelligence/forecast.js`, Registry-Position nach `trends`), KI-Proxy (Modul 2), Konten & Sync (Modul 1), Kostenabschätzung pro 1.000 Artikel, Personalisierung (+2 more)

### Community 47 - "platform.test.js"
Cohesion: 0.20
Nodes (9): app, line, mem, okOut, { Pool }, pretty, runNode(), srv (+1 more)

### Community 48 - "Konzept: Amazon-Import + KI-Listing-Generator (Modul 3)"
Cohesion: 0.22
Nodes (8): B1: Bildstudio-Schnellimport (js/bildstudio.js), B2: KI-Listing-Generator (im Listing-Editor `p-listing`, js/app.js), `GET /api/import/amazon-image?url=…` (Bearer-Pflicht), Konzept: Amazon-Import + KI-Listing-Generator (Modul 3), Nicht in v1, `POST /api/import/amazon` (Bearer-Pflicht), Teil A — Backend: Amazon-Import, Teil B — Frontend

### Community 49 - "SellerHub Seller-Radar (MVP)"
Cohesion: 0.22
Nodes (9): Backup & Datensicherung, Dashboard-Anbindung (SellerHub-Frontend), Deployment (Railway / Render), Lokal starten, Projektstruktur (Service-Architektur — Details & Grenzen: [`ARCHITEKTUR.md`](ARCHITEKTUR.md)), Quellen (`data/sources.js`), Scheduling-Logik, SellerHub Seller-Radar (MVP) (+1 more)

### Community 50 - "get"
Cohesion: 0.29
Nodes (8): download(), get(), hasData(), list(), openDb(), restore(), snapshotIfDue(), writeSnap()

### Community 51 - "Konzept: Konten + Daten-Sync (SaaS-Fundament, Modul 1)"
Cohesion: 0.25
Nodes (7): API (unter /api/auth und /api/sync), Datenmodell (Postgres), Frontend (v1: js/sync.js, Opt-in), Konzept: Konten + Daten-Sync (SaaS-Fundament, Modul 1), Leitplanken, Nicht in v1 (bewusst), Umsetzungs-Reihenfolge

### Community 52 - "Konzept: PPC & Keywords mit echten Daten"
Cohesion: 0.25
Nodes (7): 1. Datenquellen-Realität (ehrlich), 2. Modul A — Keyword-Import (Cerebro/Magnet-Paste), 3. Modul B — Launch-PPC-Planer (deterministisch, der Kern), 4. Modul C — Suchbegriffs-Audit (echte Kampagnen-Daten), 5. Was wird wiederverwendet / wo landet es, 6. Umsetzungs-Reihenfolge, Konzept: PPC & Keywords mit echten Daten

### Community 53 - "SellerHub Backend — Hinweise für Claude Code"
Cohesion: 0.25
Nodes (7): Checkliste: Neue Quelle, Checkliste: Neues AI-Modul, Häufige Fallen, Kommandos, Konventionen (einhalten!), SellerHub Backend — Hinweise für Claude Code, Struktur (Kurzform — Details in ARCHITEKTUR.md)

### Community 54 - "Phase 4: Trend-Engine, Opportunity Detection & Risk Monitoring"
Cohesion: 0.25
Nodes (8): Alert-Regeln (Risk Monitoring, bewusst OHNE KI-Entscheidung — reproduzierbar), Architektur, Clustering-Strategie (und warum keine Embeddings in v1), Dashboard-Datenstruktur — `GET /api/market-intelligence`, Phase 4: Trend-Engine, Opportunity Detection & Risk Monitoring, Skalierung auf > 50.000 Artikel, Trend-Score (deterministisch, jede Komponente erklärbar), Vorbereitung Predictive Forecasting (Phase 5)

### Community 55 - "index.js"
Cohesion: 0.50
Nodes (6): listUserData(), upsertUserData(), userDataSizes(), userDataTotalSize(), applySyncBatch(), listSyncData()

### Community 56 - "renderGlobalSearchResults"
Cohesion: 0.33
Nodes (7): closeGlobalSearch(), escapeHtml(), executeSearchResult(), handleSearchKey(), highlightMatch(), lgHtml(), renderGlobalSearchResults()

### Community 57 - "Konzept: KI-Proxy im Backend (Modul 2)"
Cohesion: 0.29
Nodes (6): API (Bearer-Auth aus Modul 1 zwingend), Frontend (js/bildstudio.js), Kontingente & Telemetrie, Konzept: KI-Proxy im Backend (Modul 2), Leitplanken, Nicht in v1

### Community 58 - "cp"
Cohesion: 0.33
Nodes (6): cp(), dlf(), exportCSV(), exportJSON(), mc(), recalcDetail()

### Community 59 - "notifUpdateBell"
Cohesion: 0.33
Nodes (6): moveTask(), notifClearAll(), notifDismiss(), notifMarkAllRead(), notifUpdateBell(), pmDrop()

### Community 60 - "researchBeatCandidate"
Cohesion: 0.53
Nodes (6): researchBeatCandidate(), researchBeatProgDone(), researchBeatProgHide(), researchBeatProgPaint(), researchBeatProgShow(), researchBeatProgStep()

### Community 61 - "engine.js"
Cohesion: 0.17
Nodes (17): parseAiSummary(), queryEvents(), saveAiFailure(), analyzedItemsSince(), unanalyzedItemsSince(), upsertTopicDaily(), upsertTrendTopic(), computeMetrics() (+9 more)

### Community 62 - "1. Systemarchitektur"
Cohesion: 0.33
Nodes (6): 1.1 Überblick (eine Pipeline, drei Bausteine), 1.2 Crawler-Logik (3 Quellen-Stufen, bewusst in dieser Reihenfolge), 1.3 Datenbankstruktur (2 Tabellen reichen für v1), 1.4 API-Endpunkte (REST, readonly, minimal), 1.5 Event-Update-Mechanismus, 1. Systemarchitektur

### Community 63 - "renderDetailSuppliers"
Cohesion: 0.50
Nodes (5): addDetailSupplier(), calcSupplierScore(), delDetailSupplier(), editDetailSupplier(), renderDetailSuppliers()

### Community 64 - "calculateTaxReserve"
Cohesion: 0.40
Nodes (5): calculateCorporateTaxEstimate(), calculateIncomeTaxEstimate(), calculateTaxReserve(), calculateTradeTaxEstimate(), calculateVatReserve()

### Community 65 - "openClaudeWithPrompt"
Cohesion: 0.40
Nodes (5): closePromptModal(), openClaudeWithPrompt(), openPerplexityWithPrompt(), showClaudeInstruction(), showPerplexityInstruction()

### Community 66 - "gcalEnsure"
Cohesion: 0.20
Nodes (12): connectSSE(), gcalAdd(), gcalDel(), gcalDialog(), gcalEnsure(), gcalSync(), isActive(), notifyBrowser() (+4 more)

### Community 67 - "openTagManager"
Cohesion: 0.40
Nodes (5): openTagManager(), tagColor(), tagCreate(), tagDelete(), tagMenu()

### Community 68 - "updateBulkBar"
Cohesion: 0.50
Nodes (4): clearSelection(), toggleSelect(), toggleSelectAll(), updateBulkBar()

### Community 69 - "_doSave"
Cohesion: 0.50
Nodes (4): _doSave(), renderBackupHint(), saveNow(), wikaExportAll()

### Community 70 - "productFetchImage"
Cohesion: 0.50
Nodes (4): editProd(), fCalc(), openProdModal(), productFetchImage()

### Community 71 - "fbaPopulateSelects"
Cohesion: 0.50
Nodes (4): fbaCatLabel(), fbaPopulateSelects(), fbaPopulateSelectsRefresh(), fbaTierLabel()

### Community 72 - "lcApply"
Cohesion: 0.50
Nodes (4): lcApply(), lcCalc(), lcEustCashflow(), lcVals()

### Community 73 - "updateProdBulkBar"
Cohesion: 0.50
Nodes (4): prodClearSelection(), prodToggleSelect(), prodToggleSelectAll(), updateProdBulkBar()

### Community 74 - "tryRepairJSON"
Cohesion: 0.50
Nodes (4): removeOuterCitations(), removeOuterMarkdownLinks(), repairBracketsInStrings(), tryRepairJSON()

### Community 75 - "lokaler-server.mjs"
Cohesion: 0.50
Nodes (3): MIME, PORT, ROOT

### Community 76 - "SellerHub Marketing-Website"
Cohesion: 0.50
Nodes (3): SellerHub Marketing-Website, Vor Veröffentlichung ausfüllen (Suche nach `TODO` / `[`), Ziel-Layout auf dem Webspace (amzsellerhub.de)

### Community 77 - "buildAmazonSearchUrl"
Cohesion: 0.67
Nodes (3): amazonSearchTerms(), buildAmazonSearchUrl(), ideenOpenProduct()

### Community 81 - "lgGenerate"
Cohesion: 0.67
Nodes (3): lgBuildPrompt(), lgGenerate(), lgParse()

## Knowledge Gaps
- **311 isolated node(s):** `deploy-frontend.sh script`, `ROOT`, `PORT`, `MIME`, `name` (+306 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `v()` connect `platform.test.js` to `db`, `bildstudio.js`, `ovl`, `index.js`, `save`, `fmt`, `go`, `routes.js`, `sync.js`, `db.js`, `importPerplexityResponse`?**
  _High betweenness centrality (0.367) - this node is a cross-community bridge._
- **Why does `err()` connect `bildstudio.js` to `ppc.js`, `index.js`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `renderDetailSales()` connect `go` to `app.js`, `fmt`, `esc`, `platform.test.js`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **What connects `deploy-frontend.sh script`, `ROOT`, `PORT` to the rest of the system?**
  _311 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `db` be split into smaller, more focused modules?**
  _Cohesion score 0.05883870967741935 - nodes in this community are weakly interconnected._
- **Should `bildstudio.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05719298245614035 - nodes in this community are weakly interconnected._
- **Should `import.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.056535504296698326 - nodes in this community are weakly interconnected._