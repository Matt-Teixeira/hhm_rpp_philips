# Philips CT: error codes and message templates (inventory, 2026-11-20)

Companion to `PLAN-PHILIPS-CT-INSIGHTS.md` (§1.6, §2). Generated read-only from `log.philips_ct_eal_events`, captures 2026-05-01 → 2026-11-02, the only 3 systems with rows (SME20598, SME18534, SME18535). Generator: `~/philips_ct_evidence/scripts/build_codes_md.py`; sources: `out/19_templates.tsv`, `out/28_err_codes.tsv` (SQL in `sql/19_*`, `sql/28_*`).

- This is an **inventory for sizing, not a mapping.** The mapping (CV §6 / MRI-2a style) waits until data flows again (plan §5 Q1).
- **Templates** mask every digit run as `#` and keep the first 100 characters. Philips CT has no message-number field: only 0.8% of EAL rows carry a code (`err_number`), so the classifier is the template, plus the code where present.
- **Events counts are biased low.** Events rows whose `DataTime` carries a `__NN` suffix (~52%) are never ingested (plan §3.2 I1). Events text is rebuilt as `message || ' ' || eal` because the parser splits `Msg` at its first space (I3).
- **Labels** in §1 come from `kdb.philips_ct` (Avante's own Philips CT knowledge base), matched on `err_num` = code or code without `S_`. Nothing here is decoded; no field is encoded or obfuscated. The Events `BLOB` column (binary OLE) is never collected.
- *Sys-days* = distinct (system, device day).

## 1. EAL error codes (`err_number`), to 98% of coded rows

123 codes, 52,787 rows (WARN 51,757; NORMAL 1,006; ESTOP 19; FATAL 5). `kdb.philips_ct` labels 98 codes (20,356 rows); the two largest codes have no entry.

| # | Code | ERR_TYPE | Rows | 20598 | 18534 | 18535 | Sys | Sys-days | First | Last | Cum % | kdb type | kdb label (first 70 chars) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `S_FDOM_PROFILE_FRAME_ISR_TBL_END_DEFAULT_MA_USED` | WARN | 14,645 | 14645 | 0 | 0 | 1 | 132 | 2026/04/30 | 2026/11/02 | 27.7 |  |  |
| 2 | `S_DMC_I2C_COMM2HEATERNOT_OK` | WARN | 12,695 | 83 | 12594 | 18 | 3 | 89 | 2026/04/30 | 2026/10/28 | 51.8 |  |  |
| 3 | `S_DMC_DPU_RCOM_COMMUNICATION` | WARN | 3,656 | 0 | 3656 | 0 | 1 | 112 | 2026/04/30 | 2026/10/30 | 58.7 | Warning | DPU to RCOM data communication error. |
| 4 | `S_DMC_RCOM_COMMUNICATION` | WARN | 3,443 | 28 | 3415 | 0 | 2 | 146 | 2026/05/01 | 2026/10/30 | 65.2 | Warning | RCOM to Slip Rings communication error. Check Parameter 1 & 2 to find  |
| 5 | `S_MASTER_SEQUENCER_SERIES_DELAY_LESS_THAN_MIN` | WARN | 2,595 | 1294 | 1229 | 72 | 3 | 294 | 2026/04/30 | 2026/11/02 | 70.2 | Warning | Actual time between scans is more than delay set by Host. |
| 6 | `S_HMC_AXIS_AT_POSITIVE_LIMIT` | WARN | 2,480 | 1313 | 1163 | 4 | 3 | 255 | 2026/04/30 | 2026/11/02 | 74.9 | Warning | Couch is at horizontal outer limit. |
| 7 | `S_MPS_WAITING_FOR_MAIN_DRIVE_TO_CLOSE` | WARN | 1,895 | 1894 | 1 | 0 | 2 | 23 | 2026/05/03 | 2026/11/02 | 78.4 | Not Specified | The AGMP has sent the command to close the MDC and it checks the statu |
| 8 | `S_GAFSTARTUPTASK_DTH_BAD_PARAM` | WARN | 1,787 | 1063 | 592 | 132 | 3 | 152 | 2026/04/30 | 2026/11/02 | 81.8 |  |  |
| 9 | `S_MP_POSLOOP_MAX_MIN_ACCEL_ERROR` | WARN | 1,265 | 1264 | 0 | 1 | 2 | 5 | 2026/04/30 | 2026/11/02 | 84.2 |  |  |
| 10 | `S_FDOM_PROFILE_CALC_ERROR_DEFAULT_MA_USED` | WARN | 1,069 | 988 | 0 | 81 | 2 | 166 | 2026/04/30 | 2026/11/02 | 86.3 |  |  |
| 11 | `S_GENERATOR_MONITOR_GAF_ERROR` | WARN | 1,035 | 506 | 453 | 76 | 3 | 279 | 2026/04/30 | 2026/11/01 | 88.2 | Warning | New error !!!!!!! |
| 12 | `S_DTH_USER_ALREADY_REGISTERED` | WARN | 597 | 400 | 155 | 42 | 3 | 137 | 2026/04/30 | 2026/10/30 | 89.3 | Warning | A Warning error. Usually a programming error, when more than one attem |
| 13 | `S_RMC_MP_DTH_BAD_PARAM` | WARN | 437 | 257 | 148 | 32 | 3 | 152 | 2026/04/30 | 2026/11/02 | 90.2 | Warning | Bad Rotor Coordinator parameter, Bad Rotor Coordinator version, NO Rot |
| 14 | `S_RMC_DTH_BAD_PARAM` | WARN | 437 | 257 | 148 | 32 | 3 | 152 | 2026/04/30 | 2026/11/02 | 91.0 | Warning | Bad Rotor Coordinator parameter, Bad Rotor Coordinator version, NO Rot |
| 15 | `S_ROTOR_DTH_BAD_PARAM` | WARN | 437 | 257 | 148 | 32 | 3 | 152 | 2026/04/30 | 2026/11/02 | 91.8 | Warning | Bad or NO Rotor Manager configuration parameter, or version. Illegal c |
| 16 | `S_GEN_MGR_SYNC_OFF_OUT_OF_SEQUENCE` | WARN | 348 | 294 | 31 | 23 | 3 | 145 | 2026/05/01 | 2026/11/02 | 92.5 | Normal | Normal error. Indicates that the sync signal was received before expec |
| 17 | `S_DMC_SLIP_RING` | WARN | 288 | 0 | 0 | 288 | 1 | 46 | 2026/04/30 | 2026/10/30 | 93.0 | Warning | Optical slip ring signal error. |
| 18 | `S_MC_DEVICE_COUCH_VERTICAL_HW_FAULT` | WARN | 280 | 174 | 82 | 24 | 3 | 112 | 2026/05/01 | 2026/10/30 | 93.6 | Warning | Table moves in small steps... |
| 19 | `S_MPROC_DEVICE_NO_DATA_FROM_GMP_SERIAL` | WARN | 250 | 250 | 0 | 0 | 1 | 2 | 2026/06/13 | 2026/10/08 | 94.0 |  |  |
| 20 | `S_TILT_D_DEVICE_READ_ERROR` | WARN | 201 | 201 | 0 | 0 | 1 | 1 | 2026/10/08 | 2026/10/08 | 94.4 |  |  |
| 21 | `S_MPS_MAIN_DRIVE_NOT_CLOSING` | NORMAL | 200 | 200 | 0 | 0 | 1 | 5 | 2026/06/13 | 2026/11/02 | 94.8 | Not Specified | Main drive contactor (MDK) is not closing |
| 22 | `S_MP_CTRL_DRIVER_SB_FAULT_RESET_ERROR` | WARN | 200 | 69 | 131 | 0 | 2 | 148 | 2026/05/01 | 2026/11/02 | 95.2 | Warning | The driver checks to see if the controller received a fault and was re |
| 23 | `S_COLLECT_LOGS_BUSY` | WARN | 196 | 52 | 130 | 14 | 3 | 156 | 2026/04/30 | 2026/11/02 | 95.5 |  |  |
| 24 | `S_MC_DEVICE_ELAPSED_TIMER_ZERO_FAIL` | WARN | 162 | 115 | 31 | 16 | 3 | 117 | 2026/05/01 | 2026/11/01 | 95.9 | Warning | This warning error is mainly seen during CStateSeriesNotLoaded after g |
| 25 | `S_HMC_TAPE_SWITCH_PRESSED` | NORMAL | 151 | 151 | 0 | 0 | 1 | 76 | 2026/05/02 | 2026/11/02 | 96.1 | Normal | Vertical tape switch is pressed. |
| 26 | `33816580` | WARN | 148 | 0 | 148 | 0 | 1 | 111 | 2026/05/01 | 2026/10/30 | 96.4 |  |  |
| 27 | `S_DMC_SHOT_COMM_COLLAPSE` | NORMAL | 123 | 4 | 118 | 1 | 3 | 60 | 2026/04/30 | 2026/10/30 | 96.7 | Normal | no frames were generated by DMS during scan.Watch for more occurances  |
| 28 | `S_MC_DEVICE_PS_FAILURE` | WARN | 120 | 117 | 3 | 0 | 2 | 15 | 2026/06/01 | 2026/10/17 | 96.9 | Warning | This warning is sent the first time motion is commanded after the syst |
| 29 | `S_COLLISION_WAITING_FOR_ACS_TO_INIT` | WARN | 116 | 98 | 9 | 9 | 3 | 20 | 2026/04/30 | 2026/10/17 | 97.1 | Warning | Collision information could not be provided from the ACS. In V3.5 this |
| 30 | `S_COMMAND_INVALID_CHECKSUM_ERROR` | WARN | 110 | 60 | 43 | 7 | 3 | 71 | 2026/04/30 | 2026/10/31 | 97.3 | Warning | Command error from Panel/CT-Box. |
| 31 | `S_MASTER_SEQUENCER_COUCH_UNCOMMANDED_MOTION` | NORMAL | 100 | 95 | 5 | 0 | 2 | 69 | 2026/04/30 | 2026/10/30 | 97.5 | Normal | Tape switch was pressed during shot/preshot sequencing, causing the co |
| 32 | `S_MANMOT_VERTICAL_STOP_ERROR` | NORMAL | 87 | 87 | 0 | 0 | 1 | 54 | 2026/05/04 | 2026/10/29 | 97.7 | Normal | Couch system did not stop motion and respond to command within 5 secon |
| 33 | `S_COMMAND_INVALID_FORMAT_ERROR` | WARN | 79 | 37 | 41 | 1 | 3 | 58 | 2026/05/04 | 2026/10/31 | 97.8 | Warning | Invalid command format to/from Panel/CT-Box. |
| 34 | `S_RTDH_HC_TIMEOUT_ERROR` | WARN | 78 | 78 | 0 | 0 | 1 | 4 | 2026/06/14 | 2026/11/02 | 98.0 | Warning | Error waiting for Heat Calculator to respond to request. |
| 35 | `S_TILT_C_MANUAL_TILT_OFF` | WARN | 71 | 59 | 12 | 0 | 2 | 20 | 2026/05/04 | 2026/10/31 | 98.1 | Normal | A Manual Tilt positioning was sent and the MANUAL_TILT_ENA signal is O |

Below the cut: 95 code × type rows, 1,006 rows; 56 of them on one system only. Full list: `out/28_err_codes.tsv`.

## 2. Events templates (Type, Module, text), to 97% of ingested rows

250 templates, 5,096,939 rows; 119 on all 3 systems, 107 on one.

| # | Type | Module | Template | Rows | 20598 | 18534 | 18535 | Sys | Sys-days | Cum % |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | INFO | Gantry | `CStateSeriesNotLoaded` | 1,614,841 | 1012939 | 538451 | 63451 | 3 | 304 | 31.7 |
| 2 | INFO | Gantry | `CStateShot` | 1,350,196 | 611412 | 671169 | 67615 | 3 | 303 | 58.2 |
| 3 | INFO | Gantry | `CStateSeriesPrep` | 489,504 | 303738 | 164329 | 21437 | 3 | 303 | 67.8 |
| 4 | INFO | Gantry | `CStatePostshot` | 190,031 | 66963 | 114448 | 8620 | 3 | 303 | 71.5 |
| 5 | INFO | Gantry | `CStateSeriesReady` | 140,445 | 57377 | 77010 | 6058 | 3 | 303 | 74.3 |
| 6 | ERROR_WARNING | GLC | `GetZeroAndHorizontalPosition:"   #/#/# #:#:#` | 60,839 | 0 | 60839 | 0 | 1 | 124 | 75.5 |
| 7 | EVENT_MINOR | GSE | `received tube heat data: prct_heat= #` | 59,318 | 41567 | 11504 | 6247 | 3 | 302 | 76.6 |
| 8 | EVENT_MINOR | GSE | `CStatePreshot to CStateShot` | 52,765 | 31284 | 17790 | 3691 | 3 | 303 | 77.7 |
| 9 | ERROR_WARNING | GLC | `GetPreSeriesAndPreShotDelays:"   #/#/# #:#:#` | 49,042 | 23568 | 22185 | 3289 | 3 | 303 | 78.6 |
| 10 | EVENT_MINOR | GSE | `GantrySeriesPrepBkst wasnt received` | 44,462 | 27457 | 13636 | 3369 | 3 | 303 | 79.5 |
| 11 | EVENT_MAJOR | GSE | `----------------- Series # Complete -----------------` | 43,368 | 26570 | 13515 | 3283 | 3 | 303 | 80.3 |
| 12 | EVENT_MINOR | GSE | `CStateSeriesReady to CStatePreshot` | 35,423 | 20455 | 12548 | 2420 | 3 | 303 | 81.0 |
| 13 | EVENT_MINOR | GSE | `CStateShot to CStatePostshot` | 35,187 | 15634 | 17709 | 1844 | 3 | 303 | 81.7 |
| 14 | ERROR_WARNING | GLC | `======================================== GLC Begins ========================================:` | 34,611 | 29755 | 1983 | 2873 | 3 | 309 | 82.4 |
| 15 | ERROR_WARNING | GLC | `GetMinDelays:Min Delays for #st series=#` | 32,692 | 0 | 32692 | 0 | 1 | 124 | 83.0 |
| 16 | INFO | Gantry | `CStatePreshot` | 32,205 | 10948 | 19210 | 2047 | 3 | 302 | 83.7 |
| 17 | ERROR_WARNING | GLC | `PreSeriesDelays : PreSeriesDelay # is: #` | 32,062 | 6775 | 24776 | 511 | 3 | 303 | 84.3 |
| 18 | ERROR_WARNING | GLC | `PreShotDelays : PreShotDelay # is: #` | 30,342 | 6516 | 23220 | 606 | 3 | 303 | 84.9 |
| 19 | ERROR_WARNING | GLC | `===================================== GLC Load Complete ====================================:` | 29,964 | 25399 | 1979 | 2586 | 3 | 305 | 85.5 |
| 20 | ERROR_WARNING | GLC | `getMinCycleTime:MinIntershotTime=#.# CycleTime=#` | 28,849 | 0 | 28849 | 0 | 1 | 123 | 86.1 |
| 21 | EVENT_MINOR | GSE | `gseGetReadyReq without DOMProfile. NumberOfSeries:#` | 26,631 | 14586 | 9338 | 2707 | 3 | 303 | 86.6 |
| 22 | EVENT_MINOR | GSE | `GSEPlayVoice phrase #  seriesID #` | 26,608 | 14120 | 11125 | 1363 | 3 | 301 | 87.1 |
| 23 | EVENT_MAJOR | GSE | `- - - - - - Shot # Starts - - - - - -` | 25,845 | 7612 | 17761 | 472 | 3 | 303 | 87.6 |
| 24 | INFO | Gantry | `CStateSeriesLoading` | 24,829 | 16539 | 7006 | 1284 | 3 | 301 | 88.1 |
| 25 | ERROR_WARNING | GLC | `:couchStartPos #` | 21,027 | 3364 | 17420 | 243 | 3 | 298 | 88.5 |
| 26 | ERROR_WARNING | GLC | `getCycleAndRealShotTime:PartialRotTime = #.# RotTime = #.#` | 19,210 | 0 | 19210 | 0 | 1 | 121 | 88.9 |
| 27 | ERROR_WARNING | GLC | `CGlcCoClass:::FinalRelease"   #/#/# #:#:#` | 17,700 | 14911 | 1469 | 1320 | 3 | 303 | 89.2 |
| 28 | EVENT_MINOR | GSE | `CStateSeriesPrep to CStateSeriesReady` | 17,366 | 3522 | 13655 | 189 | 3 | 299 | 89.6 |
| 29 | EVENT_MINOR | GSE | `CStatePostshot to CStatePreshot` | 16,971 | 11226 | 4196 | 1549 | 3 | 301 | 89.9 |
| 30 | INFO | Gantry | `CStateConfigured` | 16,023 | 6783 | 8364 | 876 | 3 | 162 | 90.2 |
| 31 | EVENT_MAJOR | GSE | `----------------- Series # Ready -----------------` | 15,643 | 2663 | 12813 | 167 | 3 | 301 | 90.5 |
| 32 | EVENT_MINOR | GSE | `CVoice::Clear"   #/#/# #:#:#` | 15,482 | 3488 | 11651 | 343 | 3 | 302 | 90.8 |
| 33 | ERROR_WARNING | GLC | `ValidateShot :No Shot Time Adjustment necessary. Shot Time = #` | 15,373 | 0 | 15373 | 0 | 1 | 124 | 91.1 |
| 34 | ERROR_WARNING | GLC | `ValidateShot preAdjustment Values :shotTime: #  couchSpeed: # rotorSpeed: # TubeType: #` | 15,317 | 0 | 15317 | 0 | 1 | 124 | 91.4 |
| 35 | ERROR_WARNING | GLC | `Series Id : #` | 15,103 | 0 | 15103 | 0 | 1 | 124 | 91.7 |
| 36 | ERROR_WARNING | GLC | `getCycleAndRealShotTime:fixed start of field` | 15,010 | 0 | 15010 | 0 | 1 | 102 | 92.0 |
| 37 | ERROR_WARNING | GLC | `getCycleAndRealShotTime:NrotTimes = #.#` | 15,006 | 0 | 15006 | 0 | 1 | 102 | 92.3 |
| 38 | ERROR_WARNING | GLC | `Collision test successful:` | 15,001 | 0 | 15001 | 0 | 1 | 124 | 92.6 |
| 39 | EVENT_MINOR | GSE | `CStatePostshot to CStateSeriesNotLoaded` | 14,486 | 2756 | 11567 | 163 | 3 | 294 | 92.9 |
| 40 | EVENT_MINOR | GSE | `CStateSeriesLoading to CStateSeriesPrep` | 14,389 | 2192 | 11923 | 274 | 3 | 299 | 93.2 |
| 41 | EVENT_MAJOR | GSE | `----------------- Series Not Loaded -----------------` | 14,247 | 1961 | 12136 | 150 | 3 | 295 | 93.5 |
| 42 | ERROR_WARNING | Gantry | `CStateSeriesNotLoaded` | 14,191 | 1956 | 12179 | 56 | 3 | 285 | 93.7 |
| 43 | EVENT_MINOR | GSE | `SetDoSafeVoiceFlag"   #/#/# #:#:#` | 13,670 | 2150 | 11378 | 142 | 3 | 291 | 94.0 |
| 44 | EVENT_MINOR | GSE | `CStateSeriesNotLoaded to CStateSeriesLoading` | 13,051 | 1032 | 11857 | 162 | 3 | 294 | 94.3 |
| 45 | INFO | Gantry | `CStateStudyExit` | 12,956 | 7245 | 3666 | 2045 | 3 | 264 | 94.5 |
| 46 | ERROR_WARNING | GLC | `GetPermissionsHiRes: for # series` | 12,742 | 0 | 12742 | 0 | 1 | 123 | 94.8 |
| 47 | ERROR_WARNING | GLC | `GetPermissions called : for # series` | 12,739 | 0 | 12739 | 0 | 1 | 124 | 95.0 |
| 48 | ERROR_WARNING | GLC | `Heat Check successful:` | 12,671 | 0 | 12671 | 0 | 1 | 124 | 95.3 |
| 49 | ERROR_WARNING | GLC | `RealTimeData: :Zero Position= # Horizontal Abs Position= # Vertical Position= # Tilt Position= #` | 12,225 | 0 | 12225 | 0 | 1 | 124 | 95.5 |
| 50 | ERROR_WARNING | GLC | `GetPermissions passed ValidateShot:#` | 12,003 | 0 | 12003 | 0 | 1 | 124 | 95.7 |
| 51 | EVENT_MINOR | GSE | `CStateSeriesPrep::GantrySpeakPhraseBkst SUID # phase #` | 11,264 | 9484 | 1485 | 295 | 3 | 301 | 96.0 |
| 52 | ERROR_WARNING | GLC | `Calling ValidateShot:` | 10,872 | 0 | 10872 | 0 | 1 | 124 | 96.2 |
| 53 | EVENT_MINOR | GSE | `GSE::CState::StateBkst::STUDY_STARTED was sent to GPC` | 9,932 | 7378 | 1906 | 648 | 3 | 303 | 96.4 |
| 54 | EVENT_MINOR | GSE | `CVoice::Add - pathname for post is` | 8,982 | 1044 | 7787 | 151 | 3 | 287 | 96.5 |
| 55 | EVENT_MINOR | GSE | `GantrySpeakPhraseBkst phase # of series # m_NeedReleaseVoice #` | 8,864 | 3930 | 4554 | 380 | 3 | 300 | 96.7 |
| 56 | ERROR_WARNING | Gantry | `CStateShot` | 8,651 | 771 | 7774 | 106 | 3 | 293 | 96.9 |
| 57 | ERROR_WARNING | GLC | `Voice File time is :Voice # is # milliSeconds` | 7,952 | 1920 | 5904 | 128 | 3 | 295 | 97.0 |

Below the cut: 193 templates, 150,761 rows.

## 3. EAL templates (ERR_TYPE, Controller, Info), to 97% of rows

3765 templates, 6,525,121 rows; 558 on all 3 systems, 2243 on one.

| # | ERR_TYPE | Ctrl | Template | Rows | 20598 | 18534 | 18535 | Sys | Sys-days | Cum % |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | FATAL | 3 | `Cur:# Pre:#*` | 225,048 | 159123 | 63581 | 2344 | 3 | 305 | 3.4 |
| 2 | FATAL | 1 | `FlowSwitch #` | 179,260 | 128735 | 50499 | 26 | 3 | 268 | 6.2 |
| 3 | FATAL | 0 | `MP-Ctrl- Direction Changed.` | 130,565 | 100751 | 16045 | 13769 | 3 | 303 | 8.2 |
| 4 | FATAL | 3 | `HStoppedState*` | 109,045 | 78902 | 23156 | 6987 | 3 | 304 | 9.9 |
| 5 | FATAL | 3 | `VelEncoderTime:#` | 109,032 | 78890 | 23156 | 6986 | 3 | 304 | 11.5 |
| 6 | FATAL | 3 | `HMCMoveTime:# # #` | 108,963 | 78851 | 23137 | 6975 | 3 | 304 | 13.2 |
| 7 | FATAL | 3 | `absEnc:#  VelEnc:#` | 108,876 | 78880 | 23010 | 6986 | 3 | 304 | 14.9 |
| 8 | FATAL | 3 | `absEnc:#  VelEnc:# #` | 108,741 | 78886 | 22893 | 6962 | 3 | 304 | 16.5 |
| 9 | FATAL | 1 | `Gen Ready #ma**` | 105,357 | 65663 | 31439 | 8255 | 3 | 303 | 18.2 |
| 10 | FATAL | 1 | `DC rail #V**` | 105,351 | 65661 | 31436 | 8254 | 3 | 303 | 19.8 |
| 11 | FATAL | 3 | `EncoderTol:#.# #` | 95,550 | 66219 | 22396 | 6935 | 3 | 303 | 21.2 |
| 12 | FATAL | 3 | `DeltaAbs:# Rel:# Vel:# #` | 95,542 | 66210 | 22397 | 6935 | 3 | 303 | 22.7 |
| 13 | FATAL | 3 | `EncodercheckTime:#` | 95,537 | 66205 | 22397 | 6935 | 3 | 303 | 24.2 |
| 14 | FATAL | 3 | `abs:#  rel:# vel:#` | 95,512 | 66322 | 22268 | 6922 | 3 | 303 | 25.6 |
| 15 | FATAL | 3 | `PosAbs:# Rel:# Vel:#` | 95,403 | 66216 | 22252 | 6935 | 3 | 303 | 27.1 |
| 16 | FATAL | 1 | `PumpOff **` | 89,698 | 64414 | 25276 | 8 | 3 | 262 | 28.5 |
| 17 | FATAL | 1 | `PumpOn T#=# **` | 89,367 | 64312 | 25054 | 1 | 3 | 258 | 29.8 |
| 18 | FATAL | 1 | `HC#  # #.# C` | 89,324 | 55696 | 27628 | 6000 | 3 | 303 | 31.2 |
| 19 | FATAL | 1 | `HC#   # #.# C` | 89,243 | 54003 | 27272 | 7968 | 3 | 303 | 32.6 |
| 20 | FATAL | 3 | `DecPos:#` | 84,059 | 59481 | 17952 | 6626 | 3 | 303 | 33.9 |
| 21 | FATAL | 3 | `AccPos:#` | 84,054 | 59478 | 17952 | 6624 | 3 | 303 | 35.1 |
| 22 | FATAL | 3 | `EndTime:#*` | 83,536 | 60588 | 18023 | 4925 | 3 | 303 | 36.4 |
| 23 | FATAL | 0 | `MP-Ctrl BeltRatio - IPCount = #` | 78,654 | 60719 | 12987 | 4948 | 3 | 303 | 37.6 |
| 24 | FATAL | 1 | `FdomStopIntTimer` | 77,156 | 57710 | 12340 | 7106 | 3 | 305 | 38.8 |
| 25 | FATAL | 3 | `SampleTime: #` | 68,477 | 50327 | 12018 | 6132 | 3 | 303 | 39.9 |
| 26 | FATAL | 3 | `TimeToDecel: #` | 68,470 | 50320 | 12018 | 6132 | 3 | 303 | 40.9 |
| 27 | FATAL | 3 | `AccelTime: # #.#` | 68,468 | 50319 | 12018 | 6131 | 3 | 303 | 42.0 |
| 28 | FATAL | 3 | `TimeToDecelTimeout` | 65,289 | 49239 | 11713 | 4337 | 3 | 303 | 43.0 |
| 29 | FATAL | 1 | `Call GrantShot: intershotDelay=#` | 61,448 | 38647 | 17911 | 4890 | 3 | 303 | 43.9 |
| 30 | FATAL | 0 | `cycle time = # ms` | 61,385 | 38674 | 17805 | 4906 | 3 | 303 | 44.8 |
| 31 | FATAL | 1 | `DoseType Armed State: #` | 61,312 | 38641 | 17787 | 4884 | 3 | 303 | 45.8 |
| 32 | FATAL | 1 | `Gen Armed #**` | 61,309 | 38636 | 17788 | 4885 | 3 | 303 | 46.7 |
| 33 | FATAL | 1 | `DOM Exec=# Cfg=#*` | 61,309 | 38636 | 17788 | 4885 | 3 | 303 | 47.7 |
| 34 | FATAL | 1 | `HCShotTime not adjusted` | 60,734 | 38648 | 17909 | 4177 | 3 | 303 | 48.6 |
| 35 | FATAL | 1 | `End DmcIsrComm:#` | 59,805 | 37209 | 17741 | 4855 | 3 | 303 | 49.5 |
| 36 | FATAL | 0 | `XrayOn-to-XrayOn=# ms` | 59,802 | 37201 | 17743 | 4858 | 3 | 303 | 50.4 |
| 37 | FATAL | 1 | `SMA # SG #**` | 59,797 | 37198 | 17741 | 4858 | 3 | 303 | 51.3 |
| 38 | FATAL | 1 | `DmcRcvDatCnt:#` | 59,796 | 37205 | 17739 | 4852 | 3 | 303 | 52.3 |
| 39 | FATAL | 1 | `ETms#b#*` | 59,787 | 37197 | 17737 | 4853 | 3 | 303 | 53.2 |
| 40 | FATAL | 1 | `S#X#B#*` | 59,785 | 37188 | 17738 | 4859 | 3 | 303 | 54.1 |
| 41 | FATAL | 0 | `GXray EXP=#` | 59,763 | 37169 | 17738 | 4856 | 3 | 303 | 55.0 |
| 42 | FATAL | 0 | `GXray BU=#` | 59,708 | 37113 | 17741 | 4854 | 3 | 303 | 55.9 |
| 43 | FATAL | 1 | `SyncOn**` | 55,484 | 36217 | 15347 | 3920 | 3 | 303 | 56.8 |
| 44 | FATAL | 1 | `SyncOff**` | 55,118 | 35916 | 15309 | 3893 | 3 | 303 | 57.6 |
| 45 | FATAL | 1 | `DmcIsrCtrl:#xf#` | 52,855 | 30845 | 17740 | 4270 | 3 | 303 | 58.4 |
| 46 | FATAL | 1 | `Start DmcIsrComm:#` | 52,851 | 30835 | 17741 | 4275 | 3 | 303 | 59.2 |
| 47 | FATAL | 1 | `DmcIsrDisable:#` | 52,851 | 30843 | 17739 | 4269 | 3 | 303 | 60.1 |
| 48 | FATAL | 1 | `doseType = NO_DOSE*` | 52,755 | 32268 | 16185 | 4302 | 3 | 303 | 60.9 |
| 49 | FATAL | 1 | `LL>ShotExit NominalPreheat=#.#A` | 51,243 | 30836 | 16137 | 4270 | 3 | 303 | 61.6 |
| 50 | FATAL | 0 | `StartPanelStatusTmr` | 51,009 | 37709 | 9295 | 4005 | 3 | 303 | 62.4 |
| 51 | FATAL | 3 | `m event [#X#] state [#X#]` | 48,745 | 46308 | 0 | 2437 | 2 | 179 | 63.2 |
| 52 | FATAL | 0 | `StartPanelDisplayTmr` | 47,576 | 29491 | 14452 | 3633 | 3 | 304 | 63.9 |
| 53 | FATAL | 0 | `SID: # Delay:#` | 47,457 | 29500 | 14130 | 3827 | 3 | 304 | 64.6 |
| 54 | FATAL | 1 | `Idle:CurrentOK*` | 45,556 | 28042 | 13841 | 3673 | 3 | 303 | 65.3 |
| 55 | FATAL | 2 | `After getting semaphore` | 44,623 | 27791 | 13356 | 3476 | 3 | 303 | 66.0 |
| 56 | FATAL | 2 | `Before getting semaphore` | 44,622 | 27791 | 13355 | 3476 | 3 | 303 | 66.7 |
| 57 | FATAL | 1 | `Gen preheat` | 44,511 | 27406 | 13699 | 3406 | 3 | 303 | 67.4 |
| 58 | FATAL | 1 | `Gen Granted #` | 44,510 | 27406 | 13698 | 3406 | 3 | 303 | 68.1 |
| 59 | FATAL | 1 | `LL>PreheatEntry NominalPreheat=#.#A` | 44,508 | 27404 | 13698 | 3406 | 3 | 303 | 68.7 |
| 60 | FATAL | 1 | `Gen Shot#x#LO*` | 44,164 | 29620 | 11430 | 3114 | 3 | 303 | 69.4 |
| 61 | FATAL | 1 | `Postheat Timeout, sent FILAMENT_OFF_ANS` | 43,744 | 26828 | 13614 | 3302 | 3 | 303 | 70.1 |
| 62 | FATAL | 1 | `Gen Postheat` | 43,690 | 26778 | 13613 | 3299 | 3 | 303 | 70.8 |
| 63 | FATAL | 3 | `StopPos:#*` | 42,405 | 32246 | 7937 | 2222 | 3 | 304 | 71.4 |
| 64 | FATAL | 1 | `Gen Idle: Gen=#x#D Tube=# Gan=BRILL` | 42,070 | 28099 | 13971 | 0 | 2 | 256 | 72.1 |
| 65 | FATAL | 1 | `Gen IdleToGrant: #x#D` | 41,099 | 27399 | 13700 | 0 | 2 | 256 | 72.7 |
| 66 | FATAL | 0 | `Motion: #` | 38,598 | 23051 | 12608 | 2939 | 3 | 304 | 73.3 |
| 67 | FATAL | 1 | `CallingProfileRelease` | 36,932 | 21422 | 12334 | 3176 | 3 | 304 | 73.8 |
| 68 | FATAL | 0 | `MP-Ctrl Pos(#thDeg,Ticks):#,#` | 36,027 | 27256 | 6357 | 2414 | 3 | 303 | 74.4 |
| 69 | FATAL | 3 | `Hstop:#:#` | 35,988 | 24317 | 8702 | 2969 | 3 | 268 | 74.9 |
| 70 | FATAL | 0 | `StudyReady IX:# ID:# CT:#` | 35,584 | 20577 | 11914 | 3093 | 3 | 303 | 75.5 |
| 71 | FATAL | 0 | `StudyReady EKG TRG not needed #:#` | 35,556 | 20577 | 11913 | 3066 | 3 | 303 | 76.0 |
| 72 | FATAL | 3 | `VMotStoppingExit` | 33,417 | 25694 | 6066 | 1657 | 3 | 303 | 76.5 |
| 73 | FATAL | 3 | `VMotStoppingEntry` | 33,409 | 25684 | 6067 | 1658 | 3 | 303 | 77.1 |
| 74 | FATAL | 3 | `VJogCompTrans` | 32,675 | 25006 | 6067 | 1602 | 3 | 303 | 77.6 |
| 75 | FATAL | 0 | `Ctrl In-Position State exit() #` | 32,355 | 24160 | 5966 | 2229 | 3 | 302 | 78.1 |
| 76 | FATAL | 0 | `Ctrl In-Position State entry() #` | 32,351 | 24119 | 6005 | 2227 | 3 | 303 | 78.6 |
| 77 | FATAL | 1 | `MA err   #.#*` | 31,838 | 20186 | 8978 | 2674 | 3 | 303 | 79.0 |
| 78 | FATAL | 1 | `ASSERT XPREP in Preheat Entry #` | 30,820 | 27418 | 0 | 3402 | 2 | 179 | 79.5 |
| 79 | FATAL | 1 | `New fil #.#` | 29,851 | 16804 | 10626 | 2421 | 3 | 303 | 80.0 |
| 80 | FATAL | 1 | `Get #stShotPreheat=#.# from NVRAM` | 29,851 | 16804 | 10626 | 2421 | 3 | 303 | 80.4 |
| 81 | FATAL | 0 | `MP: Rotation Counter: # rotation` | 29,332 | 20600 | 6435 | 2297 | 3 | 303 | 80.9 |
| 82 | FATAL | 0 | `Ctrl Stop SS entry().` | 23,561 | 17718 | 4448 | 1395 | 3 | 303 | 81.2 |
| 83 | FATAL | 3 | `SendVPVAns` | 23,538 | 17902 | 4392 | 1244 | 3 | 303 | 81.6 |
| 84 | FATAL | 3 | `Init VJTP Entry` | 23,538 | 17902 | 4391 | 1245 | 3 | 303 | 82.0 |
| 85 | FATAL | 3 | `EnterVPV` | 23,533 | 17899 | 4390 | 1244 | 3 | 303 | 82.3 |
| 86 | FATAL | 3 | `Enter V PTP State` | 23,529 | 17894 | 4391 | 1244 | 3 | 303 | 82.7 |
| 87 | FATAL | 3 | `Start VJTP Entry` | 23,528 | 17894 | 4391 | 1243 | 3 | 303 | 83.0 |
| 88 | FATAL | 3 | `VJTP Entry` | 23,519 | 17890 | 4387 | 1242 | 3 | 303 | 83.4 |
| 89 | FATAL | 0 | `Ctrl Stop SS exit().` | 23,454 | 17626 | 4447 | 1381 | 3 | 303 | 83.8 |
| 90 | FATAL | 0 | `Ctrl-Stop Normal Stop Request. Stop()` | 23,332 | 17677 | 4306 | 1349 | 3 | 303 | 84.1 |
| 91 | FATAL | 0 | `Ctrl Pos SS exit().` | 21,034 | 16522 | 3221 | 1291 | 3 | 302 | 84.4 |
| 92 | FATAL | 0 | `Ctrl Pos SS entry().` | 21,013 | 16468 | 3253 | 1292 | 3 | 303 | 84.8 |
| 93 | WARN | 2 | `∅` | 20,532 | 377 | 19815 | 340 | 3 | 261 | 85.1 |
| 94 | FATAL | 3 | `VStPos: #` | 18,633 | 14255 | 3416 | 962 | 3 | 303 | 85.4 |
| 95 | WARN | 1 | `∅` | 18,220 | 17157 | 807 | 256 | 3 | 300 | 85.6 |
| 96 | FATAL | 3 | `V#:# # # # # #` | 17,800 | 13660 | 3233 | 907 | 3 | 303 | 85.9 |
| 97 | FATAL | 1 | `cctCheck:GEN_REMAINING_CYCLE_TIME=#` | 16,828 | 11245 | 4180 | 1403 | 3 | 300 | 86.2 |
| 98 | FATAL | 1 | `Call checkHeatCalc() with 'delay'=#*` | 16,827 | 11245 | 4179 | 1403 | 3 | 300 | 86.4 |
| 99 | FATAL | 0 | `delay(#)=cycle(#)-elapsed(#)` | 16,826 | 11244 | 4179 | 1403 | 3 | 300 | 86.7 |
| 100 | FATAL | 1 | `MA err  -#.#*` | 16,744 | 10357 | 6297 | 90 | 3 | 291 | 86.9 |
| 101 | FATAL | 1 | `RcvdFdomSyncOn` | 15,350 | 0 | 15350 | 0 | 1 | 124 | 87.2 |
| 102 | FATAL | 0 | `MP-Ctrl Speed (#th RPM): #.` | 15,081 | 11261 | 2775 | 1045 | 3 | 304 | 87.4 |
| 103 | FATAL | 1 | `HSS oilflow delay *` | 14,705 | 11663 | 3042 | 0 | 2 | 256 | 87.6 |
| 104 | FATAL | 0 | `Rotor stopped and MDC closed` | 14,579 | 10770 | 2890 | 919 | 3 | 303 | 87.9 |
| 105 | FATAL | 0 | `Ctrl Stopped. Speed: # (#thRPM)` | 14,549 | 10750 | 2889 | 910 | 3 | 303 | 88.1 |
| 106 | FATAL | 0 | `Ctrl Stopped State entry().` | 14,547 | 10753 | 2887 | 907 | 3 | 303 | 88.3 |
| 107 | FATAL | 0 | `Ctrl Stopped State exit().` | 14,523 | 10734 | 2889 | 900 | 3 | 303 | 88.5 |
| 108 | FATAL | 3 | `TapeSw released` | 14,516 | 13782 | 695 | 39 | 3 | 258 | 88.8 |
| 109 | FATAL | 3 | `TapeSw pressed` | 14,232 | 13509 | 686 | 37 | 3 | 258 | 89.0 |
| 110 | FATAL | 1 | `RcvdFdomInitSeriesBkst` | 13,669 | 0 | 13669 | 0 | 1 | 124 | 89.2 |
| 111 | FATAL | 1 | `Temp fil #.#` | 13,580 | 8608 | 3523 | 1449 | 3 | 301 | 89.4 |
| 112 | FATAL | 3 | `Sync Abs:# Vel:#` | 13,471 | 12661 | 759 | 51 | 3 | 273 | 89.6 |
| 113 | FATAL | 0 | `Ctrl At-Speed State exit().` | 12,879 | 9902 | 2193 | 784 | 3 | 303 | 89.8 |
| 114 | FATAL | 0 | `Ctrl At-Speed State entry().` | 12,823 | 9859 | 2183 | 781 | 3 | 303 | 90.0 |
| 115 | FATAL | 0 | `>CRDx#,PLMx#,XRYx#` | 11,759 | 6548 | 3896 | 1315 | 3 | 261 | 90.2 |
| 116 | FATAL | 0 | `StopPanelDisplayTmr` | 11,577 | 8503 | 2395 | 679 | 3 | 302 | 90.3 |
| 117 | FATAL | 0 | `Manual Pressed` | 11,277 | 8919 | 1590 | 768 | 3 | 303 | 90.5 |
| 118 | FATAL | 0 | `BOX:MANUAL PRESSED` | 11,276 | 8918 | 1590 | 768 | 3 | 303 | 90.7 |
| 119 | FATAL | 0 | `ScanDelay:-#` | 11,241 | 8414 | 2348 | 479 | 3 | 301 | 90.9 |
| 120 | FATAL | 0 | `SRA>ABS SD= # SET=# T#Sh=#` | 11,182 | 8505 | 2079 | 598 | 3 | 301 | 91.0 |
| 121 | FATAL | 0 | `Ctrl Jog SS exit().` | 10,240 | 7395 | 2191 | 654 | 3 | 304 | 91.2 |
| 122 | FATAL | 0 | `Ctrl Jog SS entry().` | 10,187 | 7353 | 2181 | 653 | 3 | 304 | 91.3 |
| 123 | FATAL | 1 | `GM Roll: L # C #` | 10,065 | 8907 | 0 | 1158 | 2 | 179 | 91.5 |
| 124 | FATAL | 1 | `GM Roll: Elapsed #.#` | 10,062 | 8904 | 0 | 1158 | 2 | 179 | 91.7 |
| 125 | FATAL | 0 | `mA# kV# spot# fil#` | 9,502 | 7189 | 1810 | 503 | 3 | 301 | 91.8 |
| 126 | FATAL | 1 | `Pilot Pts #**` | 9,052 | 6747 | 1703 | 602 | 3 | 301 | 91.9 |
| 127 | FATAL | 1 | `Series #**` | 9,052 | 6747 | 1703 | 602 | 3 | 301 | 92.1 |
| 128 | FATAL | 1 | `M# #**` | 9,052 | 6746 | 1704 | 602 | 3 | 301 | 92.2 |
| 129 | FATAL | 3 | `VStopIntTrans` | 8,763 | 6684 | 1364 | 715 | 3 | 302 | 92.4 |
| 130 | FATAL | 0 | `SensorBoard Check Air Sensors Disable.` | 8,608 | 6564 | 1401 | 643 | 3 | 303 | 92.5 |
| 131 | FATAL | 3 | `UnxpVStopReq*` | 8,590 | 6691 | 1182 | 717 | 3 | 302 | 92.6 |
| 132 | FATAL | 1 | `mA MIN_LIMIT=#mA*` | 8,553 | 6368 | 1602 | 583 | 3 | 301 | 92.7 |
| 133 | FATAL | 1 | `mA MAX_LIMIT=#mA*` | 8,553 | 6368 | 1602 | 583 | 3 | 301 | 92.9 |
| 134 | FATAL | 1 | `FirstMa = #` | 8,546 | 6363 | 1600 | 583 | 3 | 301 | 93.0 |
| 135 | FATAL | 0 | `Ctrl Idle SS entry().` | 8,305 | 6321 | 1357 | 627 | 3 | 303 | 93.1 |
| 136 | FATAL | 0 | `Ctrl In-Idle State entry().` | 8,241 | 6278 | 1352 | 611 | 3 | 303 | 93.3 |
| 137 | FATAL | 0 | `Ctrl Idle SS exit().` | 8,194 | 6302 | 1264 | 628 | 3 | 304 | 93.4 |
| 138 | FATAL | 0 | `SensorBoard Check Air Sensors Enable.` | 8,159 | 6284 | 1262 | 613 | 3 | 304 | 93.5 |
| 139 | FATAL | 0 | `Ctrl In-Idle State exit().` | 8,135 | 6263 | 1260 | 612 | 3 | 304 | 93.6 |
| 140 | FATAL | 0 | `SE>ABS SD= # SET=# T#Sh=#` | 8,024 | 5797 | 1748 | 479 | 3 | 301 | 93.8 |
| 141 | FATAL | 0 | `BOX:AUTO PRESSED` | 7,612 | 5442 | 1655 | 515 | 3 | 302 | 93.9 |
| 142 | FATAL | 0 | `Auto Pressed` | 7,609 | 5440 | 1654 | 515 | 3 | 302 | 94.0 |
| 143 | FATAL | 1 | `CallingProfileStore` | 7,401 | 6797 | 0 | 604 | 2 | 178 | 94.1 |
| 144 | FATAL | 1 | `FDOM init Series. Per:# ppr:#` | 7,105 | 6515 | 0 | 590 | 2 | 178 | 94.2 |
| 145 | FATAL | 1 | `Gen Shot#x#SO*` | 7,087 | 1213 | 4713 | 1161 | 3 | 149 | 94.3 |
| 146 | FATAL | 1 | `doseType = FDOM   *` | 6,951 | 6368 | 0 | 583 | 2 | 178 | 94.4 |
| 147 | FATAL | 1 | `ZDOM Not Valid**` | 6,951 | 6368 | 0 | 583 | 2 | 178 | 94.5 |
| 148 | FATAL | 1 | `FDOM - Call DomScanEntry` | 6,951 | 6368 | 0 | 583 | 2 | 178 | 94.6 |
| 149 | FATAL | 1 | `FDOM StartMA # gain #` | 6,949 | 6366 | 0 | 583 | 2 | 178 | 94.8 |
| 150 | FATAL | 1 | `FDOM Valid**` | 6,949 | 6366 | 0 | 583 | 2 | 178 | 94.9 |
| 151 | FATAL | 1 | `Rcvd FdomStartIntTimer` | 6,946 | 6363 | 0 | 583 | 2 | 178 | 95.0 |
| 152 | FATAL | 1 | `FDOM Preheat #` | 6,946 | 6362 | 0 | 584 | 2 | 178 | 95.1 |
| 153 | FATAL | 1 | `Start FDOM Frame ISR**` | 6,946 | 6363 | 0 | 583 | 2 | 178 | 95.2 |
| 154 | FATAL | 1 | `Timeout:#` | 6,946 | 6363 | 0 | 583 | 2 | 178 | 95.3 |
| 155 | FATAL | 1 | `HeatCheckTTS for FDOM` | 6,945 | 6361 | 0 | 584 | 2 | 178 | 95.4 |
| 156 | FATAL | 1 | `HeatCheckTTS id#` | 6,943 | 6359 | 0 | 584 | 2 | 178 | 95.5 |
| 157 | FATAL | 0 | `>INTx#,CCTx#,INJx#` | 6,843 | 3453 | 2387 | 1003 | 3 | 221 | 95.6 |
| 158 | FATAL | 3 | `m event [#X#d#] state [#X#]` | 6,578 | 6328 | 0 | 250 | 2 | 177 | 95.7 |
| 159 | FATAL | 0 | `StartJogIn*` | 6,028 | 3203 | 2764 | 61 | 3 | 269 | 95.8 |
| 160 | FATAL | 1 | `MA err  #.#*` | 5,928 | 3161 | 931 | 1836 | 3 | 302 | 95.9 |
| 161 | WARN | 0 | `∅` | 5,744 | 3290 | 2222 | 232 | 3 | 298 | 96.0 |
| 162 | FATAL | 1 | `Gen Shot#x#L-*` | 5,407 | 4864 | 0 | 543 | 2 | 178 | 96.1 |
| 163 | FATAL | 1 | `LL>ArmedExit: Stop periodic timer.` | 4,885 | 0 | 0 | 4885 | 1 | 47 | 96.1 |
| 164 | FATAL | 1 | `GEN_XON_REQ FDOM` | 4,328 | 992 | 2399 | 937 | 3 | 266 | 96.2 |
| 165 | FATAL | 1 | `LL>Rail=#V PH=#.#A` | 4,270 | 0 | 0 | 4270 | 1 | 47 | 96.3 |
| 166 | FATAL | 3 | `CV: #.# Max: #.#` | 4,157 | 294 | 10 | 3853 | 3 | 165 | 96.3 |
| 167 | FATAL | 0 | `*INJ>InSRWaitGrd` | 4,027 | 3175 | 650 | 202 | 3 | 300 | 96.4 |
| 168 | FATAL | 0 | `*INJ>InSR#PreSHGrd` | 4,027 | 3175 | 650 | 202 | 3 | 300 | 96.5 |
| 169 | FATAL | 0 | `*INJ>InSRWait` | 3,922 | 3079 | 643 | 200 | 3 | 300 | 96.5 |
| 170 | WARN | 3 | `∅` | 3,785 | 2203 | 1489 | 93 | 3 | 282 | 96.6 |
| 171 | FATAL | 1 | `Gen Idle: Gen=#x#A Tube=# Gan=INGENU` | 3,688 | 0 | 0 | 3688 | 1 | 47 | 96.6 |
| 172 | FATAL | 3 | `Hstop:#c:#` | 3,552 | 2440 | 827 | 285 | 3 | 265 | 96.7 |
| 173 | FATAL | 3 | `Hstop:#b:#` | 3,509 | 2404 | 839 | 266 | 3 | 266 | 96.7 |
| 174 | FATAL | 3 | `Hstop:#f:#` | 3,505 | 2391 | 819 | 295 | 3 | 263 | 96.8 |
| 175 | FATAL | 3 | `Hstop:#a:#` | 3,490 | 2366 | 863 | 261 | 3 | 266 | 96.8 |
| 176 | FATAL | 3 | `Hstop:#e:#` | 3,488 | 2396 | 831 | 261 | 3 | 264 | 96.9 |
| 177 | FATAL | 3 | `Hstop:#a#:#` | 3,486 | 2690 | 628 | 168 | 3 | 162 | 96.9 |
| 178 | FATAL | 3 | `Hstop:#d:#` | 3,483 | 2343 | 846 | 294 | 3 | 265 | 97.0 |

Below the cut: 3587 templates, 195,719 rows.

