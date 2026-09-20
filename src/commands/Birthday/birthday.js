import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';
import birthdaySetchannel from './modules/birthday_setchannel.js';

export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Comandos de cumpleaños')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Establece tu fecha de nacimiento')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Mes de nacimiento (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('Día de nacimiento (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Ver información de cumpleaños')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Cumpleaños del usuario')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lista de todos los cumpleaños del servidor.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Elimina tu fecha de nacimiento')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('next')
                .setDescription('Mostrar los próximos cumpleaños')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                // Se acortó la descripción a menos de 100 caracteres (81 caracteres)
                .setDescription('Configura o deshabilita el canal para anuncios de cumpleaños')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('El canal de texto para anuncios')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'set':
                return await birthdaySet.execute(interaction, config, client);
            case 'info':
                return await birthdayInfo.execute(interaction, config, client);
            case 'list':
                return await birthdayList.execute(interaction, config, client);
            case 'remove':
                return await birthdayRemove.execute(interaction, config, client);
            case 'next':
                return await nextBirthdays.execute(interaction, config, client);
            case 'setchannel':
                return await birthdaySetchannel.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Subcomando desconocido' });
        }
    }
};
