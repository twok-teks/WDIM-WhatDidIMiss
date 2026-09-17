const video = document.querySelector('#main-video');
const container = document.querySelector('#player-container');
const status = document.querySelector('#player-status');
const report = () => {
  status.textContent = `${video.paused ? 'Paused' : 'Playing'} · ${video.currentTime.toFixed(1)}s / ${Number.isFinite(video.duration) ? video.duration.toFixed(1) : '?'}s`;
};
for (const event of ['timeupdate', 'loadedmetadata', 'play', 'pause', 'seeked'])
  video.addEventListener(event, report);
video.addEventListener('error', () => {
  status.textContent = 'Could not load sample.webm. See fixtures/README.md.';
});
document.querySelector('#play-pause').addEventListener('click', () => {
  if (video.paused) void video.play();
  else video.pause();
});
document.querySelectorAll('[data-seek]').forEach((button) =>
  button.addEventListener('click', () => {
    video.currentTime = Number(button.dataset.seek);
  }),
);
document.querySelector('#fullscreen').addEventListener('click', () => {
  void container.requestFullscreen().catch((error) => {
    status.textContent = error.message;
  });
});
document.querySelector('#remove-video').addEventListener('click', () => {
  video.pause();
  video.remove();
});
document.querySelector('#restore-video').addEventListener('click', () => {
  if (!video.isConnected) container.prepend(video);
});
document.querySelector('#second-video').addEventListener('click', () => {
  const existing = document.querySelector('#secondary-video');
  if (existing) {
    existing.pause();
    existing.remove();
    return;
  }
  const second = document.createElement('video');
  second.id = 'secondary-video';
  second.controls = true;
  second.muted = true;
  second.src = '/sample.webm';
  second.style.width = '240px';
  second.setAttribute('aria-label', 'Secondary test video');
  container.after(second);
});
document.querySelector('#host-css').addEventListener('click', () => {
  const existing = document.querySelector('#hostile-styles');
  if (existing) {
    existing.remove();
    return;
  }
  const style = document.createElement('style');
  style.id = 'hostile-styles';
  style.textContent =
    'html { font-size: 30px !important; } button { background: #ad2968 !important; border-radius: 0 !important; font-family: monospace !important; } h1 { font-size: 45px !important; } textarea { background: yellow !important; }';
  document.head.append(style);
});
document.querySelector('#change-route').addEventListener('click', () => {
  history.pushState({}, '', `/?media=${Date.now()}`);
});
