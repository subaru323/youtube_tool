const yts = require('yt-search');
const { YoutubeTranscript } = require('youtube-transcript');
const fs = require('fs');
const path = require('path');

// データ保存用ディレクトリ
const DATA_DIR = path.join(__dirname, 'transcripts');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

/**
 * チャンネルの動画リストを取得する
 */
async function getChannelVideos(query) {
    console.log(`Searching for videos from: ${query}...`);
    let r;
    // チャンネルID(UC...)が直接指定された場合の簡易対応
    if (query.startsWith('UC')) {
        r = await yts({ query: query, type: 'video' });
    } else {
        r = await yts(query);
    }
    
    // 重複を避けつつ、動画情報を抽出
    return r.videos.slice(0, 50).map(v => ({
        title: v.title,
        videoId: v.videoId,
        url: v.url
    }));
}

/**
 * 文字起こしを取得して保存する
 */
async function downloadTranscript(video) {
    const filePath = path.join(DATA_DIR, `${video.videoId}.json`);
    
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    try {
        console.log(`Downloading transcript for: ${video.title}...`);
        // 日本語を優先して取得
        const transcript = await YoutubeTranscript.fetchTranscript(video.videoId, { lang: 'ja' });
        const data = {
            metadata: video,
            transcript: transcript
        };
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return data;
    } catch (e) {
        // 文字起こしが利用できない場合はスキップ
        return null;
    }
}

/**
 * うろ覚え検索を実行する（スペース区切りで複数単語に対応）
 */
function fuzzySearch(searchQuery, allData) {
    console.log(`\nSearching for "${searchQuery}"...`);
    // 空白（全角半角）でキーワードを分割
    const keywords = searchQuery.split(/[\s　]+/).filter(k => k.length > 0);
    const results = [];

    for (const item of allData) {
        if (!item || !item.transcript) continue;

        for (const line of item.transcript) {
            // すべてのキーワードが含まれているかチェック
            const isMatch = keywords.every(k => line.text.includes(k));
            
            if (isMatch) {
                results.push({
                    title: item.metadata.title,
                    text: line.text,
                    time: Math.floor(line.offset / 1000),
                    url: `${item.metadata.url}&t=${Math.floor(line.offset / 1000)}s`
                });
            }
        }
    }

    return results;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: node yt-urobore-search.js <"Channel Name or ID"> <"Search Keywords">');
        console.log('Example: node yt-urobore-search.js "M5Stack" "センサー 使い方"');
        return;
    }

    const channelInput = args[0];
    const keywords = args[1];

    const videos = await getChannelVideos(channelInput);
    console.log(`Found ${videos.length} potential videos.`);

    const allData = [];
    for (const video of videos) {
        const data = await downloadTranscript(video);
        if (data) allData.push(data);
    }

    const results = fuzzySearch(keywords, allData);

    if (results.length === 0) {
        console.log('No matches found. Try different keywords.');
    } else {
        console.log(`\nFound ${results.length} matches:\n`);
        results.forEach((res, i) => {
            console.log(`[${i + 1}] ${res.title}`);
            console.log(`   セリフ: "${res.text}"`);
            console.log(`   URL: ${res.url}\n`);
        });
    }
}

main();
