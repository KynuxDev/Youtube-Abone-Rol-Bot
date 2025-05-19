const { Events, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const youtubeApi = require('../utils/youtubeApi');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`✅ ${client.user.tag} olarak giriş yapıldı!`);
        console.log(`🤖 Bot ${client.guilds.cache.size} sunucuda aktif.`);
        client.user.setPresence({
            activities: [{ name: `Son Videoyu Kontrol 🔍`, type: 3 }],
            status: 'online',
        });
        try {
            console.log('Kynux YouTube API bağlantısı kontrol ediliyor...');
            
            const channelId = config.youtube.channelId;
            if (!channelId) {
                console.warn('⚠️ Kanal ID konfigürasyonda belirtilmemiş!');
            } else {
                console.log(`🔍 ${channelId} ID'li kanal için bilgiler alınıyor...`);
                
                try {
                    const videoSummary = await youtubeApi.getLatestVideoSummary();
                    
                    if (videoSummary.latestVideoFound) {
                        console.log(`✅ ${videoSummary.channelName} kanalında son video bulundu:`);
                        console.log(`   - Başlık: ${videoSummary.latestVideo.title}`);
                        console.log(`   - Yayın Tarihi: ${new Date(videoSummary.latestVideo.publishedAt).toLocaleString('tr-TR')}`);
                        console.log(`   - URL: ${videoSummary.latestVideo.url}`);
                        console.log(`   - Video Sayısı: ${videoSummary.videoCount}`);
                        
                        if (config.youtube.checkLatestVideoOnly) {
                            console.log(`📝 Kullanıcılar bu en son videoyu açmış ve abone olmuş olmalıdır`);
                        }
                    } else {
                        console.warn(`⚠️ ${videoSummary.channelName} kanalında hiç video bulunamadı!`);
                    }
                    
                    const latestVideoTitle = videoSummary?.latestVideo?.title || 'YouTube Kontrol';
                    client.user.setPresence({
                        activities: [{ name: `🎬 ${latestVideoTitle.substring(0, 50)}${latestVideoTitle.length > 50 ? '...' : ''}`, type: 3 }],
                        status: 'online',
                    });
                } catch (apiError) {
                    console.error('API hatası:', apiError.message);
                }
                
                const checkIntervalMinutes = config.youtube.checkIntervalMinutes || 10;
                setInterval(async () => {
                    try {
                        console.log('Kynux YouTube API verileri periyodik olarak güncelleniyor...');
                        const refreshedData = await youtubeApi.updateChannelAndVideoInfo();
                        
                        if (refreshedData.latestVideo) {
                            console.log(`📺 Güncel Son Video: "${refreshedData.latestVideo.title}"`);
                            
                            client.user.setPresence({
                                activities: [{ name: `🎬 ${refreshedData.latestVideo.title.substring(0, 50)}${refreshedData.latestVideo.title.length > 50 ? '...' : ''}`, type: 3 }],
                                status: 'online',
                            });
                        }
                    } catch (error) {
                        console.error('Periyodik YouTube güncellemesi hatası:', error.message);
                    }
                }, checkIntervalMinutes * 60 * 1000);
                
                console.log(`⏰ Video bilgileri her ${checkIntervalMinutes} dakikada bir otomatik güncellenecek`);
            }
        } catch (error) {
            console.error('Kynux YouTube API başlatma hatası:', error.message);
        }
        
        await registerCommands(client);
    }
};

async function registerCommands(client) {
    try {
        const commandsPath = path.join(__dirname, '..', 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        const commands = [];
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
            } else {
                console.log(`⚠️ ${filePath} komut dosyasında data veya execute eksik`);
            }
        }
        
        console.log(`Slash komutları kaydediliyor... (${commands.length} komut)`);        
        const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        
        console.log('✅ Slash komutları başarıyla kaydedildi!');
    } catch (error) {
        console.error('Slash komutları kaydedilirken bir hata oluştu:', error);
    }
}
