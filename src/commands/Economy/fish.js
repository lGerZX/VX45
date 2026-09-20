import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'Sardina', emoji: '🐟', rarity: 'comun' },
    { name: 'Trucha', emoji: '🐟', rarity: 'comun' },
    { name: 'Salmon', emoji: '🐟', rarity: 'comun' },
    { name: 'Atun', emoji: '🐠', rarity: 'poco_comun' },
    { name: 'Pez Espada', emoji: '🐠', rarity: 'poco_comun' },
    { name: 'Pulpo', emoji: '🐙', rarity: 'raro' },
    { name: 'Langosta', emoji: '🦞', rarity: 'raro' },
    { name: 'Tiburon Blanco', emoji: '🦈', rarity: 'epico' },
    { name: 'Ballena Azul', emoji: '🐋', rarity: 'legendario' },
    { name: 'Kraken Mitico', emoji: '🦑', rarity: 'legendario' }
];

const CATCH_MESSAGES = [
    "Lanzaste la linea a las aguas cristalinas",
    "Esperaste pacientemente mientras la boya flotaba en el agua",
    "Sientes un fuerte tiron en la linea de pesca",
    "El agua empieza a moverse cuando algo muerde el anzuelo",
    "Recoges el carrete con gran habilidad profesional"
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Sal a pescar para atrapar peces y ganar dinero'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastFish = userData.lastFish || 0;
        const hasFishingRod = userData.inventory["fishing_rod"] || 0;

        if (now < lastFish + FISH_COOLDOWN) {
            const remaining = lastFish + FISH_COOLDOWN - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor(
                (remaining % (1000 * 60 * 60)) / (1000 * 60),
            );

            throw createError(
                "Fishing cooldown active",
                ErrorTypes.RATE_LIMIT,
                `Estas demasiado cansado para pescar Descansa **${hours}h ${minutes}m** antes de intentar de nuevo`,
                { remaining, cooldownType: 'fish' }
            );
        }

        const rand = Math.random();
        let fishCaught;
        
        if (rand < 0.5) {
            const list = FISH_TYPES.filter(f => f.rarity === 'comun');
            fishCaught = list[Math.floor(Math.random() * list.length)];
        } else if (rand < 0.75) {
            const list = FISH_TYPES.filter(f => f.rarity === 'poco_comun');
            fishCaught = list[Math.floor(Math.random() * list.length)];
        } else if (rand < 0.9) {
            const list = FISH_TYPES.filter(f => f.rarity === 'raro');
            fishCaught = list[Math.floor(Math.random() * list.length)];
        } else if (rand < 0.98) {
            const list = FISH_TYPES.filter(f => f.rarity === 'epico');
            fishCaught = list[Math.floor(Math.random() * list.length)];
        } else {
            const list = FISH_TYPES.filter(f => f.rarity === 'legendario');
            fishCaught = list[Math.floor(Math.random() * list.length)];
        }

        const baseEarned = Math.floor(
            Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
        ) + BASE_MIN_REWARD;

        let finalEarned = baseEarned;
        let multiplierMessage = "";

        if (hasFishingRod > 0) {
            finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
            multiplierMessage = `\n🎣 **Bono por Cana de Pescar +50%**`;
        }

        const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

        userData.wallet += finalEarned;
        userData.lastFish = now;

        await setEconomyData(client, guildId, userId, userData);

        const rarityNames = {
            comun: 'Comun',
            poco_comun: 'Poco comun',
            raro: 'Raro',
            epico: 'Epico',
            legendario: 'Legendario'
        };

        const rarityColors = {
            comun: '#95A5A6',
            poco_comun: '#2ECC71',
            raro: '#3498DB',
            epico: '#9B59B6',
            legendario: '#F1C40F'
        };

        const embed = createEmbed({
            title: 'Pesca exitosa',
            description: `${catchMessage}\n\nAtrapaste un **${fishCaught.emoji} ${fishCaught.name}** Lo vendiste por **$${finalEarned.toLocaleString()}**${multiplierMessage}`,
            color: rarityColors[fishCaught.rarity]
        })
            .addFields(
                {
                    name: "Nuevo saldo en efectivo",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "Rareza",
                    value: rarityNames[fishCaught.rarity] || fishCaught.rarity,
                    inline: true,
                }
            )
            .setFooter({ text: `Proximo viaje de pesca disponible en 45 minutos` });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
