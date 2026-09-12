// ==UserScript==
// @name         AudioMix iOS - Stable v4
// @namespace    audiomix-ios
// @version      4.0.0
// @description  Keeps Safari HTML5 video mixable with audio from other apps. Works in top pages and iframes.
// @match        *://*/*
// @run-at       document-start
// @inject-into  content
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

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

    if (!session || !anyVideoExists()) {
      return;
    }

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

    [
      60,
      250,
      750,
      1500,
      3000
    ].forEach(pulseTransient);

    startHeartbeat();
  }

  function reinforceSmall() {
    clearTimeout(restoreTimer);

    ensureTransient();

    [
      80,
      400
    ].forEach(pulseTransient);

    if (anyVideoPlaying()) {
      startHeartbeat();
    }
  }

  function restoreOriginalWhenIdle() {
    clearTimeout(restoreTimer);

    restoreTimer = setTimeout(() => {
      if (anyMediaPlaying()) {
        return;
      }

      stopHeartbeat();

      if (!changedByAudioMix) {
        return;
      }

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
    if (heartbeatTimer) {
      return;
    }

    heartbeatTimer = setInterval(() => {
      if (!anyVideoPlaying()) {
        stopHeartbeat();
        restoreOriginalWhenIdle();

        return;
      }

      ensureTransient();

      if (
        Date.now() - lastPulseAt >
        8000
      ) {
        pulseTransient();
      }

    }, 2000);
  }

  function stopHeartbeat() {
    if (!heartbeatTimer) {
      return;
    }

    clearInterval(heartbeatTimer);

    heartbeatTimer = null;
  }

  function bindVideo(video) {
    if (boundVideos.has(video)) {
      return;
    }

    boundVideos.add(video);

    ensureTransient();

    video.addEventListener(
      "play",
      reinforcePlaybackStart,
      true
    );

    video.addEventListener(
      "playing",
      reinforcePlaybackStart,
      true
    );

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
      video.addEventListener(
        name,
        reinforceSmall,
        true
      );
    });

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

    if (!list.length) {
      return;
    }

    ensureTransient();

    list.forEach(bindVideo);
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
      setTimeout(scan, ms);
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
      {
        once: true
      }
    );
  }

})();
