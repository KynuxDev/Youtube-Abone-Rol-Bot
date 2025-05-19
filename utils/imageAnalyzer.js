const axios = require('axios');
const config = require('../config.json');
const fs = require('fs');
const youtubeApi = require('./youtubeApi');

const KEYWORD_YES = 'evet';
const FILTER_OUT_KEYWORD_LINE_1 = 'işte';
const FILTER_OUT_KEYWORD_LINE_2 = 'bilgiler';

async function analyzeImage(imagePath) {
    try {
        const imageBase64 = Buffer.from(fs.readFileSync(imagePath)).toString("base64");
        
        const systemPrompt = `Sen bir YouTube ekran görüntüsü analiz uzmanısın. Görevin, sağlanan YouTube ekran görüntülerini titizlikle inceleyerek belirli bilgileri doğru bir şekilde çıkarmaktır. Yanıtların her zaman net, kesin ve istenen formatta olmalıdır.

Analiz Kriterleri:
1.  **Video Başlığı:** Görüntüdeki video başlığını tam olarak, kelimesi kelimesine yaz.
2.  **Kanal Adı:** Görüntüdeki kanal adını tam olarak yaz.
3.  **Abonelik Durumu:** Kullanıcının kanala abone olup olmadığını belirle. Sadece "Evet" veya "Hayır" yanıtını ver.
    -   **İpuçları (Abonelik):**
        -   Ekranda net "Abone Ol" / "Subscribe" butonu varsa = Abone olunmamış (Hayır).
        -   "Abone Olundu" / "Subscribed" butonu varsa = Abone olunmuş (Evet).
        -   "Abone Ol" butonu yoksa VE bir zil simgesi (🔔) görünüyorsa (genellikle mobil veya abone olunmuş masaüstü görünümlerinde) = Abone olunmuş (Evet). Zil simgesinin durumu (içi dolu, vb.) abone olunduğu gerçeğini değiştirmez.
4.  **Beğeni Durumu:** Kullanıcının videoyu beğenip beğenmediğini belirle. Sadece "Evet" veya "Hayır" yanıtını ver.
    -   **İpuçları (Beğeni):**
        -   "Beğen" / "Like" (👍) simgesinin içi boş veya sadece dış çizgileri belirginse = Beğenilmemiş (Hayır).
        -   "Beğenildi" / "Liked" (👍) simgesinin içi doluysa = Beğenilmiş (Evet).

Yanıt Formatı (SADECE BU FORMATI KULLAN):
1. [Video başlığı]
2. [Kanal adı]
3. [Abone durumu: Evet/Hayır]
4. [Like durumu: Evet/Hayır]`;

        const userPromptForImage = "Lütfen bu YouTube ekran görüntüsünü analiz et ve bilgileri belirtilen formatta çıkar.";
        
        const payload = {
            model: "grok-3-mini-beta",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: userPromptForImage },
                        { 
                            type: "image_url", 
                            image_url: {
                                url: `data:image/png;base64,${imageBase64}`
                            }
                        }
                    ]
                }
            ]
        };

        const response = await axios.post(config.openaiEndpoint + '/chat/completions', payload, {
            headers: {
                'X-API-Key': `${config.kynuxApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('KynuxCloud Ham Yanıt:', JSON.stringify(response.data, null, 2));
        
        const responseText = response.data.choices[0].message.content;
        return responseText;
    } catch (error) {
        console.error('KynuxCloud API Hatası:', error.response?.data || error.message);
        throw error;
    }
}

function cleanTitle(title) {
    return title
        .toLowerCase()
        .normalize('NFD')                   
        .replace(/[\u0300-\u036f]/g, '')    
        .replace(/[^a-z0-9\s|]/g, '')       
        .replace(/İ/g, 'i')
        .replace(/I/g, 'i')
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/\s+/g, ' ')              
        .trim();
}

function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, 
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1 
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

async function parseAnalysis(analysisText) {
    const lines = analysisText.split('\n')
        .filter(line => line.trim() !== '')
        .filter(line => !line.toLowerCase().includes(FILTER_OUT_KEYWORD_LINE_1) && !line.toLowerCase().includes(FILTER_OUT_KEYWORD_LINE_2))
        .map(line => line.trim());

    const results = {
        isValid: false,
        reasons: []
    };

    let videoTitle = '';
    let channelName = '';
    let isSubscribed = false;
    let isLiked = false;

    for (const line of lines) {
        if (line.startsWith('1.')) {
            videoTitle = line.substring(2).trim();
        } else if (line.startsWith('2.')) {
            channelName = line.substring(2).trim();
        } else if (line.startsWith('3.')) {
            isSubscribed = line.toLowerCase().includes(KEYWORD_YES);
        } else if (line.startsWith('4.')) {
            isLiked = line.toLowerCase().includes(KEYWORD_YES);
        }
    }

    console.log('Ham Veriler:', {
        lines,
        videoTitle,
        channelName,
        isSubscribed,
        isLiked
    });

    let videoSearchCriteria;
    try {
        videoSearchCriteria = await youtubeApi.getVideoSearchCriteria();
        console.log('Kynux API Video Kriterleri:', videoSearchCriteria);
    } catch (error) {
        console.error('Kynux API video kriterleri alınırken hata:', error);
        videoSearchCriteria = {
            channelName: config.youtube.channelName,
            latestVideoTitle: "API'den veri alınamadı",
            cleanTitle: "",
            publishedAt: new Date().toISOString()
        };
    }

    const detectedTitle = cleanTitle(videoTitle);
    const expectedTitle = videoSearchCriteria.cleanTitle;
    
    const expectedChannelName = videoSearchCriteria.channelName || config.youtube.channelName;
    
    const TITLE_MATCH_LEVENSHTEIN_THRESHOLD = 3;
    const titleDistance = levenshteinDistance(detectedTitle, expectedTitle);

    console.log('Başlık Kontrolleri:', {
        originalVideoTitle: videoTitle,
        cleanedDetectedTitle: detectedTitle,
        expectedTitle: expectedTitle,
        titleDistance: titleDistance,
        titleMatchThreshold: TITLE_MATCH_LEVENSHTEIN_THRESHOLD,
        expectedChannelName: expectedChannelName,
        detectedChannelName: channelName,
        isSubscribed: isSubscribed,
        isLiked: isLiked
    });

    let isCorrectVideo;
    
    if (config.youtube.checkLatestVideoOnly) {
        const titleMatch = titleDistance <= TITLE_MATCH_LEVENSHTEIN_THRESHOLD;
        const channelMatch = channelName.toLowerCase().trim() === expectedChannelName.toLowerCase().trim();
        
        isCorrectVideo = titleMatch && channelMatch;
        
        if (channelMatch && !titleMatch) {
            console.log(`❌ Kanal doğru ama farklı video açılmış (Levenshtein mesafesi: ${titleDistance}, Eşik: ${TITLE_MATCH_LEVENSHTEIN_THRESHOLD}): `, {
                expected: expectedTitle,
                detected: detectedTitle,
                distance: titleDistance
            });
            results.reasons.push(`❌ Yanlış video. Lütfen "${videoSearchCriteria.latestVideoTitle}" başlıklı en son videoyu açın`);
        } else if (!channelMatch) {
            console.log("❌ Yanlış kanal açılmış");
        } else {
            console.log("✅ Mükemmel eşleşme: Doğru video ve doğru kanal");
        }
    } else {
        isCorrectVideo = (
            channelName.toLowerCase().trim() === expectedChannelName.toLowerCase().trim()
        );
    }
    
    if (channelName.toLowerCase().trim() !== expectedChannelName.toLowerCase().trim()) {
        results.reasons.push(`❌ Yanlış kanal açılmış. Lütfen "${expectedChannelName}" kanalını açın`);
    }
    
    if (!isSubscribed) {
        results.reasons.push('❌ Kanala abone olun');
    }
    if (!isLiked) {
        results.reasons.push('❌ Videoya like atın');
    }

    results.isValid = isCorrectVideo && isSubscribed && isLiked;

    results.detectedInfo = {
        videoTitle,
        channelName,
        isSubscribed,
        isLiked
    };
    
    results.expectedInfo = {
        latestVideoTitle: videoSearchCriteria.latestVideoTitle,
        channelName: expectedChannelName,
        publishedAt: videoSearchCriteria.publishedAt
    };

    return results;
}

module.exports = { analyzeImage, parseAnalysis, cleanTitle };
