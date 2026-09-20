import {
  SlashComandoBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  disableCategoría,
  enableCategoría,
  disableComando,
  enableComando,
  resolveCategoríaChoice,
  buildComandoRegistry,
  isProtectedComando,
} from '../../services/commandAccessService.js';
import {
  buildDashboardView,
  handleDashboardComponent,
  createDashboardCollectorFilter,
  isComandoAccessCustomId,
} from './modules/commands_dashboard.js';

const DASHBOARD_TIMEOUT_MS = 10 * 60 * 1000;

function buildCategoríaChoices(client) {
  const registry = buildComandoRegistry(client);
  return [...registry.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 25)
    .map((category) => ({
      name: `${category.icon} ${category.displayName}`.slice(0, 100),
      value: category.key,
    }));
}

async function ensureManageGuild(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Necesitas el permiso **Administrar servidor** para administrar los comandos.' });
    return false;
  }

  return true;
}

export default {
  data: new SlashComandoBuilder()
    .setName('commands')
    .setDescription('Activar o desactivar comandos y categorías del bot para este servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('dashboard')
        .setDescription('Abrir el panel interactivo de acceso a comandos'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Desactivar un comando o una categoría completa')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Desactivar un comando individual o una categoría completa')
            .setRequired(true)
            .addChoices(
              { name: 'Categoría', value: 'category' },
              { name: 'Comando', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Categoría or command name')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Activar un comando o una categoría completa')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Activar un comando individual o una categoría completa')
            .setRequired(true)
            .addChoices(
              { name: 'Categoría', value: 'category' },
              { name: 'Comando', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Categoría or command name')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  category: 'Core',

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'target') {
      return interaction.respond([]);
    }

    const scope = interaction.options.getString('scope');
    const query = focused.value.toLowerCase();

    if (scope === 'category') {
      const choices = buildCategoríaChoices(interaction.client)
        .filter((choice) => choice.name.toLowerCase().includes(query) || choice.value.includes(query))
        .slice(0, 25);
      return interaction.respond(choices);
    }

    // Para el alcance de comandos, obtener todos los comandos, incluidos los subcomandos
    const registry = buildComandoRegistry(interaction.client);
    const allComandos = [];

    // Comprobar si la búsqueda coincide con una categoría; si es así, mostrar los comandos de esa categoría
    const matchedCategoría = resolveCategoríaChoice(interaction.client, query);

    if (matchedCategoría) {
      // Mostrar los comandos de la categoría coincidente
      for (const command of matchedCategoría.commands) {
        if (!isProtectedComando(command.name)) {
          allComandos.push(command.name);
        }
      }
    } else {
      // Mostrar todos los comandos
      for (const category of registry.values()) {
        for (const command of category.commands) {
          // Incluir tanto comandos base como subcomandos
          if (!isProtectedComando(command.name)) {
            allComandos.push(command.name);
          }
        }
      }
    }

    const choices = allComandos
      .filter((name) => name.includes(query))
      .slice(0, 25)
      .map((name) => ({ name: `/${name}`, value: name }));

    return interaction.respond(choices);
  },

  async execute(interaction, config, client) {
    if (!(await ensureManageGuild(interaction))) {
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'dashboard') {
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) {
        return;
      }

      const view = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [view.embed],
        components: view.components,
      });

      const replyMessage = await interaction.fetchReply().catch(() => null);
      if (!replyMessage) {
        return;
      }

      const collector = replyMessage.createMessageComponentCollector({
        filter: createDashboardCollectorFilter(interaction.user.id, interaction.guildId),
        time: DASHBOARD_TIMEOUT_MS,
      });

      collector.on('collect', async (componentInteraction) => {
        try {
          if (!isComandoAccessCustomId(componentInteraction.customId)) {
            return;
          }
          await handleDashboardComponent(componentInteraction, client);
        } catch (error) {
          logger.error('Comando access dashboard interaction failed', {
            error: error.message,
            customId: componentInteraction.customId,
            guildId: interaction.guildId,
          });
          await replyUserError(componentInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: error.message || 'No se pudo actualizar el acceso a los comandos.',
          }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        const finalView = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
        const disabledComponents = finalView.components.map((row) => {
          const newRow = row.toJSON();
          newRow.components = newRow.components.map((component) => ({ ...component, disabled: true }));
          return newRow;
        });

        await replyMessage.edit({ components: disabledComponents }).catch(() => {});
      });

      return;
    }

    const scope = interaction.options.getString('scope');
    const target = interaction.options.getString('target');
    const isDisable = subcommand === 'disable';

    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) {
      return;
    }

    if (scope === 'category') {
      const category = resolveCategoríaChoice(client, target);
      if (!category) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Ninguna categoría coincide con \`${target}\`. Use \`/commands dashboard\` to browse categories.` });
      }

      if (isDisable) {
        await disableCategoría(client, interaction.guildId, category.key);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Categoría Disabled',
              `Todos los comandos de **${category.displayName}** están ahora desactivados.\nLos comandos protegidos siguen disponibles.`,
            ),
          ],
        });
      }

      await enableCategoría(client, interaction.guildId, category.key);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Categoría Enabled', `Los comandos de **${category.displayName}** están ahora activados (excepto los desactivados individualmente).`)],
      });
    }

    const commandName = target.toLowerCase();
    if (isDisable) {
      await disableComando(client, interaction.guildId, commandName);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Comando Disabled', `\`/${commandName}\` is now disabled in this server.`)],
      });
    }

    await enableComando(client, interaction.guildId, commandName);
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed('Comando Enabled', `\`/${commandName}\` is now enabled in this server.`)],
    });
  },
};
