import { SlashCommandBuilder } from 'discord.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('Configura la tienda Requiere administrar servidor')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('Establece el rol de Discord al comprar el rol premium de la tienda')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('El rol que se otorga al comprar el rol premium')
                        .setRequired(true)
                )
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }
    }
};
