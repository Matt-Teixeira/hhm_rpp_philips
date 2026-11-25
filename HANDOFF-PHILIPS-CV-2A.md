# Handoff: Philips CV insights, phase CV-2a (code mapping, read-only)

For a new Claude Code session in `~/hep3/hhm_rpp_philips`. Written 2026-11-25.

## Goal

Draft the **code mapping** for Philips CV insights: every event code in `log.philips_cv_eventlog`
gets a label, a category and a rule, or a place on a reviewed ignore list. This is the CV
counterpart of Philips CT's PCT-2a. It is **read-only and runs in parallel with CV-1b** (plan §3 Q1,
§4). Bring the user the mapping plus a short list of numbered questions, each with a recommendation,
then stop and wait for answers.

**Deliverable:**
- `PLAN-PHILIPS-CV-INSIGHTS-CODES.md` in this repo, uncommitted until the user says.
- Evidence in `~/philips_cv_evidence/cv2a/`, outside the repo: SQL, a draft classifier `mapping.js`,
  the generator for the `.md`, and outputs. Add a row for it to `~/philips_cv_evidence/README.md`.

**Done when:** the user agrees the mapping (plan §4: "mapping agreed"). No code in the repo, no schema
work. Those come in CV-1 and CV-2.

## Read first (in this order)

1. `PLAN-PHILIPS-CV-INSIGHTS.md`:
   - §1.4: content, the 679 codes and the "what the log can support" table.
   - §1.5: PHI.
   - §2: the design, especially items 4 (content dedupe), 6 (classification: about 97% cut, tail
     as `pcv.event` / `pcv.error` with the code as `dim`), 7 (no PHI) and 8 (findings v1).
   - §3 Q6: PHI, decided.
   - §5: field-service questions.
2. **The template:** `PLAN-PHILIPS-CT-INSIGHTS-CODES.md` (this repo), with its tooling in
   `~/philips_ct_evidence/pct2a/`: `mapping.js`, `build_mapping_md.js`, `validate_raw.js` and
   `classify_inventory.js`. Copy its structure: v1 metrics and what feeds them, watch list, every code
   reviewed, ignore list, tail, checks, masking.
3. **The GE precedent:** `~/hep3/hhm_rpp_ge/PLAN-CV-INSIGHTS-CODES.md`.
4. **Evidence already gathered:** `~/philips_cv_evidence/README.md`, then
   - `out/13_content.tsv`,
   - `out/14_top_codes.tsv`,
   - `out/15_exam_meta.tsv`,
   - `out/17_phi_counts.tsv`, `out/32_set_values.tsv` (counts only),
   - `out/18_alert_models.tsv`.
5. `processing/date_processing/phil_cv/extract_memo_data.js`: it already pulls software version and
   power-on hours into `public.logfile_event_history_metadata`. Reuse it, don't duplicate it.

## Data facts that change the counts

| Fact | What to do |
|---|---|
| **LOD rows** (`lod = true`) duplicate the daily export (I4) | count `lod = false` only (design §2 item 4) |
| **Duplicates** across exports and doubled exports, no natural key (I4, I5) | count distinct content: `(system_id, host_date, host_time, error_type, technical_event_id, description, memo, …)`, not raw rows. Say which you used |
| **SME14784** uses `eventlog_2`, which drops records today (I1), mostly Image Detector events | its codes are under-counted until the new parser is live (day 2, 2026-11-26). Note it per code. You may count **codes only** from its files (see `out/07b_db_vs_file_14784.txt`) |
| **Non-ASCII bytes are stored as `�`** (I2) | treat `�` as a wildcard when building templates |
| **Category names have two spellings** (`&` / `and`) | propose the normalising map in the `.md` |
| **History starts 2026-05-01**: 42.4 M rows in monthly partitions | query month by month, with `--timeout` |
| Codes can be missing (`no_code` in `out/13_content.tsv`: 125 k Information rows) | classify those by masked description template, as PCT-2a did for uncoded rows |
| `Memo` holds structured detail (`[STATE]`, `[FREE_TEXT]`, Run Data fields) | use **tag names and masked templates** only (see the PHI section below) |

