import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji as getCounterTypeEmoji, getCounterTypeLabel, getGuildCounterStats } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export async function handleList(interaction, client) {
    const guild = interaction.guild;

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Necesitas el permiso **Manage Channels** para ver los contadores' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);
        const stats = await getGuildCounterStats(guild);

        const validCounters = [];
        const orphanedCounters = [];
        
        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);
            if (channel) {
                validCounters.push(counter);
            } else {
                orphanedCounters.push(counter);
                logger.info(`Removing orphaned counter ${counter.id} (type: ${counter.type}, deleted channel: ${counter.channelId}) from guild ${guild.id}`);
            }
        }

        if (orphanedCounters.length > 0) {
            await saveServerCounters(client, guild.id, validCounters);
            logger.info(`Cleaned up ${orphanedCounters.length} orphaned counter(s) from guild ${guild.id}`);
        }

        if (validCounters.length === 0) {
            const embed = createEmbed({
                title: "Contadores del Servidor",
                description: "Aun no se han configurado contadores para este servidor\n\nUsa `/serverstats create` para configurar tu primer contador",
                color: getColor('warning')
            });

            embed.addFields({
                name: "**Tipos de Contadores Disponibles**",
                value: "**Members + Bots** - Total de miembros del servidor\n **Members Only** - Solo miembros humanos\n **Bots Only** - Solo miembros bots",
                inline: false
            });

            embed.addFields({
                name: "**Ejemplos de Uso**",
                value: "`/serverstats create type:members channel_type:voice category:Stats`\n`/serverstats create type:bots channel_type:text category:Server Info`\n`/serverstats list`",
                inline: false
            });

            embed.setFooter({ 
                text: "Sistema de Contadores • Actualizaciones automaticas cada quince minutos" 
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);
            return;
        }

        const embed = createEmbed({
            title: `Contadores del Servidor (${validCounters.length})`,
            description: "Aqui estan todos los contadores activos para este servidor\n\nLos contadores se actualizan automaticamente cada quince minutos",
            color: getColor('info')
        });

        for (let i = 0; i < validCounters.length; i++) {
            const counter = validCounters[i];
            const channel = guild.channels.cache.get(counter.channelId);
            
            if (!channel) {
                
                logger.warn(`Counter ${counter.id} still has missing channel after cleanup`);
                continue;
            }

            const currentCount = getCurrentCount(stats, counter.type);
            const status = channel.name.includes(':') ? '✅ Activo' : '⚠️ No Actualizado';
            
            embed.addFields({
                name: `${getCounterTypeEmoji(counter.type)} Contador #${i + 1} - ${channel.name}`,
                value: `**ID:** \`${counter.id}\`\n**Type:** ${getCounterTypeDisplay(counter.type)}\n**Channel:** ${channel}\n**Current Count:** ${currentCount}\n**Status:** ${status}\n**Created:** ${new Date(counter.createdAt).toLocaleDateString()}`,
                inline: false
            });
        }

        embed.addFields({
            name: "**Estadisticas**",
            value: `**Total de Contadores:** ${validCounters.length}\n**Contadores Activos:** ${validCounters.filter(c => {
                const channel = guild.channels.cache.get(c.channelId);
                return channel && channel.name.includes(':');
            }).length}\n**Proxima Actualizacion:** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
            inline: false
        });

        embed.addFields({
            name: "**Comandos de Gestion**",
            value: "`/serverstats create` - Crear nuevo contador\n`/serverstats update` - Actualizar contador existente\n`/serverstats delete` - Eliminar contador",
            inline: false
        });

        embed.setFooter({ 
            text: "Sistema de Contadores • Actualizaciones automaticas cada quince minutos" 
        });
        embed.setTimestamp();

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);

    } catch (error) {
        logger.error("Error displaying counters:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ocurrio un error al obtener los contadores Por favor intenta de nuevo' }).catch(logger.error);
    }
}

function getCounterTypeDisplay(type) {
    return `${getCounterTypeEmoji(type)} ${getCounterTypeLabel(type)}`;
}

function getCounterEmoji(type) {
    return getCounterTypeEmoji(type);
}

function getCurrentCount(stats, type) {
    switch (type) {
        case "members":
            return stats.totalCount;
        case "bots":
            return stats.botCount;
        case "members_only":
            return stats.humanCount;
        default:
            return 0;
    }
}
