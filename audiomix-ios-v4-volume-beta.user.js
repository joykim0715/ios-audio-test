// ==UserScript==
// @name         AudioMix iOS v4 + Volume Beta
// @namespace    audiomix-ios
// @version      4.1.0-beta
// @description  Keeps Safari HTML5 video mixable with other app audio and adds experimental per-video volume control.
// @match        *://*/*
// @run-at       document-start
// @inject-into  content
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const TARGET_TYPE = "transient";
  const SAFE_REFRESH_TYPE = "ambient";

  let targetVolume = 1.0;

  const boundVideos = new WeakSet();

  let originalType = null;
  let changedByAudioMix = false;
  let restoreTimer = null;
  let heartbeatTimer = null;
  let lastPulseAt = 0;

  let volumePanel = null;
  let volumeLabel = null;

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

    if (anyVideoPlaying()) {
      startHeartbeat();
    }
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

  function applyVideoVolume(video) {
    try {
      video.volume = targetVolume;
    } catch (_) {}
  }

  function applyVolumeToAllVideos() {
    videos().forEach(applyVideoVolume);
  }

  function ensureVolumePanel() {
    if (
      volumePanel ||
      !document.documentElement ||
      !anyVideoExists()
    ) {
      return;
    }

    volumePanel = document.createElement("div");

    volumePanel.style.cssText = `
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 2147483647;
      width: 190px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(0,0,0,.82);
      color: #fff;
      font: 12px -apple-system,BlinkMacSystemFont,sans-serif;
      box-shadow: 0 2px 12px rgba(0,0,0,.35);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    `;

    const title = document.createElement("div");

    title.textContent =
      "AudioMix · Safari 영상 음량";

    title.style.cssText =
      "font-weight:600;margin-bottom:8px;";

    const row = document.createElement("div");

    row.style.cssText =
      "display:flex;align-items:center;gap:8px;";

    const slider = document.createElement("input");

    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "5";
    slider.value =
      String(Math.round(targetVolume * 100));

    slider.style.cssText =
      "width:130px;";

    volumeLabel =
      document.createElement("span");

    volumeLabel.textContent =
      `${Math.round(targetVolume * 100)}%`;

    volumeLabel.style.cssText =
      "min-width:38px;text-align:right;";

    slider.addEventListener("input", () => {
      targetVolume =
        Number(slider.value) / 100;

      volumeLabel.textContent =
        `${slider.value}%`;

      applyVolumeToAllVideos();
    });

    row.append(
      slider,
      volumeLabel
    );

    volumePanel.append(
      title,
      row
    );

    document.documentElement
      .appendChild(volumePanel);
  }

  function bindVideo(video) {
    if (boundVideos.has(video)) return;

    boundVideos.add(video);

    ensureTransient();
    applyVideoVolume(video);
    ensureVolumePanel();

    video.addEventListener(
      "play",
      () => {
        applyVideoVolume(video);
        reinforcePlaybackStart();
      },
      true
    );

    video.addEventListener(
      "playing",
      () => {
        applyVideoVolume(video);
        reinforcePlaybackStart();
      },
      true
    );

    [
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "seeking",
      "seeked",
      "ratechange",
      "webkitbeginfullscreen",
      "webkitendfullscreen"
    ].forEach(name => {
      video.addEventListener(
        name,
        () => {
          applyVideoVolume(video);
          reinforceSmall();
        },
        true
      );
    });

    video.addEventListener(
      "volumechange",
      () => {
        try {
          if (
            Math.abs(
              video.volume -
              targetVolume
            ) > 0.01
          ) {
            applyVideoVolume(video);
          }
        } catch (_) {}

        reinforceSmall();
      },
      true
    );

    video.addEventListener(
      "pause",
      restoreOriginalWhenIdle,
      true
    );

    video.addEventListener(
      "ended",
      restoreOriginalWhenIdle,
      true
    );

    video.addEventListener(
      "emptied",
      restoreOriginalWhenIdle,
      true
    );
  }

  function scan() {
    const list = videos();

    if (!list.length) return;

    ensureTransient();

    list.forEach(bindVideo);

    ensureVolumePanel();
  }

  function onUserGesture() {
    if (anyVideoExists()) {
      reinforceSmall();
      return;
    }

    [
      50,
      150,
      350,
      700,
      1400
    ].forEach(ms => {
      setTimeout(
        scan,
        ms
      );
    });
  }

  document.addEventListener(
    "pointerdown",
    onUserGesture,
    true
  );

  document.addEventListener(
    "touchstart",
    onUserGesture,
    true
  );

  document.addEventListener(
    "click",
    onUserGesture,
    true
  );

  function startObserver() {
    scan();

    const root =
      document.documentElement ||
      document;

    const observer =
      new MutationObserver(scan);

    observer.observe(
      root,
      {
        childList: true,
        subtree: true
      }
    );

    window.addEventListener(
      "pageshow",
      () => {
        scan();

        if (anyVideoPlaying()) {
          reinforcePlaybackStart();
          applyVolumeToAllVideos();
        }
      },
      true
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        if (!document.hidden) {
          scan();

          if (anyVideoPlaying()) {
            reinforcePlaybackStart();
            applyVolumeToAllVideos();
          }
        }
      },
      true
    );

    window.addEventListener(
      "pagehide",
      () => {
        stopHeartbeat();
      },
      true
    );
  }

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
