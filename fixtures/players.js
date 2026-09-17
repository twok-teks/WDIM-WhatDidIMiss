const players = document.querySelector('#players');
const status = document.querySelector('#lab-status');
let number = 0;
const localVideos = new Set();
const createVideo = (label) => {
  const video = document.createElement('video');
  video.controls = true;
  video.muted = true;
  video.preload = 'auto';
  video.src = '/sample.webm';
  video.style.cssText = 'width:100%;max-width:480px;display:block';
  video.setAttribute('aria-label', label);
  localVideos.add(video);
  return video;
};
document.querySelector('#add-iframe').addEventListener('click', () => {
  const frame = document.createElement('iframe');
  frame.title = 'Cross-origin movie player';
  frame.src = 'http://127.0.0.1:3000/embedded.html';
  frame.allow = 'autoplay; picture-in-picture; fullscreen';
  frame.style.cssText =
    'width:100%;height:350px;border:1px solid #52604f;margin-top:20px';
  players.append(frame);
  status.textContent =
    'Player uses 127.0.0.1 while the outer page uses localhost: different origins.';
});
for (const mode of ['open', 'closed']) {
  document.querySelector('#add-' + mode).addEventListener('click', () => {
    const host = document.createElement('div');
    players.append(host);
    const root = host.attachShadow({ mode });
    root.append(createVideo(mode + '-shadow movie ' + ++number));
    status.textContent = 'Added ' + mode + ' shadow-root player.';
  });
}
document.querySelector('#add-blank').addEventListener('click', () => {
  const frame = document.createElement('iframe');
  frame.title = 'Srcdoc player';
  frame.srcdoc =
    '<video controls muted preload="auto" src="/sample.webm" aria-label="Srcdoc movie" style="width:100%"></video>';
  frame.style.cssText =
    'width:100%;height:280px;border:1px solid #52604f;margin-top:20px';
  players.append(frame);
});
document.querySelector('#add-hidden').addEventListener('click', () => {
  const video = createVideo('Hidden playing movie');
  video.style.display = 'none';
  players.append(video);
  void video.play().then(() => {
    status.textContent =
      'Hidden video is playing. It should still appear in WDIM.';
  });
});
document.querySelector('#remove-players').addEventListener('click', () => {
  localVideos.forEach((video) => video.pause());
  localVideos.clear();
  players.replaceChildren();
  status.textContent = 'All player containers removed.';
});
