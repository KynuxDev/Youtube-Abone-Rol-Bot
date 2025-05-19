const axios = require('axios');
const config = require('../config.json');
const fs = require('fs');
const youtubeApi = require('./youtubeApi');

async function analyzeImage(imagePath) {
    try {
        const imageBase64 = Buffer.from(fs.readFileSync(imagePath)).toString("base64");
        
        const prompt = `# YouTube Screenshot Analiz Sistemi - v2.0

Sen bir YouTube ekran görüntüsü analiz uzmanısın. Bu görüntüyü titizlikle incelemen ve aşağıdaki kritik bilgileri doğru şekilde tespit etmen gerekiyor:

## 🎯 TEMEL BİLGİLER (ZORUNLU)

1. Video başlığı nedir? (Tam olarak, kelimesi kelimesine)
2. Kanal adı nedir? (Tam olarak)
3. Abone durumu: Kullanıcı kanala abone olmuş mu? (SADECE "Evet" veya "Hayır" şeklinde yanıtla)
4. Like durumu: Kullanıcı videoyu beğenmiş mi? (SADECE "Evet" veya "Hayır" şeklinde yanıtla)

## ⚠️ ÖNEMLİ NOTLAR VE İPUÇLARI

- **Genel Yazım Kuralı:** Tespit ettiğiniz tüm yazılar (video başlığı, kanal adı) TAM OLARAK görüntüde göründüğü gibi, büyük/küçük harfe duyarlı şekilde yazılmalıdır.
- **Abonelik Durumu Tespiti:**
    - **Temel İlke:** Ekranda net bir şekilde "Abone Ol" veya "Subscribe" yazan bir buton görüyorsanız, kullanıcı abone **değildir** (Yanıt: Hayır).
    - **"Abone Olundu" / "Subscribed" Butonu:** Eğer "Abone Olundu" veya "Subscribed" yazan bir buton görüyorsanız (genellikle gri veya farklı renkte olur), kullanıcı **abonedir** (Yanıt: Evet).
    - **Zil Simgesi (🔔) Durumu (Özellikle Mobil ve Abone Olunmuş Durumlar):**
        - Eğer "Abone Ol" veya "Subscribe" butonu **görünmüyorsa** VE kanal adının yanında veya etkileşim alanında bir **zil simgesi (🔔)** varsa, bu kullanıcının **abone olduğu** anlamına gelir (Yanıt: Evet). Zil simgesinin görünümü (örneğin, içi dolu olması, yanında ok işareti olması, vb.) abone olunduğu gerçeğini değiştirmez; bu sadece bildirim ayarlarını gösterir.
    - **Özet (Abonelik):** "Abone Ol" butonu varsa → Hayır. "Abone Olundu" butonu varsa → Evet. "Abone Ol" butonu yoksa VE zil simgesi varsa → Evet.
- **Like Durumu Tespiti:**
    - Eğer "Beğen" / "Like" (👍) simgesinin içi boş veya sadece dış çizgileri belirginse (genellikle beyaz/gri arka planda koyu simge veya tersi) = Like atılmamış (Hayır).
    - Eğer "Beğenildi" / "Liked" (👍) simgesinin içi doluysa (genellikle koyu renkli simge) = Like atılmış (Evet).

## 📝 YANIT FORMATI

Lütfen SADECE aşağıdaki formatta, sade ve net bir şekilde yanıt ver:

1. [Video başlığı]
2. [Kanal adı]
3. [Abone durumu: Evet/Hayır]
4. [Like durumu: Evet/Hayır]`;
        
        const payload = {
            model: config.openaiModel,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
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
                'X-API-Key': `${process.env.KYNUX_CLOUD_API}`,
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

async function parseAnalysis(analysisText) {
    const lines = analysisText.split('\n')
        .filter(line => line.trim() !== '')
        .filter(line => !line.toLowerCase().includes('işte') && !line.toLowerCase().includes('bilgiler'))
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
            isSubscribed = line.toLowerCase().includes('evet');
        } else if (line.startsWith('4.')) {
            isLiked = line.toLowerCase().includes('evet');
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
    
    console.log('Başlık Kontrolleri:', {
        originalVideoTitle: videoTitle,
        cleanedDetectedTitle: detectedTitle,
        expectedTitle: expectedTitle,
        expectedChannelName: expectedChannelName,
        detectedChannelName: channelName,
        isSubscribed: isSubscribed,
        isLiked: isLiked
    });

    let isCorrectVideo;
    
    if (config.youtube.checkLatestVideoOnly) {
        const titleMatch = detectedTitle === expectedTitle;
        const channelMatch = channelName.toLowerCase().trim() === expectedChannelName.toLowerCase().trim();
        
        isCorrectVideo = titleMatch && channelMatch;
        
        if (channelMatch && !titleMatch) {
            console.log("❌ Kanal doğru ama farklı video açılmış: ", {
                expected: expectedTitle,
                detected: detectedTitle
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
