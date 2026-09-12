// ==UserScript==
// @name         iOS Iframe Video Audio Mix
// @namespace    ios-audio-mix
// @version      1.0
// @description  Automatically sets iframe-hosted HTML5 video audio session to transient on iOS Safari.
// @match        *://*/*
// @run-at       document-start
// @inject-into  content
// ==/UserScript==

(() => {
  // TOP 페이지는 건드리지 않고 iframe에서만 동작
  if (window.top === window) return;

  const boundVideos = new WeakSet();

  function setTransient() {
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = "transient";
      }
    } catch (_) {}
  }

  function reinforceTransient() {
    [0, 50, 200, 500, 1000, 2000].forEach(ms => {
      setTimeout(setTransient, ms);
    });
  }

  function bindVideo(video) {
    if (boundVideos.has(video)) return;
    boundVideos.add(video);

    reinforceTransient();

    [
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "canplaythrough",
      "play",
      "playing",
      "seeking",
      "seeked",
      "volumechange"
    ].forEach(eventName => {
      video.addEventListener(eventName, reinforceTransient, true);
    });
  }

  function scanForVideos() {
    const videos = document.querySelectorAll("video");

    if (!videos.length) return;

    setTransient();

    videos.forEach(bindVideo);
  }

  function startObserver() {
    scanForVideos();

    const root = document.documentElement || document;

    const observer = new MutationObserver(scanForVideos);

    observer.observe(root, {
      childList: true,
      subtree: true
    });

    window.addEventListener(
      "pageshow",
      scanForVideos,
      true
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        if (!document.hidden) {
          scanForVideos();
        }
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
