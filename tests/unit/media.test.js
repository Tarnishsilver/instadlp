const { extractPostMediaUrls, extractHighlightMediaUrl } = require('../../helper/media');
const postData = require('../fixtures/postData.json');
const highlightData = require('../fixtures/highlightData.json');

describe('extractPostMediaUrls', () => {
  const items = postData.items;

  it('returns highest-resolution image URL for an image post', () => {
    const urls = extractPostMediaUrls(items[0]); // post_1: image only
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://scontent.fbcdn.net/v/img_1080.jpg');
  });

  it('returns video URL for a video post (media_type 2 prefers video_versions)', () => {
    // post_2 has media_type: 2 with both video_versions and image_versions2
    // collectFromMedia now picks videoUrl first for media_type 2
    const urls = extractPostMediaUrls(items[1]);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://scontent.fbcdn.net/v/video_720.mp4');
  });

  it('returns multiple URLs for a carousel post', () => {
    const urls = extractPostMediaUrls(items[2]); // post_3_carousel
    expect(urls).toHaveLength(2);
    // First item: media_type 1, image with 1080 and 640 candidates → bestCandidate picks 1080
    expect(urls[0]).toBe('https://scontent.fbcdn.net/v/carousel_1_1080.jpg');
    // Second item: media_type 2, has video_versions and image_versions2 → picks video
    expect(urls[1]).toBe('https://scontent.fbcdn.net/v/carousel_2_video.mp4');
  });

  it('returns empty array for a post with no media', () => {
    const urls = extractPostMediaUrls(items[3]); // post_4_no_media
    expect(urls).toEqual([]);
  });

  it('filters out non-fbcdn.net URLs', () => {
    const urls = extractPostMediaUrls(items[4]); // post_5_non_fbcdn
    expect(urls).toEqual([]);
  });

  it('returns empty array for an empty object', () => {
    const urls = extractPostMediaUrls({});
    expect(urls).toEqual([]);
  });

  it('handles post with empty carousel_media array', () => {
    const urls = extractPostMediaUrls({ carousel_media: [] });
    expect(urls).toEqual([]);
  });
});

describe('extractHighlightMediaUrl', () => {
  const reelItems = highlightData.reels_media[0].items;

  it('prefers video over image when both are present', () => {
    // First item has both video_versions and image_versions2
    const url = extractHighlightMediaUrl(reelItems[0]);
    expect(url).toBe('https://scontent.fbcdn.net/v/hl_video_1.mp4');
  });

  it('returns image URL when no video is present', () => {
    // Second item has only image_versions2
    const url = extractHighlightMediaUrl(reelItems[1]);
    expect(url).toBe('https://scontent.fbcdn.net/v/hl_img_2.jpg');
  });

  it('returns video URL for video-only items', () => {
    const videoOnlyItem = highlightData.reels_media[1].items[0];
    const url = extractHighlightMediaUrl(videoOnlyItem);
    expect(url).toBe('https://scontent.fbcdn.net/v/hl_video_3.mp4');
  });

  it('returns null for an empty object', () => {
    const url = extractHighlightMediaUrl({});
    expect(url).toBeNull();
  });

  it('returns null for undefined input', () => {
    const url = extractHighlightMediaUrl(undefined);
    expect(url).toBeNull();
  });

  it('returns null for null input', () => {
    const url = extractHighlightMediaUrl(null);
    expect(url).toBeNull();
  });

  it('returns null when candidates array is empty', () => {
    const url = extractHighlightMediaUrl({
      image_versions2: { candidates: [] },
    });
    expect(url).toBeNull();
  });
});
