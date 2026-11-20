# Philips CT: codes, templates and agreed mapping (PCT-2a, 2026-11-20)

Companion to `PLAN-PHILIPS-CT-INSIGHTS.md` §7 (PCT-2a). **The mapping was AGREED on 2026-11-20 (plan §7.7 Q13–Q18); nothing here is built yet.** Generated read-only:
- **DB:** `log.philips_ct_eal_events`, captures 2026-05-01 → 2026-11-02, the only 3 systems with rows (SME20598, SME18534, SME18535), **deduped on the natural key plus content** (plan §5 Q6): 6,466,092 uncoded EAL rows, 52,747 coded EAL rows, 1,182,407 Events rows and 3,911,351 Events relay rows.
- **MDB:** every row of the 5 `Logger.mdb` snapshots (SME20598, SME18534, SME18535 from 2026-10/11; SME17372, SME18976 from 2025-10): 77,264 EAL, 24,950 Events and 77,264 relay rows. This is the only complete Events data (nothing lost to I1 / I2), with `Msg` whole as PCT-1b will store it.
- Evidence, SQL, the draft classifier (`mapping.js`, which becomes `insight/philips_ct/rules.js` once agreed) and this generator: `~/philips_ct_evidence/pct2a/`.

**How rows are classified** (`mapping.js`, first match wins):
- **Coded EAL rows** (`err_number` set) by the code. Every one emits `pct.error` (dim = code); a code in a named metric emits that fact too; a row with `ERR_TYPE = ESTOP` also emits `pct.estop`.
- **Uncoded EAL rows** (`Info`) and **Events rows** (`Msg`) by ordered regex rules on the raw text. Rows in reliability / hardware / service without a named metric emit `pct.event` (dim = rule id). Utilization, inventory, telemetry, noise and trace rows emit only their named facts (watch-list and trace rows: none).
- **Relay rows** (Events `EAL = 'Yes'`, one per EAL row, same key; plan §3.1) are ignored: the EAL row is counted.
- **The tail** (no rule) emits `pct.event` with dim = `tail:<kind>:<masked template>` (plan §5 Q9).

**Checks:**
- Raw text and masked template classify the same way: 116,493 raw DB rows (1% sample), 0 differences; 179,478 MDB rows, 0 differences.
- Every one of the 123 codes has a reviewed rule; every rule matches at least one row.
- Coverage: rules match 99.97% of uncoded EAL rows and 100.00% of Events rows (DB); on the complete MDB rows, 99.99% of uncoded EAL and 99.99% of Events rows.

