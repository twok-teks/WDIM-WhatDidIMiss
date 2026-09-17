const video = document.querySelector('video');
document.querySelector('#seek').addEventListener('click', () => {
  video.currentTime = 47;
});
document.querySelector('#pip').addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
  } catch (error) {
    document.querySelector('#pip').textContent = error.message;
  }
});
