const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.Message]
});

client.commands = new Collection();

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if ('name' in event && 'execute' in event) {
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
        console.log(`✅ ${file} event dosyası yüklendi`);
    } else {
        console.log(`⚠️ ${filePath} event dosyasında name veya execute eksik`);
    }
}

process.on('unhandledRejection', (error) => {
    console.error('Beklenmeyen hata:', error);
});

client.login(config.DISCORD_TOKEN).catch(error => {
    console.error('Giriş hatası:', error);
    process.exit(1);
});

console.log('📡 Bot başlatılıyor...');
