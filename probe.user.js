// ==UserScript==
// @name         Audio Session Frame Probe
// @namespace    ios-audio-probe
// @version      1.0
// @description  Show frame/video/audio-session information
// @match        *://*/*
// @run-at       document-end
// @inject-into  content
// ==/UserScript==

(() => {
  const box = document.createElement("div");

  box.style.cssText = `
    position:fixed;
    top:8px;
    left:8px;
    z-index:2147483647;
    background:rgba(0,0,0,.88);
    color:#fff;
    padding:8px;
    border-radius:8px;
    font:12px -apple-system,sans-serif;
    line-height:1.5;
  `;

  const info = document.createElement("div");

  const t = document.createElement("button");
  t.textContent = "T";
  t.style.marginRight = "6px";

  const a = document.createElement("button");
  a.textContent = "A";

  box.append(info, t, a);
  document.documentElement.appendChild(box);

  function update(msg = "") {
    const videos = [...document.querySelectorAll("video")];

    const playing = videos.filter(v =>
      !v.paused && !v.ended
    ).length;

    let session = "unsupported";

    try {
      if (navigator.audioSession) {
        session =
          navigator.audioSession.type +
          " / " +
          navigator.audioSession.state;
      }
    } catch {}

    info.innerHTML =
      (window.top === window ? "TOP" : "IFRAME") +
      "<br>video: " + videos.length +
      "<br>playing: " + playing +
      "<br>AS: " + session +
      (msg ? "<br>" + msg : "");
  }

  t.onclick = () => {
    try {
      navigator.audioSession.type = "transient";
      update("→ transient");
    } catch {
      update("transient failed");
    }
  };

  a.onclick = () => {
    try {
      navigator.audioSession.type = "ambient";
      update("→ ambient");
    } catch {
      update("ambient failed");
    }
  };

  setInterval(update, 500);
  update();
})();
