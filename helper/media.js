const { bestCandidate } = require('./instagram');

/**
 * Extract all media URLs from a single Instagram post.
 * Handles carousel posts, images, and videos.
 * @param {Object} post - Instagram post object from the API
 * @returns {string[]} Array of media URLs (fbcdn.net filtered)
 */
function extractPostMediaUrls(post) {
  const urls = [];

  const collectFromMedia = (media) => {
    const imageUrl = bestCandidate(media.image_versions2?.candidates);
    const videoUrl = media.video_versions?.[0]?.url;

    // media_type: 2 = video, media_type: 1 = image
    let url;
    if (media.media_type === 2) {
      url = videoUrl || imageUrl;
    } else {
      url = imageUrl || videoUrl;
    }

    if (url && url.includes('fbcdn.net')) {
      urls.push(url);
    }
  };

  if (post.carousel_media?.length) {
    post.carousel_media.forEach(collectFromMedia);
  } else {
    collectFromMedia(post);
  }

  return urls;
}

/**
 * Extract the media URL from a single highlight reel item.
 * Prefers video over image.
 * @param {Object} item - A highlight reel item from the API
 * @returns {string|null} The media URL, or null if not found
 */
function extractHighlightMediaUrl(item) {
  return item?.video_versions?.[0]?.url || item?.image_versions2?.candidates?.[0]?.url || null;
}

module.exports = { extractPostMediaUrls, extractHighlightMediaUrl };