**Masking:** `0x…` → `0x<hex>`, every digit run → `#`, first 120 characters. No host names, IPs, MACs or serials occur in these templates (checked). Labels are internal wording from the data or from `kdb.philips_ct` (Avante's knowledge base), not a decoding.

**Columns:** *Rows* = deduped DB rows. *Sys* = systems with the code or template (of 3). *Sys-days* = distinct (system, device day). *MDB rows* = rows in the 5 complete snapshots. Days are device wall-clock days.

## 1. v1 metrics (plan §5 Q10, §7.7 Q13) and what feeds them

| Metric | Category | Source | Dim | DB rows | MDB rows | Notes |
|---|---|---|---|---|---|---|
| `pct.shot` | utilization | EAL `Gen Shot<kV>x<mA><spot><mode>*` | `<kV>/<spot>/<mode>`, e.g. `120/L/O` | 59,729 | 705 | one per exposure; kV 80/100/120/140, spot L/S, mode O / - / Z / D (meaning of the mode letter: field service). Busy hours = shots by device hour (derive) |
| `pct.xray_ms` | utilization | EAL `GXray EXP=<ms>` | '' | 59,693 | 705 | value = exposure ms; 99.8% follow their `Gen Shot` within 2 lines (plan §7.1) |
| `pct.error` | by code | every coded EAL row | the code | 52,747 | 274 | 123 codes, all reviewed (§3) |
| `pct.estop` | reliability | EAL `HSS Off!ESTOPdetect`; Events `GantryEstopOpenedBkst… in <state>`; coded rows with `ERR_TYPE = ESTOP` | `loop_open`, `opened:<state>`, `system:<code>` | 141 | 2 | counted as episodes (10 min) in derive. Not the start-up E-stop lines (plan §7.2) |
| `pct.slipring_comm` | hardware | 4 codes (§3) | `rcom_slipring`, `dpu_rcom`, `optical_slipring`, `no_frames` | 7,510 | — | |
| `pct.couch_fault` | hardware | 21 codes (§3) | e.g. `vertical_hw`, `encoder`, `position`, `stop_timeout` | 711 | — | limits, tape switch and jogging are operator actions (noise), not faults |
| `pct.inventory` | inventory | EAL `Gen Idle: Gen= Tube= Gan=`, `EE Version`, `GenVersion`, `DMC System Version`, `Rhost Rev`, `CtrlDrvSK::… Version`; Events `GLC Version::`, `System registry: … Tube Type:` | `<key>=<value>`: `tube_type`, `gantry`, `generator`, `glc`, `ee`, `gen_fw`, `dmc`, `rhost_rev`, `sk_*` | 58,370 | 1,357 | derive keeps the latest value per key and day; a change is the "software or tube changed" signal |
| `pct.event` | reliability / hardware / service | uncoded rows of those categories without a named metric (§4, §5), and the tail (§7) | rule id, or `tail:…` | 2,040 | 128 | |

## 2. Watch list (not in v1; plan §5 Q10, §6 PCT-3)

| Candidate | Source (rule) | DB rows | MDB rows | Why not v1 / what it needs |
|---|---|---|---|---|
| `pct.study` | Events `STUDY_STARTED was sent to GPC` (`ev_study_started`) | 9,920 | 109 | Events only, so history is short by about half (I1); from PCT-1b on. On complete data it brackets studies exactly (plan §7.3) |
| `pct.series_cancel` | Events `Series # cancelled, due to GANTRY_CANCEL_SOURCE_<CTBOX\|HOST\|…>` (`ev_series_cancel_*`) | 0 | 43 | the operator / system abort split GE has. every one has a comma, so the collector drops it (I2): **0 in the DB**; from PCT-C + PCT-1b on (plan §7.4) |
| `pct.shot_not_ok` | Events `GantryShotEndAns status != ok` (`ev_shot_end_not_ok`, now `pct.event`) | 0 | 53 | same: comma lines, MDB only |
| `pct.mas` | `Gen Shot` mA × `GXray EXP` ms / 1000 | — | — | arithmetic is easy (plan §7.1); whether it is the tube's mA·s per exposure is a field-service question (plan §5 Q12) |
| `pct.power_up` | EAL `Ctrl Powered Up. Serial Connection OK.` (`powered_up`, now `pct.event`) | 220 | 2 | one per gantry power-up (plan §7.2); field service to confirm it is the boot |
| `pct.host_start` | Events `GSE Begins` (`ev_gse_begins`, now `pct.event`) | 163 | 7 | host gantry-service starts; Events only |
| `pct.warmup` | Events `TubeWarmupNeededBkst` / `No TubeWarmupNeeded` (`ev_warmup`) | 138 | 2 | Events only |
| `pct.diag_mode` | Events `GantryAppDiagModeAns` (`ev_diag_mode`, now `pct.event`) | 531 | 15 | service / diagnostics mode; meaning to confirm |
| `pct.rotor_*` | EAL `Rotor stopped and MDC closed`; rotor and main-drive codes (§3) | 14,565 | 143 | codes are in `pct.error` already; a rotor metric needs field service |
| `pct.env_*` | EAL telemetry rules (`tlm_*`: pump / heat-exchanger temperatures, flow switch, DC rail, filament, mA error, tube heat) | 1,039,455 | 15,589 | numbers parse; meanings are field-service questions (plan §5 Q12) |

## 3. EAL error codes: all 123 (`pct.error`, dim = code)

52,747 rows. Category is the reviewed grouping for the viewer and findings; every code counts in `pct.error`. *ERR_TYPE* lists the types seen (a code can log under more than one). *kdb*: `kdb.philips_ct` label (first 70 characters), — = no entry.

| # | Code | ERR_TYPE | Category | Also | Rows | 20598 | 18534 | 18535 | Sys | Sys-days | First | Last | kdb |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `S_FDOM_PROFILE_FRAME_ISR_TBL_END_DEFAULT_MA_USED` | WARN | reliability |  | 14,623 | 14,623 | 0 | 0 | 1 | 132 | 2026/04/30 | 2026/11/02 | — |
| 2 | `S_DMC_I2C_COMM2HEATERNOT_OK` | WARN | hardware |  | 12,695 | 83 | 12,594 | 18 | 3 | 89 | 2026/04/30 | 2026/10/28 | — |
| 3 | `S_DMC_DPU_RCOM_COMMUNICATION` | WARN | hardware | `pct.slipring_comm:dpu_rcom` | 3,656 | 0 | 3,656 | 0 | 1 | 112 | 2026/04/30 | 2026/10/30 | DPU to RCOM data communication error. |
| 4 | `S_DMC_RCOM_COMMUNICATION` | WARN | hardware | `pct.slipring_comm:rcom_slipring` | 3,443 | 28 | 3,415 | 0 | 2 | 146 | 2026/05/01 | 2026/10/30 | RCOM to Slip Rings communication error. Check Parameter 1 & 2 to find… |
| 5 | `S_MASTER_SEQUENCER_SERIES_DELAY_LESS_THAN_MIN` | WARN | noise |  | 2,592 | 1,291 | 1,229 | 72 | 3 | 294 | 2026/04/30 | 2026/11/02 | Actual time between scans is more than delay set by Host. |
| 6 | `S_HMC_AXIS_AT_POSITIVE_LIMIT` | WARN | noise |  | 2,477 | 1,310 | 1,163 | 4 | 3 | 255 | 2026/04/30 | 2026/11/02 | Couch is at horizontal outer limit. |
| 7 | `S_MPS_WAITING_FOR_MAIN_DRIVE_TO_CLOSE` | WARN | hardware |  | 1,895 | 1,894 | 1 | 0 | 2 | 23 | 2026/05/03 | 2026/11/02 | The AGMP has sent the command to close the MDC and it checks the stat… |
| 8 | `S_GAFSTARTUPTASK_DTH_BAD_PARAM` | WARN | reliability |  | 1,787 | 1,063 | 592 | 132 | 3 | 152 | 2026/04/30 | 2026/11/02 | — |
| 9 | `S_MP_POSLOOP_MAX_MIN_ACCEL_ERROR` | WARN | hardware |  | 1,265 | 1,264 | 0 | 1 | 2 | 5 | 2026/04/30 | 2026/11/02 | — |
| 10 | `S_FDOM_PROFILE_CALC_ERROR_DEFAULT_MA_USED` | WARN | reliability |  | 1,067 | 986 | 0 | 81 | 2 | 166 | 2026/04/30 | 2026/11/02 | — |
| 11 | `S_GENERATOR_MONITOR_GAF_ERROR` | WARN | hardware |  | 1,033 | 504 | 453 | 76 | 3 | 279 | 2026/04/30 | 2026/11/01 | New error !!!!!!! |
| 12 | `S_DTH_USER_ALREADY_REGISTERED` | WARN | reliability |  | 597 | 400 | 155 | 42 | 3 | 137 | 2026/04/30 | 2026/10/30 | A Warning error. Usually a programming error, when more than one atte… |
| 13 | `S_ROTOR_DTH_BAD_PARAM` | WARN | reliability |  | 437 | 257 | 148 | 32 | 3 | 152 | 2026/04/30 | 2026/11/02 | Bad or NO Rotor Manager configuration parameter, or version. Illegal … |
| 14 | `S_RMC_DTH_BAD_PARAM` | WARN | reliability |  | 437 | 257 | 148 | 32 | 3 | 152 | 2026/04/30 | 2026/11/02 | Bad Rotor Coordinator parameter, Bad Rotor Coordinator version, NO Ro… |
| 15 | `S_RMC_MP_DTH_BAD_PARAM` | WARN | reliability |  | 437 | 257 | 148 | 32 | 3 | 152 | 2026/04/30 | 2026/11/02 | Bad Rotor Coordinator parameter, Bad Rotor Coordinator version, NO Ro… |
| 16 | `S_GEN_MGR_SYNC_OFF_OUT_OF_SEQUENCE` | WARN | noise |  | 347 | 293 | 31 | 23 | 3 | 145 | 2026/05/01 | 2026/11/02 | Normal error. Indicates that the sync signal was received before expe… |
| 17 | `S_DMC_SLIP_RING` | WARN | hardware | `pct.slipring_comm:optical_slipring` | 288 | 0 | 0 | 288 | 1 | 46 | 2026/04/30 | 2026/10/30 | Optical slip ring signal error. |
| 18 | `S_MC_DEVICE_COUCH_VERTICAL_HW_FAULT` | WARN, NORMAL | hardware | `pct.couch_fault:vertical_hw` | 282 | 176 | 82 | 24 | 3 | 112 | 2026/05/01 | 2026/10/30 | Table moves in small steps... |
| 19 | `S_MPROC_DEVICE_NO_DATA_FROM_GMP_SERIAL` | WARN | hardware |  | 250 | 250 | 0 | 0 | 1 | 2 | 2026/06/13 | 2026/10/08 | — |
| 20 | `S_TILT_D_DEVICE_READ_ERROR` | WARN | hardware |  | 201 | 201 | 0 | 0 | 1 | 1 | 2026/10/08 | 2026/10/08 | — |
| 21 | `S_MPS_MAIN_DRIVE_NOT_CLOSING` | NORMAL | hardware |  | 200 | 200 | 0 | 0 | 1 | 5 | 2026/06/13 | 2026/11/02 | Main drive contactor (MDK) is not closing |
| 22 | `S_MP_CTRL_DRIVER_SB_FAULT_RESET_ERROR` | WARN | hardware |  | 200 | 69 | 131 | 0 | 2 | 148 | 2026/05/01 | 2026/11/02 | The driver checks to see if the controller received a fault and was r… |
| 23 | `S_COLLECT_LOGS_BUSY` | WARN | service |  | 196 | 52 | 130 | 14 | 3 | 156 | 2026/04/30 | 2026/11/02 | — |
| 24 | `S_MC_DEVICE_ELAPSED_TIMER_ZERO_FAIL` | WARN | noise |  | 162 | 115 | 31 | 16 | 3 | 117 | 2026/05/01 | 2026/11/01 | This warning error is mainly seen during CStateSeriesNotLoaded after … |
| 25 | `S_HMC_TAPE_SWITCH_PRESSED` | NORMAL | noise |  | 151 | 151 | 0 | 0 | 1 | 76 | 2026/05/02 | 2026/11/02 | Vertical tape switch is pressed. |
| 26 | `33816580` | WARN | reliability |  | 148 | 0 | 148 | 0 | 1 | 111 | 2026/05/01 | 2026/10/30 | — |
| 27 | `S_DMC_SHOT_COMM_COLLAPSE` | NORMAL | hardware | `pct.slipring_comm:no_frames` | 123 | 4 | 118 | 1 | 3 | 60 | 2026/04/30 | 2026/10/30 | no frames were generated by DMS during scan.Watch for more occurances… |
| 28 | `S_MC_DEVICE_PS_FAILURE` | WARN | hardware | `pct.couch_fault:power_supply` | 120 | 117 | 3 | 0 | 2 | 15 | 2026/06/01 | 2026/10/17 | This warning is sent the first time motion is commanded after the sys… |
| 29 | `S_COLLISION_WAITING_FOR_ACS_TO_INIT` | WARN | hardware |  | 116 | 98 | 9 | 9 | 3 | 20 | 2026/04/30 | 2026/10/17 | Collision information could not be provided from the ACS. In V3.5 thi… |
| 30 | `S_COMMAND_INVALID_CHECKSUM_ERROR` | WARN | hardware |  | 110 | 60 | 43 | 7 | 3 | 71 | 2026/04/30 | 2026/10/31 | Command error from Panel/CT-Box. |
| 31 | `S_MASTER_SEQUENCER_COUCH_UNCOMMANDED_MOTION` | NORMAL | noise |  | 100 | 95 | 5 | 0 | 2 | 69 | 2026/04/30 | 2026/10/30 | Tape switch was pressed during shot/preshot sequencing, causing the c… |
| 32 | `S_MANMOT_VERTICAL_STOP_ERROR` | NORMAL | hardware | `pct.couch_fault:stop_timeout` | 87 | 87 | 0 | 0 | 1 | 54 | 2026/05/04 | 2026/10/29 | Couch system did not stop motion and respond to command within 5 seco… |
| 33 | `S_COMMAND_INVALID_FORMAT_ERROR` | WARN | hardware |  | 79 | 37 | 41 | 1 | 3 | 58 | 2026/05/04 | 2026/10/31 | Invalid command format to/from Panel/CT-Box. |
| 34 | `S_RTDH_HC_TIMEOUT_ERROR` | WARN | reliability |  | 78 | 78 | 0 | 0 | 1 | 4 | 2026/06/14 | 2026/11/02 | Error waiting for Heat Calculator to respond to request. |
| 35 | `S_TILT_C_MANUAL_TILT_OFF` | WARN | noise |  | 71 | 59 | 12 | 0 | 2 | 20 | 2026/05/04 | 2026/10/31 | A Manual Tilt positioning was sent and the MANUAL_TILT_ENA signal is … |
| 36 | `S_HMC_COUCH_24V_IS_OFF` | NORMAL | service |  | 67 | 63 | 3 | 1 | 3 | 12 | 2026/05/20 | 2026/10/12 | Couch 24 volt power supply is off. Can occur when the gantry drives b… |
| 37 | `S_HMC_COUCH_24V_IS_ON` | WARN | service |  | 66 | 22 | 41 | 3 | 3 | 55 | 2026/04/30 | 2026/10/30 | Couch 24 volt power supply is on |
| 38 | `S_RMC_ERROR_MCO` | WARN, NORMAL | hardware |  | 55 | 48 | 5 | 2 | 3 | 12 | 2026/05/20 | 2026/10/12 | The Main Drive (MDK) Contactor is Open.Can occur when the gantry driv… |
| 39 | `S_TILT_C_AUTO_TILT_OFF` | WARN | noise |  | 44 | 40 | 4 | 0 | 2 | 11 | 2026/05/11 | 2026/10/27 | An Auto Tilt positioning was sent and the AUTO_TILT_ENA signal is OFF. |
| 40 | `S_COMMAND_INVALID_COMMAND_BYTE_ERROR` | WARN | hardware |  | 43 | 40 | 3 | 0 | 2 | 23 | 2026/05/12 | 2026/10/17 | Invalid Command to/from Panel/CT-Box. |
| 41 | `S_RHOST_PLD_READ_ERROR` | WARN | hardware |  | 42 | 23 | 19 | 0 | 2 | 20 | 2026/05/19 | 2026/11/02 | — |
| 42 | `S_MC_DEVICE_DEFAULT_ERROR` | WARN | hardware | `pct.couch_fault:control_board` | 41 | 35 | 3 | 3 | 3 | 20 | 2026/04/30 | 2026/10/17 | Couch motion control device error .This error indicates that the couc… |
| 43 | `S_MASTER_SEQUENCER_COUCH_ESTOP_NOT_CLOSED` | NORMAL | hardware | `pct.couch_fault:estop_relay` | 40 | 38 | 2 | 0 | 2 | 12 | 2026/06/04 | 2026/10/17 | Estop relay could not be closed on the board. |
| 44 | `S_TILT_D_DEVICE_SERIAL_READ_FAILURE` | WARN | hardware |  | 39 | 39 | 0 | 0 | 1 | 1 | 2026/10/08 | 2026/10/08 | Problem with VxWorks read() function. The memory is bad, or the seria… |
| 45 | `S_GENERATOR_MONITOR_MA_BALANCE_ERROR` | WARN | hardware |  | 37 | 36 | 0 | 1 | 2 | 33 | 2026/05/01 | 2026/10/28 | The difference between cathode mA and anode mA is more than allowed |
| 46 | `S_EALGH_GETLOGS_REPORT_TIMEOUT_WARN` | WARN | service |  | 28 | 25 | 0 | 3 | 2 | 10 | 2026/05/17 | 2026/11/02 | Warn Error: EAL could not get logs from all boards. This error is mos… |
| 47 | `S_VMC_AXIS_MOVE_UP_WHEN_DOWN_COMMANDED` | WARN | hardware | `pct.couch_fault:vertical_direction` | 26 | 16 | 10 | 0 | 2 | 19 | 2026/05/04 | 2026/10/30 | — |
| 48 | `S_HMC_AXIS_WRONG_DEST_REACHED` | WARN, NORMAL | hardware | `pct.couch_fault:position` | 25 | 18 | 7 | 0 | 2 | 11 | 2026/05/05 | 2026/10/09 | Couch did not stop at requested position. |
| 49 | `S_COUCHMGR_DOWN_LIMIT` | WARN | noise |  | 23 | 18 | 5 | 0 | 2 | 15 | 2026/05/01 | 2026/11/01 | — |
| 50 | `S_MPROC_DEVICE_GMP_MESSAGE_HEADER_TOO_LONG` | WARN | hardware |  | 20 | 20 | 0 | 0 | 1 | 1 | 2026/10/08 | 2026/10/08 | — |
| 51 | `S_MPROC_DEVICE_MESSAGE_INCOMPLETE` | WARN | hardware |  | 20 | 18 | 2 | 0 | 2 | 6 | 2026/05/22 | 2026/10/21 | A Timeout occurred and the Ghost did not receive the whole serial res… |
| 52 | `S_MP_CTRL_DRIVER_SB_FAULT_DC_LINK_UNDERVOLTAGE` | WARN | hardware |  | 19 | 16 | 3 | 0 | 2 | 8 | 2026/05/20 | 2026/10/12 | Spindle block undervoltage. |
| 53 | `S_VMC_AXIS_AT_POSITIVE_LIMIT` | WARN | noise |  | 19 | 19 | 0 | 0 | 1 | 2 | 2026/10/07 | 2026/10/08 | Couch is at vertical upper limit. |
| 54 | `S_HMC_HOR_MOTOR_RELAY_OPEN` | NORMAL | hardware | `pct.couch_fault:horizontal_relay` | 19 | 6 | 10 | 3 | 3 | 6 | 2026/06/13 | 2026/10/12 | This error indicates that the CT(Couch Top) Horizontal Relay (K103) l… |
| 55 | `S_DTH_SHOT_COUCH_POSITION` | NORMAL | reliability |  | 18 | 0 | 18 | 0 | 1 | 17 | 2026/05/21 | 2026/10/23 | This identifies a series parameter that is in error (value or data-ty… |
| 56 | `2` | WARN | reliability |  | 17 | 14 | 1 | 2 | 3 | 7 | 2026/06/18 | 2026/10/08 | — |
| 57 | `S_COUCHMGR_HOR_STOP_POSITION_ERROR` | NORMAL | hardware | `pct.couch_fault:position` | 16 | 15 | 1 | 0 | 2 | 14 | 2026/05/15 | 2026/11/01 | Couch did not reach specified target position. Parameter 1: Actual ho… |
| 58 | `S_TILT_D_DEVICE_TIMER_KO` | WARN | hardware |  | 16 | 13 | 1 | 2 | 3 | 16 | 2026/05/18 | 2026/11/02 | Timer Error. |
| 59 | `S_MASTER_SEQUENCER_GDC_LOW_AFTER_TIMEOUT` | NORMAL | hardware |  | 14 | 13 | 1 | 0 | 2 | 3 | 2026/06/18 | 2026/10/08 | Rail voltage did not go up to at least 500V DC after the soft start c… |
| 60 | `S_CTBOX_UNINITIATED_RESET` | NORMAL | reliability |  | 13 | 10 | 3 | 0 | 2 | 8 | 2026/05/10 | 2026/11/02 | Software encountered a reset it didn't initiate. |
| 61 | `S_MANMOT_HORIZONTAL_START_ERROR` | NORMAL | hardware | `pct.couch_fault:start_fail` | 12 | 12 | 0 | 0 | 1 | 5 | 2026/05/08 | 2026/10/12 | Could not start .5mm horizontal motion. |
| 62 | `S_MASTER_SEQUENCER_HORZ_COUCH_POS_ERR` | WARN, NORMAL | hardware | `pct.couch_fault:position` | 12 | 12 | 0 | 0 | 1 | 6 | 2026/05/07 | 2026/10/23 | — |
| 63 | `S_ROTOR_MCO` | NORMAL | hardware |  | 11 | 10 | 1 | 0 | 2 | 4 | 2026/06/13 | 2026/10/12 | The Main Contactor is Open. Can occur when the gantry drives bypass s… |
| 64 | `S_TILT_C_NO_MOVE` | WARN, ESTOP | hardware | `pct.estop:system` | 10 | 8 | 2 | 0 | 2 | 2 | 2026/05/20 | 2026/10/12 | A move request is issued but the Tilt is not moving. |
| 65 | `S_MASTER_SEQUENCER_SERIESID_NOT_EXIST` | WARN | reliability |  | 9 | 0 | 9 | 0 | 1 | 7 | 2026/06/01 | 2026/10/21 | — |
| 66 | `S_MP_MPSHELL_SERIAL_LIFE_SYNC_ERROR` | NORMAL | reliability |  | 8 | 7 | 0 | 1 | 2 | 8 | 2026/05/12 | 2026/10/12 | MP Latest Fatal Error Data |
| 67 | `S_MP_CTRL_INDEXPULSE_UNREAL_OVERSPEED_ERROR` | WARN | hardware |  | 8 | 8 | 0 | 0 | 1 | 2 | 2026/06/14 | 2026/07/12 | IndexPulse Unreal OverSpeed.     Speed measured from the Index Pulse … |
| 68 | `S_HMC_AXIS_JOG_FAIL` | WARN | hardware | `pct.couch_fault:start_fail` | 7 | 6 | 0 | 1 | 2 | 7 | 2026/05/14 | 2026/10/09 | Command to start horizontal jog failed. |
| 69 | `S_SERIALCOM_CHECKSUM_ERROR` | WARN | hardware |  | 7 | 7 | 0 | 0 | 1 | 4 | 2026/08/08 | 2026/11/01 | Command error from Panel/CT-Box. |
| 70 | `S_DTH_PREPX_PREP_COUCH_POSITION` | NORMAL | reliability |  | 7 | 0 | 7 | 0 | 1 | 5 | 2026/06/04 | 2026/10/29 | This identifies a series parameter that is in error (value or data-ty… |
| 71 | `S_MC_DEVICE_IN_SOFT_LIMIT_ON` | NORMAL | reliability |  | 6 | 6 | 0 | 0 | 1 | 1 | 2026/08/13 | 2026/08/13 | — |
| 72 | `S_HMC_AXIS_AT_NEGATIVE_LIMIT` | WARN | noise |  | 6 | 4 | 1 | 1 | 3 | 4 | 2026/05/15 | 2026/09/09 | Couch is at horizontal inner limit. |
| 73 | `S_LIFESYNCMGRTASK_LIFESYNC_FAIL` | ESTOP | reliability | `pct.estop:system` | 6 | 5 | 0 | 1 | 2 | 5 | 2026/05/22 | 2026/11/02 | Ghost error when one or more of the controllers STOPs responding to L… |
| 74 | `S_COMMAND_BUTTON_STUCK_ERROR` | WARN | hardware |  | 6 | 6 | 0 | 0 | 1 | 1 | 2026/07/18 | 2026/07/18 | — |
| 75 | `S_MPLTRANSPORTTXT_COMM_ERROR` | WARN | noise |  | 6 | 4 | 2 | 0 | 2 | 4 | 2026/05/20 | 2026/10/29 | Normal error. Failed getting semaphore to send a CAN message. |
| 76 | `S_COUCHMGR_MOTION_START_ERROR` | NORMAL | hardware | `pct.couch_fault:start_fail` | 5 | 4 | 1 | 0 | 2 | 5 | 2026/05/09 | 2026/10/25 | Motion did not start in specified time. |
| 77 | `S_HMC_VELOCITY_ENCODER_FAILURE` | NORMAL | hardware | `pct.couch_fault:encoder` | 5 | 0 | 5 | 0 | 1 | 4 | 2026/05/19 | 2026/10/16 | The Velocity encoder did not increment in the same value as the relat… |
| 78 | `S_ROTOR_STOP_ANODE_NO_MORE_SPINNING` | WARN | hardware |  | 5 | 2 | 2 | 1 | 3 | 5 | 2026/04/30 | 2026/11/02 | The Rotor send this message when it has stopped because the Anode is … |
| 79 | `S_MP_CTRL_ANALOG_OUTPUT_OUT_OF_THRESH` | WARN | noise |  | 5 | 4 | 0 | 1 | 2 | 5 | 2026/04/30 | 2026/10/12 | This error is mostly seen after the e-stop open and close CStateConfi… |
| 80 | `S_HMC_AXIS_DEST_COLLISION` | NORMAL | noise |  | 5 | 5 | 0 | 0 | 1 | 3 | 2026/07/09 | 2026/10/15 | Destination will be in collision. |
| 81 | `S_GAFPROCESS_MACHINE_CHECK_EXCEPTION` | FATAL | reliability |  | 4 | 4 | 0 | 0 | 1 | 4 | 2026/05/17 | 2026/07/07 | VxWorks exception - Machine check - unhandled exception. Software is … |
| 82 | `S_MP_CTRL_RECOVERY_ENTRY` | NORMAL | hardware |  | 4 | 3 | 0 | 1 | 2 | 4 | 2026/05/24 | 2026/10/12 | Internal SB error. |
| 83 | `S_VMC_TAPE_SWITCH_AT_INIT` | ESTOP | hardware | `pct.estop:system` | 4 | 0 | 0 | 4 | 1 | 1 | 2026/09/18 | 2026/09/18 | Found shorted Tape switch in the couch top. Jumpering E stop of the t… |
| 84 | `S_MC_DEVICE_ESTOP_IS_OPEN` | NORMAL | noise |  | 4 | 2 | 0 | 2 | 2 | 4 | 2026/04/30 | 2026/10/12 | Estop loop is open when requesting command. It may be normal for this… |
| 85 | `S_RHOST_HVG_HSS_GENERATOR_NON_ARC_FAULT` | NORMAL | hardware |  | 4 | 4 | 0 | 0 | 1 | 4 | 2026/05/07 | 2026/11/02 | Generator non arc error |
| 86 | `S_SERIALCOM_INVALID_FORMAT_ERROR` | WARN | hardware |  | 4 | 4 | 0 | 0 | 1 | 1 | 2026/10/12 | 2026/10/12 | Invalid command format to/from Panel/CT-Box. |
| 87 | `S_MASTER_SEQUENCER_VERT_COUCH_POS_ERR` | NORMAL, WARN | hardware | `pct.couch_fault:position` | 4 | 4 | 0 | 0 | 1 | 2 | 2026/05/12 | 2026/08/08 | — |
| 88 | `S_MP_CTRL_NO_MORE_AT_SPEED` | NORMAL | hardware |  | 3 | 1 | 2 | 0 | 2 | 3 | 2026/05/20 | 2026/10/12 | The Rotor did not arrive to the desired speed. |
| 89 | `S_MASTER_SEQUENCER_ACQ_NOT_OK` | NORMAL | reliability |  | 3 | 1 | 2 | 0 | 2 | 3 | 2026/05/23 | 2026/10/06 | Recon removed ACQ_OK signal to stop the scan. There are too many reas… |
| 90 | `S_MANMOT_HORIZONTAL_STOP_ERROR` | NORMAL | hardware | `pct.couch_fault:stop_timeout` | 3 | 2 | 0 | 1 | 2 | 3 | 2026/05/22 | 2026/10/25 | Couch system did not stop motion and respond to command within 5 seco… |
| 91 | `S_COUCHMGR_HOR_MOTION_STOP_ERROR` | ESTOP | hardware | `pct.couch_fault:stop_timeout`, `pct.estop:system` | 3 | 1 | 2 | 0 | 2 | 3 | 2026/07/27 | 2026/10/25 | Horizontal motion did not stop in specified time. |
| 92 | `S_TIMER_WATCHDOG_CAUSED_LAST_RESET` | NORMAL | reliability |  | 3 | 3 | 0 | 0 | 1 | 2 | 2026/05/12 | 2026/10/12 | The Last Reset of the CPM was due to the WatchDog. The Watchdog was n… |
| 93 | `S_RMC_INVALID_POSITION` | WARN | hardware |  | 2 | 2 | 0 | 0 | 1 | 1 | 2026/10/08 | 2026/10/08 | A Control Link Error or an RTD error Occurred. Loss of position. |
| 94 | `S_GEN_MGR_MA_OUT_OF_RANGE` | NORMAL | hardware |  | 2 | 2 | 0 | 0 | 1 | 2 | 2026/05/07 | 2026/06/14 | The tube MA was out of the acceptable range.     Param1 is cathode mA… |
| 95 | `S_MP_CTRL_DRIVER_SK_FAULT_LOSS_SERIAL_LINK` | WARN | hardware |  | 2 | 0 | 0 | 2 | 1 | 1 | 2026/10/01 | 2026/10/01 | Error sent by the CSK when its watchdog is not serviced on time.     … |
| 96 | `S_HMC_COUCH_IS_JOGGING` | NORMAL | noise |  | 2 | 2 | 0 | 0 | 1 | 1 | 2026/10/12 | 2026/10/12 | Couch movement during scan preparation. One has moved the Couch durin… |
| 97 | `S_DMC_UHR_COMB_TMOT` | WARN | hardware |  | 2 | 0 | 2 | 0 | 1 | 2 | 2026/06/03 | 2026/07/06 | — |
| 98 | `S_MPLTRANSPORTREC_PACKET_COUNT_ERROR` | NORMAL | noise |  | 2 | 2 | 0 | 0 | 1 | 2 | 2026/06/19 | 2026/08/03 | Normal error. Usually encountered by the controllers other than the o… |
| 99 | `S_HMC_AXIS_AT_COLLISION` | NORMAL | noise |  | 2 | 2 | 0 | 0 | 1 | 1 | 2026/05/09 | 2026/05/09 | Couch is currently in collision state. |
| 100 | `S_MP_CTRL_IN_POS_RECOVERY_OUT_OF_POSITION_ERROR` | NORMAL | hardware |  | 2 | 2 | 0 | 0 | 1 | 1 | 2026/10/12 | 2026/10/12 | This error occurs when the rotor was already in position, then went o… |
| 101 | `S_GEN_FAULT_APM_480_LINE_PHASES_MISSING` | WARN | hardware |  | 2 | 2 | 0 | 0 | 1 | 2 | 2026/07/30 | 2026/11/02 | — |
| 102 | `S_TILT_C_TO_BAD_SERIAL` | ESTOP, WARN | hardware | `pct.estop:system` | 2 | 2 | 0 | 0 | 1 | 1 | 2026/10/08 | 2026/10/08 | This error indicates that the serial communication between GHOST and … |
| 103 | `S_COUCHMGR_MOTION_TIMEOUT_ERROR` | NORMAL | hardware | `pct.couch_fault:stop_timeout` | 1 | 1 | 0 | 0 | 1 | 1 | 2026/05/08 | 2026/05/08 | Motion did not start or stop in specified time. |
| 104 | `S_CONT_AXIS_OVERWRITE_TARGET` | NORMAL | noise |  | 1 | 1 | 0 | 0 | 1 | 1 | 2026/11/02 | 2026/11/02 | A stop, jog or position command was issued while the Rotor had not fi… |
| 105 | `S_CTRL_LINK_GHOST_GOT_CRC_FRAMING_ERROR` | NORMAL | hardware |  | 1 | 1 | 0 | 0 | 1 | 1 | 2026/10/08 | 2026/10/08 | Frame data was not received/send correctly |
| 106 | `S_STARTER_ERROR_INVALID_HARDWARE_STATUS_WHILE_RUNNING` | NORMAL | hardware |  | 1 | 0 | 1 | 0 | 1 | 1 | 2026/10/14 | 2026/10/14 | — |
| 107 | `S_ROTOR_START_MOTION_TIMEOUT_ERROR` | NORMAL | hardware |  | 1 | 0 | 0 | 1 | 1 | 1 | 2026/09/28 | 2026/09/28 | A Timeout has occurred and the MP was not able to reach position, or … |
| 108 | `S_MC_DEVICE_HW_OVERSPEED` | WARN | hardware | `pct.couch_fault:overspeed` | 1 | 0 | 1 | 0 | 1 | 1 | 2026/07/13 | 2026/07/13 | Horizontal overspeed detected. |
| 109 | `S_STARTER_FAULT_NOT_UP_TO_SPEED` | NORMAL | hardware |  | 1 | 1 | 0 | 0 | 1 | 1 | 2026/08/11 | 2026/08/11 | The starter hardware faulted, giving an error indicating ""anode not … |
| 110 | `S_HMC_MULTIPLE_ENCODER_FAILURES` | NORMAL | hardware | `pct.couch_fault:encoder` | 1 | 0 | 1 | 0 | 1 | 1 | 2026/05/15 | 2026/05/15 | Multiple encoder failures were detected (Absolute, Relative, Velocity… |
| 111 | `S_PANEL_MAX_COMM_ERROR` | NORMAL | hardware |  | 1 | 1 | 0 | 0 | 1 | 1 | 2026/10/12 | 2026/10/12 | Too many communication errors encountered |
| 112 | `S_ROTOR_ANODE_NOT_SPINNING` | NORMAL | hardware |  | 1 | 0 | 1 | 0 | 1 | 1 | 2026/10/14 | 2026/10/14 | The Ghost sends this error to indicate the reason why it could not mo… |
| 113 | `S_GEN_FAULT_ALE_WITHOUT_EXGATE` | WARN | hardware |  | 1 | 1 | 0 | 0 | 1 | 1 | 2026/05/07 | 2026/05/07 | — |
| 114 | `S_GEN_MGR_TIMER_ERROR` | WARN | reliability |  | 1 | 0 | 1 | 0 | 1 | 1 | 2026/05/07 | 2026/05/07 | Normal error. An error occurred when accessing a timer object. |
| 115 | `S_DMC_APDM_LOAD_ERR` | WARN | hardware |  | 1 | 0 | 0 | 1 | 1 | 1 | 2026/09/21 | 2026/09/21 | APDM not initialized. At least one of the APDMs had an error after 20… |
| 116 | `S_GEN_MGR_FILAMENT_TIMEOUT_ERROR` | NORMAL | hardware |  | 1 | 1 | 0 | 0 | 1 | 1 | 2026/10/29 | 2026/10/29 | — |
| 117 | `S_MP_CTRL_DRIVER_SB_TIMEOUT_ANS_WITH_CHARS` | NORMAL | hardware |  | 1 | 1 | 0 | 0 | 1 | 1 | 2026/10/22 | 2026/10/22 | — |
| 118 | `S_GEN_MGR_EXTERNAL_WATCHDOG_TIMEOUT` | NORMAL | reliability |  | 1 | 0 | 0 | 1 | 1 | 1 | 2026/05/22 | 2026/05/22 | This is a Normal error that occurs if during the shot state the watch… |
| 119 | `S_MPL_VX_SEND_ERROR` | FATAL | reliability |  | 1 | 0 | 0 | 1 | 1 | 1 | 2026/05/22 | 2026/05/22 | Fatal error causes a controller reset. vxworks msgq send error. The t… |
| 120 | `S_MPS_MAIN_DRIVE_OPEN_AND_CTRL_ON` | NORMAL | hardware |  | 1 | 0 | 0 | 1 | 1 | 1 | 2026/04/30 | 2026/04/30 | When the AGMP is in Idle Mode with MDC Open, It sends periodically a … |
| 121 | `S_COUCHMGR_UNEXPECTED_EVENT_ERROR` | NORMAL | reliability |  | 1 | 0 | 0 | 1 | 1 | 1 | 2026/05/22 | 2026/05/22 | Motion command received in wrong state. |
| 122 | `S_HMC_AXIS_STOP_REASON_UNKNOWN` | WARN | hardware | `pct.couch_fault:stop_unknown` | 1 | 1 | 0 | 0 | 1 | 1 | 2026/08/13 | 2026/08/13 | Stopped for unknown reason. |
| 123 | `S_HMC_AXIS_UNALLOWED_MOVE` | WARN | noise |  | 1 | 0 | 1 | 0 | 1 | 1 | 2026/10/05 | 2026/10/05 | Attempted to make too large a horizontal move. ???? |

By category: reliability 24 codes / 19,709 rows; hardware 75 codes / 26,661 rows; service 4 codes / 357 rows; noise 20 codes / 6,020 rows.

## 4. Uncoded EAL rows (`Info`): rules

| Rule | Category | Facts | Templates | DB rows | Share | Sys | MDB rows | Top template (share of the rule's rows) |
|---|---|---|---|---|---|---|---|---|
| `shot` | utilization | `pct.shot` | 7 | 59,729 | 0.92% | 3 | 705 | Gen Shot#x#LO* (74%) |
| `xray_ms` | utilization | `pct.xray_ms` | 1 | 59,693 | 0.92% | 3 | 705 | GXray EXP=# (100%) |
| `study_ready` | utilization |  | 2 | 35,590 | 0.55% | 3 | 385 | StudyReady IX:# ID:# CT:# (100%) |
| `study_ready_ekg` | trace |  | 1 | 35,535 | 0.55% | 3 | 381 | StudyReady EKG TRG not needed #:# (100%) |
| `rotor_stopped` | utilization |  | 1 | 14,565 | 0.23% | 3 | 143 | Rotor stopped and MDC closed (100%) |
| `series_skip` | utilization |  | 2 | 1,472 | 0.02% | 3 | 11 | ARMED received GANTRY_SERIES_SKIP_REQ** (95%) |
| `gen_idle` | inventory | `pct.inventory` | 2 | 45,722 | 0.71% | 2 | 502 | Gen Idle: Gen=#x<hex> Tube=# Gan=BRILL (92%) |
| `ee_version` | inventory | `pct.inventory` | 1 | 198 | 0.00% | 2 | 2 | EE Version: #LEBLOK (100%) |
| `gen_version` | inventory | `pct.inventory` | 1 | 44 | 0.00% | 3 | 1 | GenVersion: #x<hex> Access:# # (100%) |
| `rhost_rev` | inventory | `pct.inventory` | 1 | 207 | 0.00% | 3 | 2 | Rhost Rev #** (100%) |
| `dmc_version` | inventory | `pct.inventory` | 1 | 42 | 0.00% | 3 | 0 | DMC System Version = ORIONT (100%) |
| `sk_version` | inventory | `pct.inventory` | 3 | 51 | 0.00% | 1 | 0 | CtrlDrvSK::Configuration Version:#; (33%) |
| `estop_loop_open` | reliability | `pct.estop` | 1 | 53 | 0.00% | 3 | 1 | HSS Off!ESTOPdetect (100%) |
| `powered_up` | reliability | `pct.event` | 1 | 220 | 0.00% | 3 | 2 | Ctrl Powered Up. Serial Connection OK. (100%) |
| `powerup_estop_state` | reliability |  | 3 | 844 | 0.01% | 3 | 7 | HSS-ESTOP state (59%) |
| `gpc_startup` | reliability |  | 1 | 153 | 0.00% | 3 | 1 | gpcStartup: #* (100%) |
| `gen_reset` | trace |  | 4 | 749 | 0.01% | 3 | 11 | ResetGenSM(#) (36%) |
| `gen_shutdown_wait` | reliability |  | 1 | 22 | 0.00% | 3 | 1 | Gen ShutdownWait (100%) |
| `safe_state_pump` | reliability | `pct.event` | 1 | 6 | 0.00% | 2 | 0 | SafeStatePumpON* (100%) |
| `gen_fault` | hardware | `pct.event` | 9 | 18 | 0.00% | 2 | 4 | Gen Fault (22%) |
| `couch_setpos_fail` | hardware | `pct.event` | 1 | 1 | 0.00% | 1 | 0 | VMC SetPos Fail (100%) |
| `inverter_fault` | hardware | `pct.event` | 1 | 138 | 0.00% | 3 | 2 | INVERTER FAULT CK# (100%) |
| `close_hor_timeout` | hardware | `pct.event` | 1 | 84 | 0.00% | 3 | 0 | Close Hor Timeout (100%) |
| `power_off_time` | reliability |  | 1 | 86 | 0.00% | 3 | 2 | PwrOff #:#:# (100%) |
| `cancel_shot` | utilization |  | 3 | 39 | 0.00% | 3 | 1 | CancelShot: End but before Shot (54%) |
| `perfusion_jog` | utilization |  | 1 | 118 | 0.00% | 1 | 0 | Perfusion-Jog, seriesID # (100%) |
| `anode_bypass` | service | `pct.event` | 1 | 216 | 0.00% | 3 | 2 | ANODE BY PASS (100%) |
| `anode_not_spinning` | hardware | `pct.event` | 1 | 1 | 0.00% | 1 | 0 | ANODE NOT SPINNING (100%) |
| `tlm_pump_on` | telemetry |  | 1 | 89,337 | 1.38% | 3 | 1,796 | PumpOn T#=# ** (100%) |
| `tlm_pump_off` | telemetry |  | 1 | 89,667 | 1.39% | 3 | 1,803 | PumpOff ** (100%) |
| `tlm_hc_temp` | telemetry |  | 3 | 178,482 | 2.76% | 3 | 1,908 | HC#  # #.# C (50%) |
| `tlm_flow_switch` | telemetry |  | 1 | 179,199 | 2.77% | 3 | 3,601 | FlowSwitch # (100%) |
| `tlm_dc_rail` | telemetry |  | 1 | 105,251 | 1.63% | 3 | 1,188 | DC rail #V** (100%) |
| `tlm_rail_ph` | telemetry |  | 1 | 4,270 | 0.07% | 1 | 143 | LL>Rail=#V PH=#.#A (100%) |
| `tlm_temp_fil` | telemetry |  | 1 | 13,549 | 0.21% | 3 | 217 | Temp fil #.# (100%) |
| `tlm_oilflow` | telemetry |  | 1 | 14,694 | 0.23% | 2 | 142 | HSS oilflow delay * (100%) |
| `tlm_ma_err` | telemetry |  | 5 | 59,720 | 0.92% | 3 | 705 | MA err   #.#* (53%) |
| `tlm_cur_pre` | telemetry |  | 1 | 224,888 | 3.48% | 3 | 3,162 | Cur:# Pre:#* (100%) |
| `tlm_new_fil` | telemetry |  | 2 | 59,670 | 0.92% | 3 | 596 | New fil #.# (50%) |
| `tlm_gm_roll` | telemetry |  | 2 | 20,113 | 0.31% | 2 | 314 | GM Roll: L # C # (50%) |
| `tlm_tube_heat` | telemetry |  | 7 | 615 | 0.01% | 3 | 14 | Turning Pump OFF* (22%) |
| `operator_panel` | noise |  | 11 | 84,889 | 1.31% | 3 | 893 | TapeSw released (17%) |
| `trace_generator` | trace |  | 2574 | 2,326,612 | 35.98% | 3 | 26,701 | Gen Ready #ma** (5%) |
| `trace_motion` | trace |  | 786 | 2,757,525 | 42.65% | 3 | 30,931 | MP-Ctrl- Direction Changed. (5%) |

## 5. Events rows (`Msg`, non-relay): rules

| Rule | Category | Facts | Templates | DB rows | Share | Sys | MDB rows | Top template (share of the rule's rows) |
|---|---|---|---|---|---|---|---|---|
| `ev_glc_version` | inventory | `pct.inventory` | 2 | 6,194 | 0.52% | 2 | 425 | GLC Version:: GANTRY_#.#.#.# : Sep # # : #:#:# (68%) |
| `ev_registry` | inventory | `pct.inventory` | 1 | 5,912 | 0.50% | 3 | 425 | System Registry Information: :System registry: Orion Tube Type: # Tub… (100%) |
| `ev_estop_opened` | reliability | `pct.estop` | 3 | 69 | 0.01% | 3 | 1 | GantryEstopOpenedBkst# in CStateSeriesNotLoaded (58%) |
| `ev_estop_closed` | reliability |  | 4 | 229 | 0.02% | 3 | 2 | GantryEstopClosedBkst in CStateConfigured (99%) |
| `ev_pet_estop` | noise |  | 1 | 177 | 0.01% | 3 | 3 | Enabling PET Estop (100%) |
| `ev_study_started` | utilization |  | 1 | 9,920 | 0.84% | 3 | 109 | GSE::CState::StateBkst::STUDY_STARTED was sent to GPC (100%) |
| `ev_study_ended` | utilization |  | 1 | 3,787 | 0.32% | 3 | 122 | GSE::CState::StateBkst::STUDY_ENDED was sent to GPC (100%) |
| `ev_study_bkst` | utilization |  | 2 | 5,246 | 0.44% | 3 | 231 | GantryEndStudyBkst was sent to Gantry (50%) |
| `ev_study_exit` | utilization |  | 2 | 785 | 0.07% | 3 | 62 | - - - - - - Study Exit - - - - - - (52%) |
| `ev_series` | utilization |  | 4 | 73,238 | 6.19% | 3 | 1,328 | ----------------- Series # Complete ----------------- (59%) |
| `ev_shot_starts` | utilization |  | 1 | 25,832 | 2.18% | 3 | 718 | - - - - - - Shot # Starts - - - - - - (100%) |
| `ev_cancel` | utilization |  | 4 | 745 | 0.06% | 3 | 11 | Cancel Answer was sent to Host (93%) |
| `ev_warmup` | utilization |  | 2 | 138 | 0.01% | 3 | 2 | GSE sending TubeWarmupNeededBkst (86%) |
| `ev_tube_heat` | telemetry |  | 2 | 59,391 | 5.02% | 3 | 740 | received tube heat data: prct_heat= # (100%) |
| `ev_heat_wait` | reliability | `pct.event` | 1 | 10 | 0.00% | 1 | 0 | ValidateShot:Failed heat check. Must cool for # seconds. (100%) |
| `ev_rpc_unavailable` | reliability | `pct.event` | 6 | 106 | 0.01% | 1 | 0 | gseErrorLogReportInfo The RPC server is unavailable. (44%) |
| `ev_gantry_timeout` | reliability | `pct.event` | 8 | 79 | 0.01% | 3 | 1 | CState::HandlePollingTimeout ... Gantry timed out after # ms (71%) |
| `ev_sequencer_start_bad_state` | reliability | `pct.event` | 1 | 8 | 0.00% | 2 | 0 | GantrySequencerStartBkst in CStateNotConfigured (100%) |
| `ev_can_fired_unsuccessfully` | reliability | `pct.event` | 1 | 23 | 0.00% | 2 | 0 | CDMC::OnGotMsgFromCAN : DMC_BINARY_ANS : Event has been fired unsucce… (100%) |
| `ev_fru_reset` | reliability |  | 16 | 107 | 0.01% | 1 | 0 | FRU: Couch UTILITY: PowerOnReset MESSAGE: A power on and on-chip cloc… (10%) |
| `ev_gse_begins` | reliability | `pct.event` | 1 | 163 | 0.01% | 3 | 7 | ================================= GSE Begins ========================… (100%) |
| `ev_gse_exits` | reliability | `pct.event` | 1 | 6 | 0.00% | 1 | 0 | ================================= GSE Exits =========================… (100%) |
| `ev_host_start` | reliability |  | 5 | 1,427 | 0.12% | 3 | 31 | ========================= CStateNotStarted::InitOnce ================… (26%) |
| `ev_config_lines` | trace |  | 6 | 1,350 | 0.11% | 3 | 28 | Generator DOM configs loaded for table ID # (31%) |
| `ev_couch_type_mismatch` | hardware | `pct.event` | 3 | 132 | 0.01% | 3 | 0 | CouchType mismatch (73%) |
| `ev_diag_mode` | service | `pct.event` | 1 | 531 | 0.04% | 3 | 15 | GantryAppDiagModeAns in CStateSeriesNotLoaded (100%) |
| `ev_filament_cal` | service | `pct.event` | 4 | 249 | 0.02% | 2 | 0 | GSE: Sending FilCal Status # (41%) |
| `ev_flash_nvram` | service | `pct.event` | 28 | 41 | 0.00% | 1 | 0 | Attempting to reset boards back into application mode. (10%) |
| `ev_remote_support` | service | `pct.event` | 1 | 4 | 0.00% | 1 | 0 | IST_PHILIPS SUPPORT SPECIALIST AUTHORIZED. (100%) |
| `ev_ealreport` | service | `pct.event` | 1 | 4 | 0.00% | 1 | 19 | GantryEalReportAns (100%) |
| `ev_voice` | noise |  | 34 | 151,847 | 12.84% | 3 | 6,953 | GSEPlayVoice phrase #  seriesID # (18%) |
| `ev_collision_check` | noise |  | 4 | 15,031 | 1.27% | 1 | 65 | Collision test successful: (100%) |
| `ev_state_transition` | trace |  | 45 | 292,212 | 24.71% | 3 | 5,069 | CStatePreshot to CStateShot (18%) |
| `ev_glc_trace` | trace |  | 33 | 526,323 | 44.51% | 3 | 5,294 | GetZeroAndHorizontalPosition:"   #/#/# #:#:# (12%) |
| `ev_can_trace` | trace |  | 4 | 1,018 | 0.09% | 2 | 487 | BeforeGetStream"   #/#/# #:#:# (47%) |
| `ev_timestamp_only` | trace |  | 7 | 71 | 0.01% | 3 | 0 | #/#/# #:#:# (52%) |
| `ev_series_cancel_operator` | utilization |  | 0 | 0 | 0.00% | 0 | 42 | MDB only: never ingested (comma, line break or `__NN` suffix; plan §7.4) |
| `ev_series_cancel_system` | reliability | `pct.event` | 0 | 0 | 0.00% | 0 | 1 | MDB only: never ingested (comma, line break or `__NN` suffix; plan §7.4) |
| `ev_shot_end_not_ok` | reliability | `pct.event` | 0 | 0 | 0.00% | 0 | 53 | MDB only: never ingested (comma, line break or `__NN` suffix; plan §7.4) |
| `ev_series_end_error` | reliability | `pct.event` | 0 | 0 | 0.00% | 0 | 1 | MDB only: never ingested (comma, line break or `__NN` suffix; plan §7.4) |
| `ev_cancel_source` | trace |  | 0 | 0 | 0.00% | 0 | 10 | MDB only: never ingested (comma, line break or `__NN` suffix; plan §7.4) |
| `ev_study_on_off` | utilization |  | 0 | 0 | 0.00% | 0 | 231 | MDB only: never ingested (comma, line break or `__NN` suffix; plan §7.4) |
| `ev_host_restarted` | reliability | `pct.event` | 0 | 0 | 0.00% | 0 | 5 | MDB only: never ingested (comma, line break or `__NN` suffix; plan §7.4) |
| `ev_polling_jitter` | reliability | `pct.event` | 0 | 0 | 0.00% | 0 | 6 | MDB only: never ingested (comma, line break or `__NN` suffix; plan §7.4) |
| `ev_can_init_failed` | reliability | `pct.event` | 0 | 0 | 0.00% | 0 | 2 | MDB only: never ingested (comma, line break or `__NN` suffix; plan §7.4) |
| `ev_series_trace` | trace |  | 0 | 0 | 0.00% | 0 | 2,448 | MDB only: never ingested (comma, line break or `__NN` suffix; plan §7.4) |

## 6. Totals by category

| Category | Codes (rows) | Uncoded EAL templates (rows) | Events templates (rows) | MDB: EAL (coded + uncoded) | MDB: Events |
|---|---|---|---|---|---|
| utilization | 0 (0) | 17 (171,206) | 17 (119,691) | 1,950 | 2,856 |
| reliability | 24 (19,709) | 9 (1,384) | 47 (2,227) | 119 | 110 |
| hardware | 75 (26,661) | 13 (242) | 3 (132) | 110 | 0 |
| service | 4 (357) | 1 (216) | 35 (829) | 6 | 34 |
| inventory | 0 (0) | 9 (46,264) | 3 (12,106) | 507 | 850 |
| telemetry | 0 (0) | 27 (1,039,455) | 2 (59,391) | 15,589 | 740 |
| noise | 20 (6,020) | 11 (84,889) | 39 (167,055) | 954 | 7,021 |
| trace | 0 (0) | 3365 (5,120,421) | 95 (820,974) | 58,024 | 13,336 |
| tail | 0 (0) | 264 (2,015) | 1 (2) | 5 | 3 |
| relay (ignored) | | | 3,911,351 rows | | 77,264 |

## 7. The long tail: `pct.event` with dim = `tail:<kind>:<masked template>`

264 uncoded EAL templates (2,015 rows, 0.03%) and 1 Events template (2 rows). Mostly generator and motion start-up lines on 1–3 systems. Top 30:

| Rows | Sys | Sys-days | Template |
|---|---|---|---|
| 61 | 3 | 42 | Ent TubeType* |
| 53 | 1 | 2 | MProcDrive::processCOE S:# C:#; |
| 49 | 3 | 38 | >CED.timeoutG |
| 48 | 3 | 26 | MM Checking State entry(). |
| 48 | 3 | 26 | CSMachine Drive/Motor: #/# |
| 48 | 3 | 26 | Non AGMP Board. Monitor OFF. |
| 48 | 3 | 26 | Enter GCP** |
| 48 | 3 | 26 | SensorBoard NotReady.Motion Allowed |
| 42 | 3 | 20 | Filter is DIS |
| 42 | 3 | 20 | GetOff # |
| 42 | 3 | 20 | CouchSWVersInit |
| 42 | 3 | 20 | IS>.SetZCalb # |
| 42 | 3 | 20 | CouchMotorVersInit |
| 41 | 3 | 20 | IrqIsr: # |
| 41 | 3 | 20 | SIEL: # |
| 41 | 3 | 20 | GAFSendingVerInit |
| 41 | 3 | 20 | SIMASK: #C# |
| 41 | 3 | 20 | CouchType:# |
| 41 | 3 | 20 | CouchType: # |
| 41 | 3 | 20 | CouchSubscribedHW |
| 41 | 3 | 20 | LogVerReport |
| 41 | 3 | 20 | IRQ#No: # |
| 41 | 3 | 20 | BdType:# Rev:A |
| 41 | 3 | 20 | IrqBd: FF#FF# |
| 41 | 3 | 20 | IS>.GetZCRpm # |
| 41 | 3 | 20 | IS>.GetAC # |
| 41 | 3 | 20 | SIPEND: # |
| 41 | 3 | 20 | Starting # msec timer |
| 41 | 3 | 20 | StopNum: # |
| 29 | 2 | 25 | UDC EA# |
| 2 | 1 | 1 | Events: GMP  Executing Application Flash Update.  GMP  Executing Boot Flash Update.  GH… |

## Appendix A. Uncoded EAL templates to 97% of rows (173), each with its rule

| # | Ctrl | Template | Rows | Cum % | Sys | Sys-days | Rule | Category |
|---|---|---|---|---|---|---|---|---|
| 1 | 3 | Cur:# Pre:#* | 224,888 | 3.5% | 3 | 305 | `tlm_cur_pre` | telemetry |
| 2 | 1 | FlowSwitch # | 179,199 | 6.2% | 3 | 268 | `tlm_flow_switch` | telemetry |
| 3 | 0 | MP-Ctrl- Direction Changed. | 130,442 | 8.3% | 3 | 303 | `trace_motion` | trace |
| 4 | 3 | HStoppedState* | 108,925 | 10.0% | 3 | 304 | `trace_motion` | trace |
| 5 | 3 | VelEncoderTime:# | 108,912 | 11.6% | 3 | 304 | `trace_motion` | trace |
| 6 | 3 | HMCMoveTime:# # # | 108,843 | 13.3% | 3 | 304 | `trace_motion` | trace |
| 7 | 3 | absEnc:#  VelEnc:# | 108,757 | 15.0% | 3 | 304 | `trace_motion` | trace |
| 8 | 3 | absEnc:#  VelEnc:# # | 108,620 | 16.7% | 3 | 304 | `trace_motion` | trace |
| 9 | 1 | Gen Ready #ma** | 105,257 | 18.3% | 3 | 303 | `trace_generator` | trace |
| 10 | 1 | DC rail #V** | 105,251 | 19.9% | 3 | 303 | `tlm_dc_rail` | telemetry |
| 11 | 3 | EncoderTol:#.# # | 95,440 | 21.4% | 3 | 303 | `trace_motion` | trace |
| 12 | 3 | DeltaAbs:# Rel:# Vel:# # | 95,432 | 22.9% | 3 | 303 | `trace_motion` | trace |
| 13 | 3 | EncodercheckTime:# | 95,427 | 24.4% | 3 | 303 | `trace_motion` | trace |
| 14 | 3 | abs:#  rel:# vel:# | 95,401 | 25.8% | 3 | 303 | `trace_motion` | trace |
| 15 | 3 | PosAbs:# Rel:# Vel:# | 95,293 | 27.3% | 3 | 303 | `trace_motion` | trace |
| 16 | 1 | PumpOff ** | 89,667 | 28.7% | 3 | 262 | `tlm_pump_off` | telemetry |
| 17 | 1 | PumpOn T#=# ** | 89,337 | 30.1% | 3 | 258 | `tlm_pump_on` | telemetry |
| 18 | 1 | HC#  # #.# C | 89,258 | 31.5% | 3 | 303 | `tlm_hc_temp` | telemetry |
| 19 | 1 | HC#   # #.# C | 89,181 | 32.8% | 3 | 303 | `tlm_hc_temp` | telemetry |
| 20 | 3 | DecPos:# | 83,957 | 34.1% | 3 | 303 | `trace_motion` | trace |
| 21 | 3 | AccPos:# | 83,952 | 35.4% | 3 | 303 | `trace_motion` | trace |
| 22 | 3 | EndTime:#* | 83,442 | 36.7% | 3 | 303 | `trace_motion` | trace |
| 23 | 0 | MP-Ctrl BeltRatio - IPCount = # | 78,557 | 37.9% | 3 | 303 | `trace_motion` | trace |
| 24 | 1 | FdomStopIntTimer | 77,058 | 39.1% | 3 | 305 | `trace_generator` | trace |
| 25 | 3 | SampleTime: # | 68,411 | 40.2% | 3 | 303 | `trace_motion` | trace |
| 26 | 3 | TimeToDecel: # | 68,404 | 41.3% | 3 | 303 | `trace_motion` | trace |
| 27 | 3 | AccelTime: # #.# | 68,402 | 42.3% | 3 | 303 | `trace_motion` | trace |
| 28 | 3 | TimeToDecelTimeout | 65,229 | 43.3% | 3 | 303 | `trace_motion` | trace |
| 29 | 1 | Call GrantShot: intershotDelay=# | 61,378 | 44.3% | 3 | 303 | `trace_generator` | trace |
| 30 | 0 | cycle time = # ms | 61,315 | 45.2% | 3 | 303 | `trace_generator` | trace |
| 31 | 1 | DoseType Armed State: # | 61,241 | 46.2% | 3 | 303 | `trace_generator` | trace |
| 32 | 1 | DOM Exec=# Cfg=#* | 61,238 | 47.1% | 3 | 303 | `trace_generator` | trace |
| 33 | 1 | Gen Armed #** | 61,238 | 48.1% | 3 | 303 | `trace_generator` | trace |
| 34 | 1 | HCShotTime not adjusted | 60,664 | 49.0% | 3 | 303 | `trace_generator` | trace |
| 35 | 1 | End DmcIsrComm:# | 59,735 | 49.9% | 3 | 303 | `trace_generator` | trace |
| 36 | 0 | XrayOn-to-XrayOn=# ms | 59,732 | 50.8% | 3 | 303 | `trace_generator` | trace |
| 37 | 1 | SMA # SG #** | 59,727 | 51.8% | 3 | 303 | `trace_generator` | trace |
| 38 | 1 | DmcRcvDatCnt:# | 59,726 | 52.7% | 3 | 303 | `trace_generator` | trace |
| 39 | 1 | ETms#b#* | 59,717 | 53.6% | 3 | 303 | `trace_generator` | trace |
| 40 | 1 | S#X#B#* | 59,715 | 54.5% | 3 | 303 | `trace_generator` | trace |
| 41 | 0 | GXray EXP=# | 59,693 | 55.5% | 3 | 303 | `xray_ms` | utilization |
| 42 | 0 | GXray BU=# | 59,638 | 56.4% | 3 | 303 | `trace_generator` | trace |
| 43 | 1 | SyncOn** | 55,414 | 57.2% | 3 | 303 | `trace_generator` | trace |
| 44 | 1 | SyncOff** | 55,049 | 58.1% | 3 | 303 | `trace_generator` | trace |
| 45 | 1 | DmcIsrCtrl:#x<hex> | 52,793 | 58.9% | 3 | 303 | `trace_generator` | trace |
| 46 | 1 | DmcIsrDisable:# | 52,789 | 59.7% | 3 | 303 | `trace_generator` | trace |
| 47 | 1 | Start DmcIsrComm:# | 52,789 | 60.5% | 3 | 303 | `trace_generator` | trace |
| 48 | 1 | doseType = NO_DOSE* | 52,692 | 61.4% | 3 | 303 | `trace_generator` | trace |
| 49 | 1 | LL>ShotExit NominalPreheat=#.#A | 51,181 | 62.1% | 3 | 303 | `trace_generator` | trace |
| 50 | 0 | StartPanelStatusTmr | 50,960 | 62.9% | 3 | 303 | `trace_generator` | trace |
| 51 | 3 | m event [#X#] state [#X#] | 48,694 | 63.7% | 2 | 179 | `trace_motion` | trace |
| 52 | 0 | StartPanelDisplayTmr | 47,538 | 64.4% | 3 | 304 | `trace_generator` | trace |
| 53 | 0 | SID: # Delay:# | 47,420 | 65.2% | 3 | 304 | `trace_motion` | trace |
| 54 | 1 | Idle:CurrentOK* | 45,520 | 65.9% | 3 | 303 | `trace_generator` | trace |
| 55 | 2 | After getting semaphore | 44,587 | 66.5% | 3 | 303 | `trace_generator` | trace |
| 56 | 2 | Before getting semaphore | 44,586 | 67.2% | 3 | 303 | `trace_generator` | trace |
| 57 | 1 | Gen preheat | 44,481 | 67.9% | 3 | 303 | `trace_generator` | trace |
| 58 | 1 | Gen Granted # | 44,480 | 68.6% | 3 | 303 | `trace_generator` | trace |
| 59 | 1 | LL>PreheatEntry NominalPreheat=#.#A | 44,478 | 69.3% | 3 | 303 | `trace_generator` | trace |
| 60 | 1 | Gen IdleToGrant: #x<hex> | 44,476 | 70.0% | 3 | 303 | `trace_generator` | trace |
| 61 | 1 | Gen Shot#x#LO* | 44,102 | 70.7% | 3 | 303 | `shot` | utilization |
| 62 | 1 | Postheat Timeout, sent FILAMENT_OFF_ANS | 43,716 | 71.3% | 3 | 303 | `trace_generator` | trace |
| 63 | 1 | Gen Postheat | 43,662 | 72.0% | 3 | 303 | `trace_generator` | trace |
| 64 | 3 | StopPos:#* | 42,366 | 72.7% | 3 | 304 | `trace_motion` | trace |
| 65 | 1 | Gen Idle: Gen=#x<hex> Tube=# Gan=BRILL | 42,034 | 73.3% | 2 | 256 | `gen_idle` | inventory |
| 66 | 0 | Motion: # | 38,573 | 73.9% | 3 | 304 | `trace_motion` | trace |
| 67 | 1 | CallingProfileRelease | 36,904 | 74.5% | 3 | 304 | `trace_generator` | trace |
| 68 | 3 | Hstop:#:# | 35,988 | 75.1% | 3 | 268 | `trace_motion` | trace |
| 69 | 0 | MP-Ctrl Pos(#thDeg,Ticks):#,# | 35,984 | 75.6% | 3 | 303 | `trace_motion` | trace |
| 70 | 0 | StudyReady IX:# ID:# CT:# | 35,563 | 76.2% | 3 | 303 | `study_ready` | utilization |
| 71 | 0 | StudyReady EKG TRG not needed #:# | 35,535 | 76.7% | 3 | 303 | `study_ready_ekg` | trace |
| 72 | 3 | VMotStoppingExit | 33,385 | 77.2% | 3 | 303 | `trace_motion` | trace |
| 73 | 3 | VMotStoppingEntry | 33,377 | 77.7% | 3 | 303 | `trace_motion` | trace |
| 74 | 3 | VJogCompTrans | 32,646 | 78.2% | 3 | 303 | `trace_motion` | trace |
| 75 | 0 | Ctrl In-Position State exit() # | 32,316 | 78.7% | 3 | 302 | `trace_motion` | trace |
| 76 | 0 | Ctrl In-Position State entry() # | 32,312 | 79.2% | 3 | 303 | `trace_motion` | trace |
| 77 | 1 | MA err   #.#* | 31,792 | 79.7% | 3 | 303 | `tlm_ma_err` | telemetry |
| 78 | 1 | ASSERT XPREP in Preheat Entry # | 30,790 | 80.2% | 2 | 179 | `trace_generator` | trace |
| 79 | 1 | New fil #.# | 29,835 | 80.7% | 3 | 303 | `tlm_new_fil` | telemetry |
| 80 | 1 | Get #stShotPreheat=#.# from NVRAM | 29,835 | 81.1% | 3 | 303 | `tlm_new_fil` | telemetry |
| 81 | 0 | MP: Rotation Counter: # rotation | 29,308 | 81.6% | 3 | 303 | `trace_motion` | trace |
| 82 | 0 | Ctrl Stop SS entry(). | 23,538 | 82.0% | 3 | 303 | `trace_motion` | trace |
| 83 | 3 | SendVPVAns | 23,518 | 82.3% | 3 | 303 | `trace_motion` | trace |
| 84 | 3 | Init VJTP Entry | 23,518 | 82.7% | 3 | 303 | `trace_motion` | trace |
| 85 | 3 | EnterVPV | 23,513 | 83.0% | 3 | 303 | `trace_motion` | trace |
| 86 | 3 | Enter V PTP State | 23,509 | 83.4% | 3 | 303 | `trace_motion` | trace |
| 87 | 3 | Start VJTP Entry | 23,508 | 83.8% | 3 | 303 | `trace_motion` | trace |
| 88 | 3 | VJTP Entry | 23,499 | 84.1% | 3 | 303 | `trace_motion` | trace |
| 89 | 0 | Ctrl Stop SS exit(). | 23,431 | 84.5% | 3 | 303 | `trace_motion` | trace |
| 90 | 0 | Ctrl-Stop Normal Stop Request. Stop() | 23,309 | 84.9% | 3 | 303 | `trace_motion` | trace |
| 91 | 0 | Ctrl Pos SS exit(). | 21,012 | 85.2% | 3 | 302 | `trace_motion` | trace |
| 92 | 0 | Ctrl Pos SS entry(). | 20,991 | 85.5% | 3 | 303 | `trace_motion` | trace |
| 93 | 3 | VStPos: # | 18,614 | 85.8% | 3 | 303 | `trace_motion` | trace |
| 94 | 3 | V#:# # # # # # | 17,783 | 86.1% | 3 | 303 | `trace_motion` | trace |
| 95 | 1 | cctCheck:GEN_REMAINING_CYCLE_TIME=# | 16,787 | 86.3% | 3 | 300 | `trace_generator` | trace |
| 96 | 1 | Call checkHeatCalc() with 'delay'=#* | 16,786 | 86.6% | 3 | 300 | `trace_generator` | trace |
| 97 | 0 | delay(#)=cycle(#)-elapsed(#) | 16,785 | 86.8% | 3 | 300 | `trace_generator` | trace |
| 98 | 1 | MA err  -#.#* | 16,728 | 87.1% | 3 | 291 | `tlm_ma_err` | telemetry |
| 99 | 1 | RcvdFdomSyncOn | 15,350 | 87.3% | 1 | 124 | `trace_generator` | trace |
| 100 | 0 | MP-Ctrl Speed (#th RPM): #. | 15,064 | 87.6% | 3 | 304 | `trace_motion` | trace |
| 101 | 1 | HSS oilflow delay * | 14,694 | 87.8% | 2 | 256 | `tlm_oilflow` | telemetry |
| 102 | 0 | Rotor stopped and MDC closed | 14,565 | 88.0% | 3 | 303 | `rotor_stopped` | utilization |
| 103 | 0 | Ctrl Stopped. Speed: # (#thRPM) | 14,535 | 88.3% | 3 | 303 | `trace_motion` | trace |
| 104 | 0 | Ctrl Stopped State entry(). | 14,533 | 88.5% | 3 | 303 | `trace_motion` | trace |
| 105 | 0 | Ctrl Stopped State exit(). | 14,509 | 88.7% | 3 | 303 | `trace_motion` | trace |
| 106 | 3 | TapeSw released | 14,506 | 88.9% | 3 | 258 | `operator_panel` | noise |
| 107 | 3 | TapeSw pressed | 14,222 | 89.1% | 3 | 258 | `operator_panel` | noise |
| 108 | 1 | RcvdFdomInitSeriesBkst | 13,669 | 89.4% | 1 | 124 | `trace_generator` | trace |
| 109 | 1 | Temp fil #.# | 13,549 | 89.6% | 3 | 301 | `tlm_temp_fil` | telemetry |
| 110 | 3 | Sync Abs:# Vel:# | 13,461 | 89.8% | 3 | 273 | `trace_motion` | trace |
| 111 | 0 | Ctrl At-Speed State exit(). | 12,864 | 90.0% | 3 | 303 | `trace_motion` | trace |
| 112 | 0 | Ctrl At-Speed State entry(). | 12,807 | 90.2% | 3 | 303 | `trace_motion` | trace |
| 113 | 0 | >CRDx#,PLMx#,XRYx# | 11,752 | 90.4% | 3 | 261 | `trace_generator` | trace |
| 114 | 0 | StopPanelDisplayTmr | 11,568 | 90.5% | 3 | 302 | `trace_generator` | trace |
| 115 | 0 | Manual Pressed | 11,266 | 90.7% | 3 | 303 | `operator_panel` | noise |
| 116 | 0 | BOX:MANUAL PRESSED | 11,265 | 90.9% | 3 | 303 | `operator_panel` | noise |
| 117 | 0 | ScanDelay:-# | 11,231 | 91.1% | 3 | 301 | `trace_generator` | trace |
| 118 | 0 | SRA>ABS SD= # SET=# T#Sh=# | 11,172 | 91.2% | 3 | 301 | `trace_generator` | trace |
| 119 | 0 | Ctrl Jog SS exit(). | 10,232 | 91.4% | 3 | 304 | `trace_motion` | trace |
| 120 | 0 | Ctrl Jog SS entry(). | 10,178 | 91.5% | 3 | 304 | `trace_motion` | trace |
| 121 | 1 | GM Roll: L # C # | 10,058 | 91.7% | 2 | 179 | `tlm_gm_roll` | telemetry |
| 122 | 1 | GM Roll: Elapsed #.# | 10,055 | 91.9% | 2 | 179 | `tlm_gm_roll` | telemetry |
| 123 | 0 | mA# kV# spot# fil# | 9,494 | 92.0% | 3 | 301 | `trace_generator` | trace |
| 124 | 1 | M# #** | 9,044 | 92.1% | 3 | 301 | `trace_generator` | trace |
| 125 | 1 | Pilot Pts #** | 9,044 | 92.3% | 3 | 301 | `trace_generator` | trace |
| 126 | 1 | Series #** | 9,044 | 92.4% | 3 | 301 | `trace_generator` | trace |
| 127 | 3 | VStopIntTrans | 8,755 | 92.6% | 3 | 302 | `trace_motion` | trace |
| 128 | 0 | SensorBoard Check Air Sensors Disable. | 8,601 | 92.7% | 3 | 303 | `operator_panel` | noise |
| 129 | 3 | UnxpVStopReq* | 8,582 | 92.8% | 3 | 302 | `trace_motion` | trace |
| 130 | 1 | mA MAX_LIMIT=#mA* | 8,545 | 93.0% | 3 | 301 | `trace_generator` | trace |
| 131 | 1 | mA MIN_LIMIT=#mA* | 8,545 | 93.1% | 3 | 301 | `trace_generator` | trace |
| 132 | 1 | FirstMa = # | 8,538 | 93.2% | 3 | 301 | `trace_generator` | trace |
| 133 | 0 | Ctrl Idle SS entry(). | 8,298 | 93.3% | 3 | 303 | `trace_motion` | trace |
| 134 | 0 | Ctrl In-Idle State entry(). | 8,234 | 93.5% | 3 | 303 | `trace_motion` | trace |
| 135 | 0 | Ctrl Idle SS exit(). | 8,186 | 93.6% | 3 | 304 | `trace_motion` | trace |
| 136 | 0 | SensorBoard Check Air Sensors Enable. | 8,151 | 93.7% | 3 | 304 | `operator_panel` | noise |
| 137 | 0 | Ctrl In-Idle State exit(). | 8,127 | 93.9% | 3 | 304 | `trace_motion` | trace |
| 138 | 0 | SE>ABS SD= # SET=# T#Sh=# | 8,017 | 94.0% | 3 | 301 | `trace_generator` | trace |
| 139 | 0 | BOX:AUTO PRESSED | 7,604 | 94.1% | 3 | 302 | `operator_panel` | noise |
| 140 | 0 | Auto Pressed | 7,601 | 94.2% | 3 | 302 | `operator_panel` | noise |
| 141 | 1 | CallingProfileStore | 7,393 | 94.3% | 2 | 178 | `trace_generator` | trace |
| 142 | 1 | FDOM init Series. Per:# ppr:# | 7,098 | 94.4% | 2 | 178 | `trace_generator` | trace |
| 143 | 1 | Gen Shot#x#SO* | 7,087 | 94.5% | 3 | 149 | `shot` | utilization |
| 144 | 1 | FDOM - Call DomScanEntry | 6,943 | 94.7% | 2 | 178 | `trace_generator` | trace |
| 145 | 1 | doseType = FDOM   * | 6,943 | 94.8% | 2 | 178 | `trace_generator` | trace |
| 146 | 1 | ZDOM Not Valid** | 6,943 | 94.9% | 2 | 178 | `trace_generator` | trace |
| 147 | 1 | FDOM StartMA # gain # | 6,941 | 95.0% | 2 | 178 | `trace_generator` | trace |
| 148 | 1 | FDOM Valid** | 6,941 | 95.1% | 2 | 178 | `trace_generator` | trace |
| 149 | 1 | Rcvd FdomStartIntTimer | 6,938 | 95.2% | 2 | 178 | `trace_generator` | trace |
| 150 | 1 | FDOM Preheat # | 6,938 | 95.3% | 2 | 178 | `trace_generator` | trace |
| 151 | 1 | Timeout:# | 6,938 | 95.4% | 2 | 178 | `trace_generator` | trace |
| 152 | 1 | HeatCheckTTS for FDOM | 6,938 | 95.5% | 2 | 178 | `trace_generator` | trace |
| 153 | 1 | Start FDOM Frame ISR** | 6,938 | 95.6% | 2 | 178 | `trace_generator` | trace |
| 154 | 1 | HeatCheckTTS id# | 6,936 | 95.7% | 2 | 178 | `trace_generator` | trace |
| 155 | 0 | >INTx#,CCTx#,INJx# | 6,843 | 95.8% | 3 | 221 | `trace_generator` | trace |
| 156 | 3 | m event [#X#d#] state [#X#] | 6,567 | 95.9% | 2 | 177 | `trace_motion` | trace |
| 157 | 0 | StartJogIn* | 6,022 | 96.0% | 3 | 269 | `trace_motion` | trace |
| 158 | 1 | MA err  #.#* | 5,924 | 96.1% | 3 | 302 | `tlm_ma_err` | telemetry |
| 159 | 1 | Gen Shot#x#L-* | 5,403 | 96.2% | 2 | 178 | `shot` | utilization |
| 160 | 1 | LL>ArmedExit: Stop periodic timer. | 4,885 | 96.3% | 1 | 47 | `trace_generator` | trace |
| 161 | 1 | GEN_XON_REQ FDOM | 4,328 | 96.3% | 3 | 266 | `trace_generator` | trace |
| 162 | 1 | LL>Rail=#V PH=#.#A | 4,270 | 96.4% | 1 | 47 | `tlm_rail_ph` | telemetry |
| 163 | 3 | CV: #.# Max: #.# | 4,157 | 96.5% | 3 | 165 | `trace_motion` | trace |
| 164 | 0 | *INJ>InSR#PreSHGrd | 4,025 | 96.5% | 3 | 300 | `trace_generator` | trace |
| 165 | 0 | *INJ>InSRWaitGrd | 4,025 | 96.6% | 3 | 300 | `trace_generator` | trace |
| 166 | 0 | *INJ>InSRWait | 3,920 | 96.7% | 3 | 300 | `trace_generator` | trace |
| 167 | 1 | Gen Idle: Gen=#x<hex> Tube=# Gan=INGENU | 3,688 | 96.7% | 1 | 47 | `gen_idle` | inventory |
| 168 | 3 | Hstop:#c:# | 3,552 | 96.8% | 3 | 265 | `trace_motion` | trace |
| 169 | 3 | Hstop:#b:# | 3,509 | 96.8% | 3 | 266 | `trace_motion` | trace |
| 170 | 3 | Hstop:#f:# | 3,505 | 96.9% | 3 | 263 | `trace_motion` | trace |
| 171 | 3 | Hstop:#a:# | 3,490 | 96.9% | 3 | 266 | `trace_motion` | trace |
| 172 | 3 | Hstop:#e:# | 3,488 | 97.0% | 3 | 264 | `trace_motion` | trace |
| 173 | 3 | Hstop:#d:# | 3,483 | 97.0% | 3 | 265 | `trace_motion` | trace |

## Appendix B. Events templates (non-relay) to 97% of rows (66), each with its rule

| # | Type / Module | Template | Rows | Cum % | Sys | Sys-days | Rule | Category |
|---|---|---|---|---|---|---|---|---|
| 1 | ERROR_WARNING / GLC | GetZeroAndHorizontalPosition:"   #/#/# #:#:# | 60,839 | 5.1% | 1 | 124 | `ev_glc_trace` | trace |
| 2 | EVENT_MINOR / GSE | received tube heat data: prct_heat= # | 59,250 | 10.2% | 3 | 302 | `ev_tube_heat` | telemetry |
| 3 | EVENT_MINOR / GSE | CStatePreshot to CStateShot | 52,732 | 14.6% | 3 | 303 | `ev_state_transition` | trace |
| 4 | ERROR_WARNING / GLC | GetPreSeriesAndPreShotDelays:"   #/#/# #:#:# | 49,011 | 18.8% | 3 | 303 | `ev_glc_trace` | trace |
| 5 | EVENT_MINOR / GSE | GantrySeriesPrepBkst wasnt received | 44,431 | 22.5% | 3 | 303 | `ev_state_transition` | trace |
| 6 | EVENT_MAJOR / GSE | ----------------- Series # Complete ----------------- | 43,340 | 26.2% | 3 | 303 | `ev_series` | utilization |
| 7 | EVENT_MINOR / GSE | CStateSeriesReady to CStatePreshot | 35,394 | 29.2% | 3 | 303 | `ev_state_transition` | trace |
| 8 | EVENT_MINOR / GSE | CStateShot to CStatePostshot | 35,160 | 32.2% | 3 | 303 | `ev_state_transition` | trace |
| 9 | ERROR_WARNING / GLC | ======================================== GLC Begins ===========================… | 34,576 | 35.1% | 3 | 309 | `ev_glc_trace` | trace |
| 10 | ERROR_WARNING / GLC | GetMinDelays:Min Delays for #st series=# | 32,692 | 37.8% | 1 | 124 | `ev_glc_trace` | trace |
| 11 | ERROR_WARNING / GLC | PreSeriesDelays : PreSeriesDelay # is: # | 32,054 | 40.6% | 3 | 303 | `ev_glc_trace` | trace |
| 12 | ERROR_WARNING / GLC | PreShotDelays : PreShotDelay # is: # | 30,333 | 43.1% | 3 | 303 | `ev_glc_trace` | trace |
| 13 | ERROR_WARNING / GLC | ===================================== GLC Load Complete =======================… | 29,933 | 45.6% | 3 | 305 | `ev_glc_trace` | trace |
| 14 | ERROR_WARNING / GLC | getMinCycleTime:MinIntershotTime=#.# CycleTime=# | 28,849 | 48.1% | 1 | 123 | `ev_glc_trace` | trace |
| 15 | EVENT_MINOR / GSE | gseGetReadyReq without DOMProfile. NumberOfSeries:# | 26,609 | 50.3% | 3 | 303 | `ev_state_transition` | trace |
| 16 | EVENT_MINOR / GSE | GSEPlayVoice phrase #  seriesID # | 26,600 | 52.6% | 3 | 301 | `ev_voice` | noise |
| 17 | EVENT_MAJOR / GSE | - - - - - - Shot # Starts - - - - - - | 25,832 | 54.8% | 3 | 303 | `ev_shot_starts` | utilization |
| 18 | ERROR_WARNING / GLC | :couchStartPos # | 21,021 | 56.6% | 3 | 298 | `ev_glc_trace` | trace |
| 19 | ERROR_WARNING / GLC | getCycleAndRealShotTime:PartialRotTime = #.# RotTime = #.# | 19,210 | 58.2% | 1 | 121 | `ev_glc_trace` | trace |
| 20 | ERROR_WARNING / GLC | CGlcCoClass:::FinalRelease"   #/#/# #:#:# | 17,682 | 59.7% | 3 | 303 | `ev_glc_trace` | trace |
| 21 | EVENT_MINOR / GSE | CStateSeriesPrep to CStateSeriesReady | 17,360 | 61.1% | 3 | 299 | `ev_state_transition` | trace |
| 22 | EVENT_MINOR / GSE | CStatePostshot to CStatePreshot | 16,930 | 62.6% | 3 | 301 | `ev_state_transition` | trace |
| 23 | EVENT_MAJOR / GSE | ----------------- Series # Ready ----------------- | 15,642 | 63.9% | 3 | 301 | `ev_series` | utilization |
| 24 | EVENT_MINOR / GSE | CVoice::Clear"   #/#/# #:#:# | 15,480 | 65.2% | 3 | 302 | `ev_voice` | noise |
| 25 | ERROR_WARNING / GLC | ValidateShot :No Shot Time Adjustment necessary. Shot Time = # | 15,373 | 66.5% | 1 | 124 | `ev_glc_trace` | trace |
| 26 | ERROR_WARNING / GLC | ValidateShot preAdjustment Values :shotTime: #  couchSpeed: # rotorSpeed: # Tub… | 15,317 | 67.8% | 1 | 124 | `ev_glc_trace` | trace |
| 27 | ERROR_WARNING / GLC | Series Id : # | 15,103 | 69.1% | 1 | 124 | `ev_glc_trace` | trace |
| 28 | ERROR_WARNING / GLC | getCycleAndRealShotTime:fixed start of field | 15,010 | 70.3% | 1 | 102 | `ev_glc_trace` | trace |
| 29 | ERROR_WARNING / GLC | getCycleAndRealShotTime:NrotTimes = #.# | 15,006 | 71.6% | 1 | 102 | `ev_glc_trace` | trace |
| 30 | ERROR_WARNING / GLC | Collision test successful: | 15,001 | 72.9% | 1 | 124 | `ev_collision_check` | noise |
| 31 | EVENT_MINOR / GSE | CStatePostshot to CStateSeriesNotLoaded | 14,485 | 74.1% | 3 | 294 | `ev_state_transition` | trace |
| 32 | EVENT_MINOR / GSE | CStateSeriesLoading to CStateSeriesPrep | 14,382 | 75.3% | 3 | 299 | `ev_state_transition` | trace |
| 33 | EVENT_MAJOR / GSE | ----------------- Series Not Loaded ----------------- | 14,244 | 76.5% | 3 | 295 | `ev_series` | utilization |
| 34 | EVENT_MINOR / GSE | SetDoSafeVoiceFlag"   #/#/# #:#:# | 13,666 | 77.7% | 3 | 291 | `ev_voice` | noise |
| 35 | EVENT_MINOR / GSE | CStateSeriesNotLoaded to CStateSeriesLoading | 13,050 | 78.8% | 3 | 294 | `ev_state_transition` | trace |
| 36 | ERROR_WARNING / GLC | GetPermissionsHiRes: for # series | 12,742 | 79.9% | 1 | 123 | `ev_glc_trace` | trace |
| 37 | ERROR_WARNING / GLC | GetPermissions called : for # series | 12,739 | 80.9% | 1 | 124 | `ev_glc_trace` | trace |
| 38 | ERROR_WARNING / GLC | Heat Check successful: | 12,671 | 82.0% | 1 | 124 | `ev_glc_trace` | trace |
| 39 | ERROR_WARNING / GLC | RealTimeData: :Zero Position= # Horizontal Abs Position= # Vertical Position= #… | 12,225 | 83.0% | 1 | 124 | `ev_glc_trace` | trace |
| 40 | ERROR_WARNING / GLC | GetPermissions passed ValidateShot:# | 12,003 | 84.1% | 1 | 124 | `ev_glc_trace` | trace |
| 41 | EVENT_MINOR / GSE | CStateSeriesPrep::GantrySpeakPhraseBkst SUID # phase # | 11,255 | 85.0% | 3 | 301 | `ev_voice` | noise |
| 42 | ERROR_WARNING / GLC | Calling ValidateShot: | 10,872 | 85.9% | 1 | 124 | `ev_glc_trace` | trace |
| 43 | EVENT_MINOR / GSE | GSE::CState::StateBkst::STUDY_STARTED was sent to GPC | 9,920 | 86.8% | 3 | 303 | `ev_study_started` | utilization |
| 44 | EVENT_MINOR / GSE | CVoice::Add - pathname for post is | 8,981 | 87.5% | 3 | 287 | `ev_voice` | noise |
| 45 | EVENT_MINOR / GSE | GantrySpeakPhraseBkst phase # of series # m_NeedReleaseVoice # | 8,862 | 88.3% | 3 | 300 | `ev_voice` | noise |
| 46 | ERROR_WARNING / GLC | Voice File time is :Voice # is # milliSeconds | 7,950 | 89.0% | 3 | 295 | `ev_voice` | noise |
| 47 | EVENT_MINOR / GSE | GSEPlayVoice: Playing Pre Voice | 7,100 | 89.6% | 3 | 286 | `ev_voice` | noise |
| 48 | EVENT_MINOR / GSE | gseGetReadyReq with DOMProfile. NumberOfSeries:# | 6,168 | 90.1% | 2 | 178 | `ev_state_transition` | trace |
| 49 | ERROR_WARNING / GLC | System Registry Information: :System registry: Orion Tube Type: # TubeParamsVer… | 5,912 | 90.6% | 3 | 306 | `ev_registry` | inventory |
| 50 | EVENT_MINOR / GSE | GSEPlayVoice: Playing Post voice | 5,900 | 91.1% | 3 | 292 | `ev_voice` | noise |
| 51 | EVENT_MINOR / GSE | CVoice::Add - pathname for pre is | 5,801 | 91.6% | 3 | 286 | `ev_voice` | noise |
| 52 | ERROR_WARNING / GLC | GetMinDelays:Series=# Id=# Time=# StartPos=# RotorSpeedChangeTime=#--Tpshotmot … | 5,776 | 92.1% | 1 | 123 | `ev_glc_trace` | trace |
| 53 | ERROR_NORMAL / GSE | PlayNextPostVoice # | 5,705 | 92.5% | 3 | 292 | `ev_voice` | noise |
| 54 | EVENT_MINOR / GSE | PlayNextPostVoice: In loop | 5,545 | 93.0% | 3 | 290 | `ev_voice` | noise |
| 55 | EVENT_MINOR / GSE | IsThereAPostVoice: There is a PostVoice | 5,364 | 93.5% | 3 | 282 | `ev_voice` | noise |
| 56 | EVENT_MINOR / GSE | CVoice::Add - pathname for post is C:/usr/diamond.root/cfg/voice/ENGLISH/Post#.… | 4,570 | 93.8% | 1 | 123 | `ev_voice` | noise |
| 57 | EVENT_MINOR / GSE | GSEPlayVoice: Playing Scan Imminent Warning | 4,527 | 94.2% | 3 | 271 | `ev_voice` | noise |
| 58 | EVENT_MINOR / GSE | IsThereAPostVoice C:/usr/diamond.root/cfg/voice/ENGLISH/Post#.wav | 4,509 | 94.6% | 1 | 123 | `ev_voice` | noise |
| 59 | ERROR_WARNING / GLC | getCycleAndRealShotTime:variable start of field | 4,225 | 95.0% | 1 | 120 | `ev_glc_trace` | trace |
| 60 | ERROR_WARNING / GLC | GLC Version:: GANTRY_#.#.#.# : Sep # # : #:#:# | 4,210 | 95.3% | 2 | 182 | `ev_glc_version` | inventory |
| 61 | EVENT_MINOR / GSE | GantryDateTimeSyncReq was sent in # state | 3,945 | 95.7% | 3 | 303 | `ev_state_transition` | trace |
| 62 | EVENT_MINOR / GSE | GSE::CState::StateBkst::STUDY_ENDED was sent to GPC | 3,787 | 96.0% | 3 | 304 | `ev_study_ended` | utilization |
| 63 | EVENT_MINOR / GSE | SeriesDomProfileHandler::ConvertHtDOMProfile#HtFDOMPeakAveMaProfile isHeliosTub… | 3,690 | 96.3% | 2 | 177 | `ev_state_transition` | trace |
| 64 | ERROR_WARNING / GLC | GetMinDelays:Series=# Id=# Time=# StartPos=# RotorSpeedChangeTime=#--Tpshotmot … | 3,186 | 96.6% | 1 | 107 | `ev_glc_trace` | trace |
| 65 | EVENT_MINOR / GSE | CStatePostshot to CStateSeriesPrep | 2,907 | 96.8% | 3 | 283 | `ev_state_transition` | trace |
| 66 | EVENT_MINOR / GSE | m_NeedReleaseVoice set to true | 2,686 | 97.0% | 3 | 287 | `ev_voice` | noise |