## PHI and sensitive values (user decision, 2026-11-25)

**Nothing is deleted, and no report, page, alert or export may show patient data.** For this session
that means:
- **Never print or store `Memo` values** from Patient Administration (code 540019921, every
  `Command: Set*`), nor any `ExaminationID`, `PatientID` or names. Counts per code are fine.
- **Mask every template** you write to the `.md` or to evidence:
  - `0x…` → `0x<hex>`;
  - digit runs → `#`;
  - cut to 120 characters;
  - IPs, host names, host IDs (the license memo carries one), serial numbers (Adaptation Data has
    tube and generator serials) → `<ip>`, `<host>`, `<serial>`.

  **Check** that none remain, the way PCT-2a did, and state the check in the `.md`.
- Mapping rules may **use** a memo field (for example `EndReason` in Run Data) to classify. A rule
  must never **emit** a memo value, ID or name as a metric value or `dim`.
- `~/philips_cv_evidence/src/` and `out/db_*.json` hold PHI. Don't copy from them into anything new.

## Method (suggested, as PCT-2a)

1. **Inventory every code** since 2026-05-01 (daily, distinct content). For each code: error type,
   normalised category, rows, systems, system-days, first and last day, and the most common masked
   description template with its share.
2. **Draft `mapping.js`** (pure, first match wins): code → named metric / `pcv.error` / `pcv.event`
   / inventory / noise / ignore. Uncoded rows go through ordered regex rules on the masked
   description.
3. **Propose v1 metrics** from the §1.4 table and the §2 item 8 findings. Give each one its feeding
   codes, `dim`, rows and systems. Anything unproven goes on a watch list.
4. **Checks:**
   - every code has a reviewed rule;
   - every rule matches at least one row;
   - coverage % of rows by rule;
   - raw text and masked template classify the same on a sample;
   - the 3 alert-model phrases (`out/18_alert_models.tsv`) are mapped.
5. **Questions:** number them from **Q12** (the plan uses Q1–Q11 in §3 and C1–C4 in §7.6), each
   with a recommendation. Likely topics:
   - the v1 metric list;
   - the cut and the tail;
   - the ignore list (license errors, UI commands);
   - the category normalising map;
   - Run Data / detector temperature as series;
   - power-on hours;
   - which "information" events count as use.

## Coordination with the other session

A separate session owns **CV-1b** (day‑2 parser deploy, backfill, monitoring) and edits
`PLAN-PHILIPS-CV-INSIGHTS.md` §7. To avoid conflicts:
- **Write only** `PLAN-PHILIPS-CV-INSIGHTS-CODES.md` and `~/philips_cv_evidence/cv2a/`.
- Don't edit `PLAN-PHILIPS-CV-INSIGHTS.md`. If it needs a change, put the proposed text at the end of
  the codes file under "For the main plan".
- Don't touch `jobs/`, `parse/`, `tooling/`, `util/`, the collector repo, or prod.

## Rules (the user's standing rules; follow them exactly)

- **Read-only:** no writes to the prod DB, Redis, `/home/prod` or collector folders. **Never read
  `.env`.** No connections to scanners.
- **DB reads:** only through `node ~/philips_cv_evidence/scripts/q.js <file.sql> [--timeout ms]`.
  It refuses to run unless the session is read-only. Python runs with `python3 -I`.
- **Ask before every commit.** Push or promote only when the user asks.
- **Never run jobs for real locally:** the local `.env` points at the prod DB.
- Raw device data stays out of the repo. Fixtures are masked (`SME00001…`). Use lower-case folder
  names.
- Node 16. Tests use `node --test` (no jest).
- **Reviews:** Codex reviews through `REVIEW-*-HANDOFF.md` → `REVIEW-*-CODEX.md`. Close a review once
  findings converge. No confirmation-only rounds. Prefer the simpler design.
- **Answers:** short and didactic. Commands with where to run them. Tables for status.

## Not this session's work

- CV-1b: day 2, backfill, the 5 clean days, the `2026_12` partition check.
- PCT-1b monitoring ("check PCT-1b").
- The avanteconnected.com PHI check (the user's).
