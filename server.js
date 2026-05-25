const express = require('express');
const yts = require('yt-search');
const { YoutubeTranscript } = require('youtube-transcript');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Vercel等の環境では /tmp を使用する
const DATA_DIR = process.env.VERCEL ? '/tmp/transcripts' : path.join(__dirname, 'transcripts');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function toHiragana(text) {
    return text.replace(/[ァ-ン]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0x60));
}

async function getChannelVideos(query) {
    const r = await yts(query);
    // Vercelのタイムアウト制限（10秒）を考慮し、スキャン数を20件に調整
    return r.videos.slice(0, 20).map(v => ({
        title: v.title,
        videoId: v.videoId,
        url: v.url,
        thumbnail: v.thumbnail
    }));
}

async function getTranscript(video) {
    const filePath = path.join(DATA_DIR, `${video.videoId}.json`);
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(video.videoId, { lang: 'ja' });
        const data = { metadata: video, transcript: transcript };
        // ローカル環境のみキャッシュ保存を試みる（Vercelでは永続化されない）
        try { fs.writeFileSync(filePath, JSON.stringify(data)); } catch(e) {}
        return data;
    } catch (e) {
        return null;
    }
}

app.get('/api/search', async (req, res) => {
    const { channel, q } = req.query;
    if (!channel || !q) return res.status(400).json({ error: 'Missing params' });
    try {
        const keywords = q.split(/[\s　]+/).filter(k => k.length > 0);
        const hKeywords = keywords.map(k => toHiragana(k));
        const videos = await getChannelVideos(channel);
        const allData = await Promise.all(videos.map(v => getTranscript(v)));
        const results = [];
        for (const item of allData) {
            if (!item || !item.transcript) continue;
            for (const line of item.transcript) {
                const lineText = line.text;
                const hLineText = toHiragana(lineText);
                const isMatch = keywords.every((k, i) => {
                    return lineText.includes(k) || hLineText.includes(hKeywords[i]);
                });
                if (isMatch) {
                    results.push({
                        title: item.metadata.title,
                        text: lineText,
                        time: Math.floor(line.offset / 1000),
                        url: `${item.metadata.url}&t=${Math.floor(line.offset / 1000)}s`,
                        thumbnail: item.metadata.thumbnail
                    });
                }
            }
        }
        res.json({ results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ローカル実行時のみ listen する
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Server started at http://localhost:${PORT}`);
    });
}

module.exports = app;
