// ==UserScript==
// @name         AudioMix iOS v4 + Volume Lab
// @namespace    audiomix-ios
// @version      4.2.0-beta
// @description  Stable AudioMix v4 plus an opt-in, isolated Web Audio volume lab for Safari HTML5 video.
// @match        *://*/*
// @run-at       document-start
// @inject-into  content
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  // =========================================================
  // PART A — AudioMix v4 stable core
  // =========================================================
  const TARGET_TYPE = "transient";
  const SAFE_REFRESH_TYPE = "ambient";

  const boundVideos = new WeakSet();

  let originalType = null;
  let changedByAudioMix = false;
  let restoreTimer = null;
  let heartbeatTimer = null;
  let lastPulseAt = 0;

  function audioSession() {
    try {
      return navigator.audioSession || null;
    } catch (_) {
      return null;
    }
  }

  function videos() {
    try {
      return [...document.querySelectorAll("video")];
    } catch (_) {
      return [];
    }
  }

  function anyVideoExists() {
    return videos().length > 0;
  }

  function anyVideoPlaying() {
    return videos().some(v =>
      !v.paused &&
      !v.ended &&
      v.readyState >= 2
    );
  }

  function anyMediaPlaying() {
    try {
      return [...document.querySelectorAll("audio,video")].some(m =>
        !m.paused &&
        !m.ended &&
        m.readyState >= 2
      );
    } catch (_) {
      return false;
    }
  }

  function rememberOriginalType(session) {
    if (originalType !== null) return;

    try {
      originalType = session.type || "auto";
    } catch (_) {
      originalType = "auto";
    }
  }

  function ensureTransient() {
    const session = audioSession();
    if (!session || !anyVideoExists()) return;

    rememberOriginalType(session);

    try {
      if (session.type !== TARGET_TYPE) {
        session.type = TARGET_TYPE;
      }
      changedByAudioMix = true;
    } catch (_) {}
  }

  function pulseTransient(delay = 0) {
    setTimeout(() => {
      if (!anyVideoExists()) return;

      const session = audioSession();
      if (!session) return;

      rememberOriginalType(session);
      changedByAudioMix = true;

      try {
        if (session.type === TARGET_TYPE) {
          session.type = SAFE_REFRESH_TYPE;

          setTimeout(() => {
            if (!anyVideoExists()) return;

            const current = audioSession();
            if (!current) return;

            try {
              current.type = TARGET_TYPE;
            } catch (_) {}
          }, 25);
        } else {
          session.type = TARGET_TYPE;
        }
      } catch (_) {}

      lastPulseAt = Date.now();
    }, delay);
  }

  function reinforcePlaybackStart() {
    clearTimeout(restoreTimer);

    ensureTransient();
    [60, 250, 750, 1500, 3000].forEach(pulseTransient);

    startHeartbeat();
  }

  function reinforceSmall() {
    clearTimeout(restoreTimer);

    ensureTransient();
    [80, 400].forEach(pulseTransient);

    if (anyVideoPlaying()) startHeartbeat();
  }

  function restoreOriginalWhenIdle() {
    clearTimeout(restoreTimer);

    restoreTimer = setTimeout(() => {
      if (anyMediaPlaying()) return;

      stopHeartbeat();

      if (!changedByAudioMix) return;

      const session = audioSession();
      if (!session) return;

      try {
        session.type = originalType || "auto";
      } catch (_) {}

      changedByAudioMix = false;
      originalType = null;
    }, 1200);
  }

  function startHeartbeat() {
    if (heartbeatTimer) return;

    heartbeatTimer = setInterval(() => {
      if (!anyVideoPlaying()) {
        stopHeartbeat();
        restoreOriginalWhenIdle();
        return;
      }

      ensureTransient();

      if (Date.now() - lastPulseAt > 8000) {
        pulseTransient();
      }
    }, 2000);
  }

  function stopHeartbeat() {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function bindVideo(video) {
    if (boundVideos.has(video)) return;
    boundVideos.add(video);

    ensureTransient();

    video.addEventListener("play", reinforcePlaybackStart, true);
    video.addEventListener("playing", reinforcePlaybackStart, true);

    [
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "seeking",
      "seeked",
      "ratechange",
      "volumechange",
      "webkitbeginfullscreen",
      "webkitendfullscreen"
    ].forEach(name => {
      video.addEventListener(name, reinforceSmall, true);
    });

    video.addEventListener("pause", restoreOriginalWhenIdle, true);
    video.addEventListener("ended", restoreOriginalWhenIdle, true);
    video.addEventListener("emptied", restoreOriginalWhenIdle, true);
  }

  function scan() {
    const list = videos();
    if (!list.length) return;

    ensureTransient();
    list.forEach(bindVideo);

    VolumeLab.maybeShowLauncher();
  }

  function onUserGesture() {
    if (anyVideoExists()) {
      reinforceSmall();
      return;
    }

    [50, 150, 350, 700, 1400].forEach(ms => {
      setTimeout(scan, ms);
    });
  }

  document.addEventListener("pointerdown", onUserGesture, true);
  document.addEventListener("touchstart", onUserGesture, true);
  document.addEventListener("click", onUserGesture, true);

  function startObserver() {
    scan();

    const root = document.documentElement || document;
    const observer = new MutationObserver(scan);

    observer.observe(root, {
      childList: true,
      subtree: true
    });

    window.addEventListener("pageshow", () => {
      scan();
      if (anyVideoPlaying()) reinforcePlaybackStart();
    }, true);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        scan();
        if (anyVideoPlaying()) reinforcePlaybackStart();
      }
    }, true);

    window.addEventListener("pagehide", () => {
      stopHeartbeat();
    }, true);
  }

  // =========================================================
  // PART B — Volume Lab (isolated, opt-in only)
  // =========================================================
  const VolumeLab = (() => {
    let launcher = null;
    let panel = null;

    let video = null;
    let ctx = null;
    let source = null;
    let gain = null;
    let analyser = null;
    let rmsTimer = null;

    let slider = null;
    let valueEl = null;
    let statusEl = null;
    let infoEl = null;

    function findVideo() {
      const list = videos();

      return (
        list.find(v => !v.paused && !v.ended) ||
        list[0] ||
        null
      );
    }

    function sourceType(v) {
      if (!v) return "UNKNOWN";

      try {
        if (v.srcObject) return "srcObject";

        const src = v.currentSrc || v.src || "";

        if (src.startsWith("blob:")) return "BLOB / MSE";
        if (/\.m3u8($|\?)/i.test(src)) return "HLS";
        if (/\.mp4($|\?)/i.test(src)) return "MP4";

        return src ? "OTHER" : "UNKNOWN";
      } catch (_) {
        return "UNKNOWN";
      }
    }

    function volumeLocked(v) {
      if (!v) return "unknown";

      try {
        return v.matches(":volume-locked");
      } catch (_) {
        return "unknown";
      }
    }

    function setStatus(text) {
      if (statusEl) {
        statusEl.textContent = text;
      }
    }

    function refreshInfo() {
      video = video || findVideo();

      if (!video || !infoEl) return;

      let currentVolume = "?";

      try {
        currentVolume =
          Number(video.volume).toFixed(2);
      } catch (_) {}

      infoEl.innerHTML =
        "Source: " + sourceType(video) +
        "<br>volume-locked: " + volumeLocked(video) +
        "<br>media volume: " + currentVolume +
        "<br>crossOrigin: " +
        (video.crossOrigin || "(none)");
    }

    function stopRmsMonitor() {
      if (!rmsTimer) return;

      clearInterval(rmsTimer);
      rmsTimer = null;
    }

    function monitorRMS() {
      if (!analyser) return;

      const data =
        new Uint8Array(analyser.fftSize);

      stopRmsMonitor();

      rmsTimer = setInterval(() => {
        if (!analyser) return;

        try {
          analyser.getByteTimeDomainData(data);

          let sum = 0;

          for (const x of data) {
            const n = (x - 128) / 128;
            sum += n * n;
          }

          const rms =
            Math.sqrt(sum / data.length);

          setStatus(
            "Gain 연결됨 · RMS " +
            rms.toFixed(4) +
            " · " +
            Math.round(
              (gain?.gain?.value ?? 1) * 100
            ) +
            "%"
          );
        } catch (_) {}
      }, 500);
    }

    async function connectGain() {
      video = findVideo();

      if (!video) {
        setStatus("video 없음");
        return;
      }

      refreshInfo();

      if (source) {
        setStatus(
          "이미 Gain 경로에 연결됨"
        );
        return;
      }

      const type = sourceType(video);

      if (
        type === "HLS" ||
        type === "BLOB / MSE"
      ) {
        setStatus(
          type +
          " 감지 · WebKit에서 무음/비호환 가능성 있음. 연결 시도 중…"
        );
      } else {
        setStatus(
          "Gain 연결 시도 중…"
        );
      }

      try {
        // v4의 transient 정책 유지
        ensureTransient();

        ctx = new AudioContext();

        // 사용자 탭에서 실행되므로 AudioContext resume 가능성 확보
        await ctx.resume();

        source =
          ctx.createMediaElementSource(video);

        gain =
          ctx.createGain();

        analyser =
          ctx.createAnalyser();

        gain.gain.value = 1;
        analyser.fftSize = 2048;

        source.connect(gain);
        gain.connect(analyser);
        analyser.connect(ctx.destination);

        // Web Audio 활성화 후 다시 transient 보강
        ensureTransient();
        [80, 300].forEach(pulseTransient);

        slider.disabled = false;

        setStatus(
          "Gain 연결 성공 · 100%"
        );

        monitorRMS();

      } catch (e) {
        setStatus(
          "연결 실패: " +
          (e?.name || "Error") +
          (
            e?.message
              ? " · " + e.message
              : ""
          )
        );
      }
    }

    function makePanel() {
      if (
        panel ||
        !document.documentElement
      ) {
        return;
      }

      panel =
        document.createElement("div");

      panel.style.cssText = `
        position:fixed;
        right:10px;
        bottom:58px;
        z-index:2147483647;
        width:232px;
        padding:11px;
        border-radius:12px;
        background:rgba(0,0,0,.88);
        color:#fff;
        font:12px -apple-system,BlinkMacSystemFont,sans-serif;
        box-shadow:0 2px 12px rgba(0,0,0,.35);
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      `;

      const header =
        document.createElement("div");

      header.style.cssText =
        "display:flex;" +
        "justify-content:space-between;" +
        "align-items:center;" +
        "margin-bottom:8px;";

      const title =
        document.createElement("b");

      title.textContent =
        "AudioMix Volume Lab";

      const close =
        document.createElement("button");

      close.textContent = "×";

      close.style.cssText =
        "border:0;" +
        "background:transparent;" +
        "color:white;" +
        "font-size:18px;" +
        "padding:0 2px;";

      close.onclick = () => {
        panel.style.display = "none";
      };

      header.append(
        title,
        close
      );

      infoEl =
        document.createElement("div");

      infoEl.style.cssText =
        "line-height:1.45;" +
        "margin-bottom:8px;";

      infoEl.textContent =
        "video 진단 중…";

      const connect =
        document.createElement("button");

      connect.textContent =
        "Gain 연결";

      connect.style.cssText =
        "width:100%;" +
        "padding:7px;" +
        "margin-bottom:9px;" +
        "border-radius:8px;" +
        "border:0;";

      connect.onclick =
        connectGain;

      const row =
        document.createElement("div");

      row.style.cssText =
        "display:flex;" +
        "align-items:center;" +
        "gap:7px;";

      slider =
        document.createElement("input");

      slider.type = "range";
      slider.min = "0";
      slider.max = "100";
      slider.step = "5";
      slider.value = "100";
      slider.disabled = true;

      slider.style.cssText =
        "width:160px;";

      valueEl =
        document.createElement("span");

      valueEl.textContent =
        "100%";

      valueEl.style.cssText =
        "min-width:38px;" +
        "text-align:right;";

      slider.oninput = () => {
        if (!gain || !ctx) return;

        const x =
          Number(slider.value) / 100;

        try {
          gain.gain.setValueAtTime(
            x,
            ctx.currentTime
          );
        } catch (_) {
          try {
            gain.gain.value = x;
          } catch (_) {}
        }

        valueEl.textContent =
          slider.value + "%";
      };

      row.append(
        slider,
        valueEl
      );

      statusEl =
        document.createElement("div");

      statusEl.style.cssText =
        "margin-top:8px;" +
        "line-height:1.35;" +
        "font-size:11px;";

      statusEl.textContent =
        "대기 · Gain 연결 전에는 영상 오디오를 건드리지 않음";

      const warning =
        document.createElement("div");

      warning.style.cssText =
        "margin-top:7px;" +
        "font-size:10px;" +
        "opacity:.7;" +
        "line-height:1.35;";

      warning.textContent =
        "주의: Gain 연결 후 무음/이상 발생 시 페이지 새로고침으로 원복.";

      panel.append(
        header,
        infoEl,
        connect,
        row,
        statusEl,
        warning
      );

      document.documentElement
        .appendChild(panel);

      refreshInfo();
    }

    function maybeShowLauncher() {
      if (
        !anyVideoExists() ||
        !document.documentElement
      ) {
        return;
      }

      if (!launcher) {
        launcher =
          document.createElement("button");

        launcher.textContent =
          "VOL";

        launcher.title =
          "AudioMix Volume Lab";

        launcher.style.cssText = `
          position:fixed;
          right:10px;
          bottom:10px;
          z-index:2147483647;
          width:42px;
          height:36px;
          border:0;
          border-radius:10px;
          background:rgba(0,0,0,.78);
          color:#fff;
          font:700 11px -apple-system,BlinkMacSystemFont,sans-serif;
          box-shadow:0 2px 10px rgba(0,0,0,.3);
        `;

        launcher.onclick = () => {
          if (!panel) {
            makePanel();
          }

          panel.style.display =
            panel.style.display === "none"
              ? "block"
              : "none";

          refreshInfo();
        };

        document.documentElement
          .appendChild(launcher);
      }
    }

    return {
      maybeShowLauncher
    };
  })();

  if (document.documentElement) {
    startObserver();
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      startObserver,
      { once: true }
    );
  }
})();
