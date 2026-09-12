// ==UserScript==
// @name         iOS Video Audio Mix - Gesture
// @namespace    ios-audio-mix
// @version      3.0
// @match        *://*/*
// @run-at       document-start
// @inject-into  content
// ==/UserScript==

(() => {
  function hasVideo() {
    return document.querySelector("video") !== null;
  }

  function setTransient() {
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = "transient";
      }
    } catch (_) {}
  }

  function reinforce() {
    // 수동 T 버튼을 누른 직후 상황을 흉내 냄
    [0, 30, 100, 250, 500, 1000, 2000, 4000].forEach(ms => {
      setTimeout(() => {
        if (hasVideo()) setTransient();
      }, ms);
    });
  }

  function onUserGesture() {
    // 영상이 이미 있으면 즉시 적용
    if (hasVideo()) {
      reinforce();
      return;
    }

    // 탭 직후 플레이어/video가 생성되는 사이트 대응
    [50, 150, 300, 700, 1500].forEach(ms => {
      setTimeout(() => {
        if (hasVideo()) reinforce();
      }, ms);
    });
  }

  // 핵심:
  // 사용자가 실제로 화면을 터치/클릭하는 순간 transient를 적용
  document.addEventListener("pointerdown", onUserGesture, true);
  document.addEventListener("touchstart", onUserGesture, true);
  document.addEventListener("click", onUserGesture, true);

  // 영상 자체가 재생 상태에 들어갈 때도 보강
  document.addEventListener("play", e => {
    if (e.target instanceof HTMLMediaElement) {
      reinforce();
    }
  }, true);

  document.addEventListener("playing", e => {
    if (e.target instanceof HTMLMediaElement) {
      reinforce();
    }
  }, true);

  // 동적으로 생성되는 video 감지
  const observer = new MutationObserver(() => {
    if (hasVideo()) {
      // 여기서는 세션을 바꾸지 않고,
      // 실제 사용자 동작/play 이벤트를 기다림
    }
  });

  function startObserver() {
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
  }

  if (document.documentElement) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver, {
      once: true
    });
  }
})();
