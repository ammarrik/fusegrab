import type { YoutubeChannelVideoItem } from './types'

function toChannelVideosUrl(raw: string): string {
    if (raw.includes('list=')) return raw
    const base = raw
        .replace(
            /\/(videos|shorts|streams|playlists|community|about|channels)\s*$/i,
            '',
        )
        .replace(/\/+$/, '')
    return `${base}/videos`
}

function parseDurationText(text: string): number {
    if (!text) return 0
    const clean = text.replace(/\s/g, '')
    const parts = clean.split(':').map(Number)
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return parts[0] || 0
}

export async function scrapeChannelWithBrowser(
    url: string,
    targetNeeded: number,
): Promise<{
    channelTitle: string
    videos: YoutubeChannelVideoItem[]
    hasMore: boolean
} | null> {
    const { BrowserWindow, session } = await import('electron')
    const targetUrl = toChannelVideosUrl(url)
    const ses = session.fromPartition('persist:yt-scraper')

    const win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: {
            backgroundThrottling: false,
            session: ses,
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    win.webContents.setAudioMuted(true)
    win.webContents.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    )

    try {
        await win.loadURL(targetUrl)

        await win.webContents.executeJavaScript(`
            new Promise((resolve) => {
                const dismiss = () => {
                    const consentBtn =
                        document.querySelector('button[aria-label*="Accept"], button[aria-label*="accept"], tp-yt-paper-button[aria-label*="Accept"]') ||
                        document.querySelector('form[action*="consent"] button') ||
                        document.querySelector('[class*="consent"] button:last-child') ||
                        document.querySelector('ytd-consent-bump-v2-lightbox button.yt-spec-button-shape-next--filled');
                    if (consentBtn) {
                        consentBtn.click();
                        setTimeout(resolve, 2000);
                    } else {
                        resolve(true);
                    }
                };
                setTimeout(dismiss, 1500);
            });
        `)

        const hasVideos = await win.webContents.executeJavaScript(`
            new Promise((resolve) => {
                let attempts = 0;
                const check = () => {
                    const items = Array.from(document.querySelectorAll(
                        'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-playlist-video-renderer'
                    )).filter(item => {
                        const link = item.querySelector('a[href*="watch?v="], a[href*="/shorts/"]');
                        if (!link) return false;
                        const href = link.getAttribute('href') || link.href || '';
                        return /(?:watch\\?v=|\\/shorts\\/)([a-zA-Z0-9_-]{11})/.test(href);
                    });

                    if (items.length > 0) {
                        resolve(true);
                        return;
                    }
                    if (attempts > 60) {
                        resolve(false);
                        return;
                    }
                    attempts++;
                    setTimeout(check, 500);
                };
                check();
            });
        `)

        if (!hasVideos) return null

        const scrollResult = await win.webContents.executeJavaScript(`
            new Promise((resolve) => {
                const totalNeeded = ${targetNeeded};
                let lastCount = 0;
                let stale = 0;
                let scrollAttempts = 0;

                const doScroll = () => {
                    const items = Array.from(document.querySelectorAll(
                        'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-playlist-video-renderer'
                    )).filter(item => {
                        const link = item.querySelector('a[href*="watch?v="], a[href*="/shorts/"]');
                        if (!link) return false;
                        const href = link.getAttribute('href') || link.href || '';
                        return /(?:watch\\?v=|\\/shorts\\/)([a-zA-Z0-9_-]{11})/.test(href);
                    });
                    const count = items.length;

                    if (count >= totalNeeded) {
                        resolve({ count, reachedEnd: false });
                        return;
                    }

                    if (scrollAttempts >= 60) {
                        resolve({ count, reachedEnd: false });
                        return;
                    }

                    if (count === lastCount) {
                        stale++;
                        if (stale >= 5) {
                            resolve({ count, reachedEnd: true });
                            return;
                        }
                    } else {
                        stale = 0;
                        lastCount = count;
                    }

                    scrollAttempts++;

                    const continuation = document.querySelector(
                        'ytd-continuation-item-renderer, tp-yt-paper-spinner'
                    );
                    if (continuation) {
                        continuation.scrollIntoView({ behavior: 'instant', block: 'center' });
                    }
                    window.scrollTo(0, 999999);
                    window.dispatchEvent(new Event('scroll', { bubbles: true }));

                    setTimeout(doScroll, 1200);
                };

                setTimeout(doScroll, 800);
            });
        `)

        const scraped = await win.webContents.executeJavaScript(`
            (() => {
                const channelTitle = (
                    document.querySelector('yt-formatted-string#text.ytd-channel-name')?.textContent ||
                    document.querySelector('#channel-name yt-formatted-string')?.textContent ||
                    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                    ''
                ).trim();

                const rawItems = Array.from(document.querySelectorAll(
                    'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-playlist-video-renderer'
                ));

                const videos = [];
                const seen = new Set();

                rawItems.forEach(item => {
                    try {
                        const link = item.querySelector('a[href*="watch?v="], a[href*="/shorts/"]');
                        if (!link) return;
                        const href = link.getAttribute('href') || link.href || '';
                        const match = href.match(/(?:watch\\?v=|\\/shorts\\/)([a-zA-Z0-9_-]{11})/);
                        if (!match) return;
                        const videoId = match[1];
                        if (seen.has(videoId)) return;

                        const titleEl = item.querySelector('#video-title-link, #video-title, h3, yt-formatted-string#video-title') || link;
                        const title = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
                        if (!title || title.toLowerCase().includes(' - videos') || title.toLowerCase().includes(' - shorts')) return;

                        seen.add(videoId);

                        let thumbnail = '';
                        const thumbEl = item.querySelector('ytd-thumbnail img, img#img, img.yt-core-image');
                        if (thumbEl) {
                            thumbnail = thumbEl.src || thumbEl.getAttribute('src') || '';
                        }
                        if (!thumbnail || thumbnail.startsWith('data:')) {
                            thumbnail = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
                        }

                        const durationEl = item.querySelector(
                            'ytd-thumbnail-overlay-time-status-renderer #text,' +
                            'ytd-thumbnail-overlay-time-status-renderer span, badge-shape .badge-shape-wiz__text'
                        );
                        const durationText = (durationEl?.textContent || '').trim();

                        const authorEl = item.querySelector('ytd-channel-name #text a, ytd-channel-name a');
                        const author = (authorEl?.textContent || channelTitle || 'YouTube').trim();

                        videos.push({
                            id: videoId,
                            title: title || 'Untitled Video',
                            url: 'https://www.youtube.com/watch?v=' + videoId,
                            thumbnail,
                            durationText,
                            author,
                        });
                    } catch {}
                });

                return { channelTitle, videos };
            })();
        `)

        if (!scraped || !Array.isArray(scraped.videos) || scraped.videos.length === 0) {
            return null
        }

        const allVideos: YoutubeChannelVideoItem[] = scraped.videos.map(
            (v: any) => ({
                id: v.id,
                title: v.title,
                url: v.url,
                thumbnail: v.thumbnail,
                durationSeconds: parseDurationText(v.durationText || ''),
                author: v.author,
            }),
        )

        const reachedEnd = scrollResult?.reachedEnd ?? false

        return {
            channelTitle: scraped.channelTitle || 'YouTube Channel',
            videos: allVideos,
            hasMore: !reachedEnd,
        }
    } catch {
        return null
    } finally {
        try {
            win.destroy()
        } catch {}
    }
}
