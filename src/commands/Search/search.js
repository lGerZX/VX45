import { SlashCommandBuilder } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import searchDefine from './modules/search_define.js';
import searchGoogle from './modules/search_google.js';
import searchUrban from './modules/search_urban.js';

export default {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Buscar en la web y diccionarios')
        .addSubcommand(subcommand =>
            subcommand
                .setName('define')
                .setDescription('Buscar la definicion de una palabra')
                .addStringOption(option =>
                    option.setName('word')
                        .setDescription('La palabra a buscar')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('google')
                .setDescription('Buscar en Google')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('Que te gustaria buscar')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('urban')
                .setDescription('Buscar definiciones en Urban Dictionary')
                .addStringOption(option =>
                    option.setName('term')
                        .setDescription('El termino a buscar en Urban Dictionary')
                        .setRequired(true))
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'define':
                return await searchDefine.execute(interaction, config, client);
            case 'google':
                return await searchGoogle.execute(interaction, config, client);
            case 'urban':
                return await searchUrban.execute(interaction, config, client);
            default:
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Subcomando desconocido' });
        }
    }
};
