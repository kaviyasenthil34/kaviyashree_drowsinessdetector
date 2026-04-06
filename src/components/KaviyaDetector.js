// KaviyaDetector.js
// 24BCE2348 — KaviyaShree S
// BCSE203E Web Programming
// EAR using direct landmark indices — most reliable method

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';

// ══════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════
const CFG = {
  EAR_THRESHOLD   : 0.21,
  EAR_CONSEC      : 2,
  EAR_DROWSY      : 6,
  MAR_THRESHOLD   : 0.50,
  MAR_CONSEC      : 5,
  PERCLOS_LIMIT   : 12,
  PERCLOS_WINDOW  : 200,
  HEAD_NOD_THRESH : 10,
  CRITICAL_FRAMES : 18,
  LOOP_MS    : 60,
  MODEL_PATH : process.env.PUBLIC_URL + '/models',
};

// ══════════════════════════════════════════════════════════════
// VOICE ENGINE
// ══════════════════════════════════════════════════════════════
const Voice = {
  ready : false,
  voices: [],
  init() {
    if (this.ready) return;
    if (!window.speechSynthesis) return;
    const load = () => { this.voices = window.speechSynthesis.getVoices(); this.ready = true; };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0; u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    } catch (_) {}
  },
  speak(text, urgent = false) {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.volume = 1.0;
      u.rate  = urgent ? 1.3 : 1.0;
      u.pitch = urgent ? 1.2 : 1.0;
      const local = this.voices.find(v => v.lang.startsWith('en') && v.localService);
      const any   = this.voices.find(v => v.lang.startsWith('en'));
      if (local) u.voice = local; else if (any) u.voice = any;
      window.speechSynthesis.speak(u);
      console.log(`[Voice] "${text}"`);
    } catch (err) { console.warn('[Voice]', err.message); }
  },
  stop() { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {} },
};

// ══════════════════════════════════════════════════════════════
// BEEP
// ══════════════════════════════════════════════════════════════
function beep(freq = 880, dur = 300) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq; osc.type = 'square';
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
    osc.start(); osc.stop(ctx.currentTime + dur / 1000);
    setTimeout(() => ctx.close(), dur + 100);
  } catch (_) {}
}

