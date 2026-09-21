import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export async function handleCreate(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Necesitas el permiso **Manage Channels** para crear contadores' }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Por favor selecciona una categoria valida para el canal de contador' }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const baseChannelName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);

        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateChannel = guild.channels.cache.get(duplicateType.channelId);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Ya existe un contador de **${getCounterTypeLabel(type)}** para este servidor${duplicateChannel ? ` en ${duplicateChannel}` : ''} Eliminalo primero antes de crear otro` }).catch(logger.error);
            return;
        }

        const targetChannel = await guild.channels.create({
            name: baseChannelName,
            type: targetChannelType,
            parent: category.id,
            reason: `Counter channel created by ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);
        if (existingCounter) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Ya existe un contador para el canal **${targetChannel.name}**. Por favor eliminalo primero o elige un tipo diferente` }).catch(logger.error);
            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type: type,
            channelId: targetChannel.id,
            guildId: guild.id,
            createdAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await targetChannel.delete('Counter creation failed during save').catch(() => null);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Fallo al guardar los datos del contador Por favor intenta de nuevo' }).catch(logger.error);
            return;
        }

        const updated = await updateCounter(client, guild, newCounter);
        if (!updated) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Contador creado pero fallo al actualizar el nombre del canal El contador se actualizara en la siguiente ejecucion programada' }).catch(logger.error);
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(`**Contador Creado Exitosamente**\n\n**Type:** ${getCounterTypeLabel(type)}\n**Channel Type:** ${targetChannel.type === ChannelType.GuildVoice ? 'voice' : 'text'}\n**Category:** ${category}\n**Channel:** ${targetChannel}\n**Channel Name:** ${targetChannel.name}\n**Counter ID:** \`${newCounter.id}\`\n\nEl contador se actualizara automaticamente cada quince minutos\n\nUsa \`/serverstats list\` para ver todos los contadores`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error creating counter:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ocurrio un error al crear el contador Por favor intenta de nuevo' }).catch(logger.error);
    }
}
