import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  buildCountingLeaderboard,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getExpectedCountValue,
} from '../../services/countingGameService.js';
import { logger } from '../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('Administra el juego de contar del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Inicia un juego de contar en un canal de texto')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('El canal donde se llevara a cabo el juego')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('El sistema de conteo a utilizar')
            .setRequired(true)
            .addChoices(...getCountingSystemChoices()),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('Desactiva el juego de contar para este servidor'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Mira el estado actual del juego de contar'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Reinicia la secuencia actual de conteo')
        .addIntegerOption((option) =>
          option
            .setName('start')
            .setDescription('El numero por el que empezar tras el reinicio')
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('leaderboard').setDescription('Muestra la tabla de clasificacion del juego de contar'),
    ),
  category: 'Fun',

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) {
        logger.warn('Count command defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Necesitas el permiso **Administrar Servidor** para usar este comando' });
      }

      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();
      const config = await getCountingGameConfig(interaction.client, guildId);

      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const system = interaction.options.getString('system');
        if (!channel || channel.type !== ChannelType.GuildText) {
          return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Por favor elige un canal de texto para el juego de contar' });
        }

        if (config.enabled && config.channelId && config.channelId !== channel.id) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Este servidor ya tiene un canal de conteo activo configurado en <#${config.channelId}> Desactiva el juego actual primero o usa el canal existente` });
        }

        await activateCountingGame(interaction.client, guildId, channel.id, system);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Juego de contar activado',
              `El juego de contar ya esta activo en ${channel} usando el sistema **${getCountingSystemLabel(system)}** Los jugadores deben contar desde **1** y no pueden publicar dos numeros seguidos`,
            ),
          ],
        });
      }

      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed('Juego de contar desactivado', 'El juego de contar ya esta desactivado en este servidor')],
          });
        }

        await disableCountingGame(interaction.client, guildId);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('Juego de contar desactivado', 'El juego de contar ha sido desactivado')],
        });
      }

      if (subcommand === 'status') {
        const fields = [
          { name: 'Activado', value: config.enabled ? 'Si' : 'No', inline: true },
          { name: 'Canal', value: config.channelId ? `<#${config.channelId}>` : 'No configurado', inline: true },
          { name: 'Sistema', value: getCountingSystemLabel(config.system), inline: true },
          { name: 'Siguiente numero', value: getExpectedCountValue(config), inline: true },
          { name: 'Racha actual', value: `${config.currentStreak}`, inline: true },
          { name: 'Mejor racha', value: `${config.bestStreak || 0}`, inline: true },
          { name: 'Ultimo contador', value: config.lastUserId ? `<@${config.lastUserId}>` : 'Ninguno', inline: true },
        ];

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Estado del juego de contar',
              description: 'Resumen del juego de contar configurado actualmente',
              fields,
              color: 'primary',
            }),
          ],
        });
      }

      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Activa el juego de contar primero con `/count setup`' });
        }

        const startNumber = interaction.options.getInteger('start') || 1;
        await resetCountingGame(interaction.client, guildId, startNumber);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Juego de contar reiniciado',
              `La secuencia de conteo ha sido reiniciada Empieza de nuevo con **${startNumber}** en <#${config.channelId}>`,
            ),
          ],
        });
      }

      if (subcommand === 'leaderboard') {
        const leaderboard = buildCountingLeaderboard(config, interaction.guild);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Tabla de clasificacion de conteo',
              description: leaderboard.length > 0 ? leaderboard.join('\n') : 'Aun no se han registrado conteos',
              color: 'primary',
            }),
          ],
        });
      }

      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Por favor elige una accion valida para el juego de contar' });
    } catch (error) {
      logger.error('Count command error:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Algo salio mal al administrar el juego de contar' });
    }
  },
};