// ══════════════════════════════════════════════════════════════
// MATH
// ══════════════════════════════════════════════════════════════
function dist(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function calcEAR(pos) {
  if (!pos || pos.length < 68) return 0.30;
  const lA = dist(pos[37], pos[41]);
  const lB = dist(pos[38], pos[40]);
  const lC = dist(pos[36], pos[39]);
  const earL = lC < 0.001 ? 0.30 : (lA + lB) / (2.0 * lC);
  const rA = dist(pos[43], pos[47]);
  const rB = dist(pos[44], pos[46]);
  const rC = dist(pos[42], pos[45]);
  const earR = rC < 0.001 ? 0.30 : (rA + rB) / (2.0 * rC);
  return (earL + earR) / 2;
}

function calcMAR(pos) {
  if (!pos || pos.length < 68) return 0;
  const v = dist(pos[51], pos[57]);
  const h = dist(pos[48], pos[54]);
  return h < 0.001 ? 0 : v / h;
}

function calcPERCLOS(win, thr) {
  if (!win.length) return 0;
  return parseFloat(((win.filter(e => e < thr).length / win.length) * 100).toFixed(1));
}

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════
function freshState() {
  return {
    earCounter      : 0,
    marCounter      : 0,
    criticalCounter : 0,
    totalYawns      : 0,
    totalAlerts     : 0,
    earWindow       : [],
    prevNoseY       : null,
    prevFaceW       : null,
    lastVoiceTime   : 0,
    lastVoiceLevel  : 0,
    calibFrames     : [],
    calibDone       : false,
    personalThr     : CFG.EAR_THRESHOLD,
    running         : false,
    frameCount      : 0,
  };
}

const DEFAULT_METRICS = {
  ear: 0.30, mar: 0.0,
  perclos: 0.0, pitch: 0.0,
  yawns: 0, alerts: 0,
  faceDetected  : false,
  alertLevel    : 0,
  alertText     : 'System Ready — 24BCE2348 KaviyaShree',
  calibProgress : 0,
  calibDone     : false,
  personalThr   : CFG.EAR_THRESHOLD,
};

// ══════════════════════════════════════════════════════════════
// DOWNLOAD LOG HELPER
// ══════════════════════════════════════════════════════════════
function downloadLog(events) {
  if (!events || events.length === 0) return;
  const header = 'Time,Type,Level,EAR,PERCLOS,Message\n';
  const rows = events.map(e =>
    `${new Date(e.timestamp).toLocaleTimeString()},${e.type},${e.level},${e.ear},${e.perclos},"${e.message}"`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `KaviyaShree_DrowsinessLog_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════
function KaviyaDetector({ onEvent, isActive, setIsActive }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const loopRef   = useRef(null);
  const stateRef  = useRef(freshState());

  const [modelStatus, setModelStatus] = useState('loading');
  const [metrics,     setMetrics]     = useState(DEFAULT_METRICS);

  // ── Internal event log state ─────────────────────────────
  const [eventLog, setEventLog] = useState([]);

  // Helper: push an event into the internal log AND call parent onEvent
  const pushEvent = useCallback((evt) => {
    const stamped = { ...evt, timestamp: Date.now() };
    setEventLog(prev => [stamped, ...prev].slice(0, 200)); // keep last 200
    onEvent?.(stamped);
  }, [onEvent]);

  // ── Load models ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(CFG.MODEL_PATH);
        await faceapi.nets.faceLandmark68Net.loadFromUri(CFG.MODEL_PATH);
        if (!cancelled) setModelStatus('ready');
      } catch (err) {
        console.error('[Models]', err.message);
        if (!cancelled) setModelStatus('failed');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ══════════════════════════════════════════════════════════
  // DETECTION LOOP
  // ══════════════════════════════════════════════════════════
  const runLoop = useCallback(async () => {
    const s = stateRef.current;
    if (!s.running) return;

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || video.readyState < 2 || video.paused || video.ended) {
      loopRef.current = setTimeout(runLoop, 100);
      return;
    }

    const ctx = canvas.getContext('2d');
    s.frameCount++;

    let detection = null;
    try {
      detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
          scoreThreshold : 0.2,
          inputSize      : 416,
        }))
        .withFaceLandmarks();
    } catch (_) {
      loopRef.current = setTimeout(runLoop, CFG.LOOP_MS);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!detection) {
      s.earCounter = 0;
      setMetrics(prev => ({
        ...prev,
        faceDetected: false,
        alertLevel  : 0,
        alertText   : '❌ No Face — move closer or improve lighting',
      }));
      loopRef.current = setTimeout(runLoop, CFG.LOOP_MS);
      return;
    }

    const pos = detection.landmarks.positions;
    const ear = calcEAR(pos);
    const mar = calcMAR(pos);

    if (s.frameCount % 30 === 0) {
      console.log(`[EAR] frame=${s.frameCount} ear=${ear.toFixed(3)} thr=${s.personalThr.toFixed(3)} calibDone=${s.calibDone}`);
    }

    // ── AUTO-CALIBRATION ─────────────────────────────────
    if (!s.calibDone && s.frameCount <= 40) {
      s.calibFrames.push(ear);
      if (s.frameCount === 40) {
        const mean   = s.calibFrames.reduce((a, b) => a + b, 0) / s.calibFrames.length;
        const stddev = Math.sqrt(
          s.calibFrames.reduce((a, b) => a + (b - mean) ** 2, 0) / s.calibFrames.length
        );
        const byGap    = mean - 0.08;
        const byStddev = mean - 2 * stddev;
        const raw      = Math.max(byGap, byStddev);
        s.personalThr  = parseFloat(Math.min(0.25, Math.max(0.13, raw)).toFixed(3));
        s.calibDone    = true;
        console.log(
          `[Calib] mean=${mean.toFixed(3)} std=${stddev.toFixed(3)} ` +
          `thr=${s.personalThr.toFixed(3)} gap=${(mean - s.personalThr).toFixed(3)}`
        );
        Voice.speak(`Calibration done. Threshold ${s.personalThr.toFixed(2)}. Stay alert.`, false);
      }
    }

    const THR = s.calibDone ? s.personalThr : CFG.EAR_THRESHOLD;

    s.earWindow.push(ear);
    if (s.earWindow.length > CFG.PERCLOS_WINDOW) s.earWindow.shift();

    if (ear < THR) s.earCounter++;
    else            s.earCounter = 0;

    if (mar > CFG.MAR_THRESHOLD) {
      s.marCounter++;
    } else {
      if (s.marCounter >= CFG.MAR_CONSEC) s.totalYawns++;
      s.marCounter = 0;
    }

    const perclos = calcPERCLOS(s.earWindow, THR);

    const noseTip = pos[30];
    const faceW   = dist(pos[0], pos[16]);
    let   pitch   = 0;
    if (s.prevNoseY !== null && s.prevFaceW > 10) {
      pitch = Math.min(Math.abs(((noseTip.y - s.prevNoseY) / s.prevFaceW) * 100), 90);
    }
    s.prevNoseY = noseTip.y;
    s.prevFaceW = faceW;

    // ══════════════════════════════════════════════════════
    // ALERT LEVELS
    // ══════════════════════════════════════════════════════
    let level = 0;
    const why = [];

    if (s.calibDone) {
      if (s.earCounter >= CFG.EAR_CONSEC)  { level = Math.max(level, 1); why.push('Eyes closing'); }
      if (s.marCounter >= 3)               { level = Math.max(level, 1); why.push('Yawning'); }
      if (s.earCounter >= CFG.EAR_DROWSY)  { level = Math.max(level, 2); why.push('Eyes closed long'); }
      if (perclos > CFG.PERCLOS_LIMIT)     { level = Math.max(level, 2); why.push(`PERCLOS ${perclos}%`); }
      if (pitch > CFG.HEAD_NOD_THRESH)     { level = Math.max(level, 2); why.push('Head nodding'); }
      if (s.marCounter >= CFG.MAR_CONSEC)  { level = Math.max(level, 2); why.push('Sustained yawn'); }

      if (level >= 2) s.criticalCounter++;
      else            s.criticalCounter = Math.max(0, s.criticalCounter - 1);
      if (s.criticalCounter >= CFG.CRITICAL_FRAMES) level = 3;
    }

    // ══════════════════════════════════════════════════════
    // VOICE + EVENT LOG
    // ══════════════════════════════════════════════════════
    const now       = Date.now();
    const timeSince = now - s.lastVoiceTime;

    if (level === 3 && timeSince > 3000) {
      beep(330, 600);
      Voice.speak('Wake up! Pull over now! You are falling asleep!', true);
      s.totalAlerts++; s.lastVoiceTime = now;
      pushEvent({ type: 'CRITICAL', level: 3, ear: ear.toFixed(3), perclos: `${perclos}%`, message: `CRITICAL — ${why.join(', ')}` });
    } else if (level === 2 && timeSince > 4000) {
      beep(550, 400);
      Voice.speak('Stay awake! Drowsiness detected!', true);
      s.totalAlerts++; s.lastVoiceTime = now;
      pushEvent({ type: 'DROWSY', level: 2, ear: ear.toFixed(3), perclos: `${perclos}%`, message: `DROWSY — ${why.join(', ')}` });
    } else if (level === 1 && timeSince > 4000) {
      Voice.speak('Stay awake. Eyes are closing.', false);
      s.lastVoiceTime = now;
      pushEvent({ type: 'WARNING', level: 1, ear: ear.toFixed(3), perclos: `${perclos}%`, message: `WARNING — ${why.join(', ')}` });
    } else if (level === 0) {
      if (s.lastVoiceLevel > 0) Voice.stop();
      s.lastVoiceTime = 0;
    }
    s.lastVoiceLevel = level;

    let alertText = '✓ Alert & Active — KaviyaShree 24BCE2348';
    if (!s.calibDone) alertText = `⏳ Calibrating... keep eyes open (${s.frameCount}/40 frames)`;
    else if (level === 3) alertText = '🚨 CRITICAL — PULL OVER NOW!';
    else if (level === 2) alertText = '⚠ DROWSINESS DETECTED';
    else if (level === 1) alertText = `⚡ WARNING — ${why.join(', ')}`;

    drawOverlay(ctx, detection, pos, level, canvas, s.calibDone, THR, ear);

    setMetrics({
      ear          : parseFloat(ear.toFixed(3)),
      mar          : parseFloat(mar.toFixed(3)),
      perclos,
      pitch        : parseFloat(pitch.toFixed(1)),
      yawns        : s.totalYawns,
      alerts       : s.totalAlerts,
      faceDetected : true,
      alertLevel   : level,
      alertText,
      calibProgress: Math.min(100, Math.round((s.frameCount / 40) * 100)),
      calibDone    : s.calibDone,
      personalThr  : s.personalThr,
    });

    loopRef.current = setTimeout(runLoop, CFG.LOOP_MS);
  }, [pushEvent]);

  useEffect(() => {
    if (isActive) {
      stateRef.current         = freshState();
      stateRef.current.running = true;
      setMetrics(DEFAULT_METRICS);
      setEventLog([]);
      loopRef.current = setTimeout(runLoop, 300);
    } else {
      stateRef.current.running = false;
      clearTimeout(loopRef.current);
      Voice.stop();
      setMetrics(DEFAULT_METRICS);
    }
    return () => {
      stateRef.current.running = false;
      clearTimeout(loopRef.current);
      Voice.stop();
    };
  }, [isActive, runLoop]);

  // ══════════════════════════════════════════════════════════
  // CANVAS DRAW
  // ══════════════════════════════════════════════════════════
  function drawOverlay(ctx, det, pos, level, canvas, calibDone, THR, ear) {
    const COLORS = ['#00FF41', '#FFB800', '#FF4444', '#FF0000'];
    const col    = COLORS[Math.min(level, 3)];
    const box    = det.detection.box;

    ctx.strokeStyle = col; ctx.lineWidth = level >= 2 ? 3 : 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    const leftEyePts = [36,37,38,39,40,41];
    ctx.beginPath();
    leftEyePts.forEach((idx, i) => {
      if (i === 0) ctx.moveTo(pos[idx].x, pos[idx].y);
      else         ctx.lineTo(pos[idx].x, pos[idx].y);
    });
    ctx.closePath();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    leftEyePts.forEach(idx => {
      ctx.beginPath(); ctx.arc(pos[idx].x, pos[idx].y, 3, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
    });

    const rightEyePts = [42,43,44,45,46,47];
    ctx.beginPath();
    rightEyePts.forEach((idx, i) => {
      if (i === 0) ctx.moveTo(pos[idx].x, pos[idx].y);
      else         ctx.lineTo(pos[idx].x, pos[idx].y);
    });
    ctx.closePath();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    rightEyePts.forEach(idx => {
      ctx.beginPath(); ctx.arc(pos[idx].x, pos[idx].y, 3, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
    });

    ctx.beginPath();
    for (let i = 48; i <= 59; i++) {
      if (i === 48) ctx.moveTo(pos[i].x, pos[i].y);
      else          ctx.lineTo(pos[i].x, pos[i].y);
    }
    ctx.closePath(); ctx.strokeStyle = '#FF8C00'; ctx.lineWidth = 1.5; ctx.stroke();

    if (level >= 2) {
      ctx.fillStyle = level === 3 ? 'rgba(255,0,0,0.18)' : 'rgba(255,68,68,0.10)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = level === 3 ? '#FF0000' : '#FF4444';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
      ctx.fillText(level === 3 ? '!! CRITICAL — PULL OVER !!' : '⚠ DROWSINESS DETECTED', canvas.width / 2, 55);
      ctx.shadowBlur = 0; ctx.textAlign = 'left';
    } else if (level === 1) {
      ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#FFB800'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
      ctx.fillText('⚡ EYES CLOSING — STAY AWAKE', canvas.width / 2, 48);
      ctx.shadowBlur = 0; ctx.textAlign = 'left';
    }

    if (calibDone) {
      const barW = 140, barH = 10;
      const bx = 10, by = canvas.height - 55;
      const fill = Math.min(1, Math.max(0, ear / 0.40));
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 2, by - 18, barW + 4, barH + 26);
      ctx.fillStyle = '#222'; ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = ear < THR ? '#FF4444' : '#00FF41';
      ctx.fillRect(bx, by, barW * fill, barH);
      const tx = bx + barW * (THR / 0.40);
      ctx.strokeStyle = '#FFB800'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, by - 2); ctx.lineTo(tx, by + barH + 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '9px monospace';
      ctx.fillText(`EAR ${ear.toFixed(3)}  thr ${THR.toFixed(3)}`, bx, by - 4);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillText('24BCE2348 KaviyaShree', 8, canvas.height - 8);
  }

  // ── Camera start/stop ────────────────────────────────────
  async function startCamera() {
    if (modelStatus !== 'ready') return;
    Voice.init();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video : { width: 640, height: 480, facingMode: 'user' },
        audio : false,
      });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = rej; });
      await video.play();
      setTimeout(() => Voice.speak('Keep eyes open for 2 seconds to calibrate.', false), 700);
      setIsActive(true);
    } catch (err) { alert(`Camera error: ${err.message}`); }
  }

  function stopCamera() {
    const video = videoRef.current;
    if (video?.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, 640, 480);
    Voice.stop(); setIsActive(false);
  }

  const m = metrics;

  // ── Type label helper ────────────────────────────────────
  function typeLabel(type) {
    if (type === 'CRITICAL') return <span className="log_type log_critical">🚨 CRITICAL</span>;
    if (type === 'DROWSY')   return <span className="log_type log_drowsy">⚠ DROWSY</span>;
    return                          <span className="log_type log_warning">⚡ WARNING</span>;
  }

  return (
    <div className="kaviyaShree_detector">

      {/* LEFT — Camera */}
      <div className="camera_section">
        <div className={`video_wrap border_level_${m.alertLevel}`}>
          <video ref={videoRef} width="640" height="480" muted playsInline className="kaviyaShree_video" />
          <canvas ref={canvasRef} width="640" height="480" className="kaviyaShree_canvas" />
          {!isActive && (
            <div className="video_placeholder">
              <div className="ph_icon">👁</div>
              <p>Camera not active</p>
              <small>24BCE2348 KaviyaShree</small>
            </div>
          )}
        </div>

        <div className={`alert_banner banner_${m.alertLevel}`}>{m.alertText}</div>

        {isActive && !m.calibDone && (
          <div className="calib_bar_wrap">
            <div className="calib_bar_label">
              Calibrating to your eyes — keep eyes OPEN · {m.calibProgress}%
            </div>
            <div className="calib_bar_track">
              <div className="calib_bar_fill" style={{ width: `${m.calibProgress}%` }} />
            </div>
          </div>
        )}

        <div className={`model_status_bar ms_${modelStatus}`}>
          {modelStatus === 'loading' && '⏳ Loading face detection models...'}
          {modelStatus === 'ready'   && '✅ Models ready — EAR mode (direct landmarks)'}
          {modelStatus === 'failed'  && '❌ Models failed — place model files in /public/models/'}
        </div>

        <div className="cam_controls">
          {!isActive ? (
            <button className="btn_start" onClick={startCamera} disabled={modelStatus !== 'ready'}>
              {modelStatus === 'loading' ? '⏳ Loading...'
               : modelStatus === 'failed' ? '❌ Models not found'
               : '▶ Start Detection + Voice'}
            </button>
          ) : (
            <button className="btn_stop" onClick={stopCamera}>⏹ Stop</button>
          )}
          <span className="student_tag">24BCE2348 · KaviyaShree · BCSE203E</span>
        </div>
      </div>

      {/* RIGHT — Metrics */}
      <div className="metrics_section">
        <div className="metrics_header">
          <h3>Live Parameters</h3>
          <span className="mh_sub">24BCE2348 KaviyaShree</span>
        </div>

        <div className="metrics_grid">
          <KaviyaMetricCard
            num="1" label="EAR" full="Eye Aspect Ratio ★ Primary"
            value={m.ear?.toFixed(3) ?? '0.300'}
            threshold={`< ${m.personalThr?.toFixed(3) ?? CFG.EAR_THRESHOLD}`}
            isAlert={isActive && m.faceDetected && m.calibDone && m.ear < m.personalThr}
            isPrimary
          />
          <KaviyaMetricCard
            num="2" label="MAR" full="Mouth Aspect Ratio"
            value={m.mar?.toFixed(3) ?? '0.000'}
            threshold={`> ${CFG.MAR_THRESHOLD}`}
            isAlert={isActive && m.faceDetected && m.mar > CFG.MAR_THRESHOLD}
          />
          <KaviyaMetricCard
            num="3" label="PERCLOS" full="Eye Closure % / window"
            value={`${m.perclos ?? 0}%`}
            threshold={`> ${CFG.PERCLOS_LIMIT}%`}
            isAlert={isActive && m.faceDetected && m.perclos > CFG.PERCLOS_LIMIT}
          />
          <KaviyaMetricCard
            num="4" label="Head" full="Head Nod Pitch"
            value={`${m.pitch ?? 0}°`}
            threshold={`> ${CFG.HEAD_NOD_THRESH}°`}
            isAlert={isActive && m.faceDetected && m.pitch > CFG.HEAD_NOD_THRESH}
          />
        </div>

        <div className="session_counters">
          <div className="sc_card">
            <div className="sc_val">{m.yawns}</div>
            <div className="sc_lbl">Yawns</div>
          </div>
          <div className="sc_card sc_alert">
            <div className="sc_val">{m.alerts}</div>
            <div className="sc_lbl">Alerts</div>
          </div>
          <div className="sc_card">
            <div className="sc_val" style={{ fontSize:'14px', color: isActive ? '#00FF41' : '#555' }}>
              {isActive ? '🔊 ON' : '🔇 OFF'}
            </div>
            <div className="sc_lbl">Voice</div>
          </div>
        </div>

        <div className="alert_levels">
          <div className={`al_step ${isActive && m.alertLevel >= 1 ? 'al_warning'  : ''}`}>⚡ Warning</div>
          <div className={`al_step ${isActive && m.alertLevel >= 2 ? 'al_drowsy'   : ''}`}>⚠ Drowsy</div>
          <div className={`al_step ${isActive && m.alertLevel >= 3 ? 'al_critical' : ''}`}>🚨 Critical</div>
        </div>

        <div className={`face_status ${isActive && m.faceDetected ? 'fs_on' : 'fs_off'}`}>
          {!isActive        ? '⏸ Detection stopped'
           : !m.calibDone  ? '⏳ Calibrating — keep eyes fully open...'
           : m.faceDetected ? `✅ Calibrated · EAR threshold: ${m.personalThr?.toFixed(3)}`
           :                  '❌ No Face in Frame'}
        </div>

        {isActive && m.calibDone && m.faceDetected && (
          <div className="calib_tip">
            📊 EAR now: <strong>{m.ear?.toFixed(3)}</strong>&nbsp;|&nbsp;
            Threshold: <strong>{m.personalThr?.toFixed(3)}</strong><br />
            Close eyes → EAR drops below threshold → alert fires
          </div>
        )}

        <div className="profile_links">
          <a href="portfolio.html" target="_blank" rel="noopener noreferrer" className="pl_link pl_portfolio">
            ◈ Portfolio — KaviyaShree
          </a>
          <a href="https://github.com/kaviyasenthil34" target="_blank" rel="noopener noreferrer" className="pl_link pl_github">
            GitHub ↗
          </a>
          {/* ── Download CV ── place your PDF at public/cv/KaviyaShree_CV.pdf */}
          <a
            href={process.env.PUBLIC_URL + '/cv/KaviyaShree_CV.pdf'}
            download="KaviyaShree_CV.pdf"
            className="pl_link pl_cv"
          >
            ⬇ Download CV
          </a>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
          SESSION EVENT LOG — full width below both panels
      ════════════════════════════════════════════════════ */}
      <div className="session_log_section">
        <div className="session_log_header">
          <span className="log_title">SESSION EVENT LOG</span>
          <div className="log_header_right">
            <span className="log_count">
              {eventLog.length} event{eventLog.length !== 1 ? 's' : ''} recorded &nbsp;·&nbsp; 24BCE2348 KaviyaShree
            </span>
            {eventLog.length > 0 && (
              <button className="btn_download_log" onClick={() => downloadLog(eventLog)}>
                ⬇ Download Log
              </button>
            )}
          </div>
        </div>

        {eventLog.length === 0 ? (
          <div className="log_empty">No events yet — start detection to begin recording.</div>
        ) : (
          <div className="log_table_wrap">
            <table className="log_table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Level</th>
                  <th>EAR</th>
                  <th>PERCLOS</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {eventLog.map((e, i) => (
                  <tr key={i} className={`log_row row_${e.type.toLowerCase()}`}>
                    <td className="log_time">{new Date(e.timestamp).toLocaleTimeString()}</td>
                    <td>{typeLabel(e.type)}</td>
                    <td className="log_level">{e.level}</td>
                    <td className="log_num">{e.ear}</td>
                    <td className="log_num">{e.perclos}</td>
                    <td className="log_msg">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

function KaviyaMetricCard({ num, label, full, value, threshold, isAlert, isPrimary }) {
  return (
    <div className={`metric_card ${isAlert ? 'mc_alert' : 'mc_normal'} ${isPrimary ? 'mc_primary' : ''}`}>
      <div className="mc_num">{num}</div>
      <div className="mc_label">
        {label}
        {isPrimary && <span style={{ fontSize:'8px', marginLeft:'4px', color:'#c9a84c' }}>★</span>}
      </div>
      <div className="mc_full">{full}</div>
      <div className="mc_value">{value}</div>
      <div className="mc_thr">threshold: {threshold}</div>
      <div className={`mc_dot ${isAlert ? 'dot_alert' : 'dot_ok'}`}>
        {isAlert ? '▲ ALERT' : '● OK'}
      </div>
    </div>
  );
}

export default KaviyaDetector;